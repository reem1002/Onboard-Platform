const router = require('express').Router();
const { notify, instructorsOf, companyAdmins, platformAdmins } = require('../services/notify');
const Ticket = require('../models/Ticket');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { audit } = require('../models/AuditLog');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');
const { assignedCourseIds } = require('../services/access');

router.use(requireAuth);

const STAFF = ['super_admin', 'instructor'];
const isStaff = (u) => STAFF.includes(u.role);

/** Which tickets can this user see? Returns a Mongo filter. */
async function scopeFor(user) {
  switch (user.role) {
    case 'super_admin':
      return {}; // monitors everything
    case 'instructor':
      return { channel: 'course', course: { $in: await assignedCourseIds(user) } };
    default:
      return { requester: user._id }; // customers see their own tickets
  }
}

async function loadTicket(user, id) {
  const t = await Ticket.findOne({ _id: id, ...(await scopeFor(user)) });
  if (!t) throw new AppError(404, 'Not found');
  return t;
}

const view = (t) =>
  t.populate([
    { path: 'requester', select: 'name email role' },
    { path: 'company', select: 'name' },
    { path: 'course', select: 'code title' },
    { path: 'assignment', select: 'code title' },
    { path: 'messages.author', select: 'name role' },
  ]);

/* Badge count: tickets waiting on me */
router.get(
  '/unread',
  asyncHandler(async (req, res) => {
    const scope = await scopeFor(req.user);
    const status = isStaff(req.user) ? 'open' : 'answered';
    const extra = req.user.role === 'super_admin' ? { channel: 'platform' } : {}; // admin's own queue is platform tickets
    res.json({ count: await Ticket.countDocuments({ ...scope, ...extra, status }) });
  })
);

/* List + stats */
router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['open', 'answered', 'resolved', 'active', 'all']).default('active'),
      channel: z.enum(['course', 'platform']).optional(),
      q: z.string().trim().max(100).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { status, channel, q } = req.validatedQuery;
    const scope = await scopeFor(req.user);
    const filter = { ...scope };
    if (status === 'active') filter.status = { $in: ['open', 'answered'] };
    else if (status !== 'all') filter.status = status;
    if (channel) filter.channel = channel;
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.subject = new RegExp(safe, 'i');
    }
    const tickets = await Ticket.find(filter)
      .sort({ lastActivityAt: -1 })
      .limit(200)
      .select('-messages')
      .populate('requester', 'name role')
      .populate('company', 'name')
      .populate('course', 'code');

    let stats = null;
    if (isStaff(req.user)) {
      const all = await Ticket.find(scope).select('status createdAt firstResponseAt');
      const responded = all.filter((t) => t.firstResponseAt);
      const avgMs = responded.length ? responded.reduce((s, t) => s + (t.firstResponseAt - t.createdAt), 0) / responded.length : null;
      stats = {
        open: all.filter((t) => t.status === 'open').length,
        answered: all.filter((t) => t.status === 'answered').length,
        resolved: all.filter((t) => t.status === 'resolved').length,
        avgFirstResponseHours: avgMs === null ? null : Math.round((avgMs / 36e5) * 10) / 10,
      };
    }
    res.json({ tickets, stats });
  })
);

/* Courses the caller can ask about (employees: enrolled courses) */
router.get(
  '/courses',
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'employee') return res.json({ courses: [] });
    const enrollments = await Enrollment.find({ user: req.user._id, status: { $ne: 'withdrawn' } }).populate('course', 'code title isPublished');
    res.json({ courses: enrollments.filter((e) => e.course?.isPublished).map((e) => ({ _id: e.course._id, code: e.course.code, title: e.course.title })) });
  })
);

/* Open a ticket */
router.post(
  '/',
  validate({
    body: z.object({
      channel: z.enum(['course', 'platform']),
      courseId: objectId.optional(),
      assignmentId: objectId.optional(),
      subject: z.string().trim().min(3).max(200),
      category: z.enum(Ticket.CATEGORIES).default('question'),
      priority: z.enum(Ticket.PRIORITIES).default('normal'),
      body: z.string().trim().min(1).max(5000),
    }),
  }),
  asyncHandler(async (req, res) => {
    const u = req.user;
    if (isStaff(u)) throw new AppError(403, 'Staff answer tickets rather than open them');
    const b = req.body;
    const data = { channel: b.channel, company: u.company, requester: u._id, subject: b.subject, category: b.category, priority: b.priority };

    if (b.channel === 'course') {
      if (u.role !== 'employee') throw new AppError(403, 'Course questions are for enrolled employees — company admins contact platform support');
      if (!b.courseId) throw new AppError(400, 'Choose the course your question is about');
      const enrolled = await Enrollment.exists({ user: u._id, course: b.courseId, status: { $ne: 'withdrawn' } });
      if (!enrolled) throw new AppError(404, 'Not found');
      data.course = b.courseId;
      if (b.assignmentId) data.assignment = b.assignmentId;
    }
    data.messages = [{ author: u._id, authorRole: u.role, body: b.body }];

    const t = await Ticket.create(data);
    const recipients = t.channel === 'course' ? await instructorsOf(t.course) : await platformAdmins();
    await notify(recipients, { type: 'ticket_new', title: `New ${t.channel === 'course' ? 'course question' : 'support request'} #${t.number}`, body: `${u.name}: ${t.subject}`, link: `/support/${t._id}` });
    await audit(req, 'support.open', { target: String(t._id), meta: { channel: t.channel } });
    res.status(201).json({ ticket: await view(t) });
  })
);

router.get(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => res.json({ ticket: await view(await loadTicket(req.user, req.params.id)) }))
);

/* Reply */
router.post(
  '/:id/messages',
  validate({ params: z.object({ id: objectId }), body: z.object({ body: z.string().trim().min(1).max(5000) }) }),
  asyncHandler(async (req, res) => {
    const t = await loadTicket(req.user, req.params.id);
    const staff = isStaff(req.user);
    t.messages.push({ author: req.user._id, authorRole: req.user.role, body: req.body.body });
    t.lastActivityAt = new Date();
    if (staff) {
      t.status = 'answered';
      if (!t.firstResponseAt) t.firstResponseAt = new Date();
    } else {
      t.status = 'open'; // back in the staff queue (also re-opens a resolved ticket)
      t.resolvedAt = undefined;
    }
    await t.save();
    // Tell the other side
    const to = staff ? [t.requester] : t.channel === 'course' ? await instructorsOf(t.course) : await platformAdmins();
    await notify(to.filter((x) => String(x) !== String(req.user._id)), {
      type: 'ticket_reply',
      title: staff ? `Reply on #${t.number}: ${t.subject}` : `${req.user.name} replied on #${t.number}`,
      body: req.body.body.slice(0, 160),
      link: `/support/${t._id}`,
    });
    res.json({ ticket: await view(t) });
  })
);

/* Resolve / reopen / re-prioritise */
router.patch(
  '/:id',
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ status: z.enum(['open', 'resolved']).optional(), priority: z.enum(Ticket.PRIORITIES).optional() }),
  }),
  asyncHandler(async (req, res) => {
    const t = await loadTicket(req.user, req.params.id);
    if (req.body.priority && !isStaff(req.user)) throw new AppError(403, 'Only support staff can change priority');
    if (req.body.priority) t.priority = req.body.priority;
    if (req.body.status) {
      t.status = req.body.status;
      t.resolvedAt = req.body.status === 'resolved' ? new Date() : undefined;
    }
    t.lastActivityAt = new Date();
    await t.save();
    res.json({ ticket: await view(t) });
  })
);

module.exports = router;
