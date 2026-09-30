const { z } = require('zod');
const mongoose = require('mongoose');

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

// OWASP ASVS-aligned password policy: length first, plus basic composition
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .regex(/[a-z]/, 'Must include a lowercase letter')
  .regex(/[A-Z]/, 'Must include an uppercase letter')
  .regex(/[0-9]/, 'Must include a number');

const email = z.string().trim().toLowerCase().email().max(254);

const bullets = z.array(z.string().trim().min(1).max(3000)).max(50).default([]);
const callout = z.object({
  kind: z.enum(['tip', 'hint', 'example', 'warning', 'note']),
  title: z.string().max(200).optional(),
  bullets,
});

const assignmentBody = z.object({
  milestoneId: objectId,
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(300),
  order: z.number().int().min(0).default(0),
  kind: z.enum(['report', 'lab', 'capstone', 'lesson']).default('report'),
  videos: z
    .array(
      z.object({
        title: z.string().trim().max(200).optional(),
        // https only; the client decides how to embed (allow-listed providers or <video> for direct files)
        url: z.string().trim().url().max(1000).refine((u) => u.startsWith('https://'), 'Video links must start with https://'),
        note: z.string().max(1000).optional(),
      })
    )
    .max(20)
    .default([]),
  jdRequirement: z.string().trim().max(500).optional(),
  meta: z
    .object({
      difficulty: z.enum(['Beginner', 'Intermediate', 'Advanced']).default('Beginner'),
      type: z.string().max(120).optional(),
      estimatedHours: z.string().max(20).optional(),
      platform: z.string().max(200).optional(),
      certifications: z.array(z.string().max(120)).max(20).default([]),
    })
    .default({}),
  scenario: z.object({ bullets, callouts: z.array(callout).max(10).default([]) }).default({}),
  tasks: z
    .array(z.object({ title: z.string().trim().min(1).max(300), bullets, callouts: z.array(callout).max(10).default([]) }))
    .max(30)
    .default([]),
  deliverable: z
    .object({
      bullets,
      acceptedFileTypes: z.array(z.enum(['docx', 'pdf', 'xlsx', 'pptx', 'png', 'jpg', 'zip', 'txt', 'csv', 'pcap'])).min(1).default(['docx', 'pdf']),
      maxFiles: z.number().int().min(1).max(10).default(3),
      maxFileMB: z.number().int().min(1).max(1024).nullish(),
    })
    .default({}),
  rubric: z
    .array(z.object({ _id: objectId.optional(), criterion: z.string().trim().min(1).max(500), weight: z.number().min(0).max(100), guidance: z.string().max(2000).optional() }))
    .max(20)
    .default([])
    .refine((arr) => !arr.length || Math.round(arr.reduce((s, c) => s + c.weight, 0)) === 100, 'Rubric weights must sum to 100'),
  maxScore: z.number().min(1).max(1000).default(100),
  passScore: z.number().min(0).max(1000).default(60),
  professionalDevelopment: z
    .object({ linkedinSkills: z.array(z.string().max(80)).max(20).default([]), cvAccomplishment: z.string().max(1000).optional() })
    .default({}),
  opensAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  isPublished: z.boolean().default(false),
  aiGrading: z.boolean().default(true),
});

/**
 * Schema for PATCH bodies: every field optional and NO top-level defaults.
 * (Zod 4's .partial() still applies .default() values, which would silently reset fields the client didn't send.)
 */
function patchSchema(schema) {
  return z.object(Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, (v._zod.def.type === 'default' ? v.removeDefault() : v).optional()])));
}

module.exports = { z, objectId, password, email, assignmentBody, patchSchema };
