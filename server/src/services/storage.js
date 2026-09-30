const mongoose = require('mongoose');
const Submission = require('../models/Submission');
const Company = require('../models/Company');
const { getSettings } = require('./settings');

const MB = 1024 * 1024;

/** Bytes used by employee submissions, per company → Map(companyId → bytes) */
async function usageByCompany(companyId) {
  // Streamed sum (portable across MongoDB-compatible servers; only two small fields are read)
  const filter = companyId ? { company: new mongoose.Types.ObjectId(String(companyId)) } : {};
  const out = new Map();
  for await (const sub of Submission.find(filter).select('company files.size').lean().cursor()) {
    const k = String(sub.company);
    const row = out.get(k) || { bytes: 0, files: 0 };
    for (const f of sub.files || []) { row.bytes += f.size || 0; row.files += 1; }
    out.set(k, row);
  }
  return out;
}

/** { usedBytes, quotaMB (0 = unlimited) } for one company */
async function companyStorage(companyId) {
  const [company, s, usage] = await Promise.all([Company.findById(companyId).select('storageQuotaMB'), getSettings(), usageByCompany(companyId)]);
  const quotaMB = company?.storageQuotaMB ?? s.uploads.defaultCompanyQuotaMB ?? 0;
  return { usedBytes: usage.get(String(companyId))?.bytes || 0, quotaMB };
}

const overQuota = ({ usedBytes, quotaMB }, extraBytes = 0) => quotaMB > 0 && usedBytes + extraBytes > quotaMB * MB;

module.exports = { usageByCompany, companyStorage, overQuota, MB };
