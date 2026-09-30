const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  AlignmentType, LevelFormat, Footer, PageNumber, VerticalAlign,
} = require('docx');
const env = require('../config/env');

/**
 * Employee progress report (Word), modelled on the "On-the-job training progress report":
 * cover block → 1 Executive summary → 2 Overview → 3 Progress (with bar charts) → 4 JD alignment →
 * 5 Skills demonstrated → 6 Highlights & development → 7 Business value → 8 Next steps.
 * Charts are drawn as shaded table cells, so they stay crisp and editable in Word.
 */

const FONT = 'Calibri';
const INK = '1F2937';
const MUTED = '6B7280';
const ACCENT = env.REPORT_ACCENT;
const TRACK = 'E5E7EB';
const HEAD = 'F3F4F6';
const LINE = 'D1D5DB';
const W = 9360;

const b = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: b, bottom: b, left: b, right: b };
const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const noBorders = { top: none, bottom: none, left: none, right: none };

const run = (t, o = {}) => new TextRun({ text: String(t ?? ''), font: FONT, size: 21, color: INK, ...o });
const para = (t, o = {}) => new Paragraph({ spacing: { after: 140, line: 300 }, ...o, children: Array.isArray(t) ? t : [run(t)] });
const bullet = (t) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 80, line: 290 }, children: Array.isArray(t) ? t : [run(t)] });
const h = (t) =>
  new Paragraph({
    spacing: { before: 360, after: 160 },
    keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
    children: [run(t.toUpperCase(), { bold: true, size: 26, color: ACCENT })],
  });
const sub = (t) => new Paragraph({ spacing: { before: 200, after: 100 }, keepNext: true, children: [run(t, { bold: true, size: 23 })] });

function cell(content, width, { fill, bold, color, align, vAlign } = {}) {
  const children = (Array.isArray(content) ? content : [content]).flatMap((c) =>
    c instanceof Paragraph || c instanceof Table
      ? [c]
      : String(c ?? '').split('\n').map((line, i) => new Paragraph({ alignment: align, children: [run(line, { bold, color: i ? MUTED : color, size: i ? 18 : 20 })] }))
  );
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
    margins: { top: 90, bottom: 90, left: 130, right: 130 },
    verticalAlign: vAlign || VerticalAlign.CENTER,
    children,
  });
}

function widthsFor(ratios, total = W) {
  const sum = ratios.reduce((a, c) => a + c, 0);
  const w = ratios.map((r) => Math.round((r / sum) * total));
  w[w.length - 1] = total - w.slice(0, -1).reduce((a, c) => a + c, 0);
  return w;
}

/** Key/value table (label column shaded) */
function kvTable(rows) {
  const w = widthsFor([2.6, 6.4]);
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: w,
    rows: rows.filter(([, v]) => v).map(([k, v]) => new TableRow({ cantSplit: true, children: [cell(k, w[0], { fill: HEAD, bold: true }), cell(v, w[1])] })),
  });
}

function gridTable(headers, rows, ratios, { boldFirst = false } = {}) {
  const w = widthsFor(ratios);
  return new Table({
    width: { size: W, type: WidthType.DXA },
    columnWidths: w,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((x, i) => cell(x, w[i], { fill: HEAD, bold: true })) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, w[i], { bold: boldFirst && i === 0 })) })),
    ],
  });
}

/** A horizontal bar: nested 1-row table with a filled segment proportional to pct. */
function bar(pct, width) {
  const inner = width - 260;
  const filled = Math.max(0, Math.min(inner, Math.round((inner * pct) / 100)));
  const segs = [];
  if (filled > 0) segs.push(new TableCell({ width: { size: filled, type: WidthType.DXA }, borders: noBorders, shading: { type: ShadingType.CLEAR, color: 'auto', fill: ACCENT }, children: [new Paragraph({ children: [run(' ', { size: 12 })] })] }));
  if (inner - filled > 0) segs.push(new TableCell({ width: { size: inner - filled, type: WidthType.DXA }, borders: noBorders, shading: { type: ShadingType.CLEAR, color: 'auto', fill: TRACK }, children: [new Paragraph({ children: [run(' ', { size: 12 })] })] }));
  return new Table({ width: { size: inner, type: WidthType.DXA }, columnWidths: [filled, inner - filled].filter((x) => x > 0), borders: noBorders, rows: [new TableRow({ children: segs })] });
}

/** Chart as a table: label | bar | value */
function barChart(title, rows) {
  const w = widthsFor([3.4, 4.6, 1.4]);
  return [
    sub(title),
    new Table({
      width: { size: W, type: WidthType.DXA },
      columnWidths: w,
      rows: rows.map(
        (r) =>
          new TableRow({
            cantSplit: true,
            children: [
              cell(r.label, w[0], {}),
              cell([bar(r.pct, w[1])], w[1], {}),
              cell(r.valueLabel ?? (r.pct ? `${r.pct}%` : 'Not started'), w[2], { color: r.pct ? INK : MUTED, bold: Boolean(r.pct), align: AlignmentType.RIGHT }),
            ],
          })
      ),
    }),
  ];
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

async function buildProgressReportDocx(d, n) {
  const first = d.student.name.split(' ')[0];
  const cm = d.progress.currentMilestone;
  const kids = [];

  // Cover block
  kids.push(
    new Paragraph({ spacing: { after: 60 }, children: [run(d.org.toUpperCase(), { bold: true, size: 22, color: ACCENT })] }),
    new Paragraph({ spacing: { before: 120, after: 60 }, children: [run('CONFIDENTIAL — ON-THE-JOB TRAINING PROGRESS REPORT', { bold: true, size: 20, color: MUTED })] }),
    new Paragraph({ spacing: { after: 40 }, children: [run(d.course.title, { bold: true, size: 40 })] }),
    new Paragraph({ spacing: { after: 280 }, children: [run('Employee Progress & Skills Alignment Review', { size: 24, color: MUTED })] }),
    kvTable([
      ['Prepared For', n.preparedFor || d.company.name],
      ['Employee', [d.student.name, d.student.jobTitle].filter(Boolean).join(' — ')],
      ['Programme', `${d.course.title} (${d.course.code})`],
      ['Certification Target', d.course.certificationTarget],
      ['Report Date', fmtDate(d.reportDate)],
      ['Prepared By', `${d.org} — Training & Assessment Team`],
    ])
  );

  // 1. Executive summary
  kids.push(h('1. Executive summary'));
  for (const p of String(n.executiveSummary || '').split(/\n\s*\n/).filter(Boolean)) kids.push(para(p.trim()));

  // 2. Overview
  kids.push(
    h('2. Employee & programme overview'),
    kvTable([
      ['Employee Name', d.student.name],
      ['Job Title', d.student.jobTitle],
      ['Department', d.student.department],
      ['Company', d.company.name],
      ['Programme', `${d.course.title} (${d.course.code})`],
      ['Certification Included', d.course.certificationTarget],
      ['Enrolled', fmtDate(d.enrollment.enrolledAt)],
      ['Complete By', fmtDate(d.enrollment.dueAt)],
      ['Assessor(s) of Record', d.assessors.length ? `${d.assessors.join(', ')}, ${d.org} Training & Assessment Team` : `${d.org} Training & Assessment Team`],
    ])
  );

  // 3. Progress
  kids.push(
    h('3. Programme progress'),
    para([run(`${d.progress.pct}%`, { bold: true, size: 44, color: ACCENT }), run(`   programme complete — ${d.progress.completed} of ${d.progress.total} gradable items`, { color: MUTED })]),
    ...barChart('Overall programme progress', [{ label: 'All milestones', pct: d.progress.pct, valueLabel: `${d.progress.pct}%` }]),
    ...barChart('Milestone completion progress', d.progress.milestones.map((m) => ({ label: m.title, pct: m.pct }))),
    para([
      run('Reading the data: ', { bold: true }),
      run(
        `${first} has completed ${d.progress.pct}% of the programme so far${cm ? `, with ${cm.title} at ${cm.pct}% complete` : ''}.` +
          (d.progress.nextItems.length ? ` The next items in sequence are ${d.progress.nextItems.map((i) => (i.kind === 'quiz' ? i.title : i.code)).join(', ')}.` : '')
      ),
    ], { spacing: { before: 200, after: 140, line: 300 } })
  );

  // 4. JD alignment
  if (d.jdRows.length) {
    kids.push(
      h('4. Alignment with the job description'),
      para('Each assignment is mapped to a requirement in the target job description. The table shows where graded evidence already exists and what is scheduled next.'),
      gridTable(['Job Description Requirement', 'Practical Activity', 'Status'], d.jdRows.map((r) => [r.requirement, r.activity, r.status]), [4, 3.4, 2])
    );
  }

  // 5. Skills demonstrated
  const sec = d.jdRows.length ? 5 : 4;
  kids.push(h(`${sec}. Skillset demonstrated to date`));
  if (d.graded.length) {
    kids.push(
      gridTable(
        ['Code', 'Skill / Competency Demonstrated', 'Grade', 'Assessor Evidence'],
        d.graded.map((g) => [g.code, [g.title, g.skills?.length ? `Skills: ${g.skills.slice(0, 4).join(', ')}` : ''].filter(Boolean).join('\n'), `${g.score} / ${g.maxScore}`, g.evidence]),
        [1.2, 3.2, 1.2, 3.8],
        { boldFirst: true }
      ),
      ...barChart('Graded deliverables — quality of work', d.graded.map((g) => ({ label: `${g.code} — ${g.title}`, pct: Math.round((g.score / g.maxScore) * 100), valueLabel: `${g.score}/${g.maxScore}` })))
    );
  } else {
    kids.push(para('No deliverables have been graded yet. This section will populate as the assessor approves submissions.'));
  }
  if (d.quizzes.length) {
    kids.push(sub('Knowledge checks'), gridTable(['Quiz', 'Best score', 'Result'], d.quizzes.map((q) => [q.title, `${q.score}%`, q.passed ? 'Passed' : 'Not yet passed']), [5, 2, 2]));
  }

  // 6. Highlights & development
  kids.push(h(`${sec + 1}. Performance highlights & development focus`));
  if (d.strengths.length) {
    kids.push(sub('Strengths observed'));
    for (const s of d.strengths) kids.push(bullet([run(`${s.code}: `, { bold: true }), run(s.text)]));
  }
  if (d.assessorQuote) {
    const w = [W];
    kids.push(
      new Paragraph({ spacing: { after: 100 }, children: [] }),
      new Table({
        width: { size: W, type: WidthType.DXA },
        columnWidths: w,
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: W, type: WidthType.DXA },
                borders: { top: none, bottom: none, right: none, left: { style: BorderStyle.SINGLE, size: 24, color: ACCENT } },
                shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'FAFAFA' },
                margins: { top: 160, bottom: 160, left: 240, right: 240 },
                children: [
                  new Paragraph({ spacing: { after: 80 }, children: [run(`Assessor comment — ${d.assessorQuote.code} (${d.assessorQuote.score}/100)`, { bold: true })] }),
                  new Paragraph({ spacing: { after: 80 }, children: [run(`“${d.assessorQuote.text}”`, { italics: true })] }),
                  new Paragraph({ children: [run(`— ${d.assessorQuote.by}, ${d.org} Training & Assessment Team`, { color: MUTED, size: 19 })] }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }
  if (d.development.length) {
    kids.push(sub('Development focus'));
    for (const x of d.development) kids.push(bullet([run(`${x.code} — ${x.task}: `, { bold: true }), run(`${x.issue} Coaching note: ${x.suggestion}`)]));
  }
  if (!d.strengths.length && !d.development.length && !d.assessorQuote) kids.push(para('Highlights will appear once graded feedback is available.'));

  // 7. Business value
  kids.push(h(`${sec + 2}. Business value assessment`));
  for (const x of n.businessValue || []) if (String(x).trim()) kids.push(bullet(String(x)));
  if (n.recommendation) kids.push(para([run('Recommendation: ', { bold: true }), run(n.recommendation)], { spacing: { before: 160, after: 140, line: 300 } }));

  // 8. Next steps
  kids.push(h(`${sec + 3}. Next steps & reporting cadence`));
  for (const x of n.nextSteps || []) if (String(x).trim()) kids.push(bullet(String(x)));

  const doc = new Document({
    creator: d.org,
    title: `${d.student.name} — Progress Report`,
    styles: { default: { document: { run: { font: FONT, size: 21, color: INK } } } },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1300, bottom: 1300, left: 1440, right: 1440 } } },
        footers: {
          default: new Footer({
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(`${d.org} · Confidential · Page `, { color: MUTED, size: 16 }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED })] })],
          }),
        },
        children: kids,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

const reportFileName = (d) => `${d.company.name || d.org} ${d.student.name} Progress Report.docx`.replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 150);

module.exports = { buildProgressReportDocx, reportFileName };
