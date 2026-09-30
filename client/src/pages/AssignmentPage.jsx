import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Paperclip, Upload, X, Pencil, Download, FileDown, MessageSquareText, MessageCircleQuestion } from 'lucide-react';
import { useFetch } from '../api/useFetch';
import { api, errorMessage } from '../api/client';
import { downloadSubmissionFile, downloadFeedbackPdf, uploadWithProgress } from '../api/files';
import { AttachmentList } from '../components/Attachments';
import { useAuth } from '../context/AuthContext';
import AssignmentBrief from '../components/AssignmentBrief';
import { ErrorBox, StatusChip, fmtDate, PageSkeleton, UploadProgress, fmtBytes } from '../components/ui';

function SubmitPanel({ assignment, onDone }) {
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  const [drag, setDrag] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const input = useRef();
  const cancelRef = useRef(null);
  const types = assignment.deliverable.acceptedFileTypes;
  const accept = types.map((x) => `.${x}`).join(',');
  const { fileMB = 10, totalMB = 25 } = assignment.uploadLimits || {};
  const MBb = 1024 * 1024;
  const total = files.reduce((n, f) => n + f.size, 0);
  const tooBig = files.filter((f) => f.size > fileMB * MBb);
  const overTotal = total > totalMB * MBb;

  const add = (list) => {
    setError('');
    const all = [...list];
    const ok = all.filter((f) => types.includes(f.name.split('.').pop().toLowerCase()));
    const msgs = [];
    if (ok.length < all.length) msgs.push(`Only ${accept} files are accepted.`);
    const merged = [...files, ...ok];
    if (merged.length > assignment.deliverable.maxFiles) msgs.push(`You can attach up to ${assignment.deliverable.maxFiles} file(s).`);
    setFiles(merged.slice(0, assignment.deliverable.maxFiles));
    if (msgs.length) setError(msgs.join(' '));
  };

  const submit = async () => {
    setError('');
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    if (note) fd.append('note', note);
    setProgress({ loaded: 0, total });
    const { promise, cancel } = uploadWithProgress(`/assignments/${assignment._id}/submissions`, fd, setProgress);
    cancelRef.current = cancel;
    try {
      await promise;
      setFiles([]);
      setNote('');
      onDone();
    } catch (e) {
      setError(e.code === 'ERR_CANCELED' ? 'Upload cancelled — nothing was submitted.' : errorMessage(e, 'Upload failed.'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="card stack">
      <h3>Submit your work</h3>
      <ErrorBox>{error}</ErrorBox>
      {progress ? (
        <UploadProgress loaded={progress.loaded} total={progress.total} onCancel={() => cancelRef.current?.()} />
      ) : (
        <div
          className={`dropzone ${drag ? 'drag' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => input.current.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        >
          <Upload size={20} style={{ margin: '0 auto 6px' }} />
          Drop files here or <u>browse</u>
          <div className="limit-note small muted">
            <span>{accept}</span><span>·</span><span>up to {assignment.deliverable.maxFiles} file{assignment.deliverable.maxFiles > 1 ? 's' : ''}</span><span>·</span><span>max {fileMB} MB each</span>
          </div>
          <input ref={input} type="file" hidden multiple accept={accept} onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </div>
      )}
      {files.length > 0 && (
        <ul className="file-list">
          {files.map((f, i) => (
            <li key={i} className={f.size > fileMB * MBb ? 'too-big' : ''}>
              <Paperclip size={14} /> <span style={{ flex: 1, overflowWrap: 'anywhere' }}>{f.name}</span>
              <span className="size">{fmtBytes(f.size)}{f.size > fileMB * MBb ? ` — over ${fileMB} MB` : ''}</span>
              <button className="btn btn-ghost btn-sm" disabled={Boolean(progress)} aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X size={14} /></button>
            </li>
          ))}
          {files.length > 1 && <li className={overTotal ? 'too-big' : ''}><span style={{ flex: 1 }} className="small muted">Total</span><span className="size">{fmtBytes(total)} of {totalMB} MB</span></li>}
        </ul>
      )}
      {tooBig.length > 0 && <p className="small" style={{ color: 'var(--danger)' }}>Remove or compress files over {fileMB} MB (for example save the report as PDF, or zip screenshots).</p>}
      <div className="field">
        <label htmlFor="note">Note to your instructor (optional)</label>
        <textarea id="note" className="textarea" maxLength={3000} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <button className="btn btn-primary" disabled={!files.length || Boolean(progress) || tooBig.length > 0 || overTotal} onClick={submit}>
        {progress ? <><span className="spin-dot" /> Uploading…</> : 'Submit for review'}
      </button>
    </div>
  );
}

function MySubmissions({ subs }) {
  if (!subs.length) return null;
  return (
    <div className="card stack">
      <h3>Your submissions</h3>
      {subs.map((s) => (
        <div key={s._id} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="row">
            <strong className="small">Attempt {s.attempt}</strong>
            <span className="small muted">{fmtDate(s.createdAt)}</span>
            <span className="spacer" />
            <StatusChip status={s.status} />
          </div>
          {s.files.map((f, i) => (
            <button key={i} className="file-link" title={f.originalName} onClick={() => downloadSubmissionFile(s._id, i, f.originalName)}>
              <Download size={14} /> <span>{f.originalName}</span>
            </button>
          ))}
          {s.final && (
            <div className="stack">
              <div className="row"><span className="total">{s.final.totalScore}</span><span className="muted">/ 100</span></div>
              {s.final.overview && <p className="small">{s.final.overview}</p>}
              <div className="row">
                <Link className="btn btn-primary btn-sm" to={`/feedback/${s._id}`}><MessageSquareText size={14} /> View full feedback</Link>
                <button className="btn btn-sm" onClick={() => downloadFeedbackPdf(s._id)}><FileDown size={14} /> PDF</button>
              </div>
            </div>
          )}
          {s.status === 'under_review' && <p className="small muted">Your instructor is reviewing this. You’ll see the grade here once it’s approved.</p>}
        </div>
      ))}
    </div>
  );
}

export default function AssignmentPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { data, error, loading } = useFetch(`/assignments/${id}`);
  const isEmployee = user.role === 'employee';
  const subs = useFetch(isEmployee ? `/assignments/${id}/submissions/mine` : null);

  if (loading) return <PageSkeleton variant="detail" />;
  if (error) return <div className="page"><ErrorBox>{error}</ErrorBox></div>;
  const a = data.assignment;
  const list = subs.data?.submissions || [];
  const isLesson = a.kind === 'lesson';
  const canSubmit = isEmployee && !isLesson && (!list.length || list[0].status === 'returned');

  return (
    <div className="page">
      <Link to={`/courses/${a.course}`} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> Back to course</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <span className="small muted">{a.code}</span>
          <h1>{a.title}</h1>
        </div>
        <span className="spacer" />
        {a.canEdit && <Link className="btn" to={`/assignments/${a._id}/edit`}><Pencil size={15} /> Edit</Link>}
      </div>

      <div className="brief-layout">
        <AssignmentBrief a={a} />
        <aside className="brief-aside">
          {a.tasks?.length > 0 && (
            <nav className="card task-rail" aria-label="Tasks">
              <h3 style={{ marginBottom: 8 }}>Tasks</h3>
              <ol>{a.tasks.map((t, i) => <li key={i}><a href={`#task-${i + 1}`}>{t.title}</a></li>)}</ol>
            </nav>
          )}
          <AttachmentList assignment={a} />
          {canSubmit && <SubmitPanel assignment={a} onDone={subs.reload} />}
          {isEmployee && !isLesson && <MySubmissions subs={list} />}
          {isEmployee && (
            <div className="card stack help-card">
              <strong>Stuck on something?</strong>
              <p className="small">Ask your instructor — you’ll get a reply under Help &amp; support.</p>
              <Link className="btn btn-sm" to={`/support?new=&course=${a.course}&assignment=${a._id}&subject=${encodeURIComponent(`Question about ${a.code}`)}`}>
                <MessageCircleQuestion size={14} /> Ask your instructor
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
