const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
const enabled = () => !!config.smtp.host;

function getTransport() {
  if (!enabled()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

/** Sends an email when SMTP is configured. Returns { sent: boolean }. Never throws. */
async function sendMail({ to, subject, text, html }) {
  const t = getTransport();
  if (!t) {
    console.log(`[mail] SMTP not configured — email NOT sent to ${to}: "${subject}"`);
    if (!config.isProd) console.log(text);
    return { sent: false };
  }
  try {
    await t.sendMail({ from: config.smtp.from, to, subject, text, html });
    return { sent: true };
  } catch (e) {
    console.error('[mail] failed:', e.message);
    return { sent: false, error: e.message };
  }
}

module.exports = { sendMail, mailEnabled: enabled };
