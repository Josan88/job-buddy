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
  const handoff = body => fetch(`${base}/api/handoffs`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body) }).then(async response => ({ status: response.status, ...await response.json() }));
  const incomplete = await handoff({ prompt: 'Find jobs', key: 'paired-test' });
  assert.equal(incomplete.status, 201);
  assert.equal(incomplete.sent, 'telegram');
  assert(sent.at(-1).includes('Find jobs'));
  assert(!incomplete.missing);
  student.resume = { name: 'resume.docx' };
  const withResume = await handoff({ prompt: 'Find remote work', studentId: student.id });
  assert.equal(withResume.status, 201);
  assert(withResume.task.includes(`/api/me/student/${student.id}/resume`));
  assert(withResume.task.includes('without requesting compulsory missing details'));
  assert.equal((await handoff({ prompt: '' })).status, 400);
  const tools = require('../src/tools').tools;
  const searchCtx = { run: { id: 'filter-test' }, baseUrl: base, emit() {} };
  const blindResults = await tools.search_jobs.run({ studentId: student.id, askAboutTech: true, maxDistanceKm: 60 }, searchCtx);
  assert(blindResults.results.every(job => job.suitable));
  assert(!blindResults.results.some(job => job.jobId === 'job-delivery-subang'));
  const blindView = await fetch(`${base}/api/me/student/${student.id}`).then(r => r.json());
  assert(blindView.open.every(job => job.suitable));
  const blindJobsPage = await fetch(`${base}/jobs?studentId=${student.id}`).then(r => r.text());
  assert(!blindJobsPage.includes('data-job-id="job-delivery-subang"'));
  searchCtx.run.options = { listings: [
    { title: 'Delivery Rider', description: 'Driving a motorcycle required' },
    { title: 'Phone customer service', description: 'Remote customer service calls', pay: 'RM15/hour' }
  ] };
  const filteredListings = await tools.check_outside_listings.run({ studentId: student.id }, searchCtx);
  assert(filteredListings.results.every(job => job.verdict !== 'not suitable'));
  assert.equal(filteredListings.results[0].listingIndex, 1);
  assert(!require('../src/outside').summarise(searchCtx.run.outside, student).includes('Delivery Rider'));
  const applicant = store.db.applications[0];
  const bookingCtx = { run: { id: 'reply-test', interviews: [] }, emit() {} };
  const blockedBooking = await tools.book_interview.run({ studentId: applicant.studentId, jobId: applicant.jobId }, bookingCtx);
  assert.equal(blockedBooking.ok, false);
  assert(/employer response/.test(blockedBooking.problems[0]));
  const beforeBooking = store.db.interviews.length;
  applicant.employerResponse = { interviewRequested: true, message: 'Please attend an interview' };
  const allowedBooking = await tools.book_interview.run({ studentId: applicant.studentId, jobId: applicant.jobId }, bookingCtx);
  assert.equal(allowedBooking.ok, true);
  assert.equal(store.db.interviews.length, beforeBooking + 1);
  console.log('PASS application handoff and searches with incomplete details or supplied resume');
})().then(() => { fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); })
  .catch(e => { console.error(e); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
