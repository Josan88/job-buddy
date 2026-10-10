#!/usr/bin/env node
// Run the HireBuddy agent from one prompt and print the verified result.
// Usage: node hirebuddy.js "Need a weekend barista in Subang, RM12/hr, start next week"
const BASE = (process.env.HIREBUDDY_URL || 'https://hirebuddy.onrender.com').replace(/\/$/, '');
const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) { console.error('Usage: node hirebuddy.js "<your request>"'); process.exit(1); }

(async () => {
  const start = await fetch(`${BASE}/api/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt }),
  }).then(r => r.json());
  console.log(`Run started: ${start.url}`);
  let run;
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 1000));
    run = await fetch(`${BASE}/api/runs/${start.id}`).then(r => r.json());
    if (run.status !== 'running') break;
  }
  console.log(`\nStatus: ${run.status}${run.verified ? ' (verified)' : ''}`);
  console.log(`\nPlan:\n${run.plan.map(s => `  [${s.status === 'done' ? 'x' : ' '}] ${s.title}`).join('\n')}`);
  const checks = [...run.events].reverse().find(e => e.type === 'checks');
  if (checks) console.log(`\nSelf-checks:\n${checks.checks.map(c => `  ${c.pass ? 'PASS' : 'FAIL'} ${c.name}`).join('\n')}`);
  console.log(`\nResult: ${run.summary}`);
  console.log(`\nLinks:\n${run.links.map(l => `  ${l.label}: ${l.url}`).join('\n')}`);
  process.exit(run.verified ? 0 : 2);
})().catch(e => { console.error(`HireBuddy unreachable at ${BASE}: ${e.message}`); process.exit(1); });
