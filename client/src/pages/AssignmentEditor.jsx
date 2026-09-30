import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import AssignmentBrief from '../components/AssignmentBrief';
import { ErrorBox, PageSkeleton } from '../components/ui';
import { AttachmentManager } from '../components/Attachments';

const FILE_TYPES = ['docx', 'pdf', 'xlsx', 'pptx', 'png', 'jpg', 'zip', 'txt', 'csv', 'pcap'];
const KINDS = ['tip', 'hint', 'example', 'warning', 'note'];

const blank = (milestoneId, kind = 'report') => ({
  milestoneId,
  code: '',
  title: '',
  kind,
  videos: [],
  jdRequirement: '',
  order: 0,
  meta: { difficulty: 'Beginner', type: '', estimatedHours: '', platform: '', certifications: [] },
  scenario: { bullets: [''], callouts: [] },
  tasks: [{ title: 'Task 1', bullets: [''], callouts: [] }],
  deliverable: { bullets: [''], acceptedFileTypes: ['docx', 'pdf'], maxFiles: 3 },
  rubric: [{ criterion: '', weight: 100, guidance: '' }],
  professionalDevelopment: { linkedinSkills: [], cvAccomplishment: '' },
  isPublished: false,
  aiGrading: true,
});

/** Editable list of bullet strings */
function BulletList({ items, onChange, placeholder = 'Add a point…' }) {
  const set = (i, v) => onChange(items.map((x, j) => (j === i ? v : x)));
  return (
    <div className="list-edit">
      {items.map((b, i) => (
        <div className="line" key={i}>
          <textarea className="textarea" style={{ minHeight: 42 }} rows={1} value={b} placeholder={placeholder} onChange={(e) => set(i, e.target.value)} />
          <button type="button" className="btn btn-ghost icon-btn" aria-label="Remove point" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, ''])}><Plus size={14} /> Point</button>
    </div>
  );
}

function CalloutList({ items, onChange }) {
  const set = (i, patch) => onChange(items.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="stack">
      {items.map((c, i) => (
        <div key={i} className={`callout ${c.kind}`} style={{ marginTop: 0 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <select className="select" style={{ width: 'auto' }} value={c.kind} onChange={(e) => set(i, { kind: e.target.value })} aria-label="Callout type">
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Title" value={c.title || ''} onChange={(e) => set(i, { title: e.target.value })} />
            <button type="button" className="btn btn-ghost icon-btn" aria-label="Remove callout" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
          </div>
          <BulletList items={c.bullets} onChange={(bullets) => set(i, { bullets })} />
        </div>
      ))}
      <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, { kind: 'hint', title: '', bullets: [''] }])}>
        <Plus size={14} /> Tip / hint / example
      </button>
    </div>
  );
}

const clean = (arr) => arr.map((s) => s.trim()).filter(Boolean);

function toPayload(f) {
  const cleanCallouts = (cs) => cs.map((c) => ({ ...c, title: c.title || undefined, bullets: clean(c.bullets) }));
  return {
    ...f,
    meta: { ...f.meta, certifications: clean(f.meta.certifications) },
    scenario: { bullets: clean(f.scenario.bullets), callouts: cleanCallouts(f.scenario.callouts) },
    tasks: f.tasks.map((t) => ({ title: t.title, bullets: clean(t.bullets), callouts: cleanCallouts(t.callouts) })),
    deliverable: { ...f.deliverable, bullets: clean(f.deliverable.bullets) },
    rubric: f.rubric.filter((r) => r.criterion.trim()).map((r) => ({ _id: r._id, criterion: r.criterion, weight: Number(r.weight), guidance: r.guidance || undefined })),
    professionalDevelopment: { linkedinSkills: clean(f.professionalDevelopment.linkedinSkills), cvAccomplishment: f.professionalDevelopment.cvAccomplishment || undefined },
    videos: (f.videos || []).filter((v) => v.url?.trim()).map((v) => ({ url: v.url.trim(), title: v.title || undefined, note: v.note || undefined })),
    jdRequirement: f.jdRequirement || undefined,
    dueAt: f.dueAt || undefined,
  };
}

export default function AssignmentEditor() {
  const { courseId, id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [limits, setLimits] = useState(null);
  useEffect(() => { api.get('/settings/limits').then(({ data }) => setLimits(data.uploads)).catch(() => {}); }, []);

  useEffect(() => {
    if (id) {
      api.get(`/assignments/${id}`).then(({ data }) => {
        const a = data.assignment;
        setForm({
          ...blank(a.milestoneId),
          ...a,
          dueAt: a.dueAt ? a.dueAt.slice(0, 10) : '',
          professionalDevelopment: { linkedinSkills: [], cvAccomplishment: '', ...a.professionalDevelopment },
        });
      }).catch((e) => setError(errorMessage(e)));
    } else {
      const k = params.get('kind') === 'lesson' ? 'lesson' : 'report';
      const f = blank(params.get('milestone'), k);
      if (k === 'lesson') Object.assign(f, { tasks: [], rubric: [], deliverable: { ...f.deliverable, bullets: [] }, aiGrading: false });
      setForm(f);
    }
  }, [id, params]);

  const weightSum = useMemo(() => (form ? form.rubric.reduce((s, r) => s + Number(r.weight || 0), 0) : 0), [form]);
  if (!form) return (error ? <div className="page"><ErrorBox>{error}</ErrorBox></div> : <PageSkeleton variant="detail" />);

  const up = (patch) => setForm((f) => ({ ...f, ...patch }));
  const upIn = (key, patch) => setForm((f) => ({ ...f, [key]: { ...f[key], ...patch } }));
  const setTask = (i, patch) => up({ tasks: form.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const moveTask = (i, d) => {
    const t = [...form.tasks];
    [t[i], t[i + d]] = [t[i + d], t[i]];
    up({ tasks: t });
  };
  const setCrit = (i, patch) => up({ rubric: form.rubric.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = toPayload(form);
      const { _id, course, createdAt, updatedAt, __v, ...body } = payload;
      if (id) await api.patch(`/assignments/${id}`, body);
      else {
        const { data } = await api.post(`/courses/${courseId}/assignments`, body);
        return nav(`/assignments/${data.assignment._id}`);
      }
      nav(`/assignments/${id}`);
    } catch (err) {
      setError(errorMessage(err, 'Could not save.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <Link to={id ? `/assignments/${id}` : `/courses/${courseId}`} className="btn btn-ghost btn-sm" style={{ paddingInline: 0 }}><ArrowLeft size={15} /> Cancel</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <h1>{id ? 'Edit assignment' : 'New assignment'}</h1>
      </div>

      <div className="editor-layout">
        <form onSubmit={save} className="stack">
          <ErrorBox>{error}</ErrorBox>

          <div className="editor-block stack">
            <h3>Basics</h3>
            <div className="grid-form">
              <div className="field"><label htmlFor="code">Code</label><input id="code" className="input" required placeholder="SOC-03" value={form.code} onChange={(e) => up({ code: e.target.value })} /></div>
              <div className="field" style={{ gridColumn: 'span 2' }}><label htmlFor="title">Title</label><input id="title" className="input" required value={form.title} onChange={(e) => up({ title: e.target.value })} /></div>
              <div className="field"><label htmlFor="kind">Kind</label>
                <select id="kind" className="select" value={form.kind} onChange={(e) => up({ kind: e.target.value })}>
                  <option value="report">Report</option><option value="lab">Lab</option><option value="capstone">Capstone</option><option value="lesson">Lesson (video / reading — nothing to submit)</option>
                </select>
              </div>
              <div className="field"><label htmlFor="diff">Difficulty</label>
                <select id="diff" className="select" value={form.meta.difficulty} onChange={(e) => upIn('meta', { difficulty: e.target.value })}>
                  {['Beginner', 'Intermediate', 'Advanced'].map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="type">Type</label><input id="type" className="input" placeholder="Framework Design Document" value={form.meta.type} onChange={(e) => upIn('meta', { type: e.target.value })} /></div>
              <div className="field"><label htmlFor="hours">Hours</label><input id="hours" className="input" placeholder="5-6" value={form.meta.estimatedHours} onChange={(e) => upIn('meta', { estimatedHours: e.target.value })} /></div>
              <div className="field"><label htmlFor="platform">Platform (labs)</label><input id="platform" className="input" value={form.meta.platform || ''} onChange={(e) => upIn('meta', { platform: e.target.value })} /></div>
              <div className="field"><label htmlFor="order">Order</label><input id="order" type="number" min={0} className="input" value={form.order} onChange={(e) => up({ order: Number(e.target.value) })} /></div>
              <div className="field"><label htmlFor="due">Due date</label><input id="due" type="date" className="input" value={form.dueAt || ''} onChange={(e) => up({ dueAt: e.target.value })} /></div>
            </div>
            {form.kind !== 'lesson' && (
              <div className="field">
                <label htmlFor="jd">Job-description requirement this proves (for progress reports)</label>
                <input id="jd" className="input" placeholder="e.g. Monitor SIEM dashboards and alert queues for security events (JD §3.2)" value={form.jdRequirement || ''} onChange={(e) => up({ jdRequirement: e.target.value })} />
              </div>
            )}
            <div className="field"><label>Certification mapping</label><BulletList items={form.meta.certifications} onChange={(certifications) => upIn('meta', { certifications })} placeholder="CySA+ CS0-003 — Obj. 1.4" /></div>
          </div>

          <div className="editor-block stack">
            <h3>Videos</h3>
            <p className="small muted">Paste a YouTube, Vimeo, Loom or Google Drive link, or a direct .mp4 link. Videos appear at the top of the brief.</p>
            {(form.videos || []).map((v, i) => (
              <div key={i} className="fb-edit-row">
                <div className="fb-edit-fields">
                  <input className="input" placeholder="https://www.youtube.com/watch?v=…" aria-label="Video link" value={v.url} onChange={(e) => up({ videos: form.videos.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                  <input className="input" placeholder="Title (optional)" aria-label="Video title" value={v.title || ''} onChange={(e) => up({ videos: form.videos.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <input className="input" placeholder="Note, e.g. “Watch before Task 2” (optional)" aria-label="Video note" value={v.note || ''} onChange={(e) => up({ videos: form.videos.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
                </div>
                <button type="button" className="btn btn-ghost icon-btn" aria-label="Remove video" onClick={() => up({ videos: form.videos.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => up({ videos: [...(form.videos || []), { url: '', title: '', note: '' }] })}><Plus size={14} /> Video</button>
          </div>

          <div className="editor-block stack">
            <h3>Scenario</h3>
            <BulletList items={form.scenario.bullets} onChange={(bullets) => upIn('scenario', { bullets })} />
            <CalloutList items={form.scenario.callouts} onChange={(callouts) => upIn('scenario', { callouts })} />
          </div>

          <div className="editor-block stack">
            <h3>Tasks</h3>
            {form.tasks.map((t, i) => (
              <div key={i} className="card stack" style={{ padding: 'var(--sp-3)' }}>
                <div className="row">
                  <span className="task-num">{i + 1}</span>
                  <input className="input" style={{ flex: 1, minWidth: 180 }} value={t.title} aria-label={`Task ${i + 1} title`} onChange={(e) => setTask(i, { title: e.target.value })} />
                  <button type="button" className="btn btn-ghost icon-btn" disabled={i === 0} aria-label="Move up" onClick={() => moveTask(i, -1)}><ArrowUp size={15} /></button>
                  <button type="button" className="btn btn-ghost icon-btn" disabled={i === form.tasks.length - 1} aria-label="Move down" onClick={() => moveTask(i, 1)}><ArrowDown size={15} /></button>
                  <button type="button" className="btn btn-ghost icon-btn" aria-label="Delete task" onClick={() => up({ tasks: form.tasks.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                </div>
                <BulletList items={t.bullets} onChange={(bullets) => setTask(i, { bullets })} />
                <CalloutList items={t.callouts} onChange={(callouts) => setTask(i, { callouts })} />
              </div>
            ))}
            <button type="button" className="btn" onClick={() => up({ tasks: [...form.tasks, { title: `Task ${form.tasks.length + 1}`, bullets: [''], callouts: [] }] })}><Plus size={15} /> Add task</button>
          </div>

          <div className="editor-block stack">
            <h3>Deliverable</h3>
            <BulletList items={form.deliverable.bullets} onChange={(bullets) => upIn('deliverable', { bullets })} />
            <fieldset className="row" style={{ border: 0, padding: 0 }}>
              <legend className="small muted" style={{ marginBottom: 6 }}>Accepted file types</legend>
              {FILE_TYPES.map((t) => (
                <label key={t} className="chip" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={form.deliverable.acceptedFileTypes.includes(t)}
                    onChange={(e) => upIn('deliverable', { acceptedFileTypes: e.target.checked ? [...form.deliverable.acceptedFileTypes, t] : form.deliverable.acceptedFileTypes.filter((x) => x !== t) })}
                  /> .{t}
                </label>
              ))}
            </fieldset>
            <div className="grid-form">
              <div className="field"><label htmlFor="maxf">Max files</label><input id="maxf" type="number" min={1} max={10} className="input" value={form.deliverable.maxFiles} onChange={(e) => upIn('deliverable', { maxFiles: Number(e.target.value) })} /></div>
              <div className="field">
                <label htmlFor="maxmb">Max size per file (MB)</label>
                <input id="maxmb" type="number" min={1} max={limits?.maxUploadMB || 1024} className="input" placeholder={limits ? `Platform default: ${limits.submissionFileMB}` : 'Platform default'} value={form.deliverable.maxFileMB ?? ''} onChange={(e) => upIn('deliverable', { maxFileMB: e.target.value === '' ? null : Math.min(Number(e.target.value), limits?.maxUploadMB || 1024) })} />
                <span className="small muted">Leave empty to use the platform default{limits ? ` (${limits.submissionFileMB} MB; server maximum ${limits.maxUploadMB} MB)` : ''}.</span>
              </div>
            </div>
          </div>

          <div className="editor-block stack">
            <h3>Resources for employees</h3>
            <p className="small muted">Templates, sample logs, pcaps or reading material employees download from the assignment page. Uploaded straight away — no need to press Save.</p>
            <AttachmentManager assignmentId={id} attachments={form.attachments} limitMB={limits?.attachmentFileMB} onChange={(attachments) => up({ attachments })} />
          </div>

          <div className="editor-block stack">
            <div className="row">
              <h3>Grading criteria</h3>
              <span className="spacer" />
              <span className={`chip ${weightSum === 100 ? 'chip-ok' : 'chip-danger'}`}>Total {weightSum}%</span>
            </div>
            <p className="small muted">The AI grader scores each criterion against this rubric. Guidance is only visible to graders.</p>
            {form.rubric.map((r, i) => (
              <div key={i} className="card stack" style={{ padding: 'var(--sp-3)' }}>
                <div className="row">
                  <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="Criterion" value={r.criterion} onChange={(e) => setCrit(i, { criterion: e.target.value })} />
                  <input className="input" type="number" min={0} max={100} style={{ width: 90 }} aria-label="Weight %" value={r.weight} onChange={(e) => setCrit(i, { weight: e.target.value })} />
                  <span>%</span>
                  <button type="button" className="btn btn-ghost icon-btn" aria-label="Remove criterion" onClick={() => up({ rubric: form.rubric.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
                </div>
                <textarea className="textarea" style={{ minHeight: 60 }} placeholder="Grader guidance: what excellent vs weak work looks like (optional)" value={r.guidance || ''} onChange={(e) => setCrit(i, { guidance: e.target.value })} />
              </div>
            ))}
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => up({ rubric: [...form.rubric, { criterion: '', weight: 0, guidance: '' }] })}><Plus size={14} /> Criterion</button>
          </div>

          <div className="editor-block stack">
            <h3>Professional development</h3>
            <div className="field"><label>LinkedIn skills</label><BulletList items={form.professionalDevelopment.linkedinSkills} onChange={(linkedinSkills) => upIn('professionalDevelopment', { linkedinSkills })} placeholder="Alert Triage" /></div>
            <div className="field"><label htmlFor="cv">CV accomplishment</label><textarea id="cv" className="textarea" value={form.professionalDevelopment.cvAccomplishment || ''} onChange={(e) => upIn('professionalDevelopment', { cvAccomplishment: e.target.value })} /></div>
          </div>

          <div className="card row" style={{ position: 'sticky', bottom: 0, zIndex: 5 }}>
            <label className="row small"><input type="checkbox" checked={form.aiGrading} onChange={(e) => up({ aiGrading: e.target.checked })} /> AI draft grading</label>
            <label className="row small"><input type="checkbox" checked={form.isPublished} onChange={(e) => up({ isPublished: e.target.checked })} /> Visible to employees</label>
            <span className="spacer" />
            <button className="btn btn-primary" disabled={saving || (form.rubric.some((r) => r.criterion.trim()) && weightSum !== 100)}>{saving ? 'Saving…' : 'Save assignment'}</button>
          </div>
        </form>

        <div className="preview-pane card">
          <p className="small muted" style={{ marginBottom: 12 }}>Preview — what employees will see</p>
          <h2 style={{ marginBottom: 12 }}>{form.code && `${form.code}: `}{form.title || 'Untitled assignment'}</h2>
          <AssignmentBrief a={toPayload(form)} />
        </div>
      </div>
    </div>
  );
}
