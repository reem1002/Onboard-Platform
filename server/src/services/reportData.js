const env = require('../config/env');
const Course = require('../models/Course');
const User = require('../models/User');
const Company = require('../models/Company');
const Enrollment = require('../models/Enrollment');
const { AppError } = require('../utils/errors');
const { courseProgress } = require('./progress');

/**
 * Who may produce a progress report for (student, course)?
 *   super_admin    – anyone
 *   instructor     – students in a course they're assigned to
 *   company_admin  – their own company's employees
 */
async function assertReportAccess(user, student, course) {
  const enrolled = await Enrollment.findOne({ user: student._id, course: course._id });
  if (!enrolled) throw new AppError(404, 'Not found');
  if (user.role === 'super_admin') return enrolled;
  if (user.role === 'instructor' && course.instructors.some((i) => String(i) === String(user._id))) return enrolled;
  if (user.role === 'company_admin' && String(student.company) === String(user.company)) return enrolled;
  throw new AppError(404, 'Not found');
}

/** Short "evidence" line from a feedback overview: the part after the em dash, else the closing line. */
function evidenceFrom(fb) {
  if (!fb) return '';
  const o = fb.overview || '';
  const idx = o.indexOf('—');
  const tail = idx >= 0 ? o.slice(idx + 1).trim() : '';
  const text = tail || fb.closing || o;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function buildReportData(user, studentId, courseId) {
  const [student, course] = await Promise.all([
    User.findOne({ _id: studentId, role: 'employee' }).select('name email jobTitle department company'),
    Course.findById(courseId).populate('instructors', 'name'),
  ]);
  if (!student || !course) throw new AppError(404, 'Not found');
  const enrollment = await assertReportAccess(user, student, { ...course.toObject(), instructors: course.instructors.map((i) => i._id) });
  const company = await Company.findById(student.company).select('name');
  const p = await courseProgress(course, student._id);

  const graded = p.items.filter((i) => i.kind === 'assignment' && i.completed);
  const quizzes = p.items.filter((i) => i.kind === 'quiz' && i.status !== 'not_started');

  // Aggregate qualitative evidence from approved feedback
  const strengths = [];
  const development = [];
  for (const g of [...graded].sort((a, b) => (b.gradedAt || 0) - (a.gradedAt || 0))) {
    for (const s of g.feedback?.strengths || []) if (strengths.length < 5) strengths.push({ code: g.code, task: s.task, text: s.detail });
    for (const d of g.feedback?.improvements || []) if (development.length < 4) development.push({ code: g.code, task: d.task, issue: d.issue, suggestion: d.suggestion });
  }
  const best = [...graded].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  let assessorQuote = null;
  if (best?.feedback) {
    const reviewer = best.feedback.reviewedBy ? await User.findById(best.feedback.reviewedBy).select('name') : null;
    assessorQuote = {
      code: best.code,
      score: best.score,
      text: best.feedback.closing || best.feedback.overview,
      by: reviewer?.name || 'Assessor',
    };
  }

  const jdRows = p.items
    .filter((i) => i.kind === 'assignment' && i.jdRequirement)
    .map((i) => ({
      requirement: i.jdRequirement,
      activity: `${i.code}: ${i.title}`,
      status: i.completed ? `Demonstrated — ${i.score}/${i.maxScore}` : i.status === 'not_started' ? 'Scheduled' : 'In progress — under review',
      demonstrated: i.completed,
    }));

  return {
    org: env.ORG_NAME,
    reportDate: new Date(),
    student: { _id: student._id, name: student.name, email: student.email, jobTitle: student.jobTitle, department: student.department },
    company: { name: company?.name || '' },
    course: {
      _id: course._id, code: course.code, title: course.title, summary: course.summary,
      certificationTarget: course.certificationTarget, milestoneCount: course.milestones.length,
    },
    assessors: course.instructors.map((i) => i.name),
    enrollment: { enrolledAt: enrollment.createdAt, dueAt: enrollment.dueAt },
    progress: {
      total: p.total, completed: p.completed, pct: p.pct, avgScore: p.avgScore, pendingReview: p.pendingReview,
      milestones: p.milestones, currentMilestone: p.currentMilestone, nextItems: p.nextItems.map((n) => ({ code: n.code, title: n.title, kind: n.kind })),
    },
    graded: graded.map((g) => ({ code: g.code, title: g.title, score: g.score, maxScore: g.maxScore, passScore: g.passScore, skills: g.skills, evidence: evidenceFrom(g.feedback) })),
    quizzes: quizzes.map((q) => ({ title: q.title, score: q.score, passed: q.completed })),
    jdRows,
    strengths,
    development,
    assessorQuote,
  };
}

/** Default narrative (editable in the UI, or replaced by an AI draft). */
function defaultNarrative(d, preparedFor) {
  const first = d.student.name.split(' ')[0];
  const cm = d.progress.currentMilestone;
  const n = d.graded.length;
  const summary = [
    `This report provides ${d.company.name}${preparedFor ? ` (${preparedFor})` : ''} with an independent, evidence-based review of ${d.student.name}'s progress within the ${d.course.title} programme, delivered as a hands-on, on-the-job training simulation.`,
    `${first} has completed ${d.progress.completed} of ${d.progress.total} gradable items (${d.progress.pct}%)${cm ? ` and is currently working through ${cm.title} (${cm.pct}% complete)` : ''}.` +
      (n ? ` ${n === 1 ? 'The completed deliverable was' : `The ${n} completed deliverables were`} assessed with an average grade of ${d.progress.avgScore}%.` : ' No deliverables have been graded yet.'),
    d.assessorQuote ? `The strongest submission so far, ${d.assessorQuote.code} (${d.assessorQuote.score}/100), was verified by the assigned assessor as demonstrating job-ready judgement rather than templated reporting.` : '',
  ].filter(Boolean).join('\n\n');

  const businessValue = [
    'The programme is producing real, gradable proof of job-relevant skill — not passive course consumption — traceable to the target job description.',
    d.progress.avgScore !== null ? `Deliverable quality (${d.progress.avgScore}% average) and assessor commentary indicate decision-making consistent with an operating practitioner in the role.` : 'Assessor commentary will be added as deliverables are graded.',
    'Every graded item creates a documented, per-skill audit trail the business can use for performance conversations and career development planning.',
    d.course.certificationTarget ? `The programme aligns with ${d.course.certificationTarget}, converting on-the-job practice into a recognised credential.` : null,
  ].filter(Boolean);

  const recommendation = `Continue ${first}'s enrolment through to programme completion${d.course.certificationTarget ? ' and certification attempt' : ''}, and review progress again at the end of the current milestone.`;

  const nextSteps = [
    d.progress.nextItems.length ? `${first} to complete the next items in sequence: ${d.progress.nextItems.map((i) => (i.kind === 'quiz' ? i.title : i.code)).join(', ')}.` : `${first} has no outstanding items in the current sequence.`,
    `${d.org} to issue the next progress report at the end of ${cm ? cm.title : 'the current milestone'}, then on a bi-weekly cadence through to completion.`,
    'Skill and grade data remain available at any time in the platform’s Team progress view.',
  ];
  return { executiveSummary: summary, businessValue, recommendation, nextSteps };
}

module.exports = { buildReportData, defaultNarrative, assertReportAccess };
