const { Schema, model } = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = ['super_admin', 'company_admin', 'instructor', 'employee'];
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

const userSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true }, // null only for super_admin
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'employee', index: true },
    jobTitle: { type: String, trim: true, maxlength: 120 },
    department: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40 },
    // Set when someone else chose this password (temporary password): the user must replace it before doing anything else
    mustChangePassword: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    passwordChangedAt: { type: Date, select: false },
    lastLoginAt: Date,
    preferences: {
      theme: { type: String, enum: ['default', 'light', 'dark', 'system'], default: 'default' },
      email: {
        enabled: { type: Boolean, default: true }, // notification emails at all
        grades: { type: Boolean, default: true }, // graded / returned / quiz results
        courses: { type: Boolean, default: true }, // assigned, published, instructor added
        support: { type: Boolean, default: true }, // ticket replies & new tickets
        reviews: { type: Boolean, default: true }, // staff: new submissions, AI drafts ready
        team: { type: Boolean, default: true }, // company admin: completions, seats, shared reports
      },
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function isLocked() {
  return Boolean(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= MAX_FAILED_LOGINS) {
    this.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    this.failedLoginAttempts = 0;
  }
  await this.save({ validateModifiedOnly: true });
};

// Never leak sensitive fields in JSON responses
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.failedLoginAttempts;
    delete ret.lockUntil;
    delete ret.passwordChangedAt;
    delete ret.__v;
    return ret;
  },
});

module.exports = model('User', userSchema);
module.exports.ROLES = ROLES;
