const env = require('../config/env');

let transport;
function getTransport() {
  if (!env.SMTP_HOST) return null;
  if (!transport) {
    const nodemailer = require('nodemailer');
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

const mailConfigured = () => Boolean(env.SMTP_HOST);
const outbox = []; // test runs only: lets tests read the reset link

/**
 * Send an email. Without SMTP configured:
 *   - development: print it to the server console so links can be used locally
 *   - production: refuse loudly (never silently drop a password-reset email)
 */
async function sendMail({ to, subject, text, html, category }) {
  const t = getTransport();
  if (!t) {
    if (env.NODE_ENV === 'production') throw new Error('SMTP is not configured');
    if (env.NODE_ENV === 'test') outbox.push({ to, subject, text, html, category });
    if (env.NODE_ENV !== 'test') console.log(`\n📧  [dev mail] To: ${to}\n    Subject: ${subject}\n    ${text.replace(/\n/g, '\n    ')}\n`);
    return { dev: true };
  }
  return t.sendMail({ from: env.MAIL_FROM, to, subject, text, html });
}

module.exports = { sendMail, mailConfigured, outbox };
