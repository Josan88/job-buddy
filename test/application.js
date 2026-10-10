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
  window: { addEventListener() {}, HB: { announce() {}, readFocus() {}, readControl() {}, debug() {},
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
  const commonSource = fs.readFileSync(path.join(__dirname, '../public/common.js'), 'utf8');
  const method = commonSource.slice(commonSource.indexOf('  bindResultApplications('), commonSource.indexOf('  esc:'));
  const resultHandlers = {}, resultStatus = { focus() {} };
  let resultCalls = 0, resultEndpoint;
  const resultCard = { innerText: 'Phone support at Example Company',
    addEventListener: (name, fn) => { resultHandlers[name] = fn; }, querySelector: () => resultStatus };
  const resultButton = { dataset: { resultApply: '0' }, closest: () => resultCard,
    click() { if (!this.disabled) this.onclick(); } };
  const resultHB = { debug() {}, readControl() {}, announce() {},
    async sendApplication(job, student, endpoint) { resultCalls++; resultEndpoint = endpoint; return { ok: false, error: 'Pair this browser' }; } };
  const bindResults = vm.runInNewContext(`({${method}}).bindResultApplications`, { window: { HB: resultHB } });
  bindResults({ querySelectorAll: () => [resultButton] }, 'run-card-test');
  resultHandlers.keydown({ key: 'Enter', target: resultCard, repeat: true });
  assert.equal(resultCalls, 0);
  resultHandlers.keydown({ key: 'Enter', target: resultCard, preventDefault() {} });
  resultHandlers.keydown({ key: 'Enter', target: resultCard, preventDefault() {} });
  assert.equal(resultCalls, 1);
  assert.equal(resultEndpoint, '/api/runs/run-card-test/listings/0/apply');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(resultStatus.textContent, 'Pair this browser');
  assert.equal(resultButton.disabled, false, 'A failed handoff permits retry');
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
  assert.equal(store.db.applications[0].applicationData.subject.indexOf(jobs[0].ownerEmail), 0);
  assert(sent[0].includes(JSON.stringify(store.db.applications[0].applicationData.subject)));
  assert(sent[0].length <= 4096);
  assert(sent[0].includes(jobs[0].ownerEmail));
  assert(sent[0].includes(student.bio));
  assert(sent[0].includes('NVDA'));
  assert.equal(store.db.applications[0].applicationData.to, 'stephanieshinhuiyeo@gmail.com');
  assert.equal(store.db.applications[0].applicationData.companyEmail, jobs[0].ownerEmail);
  assert.equal(store.db.emails.length, 0, 'The server must not also send a direct email');
  assert.equal((await apply(jobs[0].id, 'paired-test')).status, 409);
  const listing = require('../src/outside').assessAll([{ title: 'Phone support', employer: 'Example Company',
    companyEmail: 'hiring@example.com', description: 'Customer service calls, remote', pay: 'RM15/hour', hours: 'weekdays 9am-5pm' }], student)[0];
  assert.equal(listing.companyEmail, 'hiring@example.com');
  store.db.runs.push({ id: 'run-card-test', studentId: student.id, outside: [listing] });
  const outsideApply = key => fetch(`${base}/api/runs/run-card-test/listings/0/apply`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }),
  }).then(async r => ({ status: r.status, ...await r.json() }));
  assert.equal((await outsideApply('wrong')).status, 403);
  fail = true;
  assert.equal((await outsideApply('paired-test')).status, 502);
  assert.equal(listing.applicationHandoff, undefined);
  fail = false;
  assert.equal((await outsideApply('paired-test')).sent, 'telegram');
  assert.equal(listing.applicationHandoff.applicationData.companyEmail, 'hiring@example.com');
  assert.equal((await outsideApply('paired-test')).status, 409);
  const long = require('../src/application').prepare({ ...jobs[0], description: 'Job description '.repeat(500) }, { ...student, bio: 'Experience '.repeat(500) }, base);
  assert(long.task.length <= 4096);
  console.log('PASS application Telegram handoff, recipient, preserved data, pairing, retry and duplicate protection');
})().then(() => { fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); })
  .catch(e => { console.error(e); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
