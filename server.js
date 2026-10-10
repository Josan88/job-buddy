// HireBuddy web server: live agent console, public job pages, outbox, calendar files, REST + MCP endpoints.
const http = require('http');
const fs = require('fs');
const path = require('path');
const store = require('./src/store');
const L = require('./src/lib');
const agent = require('./src/agent');
const mcp = require('./src/mcp');
const llm = require('./src/llm');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function json(res, status, data) {
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

function page(title, inner) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/style.css"></head>
<body><header class="top"><a class="brand" href="/"><img src="/favicon.svg" alt="" width="26" height="26">HireBuddy</a>
<nav><a href="/">Agent</a><a href="/jobs">Jobs</a><a href="/outbox">Outbox</a><a href="/about">How it works</a></nav></header>
<main class="wrap">${inner}</main></body></html>`;
}

function jobView(j, base) {
  const apps = store.db.applications.filter(a => a.jobId === j.id);
  const wage = L.checkWage(j.pay, j.payUnit);
  return page(`${j.title} · ${j.business}`, `
<article class="card job">
  <p class="eyebrow">${esc(j.business)} · ${esc(j.area)}</p>
  <h1>${esc(j.title)}</h1>
  <div class="chips"><span class="chip">RM${esc(j.pay)} / ${esc(j.payUnit)}</span><span class="chip">${esc(L.describeSchedule(j.schedule))}</span>
  ${j.startDate ? `<span class="chip">Starts ${esc(j.startDate)}</span>` : ''}<span class="chip ${wage.ok ? 'ok' : 'bad'}">${wage.ok ? 'Legal minimum wage met' : 'Below minimum wage'}</span></div>
  <p>${esc(j.description)}</p>
  <h3>Must have</h3><p>${j.requirements.map(r => `<span class="tag">${esc(r)}</span>`).join(' ')}</p>
  ${j.niceToHave?.length ? `<h3>Nice to have</h3><p>${j.niceToHave.map(r => `<span class="tag soft">${esc(r)}</span>`).join(' ')}</p>` : ''}
  <p class="muted">${apps.length} applicant${apps.length === 1 ? '' : 's'} so far · posted ${esc((j.createdAt || '').slice(0, 10) || 'earlier')}${j.runId ? ` by <a href="/runs/${esc(j.runId)}">the HireBuddy agent</a>` : ''}</p>
</article>
<section class="card">
  <h2>Apply in 30 seconds</h2>
  <form method="post" action="/jobs/${esc(j.id)}/apply" class="form">
    <label>Name<input name="name" required></label>
    <label>Email<input name="email" type="email" required></label>
    <label>Area<input name="area" placeholder="e.g. Subang Jaya" required></label>
    <label>Skills (comma separated)<input name="skills" placeholder="espresso, customer service"></label>
    <label>When are you free?<input name="free" placeholder="weekends 8am-2pm"></label>
    <label>About you<textarea name="bio" rows="3" placeholder="Your experience in a few sentences"></textarea></label>
    <button>Apply</button>
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
    return mcp.handle(req, res, await readBody(req), base);
  }

  // ---- API ----
  if (p === '/health') return json(res, 200, { ok: true, mode: llm.enabled() ? `llm:${llm.MODEL}` : 'autopilot', jobs: store.db.jobs.length, students: store.db.students.length });
  if (p === '/api/config') return json(res, 200, { llm: llm.enabled(), model: llm.enabled() ? llm.MODEL : null, email: !!process.env.RESEND_API_KEY });

  if (p === '/api/runs' && req.method === 'POST') {
    const body = JSON.parse(await readBody(req) || '{}');
    const prompt = String(body.prompt || '').trim().slice(0, 2000);
    if (!prompt) return json(res, 400, { error: 'prompt required' });
    const run = agent.newRun(prompt, ['hirer', 'student'].includes(body.persona) ? body.persona : null);
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
    if (!agent.live.has(run.id)) { send({ type: 'end' }); return res.end(); }
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
    const interviews = store.db.interviews.filter(i => i.jobId === j.id).map(i => ({ name: i.name, when: i.when, start: i.start, ics: `${base}/ics/${i.id}.ics` }));
    return json(res, 200, { ...j, url: `${base}/jobs/${j.id}`, applicants, interviews });
  }
  if (p === '/api/students') return json(res, 200, store.db.students.map(({ email, ...s }) => s));
  if (p === '/api/emails') return json(res, 200, store.db.emails.slice(-100).reverse());
  if (p === '/api/reset' && req.method === 'POST') {
    const token = process.env.RESET_TOKEN;
    if (token && url.searchParams.get('token') !== token) return json(res, 403, { error: 'bad token' });
    store.reset();
    return json(res, 200, { ok: true });
  }

  // ---- Calendar files ----
  if ((m = p.match(/^\/ics\/([\w-]+)\.ics$/))) {
    const iv = store.db.interviews.find(i => i.id === m[1]);
    if (!iv) return json(res, 404, { error: 'not found' });
    const j = store.db.jobs.find(x => x.id === iv.jobId);
    const body = L.makeIcs({
      uid: iv.id, start: new Date(iv.start), end: new Date(iv.end),
      summary: `Interview: ${j.title} (${j.business})`, description: `Interview with ${iv.name}. Job: ${base}/jobs/${j.id}`,
      location: iv.mode, organizer: j.ownerEmail || undefined, attendee: iv.email,
    });
    res.writeHead(200, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': `attachment; filename="interview-${iv.id}.ics"` });
    return res.end(body);
  }

  // ---- Pages ----
  if (p === '/jobs') {
    const list = [...store.db.jobs].reverse().map(j => `<a class="card row" href="/jobs/${esc(j.id)}"><div><strong>${esc(j.title)}</strong><br><span class="muted">${esc(j.business)} · ${esc(j.area)}</span></div><span class="chip">RM${esc(j.pay)}/${esc(j.payUnit)}</span></a>`).join('');
    return html(res, 200, page('Open jobs', `<h1>Open jobs</h1>${list}`));
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
      name: (f.get('name') || 'Applicant').slice(0, 80), email, area: L.findArea(f.get('area')) || f.get('area') || 'Subang Jaya',
      skills: (f.get('skills') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean),
      availability: prof.availability, bio: (f.get('bio') || '').slice(0, 1000), campus: '',
    };
    if (s) Object.assign(s, fields); else { s = { id: store.id('stu'), ...fields }; store.db.students.push(s); }
    if (!store.db.applications.some(a => a.jobId === j.id && a.studentId === s.id)) {
      store.db.applications.push({ id: store.id('app'), jobId: j.id, studentId: s.id, coverNote: fields.bio, at: new Date().toISOString(), score: L.scoreMatch(j, s).total, source: 'web form' });
    }
    store.save();
    return html(res, 200, page('Applied', `<section class="card"><h1>Thanks, ${esc(s.name)}!</h1><p>Your application for <a href="/jobs/${esc(j.id)}">${esc(j.title)}</a> is in. The next time the owner runs HireBuddy you'll be screened automatically.</p></section>`));
  }
  if (p === '/outbox') {
    const runFilter = url.searchParams.get('run');
    const mails = store.db.emails.filter(e => !runFilter || e.runId === runFilter).slice(-60).reverse();
    const list = mails.map(e => `<article class="card mail" id="${esc(e.id)}"><p class="eyebrow">${esc(e.kind)} · ${esc(new Date(e.at).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' }))} · ${esc(e.delivery?.channel || '')}</p>
<h3>${esc(e.subject)}</h3><p class="muted">To: ${esc(e.to)}</p><pre>${esc(e.body)}</pre>${e.attachment ? `<p><a href="${esc(e.attachment)}">📎 interview.ics</a></p>` : ''}</article>`).join('') || '<p class="muted">No emails yet.</p>';
    return html(res, 200, page('Outbox', `<h1>Outbox</h1><p class="muted">Every email the agent sends. Demo addresses (example.com) are kept here instead of being delivered.</p>${list}`));
  }
  if (p === '/' || p === '/about' || /^\/runs\/[\w-]+$/.test(p)) {
    return fs.createReadStream(path.join(PUBLIC, p === '/about' ? 'about.html' : 'index.html')).pipe((res.writeHead(200, { 'content-type': TYPES['.html'] }), res));
  }

  // ---- Static ----
  const file = path.join(PUBLIC, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  html(res, 404, page('Not found', '<h1>Not found</h1>'));
}

http.createServer((req, res) => {
  route(req, res).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: e.message }); });
}).listen(PORT, () => console.log(`HireBuddy on :${PORT} (${llm.enabled() ? `LLM ${llm.MODEL}` : 'autopilot'})`));
