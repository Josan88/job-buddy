// HireBuddy web server: live agent console, public job pages, outbox, REST + MCP endpoints.
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./src/store');
const L = require('./src/lib');
const agent = require('./src/agent');
const mcp = require('./src/mcp');
const llm = require('./src/llm');
const telegram = require('./src/telegram');
const mail = require('./src/mail');
const application = require('./src/application');
const pendingApplications = new Set();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const RESUMES = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'resumes');
const RESUME_MAX = 5 * 1024 * 1024;
const RESUME_TYPES = { 'application/pdf': 'pdf', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'text/plain': 'txt' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function json(res, status, data) {
  if (res.applicationRequestId) {
    data.requestId = res.applicationRequestId;
    console.info('[HireBuddy application]', JSON.stringify({ requestId: data.requestId, stage: 'response', status, sent: data.sent, error: data.error }));
  }
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data));
}
function html(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// One shell for every page: skip link, labelled landmarks, the current page marked for screen readers,
// and a text-size control that is applied before first paint.
// Find work and My details are for the person; the rest are demo pages, folded into a menu.
const NAV = [['/', 'Find work'], ['/me', 'My details']];
const DEMO_NAV = [['/me?switch=1', 'Switch person'], ['/jobs', 'Jobs'], ['/outbox', 'Emails'], ['/about', 'How it works']];
function page(title, inner, { current = '', scripts = '', description = 'HireBuddy: say what work you want in one sentence. An agent finds jobs that suit blind and low-vision people, applies, books interviews and checks its own work.' } = {}) {
  const link = ([href, label]) => `<li><a href="${href}"${href === current ? ' aria-current="page"' : ''}>${label}</a></li>`;
  const nav = NAV.map(link).join('') + `<li><details class="menu"${DEMO_NAV.some(([h]) => h === current) ? ' data-current' : ''}><summary aria-label="Demo menu"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg> Demo</summary><ul>${DEMO_NAV.map(link).join('')}</ul></details></li>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · HireBuddy</title><meta name="description" content="${esc(description)}">
<link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap">
<link rel="stylesheet" href="/style.css">
<script>try{var z=localStorage.getItem('hirebuddy.size');if(z&&z!=='normal')document.documentElement.dataset.size=z;}catch(e){}</script>
</head><body>
<a class="skip" href="#main">Skip to main content</a>
<header class="top"><div class="top-inner">
<a class="brand" href="/"><img src="/favicon.svg" alt="" width="36" height="36">HireBuddy</a>
<nav aria-label="Main"><ul>${nav}</ul></nav>
<div class="textsize" role="group" aria-label="Text size"><span aria-hidden="true">Text size</span>
<button type="button" class="secondary" data-size="normal" aria-label="Normal text">A</button><button type="button" class="secondary" data-size="large" aria-label="Large text">A+</button><button type="button" class="secondary" data-size="larger" aria-label="Largest text">A++</button></div>
<button type="button" class="secondary" id="voice-command" aria-keyshortcuts="Space" title="Press Space, say a control or section, then Enter">Voice command</button>
</div></header>
<div id="announcer" class="sr-only" role="status" aria-live="polite" aria-atomic="true"></div>
<details class="panel voice-guide" open><summary>Voice command guide</summary>
<p>Press Space, then say a button, navigation tab, option, or section name. The matching item receives focus; press Enter to select a button, tab, or option.</p>
<p>Say “What can I say?” or “Help” to hear how voice commands work and the navigation tabs, buttons, options, and sections available on the current page. Say “Stop” to stop speech.</p></details>
<main id="main" tabindex="-1">${inner}</main>
<footer><p>Built to work with screen readers (NVDA, JAWS, VoiceOver, TalkBack), with a keyboard alone, and at large text sizes. People and employers in this demo are fictional.</p></footer>
<script src="/common.js?v=20261011-12"></script>${scripts}
</body></html>`;
}

function staticPage(file) {
  const raw = fs.readFileSync(path.join(PUBLIC, 'pages', file), 'utf8');
  const meta = (raw.match(/^<!--\s*(\{.*\})\s*-->/) || [])[1];
  return { opts: meta ? JSON.parse(meta) : {}, body: raw.replace(/^<!--.*-->\n?/, '') };
}

function accessFacts(j) {
  const a = j.access || {};
  const mode = a.workMode || 'on-site';
  const rows = [['Where you work', mode === 'remote' ? 'Remote, from home' : `${mode === 'hybrid' ? 'Hybrid: partly from home, partly' : 'On site'} in ${j.area}`]];
  if (mode !== 'remote') rows.push(['Getting there', a.transit ? `${a.transit.walkMin}-minute walk from ${a.transit.station}` : 'No train or bus stop listed']);
  rows.push(['Screen readers', a.computerWork === false ? 'Not needed: no computer work' : (a.assistiveTech || []).length ? `Supported: ${a.assistiveTech.join(', ')}` : 'Not stated. HireBuddy asks the employer for you']);
  rows.push(['Tasks that need sight', (a.sightTasks || []).length ? a.sightTasks.join('; ') : 'None listed']);
  rows.push(['Interview', (a.interviewFormats || ['in person']).join(', ')]);
  return `<dl class="facts">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
}

function jobView(j, base) {
  const apps = store.db.applications.filter(a => a.jobId === j.id);
  const wage = L.checkWage(j.pay, j.payUnit);
  return page(`${j.title} at ${j.business}`, `
<article aria-labelledby="job-title">
  <h1 id="job-title">${esc(j.title)}</h1>
  <p class="lede">${esc(j.business)}, ${esc(j.area)}</p>
  <dl class="facts">
    <dt>Pay</dt><dd>RM${esc(j.pay)} per ${esc(j.payUnit)}. <span class="status-word ${wage.ok ? 'good' : 'bad'}">${wage.ok ? 'Meets the legal minimum wage' : 'Below the legal minimum wage'}</span></dd>
    <dt>Hours</dt><dd>${esc(L.describeSchedule(j.schedule))}</dd>
    ${j.startDate ? `<dt>Starts</dt><dd>${esc(j.startDate)}</dd>` : ''}
    <dt>Must have</dt><dd>${esc(j.requirements.join(', '))}</dd>
    ${j.niceToHave?.length ? `<dt>Nice to have</dt><dd>${esc(j.niceToHave.join(', '))}</dd>` : ''}
  </dl>
  <h2>About the job</h2>
  <p>${esc(j.description)}</p>
  <h2>Access</h2>
  ${accessFacts(j)}
  <p class="small">${apps.length} applicant${apps.length === 1 ? '' : 's'} so far. ${j.runId ? `Posted by <a href="/runs/${esc(j.runId)}">the HireBuddy agent</a>.` : ''} ${j.seed ? '<a href="/about#demo-data">Demo data</a>.' : ''}</p>
</article>
<section aria-labelledby="apply-title">
  <h2 id="apply-title">Apply</h2>
  <p>Or let HireBuddy apply for you from <a href="/">one sentence</a>.</p>
  <form method="post" action="/jobs/${esc(j.id)}/apply">
    <p><label for="f-name">Name</label><input id="f-name" name="name" type="text" autocomplete="name" required></p>
    <p><label for="f-email">Email</label><input id="f-email" name="email" type="email" autocomplete="email" required></p>
    <p><label for="f-area">Where you live</label><span class="hint" id="f-area-hint">For example Subang Jaya</span><input id="f-area" name="area" type="text" aria-describedby="f-area-hint" required></p>
    <p><label for="f-skills">Skills</label><span class="hint" id="f-skills-hint">Separate them with commas</span><input id="f-skills" name="skills" type="text" aria-describedby="f-skills-hint"></p>
    <p><label for="f-free">When you are free</label><span class="hint" id="f-free-hint">For example weekdays 9am to 5pm</span><input id="f-free" name="free" type="text" aria-describedby="f-free-hint"></p>
    <p><label for="f-bio">About you</label><textarea id="f-bio" name="bio" rows="4"></textarea></p>
    <button type="submit">Send application</button>
  </form>
</section>`);
}

async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const base = baseUrl(req);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' });
    return res.end();
  }

  // ---- MCP ----
  if (p === '/mcp') {
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); return res.end(); }
    return mcp.handle(req, res, await readBody(req), base, url.searchParams.get('tools') === 'all');
  }

  // ---- API ----
  if (p === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: *\nAllow: /\nDisallow: /reset\n'); }
  if (p === '/health') return json(res, 200, { ok: true, mode: llm.status(), jobs: store.db.jobs.length, students: store.db.students.length, telegram: telegram.health(), version: (process.env.RENDER_GIT_COMMIT || '').slice(0, 7) || 'local' });
  if (p === '/api/config') return json(res, 200, { llm: llm.enabled(), model: llm.enabled() ? llm.MODEL : null, email: !!process.env.RESEND_API_KEY, telegram: telegram.configured() });
  // Pairs a browser for sending hand-offs to WorkBuddy through Telegram (see src/telegram.js).
  if (p === '/api/telegram/check' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    if (!telegram.configured()) return json(res, 200, { ok: false, error: 'Telegram is not set up on this HireBuddy.' });
    return json(res, 200, telegram.keyOk(body.key) ? { ok: true, bot: telegram.BOT } : { ok: false, error: 'That key is not right.' });
  }
  // For a paired browser only: is HireBuddy connected to Telegram, and what has WorkBuddy replied?
  // "test" also sends WorkBuddy a message asking it to reply OK.
  const tm = p.match(/^\/api\/telegram\/(status|test)$/);
  if (tm && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    if (!telegram.keyOk(body.key)) return json(res, 403, { error: 'This browser is not paired.' });
    if (tm[1] === 'test') {
      try { await telegram.send('HireBuddy connection test. Please reply with just: OK'); }
      catch (e) { return json(res, 200, { ...await telegram.status(), sendError: e.message }); }
    }
    return json(res, 200, await telegram.status());
  }

  // Hand Nadia's sentence to WorkBuddy. The website makes a task for the person's own WorkBuddy and follows
  // that run live when it starts. A browser paired through Telegram has the server send it; otherwise the
  // person pastes it.
  const handoffTask = ho => `Use the HireBuddy skill to find me work. My request: "${ho.prompt}"`;
  if (p === '/api/handoffs' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const prompt = String(body.prompt || '').trim().slice(0, 2000);
    if (!prompt) return json(res, 400, { error: 'prompt required' });
    const ho = { id: `ho-${Math.random().toString(36).slice(2, 8)}`, prompt, createdAt: new Date().toISOString(), runId: null };
    store.db.handoffs = (store.db.handoffs || []).concat(ho).slice(-200);
    store.save();
    if (body.key && telegram.keyOk(body.key)) {
      try { await telegram.send(handoffTask(ho)); return json(res, 201, { id: ho.id, task: handoffTask(ho), sent: 'telegram', bot: telegram.BOT }); }
      catch (e) { console.error('telegram hand-off failed:', e.message); return json(res, 201, { id: ho.id, task: handoffTask(ho), sendError: e.message }); }
    }
    return json(res, 201, { id: ho.id, task: handoffTask(ho) });
  }
  const hm = p.match(/^\/api\/handoffs\/(ho-[a-z0-9]+)$/);
  if (hm) {
    const ho = (store.db.handoffs || []).find(h => h.id === hm[1]);
    if (!ho) return json(res, 404, { error: 'not found' });
    const run = ho.runId && store.db.runs.find(r => r.id === ho.runId);
    // The task is included so the HireBuddy bridge on the person's own computer can paste it into WorkBuddy.
    return json(res, 200, { id: ho.id, status: run ? run.status : 'waiting', runId: ho.runId, prompt: ho.prompt, task: handoffTask(ho) });
  }
  if (p === '/api/runs' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const prompt = String(body.prompt || '').trim().slice(0, 2000);
    if (!prompt) return json(res, 400, { error: 'prompt required' });
    const listings = Array.isArray(body.listings) && body.listings.length ? body.listings : null;
    const run = agent.newRun(prompt, ['hirer', 'student'].includes(body.persona) ? body.persona : listings ? 'student' : null, 'web', { listings });
    agent.execute(run, base);
    return json(res, 201, { id: run.id, persona: run.persona, url: `${base}/runs/${run.id}` });
  }
  if (p === '/api/runs' && req.method === 'GET') {
    return json(res, 200, store.db.runs.slice(-30).reverse().map(r => ({ id: r.id, prompt: r.prompt, persona: r.persona, status: r.status, verified: r.verified, createdAt: r.createdAt, source: r.source })));
  }
  let m;
  if ((m = p.match(/^\/api\/runs\/([\w-]+)$/))) {
    const run = store.db.runs.find(r => r.id === m[1]);
    return run ? json(res, 200, { ...run, links: agent.links(run, base) }) : json(res, 404, { error: 'not found' });
  }
  if ((m = p.match(/^\/api\/runs\/([\w-]+)\/stream$/))) {
    const run = store.db.runs.find(r => r.id === m[1]);
    if (!run) return json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    const send = e => res.write(`data: ${JSON.stringify(e)}\n\n`);
    for (const e of run.events) send(e);
    if (!agent.live.has(run.id) && run.status !== 'running') { send({ type: 'end' }); return res.end(); }
    const fn = e => { send(e); if (e.type === 'final') { send({ type: 'end' }); cleanup(); res.end(); } };
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    const cleanup = () => { clearInterval(ping); agent.bus.off(run.id, fn); };
    agent.bus.on(run.id, fn);
    req.on('close', cleanup);
    return;
  }
  if (p === '/api/jobs') {
    return json(res, 200, store.db.jobs.map(j => ({ ...j, url: `${base}/jobs/${j.id}`, applicants: store.db.applications.filter(a => a.jobId === j.id).length })));
  }
  if ((m = p.match(/^\/api\/jobs\/([\w-]+)$/))) {
    const j = store.db.jobs.find(x => x.id === m[1]);
    if (!j) return json(res, 404, { error: 'not found' });
    const applicants = store.db.applications.filter(a => a.jobId === j.id).map(a => {
      const s = store.db.students.find(x => x.id === a.studentId);
      return { applicationId: a.id, name: s?.name, area: s?.area, score: a.score, at: a.at };
    });
    const interviews = store.db.interviews.filter(i => i.jobId === j.id).map(i => ({ name: i.name, when: i.when, start: i.start, status: i.status || 'booked' }));
    return json(res, 200, { ...j, url: `${base}/jobs/${j.id}`, applicants, interviews });
  }
  if (p === '/api/students') return json(res, 200, store.db.students.map(({ email, ...s }) => s));

  // ---- Role views (no passwords: you pick who you are, the browser remembers it) ----
  if (p === '/api/people') {
    const businesses = [...new Set(store.db.jobs.map(j => j.business))].reverse();
    return json(res, 200, {
      students: store.db.students.map(s => ({ id: s.id, name: s.name, area: s.area, campus: s.campus, needs: s.needs ? `${s.needs.vision}, uses ${s.needs.tool}` : null }))
        .sort((a, b) => !!b.needs - !!a.needs),
      businesses: businesses.map(b => ({ name: b, jobs: store.db.jobs.filter(j => j.business === b).length })),
    });
  }
  // A job seeker edits their own description (the agent screens against it) and keeps one resume file.
  if ((m = p.match(/^\/api\/me\/student\/([\w-]+)\/about$/)) && req.method === 'POST') {
    const s = store.db.students.find(x => x.id === m[1]);
    if (!s) return json(res, 404, { error: 'not found' });
    const bio = String(JSON.parse(await readBody(req) || '{}').bio || '').trim().slice(0, 3000);
    if (!bio) return json(res, 400, { error: 'Write something about yourself first.' });
    s.bio = bio;
    store.save();
    return json(res, 200, { ok: true, bio });
  }
  if ((m = p.match(/^\/api\/me\/student\/([\w-]+)\/resume$/))) {
    const s = store.db.students.find(x => x.id === m[1]);
    if (!s) return json(res, 404, { error: 'not found' });
    const file = path.join(RESUMES, `${s.id}`);
    if (req.method === 'GET') {
      if (!s.resume || !fs.existsSync(file)) return json(res, 404, { error: 'no resume' });
      res.writeHead(200, { 'content-type': s.resume.type, 'content-disposition': `inline; filename="${s.resume.name.replace(/[^\w. -]/g, '_')}"` });
      return fs.createReadStream(file).pipe(res);
    }
    if (req.method === 'DELETE') {
      fs.rmSync(file, { force: true });
      delete s.resume;
      store.save();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'PUT') {
      const fname = decodeURIComponent(String(req.headers['x-filename'] || ''));
      // Some browsers send no type for Word files, so fall back to the file's extension.
      let type = String(req.headers['content-type'] || '').split(';')[0];
      if (!RESUME_TYPES[type]) type = Object.keys(RESUME_TYPES).find(t => fname.toLowerCase().endsWith(`.${RESUME_TYPES[t]}`)) || type;
      if (!RESUME_TYPES[type]) return json(res, 415, { error: 'Use a PDF, Word or text file.' });
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > RESUME_MAX) return json(res, 413, { error: 'The file is over 5 MB.' }); chunks.push(c); }
      if (!size) return json(res, 400, { error: 'The file is empty.' });
      fs.mkdirSync(RESUMES, { recursive: true });
      fs.writeFileSync(file, Buffer.concat(chunks));
      const name = (fname || `resume.${RESUME_TYPES[type]}`).slice(0, 120);
      s.resume = { name, type, size, at: new Date().toISOString() };
      store.save();
      return json(res, 200, { ok: true, resume: s.resume });
    }
    return json(res, 405, { error: 'method not allowed' });
  }
  if ((m = p.match(/^\/api\/me\/student\/([\w-]+)$/))) {
    const s = store.db.students.find(x => x.id === m[1]);
    if (!s) return json(res, 404, { error: 'not found' });
    const jobIds = new Set([
      ...store.db.applications.filter(a => a.studentId === s.id).map(a => a.jobId),
      ...store.db.interviews.filter(i => i.studentId === s.id).map(i => i.jobId),
    ]);
    const mine = [...jobIds].map(jid => {
      const j = store.db.jobs.find(x => x.id === jid);
      if (!j) return null;
      const app = store.db.applications.find(a => a.jobId === jid && a.studentId === s.id);
      const iv = store.db.interviews.filter(i => i.jobId === jid && i.studentId === s.id).pop();
      const roundDone = store.db.interviews.some(i => i.jobId === jid);
      const status = iv ? (iv.status === 'declined' ? 'declined' : 'interview') : app?.handoffStatus ? 'requested' : roundDone ? 'not_selected' : 'applied';
      return {
        jobId: j.id, title: j.title, business: j.business, area: j.area, pay: `RM${j.pay}/${j.payUnit}`, url: `${base}/jobs/${j.id}`,
        status, applied: !!app, appliedAt: app?.at || null, score: app?.score ?? L.scoreMatch(j, s).total,
        interview: iv ? { id: iv.id, when: iv.when, whenLong: iv.whenLong || L.fmtLong(new Date(iv.start)), start: iv.start, mode: iv.mode, format: iv.format || null, howToJoin: iv.howToJoin || null,
          status: iv.status || 'booked', meetUrl: iv.meetUrl || null, replanRunId: iv.replanRunId || null } : null,
        access: s.needs ? L.accessFit(j, s) : null,
        updatedAt: iv ? (store.db.emails.find(e => e.interviewId === iv.id)?.at || iv.start) : app?.at,
      };
    }).filter(Boolean).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    // Same matcher the agent uses, so "Suits you" here always agrees with what the agent would apply to.
    const open = require('./src/tools').matchJobs(s, { minPay: s.expectedRate || 0, maxDistanceKm: 60, askAboutTech: true })
      .filter(r => !jobIds.has(r.jobId) && r.legalPay)
      .map(r => { const j = store.db.jobs.find(x => x.id === r.jobId); return { jobId: r.jobId, title: r.title, business: r.business, area: r.area, pay: r.pay,
        schedule: L.describeSchedule(j.schedule), distanceKm: L.distanceKm(j.area, s.area), score: r.score, url: `${base}/jobs/${r.jobId}`,
        workMode: r.workMode, access: s.needs ? r.access : null, suitable: r.suitable, whyNot: r.whyNot }; });
    return json(res, 200, { student: { id: s.id, name: s.name, bio: s.bio || '', resume: s.resume || null, area: s.area, campus: s.campus, skills: s.skills, needs: s.needs || null, minPay: s.expectedRate || null, free: L.describeSchedule(s.availability || {}) }, mine, open });
  }
  if (p === '/api/me/business') {
    const name = url.searchParams.get('name') || '';
    const jobs = store.db.jobs.filter(j => j.business === name).reverse().map(j => {
      const ivs = store.db.interviews.filter(i => i.jobId === j.id).sort((a, b) => a.start.localeCompare(b.start));
      const apps = store.db.applications.filter(a => a.jobId === j.id);
      return {
        id: j.id, title: j.title, area: j.area, pay: `RM${j.pay}/${j.payUnit}`, schedule: L.describeSchedule(j.schedule),
        url: `${base}/jobs/${j.id}`, runId: j.runId || null, createdAt: j.createdAt || null,
        applicants: apps.map(a => ({ name: store.db.students.find(x => x.id === a.studentId)?.name, score: a.score, at: a.at }))
          .sort((a, b) => b.score - a.score),
        interviews: ivs.map(i => ({ name: i.name, when: i.when, status: i.status || 'booked', replanRunId: i.replanRunId || null,
          score: L.scoreMatch(j, store.db.students.find(x => x.id === i.studentId) || {}).total })),
      };
    });
    return json(res, 200, { business: name, jobs });
  }
  // A student answers an interview request. Declining hands the slot back to the agent, which books the next best candidate.
  if ((m = p.match(/^\/api\/interviews\/([\w-]+)\/(accept|decline)$/)) && req.method === 'POST') {
    const iv = store.db.interviews.find(i => i.id === m[1]);
    if (!iv) return json(res, 404, { error: 'not found' });
    if (iv.status === 'declined') return json(res, 409, { error: 'already declined', runId: iv.replanRunId || null });
    if (m[2] === 'accept') { iv.status = 'accepted'; store.save(); return json(res, 200, { ok: true, status: iv.status }); }
    iv.status = 'declined';
    iv.declinedAt = new Date().toISOString();
    const run = iv.bookedBy === 'seeker' ? agent.rescheduleAfterDecline(iv, base) : agent.replanAfterDecline(iv, base);
    return json(res, 200, { ok: true, status: iv.status, runId: run.id, url: `${base}/runs/${run.id}` });
  }
  if (p === '/api/emails') return json(res, 200, store.db.emails.slice(-100).reverse());
  if ((m = p.match(/^\/api\/runs\/([\w-]+)\/listings\/(\d+)\/apply$/)) && req.method === 'POST') {
    res.applicationRequestId = store.id('request');
    console.info('[HireBuddy application]', JSON.stringify({ requestId: res.applicationRequestId, stage: 'received', runId: m[1], listing: m[2] }));
    const body = JSON.parse(await readBody(req) || '{}');
    if (!telegram.configured()) return json(res, 503, { ok: false, error: 'Telegram is not set up. Configure Telegram before sending an application.' });
    if (!telegram.keyOk(body.key)) return json(res, 403, { ok: false, error: 'Pair this browser with Telegram on Find work before sending an application.' });
    const run = store.db.runs.find(r => r.id === m[1]);
    const listing = run?.outside?.[Number(m[2])];
    const student = store.db.students.find(s => s.id === run?.studentId);
    if (!listing || !student) return json(res, 404, { ok: false, error: 'Listing or applicant profile not found for this result.' });
    if (listing.verdict === 'not suitable') return json(res, 409, { ok: false, error: 'This listing does not suit your needs.' });
    const requestId = `${run.id}:outside:${m[2]}`;
    if (listing.applicationHandoff || pendingApplications.has(requestId)) return json(res, 409, { ok: false, error: 'This application has already been requested.' });
    pendingApplications.add(requestId);
    try {
      const data = application.prepare({ id: requestId, title: listing.title, business: listing.employer || 'Hiring team',
        ownerEmail: listing.companyEmail, url: listing.url, description: listing.description,
        area: listing.location, pay: listing.pay, hours: listing.hours, questions: listing.asks }, student, base);
      console.info('[HireBuddy application]', JSON.stringify({ requestId: res.applicationRequestId, stage: 'sending Telegram', recipient: data.to, characters: data.task.length }));
      await telegram.send(data.task);
      listing.applicationHandoff = { at: new Date().toISOString(), status: 'sent to Telegram', applicationData: data };
      store.save();
      return json(res, 200, { ok: true, sent: 'telegram', message: `Application request for ${listing.title} sent to WorkBuddy on Telegram, addressed only to ${mail.APPLICATION_INBOX}. Email delivery is not yet confirmed.` });
    } catch (e) {
      return json(res, 502, { ok: false, error: `Could not send the application request to Telegram: ${e.message}` });
    } finally { pendingApplications.delete(requestId); }
  }
  if ((m = p.match(/^\/api\/jobs\/([\w-]+)\/apply\/([\w-]+)$/)) && req.method === 'POST') {
    res.applicationRequestId = store.id('request');
    console.info('[HireBuddy application]', JSON.stringify({ requestId: res.applicationRequestId, stage: 'received', jobId: m[1], studentId: m[2] }));
    const body = JSON.parse(await readBody(req) || '{}');
    console.log('[HireBuddy application] Telegram handoff request', { jobId: m[1], studentId: m[2], paired: telegram.keyOk(body.key) });
    if (!telegram.configured()) return json(res, 503, { ok: false, error: 'Telegram is not set up. Configure Telegram before sending an application.' });
    if (!telegram.keyOk(body.key)) return json(res, 403, { ok: false, error: 'Pair this browser with Telegram on Find work before sending an application.' });
    const j = store.db.jobs.find(x => x.id === m[1]);
    const s = store.db.students.find(x => x.id === m[2]);
    if (!j || !s) return json(res, 404, { ok: false, error: 'Job or job seeker not found.' });
    if (j.status !== 'open') return json(res, 409, { ok: false, error: 'This job is closed.' });
    if (store.db.applications.some(a => a.jobId === j.id && a.studentId === s.id)) {
      return json(res, 409, { ok: false, error: 'You already applied to this job.' });
    }
    const wage = L.checkWage(j.pay, j.payUnit);
    const fit = L.accessFit(j, s, { minPay: s.expectedRate || 0, maxDistanceKm: 60, askAboutTech: true });
    if (!wage.ok || fit.fit === 'not suitable') return json(res, 409, { ok: false, error: !wage.ok ? wage.message : `This job does not suit your needs: ${fit.blockers.join('; ')}.` });
    const requestId = `${j.id}:${s.id}`;
    if (pendingApplications.has(requestId)) return json(res, 409, { ok: false, error: 'This application is already being sent to Telegram.' });
    pendingApplications.add(requestId);
    try {
      const data = application.prepare(j, s, base);
      console.info('[HireBuddy application]', JSON.stringify({ requestId: res.applicationRequestId, stage: 'sending Telegram', recipient: data.to, characters: data.task.length }));
      await telegram.send(data.task);
      store.db.applications.push({ id: store.id('app'), jobId: j.id, studentId: s.id,
        coverNote: data.body, applicationData: data, at: new Date().toISOString(),
        score: L.scoreMatch(j, s).total, source: 'job card', handoffStatus: 'sent to Telegram' });
      store.save();
      console.log('[HireBuddy application] handed to Telegram', { jobId: j.id, to: data.to, subject: data.subject });
      return json(res, 200, { ok: true, sent: 'telegram', message: `Application request for ${j.title} at ${j.business} sent to Telegram. WorkBuddy will send the email to ${mail.APPLICATION_INBOX}. Email delivery is not yet confirmed.` });
    } catch (e) {
      console.error('[HireBuddy application] Telegram handoff failed', { jobId: j.id, error: e.message });
      return json(res, 502, { ok: false, error: `Could not send the application request to Telegram: ${e.message}` });
    } finally {
      pendingApplications.delete(requestId);
    }
  }
  // Before a demo: one button puts the demo data back to the start (fresh jobs, no applications or runs).
  if (p === '/reset') {
    const token = process.env.RESET_TOKEN;
    let msg = '';
    if (req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      if (token && form.get('token') !== token) msg = '<p class="panel bad" role="alert" tabindex="-1" id="msg">Wrong reset code. Nothing was changed.</p>';
      else { store.reset(); msg = `<p class="panel good" role="status" tabindex="-1" id="msg">Done. The demo data is back to the start: ${store.db.jobs.length} open jobs, no applications, no interviews.</p>`; }
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' });
    return res.end(page('Reset the demo', `<h1>Reset the demo</h1>${msg}
      <p>This removes every application, interview, email and agent run, and puts the demo jobs and people back to the start. Use it just before a demo so the run starts fresh.</p>
      <form method="post" action="/reset">${token ? '<label for="token">Reset code</label><input type="text" id="token" name="token" autocomplete="off">' : ''}
      <p class="actions"><button type="submit">Reset the demo data</button></p></form>`, { scripts: msg ? '<script>document.getElementById("msg").focus()</script>' : '' }));
  }
  if (p === '/api/reset' && req.method === 'POST') {
    const token = process.env.RESET_TOKEN;
    if (token && url.searchParams.get('token') !== token) return json(res, 403, { error: 'bad token' });
    store.reset();
    return json(res, 200, { ok: true });
  }

  // ---- Pages ----
  if (p === '/jobs') {
    const open = [...store.db.jobs].reverse().filter(j => j.status === 'open');
    const list = open.map((j, i) => {
      const access = j.access || {};
      const details = `${j.business}, ${j.area}. RM${j.pay} per ${j.payUnit}. ${L.describeSchedule(j.schedule)}. ${(access.workMode || 'on-site').replace(/^\w/, c => c.toUpperCase())}.`;
      const accessibility = `${access.transit && access.workMode !== 'remote' ? `${access.transit.walkMin}-minute walk from ${access.transit.station}. ` : ''}${(access.assistiveTech || []).length ? `Supports ${access.assistiveTech.join(', ')}. ` : ''}${(access.sightTasks || []).length ? `Tasks needing sight: ${access.sightTasks.join('; ')}.` : 'No tasks needing sight are listed.'}`;
      return `<li class="job-card" tabindex="0" aria-labelledby="job-title-${i}" aria-describedby="job-detail-${i} job-description-${i} job-access-${i} job-action-${i}" data-job-card data-job-id="${esc(j.id)}">
        <h2 id="job-title-${i}"><a tabindex="-1" href="/jobs/${esc(j.id)}">${esc(j.title)}</a></h2>
        <p id="job-detail-${i}">${esc(details)} Must have: ${esc(j.requirements.join(', '))}.${j.niceToHave?.length ? ` Nice to have: ${esc(j.niceToHave.join(', '))}.` : ''}${L.checkWage(j.pay, j.payUnit).ok ? '' : ' <span class="status-word bad">Below the legal minimum wage</span>'}</p>
        <p id="job-description-${i}">${esc(j.description)}</p>
        <p id="job-access-${i}">${esc(accessibility)}</p>
        <p class="actions" id="job-action-${i}"><button type="button" data-apply-job="${esc(j.id)}" data-label="${esc(j.title)} at ${esc(j.business)}">Send application</button> <a href="/jobs/${esc(j.id)}">Read full job details</a></p>
      </li>`;
    }).join('');
    return html(res, 200, page('Open jobs', `<h1>Open jobs (${open.length})</h1><p id="job-help">Press Tab to move through the jobs. Each card is read in full. Press Enter to send an application. <a href="/about#demo-data">Employers here are fictional demo data.</a></p><p id="apply-msg" class="panel" role="status" tabindex="-1" hidden></p><ul class="joblist">${list}</ul>`, { current: '/jobs', scripts: '<script src="/jobs.js"></script>' }));
  }
  if ((m = p.match(/^\/jobs\/([\w-]+)$/))) {
    const j = store.db.jobs.find(x => x.id === m[1]);
    return j ? html(res, 200, jobView(j, base)) : html(res, 404, page('Not found', '<h1>Job not found</h1>'));
  }
  if ((m = p.match(/^\/jobs\/([\w-]+)\/apply$/)) && req.method === 'POST') {
    const j = store.db.jobs.find(x => x.id === m[1]);
    if (!j) return html(res, 404, page('Not found', '<h1>Job not found</h1>'));
    const f = new URLSearchParams(await readBody(req));
    const parse = require('./src/parse');
    const free = f.get('free') || 'weekends';
    const prof = parse.student(`${free}. ${f.get('skills') || ''}`);
    const email = (f.get('email') || '').trim().toLowerCase();
    let s = store.db.students.find(x => x.email === email);
    const fields = {
      name: (f.get('name') || 'Applicant').slice(0, 80), email, area: L.findArea(f.get('area')) || (f.get('area') || '').trim().slice(0, 80) || null,
      skills: (f.get('skills') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
      availability: prof.availability, bio: (f.get('bio') || '').slice(0, 1000), campus: '',
    };
    if (s) Object.assign(s, fields); else { s = { id: store.id('stu'), ...fields }; store.db.students.push(s); }
    if (!store.db.applications.some(a => a.jobId === j.id && a.studentId === s.id)) {
      store.db.applications.push({ id: store.id('app'), jobId: j.id, studentId: s.id, coverNote: fields.bio, at: new Date().toISOString(), score: L.scoreMatch(j, s).total, source: 'web form' });
    }
    store.save();
    return html(res, 200, page('Application sent', `<h1>Application sent</h1><p class="panel good">Thank you, ${esc(s.name)}. Your application for <a href="/jobs/${esc(j.id)}">${esc(j.title)}</a> is in.</p>`));
  }
  if (p === '/outbox') {
    const runFilter = url.searchParams.get('run');
    const mails = store.db.emails.filter(e => !runFilter || e.runId === runFilter).slice(-60).reverse();
    const list = mails.map(e => `<article class="mail" id="${esc(e.id)}" aria-labelledby="${esc(e.id)}-s"><h2 id="${esc(e.id)}-s">${esc(e.subject)}</h2>
<dl class="facts"><dt>To</dt><dd>${esc(e.to)}</dd><dt>Sent</dt><dd>${esc(new Date(e.at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'full', timeStyle: 'short' }))}</dd><dt>Delivered by</dt><dd>${esc(e.delivery?.channel || 'demo outbox')}</dd></dl>
<pre>${esc(e.body)}</pre></article>`).join('') || '<p>No emails yet.</p>';
    return html(res, 200, page('Emails', `<h1>Emails (${mails.length})</h1><p>Every email the agent sends, in plain text with the time and how to join first. Demo addresses (example.com) stay here instead of being delivered.</p>${list}`, { current: '/outbox' }));
  }
  if (p === '/' || p === '/about' || p === '/me' || /^\/runs\/[\w-]+$/.test(p)) {
    const { opts, body } = staticPage(p === '/about' ? 'about.html' : p === '/me' ? 'me.html' : 'home.html');
    return html(res, 200, page(opts.title || 'HireBuddy', body, { current: p.startsWith('/runs/') ? '' : p, scripts: opts.script ? `<script src="${opts.script}"></script>` : '' }));
  }

  // ---- Static ----
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  html(res, 404, page('Not found', '<h1>Not found</h1>'));
}

http.createServer((req, res) => {
  route(req, res).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: e.message }); });
}).listen(PORT, () => { console.log(`HireBuddy on :${PORT} (${llm.status()})`); llm.probe(); telegram.start(); });
