/** Human wording for the AI grader's automatic checks and flags (shared by the queue and the review page). */
export const CHECK_LABEL = {
  too_short: 'Very little text',
  unreadable_file: 'Unreadable file',
  scanned_pdf: 'Scanned PDF or screenshots',
  ocr_used: 'Text read from images (OCR)',
  prompt_injection_attempt: 'Tries to instruct the AI',
  tasks_possibly_missing: 'Tasks possibly missing',
  copied_from_brief: 'Copied from the brief',
  similar_to_peer: 'Similar to a colleague',
  truncated_for_ai: 'Long submission',
  long_submission: 'Long submission',
};

export const FLAG_LABEL = {
  unsupported_score: 'Score without evidence',
  quote_not_found: 'Invented quote removed',
  inconsistent_runs: 'AI runs disagreed',
  model_output_mismatch: 'AI answer incomplete',
  criterion_failed: 'Criterion left for you',
  feedback_not_written: 'Feedback text not written',
  ...CHECK_LABEL,
};

export const FLAG_HELP = {
  unsupported_score: 'A criterion scored 50%+ but the AI could not quote supporting text from the submission.',
  quote_not_found: 'The AI quoted text that is not in the submission. The quote was removed; check that criterion.',
  inconsistent_runs: 'Repeated AI runs disagreed by more than 15 points.',
  model_output_mismatch: 'The model skipped or renamed a rubric criterion — those scores need you.',
  criterion_failed: 'The model got stuck on a criterion (it is scored 0) — score it yourself.',
  feedback_not_written: 'The scores are drafted but the model could not write the feedback text — write the overview yourself.',
};

export const SEVERITY_RANK = { high: 3, warn: 2, info: 1 };

/** Arabic wording for the server's check messages (numbers and names are carried over). */
const AR_MSG = [
  [/^Only (\d+) readable words.*$/, 'فقط $1 كلمة مقروءة — قد يكون الملف فارغًا أو ممسوحًا ضوئيًا أو صورًا في الغالب.'],
  [/^At least one file could not be read as text.*$/, 'ملف واحد على الأقل لم يُقرأ كنص — افتحه في العارض.'],
  [/^A PDF has almost no selectable text.*$/, 'ملف PDF بلا نص قابل للتحديد تقريبًا (ممسوح أو صور) — يقيّم الذكاء الاصطناعي النص المقروء فقط.'],
  [/^Some text was read from images or scanned pages \(OCR\).*$/, 'قُرئ بعض النص من صور أو صفحات ممسوحة (OCR). قد تحتوي الأرقام وعناوين IP والأكواد على أخطاء — قارنها بالملف.'],
  [/^The submission contains text that tries to instruct the AI grader\.$/, 'يحتوي التسليم على نص يحاول توجيه المصحح الآلي.'],
  [/^No clear section for: (.+)$/, 'لا يوجد قسم واضح لـ: $1'],
  [/^About (\d+)% of the text repeats the assignment brief\.$/, 'حوالي $1% من النص يكرر وصف المهمة.'],
  [/^About (\d+)% similar to (.+)'s submission\.$/, 'مشابه بنسبة $1% تقريبًا لتسليم $2.'],
  [/^Long submission \((\d+)k characters\).*~(\d+)k characters\.$/, 'تسليم طويل ($1 ألف حرف) — قرأ الذكاء الاصطناعي لكل معيار أكثر ~$2 ألف حرف صلة.'],
];
export const localizeMessage = (msg, lang) => {
  if (lang !== 'ar' || !msg) return msg;
  for (const [re, out] of AR_MSG) if (re.test(msg)) return msg.replace(re, out);
  return msg;
};

/** All issues for a submission, worst first: deterministic checks + model flags that aren't already a check. */
export function aiIssues(sub) {
  const checks = (sub?.ai?.checks || []).map((c) => ({ kind: c.kind, severity: c.severity || 'warn', label: CHECK_LABEL[c.kind] || c.kind.replaceAll('_', ' '), message: c.message }));
  const seen = new Set(checks.map((c) => c.kind));
  const flags = (sub?.ai?.flags || [])
    .filter((f) => !seen.has(f))
    .map((f) => ({ kind: f, severity: f === 'unsupported_score' || f === 'model_output_mismatch' || f === 'criterion_failed' ? 'high' : 'warn', label: FLAG_LABEL[f] || f.replaceAll('_', ' '), message: FLAG_HELP[f] || '' }));
  return [...checks, ...flags].sort((a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0));
}

export const worstSeverity = (issues) => issues.find((i) => i.severity === 'high') ? 'high' : issues.find((i) => i.severity === 'warn') ? 'warn' : issues.length ? 'info' : null;
