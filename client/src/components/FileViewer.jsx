import { useEffect, useMemo, useState } from 'react';
import { Download, Maximize2, Minimize2, X, FileQuestion } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { ErrorBox, Skeleton, fmtBytes } from './ui';
import { useT } from '../lib/i18n';

/**
 * View uploaded files inside the platform — no download needed.
 *  source = { type: 'submission', id }  → files are sub.files (index based)
 *  source = { type: 'attachment', assignmentId } → files are assignment.attachments (_id based)
 * PDF and images use the browser's own viewer on a blob; DOCX is converted on the server and shown in a
 * sandboxed iframe (scripts and same-origin access disabled); text/CSV are shown as text/table.
 */
const urls = (source, file, index) => (source.type === 'submission'
  ? { raw: `/submissions/${source.id}/files/${index}`, preview: `/submissions/${source.id}/files/${index}/preview` }
  : { raw: `/assignments/${source.assignmentId}/attachments/${file._id}`, preview: `/assignments/${source.assignmentId}/attachments/${file._id}/preview` });

const DOC_CSS = `
  body{font-family:Segoe UI,Arial,sans-serif;line-height:1.55;color:#1d1d1d;max-width:820px;margin:24px auto;padding:0 20px;background:#fff}
  img{max-width:100%;height:auto;border:1px solid #e6e6e6;border-radius:6px;margin:6px 0}
  table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px} td,th{border:1px solid #d9d9d9;padding:6px 8px;vertical-align:top}
  h1,h2,h3{line-height:1.25} a{color:#3d5afe;pointer-events:none}`;

function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let q = false;
  for (let i = 0; i < text.length && rows.length < 501; i += 1) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export default function FileViewer({ files, source, initial = 0, onClose, height = '72vh' }) {
  const t = useT();
  const [idx, setIdx] = useState(initial);
  const [state, setState] = useState({ loading: true });
  const [full, setFull] = useState(false);
  const file = files[idx];
  useEffect(() => setIdx(initial), [initial]);

  useEffect(() => {
    if (!file) return undefined;
    let alive = true;
    let objectUrl;
    setState({ loading: true });
    const { raw, preview } = urls(source, file, idx);
    (async () => {
      try {
        const { data: p } = await api.get(preview);
        if (p.kind === 'pdf' || p.kind === 'image') {
          const res = await api.get(raw, { responseType: 'blob' });
          const type = p.kind === 'pdf' ? 'application/pdf' : res.data.type || 'image/png';
          objectUrl = URL.createObjectURL(new Blob([res.data], { type }));
          if (alive) setState({ kind: p.kind, url: objectUrl });
        } else if (alive) setState(p);
      } catch (e) {
        if (alive) setState({ error: errorMessage(e, t('Could not open this file.')) });
      }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [file, idx, source.type, source.id, source.assignmentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = async () => {
    const { raw } = urls(source, file, idx);
    const res = await api.get(raw, { responseType: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(res.data);
    a.download = file.originalName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const csv = useMemo(() => (state.kind === 'text' && /\.csv$/i.test(file?.originalName || '') ? parseCsv(state.text) : null), [state, file]);

  if (!file) return null;
  return (
    <div className={`viewer ${full ? 'viewer-full' : ''}`} role="region" aria-label={t('Viewing {x}', { x: file.originalName })}>
      <div className="viewer-bar">
        {files.length > 1 ? (
          <div className="viewer-tabs" role="tablist">
            {files.map((f, i) => (
              <button key={f._id || i} role="tab" aria-selected={i === idx} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} title={f.originalName}>{f.originalName}</button>
            ))}
          </div>
        ) : <strong className="viewer-name" title={file.originalName}>{file.originalName}</strong>}
        <span className="spacer" />
        {file.size ? <span className="small muted">{fmtBytes(file.size)}</span> : null}
        <button className="btn btn-ghost btn-sm" onClick={download} title={t('Download')}><Download size={14} /> <span className="hide-sm">{t('Download')}</span></button>
        <button className="btn btn-ghost icon-btn" onClick={() => setFull((v) => !v)} aria-label={full ? t('Exit full screen') : t('Full screen')}>{full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
        {onClose && <button className="btn btn-ghost icon-btn" onClick={onClose} aria-label={t('Close viewer')}><X size={16} /></button>}
      </div>
      <div className="viewer-body" style={{ height: full ? undefined : height }}>
        {state.loading ? (
          <div style={{ padding: 24 }} role="status" aria-label={t('Loading file')}><Skeleton h={18} w="40%" /><div style={{ height: 14 }} /><Skeleton h={12} /><div style={{ height: 8 }} /><Skeleton h={12} /><div style={{ height: 8 }} /><Skeleton h={12} w="70%" /><div style={{ height: 20 }} /><Skeleton h={180} r={10} /></div>
        ) : state.error ? (
          <div style={{ padding: 16 }}><ErrorBox>{state.error}</ErrorBox></div>
        ) : state.kind === 'pdf' ? (
          <iframe title={file.originalName} src={state.url} className="viewer-frame" />
        ) : state.kind === 'image' ? (
          <div className="viewer-img"><img src={state.url} alt={file.originalName} /></div>
        ) : state.kind === 'html' ? (
          <iframe title={file.originalName} sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><style>${DOC_CSS}</style>${state.html || `<p><em>${t('This document is empty.')}</em></p>`}`} className="viewer-frame doc" />
        ) : state.kind === 'text' ? (
          csv ? (
            <div className="viewer-text"><table className="viewer-csv"><tbody>{csv.map((r, i) => <tr key={i}>{r.map((c, j) => (i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody></table>{csv.length > 500 && <p className="small muted">{t('Showing the first 500 rows — download for the rest.')}</p>}</div>
          ) : <pre className="viewer-text">{state.text}{state.truncated ? `\n\n[${t('…truncated — download for the full file')}]` : ''}</pre>
        ) : (
          <div className="viewer-none"><FileQuestion size={32} /><p>{t('This file type can’t be shown in the browser.')}</p><button className="btn btn-primary" onClick={download}><Download size={15} /> {t('Download {x}', { x: file.originalName })}</button></div>
        )}
      </div>
    </div>
  );
}

/** Same viewer in a modal (employees, resources). */
export function FileViewerModal({ open, onClose, ...props }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="viewer-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <FileViewer {...props} onClose={onClose} height="78vh" />
      </div>
    </div>
  );
}
