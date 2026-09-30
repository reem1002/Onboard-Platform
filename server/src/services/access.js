const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { AppError } = require('../utils/errors');

/*
 * Role model
 *   super_admin    – platform owner: everything.
 *   instructor     – platform staff: only courses the admin assigned to them (view, edit, grade).
 *   company_admin  – customer: manages employee accounts (within seats), assigns courses, sees team progress.
 *   employee       – customer's trainee: only courses they're enrolled in.
 */

const isAssignedInstructor = (user, course) =>
  user.role === 'instructor' && (course.instructors || []).some((i) => String(i?._id ?? i) === String(user._id)); // works populated or not

/** Course ids an instructor is assigned to (used to scope queues and dashboards). */
async function assignedCourseIds(user) {
  return Course.find({ instructors: user._id }).distinct('_id');
}

/** Load a course and enforce that the caller may see it. Returns { course, enrollment }. */
async function loadCourseForUser(user, courseId) {
  const course = await Course.findById(courseId);
  if (!course) throw new AppError(404, 'Not found');

  // 404 rather than 403 everywhere: don't reveal that a course exists
  switch (user.role) {
    case 'super_admin':
      return { course, enrollment: null };
    case 'instructor':
      if (!isAssignedInstructor(user, course)) throw new AppError(404, 'Not found');
      return { course, enrollment: null };
    case 'company_admin': {
      const visible = course.isPublished && (!course.company || String(course.company) === String(user.company));
      if (!visible) throw new AppError(404, 'Not found');
      return { course, enrollment: null };
    }
    case 'employee': {
      const enrollment = await Enrollment.findOne({ user: user._id, course: course._id, status: { $ne: 'withdrawn' } });
      if (!enrollment || !course.isPublished) throw new AppError(404, 'Not found');
      return { course, enrollment };
    }
    default:
      throw new AppError(404, 'Not found');
  }
}

/** Editing course content (assignments, milestones): the admin, or an instructor assigned to the course. */
function assertCanAuthor(user, course) {
  if (user.role === 'super_admin' || isAssignedInstructor(user, course)) return;
  throw new AppError(403, 'Forbidden');
}

function canAuthor(user, course) {
  try {
    assertCanAuthor(user, course);
    return true;
  } catch {
    return false;
  }
}

module.exports = { loadCourseForUser, assertCanAuthor, canAuthor, isAssignedInstructor, assignedCourseIds };
