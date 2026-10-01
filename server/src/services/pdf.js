const PdfPrinter = require('pdfmake');
const vfs = require('pdfmake/build/vfs_fonts');
const env = require('../config/env');

/**
 * PDF versions of the feedback sheet and the progress report.
 * PDFs are what customers and employees receive (read-only, official);
 * our staff can additionally download the editable Word versions.
 */
const font = (name) => Buffer.from(vfs[name], 'base64');
const printer = new PdfPrinter({
  Roboto: { normal: font('Roboto-Regular.ttf'), bold: font('Roboto-Medium.ttf'), italics: font('Roboto-Italic.ttf'), bolditalics: font('Roboto-MediumItalic.ttf') },
});

const ACCENT = `#${env.REPORT_ACCENT}`;
const INK = '#1F2937';
const MUTED = '#6B7280';
const HEAD = '#F3F4F6';
const LINE = '#D1D5DB';
const TRACK = '#E5E7EB';
const W = 515; // A4 content width in pt with 40pt margins

const fmtDate = (d, time = false) =>
  d ? new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', ...(time ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}) }) : '';

const grid = {
  hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => LINE, vLineColor: () => LINE,
  paddingLeft: () => 7, paddingRight: () => 7, paddingTop: () => 5, paddingBottom: () => 5,
};

function toBuffer(docDefinition) {
  return new Promise((resolve, reject) => {
    const doc = printer.createPdfKitDocument({
      pageSize: 'A4',
      pageMargins: [40, 48, 40, 56],
      defaultStyle: { font: 'Roboto', fontSize: 9.5, color: INK, lineHeight: 1.25 },
      // Never leave a section heading alone at the bottom of a page
      pageBreakBefore: (node, followingNodesOnPage) => node.headlineLevel === 1 && followingNodesOnPage.length < 6,
      ...docDefinition,
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Bold any "85/100" in a sentence */
function rich(text) {
  return String(text || '')
    .split(/(\d+(?:\.\d+)?\s*\/\s*100)/)
    .filter(Boolean)
    .map((p) => (/\/\s*100/.test(p) ? { text: p, bold: true } : p));
}

const table = (headers, rows, widths, opts = {}) => ({
  table: {
    keepWithHeaderRows: 1,
    headerRows: 1,
    widths,
    dontBreakRows: true,
    body: [headers.map((h) => ({ text: h, bold: true, fillColor: HEAD })), ...rows.map((r) => r.map((c, i) => (typeof c === 'object' ? c : { text: String(c ?? ''), bold: opts.boldFirst && i === 0 })))],
  },
  layout: grid,
  margin: [0, 0, 0, 8],
});

const kv = (rows) => ({
  table: { widths: [130, '*'], body: rows.filter(([, v]) => v).map(([k, v]) => [{ text: k, bold: true, fillColor: HEAD }, String(v)]) },
  layout: grid,
  margin: [0, 0, 0, 8],
});

/* ============================ Feedback sheet ============================ */
async function buildFeedbackPdf({ submission: s, feedback: f }) {
  const a = s.assignment;
  const max = a.maxScore || 100;
  const pts = (c) => Math.round(((c.score || 0) * c.weight) / 100 * (max / 100) * 10) / 10;
  const content = [
    { text: `${a.code} Feedback — ${s.student.name}`, fontSize: 18, bold: true },
    { text: fmtDate(f.reviewedAt || new Date()), color: MUTED, margin: [0, 2, 0, 14] },
    { text: 'Overview', style: 'h2', headlineLevel: 1 },
    { text: rich(f.overview || `${s.student.name}'s ${a.code} submission earned ${f.totalScore}/${max}.`), margin: [0, 0, 0, 8] },
    table(['Field', 'Detail'], [
      ['Assignment', `${a.code}: ${a.title}`],
      ['Course', s.course?.title || ''],
      ['Student', `${s.student.name} (${s.student.email})`],
      ['Submission', `${s.files.map((x) => x.originalName).join(', ')}, ${fmtDate(s.createdAt, true)}`],
      ['Grade', { text: `${f.totalScore} / ${max}`, bold: true }],
    ], [130, '*']),
  ];
  if (f.strengths?.length) content.push({ text: 'Strengths', style: 'h2', headlineLevel: 1 }, table(['Task', 'What stood out'], f.strengths.map((x) => [x.task, x.detail]), [170, '*']));
  if (f.improvements?.length) content.push({ text: 'Areas to Tighten Up', style: 'h2', headlineLevel: 1 }, table(['Task', 'Issue', 'Suggestion'], f.improvements.map((x) => [x.task, x.issue, x.suggestion]), [120, '*', '*']));
  content.push(
    { text: 'Grading Breakdown', style: 'h2', headlineLevel: 1 },
    table(
      ['Criterion', 'Weight', 'Score', 'Notes'],
      [...(f.criteria || []).map((c) => [c.criterion, `${c.weight}%`, `${pts(c)}`, c.comment || '']), [{ text: 'Total', bold: true }, { text: '100%', bold: true }, { text: `${f.totalScore} / ${max}`, bold: true }, '']],
      [170, 45, 55, '*']
    )
  );
  if (f.closing) content.push({ text: rich(f.closing), margin: [0, 8, 0, 0] });

  return toBuffer({
    info: { title: `${a.code} Feedback — ${s.student.name}`, author: env.ORG_NAME },
    content,
    styles: { h2: { fontSize: 12.5, bold: true, margin: [0, 12, 0, 6] } },
    footer: (page, count) => ({ text: `${env.ORG_NAME} · ${a.code} feedback · ${page}/${count}`, alignment: 'center', color: MUTED, fontSize: 8, margin: [0, 20, 0, 0] }),
  });
}

/* ============================ Progress report ============================ */
function barRow(label, pct, valueLabel) {
  const barW = 230;
  const filled = Math.max(0, Math.min(barW, (barW * (pct || 0)) / 100));
  return [
    { text: label, fontSize: 9 },
    {
      canvas: [
        { type: 'rect', x: 0, y: 3, w: barW, h: 8, r: 4, color: TRACK },
        ...(filled > 0 ? [{ type: 'rect', x: 0, y: 3, w: Math.max(filled, 8), h: 8, r: 4, color: ACCENT }] : []),
      ],
    },
    { text: valueLabel ?? (pct ? `${pct}%` : 'Not started'), alignment: 'right', bold: Boolean(pct), color: pct ? INK : MUTED, fontSize: 9 },
  ];
}
const bars = (title, rows) => [
  { text: title, bold: true, margin: [0, 6, 0, 4] },
  { table: { widths: [180, 240, '*'], dontBreakRows: true, body: rows.map((r) => barRow(r.label, r.pct, r.valueLabel)) }, layout: { ...grid, hLineWidth: () => 0, vLineWidth: () => 0, paddingTop: () => 3, paddingBottom: () => 3 }, margin: [0, 0, 0, 8] },
];
const h = (t) => ({ headlineLevel: 1, stack: [{ text: t.toUpperCase(), bold: true, fontSize: 11.5, color: ACCENT }, { canvas: [{ type: 'line', x1: 0, y1: 2, x2: W, y2: 2, lineWidth: 1, lineColor: ACCENT }] }], margin: [0, 14, 0, 8] });
const ul = (items) => ({ ul: items.filter((x) => x && String(x.text ?? x).trim()), margin: [0, 0, 0, 6] });

async function buildProgressReportPdf(d, n) {
  const first = d.student.name.split(' ')[0];
  const cm = d.progress.currentMilestone;
  const sec = d.jdRows.length ? 5 : 4;
  const content = [
    { text: d.org.toUpperCase(), bold: true, color: ACCENT },
    { text: 'CONFIDENTIAL — ON-THE-JOB TRAINING PROGRESS REPORT', bold: true, color: MUTED, fontSize: 9, margin: [0, 8, 0, 2] },
    { text: d.course.title, fontSize: 20, bold: true },
    { text: 'Employee Progress & Skills Alignment Review', color: MUTED, fontSize: 11, margin: [0, 2, 0, 12] },
    kv([
      ['Prepared For', n.preparedFor || d.company.name],
      ['Employee', [d.student.name, d.student.jobTitle].filter(Boolean).join(' — ')],
      ['Programme', `${d.course.title} (${d.course.code})`],
      ['Certification Target', d.course.certificationTarget],
      ['Report Date', fmtDate(n.reportDate || d.reportDate)],
      ['Prepared By', `${d.org} — Training & Assessment Team`],
    ]),
    h('1. Executive summary'),
    ...String(n.executiveSummary || '').split(/\n\s*\n/).filter(Boolean).map((p) => ({ text: p.trim(), margin: [0, 0, 0, 6] })),
    h('2. Employee & programme overview'),
    kv([
      ['Employee Name', d.student.name], ['Job Title', d.student.jobTitle], ['Department', d.student.department], ['Company', d.company.name],
      ['Programme', `${d.course.title} (${d.course.code})`], ['Certification Included', d.course.certificationTarget],
      ['Enrolled', fmtDate(d.enrollment.enrolledAt)], ['Complete By', fmtDate(d.enrollment.dueAt)],
      ['Assessor(s) of Record', d.assessors.length ? `${d.assessors.join(', ')}, ${d.org} Training & Assessment Team` : `${d.org} Training & Assessment Team`],
    ]),
    h('3. Programme progress'),
    { text: [{ text: `${d.progress.pct}%`, fontSize: 22, bold: true, color: ACCENT }, { text: `   programme complete — ${d.progress.completed} of ${d.progress.total} gradable items`, color: MUTED }], margin: [0, 0, 0, 6] },
    ...bars('Milestone completion progress', d.progress.milestones.map((m) => ({ label: m.title, pct: m.pct }))),
    {
      text: [{ text: 'Reading the data: ', bold: true }, `${first} has completed ${d.progress.pct}% of the programme so far${cm ? `, with ${cm.title} at ${cm.pct}% complete` : ''}.` + (d.progress.nextItems.length ? ` The next items in sequence are ${d.progress.nextItems.map((i) => (i.kind === 'quiz' ? i.title : i.code)).join(', ')}.` : '')],
      margin: [0, 2, 0, 4],
    },
  ];
  if (d.jdRows.length) {
    content.push(
      h('4. Alignment with the job description'),
      { text: 'Each assignment is mapped to a requirement in the target job description. The table shows where graded evidence already exists and what is scheduled next.', margin: [0, 0, 0, 6] },
      table(['Job Description Requirement', 'Practical Activity', 'Status'], d.jdRows.map((r) => [r.requirement, r.activity, { text: r.status, bold: r.demonstrated }]), ['*', '*', 110])
    );
  }
  content.push(h(`${sec}. Skillset demonstrated to date`));
  if (d.graded.length) {
    content.push(
      table(['Code', 'Skill / Competency Demonstrated', 'Grade', 'Assessor Evidence'],
        d.graded.map((g) => [{ text: g.code, bold: true }, { stack: [g.title, ...(g.skills?.length ? [{ text: `Skills: ${g.skills.slice(0, 4).join(', ')}`, color: MUTED, fontSize: 8.5 }] : [])] }, { text: `${g.score} / ${g.maxScore}`, bold: true }, g.evidence]),
        [50, 150, 50, '*']),
      ...bars('Graded deliverables — quality of work', d.graded.map((g) => ({ label: `${g.code} — ${g.title}`, pct: Math.round((g.score / g.maxScore) * 100), valueLabel: `${g.score}/${g.maxScore}` })))
    );
  } else content.push({ text: 'No deliverables have been graded yet. This section will populate as the assessor approves submissions.' });
  if (d.quizzes.length) content.push({ text: 'Knowledge checks', bold: true, margin: [0, 4, 0, 4] }, table(['Quiz', 'Best score', 'Result'], d.quizzes.map((q) => [q.title, `${q.score}%`, q.passed ? 'Passed' : 'Not yet passed']), ['*', 70, 90]));

  content.push(h(`${sec + 1}. Performance highlights & development focus`));
  if (d.strengths.length) content.push({ text: 'Strengths observed', bold: true, margin: [0, 0, 0, 4] }, ul(d.strengths.map((s) => ({ text: [{ text: `${s.code}: `, bold: true }, s.text] }))));
  if (d.assessorQuote) {
    content.push({
      unbreakable: true,
      table: { widths: ['*'], body: [[{
        stack: [
          { text: `Assessor comment — ${d.assessorQuote.code} (${d.assessorQuote.score}/100)`, bold: true, margin: [0, 0, 0, 4] },
          { text: `“${d.assessorQuote.text}”`, italics: true, margin: [0, 0, 0, 4] },
          { text: `— ${d.assessorQuote.by}, ${d.org} Training & Assessment Team`, color: MUTED, fontSize: 8.5 },
        ],
        fillColor: '#FAFAFA',
      }]] },
      layout: { hLineWidth: () => 0, vLineWidth: (i) => (i === 0 ? 3 : 0), vLineColor: () => ACCENT, paddingLeft: () => 12, paddingRight: () => 12, paddingTop: () => 9, paddingBottom: () => 9 },
      margin: [0, 4, 0, 8],
    });
  }
  if (d.development.length) content.push({ text: 'Development focus', bold: true, margin: [0, 2, 0, 4] }, ul(d.development.map((x) => ({ text: [{ text: `${x.code} — ${x.task}: `, bold: true }, `${x.issue} Coaching note: ${x.suggestion}`] }))));

  content.push(h(`${sec + 2}. Business value assessment`), ul(n.businessValue || []));
  if (n.recommendation) content.push({ text: [{ text: 'Recommendation: ', bold: true }, n.recommendation], margin: [0, 2, 0, 4] });
  content.push(h(`${sec + 3}. Next steps & reporting cadence`), ul(n.nextSteps || []));

  return toBuffer({
    info: { title: `${d.student.name} — Progress Report`, author: d.org },
    content,
    footer: (page, count) => ({ text: `${d.org} · Confidential · Page ${page} of ${count}`, alignment: 'center', color: MUTED, fontSize: 8, margin: [0, 20, 0, 0] }),
  });
}

/** Course completion certificate (A4 landscape) with a QR code to the public verification page. */
async function buildCertificatePdf(c, opts) {
  try {
    return await certificateDoc(c, opts);
  } catch (e) {
    if (opts.logo && /image/i.test(e.message)) return certificateDoc(c, { ...opts, logo: null }); // a broken logo must never block the certificate
    throw e;
  }
}
async function certificateDoc(c, { logo, accent, verifyUrl }) {
  const A = accent || ACCENT;
  const PW = 842; const PH = 595;
  return toBuffer({
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [70, 60, 70, 60],
    info: { title: `Certificate ${c.number}`, author: env.ORG_NAME },
    background: () => ({
      canvas: [
        { type: 'rect', x: 18, y: 18, w: PW - 36, h: PH - 36, lineWidth: 3, lineColor: A },
        { type: 'rect', x: 28, y: 28, w: PW - 56, h: PH - 56, lineWidth: 0.75, lineColor: LINE },
      ],
    }),
    content: [
      {
        columns: [
          { text: env.ORG_NAME.toUpperCase(), bold: true, fontSize: 11, color: A, characterSpacing: 2, margin: [0, 6, 0, 0] },
          logo ? { image: logo, fit: [130, 46], alignment: 'right' } : { text: c.companyName || '', alignment: 'right', color: MUTED, margin: [0, 6, 0, 0] },
        ],
      },
      { text: 'CERTIFICATE OF COMPLETION', alignment: 'center', fontSize: 26, bold: true, characterSpacing: 3, margin: [0, 42, 0, 6] },
      { canvas: [{ type: 'line', x1: 260, y1: 0, x2: 442, y2: 0, lineWidth: 2, lineColor: A }], margin: [0, 0, 0, 22] },
      { text: 'This certifies that', alignment: 'center', color: MUTED, fontSize: 12 },
      { text: c.studentName, alignment: 'center', fontSize: 32, bold: true, margin: [0, 8, 0, 8] },
      { text: 'has successfully completed the hands-on training programme', alignment: 'center', color: MUTED, fontSize: 12 },
      { text: c.courseTitle, alignment: 'center', fontSize: 18, bold: true, margin: [0, 8, 0, 2] },
      c.certificationTarget ? { text: `Aligned to ${c.certificationTarget}`, alignment: 'center', color: MUTED, fontSize: 11 } : {},
      {
        margin: [0, 44, 0, 0],
        columns: [
          { width: '*', stack: [
            { text: fmtDate(c.issuedAt), bold: true, fontSize: 11 },
            { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 170, y2: 4, lineWidth: 0.5, lineColor: LINE }] },
            { text: 'Date of issue', color: MUTED, fontSize: 9, margin: [0, 4, 0, 0] },
          ] },
          { width: '*', alignment: 'center', stack: [
            { text: c.avgScore != null ? `${c.avgScore}%` : '—', bold: true, fontSize: 11, alignment: 'center' },
            { canvas: [{ type: 'line', x1: 30, y1: 4, x2: 200, y2: 4, lineWidth: 0.5, lineColor: LINE }] },
            { text: 'Average assessed grade', color: MUTED, fontSize: 9, margin: [0, 4, 0, 0], alignment: 'center' },
          ] },
          { width: 'auto', stack: [
            { qr: verifyUrl, fit: 74, foreground: INK },
          ] },
          { width: 150, stack: [
            { text: `No. ${c.number}`, bold: true, fontSize: 9, margin: [8, 8, 0, 0] },
            { text: 'Scan or visit to verify:', color: MUTED, fontSize: 8, margin: [8, 4, 0, 0] },
            { text: verifyUrl, color: MUTED, fontSize: 7, margin: [8, 2, 0, 0] },
          ] },
        ],
      },
    ],
  });
}

/** Team progress table (A4 landscape) for company admins / platform admin. */
async function buildTeamPdf(rows, opts) {
  try {
    return await teamDoc(rows, opts);
  } catch (e) {
    if (opts.logo && /image/i.test(e.message)) return teamDoc(rows, { ...opts, logo: null });
    throw e;
  }
}
async function teamDoc(rows, { title, logo, accent }) {
  const A = accent || ACCENT;
  const done = rows.filter((r) => r.status === 'Completed').length;
  const overdue = rows.filter((r) => r.status === 'Overdue').length;
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.pct, 0) / rows.length) : 0;
  const statusColor = { Completed: '#15803D', Overdue: '#B91C1C', 'In progress': INK, 'Not started': MUTED };
  return toBuffer({
    pageOrientation: 'landscape',
    pageMargins: [36, 40, 36, 44],
    info: { title, author: env.ORG_NAME },
    footer: (page, count) => ({ text: `${env.ORG_NAME} · ${title} · ${fmtDate(new Date())} · Page ${page} of ${count}`, alignment: 'center', color: MUTED, fontSize: 8, margin: [0, 16, 0, 0] }),
    content: [
      { columns: [{ text: title, fontSize: 18, bold: true }, logo ? { image: logo, fit: [120, 40], alignment: 'right' } : { text: '' }] },
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 770, y2: 4, lineWidth: 2, lineColor: A }], margin: [0, 2, 0, 10] },
      { text: `${rows.length} enrolment${rows.length === 1 ? '' : 's'} · average progress ${avg}% · ${done} completed · ${overdue} overdue`, color: MUTED, margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: ['*', 'auto', 'auto', 70, 'auto', 'auto', 'auto', 'auto'],
          body: [
            ['Employee', 'Course', 'Progress', '', 'Avg grade', 'Due', 'Status', 'Certificate'].map((h) => ({ text: h, bold: true, fillColor: HEAD })),
            ...rows.map((r) => [
              { stack: [{ text: r.name, bold: true }, { text: [r.jobTitle, r.department].filter(Boolean).join(' · ') || r.email, color: MUTED, fontSize: 8 }] },
              r.courseCode,
              `${r.pct}%`,
              { canvas: [{ type: 'rect', x: 0, y: 3, w: 66, h: 6, r: 3, color: TRACK }, { type: 'rect', x: 0, y: 3, w: Math.max(0.1, (66 * Math.min(100, r.pct)) / 100), h: 6, r: 3, color: A }] },
              r.avgScore != null ? `${r.avgScore}%` : '—',
              r.dueAt ? fmtDate(r.dueAt) : '—',
              { text: r.status, color: statusColor[r.status] || INK, bold: r.status !== 'Not started' },
              r.certificate || '—',
            ]),
          ],
        },
        layout: grid,
      },
    ],
  });
}

module.exports = { buildFeedbackPdf, buildProgressReportPdf, buildCertificatePdf, buildTeamPdf };
