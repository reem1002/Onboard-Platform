import { useRef, useState } from 'react';
import { Download, FileArchive, FileImage, FileSpreadsheet, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { downloadAttachment, uploadWithProgress } from '../api/files';
import { ErrorBox, UploadProgress, fmtBytes } from './ui';
import { FileViewerModal } from './FileViewer';
import { useT } from '../lib/i18n';

export const ATTACHMENT_TYPES = ['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'png', 'jpg', 'jpeg', 'pcap', 'pcapng', 'txt', 'csv', 'json', 'log', 'md'];
const ext = (n = '') => n.split('.').pop().toLowerCase();

function FileIcon({ name }) {
  const e = ext(name);
  if (['png', 'jpg', 'jpeg'].includes(e)) return <FileImage size={16} />;
  if (['xlsx', 'csv'].includes(e)) return <FileSpreadsheet size={16} />;
  if (['zip', 'pcap', 'pcapng'].includes(e)) return <FileArchive size={16} />;
  return <FileText size={16} />;
}

/** Read-only list shown to employees (and staff) on the assignment page. */
export function AttachmentList({ assignment }) {
  const t = useT();
  const [err, setErr] = useState('');
  const [view, setView] = useState(null);
  if (!assignment.attachments?.length) return null;
  return (
    <div className="card stack">
      <div className="row"><Paperclip size={16} /><h3>{t('Resources')}</h3><span className="spacer" /><span className="small muted">{t('{n} file(s)', { n: assignment.attachments.length })}</span></div>
      <ErrorBox>{err}</ErrorBox>
      <ul className="attach-list">
        {assignment.attachments.map((f) => (
          <li key={f._id}>
            <div className="attach-item">
              <button className="attach-open" onClick={() => setView(assignment.attachments.indexOf(f))} title={`View ${f.originalName}`}>
                <span className="attach-icon"><FileIcon name={f.originalName} /></span>
                <span className="attach-name">{f.originalName}<span className="small muted">{fmtBytes(f.size)} · .{ext(f.originalName)}</span></span>
              </button>
              <button className="btn btn-ghost icon-btn" aria-label={t('Download {x}', { x: f.originalName })} title={t('Download')} onClick={() => downloadAttachment(assignment._id, f._id, f.originalName).catch((e) => setErr(errorMessage(e, t('Download failed.'))))}><Download size={15} /></button>
            </div>
          </li>
        ))}
      </ul>
      {view !== null && <FileViewerModal open onClose={() => setView(null)} files={assignment.attachments} source={{ type: 'attachment', assignmentId: assignment._id }} initial={view} />}
    </div>
  );
}

/** Upload / remove resources in the assignment editor. */
export function AttachmentManager({ assignmentId, attachments, onChange, limitMB }) {
  const t = useT();
  const [progress, setProgress] = useState(null);
  const [err, setErr] = useState('');
  const [drag, setDrag] = useState(false);
  const cancelRef = useRef(null);
  const input = useRef();

  const send = async (list) => {
    setErr('');
    const files = [...list];
    if (!files.length) return;
    const wrongType = files.filter((f) => !ATTACHMENT_TYPES.includes(ext(f.name)));
    if (wrongType.length) return setErr(`Not allowed: ${wrongType.map((f) => f.name).join(', ')}`);
    const tooBig = files.filter((f) => limitMB && f.size > limitMB * 1024 * 1024);
    if (tooBig.length) return setErr(`${tooBig.map((f) => `${f.name} (${fmtBytes(f.size)})`).join(', ')} — each file must be ${limitMB} MB or smaller.`);
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const total = files.reduce((n, f) => n + f.size, 0);
    setProgress({ loaded: 0, total });
    const { promise, cancel } = uploadWithProgress(`/assignments/${assignmentId}/attachments`, fd, setProgress);
    cancelRef.current = cancel;
    try {
      const { data } = await promise;
      onChange(data.attachments);
    } catch (e) {
      setErr(e.code === 'ERR_CANCELED' ? 'Upload cancelled.' : errorMessage(e, 'Upload failed.'));
    } finally {
      setProgress(null);
    }
  };

  const remove = async (f) => {
    setErr('');
    try {
      const { data } = await api.delete(`/assignments/${assignmentId}/attachments/${f._id}`);
      onChange(data.attachments);
    } catch (e) { setErr(errorMessage(e)); }
  };

  if (!assignmentId) return <p className="small muted">{t('Save the assignment first, then add files here.')}</p>;

  return (
    <div className="stack">
      <ErrorBox>{err}</ErrorBox>
      {attachments?.length > 0 && (
        <ul className="attach-list">
          {attachments.map((f) => (
            <li key={f._id} className="attach-item static">
              <span className="attach-icon"><FileIcon name={f.originalName} /></span>
              <span className="attach-name">{f.originalName}<span className="small muted">{fmtBytes(f.size)}</span></span>
              <button type="button" className="btn btn-ghost icon-btn" aria-label={`Remove ${f.originalName}`} onClick={() => remove(f)}><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      {progress ? (
        <UploadProgress loaded={progress.loaded} total={progress.total} onCancel={() => cancelRef.current?.()} />
      ) : (
        <div
          className={`dropzone ${drag ? 'drag' : ''}`} role="button" tabIndex={0}
          onClick={() => input.current.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files); }}
        >
          <Upload size={18} style={{ margin: '0 auto 6px' }} />
          {t('Drop templates, sample logs or pcaps here, or')} <u>{t('browse')}</u>
          <div className="muted small">Up to {limitMB || '—'} MB per file · {ATTACHMENT_TYPES.map((x) => `.${x}`).join(' ')}</div>
          <input ref={input} type="file" hidden multiple accept={ATTACHMENT_TYPES.map((x) => `.${x}`).join(',')} onChange={(e) => { send(e.target.files); e.target.value = ''; }} />
        </div>
      )}
    </div>
  );
}
