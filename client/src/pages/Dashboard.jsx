import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock, Info, LifeBuoy, RotateCcw, Sparkles, Users,
} from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ErrorBox, Progress, fmtDate, Skeleton, SkeletonText } from '../components/ui';
import { NotifIcon, timeAgo } from '../components/notifications';
import { useT, dateLocale } from '../lib/i18n';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const n = (v, suffix = '') => (v === null || v === undefined ? '—' : `${v}${suffix}`);
const hrs = (h) => (h === null || h === undefined ? '—' : h < 24 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);

export default function Dashboard() {
  const { user } = useAuth();
  const t = useT();
  const [home, setHome] = useState(null);
  const [feed, setFeed] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.get('/dashboard/home').then(({ data }) => setHome(data)).catch((e) => setError(errorMessage(e)));
    api.get('/notifications', { params: { limit: 8 } }).then(({ data }) => setFeed(data)).catch(() => setFeed({ items: [], unread: 0 }));
  }, []);
  useEffect(() => { setHome(null); load(); }, [load, user._id]);

  const markAll = async () => {
    await api.post('/notifications/read', {}).catch(() => {});
    setFeed((f) => ({ ...f, unread: 0, items: f.items.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() })) }));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="muted small" style={{ marginTop: 0 }}>{new Date().toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          <h1>{t(greeting())}{t(', ')}{user.name.split(' ')[0]}</h1>
          {home && <p>{summaryLine(home, t)}</p>}
        </div>
      </div>
      {error && <div className="alert alert-error row" role="alert"><span style={{ flex: 1 }}>{error}</span><button className="btn btn-sm" onClick={load}>{t('Try again')}</button></div>}
      {!home && !error ? <DashSkeleton /> : home && (
        <div className="dash">
          <div className="dash-main">
            {home.role === 'employee' && <EmployeeHome d={home} />}
            {home.role === 'instructor' && <InstructorHome d={home} />}
            {home.role === 'company_admin' && <CompanyHome d={home} />}
            {home.role === 'super_admin' && <AdminHome d={home} />}
          </div>
          <aside className="dash-side">
            <section className="card">
              <div className="row" style={{ marginBottom: 'var(--sp-2)', flexWrap: 'nowrap' }}>
                <h2 className="h-card" style={{ whiteSpace: 'nowrap' }}>{t('What’s new')}</h2>
                <span className="spacer" />
                {feed?.unread > 0 && <button className="btn btn-ghost btn-sm" style={{ paddingInline: 6 }} onClick={markAll} title={`${feed.unread} unread`}>{t('Mark {n} read', { n: feed.unread })}</button>}
              </div>
              {!feed ? <SkeletonText lines={5} /> : feed.items.length === 0 ? (
                <p className="muted small">{t('Nothing new yet. Updates about grades, courses and support replies show up here.')}</p>
              ) : (
                <ul className="feed">
                  {feed.items.map((i) => (
                    <li key={i._id} className={i.readAt ? '' : 'unread'}>
                      <NotifIcon type={i.type} />
                      <div>
                        {i.link?.startsWith('/') ? <Link to={i.link} className="feed-title">{i.title}</Link> : <span className="feed-title">{i.title}</span>}
                        {i.body && <div className="small muted">{i.body}</div>}
                        <div className="feed-time">{timeAgo(i.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <SupportCard d={home} />
          </aside>
        </div>
      )}
    </div>
  );
}

function DashSkeleton() {
  return (
    <div className="dash" role="status" aria-label="Loading dashboard">
      <div className="dash-main">
        <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="stat skel-tile"><Skeleton w={60} h={30} /><Skeleton w="70%" h={12} style={{ marginTop: 10 }} /></div>)}</div>
        {[3, 2].map((n, i) => (
          <div className="card" key={i}><Skeleton w={150} h={18} /><SkeletonText lines={n} /></div>
        ))}
      </div>
      <div className="dash-side"><div className="card"><Skeleton w={110} h={18} /><SkeletonText lines={5} /></div></div>
    </div>
  );
}

function summaryLine(d, t) {
  const s = d.stats || {};
  switch (d.role) {
    case 'employee':
      if (d.toFix?.length) return t(d.toFix.length > 1 ? '{n} pieces of work came back for rework — start there.' : '1 piece of work came back for rework — start there.', { n: d.toFix.length });
      if (d.upNext?.length) return t('You’re {pct}% through your training. Next up: {item}.', { pct: Math.round(s.avgPct), item: `${d.upNext[0].code} — ${d.upNext[0].title}` });
      return s.courses ? t('You’re all caught up. Nice work.') : t('You haven’t been assigned a course yet.');
    case 'instructor':
      return s.toReview + s.aiFailed ? t('{n} submission(s) waiting for your review.', { n: s.toReview + s.aiFailed }) : t('Your review queue is empty.');
    case 'company_admin':
      return t('{n} active employee(s), {pct}% average progress', { n: s.employees, pct: Math.round(s.avgPct) }) + (s.needsAttention ? t(' — {n} need(s) attention', { n: s.needsAttention }) : '') + '.';
    case 'super_admin':
      return t('{n} submission(s) pending review across the platform, {m} open support request(s).', { n: s.pendingReview, m: s.openPlatformTickets });
    default: return '';
  }
}

function Stat({ label, value, hint }) {
  const t = useT();
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{t(label)}</span>
      {hint && <small className="stat-hint">{t(hint)}</small>}
    </div>
  );
}

function Section({ title, action, children }) {
  const t = useT();
  return (
    <section className="card dash-section">
      <div className="row dash-section-head">
        <h2 className="h-card">{t(title)}</h2>
        <span className="spacer" />
        {action}
      </div>
      {children}
    </section>
  );
}

function ViewAll({ to, children = 'View all' }) {
  const t = useT();
  return <Link to={to} className="small link-arrow">{t(children)} <ArrowRight size={14} /></Link>;
}

/* ---------------------------- Employee ---------------------------- */
function EmployeeHome({ d }) {
  const t = useT();
  const s = d.stats;
  return (
    <>
      <div className="stats">
        <Stat label="Courses" value={s.courses} />
        <Stat label="Overall progress" value={`${Math.round(s.avgPct)}%`} />
        <Stat label="Average grade" value={n(s.avgScore)} hint={s.avgScore === null ? 'No graded work yet' : 'out of 100'} />
        <Stat label="Under review" value={s.underReview} />
      </div>

      {d.toFix.length > 0 && (
        <section className="card attention-card">
          <div className="row"><RotateCcw size={18} /><h2 className="h-card">{t('Returned for rework')}</h2></div>
          <p className="small" style={{ margin: '6px 0 var(--sp-2)' }}>{t('Your instructor asked for changes. Read the feedback, update your work and resubmit.')}</p>
          <ul className="list-links">
            {d.toFix.map((t) => <li key={t.link}><Link to={t.link}><span className="item-code">{t.code}</span> {t.title}<ArrowRight size={14} /></Link></li>)}
          </ul>
        </section>
      )}

      {d.upNext.length > 0 && (
        <Section title="Up next">
          <ul className="list-links">
            {d.upNext.map((t) => (
              <li key={t.link}>
                <Link to={t.link}>
                  <span className="item-code">{t.code}</span>
                  <span className="grow">{t.title}<span className="muted small"> · {t.courseCode}</span></span>
                  <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="My courses" action={<ViewAll to="/courses" />}>
        {d.courses.length === 0 ? <p className="muted small">{t('When your company assigns you a course it will appear here.')}</p> : (
          <div className="dash-courses">
            {d.courses.map((c) => (
              <Link key={c._id} to={`/courses/${c._id}`} className="dash-course">
                <div className="row"><span className="item-code">{c.code}</span><span className="spacer" /><DueChip c={c} /></div>
                <strong>{c.title}</strong>
                <div className="row small muted">
                  <span>{t('{a}/{b} done', { a: c.completed, b: c.total })}</span><span className="spacer" /><span>{c.pct}%</span>
                </div>
                <Progress value={c.pct} ok={c.pct === 100} />
                {c.currentMilestone && <span className="small muted">{t('Now:')} {c.currentMilestone}</span>}
              </Link>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent grades">
        {d.recentGrades.length === 0 ? <p className="muted small">{t('Graded work and feedback will appear here.')}</p> : (
          <ul className="list-links">
            {d.recentGrades.map((g) => (
              <li key={g.link}>
                <Link to={g.link}>
                  <span className="item-code">{g.code}</span>
                  <span className="grow">{g.title}<span className="muted small"> · {fmtDate(g.at)}</span></span>
                  <ScorePill score={g.score} max={g.maxScore} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

function DueChip({ c }) {
  const t = useT();
  if (c.pct === 100) return <span className="chip chip-ok"><CheckCircle2 size={12} /> {t('Complete')}</span>;
  if (c.daysLeft === null || c.daysLeft === undefined) return null;
  if (c.overdue) return <span className="chip chip-danger"><AlertTriangle size={12} /> {t('Overdue')}</span>;
  if (c.daysLeft <= 7) return <span className="chip chip-warn"><CalendarClock size={12} /> {t(c.daysLeft === 1 ? '1 day left' : '{n} days left', { n: c.daysLeft })}</span>;
  return <span className="chip"><CalendarClock size={12} /> {t('Due {date}', { date: fmtDate(c.dueAt) })}</span>;
}

function ScorePill({ score, max = 100 }) {
  const t = useT();
  const pct = max ? (score / max) * 100 : 0;
  const label = pct >= 80 ? 'Strong' : pct >= 60 ? 'Pass' : 'Below target';
  return <span className={`score-pill ${pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'low'}`} title={t(label)}><b>{score}</b>/{max}</span>;
}

/* ---------------------------- Instructor ---------------------------- */
function InstructorHome({ d }) {
  const t = useT();
  const s = d.stats;
  return (
    <>
      <div className="stats">
        <Stat label="Waiting for review" value={s.toReview} />
        <Stat label="Needs manual grading" value={s.aiFailed} hint={s.aiFailed ? 'AI couldn’t grade these' : undefined} />
        <Stat label="Open questions" value={s.openQuestions} />
        <Stat label="Reviewed this week" value={s.reviewedThisWeek} hint={t('Avg turnaround {x}', { x: hrs(s.avgTurnaroundHours) })} />
      </div>

      <Section title="Review queue" action={<ViewAll to="/review" />}>
        {d.queue.length === 0 ? <p className="muted small">Nothing waiting. New submissions show up here as soon as the AI draft is ready.</p> : (
          <table className="table">
            <thead><tr><th>{t('Employee')}</th><th>{t('Item')}</th><th>{t('Status')}</th><th>{t('AI draft')}</th><th>{t('Waiting')}</th><th /></tr></thead>
            <tbody>
              {d.queue.map((q) => (
                <tr key={q._id}>
                  <td data-label="Employee">{q.student}</td>
                  <td data-label="Item"><span className="item-code">{q.code}</span> <span className="small">{q.title}</span></td>
                  <td data-label="Status">{q.status === 'ai_failed' ? <span className="chip chip-danger">Manual grading</span> : q.status === 'ai_graded' ? <span className="chip chip-info"><Sparkles size={12} /> AI draft ready</span> : <span className="chip chip-warn">Submitted</span>}</td>
                  <td data-label="AI draft">{n(q.aiScore)}</td>
                  <td data-label="Waiting"><span className={q.waitingHours > 48 ? 'text-danger' : ''}>{hrs(q.waitingHours)}</span></td>
                  <td><Link to={q.link} className="btn btn-sm">Review</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="My courses">
        {d.courses.length === 0 ? <p className="muted small">An administrator hasn’t assigned you to a course yet.</p> : (
          <table className="table">
            <thead><tr><th>{t('Course')}</th><th>{t('Employees')}</th><th>{t('Avg progress')}</th><th>{t('Avg grade')}</th><th>{t('Pending')}</th></tr></thead>
            <tbody>
              {d.courses.map((c) => (
                <tr key={c._id}>
                  <td data-label="Course"><Link to={`/courses/${c._id}`}><strong>{c.code}</strong></Link> <span className="small muted">{c.title}</span></td>
                  <td data-label="Employees">{c.students}</td>
                  <td data-label="Avg progress"><div className="row" style={{ flexWrap: 'nowrap' }}><Progress value={c.avgPct} /><span className="small">{c.avgPct}%</span></div></td>
                  <td data-label="Avg grade">{n(c.avgScore)}</td>
                  <td data-label="Pending">{c.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Employees who may need help">
        <PeopleList rows={d.atRisk} empty="No one is behind right now." showCompany />
      </Section>
    </>
  );
}

function PeopleList({ rows, empty, showCompany }) {
  const t = useT();
  if (!rows.length) return <p className="muted small">{t(empty)}</p>;
  return (
    <ul className="list-links">
      {rows.map((r, i) => (
        <li key={`${r.name}-${i}`}>
          <Link to={r.link}>
            <AlertTriangle size={15} className="text-warn" />
            <span className="grow">
              <strong>{r.name}</strong>
              <span className="small muted">{showCompany && r.company ? ` · ${r.company}` : ''}{r.course ? ` · ${r.course}` : ''}{r.pct !== undefined ? ` · ${r.pct}%` : ''}</span>
            </span>
            <span className="chip chip-warn">{t(r.reason)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------- Company admin ---------------------------- */
function CompanyHome({ d }) {
  const t = useT();
  const s = d.stats;
  const seatPct = d.company.seatLimit ? Math.round((d.company.seatsUsed / d.company.seatLimit) * 100) : 0;
  return (
    <>
      <div className="stats">
        <Stat label="Active employees" value={s.employees} />
        <Stat label="Average progress" value={`${Math.round(s.avgPct)}%`} />
        <Stat label="Courses completed" value={s.completedCourses} />
        <Stat label="Need attention" value={s.needsAttention} />
      </div>

      <section className="card seats-card">
        <div className="row">
          <Users size={18} />
          <strong>{t('Seats')}</strong>
          <span className="spacer" />
          <span className="small">{t('{a} of {b} used', { a: d.company.seatsUsed, b: d.company.seatLimit })}</span>
        </div>
        <Progress value={seatPct} />
        {seatPct >= 90 && <p className="small" style={{ marginTop: 6 }}><Info size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {t('You’re close to your limit — contact us through Support to add seats.')}</p>}
      </section>

      <Section title="Progress by course" action={<ViewAll to="/team">Team progress</ViewAll>}>
        {d.courses.length === 0 ? <p className="muted small">{t('Assign a course to your employees from the Courses page.')}</p> : (
          <div className="hbars" role="list">
            {d.courses.map((c) => (
              <div className="hbar" role="listitem" key={c._id}>
                <span className="hbar-label"><strong>{c.code}</strong> <span className="muted small">{t('{n} enrolled', { n: c.enrolled })}</span></span>
                <span className="hbar-track" title={`${c.code}: ${c.avgPct}% average progress`}><span style={{ width: `${c.avgPct}%` }} /></span>
                <span className="hbar-val">{c.avgPct}%</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Needs your attention">
        <PeopleList rows={d.attention} empty="Everyone is on track." />
      </Section>

      <Section title="Latest graded work" action={<ViewAll to="/reports/shared">Shared reports</ViewAll>}>
        {d.recentResults.length === 0 ? <p className="muted small">{t('Grades appear here once an instructor approves them.')}</p> : (
          <ul className="list-links">
            {d.recentResults.map((r, i) => (
              <li key={i}>
                <Link to={r.link}>
                  <span className="item-code">{r.code}</span>
                  <span className="grow"><strong>{r.name}</strong><span className="small muted"> · {r.title} · {fmtDate(r.at)}</span></span>
                  <ScorePill score={r.score} max={r.maxScore} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

/* ---------------------------- Platform admin ---------------------------- */
function AdminHome({ d }) {
  const t = useT();
  const s = d.stats;
  return (
    <>
      <div className="stats">
        <Stat label="Companies" value={s.companies} hint={`${s.seatsUsed} / ${s.seatsTotal} seats used`} />
        <Stat label="Pending review" value={s.pendingReview} />
        <Stat label="Graded this week" value={s.gradedWeek} hint={`Avg grade ${n(s.avgGradeWeek)}`} />
        <Stat label="Open support" value={s.openPlatformTickets} hint={s.avgFirstResponseHours === null ? 'No replies in 30 days' : `Avg first reply ${hrs(s.avgFirstResponseHours)}`} />
      </div>

      {d.alerts.length > 0 && (
        <section className="card attention-card">
          <div className="row"><AlertTriangle size={18} /><h2 className="h-card">{t('Needs action')}</h2></div>
          <ul className="list-links" style={{ marginTop: 'var(--sp-2)' }}>
            {d.alerts.map((a, i) => (
              <li key={i}><Link to={a.link}>{a.kind === 'warning' ? <AlertTriangle size={15} className="text-warn" /> : <Info size={15} />}<span className="grow">{a.text}</span><ArrowRight size={14} /></Link></li>
            ))}
          </ul>
        </section>
      )}

      <Section title="Submissions — last 14 days" action={<span className="small muted">{s.submissionsWeek} this week</span>}>
        <BarChart data={d.activity} />
      </Section>

      <Section title="Grading backlog by course" action={<ViewAll to="/review">Review queue</ViewAll>}>
        {d.backlog.length === 0 ? <p className="muted small">No backlog — every submission has been reviewed.</p> : (
          <table className="table">
            <thead><tr><th>{t('Course')}</th><th>{t('Instructors')}</th><th>{t('Pending')}</th><th>{t('Oldest')}</th></tr></thead>
            <tbody>
              {d.backlog.map((b) => (
                <tr key={b._id}>
                  <td data-label="Course"><Link to={`/courses/${b._id}`}><strong>{b.code}</strong></Link></td>
                  <td data-label="Instructors">{b.instructors.join(', ') || <span className="chip chip-danger">None assigned</span>}</td>
                  <td data-label="Pending">{b.pending}</td>
                  <td data-label="Oldest"><span className={b.oldestHours > 48 ? 'text-danger' : ''}><Clock size={13} style={{ display: 'inline', verticalAlign: '-2px' }} /> {hrs(b.oldestHours)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <div className="stats stats-quiet">
        <Stat label="Active employees" value={s.employees} />
        <Stat label="Instructors" value={s.instructors} />
        <Stat label="Published courses" value={s.coursesPublished} />
        <Stat label="Unanswered > 24 h" value={s.unansweredOver24h} />
      </div>
    </>
  );
}

/** Single-series bar chart (one hue, value on hover, peak labelled). */
function BarChart({ data }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 560; const H = 120; const pad = 22; const gap = 4;
  const bw = (W - gap * (data.length - 1)) / data.length;
  const fmt = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const peak = data.reduce((a, b, i) => (b.count > data[a].count ? i : a), 0);
  return (
    <div className="barchart">
      <svg viewBox={`0 0 ${W} ${H + pad}`} role="img" aria-label={`Submissions per day, peak ${data[peak].count} on ${fmt(data[peak].date)}`} onMouseLeave={() => setHover(null)}>
        <line x1="0" x2={W} y1={H} y2={H} className="axis" />
        {data.map((d, i) => {
          const h = (d.count / max) * (H - 18);
          const x = i * (bw + gap);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={x} y="0" width={bw} height={H} fill="transparent" />
              {d.count > 0 && <path className={`bar ${hover === i ? 'on' : ''}`} d={roundedTop(x, H - h, bw, h, Math.min(4, bw / 2, h))} />}
              {i === peak && d.count > 0 && hover === null && <text x={x + bw / 2} y={H - h - 5} textAnchor="middle" className="bar-label">{d.count}</text>}
            </g>
          );
        })}
        <text x="0" y={H + 16} className="tick">{fmt(data[0].date)}</text>
        <text x={W} y={H + 16} textAnchor="end" className="tick">Today</text>
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((hover * (bw + gap) + bw / 2) / W) * 100}%` }}>
          <strong>{data[hover].count}</strong> submission{data[hover].count === 1 ? '' : 's'}<br /><span className="muted">{fmt(data[hover].date)}</span>
        </div>
      )}
    </div>
  );
}
function roundedTop(x, y, w, h, r) {
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function SupportCard({ d }) {
  const t = useT();
  const map = {
    employee: [d.support?.replies, 'repl', 'Your questions go straight to your course instructor.'],
    company_admin: [d.support?.waiting, 'repl', 'Questions about seats, access or courses go to our team.'],
    instructor: [d.stats?.openQuestions, 'question', 'Answer employees’ questions about your courses.'],
    super_admin: [d.stats?.openPlatformTickets, 'request', 'Company and employee requests to the platform team.'],
  }[d.role];
  if (!map) return null;
  const [count, noun, text] = map;
  const label = noun === 'repl' ? t(count === 1 ? '1 new reply' : '{n} new replies', { n: count }) : t(noun === 'question' ? '{n} open question(s)' : '{n} open request(s)', { n: count });
  return (
    <section className="card support-card">
      <div className="row"><LifeBuoy size={18} /><h2 className="h-card">{t('Support')}</h2></div>
      <p className="small" style={{ margin: '6px 0 var(--sp-2)' }}>{t(text)}</p>
      <div className="row">
        {count > 0 && <span className="chip chip-info">{label}</span>}
        <span className="spacer" />
        <Link to="/support" className="btn btn-sm">{t(d.role === 'employee' || d.role === 'company_admin' ? 'Get help' : 'Open')} <ArrowRight size={14} /></Link>
      </div>
    </section>
  );
}

