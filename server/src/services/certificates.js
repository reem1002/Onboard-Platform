const crypto = require('crypto');
const Certificate = require('../models/Certificate');
const Course = require('../models/Course');
const User = require('../models/User');
const Company = require('../models/Company');
const Enrollment = require('../models/Enrollment');
const { courseProgress } = require('./progress');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const randomCode = (n = 12) => Array.from(crypto.randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join('');

/**
 * Issue the course certificate if (and only if) the employee has completed everything.
 * Idempotent: safe to call after every approval / passed quiz. Returns the certificate or null.
 */
async function maybeIssue(studentId, courseId) {
  const existing = await Certificate.findOne({ student: studentId, course: courseId });
  if (existing) return existing;
  const [course, enrollment] = await Promise.all([Course.findById(courseId), Enrollment.findOne({ user: studentId, course: courseId, status: { $ne: 'withdrawn' } })]);
  if (!course || !enrollment) return null;
  const p = await courseProgress(course, studentId);
  if (!p.total || p.completed < p.total) return null;

  const [student, company] = await Promise.all([User.findById(studentId).select('name'), Company.findById(enrollment.company).select('name')]);
  const seq = (await Certificate.countDocuments({ course: courseId })) + 1;
  let cert;
  for (let i = 0; i < 5 && !cert; i += 1) {
    try {
      cert = await Certificate.create({
        number: `${course.code}-${String(seq + i).padStart(4, '0')}`,
        code: randomCode(),
        student: studentId, course: courseId, company: enrollment.company,
        studentName: student?.name, courseCode: course.code, courseTitle: course.title, certificationTarget: course.certificationTarget,
        companyName: company?.name, avgScore: p.avgScore,
      });
    } catch (e) {
      if (e.code !== 11000) throw e;
      const again = await Certificate.findOne({ student: studentId, course: courseId });
      if (again) return again; // issued concurrently
    }
  }
  enrollment.status = 'completed';
  enrollment.completedAt = new Date();
  await enrollment.save();

  const { notify, companyAdmins } = require('./notify');
  await notify(studentId, { type: 'certificate_issued', title: `Certificate earned: ${course.code}`, body: `Congratulations — you completed ${course.title}.`, link: '/certificates' });
  await notify(await companyAdmins(enrollment.company), { type: 'employee_completed', title: `${student?.name} earned the ${course.code} certificate`, body: `Average grade ${p.avgScore ?? '—'}%`, link: '/certificates' });
  return cert;
}

module.exports = { maybeIssue, randomCode };
