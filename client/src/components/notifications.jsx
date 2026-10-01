import {
  Award, BookOpen, ClipboardCheck, FileText, LifeBuoy, RotateCcw, Sparkles, Users, AlertTriangle, Bell, GraduationCap, CalendarClock,
} from 'lucide-react';

// Icon + soft tone per notification type (tone is decoration only — the title says what happened)
const MAP = {
  course_assigned: [BookOpen, 'lavender'],
  course_published: [BookOpen, 'lavender'],
  course_instructor: [GraduationCap, 'lavender'],
  graded: [Award, 'mint'],
  employee_completed: [Award, 'mint'],
  returned: [RotateCcw, 'peach'],
  quiz_failed_out: [AlertTriangle, 'pink'],
  ticket_reply: [LifeBuoy, 'sky'],
  ticket_new: [LifeBuoy, 'sky'],
  submission_new: [ClipboardCheck, 'peach'],
  submission_ai_ready: [Sparkles, 'peach'],
  seat_limit_reached: [Users, 'pink'],
  seats_changed: [Users, 'lavender'],
  report_shared: [FileText, 'mint'],
  certificate_issued: [Award, 'mint'],
  quiz_extra_attempt: [RotateCcw, 'lavender'],
  due_soon: [CalendarClock, 'peach'],
  overdue: [AlertTriangle, 'pink'],
  review_waiting: [ClipboardCheck, 'peach'],
};

export function NotifIcon({ type }) {
  const [Icon, tone] = MAP[type] || [Bell, 'note'];
  return <span className={`notif-icon tone-${tone}`} aria-hidden><Icon size={16} /></span>;
}

export function timeAgo(d) {
  if (!d) return '';
  const ar = document.documentElement.lang === 'ar';
  const s = Math.max(0, (Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return ar ? 'الآن' : 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return ar ? `منذ ${m} د` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return ar ? `منذ ${h} س` : `${h} h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return ar ? `منذ ${days} يوم` : `${days} d ago`;
  return new Date(d).toLocaleDateString(ar ? 'ar-EG-u-nu-latn' : undefined, { day: 'numeric', month: 'short' });
}
