// Email delivery with a safety rule: real email only ever goes to an inbox the demo owner controls.
//
// DEMO_INBOX=you@gmail.com  -> every demo address (aina.rahman@example.com ...) is delivered to
//                              you+aina@gmail.com, so each candidate's interview email lands in your inbox.
// Real addresses are delivered only if they are DEMO_INBOX itself, a +tag of it, or listed in
// MAIL_ALLOW (comma separated). Everything else stays in the public outbox page.
//
// Providers (first one configured wins):
//   BREVO_API_KEY  - brevo.com free plan, sends to any address after you verify your sender email.
//   RESEND_API_KEY - resend.com; without your own domain it only delivers to your signup email.
const FROM = () => process.env.MAIL_FROM || process.env.DEMO_INBOX || '';
const FROM_NAME = () => process.env.MAIL_FROM_NAME || 'HireBuddy';

function split(addr) {
  const [local, domain] = String(addr || '').toLowerCase().split('@');
  return { base: (local || '').split('+')[0], local, domain };
}

// Where (if anywhere) this email may really be delivered.
function route(to) {
  const inbox = process.env.DEMO_INBOX;
  if (!inbox) return null;
  const me = split(inbox);
  const t = split(to);
  if (/(^|\.)example\.com$/.test(t.domain)) {
    const tag = t.local.replace(/[^a-z0-9]+/g, '.').split('.')[0] || 'demo';
    return `${me.base}+${tag}@${me.domain}`;
  }
  if (t.domain === me.domain && t.base === me.base) return to;
  const allow = (process.env.MAIL_ALLOW || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  return allow.includes(String(to).toLowerCase()) ? to : null;
}

function mask(addr) {
  const { local, domain } = split(addr);
  return `${local.slice(0, 1)}***${local.includes('+') ? '+' + local.split('+')[1] : ''}@${domain}`;
}

async function sendBrevo({ to, subject, text }) {
  const body = {
    sender: { email: FROM(), name: FROM_NAME() },
    to: [{ email: to }], subject, textContent: text,
  };
  const r = await fetch(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', {
    method: 'POST', headers: { 'api-key': process.env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Brevo ${r.status}`);
  return { provider: 'Brevo', providerId: data.messageId };
}

async function sendResend({ to, subject, text }) {
  const body = { from: `${FROM_NAME()} <${process.env.RESEND_FROM || 'onboarding@resend.dev'}>`, to: [to], subject, text };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.message || `Resend ${r.status}`);
  return { provider: 'Resend', providerId: data.id };
}

async function deliver(email) {
  const provider = process.env.BREVO_API_KEY ? sendBrevo : process.env.RESEND_API_KEY ? sendResend : null;
  const target = route(email.to);
  if (!provider) return { channel: 'demo outbox', delivered: true, reason: 'email not configured' };
  if (!target) return { channel: 'demo outbox', delivered: true, reason: 'not an inbox the demo owner controls' };
  try {
    const res = await provider({ to: target, subject: email.subject, text: email.body });
    return { channel: `real email (${res.provider})`, delivered: true, to: mask(target), providerId: res.providerId };
  } catch (e) {
    return { channel: 'demo outbox', delivered: true, reason: `real send failed: ${e.message}` };
  }
}

module.exports = { deliver, route };
