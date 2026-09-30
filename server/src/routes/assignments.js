const router = require('express').Router();
const { notify, instructorsOf, companyAdmins, platformAdmins } = require('../services/notify');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { uploadFiles, verifyFiles, removeFiles, sendStored, ATTACHMENT_TYPES, MB } = require('../middleware/upload');
const { getSettings, submissionLimits } = require('../services/settings');
const { companyStorage, overQuota } = require('../services/storage');
const { audit } = require('../models/AuditLog');
const { asyncHandler, AppError } = require('../utils/errors');
const { patchSchema, z, objectId, assignmentBody } = require('../utils/schemas');
const { loadCourseForUser, assertCanAuthor, canAuthor } = require('../services/access');
const { enqueue } = require('../services/aiGrader');

router.use(requireAuth);

const idParam = { params: z.object({ id: objectId }) };

async function loadAssignment(user, id) {
  const assignment = await Assignment.findById(id);
  if (!assignment) throw new AppError(404, 'Not found');
  const ctx = await loadCourseForUser(user, assignment.course);
  if (user.role === 'employee' && !assignment.isPublished) throw new AppError(404, 'Not found');
  return { assignment, ...ctx };
}

/** What a student is allowed to see of a submission: never the unapproved AI draft. */
function studentView(sub) {
  const s = sub.toJSON();
  delete s.ai;
  if (s.status !== 'approved' && s.status !== 'returned') delete s.final;
  if (['ai_grading', 'ai_graded', 'ai_failed'].includes(s.status)) s.status = 'under_review';
  if (s.final) delete s.final.reviewedBy;
  return s;
}

router.get(
  '/:id',
  validate(idParam),
  asyncHandler(async (req, res) => {
    const { assignment, course } = await loadAssignment(req.user, req.params.id);
    const limits = await submissionLimits(assignment);
    const a = { ...assignment.toJSON(), canEdit: canAuthor(req.user, course), uploadLimits: limits };
    if (req.user.role === 'employee') a.rubric = a.rubric.map(({ guidance, ...rest }) => rest); // hide grader guidance
    res.json({ assignment: a });
  })
);

router.patch(
  '/:id',
  validate({ ...idParam, body: patchSchema(assignmentBody) }),
  asyncHandler(async (req, res) => {
    const { assignment, course } = await loadAssignment(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    if (req.body.milestoneId && !course.milestones.id(req.body.milestoneId)) throw new AppError(400, 'Unknown milestone');
    Object.assign(assignment, req.body);
    await assignment.save();
    res.json({ assignment });
  })
);

router.delete(
  '/:id',
  validate(idParam),
  asyncHandler(async (req, res) => {
    const { assignment, course } = await loadAssignment(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    if (await Submission.exists({ assignment: assignment._id })) {
      throw new AppError(409, 'Assignment has submissions – unpublish it instead of deleting');
    }
    const stored = assignment.attachments.map((f) => ({ path: require('path').join(require('../middleware/upload').UPLOAD_DIR, f.storedName) }));
    await assignment.deleteOne();
    await removeFiles(stored);
    await audit(req, 'assignment.delete', { target: String(assignment._id), meta: { code: assignment.code } });
    res.status(204).end();
  })
);

/* ----- Student: submit work ----- */
router.post(
  '/:id/submissions',
  validate(idParam),
  asyncHandler(async (req, res, next) => {
    if (req.user.role !== 'employee') throw new AppError(403, 'Only enrolled employees can submit');
    req.ctx = await loadAssignment(req.user, req.params.id);
    const { assignment } = req.ctx;
    if (assignment.kind === 'lesson') throw new AppError(400, 'This is a lesson — there is nothing to submit');
    // All cheap checks happen BEFORE accepting any bytes
    if (assignment.opensAt && assignment.opensAt > new Date()) throw new AppError(400, 'Assignment is not open yet');
    const last = await Submission.findOne({ assignment: assignment._id, student: req.user._id }).sort({ attempt: -1 });
    if (last && last.status !== 'returned') {
      throw new AppError(409, 'You already have a submission under review. You can resubmit once it is returned.');
    }
    req.ctx.last = last;
    req.ctx.limits = await submissionLimits(assignment);
    req.ctx.storage = await companyStorage(req.ctx.enrollment.company);
    if (overQuota(req.ctx.storage)) throw new AppError(413, 'Your company has used all of its storage. Ask your company admin to contact support.');
    next();
  }),
  (req, res, next) => uploadFiles({ maxFileMB: req.ctx.limits.fileMB, maxFiles: req.ctx.assignment.deliverable.maxFiles })(req, res, next),
  asyncHandler(async (req, res) => {
    const { assignment, course, enrollment, last, limits, storage } = req.ctx;
    const files = req.files || [];
    if (!files.length) throw new AppError(400, 'Attach at least one file');
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > limits.totalMB * MB) {
      await removeFiles(files);
      throw new AppError(413, `All files together must be ${limits.totalMB} MB or smaller`);
    }
    if (overQuota(storage, total)) {
      await removeFiles(files);
      throw new AppError(413, 'This upload would exceed your company’s storage. Ask your company admin to contact support.');
    }
    await verifyFiles(files, assignment.deliverable.acceptedFileTypes);

    const note = typeof req.body.note === 'string' ? req.body.note.slice(0, 3000) : undefined;
    const sub = await Submission.create({
      company: enrollment.company,
      assignment: assignment._id,
      course: course._id,
      student: req.user._id,
      attempt: (last?.attempt || 0) + 1,
      note,
      files: files.map((f) => ({ storedName: f.filename, originalName: f.originalname.slice(0, 255), mimeType: f.mimetype, size: f.size })),
    });
    const queued = assignment.aiGrading ? await enqueue(sub._id) : false;
    if (!queued) {
      // No AI draft coming → tell the instructors straight away (AI-graded ones notify when the draft is ready)
      await notify(await instructorsOf(course._id), {
        type: 'submission_new',
        title: `New submission: ${assignment.code}`,
        body: `${req.user.name} submitted ${assignment.title}`,
        link: `/review/${sub._id}`,
      });
    }
    res.status(201).json({ submission: studentView(sub) });
  })
);

router.get(
  '/:id/submissions/mine',
  validate(idParam),
  asyncHandler(async (req, res) => {
    const { assignment } = await loadAssignment(req.user, req.params.id);
    const subs = await Submission.find({ assignment: assignment._id, student: req.user._id }).sort({ attempt: -1 });
    res.json({ submissions: subs.map(studentView) });
  })
);

/* ----- Instructor resources (attachments) ----- */
router.post(
  '/:id/attachments',
  validate(idParam),
  asyncHandler(async (req, res, next) => {
    req.ctx = await loadAssignment(req.user, req.params.id);
    assertCanAuthor(req.user, req.ctx.course);
    if (req.ctx.assignment.attachments.length >= 20) throw new AppError(400, 'An assignment can have at most 20 attachments');
    req.ctx.settings = await getSettings();
    next();
  }),
  (req, res, next) => uploadFiles({ maxFileMB: req.ctx.settings.uploads.attachmentFileMB, maxFiles: 10 })(req, res, next),
  asyncHandler(async (req, res) => {
    const { assignment } = req.ctx;
    const files = req.files || [];
    if (!files.length) throw new AppError(400, 'Choose at least one file');
    if (assignment.attachments.length + files.length > 20) {
      await removeFiles(files);
      throw new AppError(400, 'An assignment can have at most 20 attachments');
    }
    await verifyFiles(files, ATTACHMENT_TYPES);
    for (const f of files) {
      assignment.attachments.push({ storedName: f.filename, originalName: f.originalname.slice(0, 255), mimeType: f.mimetype, size: f.size, uploadedBy: req.user._id });
    }
    await assignment.save();
    await audit(req, 'assignment.attachment_add', { target: String(assignment._id), meta: { count: files.length } });
    res.status(201).json({ attachments: assignment.toJSON().attachments });
  })
);

router.delete(
  '/:id/attachments/:fileId',
  validate({ params: z.object({ id: objectId, fileId: objectId }) }),
  asyncHandler(async (req, res) => {
    const { assignment, course } = await loadAssignment(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    const f = assignment.attachments.id(req.params.fileId);
    if (!f) throw new AppError(404, 'Not found');
    const stored = f.storedName;
    assignment.attachments = assignment.attachments.filter((x) => String(x._id) !== req.params.fileId);
    await assignment.save();
    await removeFiles([{ path: require('path').join(require('../middleware/upload').UPLOAD_DIR, stored) }]);
    res.json({ attachments: assignment.toJSON().attachments });
  })
);

router.get(
  '/:id/attachments/:fileId',
  validate({ params: z.object({ id: objectId, fileId: objectId }) }),
  asyncHandler(async (req, res) => {
    const { assignment } = await loadAssignment(req.user, req.params.id); // employees: enrolled + published only
    const f = assignment.attachments.id(req.params.fileId);
    if (!f) throw new AppError(404, 'Not found');
    sendStored(res, f.storedName, f.originalName, f.mimeType);
  })
);

/* ----- Duplicate (unpublished copy in the same milestone, files copied) ----- */
router.post(
  '/:id/duplicate',
  validate(idParam),
  asyncHandler(async (req, res) => {
    const { assignment, course } = await loadAssignment(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    const fs = require('fs');
    const path = require('path');
    const { UPLOAD_DIR } = require('../middleware/upload');
    const src = assignment.toObject();
    delete src._id; delete src.createdAt; delete src.updatedAt; delete src.__v;
    let code = `${assignment.code}-COPY`;
    for (let i = 2; await Assignment.exists({ course: course._id, code }); i += 1) code = `${assignment.code}-COPY${i}`;
    const attachments = [];
    for (const a of src.attachments || []) {
      const storedName = require('crypto').randomUUID();
      await fs.promises.copyFile(path.join(UPLOAD_DIR, a.storedName), path.join(UPLOAD_DIR, storedName)).catch(() => null);
      attachments.push({ ...a, _id: undefined, storedName });
    }
    const copy = await Assignment.create({ ...src, code: code.slice(0, 40), title: `${assignment.title} (copy)`.slice(0, 300), isPublished: false, order: assignment.order + 1, attachments });
    res.status(201).json({ assignment: copy });
  })
);

module.exports = router;
module.exports.studentView = studentView;
