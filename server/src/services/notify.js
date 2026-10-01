const Notification = require('../models/Notification');
const User = require('../models/User');
const Course = require('../models/Course');
const env = require('../config/env');

/** Which email preference switch controls each notification type */
const CATEGORY = {
  graded: 'grades',
  returned: 'grades',
  quiz_failed_out: 'grades',
  course_assigned: 'courses',
  course_published: 'courses',
  course_instructor: 'courses',
  ticket_reply: 'support',
  ticket_new: 'support',
  submission_new: 'reviews',
  submission_ai_ready: 'reviews',
  employee_completed: 'team',
  seat_limit_reached: 'team',
  seats_changed: 'team',
  report_shared: 'team',
  certificate_issued: 'grades',
  quiz_extra_attempt: 'grades',
  due_soon: 'reminders',
  overdue: 'reminders',
  review_waiting: 'reminders',
};

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderEmail(user, { title, body, link }) {
  const { tr, UI } = require('./i18n');
  const ar = user.preferences?.language === 'ar';
  const T = tr(title, ar ? 'ar' : 'en');
  const B = tr(body, ar ? 'ar' : 'en');
  const first = user.name.split(' ')[0];
  const url = link ? `${env.APP_URL.replace(/\/$/, '')}${link}` : env.APP_URL;
  const prefs = `${env.APP_URL.replace(/\/$/, '')}/profile#notifications`;
  const L = ar
    ? { hi: UI.hi(first), open: UI.open, footer: UI.footer, change: UI.change, training: UI.training, dir: 'rtl', lang: 'ar', align: 'right' }
    : { hi: `Hi ${first},`, open: 'Open in the platform', footer: 'You’re getting this because of your notification settings.', change: 'Change them', training: 'Training', dir: 'ltr', lang: 'en', align: 'left' };
  const text = `${L.hi}\n\n${T}${B ? `\n${B}` : ''}\n\n${L.open}: ${url}\n\n—\n${env.ORG_NAME}. ${L.change}: ${prefs}`;
  const html = `<!doctype html><html lang="${L.lang}" dir="${L.dir}"><body style="margin:0;background:#f4efe9;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#141414">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4efe9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${L.dir}" style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px;text-align:${L.align}">
<tr><td style="font-size:13px;color:#8a8580;padding-bottom:14px">${esc(env.ORG_NAME)} · ${L.training}</td></tr>
<tr><td style="font-size:15px;padding-bottom:6px">${esc(L.hi)}</td></tr>
<tr><td style="font-size:18px;font-weight:600;line-height:1.45;padding-bottom:8px">${esc(T)}</td></tr>
${B ? `<tr><td style="font-size:15px;line-height:1.6;color:#4b4b4b;padding-bottom:20px">${esc(B)}</td></tr>` : ''}
<tr><td><a href="${esc(url)}" style="display:inline-block;background:#141414;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">${L.open}</a></td></tr>
<tr><td style="font-size:12px;color:#8a8580;padding-top:24px;border-top:1px solid #ece5dd;margin-top:24px">${L.footer} <a href="${esc(prefs)}" style="color:#8a8580">${L.change}</a>.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: T, text, html };
}

/** Send notification emails in the background (never blocks or fails the request). */
function queueEmails(userIds, payload) {
  const run = async () => {
    const { getSettings } = require('./settings');
    const { sendMail, mailConfigured } = require('./mailer');
    const s = await getSettings();
    if (!s.email?.notificationsEnabled) return;
    // Without SMTP (local development) just log one line per email instead of printing the whole message
    const devLog = !mailConfigured() && env.NODE_ENV === 'development';
    const cat = CATEGORY[payload.type];
    const users = await User.find({ _id: { $in: userIds }, isActive: true }).select('name email preferences');
    for (const u of users) {
      const p = u.preferences?.email || {};
      if (p.enabled === false || (cat && p[cat] === false)) continue;
      if (devLog) { console.log(`📧  [dev mail] ${u.email} ← ${payload.title}`); continue; }
      try {
        await sendMail({ to: u.email, ...renderEmail(u, payload), category: payload.type });
      } catch (e) {
        console.error('notification email failed', u.email, e.message);
      }
    }
  };
  const p = run().catch((e) => console.error('notification emails failed', e.message));
  if (env.NODE_ENV === 'test') pending.push(p);
}
const pending = []; // tests await these
const flushEmails = async () => { await Promise.all(pending.splice(0)); };

/**
 * Create in-app notifications and email them per user preference. Never throws: a failed notification
 * must not break the action that caused it. `link` must be an in-app path (starts with "/").
 */
async function notify(userIds, { type, title, body, link }) {
  try {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
    if (!ids.length) return;
    const safeLink = link && link.startsWith('/') && !link.startsWith('//') ? link : undefined;
    const t = title.slice(0, 200);
    const b = body?.slice(0, 500);
    await Notification.insertMany(ids.map((user) => ({ user, type, title: t, body: b, link: safeLink })));
    queueEmails(ids, { type, title: t, body: b, link: safeLink });
  } catch (e) {
    console.error('notify failed', e.message);
  }
}

const instructorsOf = async (courseId) => (await Course.findById(courseId).select('instructors'))?.instructors || [];
const companyAdmins = async (companyId) => (companyId ? User.find({ company: companyId, role: 'company_admin', isActive: true }).distinct('_id') : []);
const platformAdmins = () => User.find({ role: 'super_admin', isActive: true }).distinct('_id');

module.exports = { notify, instructorsOf, companyAdmins, platformAdmins, flushEmails, renderEmail, CATEGORY };
