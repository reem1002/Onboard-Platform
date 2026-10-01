/**
 * Deterministic checks that run before any AI. They never change a score on their own —
 * they become flags the instructor sees next to the draft.
 */
const STOP = new Set('the a an and or of to in on for with by from at as is are be this that these those your you it its into using use via per about task report write create describe explain include including each any all your their our'.split(' '));

const norm = (s = '') => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9؀-ۿ' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => norm(s).split(' ').filter(Boolean);
const keyTokens = (s) => [...new Set(words(s).filter((w) => w.length > 3 && !STOP.has(w)))];

/** 32-bit FNV-1a */
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Word 5-gram shingles → MinHash signature (64 ints). Compact enough to store on every submission. */
const PERMS = Array.from({ length: 64 }, (_, i) => [((i + 1) * 0x9e3779b1) >>> 0, ((i + 7) * 0x85ebca6b) >>> 0]);
function fingerprint(text) {
  const w = words(text);
  if (w.length < 30) return [];
  const shingles = new Set();
  for (let i = 0; i + 5 <= w.length; i += 1) shingles.add(hash(w.slice(i, i + 5).join(' ')));
  return PERMS.map(([a, b]) => {
    let min = 0xffffffff;
    for (const s of shingles) { const v = (Math.imul(s ^ a, 0x2c1b3c6d) + b) >>> 0; if (v < min) min = v; }
    return min;
  });
}
const similarity = (a, b) => (a?.length === 64 && b?.length === 64 ? a.filter((x, i) => x === b[i]).length / 64 : 0);

function shingleSet(text, n = 6) {
  const w = words(text);
  const s = new Set();
  for (let i = 0; i + n <= w.length; i += 1) s.add(w.slice(i, i + n).join(' '));
  return s;
}

const INJECTION = /(ignore|disregard) (all |any )?(the )?(previous|prior|above) (instructions|rules)|give (me|this|the student) (a |full )?(100|full marks|maximum)|you are (an? )?(ai|chatgpt|claude|language model|grader)|system prompt|as an ai language model/i;

/**
 * @returns {{ wordCount:number, fingerprint:number[], flags:{kind:string,severity:'info'|'warn'|'high',message:string}[], tasks:{title:string,covered:boolean}[] }}
 */
function runPrechecks({ assignment, text, peers = [] }) {
  const flags = [];
  const wc = words(text).length;
  if (wc < 60) flags.push({ kind: 'too_short', severity: 'high', message: `Only ${wc} readable words — the file may be empty, scanned or mostly images.` });
  if (/not machine-readable|Could not extract text/.test(text)) flags.push({ kind: 'unreadable_file', severity: 'warn', message: 'At least one file could not be read as text — open it in the viewer.' });
  if (/read with OCR/.test(text)) flags.push({ kind: 'ocr_used', severity: 'info', message: 'Some text was read from images or scanned pages (OCR). Numbers, IPs and code may contain OCR mistakes — check them against the file.' });
  if (/looks scanned or made of screenshots/.test(text)) flags.push({ kind: 'scanned_pdf', severity: 'warn', message: 'A PDF has almost no selectable text (scanned or screenshots) — the AI can only grade the text it can read.' });
  if (INJECTION.test(text)) flags.push({ kind: 'prompt_injection_attempt', severity: 'high', message: 'The submission contains text that tries to instruct the AI grader.' });

  // Did the student address each task? (task title keywords present in the text)
  const t = ` ${norm(text)} `;
  const tasks = (assignment.tasks || []).map((task) => {
    const keys = keyTokens(task.title);
    const hit = keys.filter((k) => t.includes(` ${k}`)).length;
    const bulletKeys = keyTokens((task.bullets || []).join(' ')).slice(0, 25);
    const bulletHit = bulletKeys.filter((k) => t.includes(` ${k}`)).length;
    // covered when most title words appear, or the student clearly worked through the task's bullet points
    return { title: task.title, covered: !keys.length || hit / keys.length >= 0.5 || (bulletKeys.length >= 4 && bulletHit / bulletKeys.length >= 0.5) };
  });
  const missing = tasks.filter((x) => !x.covered);
  if (missing.length) flags.push({ kind: 'tasks_possibly_missing', severity: 'warn', message: `No clear section for: ${missing.map((m) => m.title).join('; ')}` });

  // Mostly the brief pasted back?
  const briefText = [...(assignment.scenario?.bullets || []), ...(assignment.tasks || []).flatMap((x) => [x.title, ...(x.bullets || [])]), ...(assignment.deliverable?.bullets || [])].join(' ');
  const sub6 = shingleSet(text);
  if (sub6.size > 20) {
    const brief6 = shingleSet(briefText);
    let copied = 0;
    for (const s of sub6) if (brief6.has(s)) copied += 1;
    const ratio = copied / sub6.size;
    if (ratio > 0.35) flags.push({ kind: 'copied_from_brief', severity: 'warn', message: `About ${Math.round(ratio * 100)}% of the text repeats the assignment brief.` });
  }

  // Similar to another employee's submission for the same assignment?
  const fp = fingerprint(text);
  let best = null;
  for (const p of peers) {
    const s = similarity(fp, p.fingerprint);
    if (!best || s > best.s) best = { s, name: p.name };
  }
  if (best && best.s >= 0.5) flags.push({ kind: 'similar_to_peer', severity: best.s >= 0.75 ? 'high' : 'warn', message: `About ${Math.round(best.s * 100)}% similar to ${best.name}'s submission.` });

  return { wordCount: wc, fingerprint: fp, flags, tasks };
}

/** Is a quoted piece of evidence really in the submission? (whitespace/case-insensitive, tolerant of truncation) */
function quoteFound(quote, text) {
  const q = norm(quote);
  if (q.length < 12) return false;
  const t = norm(text);
  if (t.includes(q)) return true;
  // tolerate the model shortening or ending a quote early: accept a 60-char head or tail match
  return (q.length > 60 && (t.includes(q.slice(0, 60)) || t.includes(q.slice(-60))));
}

module.exports = { runPrechecks, fingerprint, similarity, quoteFound, norm, keyTokens, words };
