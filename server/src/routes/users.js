const router = require('express').Router();
const { notify, instructorsOf, companyAdmins, platformAdmins } = require('../services/notify');
const User = require('../models/User');
const Company = require('../models/Company');
const Course = require('../models/Course');
const RefreshToken = require('../models/RefreshToken');
const { audit } = require('../models/AuditLog');
const validate = require('../middleware/validate');
const { requireAuth, requireRole, tenantFilter, assertSameTenant } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, email, password, objectId } = require('../utils/schemas');

router.use(requireAuth);

/** Active employee accounts count against the company's purchased seats. */
const seatsUsed = (companyId) => User.countDocuments({ company: companyId, role: 'employee', isActive: true });

async function assertSeatAvailable(companyId) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError(400, 'Unknown company');
  const used = await seatsUsed(companyId);
  if (used >= company.seatLimit) {
    // Upsell signal for the platform team (once per day per company)
    const Notification = require('../models/Notification');
    const recent = await Notification.exists({ type: 'seat_limit_reached', body: new RegExp(`^${company.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `), createdAt: { $gt: new Date(Date.now() - 864e5) } });
    if (!recent) {
      await notify(await platformAdmins(), { type: 'seat_limit_reached', title: 'A customer hit their seat limit', body: `${company.name} tried to add an employee (${used}/${company.seatLimit} seats).`, link: '/admin/companies' });
    }
    throw new AppError(409, `Seat limit reached (${used}/${company.seatLimit}). Contact your account manager to add seats.`, 'SEAT_LIMIT');
  }
}

/* ======================= Companies (platform admin) ======================= */
router.get(
  '/companies',
  requireRole('super_admin'),
  asyncHandler(async (_req, res) => {
    const companies = await Company.find().sort('name');
    const [employees, admins] = await Promise.all([
      User.aggregate([{ $match: { role: 'employee', isActive: true } }, { $group: { _id: '$company', n: { $sum: 1 } } }]),
      User.find({ role: 'company_admin' }).select('name email company isActive'),
    ]);
    const used = Object.fromEntries(employees.map((e) => [String(e._id), e.n]));
    res.json({
      companies: companies.map((c) => ({
        ...c.toJSON(),
        seatsUsed: used[String(c._id)] || 0,
        admins: admins.filter((a) => String(a.company) === String(c._id)),
      })),
    });
  })
);

/* Seat usage for the caller's own company (company admin header) */
router.get(
  '/seats',
  requireRole('company_admin'),
  asyncHandler(async (req, res) => {
    const company = await Company.findById(req.user.company).select('name seatLimit');
    res.json({ company: company?.name, seatLimit: company?.seatLimit ?? 0, seatsUsed: await seatsUsed(req.user.company) });
  })
);

router.post(
  '/companies',
  requireRole('super_admin'),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/),
      seatLimit: z.number().int().min(0).max(100000).default(10),
      // Optionally create the customer's first company admin in the same step
      admin: z.object({ name: z.string().trim().min(2).max(120), email, password }).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { admin, ...data } = req.body;
    if (admin && (await User.exists({ email: admin.email }))) throw new AppError(409, 'That admin email is already in use');
    const company = await Company.create(data);
    let adminUser = null;
    if (admin) adminUser = await User.create({ ...admin, role: 'company_admin', company: company._id, mustChangePassword: true });
    await audit(req, 'company.create', { target: String(company._id), meta: { seatLimit: company.seatLimit } });
    res.status(201).json({ company, admin: adminUser });
  })
);

router.patch(
  '/companies/:id',
  requireRole('super_admin'),
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ name: z.string().trim().min(2).max(120), seatLimit: z.number().int().min(0).max(100000), isActive: z.boolean() }).partial(),
  }),
  asyncHandler(async (req, res) => {
    const company = await Company.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after', runValidators: true });
    if (!company) throw new AppError(404, 'Not found');
    if (req.body.seatLimit !== undefined) {
      await notify(await companyAdmins(company._id), { type: 'seats_changed', title: `Your seat limit is now ${company.seatLimit}`, body: 'You can add employees up to this number.', link: '/people' });
    }
    await audit(req, 'company.update', { target: String(company._id), meta: req.body });
    res.json({ company, seatsUsed: await seatsUsed(company._id) });
  })
);

/* ======================= Users ======================= */
const listQuery = z.object({
  role: z.enum(['company_admin', 'instructor', 'employee']).optional(),
  company: objectId.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.get(
  '/',
  requireRole('super_admin', 'company_admin'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { role, company, q, page, limit } = req.validatedQuery;
    const filter = { ...tenantFilter(req.user) };
    if (req.user.role === 'company_admin') filter.role = { $in: ['employee', 'company_admin'] }; // never list platform staff
    if (role) filter.role = req.user.role === 'company_admin' && role === 'instructor' ? '__none__' : role;
    if (company && req.user.role === 'super_admin') filter.company = company;
    if (q) {
      // Escape regex metacharacters – prevents ReDoS / regex injection
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }];
    }
    const [users, total] = await Promise.all([
      User.find(filter).sort('name').skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ users, total, page, limit });
  })
);

/* Instructors with the courses they're assigned to (platform admin) */
router.get(
  '/instructors',
  requireRole('super_admin'),
  asyncHandler(async (_req, res) => {
    const [instructors, courses] = await Promise.all([
      User.find({ role: 'instructor' }).sort('name'),
      Course.find().select('code title instructors isPublished').sort('code'),
    ]);
    res.json({
      instructors: instructors.map((u) => ({
        ...u.toJSON(),
        courses: courses.filter((c) => c.instructors.some((i) => String(i) === String(u._id))).map((c) => c._id),
      })),
      courses: courses.map(({ _id, code, title, isPublished }) => ({ _id, code, title, isPublished })),
    });
  })
);

/* Set which courses an instructor teaches (platform admin) */
router.put(
  '/instructors/:id/courses',
  requireRole('super_admin'),
  validate({ params: z.object({ id: objectId }), body: z.object({ courseIds: z.array(objectId).max(200) }) }),
  asyncHandler(async (req, res) => {
    const instructor = await User.findOne({ _id: req.params.id, role: 'instructor' });
    if (!instructor) throw new AppError(404, 'Not found');
    const before = (await Course.find({ instructors: instructor._id }).distinct('_id')).map(String);
    await Course.updateMany({ instructors: instructor._id, _id: { $nin: req.body.courseIds } }, { $pull: { instructors: instructor._id } });
    await Course.updateMany({ _id: { $in: req.body.courseIds } }, { $addToSet: { instructors: instructor._id } });
    const added = await Course.find({ _id: { $in: req.body.courseIds.filter((id) => !before.includes(String(id))) } }).select('code title');
    for (const c of added) {
      await notify(instructor._id, { type: 'course_instructor', title: `You’re now teaching ${c.code}`, body: c.title, link: `/courses/${c._id}` });
    }
    await audit(req, 'instructor.courses', { target: String(instructor._id), meta: { courseIds: req.body.courseIds } });
    res.json({ ok: true });
  })
);

const createUserBody = z.object({
  name: z.string().trim().min(2).max(120),
  email,
  password,
  role: z.enum(['company_admin', 'instructor', 'employee']).default('employee'),
  jobTitle: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  company: objectId.optional(), // only honoured for super_admin
});

router.post(
  '/',
  requireRole('super_admin', 'company_admin'),
  validate({ body: createUserBody }),
  asyncHandler(async (req, res) => {
    const data = { ...req.body };

    if (req.user.role === 'company_admin') {
      // Customers can only add their own employees – never staff or other admins, never another tenant
      if (data.role !== 'employee') throw new AppError(403, 'Company admins can only add employee accounts');
      data.company = req.user.company;
    } else if (data.role === 'instructor') {
      data.company = undefined; // instructors are platform staff, not tied to a customer
    } else {
      if (!data.company) throw new AppError(400, 'company is required');
      if (!(await Company.exists({ _id: data.company }))) throw new AppError(400, 'Unknown company');
    }

    if (data.role === 'employee') await assertSeatAvailable(data.company);

    // Someone else chose this password → the new user must replace it at first sign-in
    const user = await User.create({ ...data, mustChangePassword: true });
    await audit(req, 'user.create', { target: String(user._id), meta: { role: user.role } });
    res.status(201).json({ user });
  })
);

router.patch(
  '/:id',
  requireRole('super_admin', 'company_admin'),
  validate({
    params: z.object({ id: objectId }),
    body: z
      .object({
        name: z.string().trim().min(2).max(120),
        role: z.enum(['company_admin', 'instructor', 'employee']),
        jobTitle: z.string().trim().max(120),
        department: z.string().trim().max(120),
        isActive: z.boolean(),
      })
      .partial(),
  }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new AppError(404, 'Not found');

    if (req.user.role === 'company_admin') {
      assertSameTenant(req.user, user.company);
      if (user.role !== 'employee') throw new AppError(403, 'Company admins can only manage employee accounts');
      if (req.body.role) throw new AppError(403, 'Company admins cannot change roles');
    }
    if (String(user._id) === String(req.user._id) && (req.body.role || req.body.isActive === false)) {
      throw new AppError(400, 'You cannot change your own role or deactivate yourself');
    }
    // Re-activating an employee takes a seat again
    if (req.body.isActive === true && !user.isActive && user.role === 'employee') await assertSeatAvailable(user.company);

    Object.assign(user, req.body);
    await user.save();
    if (req.body.isActive === false) {
      await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    }
    await audit(req, 'user.update', { target: String(user._id), meta: req.body });
    res.json({ user });
  })
);

/**
 * Emergency password reset by an administrator.
 * The admin never sees or chooses the new password: the current password is disabled, every session
 * is signed out, the lock is cleared, and a single-use link (24h) is produced for the user to set their own.
 *   super_admin    → any account except their own
 *   company_admin  → only employees of their own company
 */
router.post(
  '/:id/reset-password',
  requireRole('super_admin', 'company_admin'),
  validate({ params: z.object({ id: objectId }), body: z.object({ sendEmail: z.boolean().default(false) }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id).select('+password +failedLoginAttempts +lockUntil');
    if (!user) throw new AppError(404, 'Not found');
    if (String(user._id) === String(req.user._id)) throw new AppError(400, 'Use “Change password” on your profile for your own account');
    if (req.user.role === 'company_admin') {
      assertSameTenant(req.user, user.company);
      if (user.role !== 'employee') throw new AppError(403, 'Company admins can only reset employee passwords');
    }

    // Disable the old password immediately (an attacker who knows it is locked out too)
    user.password = require('crypto').randomBytes(32).toString('base64url') + 'aA1';
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });

    const { createResetLink } = require('../services/passwordReset');
    const { url, expiresAt } = await createResetLink(user, { purpose: 'admin_reset', requestedBy: req.user._id, ip: req.ip });
    let emailed = false;
    if (req.body.sendEmail) {
      const { sendMail } = require('../services/mailer');
      await sendMail({
        to: user.email,
        subject: 'Set a new password',
        text: `Hi ${user.name},\n\nAn administrator reset your password. Use this link to choose a new one (valid for 24 hours, works once):\n${url}`,
      });
      emailed = true;
    }
    await audit(req, 'user.password_reset_by_admin', { target: String(user._id), meta: { emailed } });
    res.json({ url, expiresAt, emailed });
  })
);

module.exports = router;
