// End-to-end check: boots the server on a spare port with a fresh data dir and runs every demo flow.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3999;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hirebuddy-'));
const env = { ...process.env, PORT, DATA_DIR: dir, LLM_API_KEY: '', PUBLIC_URL: '', RENDER_EXTERNAL_URL: '' };
const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'inherit' });
const base = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run(prompt) {
  const { id } = await fetch(`${base}/api/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }) }).then(r => r.json());
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    const r = await fetch(`${base}/api/runs/${id}`).then(r => r.json());
    if (r.status !== 'running') return r;
  }
  throw new Error('timeout');
}

const cases = [
  ['hirer', 'Need a weekend barista in Subang, RM12/hr, start next week', r => r.verified && r.jobId && r.interviews.length >= 2],
  ['illegal wage', 'Need a cashier for my kedai in USJ, RM7/hr, weekends', r => r.verified && !r.jobId && /below the legal minimum/.test(r.summary)],
  ['student', "I'm Aisyah from Sunway University, living in Bandar Sunway. I can make espresso and do latte art, good with customers. Free weekends 8am-2pm, want at least RM11/hr.", r => r.verified && r.persona === 'student' && r.applications.length >= 1],
  ['RM8.50 refused', 'Need a part-time barista in Subang Jaya, RM8.50/hr, weekends', r => r.verified && !r.jobId && /RM8.72/.test(r.summary)],
  ['tutor', 'Looking for an SPM maths tutor in Subang Jaya, RM30/hr, Saturday mornings', r => r.verified && r.interviews.length >= 1],
  ['replans (Cyberjaya)', 'Need 3 weekend baristas in Cyberjaya, must have latte art and Mandarin, RM13/hr',
    r => r.verified && (r.decisions || []).length >= 2 && r.interviews.length >= 2 && r.events.some(e => e.tool === 'relax_requirement' && e.ok)],
];

(async () => {
  await sleep(800);
  let fail = 0;
  for (const [name, prompt, ok] of cases) {
    const r = await run(prompt);
    const pass = !!ok(r);
    if (!pass) fail++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${r.summary}`);
  }
  const aina = await fetch(`${base}/api/me/student/stu-aina`).then(r => r.json());
  const booked = aina.mine.some(a => a.status === 'interview' && a.interview?.when);
  if (!booked) fail++;
  console.log(`${booked ? 'PASS' : 'FAIL'} student view: Aina sees ${aina.mine.map(a => `${a.title}=${a.status}`).join(', ')}`);
  // Aina declines her MIXUE-style interview: the agent must book the next best person, never Aina again.
  const ainaIv = aina.mine.find(a => a.status === 'interview' && a.title === 'Weekend Barista' && a.area === 'Subang Jaya')?.interview;
  const dec = await fetch(`${base}/api/interviews/${ainaIv.id}/decline`, { method: 'POST' }).then(r => r.json());
  let rr;
  for (let i = 0; i < 60; i++) { await sleep(250); rr = await fetch(`${base}/api/runs/${dec.runId}`).then(r => r.json()); if (rr.status !== 'running') break; }
  const after = await fetch(`${base}/api/me/student/stu-aina`).then(r => r.json());
  const replacement = rr.interviews.length === 1 && !rr.events.some(e => e.tool === 'schedule_interviews' && e.result?.scheduled?.some(s => s.candidateId === 'stu-aina'));
  const declineOk = rr.verified && rr.source === 'decline' && replacement && rr.decisions.length >= 1 && after.mine.some(a => a.status === 'declined');
  if (!declineOk) fail++;
  console.log(`${declineOk ? 'PASS' : 'FAIL'} decline: ${rr.summary}`);
  const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }).then(r => r.json());
  const mcpOk = mcp.result.tools.some(t => t.name === 'hirebuddy_run');
  if (!mcpOk) fail++;
  console.log(`${mcpOk ? 'PASS' : 'FAIL'} mcp: ${mcp.result.tools.length} tools listed`);
  srv.kill();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
