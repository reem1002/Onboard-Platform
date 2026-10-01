import { useT, dateLocale } from '../lib/i18n';

/* ---------------- Loading states ----------------
 * Skeletons mirror the layout that is about to appear, so the page doesn't jump when data lands.
 * They shimmer (unless the user prefers reduced motion) and are announced once to screen readers. */
export const Skeleton = ({ w = '100%', h = 14, r = 8, style, className = '' }) => (
  <span className={`skel ${className}`} style={{ width: w, height: h, borderRadius: r, ...style }} aria-hidden />
);

export function SkeletonText({ lines = 3, last = '60%' }) {
  return (
    <span className="skel-text" aria-hidden>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} w={i === lines - 1 ? last : '100%'} h={12} />)}
    </span>
  );
}

export function ListSkeleton({ rows = 4 }) {
  return (
    <div className="skel-list" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="skel-row" key={i}>
          <Skeleton w={56} h={22} r={999} />
          <span style={{ flex: 1 }}><Skeleton w={`${70 - ((i * 13) % 30)}%`} h={13} /></span>
          <Skeleton w={72} h={22} r={999} />
        </div>
      ))}
    </div>
  );
}

/** Whole-page placeholder. variant: dashboard | list | detail | cards | table */
export function PageSkeleton({ variant = 'list' }) {
  return (
    <div className="page" role="status" aria-label="Loading page">
      <div className="page-head" aria-hidden>
        <div style={{ width: '100%' }}>
          <Skeleton w={110} h={12} />
          <Skeleton w="min(420px, 80%)" h={34} style={{ marginTop: 10 }} />
          <Skeleton w="min(560px, 90%)" h={14} style={{ marginTop: 12 }} />
        </div>
      </div>
      {variant === 'dashboard' && (
        <div className="dash">
          <div className="dash-main">
            <div className="stats">{[0, 1, 2, 3].map((i) => <div key={i} className="stat skel-tile"><Skeleton w={60} h={30} /><Skeleton w="70%" h={12} style={{ marginTop: 10 }} /></div>)}</div>
            <div className="card"><Skeleton w={140} h={18} /><div style={{ marginTop: 14 }}><ListSkeleton rows={3} /></div></div>
            <div className="card"><Skeleton w={120} h={18} /><div style={{ marginTop: 14 }}><ListSkeleton rows={2} /></div></div>
          </div>
          <div className="dash-side"><div className="card"><Skeleton w={110} h={18} /><div style={{ marginTop: 14 }}><SkeletonText lines={5} /></div></div></div>
        </div>
      )}
      {variant === 'cards' && (
        <div className="course-grid">{[0, 1, 2].map((i) => <div key={i} className="card skel-card"><Skeleton w={90} h={22} r={999} /><Skeleton w="85%" h={20} style={{ marginTop: 14 }} /><SkeletonText lines={2} /><Skeleton h={8} style={{ marginTop: 18 }} /></div>)}</div>
      )}
      {variant === 'detail' && (
        <div className="brief-layout">
          <div className="card stack"><SkeletonText lines={4} /><Skeleton h={120} r={14} /><SkeletonText lines={5} last="40%" /></div>
          <div className="card stack"><Skeleton w={120} h={18} /><Skeleton h={90} r={14} /><Skeleton h={40} r={999} /></div>
        </div>
      )}
      {(variant === 'list' || variant === 'table') && (
        <div className="card"><ListSkeleton rows={variant === 'table' ? 6 : 4} /></div>
      )}
    </div>
  );
}

/** Small inline loader (kept for tiny areas); prefer a skeleton for anything with a known shape. */
export const Loader = ({ rows }) => (rows ? <ListSkeleton rows={rows} /> : <div className="spinner" role="status" aria-label="Loading" />);

/** Determinate progress for uploads: bar + percentage + transferred size. */
export function UploadProgress({ loaded, total, onCancel, label = 'Uploading' }) {
  const pct = total ? Math.round((loaded / total) * 100) : 0;
  return (
    <div className="upload-progress" role="status" aria-live="polite">
      <div className="row small">
        <span className="spin-dot" aria-hidden />
        <strong>{pct < 100 ? `${label}… ${pct}%` : 'Processing…'}</strong>
        <span className="muted">{fmtBytes(loaded)} of {fmtBytes(total)}</span>
        <span className="spacer" />
        {onCancel && pct < 100 && <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="progress upload-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function fmtBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export const ErrorBox = ({ children }) => (children ? <div className="alert alert-error" role="alert">{children}</div> : null);

const STATUS = {
  submitted: ['Waiting for review', 'chip-warn'],
  ai_grading: ['AI grading', 'chip-info'],
  ai_graded: ['AI draft ready', 'chip-info'],
  ai_failed: ['Needs manual grading', 'chip-danger'],
  under_review: ['Under review', 'chip-warn'],
  approved: ['Graded', 'chip-ok'],
  returned: ['Returned for rework', 'chip-danger'],
};

export function StatusChip({ status }) {
  const t = useT();
  if (!status) return <span className="chip">{t('Not started')}</span>;
  const [label, cls] = STATUS[status] || [status, ''];
  return <span className={`chip ${cls}`}>{t(label)}</span>;
}

export function Progress({ value, ok }) {
  return (
    <div className={`progress ${ok ? 'ok' : ''}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
