const { Schema, model } = require('mongoose');

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z0-9-]{2,60}$/ },
    logoUrl: { type: String, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    // Number of employee accounts this customer has purchased; the company admin can't exceed it
    seatLimit: { type: Number, default: 10, min: 0, max: 100000 },
    // Storage for employee submissions in MB. null = use the platform default; 0 = unlimited
    // Branding shown to this company's admins and employees (and on their certificates)
    accentColor: { type: String, match: /^#[0-9a-fA-F]{6}$/ },
    logo: { storedName: String, mimeType: String, updatedAt: Date },
    storageQuotaMB: { type: Number, default: null, min: 0, max: 10485760 },
  },
  { timestamps: true }
);

module.exports = model('Company', companySchema);
