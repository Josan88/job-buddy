// Email delivery. Real sends go through Resend (https://resend.com) when RESEND_API_KEY is set
// and the recipient is a real address. Demo addresses (example.com) stay in the public outbox.
const store = require('./store');
const L = require('./lib');

async function deliver(email, interview) {
  const key = process.env.RESEND_API_KEY;
  const demo = /@([a-z0-9-]+\.)*example\.com$/i.test(email.to);
  if (!key || demo) {
    return { channel: 'demo outbox', delivered: true, reason: demo ? 'demo address' : 'email not configured' };
  }
  const payload = {
    from: process.env.MAIL_FROM || 'HireBuddy <onboarding@resend.dev>',
    to: [email.to], subject: email.subject, text: email.body,
  };
  if (interview) {
    const s = store.db.students.find(x => x.id === interview.studentId);
    const j = store.db.jobs.find(x => x.id === interview.jobId);
    const ics = L.makeIcs({
      uid: interview.id, start: new Date(interview.start), end: new Date(interview.end),
      summary: `Interview: ${j.title} (${j.business})`, description: `Interview with ${s.name}`,
      location: interview.mode, attendee: interview.email,
    });
    payload.attachments = [{ filename: 'interview.ics', content: Buffer.from(ics).toString('base64') }];
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { channel: 'demo outbox', delivered: true, reason: `real send failed: ${data.message || r.status}` };
    return { channel: 'email (Resend)', delivered: true, providerId: data.id };
  } catch (e) {
    return { channel: 'demo outbox', delivered: true, reason: `real send failed: ${e.message}` };
  }
}

module.exports = { deliver };
