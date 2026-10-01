import { api } from './client';

async function saveBlob(url, fallbackName) {
  const res = await api.get(url, { responseType: 'blob' });
  // Prefer the server's file name (Content-Disposition), fall back to ours
  const cd = res.headers['content-disposition'] || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Download a protected file (needs the Bearer token, so a plain <a href> won't work). */
export const downloadSubmissionFile = (submissionId, index, name) => saveBlob(`/submissions/${submissionId}/files/${index}`, name);

/** Download the feedback sheet as a Word document. */
export const downloadFeedbackDocx = (submissionId) => saveBlob(`/submissions/${submissionId}/feedback.docx`, 'Feedback.docx');

/** Download the approved feedback as a (read-only) PDF. */
export const downloadFeedbackPdf = (submissionId) => saveBlob(`/submissions/${submissionId}/feedback.pdf`, 'Feedback.pdf');

async function postBlob(url, body, fallbackName) {
  const res = await api.post(url, body, { responseType: 'blob' });
  const cd = res.headers['content-disposition'] || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = m ? decodeURIComponent(m[1]) : fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** Generate + download the employee progress report (POST so the edited narrative is included). Word = staff only. */
export const downloadProgressReport = (body) => postBlob('/reports/progress.docx', body, 'Progress Report.docx');
export const downloadProgressReportPdf = (body) => postBlob('/reports/progress.pdf', body, 'Progress Report.pdf');

/** Saved (shared) report snapshots */
export const downloadSavedReport = (id, format = 'pdf') => saveBlob(`/reports/saved/${id}.${format}`, `Progress Report.${format}`);

/** Download an instructor resource attached to an assignment. */
export const downloadAttachment = (assignmentId, fileId, name) => saveBlob(`/assignments/${assignmentId}/attachments/${fileId}`, name);

/**
 * POST multipart with upload progress + cancel.
 * onProgress({ loaded, total }); returns { promise, cancel }.
 */
export function uploadWithProgress(url, formData, onProgress) {
  const ctrl = new AbortController();
  const promise = api.post(url, formData, {
    signal: ctrl.signal,
    timeout: 0, // big files on slow links: no client-side timeout while bytes are flowing
    silent: true, // the progress bar replaces the global activity bar
    onUploadProgress: (e) => onProgress?.({ loaded: e.loaded, total: e.total || e.loaded }),
  });
  return { promise, cancel: () => ctrl.abort() };
}

/** Generic authenticated download (exports, certificates…) */
export const downloadFile = (url, fallbackName) => saveBlob(url, fallbackName);
