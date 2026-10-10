const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
// Exercise the actual card key handler without sending a live Telegram message.
const handlers = {};
let keyboardCalls = 0;
const button = { disabled: false, dataset: { applyJob: 'job-test' },
  addEventListener: (name, fn) => { handlers[`button-${name}`] = fn; },
  click: () => { if (!button.disabled) handlers['button-click'](); } };
const card = { innerText: 'Test job', querySelector: () => button,
  addEventListener: (name, fn) => { handlers[name] = fn; } };
const message = { focus() {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/jobs.js'), 'utf8'), {
  document: { querySelectorAll: () => [card], getElementById: () => message },
  localStorage: { getItem: () => JSON.stringify({ role: 'student', id: 'stu-test' }) },
  window: { addEventListener() {}, HB: { announce() {}, readControl() {},
    sendApplication: async () => { keyboardCalls++; return { ok: true, message: 'Sent to Telegram' }; } } },
});
handlers.keydown({ key: 'Enter', target: card, repeat: true });
assert.equal(keyboardCalls, 0);
handlers.keydown({ key: 'Enter', target: button });
assert.equal(keyboardCalls, 0);
handlers.keydown({ key: 'Enter', target: card, preventDefault() {} });
handlers.keydown({ key: 'Enter', target: card, preventDefault() {} });
assert.equal(keyboardCalls, 1);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hirebuddy-application-'));
Object.assign(process.env, { PORT: '3998', DATA_DIR: dir, LLM_API_KEY: '', PUBLIC_URL: '', RENDER_EXTERNAL_URL: '' });
const telegram = require('../src/telegram');
let sent = [], fail = false;
Object.assign(telegram, { configured: () => true, keyOk: key => key === 'paired-test', start: () => {},
  send: async task => { if (fail) throw new Error('test connection failure'); sent.push(task); await new Promise(r => setTimeout(r, 30)); } });
require('../server');
const store = require('../src/store');
const base = 'http://localhost:3998';
const apply = (job, key) => fetch(`${base}/api/jobs/${job}/apply/stu-nadia`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }),
}).then(async r => ({ status: r.status, ...await r.json() }));
(async () => {
  const student = store.db.students.find(s => s.id === 'stu-nadia');
  const L = require('../src/lib');
  const jobs = store.db.jobs.filter(j => L.checkWage(j.pay, j.payUnit).ok && L.accessFit(j, student, { minPay: student.expectedRate, maxDistanceKm: 60, askAboutTech: true }).fit !== 'not suitable');
  assert(jobs.length >= 2);
  assert.equal((await apply(jobs[0].id, 'wrong')).status, 403);
  assert.equal(sent.length, 0);
  fail = true;
  assert.equal((await apply(jobs[0].id, 'paired-test')).status, 502);
  assert.equal(store.db.applications.length, 0);
  fail = false;
  const results = await Promise.all([apply(jobs[0].id, 'paired-test'), apply(jobs[0].id, 'paired-test')]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal(sent.length, 1);
  assert(sent[0].includes('The ONLY recipient (To) must be stephanieshinhuiyeo@gmail.com'));
  assert(sent[0].includes(`Subject: ${jobs[0].ownerEmail} —`));
  assert(sent[0].includes(jobs[0].ownerEmail));
  assert(sent[0].includes(student.bio));
  assert(sent[0].includes('NVDA'));
  assert.equal(store.db.applications[0].applicationData.to, 'stephanieshinhuiyeo@gmail.com');
  assert.equal(store.db.applications[0].applicationData.companyEmail, jobs[0].ownerEmail);
  assert.equal(store.db.emails.length, 0, 'The server must not also send a direct email');
  assert.equal((await apply(jobs[0].id, 'paired-test')).status, 409);
  console.log('PASS application Telegram handoff, recipient, subject, preserved data, pairing, retry and duplicate protection');
})().then(() => { fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); })
  .catch(e => { console.error(e); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
