/* eslint-disable no-console */
/**
 * Seed demo data: platform users, a demo company, and the SOC Analyst L1 course
 * with its milestone structure and two fully-structured assignments (SOC-03, W-01)
 * modelled on the live LMS layout.
 *
 *   npm run seed
 *
 * Passwords are generated randomly and printed ONCE to the console (never hard-coded).
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const env = require('../config/env');
const Company = require('../models/Company');
const User = require('../models/User');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const Enrollment = require('../models/Enrollment');
const { Quiz } = require('../models/Quiz');

const genPassword = () => `Lms-${crypto.randomBytes(6).toString('base64url')}9a`;

const MILESTONES = [
  ['Milestone 1: SOC Fundamentals & SIEM Orientation', 'Weeks 1-2'],
  ['Milestone 2: Network Traffic Analysis', 'Weeks 3-4'],
  ['Milestone 3: Threat Detection & Investigation', 'Weeks 5-7'],
  ['Milestone 4: Incident Response & Escalation', 'Weeks 8-9'],
  ['Milestone 5: Threat Intelligence & Capstone', 'Weeks 10-12'],
  ['Milestone 6: Forensic Assignments', ''],
];

function soc03(milestoneId) {
  return {
    milestoneId,
    code: 'SOC-03',
    title: 'Alert Severity Classification Framework & SLA Design',
    jdRequirement: 'Perform first-level alert triage using a defined severity framework (JD §3.2)',
    order: 3,
    kind: 'report',
    meta: {
      difficulty: 'Intermediate',
      type: 'Framework Design Document',
      estimatedHours: '5-6',
      certifications: ['CySA+ CS0-003 — 1.0 Security Operations Obj. 1.4', 'Security+', 'SOC Analyst L1'],
    },
    scenario: {
      bullets: [
        'NexaBank currently handles over 800 Wazuh alerts per day.',
        'Sarah Chen has noticed analysts spending equal time on Critical and Informational alerts — clearly inefficient.',
        'She has asked you to design a formal Alert Severity Classification Framework and SLA document that standardizes how the SOC triages all alerts.',
      ],
      callouts: [
        {
          kind: 'tip',
          title: 'Background — severity, SLAs, false positives',
          bullets: [
            'A 5-tier severity model (Critical / High / Medium / Low / Informational) is the industry standard.',
            'A SOC needs three SLAs: Acknowledge, Investigate, Escalate/Close.',
            'A false positive fired correctly per the rule but is not a real threat; repeated FPs trigger a suppression request.',
          ],
        },
      ],
    },
    tasks: [
      {
        title: 'Define 5 Severity Levels',
        bullets: [
          'Create definitions for Critical, High, Medium, Low, Informational.',
          'For each: criteria, 3 example NexaBank alert types, and the initial Tier 1 response action.',
          'Present as a 5-row table.',
        ],
        callouts: [{ kind: 'example', title: 'Sample Critical row', bullets: ['Criteria: confirmed active threat to a production system or potential data exfiltration.'] }],
      },
      { title: 'Design SLA Targets', bullets: ['Define Acknowledge / Investigate / Escalate-Close targets per severity.'], callouts: [{ kind: 'hint', title: 'Starter numbers', bullets: ['Justify each target in a one-sentence rationale.'] }] },
      { title: 'Create a Triage Checklist', bullets: ['A one-page checklist an analyst can follow on shift.'], callouts: [{ kind: 'hint', title: 'Structure', bullets: ['4 phases × 2-3 steps.'] }] },
      { title: 'False Positive Handling', bullets: ['Document how FPs are identified, recorded and suppressed.'], callouts: [] },
      { title: 'Apply Your Framework to 5 Real Wazuh Alerts', bullets: ['Classify five real alerts from the lab using your framework.'], callouts: [] },
    ],
    deliverable: {
      bullets: [
        'Alert Severity Classification Framework & SLA Document (.docx, 6-8 pages).',
        'Include the triage checklist as a standalone one-page appendix.',
        'Format as a binding operational policy: cover page, version number, author, approval line, revision-history table.',
      ],
      acceptedFileTypes: ['docx', 'pdf'],
      maxFiles: 2,
    },
    rubric: [
      { criterion: 'Coherence and internal consistency of the 5-tier severity model', weight: 25 },
      { criterion: 'Realism and justification of SLA targets', weight: 20 },
      { criterion: 'Triage checklist usability (could a real analyst follow it on shift?)', weight: 20 },
      { criterion: 'False-positive process completeness', weight: 15 },
      { criterion: 'Correct application of framework to 5 real alerts (Task 5)', weight: 15 },
      { criterion: 'Professional policy-document formatting', weight: 5 },
    ],
    professionalDevelopment: {
      linkedinSkills: ['Alert Triage', 'Incident Classification', 'SLA Management', 'Security Operations', 'Risk Prioritisation', 'SIEM'],
      cvAccomplishment: 'Designed a 5-tier alert severity classification framework and SLA response matrix for a 24/7 SOC.',
    },
    isPublished: true,
    aiGrading: true,
  };
}

function w01(milestoneId) {
  return {
    milestoneId,
    code: 'W-01',
    title: 'Wazuh Lab — Dashboard Navigation & Initial Alert Triage',
    jdRequirement: 'Monitor SIEM dashboards and alert queues for security events (JD §3.2)',
    order: 5,
    kind: 'lab',
    meta: { difficulty: 'Beginner', type: 'Wazuh Lab (READ-ONLY)', estimatedHours: '3-4', platform: 'Wazuh Dashboard 4.14.4', certifications: ['CySA+ CS0-003 — Obj. 1.3'] },
    scenario: {
      bullets: ['Your first shift at the NexaBank SOC. Get oriented in Wazuh and triage the first hour of alerts.'],
      callouts: [
        { kind: 'warning', title: 'READ-ONLY LAB — Do NOT modify anything', bullets: ['The Wazuh tenant is shared; only view and filter.'] },
        { kind: 'hint', title: 'How to log in', bullets: ['Use the credentials on the course access page.'] },
      ],
    },
    tasks: [
      { title: 'Agent Status Review', bullets: ['Document the status of the existing agents.'], callouts: [] },
      { title: 'Security Events: First Hour Triage', bullets: ['Review security events and note the top rule groups.'], callouts: [] },
      { title: 'Severity Drill-Down: Critical Alerts (Level 12+)', bullets: ['Filter to level 12+ and write an escalation decision.'], callouts: [{ kind: 'example', title: 'Sample escalation write-up', bullets: ['Alert, affected host, evidence, decision, next step.'] }] },
      { title: 'MITRE Coverage Check', bullets: ['Identify the most frequent MITRE techniques.'], callouts: [] },
      { title: 'Compliance Snapshot: PCI DSS', bullets: ['Summarise the PCI DSS requirements with the most alerts.'], callouts: [] },
    ],
    deliverable: { bullets: ['Lab report (.docx or .pdf) with annotated screenshots for every task.'], acceptedFileTypes: ['docx', 'pdf'], maxFiles: 3 },
    rubric: [
      { criterion: 'Screenshot quality and relevance (filter bars, timestamps visible)', weight: 30 },
      { criterion: 'Accuracy of findings per task', weight: 35 },
      { criterion: 'Quality of the escalation decision (Task 3)', weight: 25 },
      { criterion: 'Report structure and clarity', weight: 10 },
    ],
    isPublished: true,
    aiGrading: true,
  };
}

async function main() {
  await mongoose.connect(env.MONGO_URI);
  const creds = [];
  const mkUser = async (data) => {
    const existing = await User.findOne({ email: data.email });
    if (existing) return existing;
    const password = genPassword();
    creds.push(`${data.role.padEnd(14)} ${data.email.padEnd(32)} ${password}`);
    return User.create({ ...data, password });
  };

  const company = (await Company.findOne({ slug: 'nexabank' })) || (await Company.create({ name: 'NexaBank', slug: 'nexabank', seatLimit: 10 }));

  await mkUser({ name: 'Platform Admin', email: 'admin@lms.local', role: 'super_admin' });
  const instructor = await mkUser({ name: 'Lead Instructor', email: 'instructor@lms.local', role: 'instructor' });
  await mkUser({ name: 'Sarah Chen', email: 'sarah.chen@nexabank.local', role: 'company_admin', company: company._id, jobTitle: 'SOC Manager' });
  const employees = [];
  for (const [name, email, dept] of [
    ['Omar Hassan', 'omar@nexabank.local', 'SOC'],
    ['Mona Adel', 'mona@nexabank.local', 'SOC'],
    ['Karim Fathy', 'karim@nexabank.local', 'IT Security'],
  ]) {
    employees.push(await mkUser({ name, email, role: 'employee', company: company._id, department: dept, jobTitle: 'SOC Analyst L1 (new hire)' }));
  }

  let course = await Course.findOne({ code: 'SOC-L1-2026', company: null });
  if (!course) {
    course = await Course.create({
      code: 'SOC-L1-2026',
      title: 'SOC Analyst L1 2026 — Practical Foundations',
      summary: 'Hands-on onboarding for new SOC Tier 1 analysts: SIEM, network analysis, detection, incident response and forensics.',
      coverColor: '#b91c1c',
      certificationTarget: 'CompTIA CySA+ CS0-003',
      isPublished: true,
      milestones: MILESTONES.map(([title, weeks], i) => ({ title, weeks, order: i, weight: i < 5 ? 20 : 0 })),
    });
  }
  // The admin assigns instructors to courses; seed assigns the lead instructor to SOC-L1
  await Course.updateOne({ _id: course._id }, { $addToSet: { instructors: instructor._id } });

  if (!(await Assignment.exists({ course: course._id }))) {
    const m1 = course.milestones[0]._id;
    await Assignment.create({ ...soc03(m1), course: course._id });
    await Assignment.create({ ...w01(m1), course: course._id });
    await Assignment.create({
      course: course._id, milestoneId: m1, code: 'L-01', title: 'Welcome to the SOC — how this programme works', order: 0, kind: 'lesson', isPublished: true, aiGrading: false,
      videos: [{ title: 'What does a SOC analyst do?', url: 'https://www.youtube.com/watch?v=N-VkQX7pYyo', note: 'Watch before starting SOC-01.' }],
      scenario: { bullets: ['A short orientation before your first assignment.'] },
      deliverable: { bullets: [], acceptedFileTypes: ['pdf'], maxFiles: 1 },
    });
  }
  if (!(await Quiz.exists({ course: course._id }))) {
    await Quiz.create({
      course: course._id, milestoneId: course.milestones[0]._id, title: 'M1 Quiz: SOC Foundations', passScore: 70, maxAttempts: 3, isPublished: true,
      questions: [
        { type: 'single', prompt: 'Which SOC tier performs the first triage of incoming alerts?', options: ['Tier 1', 'Tier 2', 'Tier 3', 'SOC Manager'], correct: [0], explanation: 'Tier 1 analysts monitor queues and triage alerts; complex cases escalate to Tier 2.' },
        { type: 'multiple', prompt: 'Which of these are typical Tier 1 responsibilities? (select all)', options: ['Alert triage', 'Malware reverse engineering', 'Shift handover notes', 'Escalating confirmed incidents'], correct: [0, 2, 3], explanation: 'Reverse engineering belongs to Tier 3 / malware analysts.' },
        { type: 'true_false', prompt: 'A false positive is an alert that fired correctly per its rule but is not a real threat.', options: ['True', 'False'], correct: [0] },
      ],
    });
  }

  for (const e of employees) {
    await Enrollment.updateOne(
      { user: e._id, course: course._id },
      { $setOnInsert: { company: company._id, status: 'active', dueAt: new Date(Date.now() + 84 * 864e5) } },
      { upsert: true }
    );
  }

  console.log('\n✅ Seed complete.');
  if (creds.length) {
    console.log('\nNew accounts (passwords shown once — store them safely):\n');
    console.log(creds.join('\n'));
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
