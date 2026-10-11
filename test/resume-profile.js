const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
Object.assign(process.env, { PORT: '3996', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'hirebuddy-resume-')), LLM_API_KEY: '', PUBLIC_URL: '', RENDER_EXTERNAL_URL: '' });
const http = require('node:http');
const createServer = http.createServer;
let server;
http.createServer = (...args) => (server = createServer(...args));
require('../server');
http.createServer = createServer;
const parse = require('../src/parse');
const store = require('../src/store');
const { steps } = require('../src/steps');
const base = 'http://localhost:3996';
(async () => {
  await new Promise(resolve => setTimeout(resolve, 150));
  // A prompt that only points at a resume says nothing about free time or skills: none may be invented.
  const vague = parse.student('find my information in resume in downloads');
  assert.deepEqual(vague.availability, {});
  assert.deepEqual(vague.skills, []);
  assert.equal(vague.minPay, 0);
  assert.deepEqual(Object.keys(parse.student('free Mon-Fri 9am-5pm').availability), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.equal(parse.student('at least RM3,000/month').minPay, Math.round(3000 / 208 * 100) / 100);
  assert.deepEqual(Object.keys(parse.hirer('Need a weekend barista in Subang, RM12/hr').schedule), ['Sat', 'Sun']);

  const first = await steps.hirebuddy_1_understand.run({
    prompt: 'find my information in resume in downloads',
    applicantDetails: { name: 'Stephanie Yeo', area: 'Petaling Jaya', skills: ['Software Development', 'JavaScript'], minPay: 3000, minPayUnit: 'month',
      workExperience: 'Software developer intern at a fintech for 6 months.', education: 'BSc Computer Science' },
    listings: [
      { title: 'Junior Software Developer', employer: 'Acme Tech', site: 'JobStreet', pay: 'RM3,500 - RM4,000 per month', location: 'Petaling Jaya',
        hours: 'Mon - Fri, 9am - 6pm', description: 'JavaScript and SQL. Fresh graduates in computer science welcome.' },
    ],
  }, base);
  assert.equal(first.ok, true, JSON.stringify(first));
  const s = store.db.students.find(x => x.id === store.db.runs.find(r => r.id === first.runId).studentId);
  assert.equal(s.name, 'Stephanie Yeo');
  assert.equal(s.area, 'Petaling Jaya');
  assert.deepEqual(s.availability, {});
  assert.ok(s.skills.includes('software development') && !s.skills.includes('customer service'), s.skills.join(', '));
  assert.match(first.understood, /free time not given/);
  assert.match(s.bio, /Software developer intern/);

  await steps.hirebuddy_2_check_jobs.run({ runId: first.runId }, base);
  const listing = (store.db.runs.find(r => r.id === first.runId).outside || []).find(r => r.title === 'Junior Software Developer');
  assert.ok(listing, 'the job-site listing was checked');
  // Unknown free time is a question for the employer, never a reason to rule the job out.
  assert.equal(listing.verdict, 'worth asking', JSON.stringify(listing));
  assert.doesNotMatch(listing.draft, /customer service|flexible/);
  assert.match(listing.draft, /software development/);
  console.log('PASS resume details build the profile and unknown details stay unknown');
  server.close();
})().catch(e => { console.error(e); process.exit(1); });
