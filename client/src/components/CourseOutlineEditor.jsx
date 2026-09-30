import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Copy, Eye, EyeOff, GripVertical, ListChecks, Pencil, PlayCircle, Plus, Trash2, X,
} from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { ErrorBox } from './ui';

/**
 * Organise a course: drag (or use the arrow buttons) to reorder items and move them between milestones,
 * rename / add / reorder milestones, publish-unpublish, duplicate and delete.
 * Order + milestone changes are saved together with "Save changes"; publish, duplicate and delete apply immediately.
 */
const key = (it) => `${it.kind}:${it._id}`;

function buildState(course, assignments, quizzes) {
  const milestones = [...course.milestones].sort((a, b) => a.order - b.order).map((m) => ({ _id: m._id, title: m.title, weeks: m.weeks || '', weight: m.weight || 0 }));
  const items = [
    ...assignments.map((a) => ({ kind: 'assignment', _id: a._id, milestoneId: a.milestoneId, order: a.order ?? 0, code: a.code, title: a.title, isPublished: a.isPublished, type: a.kind })),
    ...quizzes.map((q) => ({ kind: 'quiz', _id: q._id, milestoneId: q.milestoneId, order: q.order ?? 0, code: 'Quiz', title: q.title, isPublished: q.isPublished, type: 'quiz' })),
  ];
  const lists = Object.fromEntries(milestones.map((m) => [m._id, items.filter((i) => i.milestoneId === m._id).sort((a, b) => a.order - b.order)]));
  return { milestones, lists };
}

export default function CourseOutlineEditor({ course, assignments, quizzes, onClose, onSaved }) {
  const initial = useMemo(() => buildState(course, assignments, quizzes), [course, assignments, quizzes]);
  const [milestones, setMilestones] = useState(initial.milestones);
  const [lists, setLists] = useState(initial.lists);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [drag, setDrag] = useState(null); // { from, index }
  const [over, setOver] = useState(null); // { to, index }
  const [confirm, setConfirm] = useState(null);

  const touch = () => { setDirty(true); setOk(''); };

  const move = (from, index, to, toIndex) => {
    setLists((ls) => {
      const next = { ...ls, [from]: [...ls[from]] };
      const [it] = next[from].splice(index, 1);
      if (from !== to) next[to] = [...ls[to]];
      const at = Math.max(0, Math.min(toIndex, next[to].length));
      next[to].splice(at, 0, { ...it, milestoneId: to });
      return next;
    });
    touch();
  };
  const step = (mid, i, d) => {
    const mi = milestones.findIndex((m) => m._id === mid);
    const list = lists[mid];
    if (i + d >= 0 && i + d < list.length) return move(mid, i, mid, i + d);
    // Past the edge: hop into the previous / next milestone
    const target = milestones[mi + d];
    if (target) move(mid, i, target._id, d < 0 ? lists[target._id].length : 0);
  };

  const patchItem = (mid, id, patch) => setLists((ls) => ({ ...ls, [mid]: ls[mid].map((x) => (x._id === id ? { ...x, ...patch } : x)) }));

  const togglePublish = async (mid, it) => {
    setErr('');
    try {
      await api.patch(it.kind === 'quiz' ? `/quizzes/${it._id}` : `/assignments/${it._id}`, { isPublished: !it.isPublished });
      patchItem(mid, it._id, { isPublished: !it.isPublished });
    } catch (e) { setErr(errorMessage(e)); }
  };

  const duplicate = async (mid, i, it) => {
    setErr('');
    try {
      const { data } = await api.post(`/assignments/${it._id}/duplicate`);
      const a = data.assignment;
      setLists((ls) => {
        const l = [...ls[mid]];
        l.splice(i + 1, 0, { kind: 'assignment', _id: a._id, milestoneId: mid, order: a.order, code: a.code, title: a.title, isPublished: false, type: a.kind });
        return { ...ls, [mid]: l };
      });
      touch(); // the copy's position is saved with the rest
      setOk(`Created ${a.code} (unpublished). Edit it to change the code and content.`);
    } catch (e) { setErr(errorMessage(e)); }
  };

  const doDelete = async () => {
    const { mid, it } = confirm;
    setErr('');
    try {
      await api.delete(it.kind === 'quiz' ? `/quizzes/${it._id}` : `/assignments/${it._id}`);
      setLists((ls) => ({ ...ls, [mid]: ls[mid].filter((x) => x._id !== it._id) }));
      setConfirm(null);
      setOk(`${it.code} deleted.`);
    } catch (e) {
      setConfirm((c) => ({ ...c, error: errorMessage(e) }));
    }
  };

  /* Milestones */
  const setMs = (i, patch) => { setMilestones((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m))); touch(); };
  const moveMs = (i, d) => { setMilestones((ms) => { const n = [...ms]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; }); touch(); };
  const addMs = () => {
    const tmp = `new-${Date.now()}`;
    setMilestones((ms) => [...ms, { _id: tmp, title: `Milestone ${ms.length + 1}`, weeks: '', weight: 0, isNew: true }]);
    setLists((ls) => ({ ...ls, [tmp]: [] }));
    touch();
  };
  const removeMs = (i) => {
    const m = milestones[i];
    setMilestones((ms) => ms.filter((_, j) => j !== i));
    setLists(({ [m._id]: _gone, ...rest }) => rest);
    touch();
  };

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      // 1) milestones (new ones get real ids from the server)
      const payload = milestones.map((m, i) => ({ ...(m.isNew ? {} : { _id: m._id }), title: m.title.trim() || `Milestone ${i + 1}`, weeks: m.weeks || undefined, weight: Number(m.weight) || 0, order: i }));
      const { data } = await api.patch(`/courses/${course._id}`, { milestones: payload });
      const saved = [...data.course.milestones].sort((a, b) => a.order - b.order);
      const idFor = Object.fromEntries(milestones.map((m, i) => [m._id, saved[i]._id]));
      // 2) every item's milestone + position (order is spaced so later inserts fit)
      const items = milestones.flatMap((m) => (lists[m._id] || []).map((it, i) => ({ kind: it.kind, id: it._id, milestoneId: idFor[m._id], order: (i + 1) * 10 })));
      if (items.length) await api.put(`/courses/${course._id}/outline`, { items });
      setDirty(false);
      onSaved();
    } catch (e) {
      setErr(errorMessage(e, 'Could not save the outline.'));
    } finally {
      setBusy(false);
    }
  };

  const onDragStart = (from, index) => (e) => { setDrag({ from, index }); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); };
  const onDragOverRow = (to, index) => (e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver({ to, index: e.clientY > r.top + r.height / 2 ? index + 1 : index }); };
  const onDragOverList = (to) => (e) => { if (!drag) return; e.preventDefault(); if (!lists[to].length) setOver({ to, index: 0 }); };
  const onDrop = (e) => {
    e.preventDefault();
    if (drag && over) {
      let idx = over.index;
      if (drag.from === over.to && drag.index < idx) idx -= 1;
      if (!(drag.from === over.to && drag.index === idx)) move(drag.from, drag.index, over.to, idx);
    }
    setDrag(null); setOver(null);
  };
  const empty = milestones.some((m) => !(lists[m._id] || []).length);

  return (
    <div className="outline-editor">
      <div className="outline-bar card">
        <div>
          <strong>Organise course</strong>
          <p className="small muted" style={{ margin: 0 }}>Drag items (or use the arrows) to reorder them or move them to another milestone. Publishing, duplicating and deleting apply straight away.</p>
        </div>
        <span className="spacer" />
        <button className="btn" onClick={() => (dirty ? setConfirm({ leave: true }) : onClose())}><X size={15} /> {dirty ? 'Discard' : 'Done'}</button>
        <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>{busy ? <><span className="spin-dot" /> Saving…</> : 'Save changes'}</button>
      </div>
      <ErrorBox>{err}</ErrorBox>
      {ok && <div className="alert alert-ok" role="status">{ok}</div>}

      {milestones.map((m, mi) => {
        const list = lists[m._id] || [];
        return (
          <section className="outline-ms" key={m._id} onDragOver={onDragOverList(m._id)} onDrop={onDrop}>
            <div className="outline-ms-head">
              <span className="ms-num">{mi + 1}</span>
              <input className="input ms-title" aria-label={`Milestone ${mi + 1} title`} value={m.title} maxLength={200} onChange={(e) => setMs(mi, { title: e.target.value })} />
              <input className="input ms-weeks" aria-label="Weeks" placeholder="Weeks 1–2" value={m.weeks} maxLength={40} onChange={(e) => setMs(mi, { weeks: e.target.value })} />
              <button className="btn btn-ghost icon-btn" disabled={mi === 0} aria-label="Move milestone up" onClick={() => moveMs(mi, -1)}><ArrowUp size={15} /></button>
              <button className="btn btn-ghost icon-btn" disabled={mi === milestones.length - 1} aria-label="Move milestone down" onClick={() => moveMs(mi, 1)}><ArrowDown size={15} /></button>
              <button className="btn btn-ghost icon-btn" disabled={list.length > 0} title={list.length ? 'Move or delete its items first' : 'Remove milestone'} aria-label="Remove milestone" onClick={() => removeMs(mi)}><Trash2 size={15} /></button>
            </div>
            <ul className="outline-list">
              {list.map((it, i) => (
                <li
                  key={key(it)}
                  className={`outline-item ${drag && drag.from === m._id && drag.index === i ? 'dragging' : ''} ${over && over.to === m._id && over.index === i ? 'drop-before' : ''} ${over && over.to === m._id && over.index === i + 1 && i === list.length - 1 ? 'drop-after' : ''}`}
                  draggable
                  onDragStart={onDragStart(m._id, i)}
                  onDragOver={onDragOverRow(m._id, i)}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                >
                  <span className="grip" aria-hidden><GripVertical size={16} /></span>
                  <span className={`item-code ${it.type === 'lesson' ? 'lesson' : it.kind === 'quiz' ? 'quiz' : ''}`}>
                    {it.kind === 'quiz' ? <><ListChecks size={12} /> Quiz</> : it.type === 'lesson' ? <><PlayCircle size={12} /> Lesson</> : it.code}
                  </span>
                  <span className="item-title">{it.title}</span>
                  <select className="select move-to" aria-label={`Move ${it.code} to milestone`} value={m._id} onChange={(e) => move(m._id, i, e.target.value, (lists[e.target.value] || []).length)}>
                    {milestones.map((x, xi) => <option key={x._id} value={x._id}>M{xi + 1}: {x.title.slice(0, 28)}</option>)}
                  </select>
                  <span className="outline-actions">
                    <button className="btn btn-ghost icon-btn" aria-label="Move up" disabled={mi === 0 && i === 0} onClick={() => step(m._id, i, -1)}><ArrowUp size={15} /></button>
                    <button className="btn btn-ghost icon-btn" aria-label="Move down" disabled={mi === milestones.length - 1 && i === list.length - 1} onClick={() => step(m._id, i, 1)}><ArrowDown size={15} /></button>
                    <button className={`btn btn-sm pub-toggle ${it.isPublished ? 'on' : ''}`} onClick={() => togglePublish(m._id, it)} title={it.isPublished ? 'Visible to employees — click to hide' : 'Hidden (draft) — click to publish'}>
                      {it.isPublished ? <><Eye size={14} /> Published</> : <><EyeOff size={14} /> Draft</>}
                    </button>
                    <Link className="btn btn-ghost icon-btn" to={it.kind === 'quiz' ? `/quizzes/${it._id}/edit` : `/assignments/${it._id}/edit`} aria-label={`Edit ${it.code}`} title="Edit"><Pencil size={15} /></Link>
                    {it.kind === 'assignment' ? <button className="btn btn-ghost icon-btn" aria-label={`Duplicate ${it.code}`} title="Duplicate" onClick={() => duplicate(m._id, i, it)}><Copy size={15} /></button> : <span className="icon-spacer" aria-hidden />}
                    <button className="btn btn-ghost icon-btn danger-hover" aria-label={`Delete ${it.code}`} title="Delete" onClick={() => setConfirm({ mid: m._id, it })}><Trash2 size={15} /></button>
                  </span>
                </li>
              ))}
              {!list.length && <li className={`outline-empty ${over && over.to === m._id ? 'drop-before' : ''}`}>Drop items here</li>}
            </ul>
          </section>
        );
      })}
      <button className="btn" onClick={addMs}><Plus size={15} /> Add milestone</button>
      {empty && <p className="small muted" style={{ marginTop: 8 }}>Empty milestones are kept — remove them with the bin icon if you don’t need them.</p>}

      {confirm && (
        <div className="modal-back" onClick={() => setConfirm(null)}>
          <div className="modal stack" role="dialog" aria-modal="true" aria-labelledby="cf-title" onClick={(e) => e.stopPropagation()}>
            {confirm.leave ? (
              <>
                <h2 id="cf-title">Discard changes?</h2>
                <p className="small">Your new order and milestone changes haven’t been saved.</p>
                <div className="row"><span className="spacer" /><button className="btn" onClick={() => setConfirm(null)}>Keep editing</button><button className="btn btn-danger" onClick={onClose}>Discard</button></div>
              </>
            ) : (
              <>
                <h2 id="cf-title">Delete {confirm.it.code}?</h2>
                <p className="small"><strong>{confirm.it.title}</strong> and its attached files will be removed permanently.</p>
                <p className="small muted">Items that already have submissions or quiz attempts can’t be deleted — unpublish them instead so employees’ grades are kept.</p>
                <ErrorBox>{confirm.error}</ErrorBox>
                <div className="row">
                  <span className="spacer" />
                  <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
                  {confirm.error && confirm.it.isPublished
                    ? <button className="btn btn-primary" onClick={async () => { await togglePublish(confirm.mid, confirm.it); setConfirm(null); }}><EyeOff size={14} /> Unpublish instead</button>
                    : <button className="btn btn-danger" disabled={Boolean(confirm.error)} onClick={doDelete}><Trash2 size={14} /> Delete</button>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
