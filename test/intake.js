const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hirebuddy-intake-'));
Object.assign(process.env, { PORT: '3996', DATA_DIR: dir, LLM_API_KEY: '', TELEGRAM_SESSION: '', BREVO_API_KEY: '', RESEND_API_KEY: '' });
const http = require('node:http'), create = http.createServer;
let server;
http.createServer = (...args) => (server = create(...args));
require('../server'); http.createServer = create;
const store = require('../src/store'), base = 'http://localhost:3996';
async function post(url, body) { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, ...await r.json() }; }
async function tool(name, args) { const r = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }); return JSON.parse(r.result.content[0].text); }
(async () => {
  const ho = await post('/api/handoffs', { prompt: 'Find customer service jobs for me' });
  assert.equal(ho.status, 201);
  assert(ho.task.includes('use your file tools to locate and open it first'));
  assert.equal(store.db.runs.length, 0);
  assert.equal((await tool('hirebuddy_1_understand', { prompt: 'Find customer service jobs for me', handoffId: ho.id })).ok, false);
  assert.equal((await tool('hirebuddy_run', { prompt: 'Find customer service jobs for me', persona: 'student' })).ok, false);
  const details = { name: 'Nadia Rahim', age: 24, workExperience: 'Customer service calls for a year', education: 'Diploma', location: 'Subang Jaya', interestedPosition: 'Customer service' };
  const review = await tool('hirebuddy_review_intake', { handoffId: ho.id, revision: 1, details: { ...details, age: '' }, missing: ['age'] });
  assert.equal(review.status, 'needs_details');
  const state = await fetch(base + '/api/handoffs/' + ho.id).then(r => r.json());
  assert.deepEqual(state.intake.missing, ['age']);
  assert.equal(state.labels.age, 'Age');
  const answer = await post('/api/handoffs/' + ho.id + '/details', { revision: 1, details: { age: 'twenty four' } });
  assert.equal(answer.status, 200);
  assert(answer.task.includes('revision: 2'));
  assert.equal(store.db.runs.length, 0);
  assert.equal((await tool('hirebuddy_1_understand', { prompt: 'Find customer service jobs for me', handoffId: ho.id })).ok, false);
  assert.equal((await tool('hirebuddy_review_intake', { handoffId: ho.id, revision: 1, details, missing: [] })).ok, false);
  assert.equal((await post('/api/handoffs/' + ho.id + '/details', { revision: 1, details: { age: '24' } })).status, 409);
  assert.equal((await tool('hirebuddy_review_intake', { handoffId: ho.id, revision: 2, details, missing: [] })).status, 'ready');
  const started = await tool('hirebuddy_1_understand', { prompt: 'Find customer service jobs for me', handoffId: ho.id });
  assert.equal(started.ok, true);
  assert.equal(store.db.runs.length, 1);
  assert.equal(store.db.students.find(s => s.id === store.db.runs[0].studentId).age, 24);
  assert.equal((await tool('hirebuddy_1_understand', { prompt: 'Find customer service jobs for me', handoffId: ho.id })).ok, false);
  assert.equal(store.db.applications.length, 0);

  // Exercise the real speech-field handler, with browser recognition mocked.
  const source = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const fn = source.slice(source.indexOf('function showIntake('), source.indexOf("$('#handoff').onclick", source.indexOf('function showIntake(')));
  const input = { value: '', focus() {} }, button = { dataset: { intakeSpeak: 'age' } };
  const elements = new Map();
  const $ = selector => {
    if (selector === '#intake-age' || selector === '#intake-fields input') return input;
    if (!elements.has(selector)) elements.set(selector, { focus() {}, removeAttribute() {}, querySelectorAll: () => [button] });
    return elements.get(selector);
  };
  let finish;
  const scope = { $, esc: String, announce() {}, progressSound: { stop() {} }, window: { SpeechRecognition() {}, HB: { listen(lang, done) { finish = done; return () => finish('twenty four'); } } } };
  vm.runInNewContext('let intakeHandoff; ' + fn + '; showIntake("ho-test", { intake: { revision: 1, missing: ["age"], answers: {} }, labels: { age: "Age" } });', scope);
  button.onclick();
  assert.equal(button.textContent, 'Stop speaking');
  button.onclick();
  assert.equal(input.value, 'twenty four');
  assert.equal(button.textContent, 'Speak Age');
  console.log('PASS intake review, speech entry, answer round trip, stale revisions and search gate');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
