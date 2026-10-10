#!/usr/bin/env node
// Run the HireBuddy agent from one prompt and print the verified result.
// Usage: node hirebuddy.js "Need a weekend barista in Subang, RM12/hr, start next week"
const BASE = (process.env.HIREBUDDY_URL || 'https://hirebuddy-k543.onrender.com').replace(/\/$/, '');
// Optional: --listings found.json, a JSON array of jobs WorkBuddy found on other job sites.
const args = process.argv.slice(2);
let listings;
const li = args.indexOf('--listings');
if (li >= 0) { listings = JSON.parse(require('fs').readFileSync(args[li + 1], 'utf8')); args.splice(li, 2); }
const prompt = args.join(' ').trim();
if (!prompt) { console.error('Usage: node hirebuddy.js [--listings found.json] "<your request>"'); process.exit(1); }

(async () => {
  const start = await fetch(`${BASE}/api/runs`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, listings }),
  }).then(r => r.json());
  console.log(`Run started: ${start.url}`);
  let run;
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 1000));
    run = await fetch(`${BASE}/api/runs/${start.id}`).then(r => r.json());
    if (run.status !== 'running') break;
  }
  // Result first: a screen reader user hears the answer before the detail.
  console.log(`\nResult (${run.status}${run.verified ? ', verified' : ''}):\n${run.summary}`);
  const checks = [...run.events].reverse().find(e => e.type === 'checks');
  if (checks) console.log(`\nSelf-checks: ${checks.checks.filter(c => c.pass).length} of ${checks.checks.length} passed.${checks.checks.filter(c => !c.pass).map(c => `\n  FAILED: ${c.name}`).join('')}`);
  console.log(`\nPlan:\n${run.plan.map((s, i) => `  ${i + 1}. ${s.title} (${s.status === 'done' ? 'done' : s.status === 'skipped' ? 'skipped' : 'not done'})`).join('\n')}`);
  console.log(`\nLinks:\n${run.links.map(l => `  ${l.label}: ${l.url}`).join('\n')}`);
  process.exit(run.verified ? 0 : 2);
})().catch(e => { console.error(`HireBuddy unreachable at ${BASE}: ${e.message}`); process.exit(1); });
