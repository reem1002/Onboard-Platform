/**
 * Account tool for whoever runs the server (needs direct DB access, so it's an operator tool, not a user feature).
 *
 *   npm run user -- list
 *   npm run user -- create <email> "<Full name>" <role> [company-slug] [--password <pw>]
 *   npm run user -- set-password <email> [<password>]
 *   npm run user -- demo-passwords <password>          (development only: the 6 seed accounts)
 *
 * Roles: super_admin | instructor | company_admin | employee
 * Without --password a random temporary password is generated and the user must change it at first sign-in.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');
const env = require('../config/env');
const User = require('../models/User');
const Company = require('../models/Company');
const RefreshToken = require('../models/RefreshToken');
const { password: passwordRule, email: emailRule } = require('../utils/schemas');

const DEMO = ['admin@lms.local', 'instructor@lms.local', 'sarah.chen@nexabank.local', 'omar@nexabank.local', 'mona@nexabank.local', 'karim@nexabank.local'];
const ROLES = ['super_admin', 'instructor', 'company_admin', 'employee'];
const tempPassword = () => `Tmp-${crypto.randomBytes(6).toString('base64url')}7a`;

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}
function checkPassword(pw) {
  const r = passwordRule.safeParse(pw);
  if (!r.success) fail(`Password rejected: ${r.error.issues.map((i) => i.message).join('; ')}`);
}
function takeFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

async function setPassword(user, pw, { mustChange }) {
  user.password = pw;
  user.mustChangePassword = mustChange;
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.isActive = true;
  await user.save();
  await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() }); // sign out everywhere
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args.shift();
  if (!cmd || cmd === 'help') {
    console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
    return;
  }
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 5000 }).catch(() => fail(`Can't reach MongoDB at ${env.MONGO_URI} — is it running? (Windows: net start MongoDB)`));

  if (cmd === 'list') {
    const users = await User.find().sort({ role: 1, email: 1 }).populate('company', 'slug');
    console.log('');
    console.table(users.map((u) => ({ role: u.role, email: u.email, name: u.name, company: u.company?.slug || '', active: u.isActive, mustChangePw: u.mustChangePassword })));
  } else if (cmd === 'create') {
    const pwFlag = takeFlag(args, '--password');
    const [emailArg, name, role = 'employee', slug] = args;
    const email = emailRule.safeParse(emailArg || '');
    if (!email.success) fail('Give a valid email: npm run user -- create you@example.com "Your Name" super_admin');
    if (!name || name.length < 2) fail('Give a name in quotes, e.g. "Reem Ahmed"');
    if (!ROLES.includes(role)) fail(`Role must be one of: ${ROLES.join(', ')}`);
    if (await User.exists({ email: email.data })) fail(`${email.data} already exists — use: npm run user -- set-password ${email.data}`);
    let company;
    if (['company_admin', 'employee'].includes(role)) {
      company = slug ? await Company.findOne({ slug }) : await Company.findOne().sort({ createdAt: 1 });
      if (!company) fail(`No company found${slug ? ` with slug "${slug}"` : ''}. Create one first (npm run seed, or as platform admin).`);
    }
    const pw = pwFlag || tempPassword();
    checkPassword(pw);
    await User.create({ email: email.data, name, role, company: company?._id, password: pw, mustChangePassword: !pwFlag });
    console.log(`\n✅ Created ${role} ${email.data}${company ? ` in ${company.name}` : ''}`);
    console.log(`   Password: ${pw}${pwFlag ? '' : '   (temporary — you will be asked to choose your own at first sign-in)'}\n`);
  } else if (cmd === 'set-password') {
    const [emailArg, pwArg] = args;
    const user = await User.findOne({ email: String(emailArg || '').toLowerCase() }).select('+password');
    if (!user) fail(`No account for "${emailArg}". See: npm run user -- list`);
    const pw = pwArg || tempPassword();
    checkPassword(pw);
    await setPassword(user, pw, { mustChange: !pwArg });
    console.log(`\n✅ ${user.email}: password set, account unlocked, other sessions signed out.`);
    console.log(`   Password: ${pw}${pwArg ? '' : '   (temporary — must be changed at next sign-in)'}\n`);
  } else if (cmd === 'demo-passwords') {
    if (env.NODE_ENV === 'production') fail('Not available in production.');
    const [pw] = args;
    if (!pw) fail('Give the password to use, e.g. npm run user -- demo-passwords Demo-Pass-2026');
    checkPassword(pw);
    const users = await User.find({ email: { $in: DEMO } }).select('+password');
    for (const u of users) await setPassword(u, pw, { mustChange: false });
    console.log(`\n✅ ${users.length} demo accounts now use the password you chose (development only):`);
    console.table(users.map((u) => ({ role: u.role, email: u.email })));
  } else {
    fail(`Unknown command "${cmd}". Run: npm run user -- help`);
  }
  await mongoose.disconnect();
}

main().catch((e) => fail(e.message));
