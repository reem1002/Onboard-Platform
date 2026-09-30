const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType,
} = require('docx');

/**
 * Builds the student feedback sheet as a Word document, following the
 * instructor template: Overview → details table → Strengths → Areas to
 * Tighten Up → Grading Breakdown → closing line.
 */

const FONT = 'Calibri';
const INK = '1F2937';
const MUTED = '6B7280';
const HEAD_FILL = 'EEF2F7';
const LINE = 'D1D5DB';
const PAGE_W = 9360; // US Letter minus 1" margins, in DXA

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };

const run = (text, opts = {}) => new TextRun({ text: String(text ?? ''), font: FONT, size: 21, color: INK, ...opts });

/** Paragraph that bolds any "85/100"-style score inside the text */
function richParagraph(text, opts = {}) {
  const parts = String(text || '').split(/(\d+(?:\.\d+)?\s*\/\s*100)/);
  return new Paragraph({
    spacing: { after: 160, line: 300 },
    ...opts,
    children: parts.filter(Boolean).map((p) => run(p, /\/\s*100/.test(p) ? { bold: true } : {})),
  });
}

function cell(text, width, { header = false, bold = false } = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: HEAD_FILL } : undefined,
    margins: { top: 100, bottom: 100, left: 140, right: 140 },
    children: String(text ?? '')
      .split('\n')
      .map((line) => new Paragraph({ children: [run(line, { bold: header || bold, size: header ? 20 : 20 })] })),
  });
}

function table(headers, rows, ratios, boldLast = false) {
  const widths = ratios.map((r) => Math.round((r / ratios.reduce((a, b) => a + b, 0)) * PAGE_W));
  widths[widths.length - 1] = PAGE_W - widths.slice(0, -1).reduce((a, b) => a + b, 0); // exact sum
  return new Table({
    width: { size: PAGE_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { header: true })) }),
      ...rows.map(
        (r, ri) => new TableRow({ children: r.map((v, i) => cell(v, widths[i], { bold: boldLast && ri === rows.length - 1 })) })
      ),
    ],
  });
}

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 80 }, children: [run(t, { bold: true, size: 36 })] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 140 }, children: [run(t, { bold: true, size: 28 })] });
const gap = () => new Paragraph({ spacing: { after: 120 }, children: [] });

const fmtDate = (d, withTime = false) =>
  d
    ? new Date(d).toLocaleString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
        ...(withTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {}),
      })
    : '—';

/**
 * @param {object} p
 * @param {object} p.submission  populated submission (student, assignment, course)
 * @param {object} p.feedback    { criteria, totalScore, overview, strengths, improvements, closing, reviewedAt }
 */
async function buildFeedbackDocx({ submission: s, feedback: f }) {
  const a = s.assignment;
  const maxScore = a.maxScore || 100;
  const children = [
    h1(`${a.code} Feedback — ${s.student.name}`),
    new Paragraph({ spacing: { after: 240 }, children: [run(fmtDate(f.reviewedAt || new Date()), { color: MUTED })] }),

    h2('Overview'),
    richParagraph(f.overview || `${s.student.name}'s ${a.code} submission earned ${f.totalScore}/${maxScore}.`),
    table(
      ['Field', 'Detail'],
      [
        ['Assignment', `${a.code}: ${a.title}`],
        ['Course', s.course?.title || ''],
        ['Student', `${s.student.name} (${s.student.email})`],
        ['Submission', `${s.files.map((x) => x.originalName).join(', ')}, ${fmtDate(s.createdAt, true)}`],
        ['Grade', `${f.totalScore} / ${maxScore}`],
      ],
      [3, 5]
    ),
  ];

  if (f.strengths?.length) {
    children.push(h2('Strengths'), table(['Task', 'What stood out'], f.strengths.map((x) => [x.task, x.detail]), [3, 5]));
  }
  if (f.improvements?.length) {
    children.push(
      h2('Areas to Tighten Up'),
      table(['Task', 'Issue', 'Suggestion'], f.improvements.map((x) => [x.task, x.issue, x.suggestion]), [2.2, 3.4, 3.4])
    );
  }

  const rows = (f.criteria || []).map((c) => [
    c.criterion,
    `${c.weight}%`,
    `${Math.round(((c.score || 0) * c.weight) / 100 * (maxScore / 100) * 10) / 10}`,
    c.comment || '',
  ]);
  rows.push(['Total', '100%', `${f.totalScore} / ${maxScore}`, '']);
  children.push(h2('Grading Breakdown'), table(['Criterion', 'Weight', 'Score', 'Notes'], rows, [3, 1.1, 1.3, 3.6], true));

  if (f.closing) children.push(gap(), richParagraph(f.closing));

  const doc = new Document({
    creator: 'Onboard LMS',
    title: `${a.code} Feedback — ${s.student.name}`,
    styles: { default: { document: { run: { font: FONT, size: 21, color: INK } } } },
    sections: [
      {
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}

const feedbackFileName = (s) =>
  `${s.assignment.code} Feedback - ${s.student.name}.docx`.replace(/[\\/:*?"<>|]+/g, '').slice(0, 150);

module.exports = { buildFeedbackDocx, feedbackFileName, AlignmentType };
