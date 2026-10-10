// The job seeker's job as four steps that WorkBuddy runs itself: WorkBuddy plans, calls each step,
// decides how to widen the search when there are too few suitable jobs, and saves the results on
// the user's computer. Every result ends with `next`: the exact call to make now, so the client's
// model never has to stop and ask. hirebuddy_run stays as the one-call fallback.
const store = require('./store');
const L = require('./lib');
const parse = require('./parse');
const outside = require('./outside');
const agent = require('./agent');
const { matchJobs } = require('./tools');

const GOAL = agent.SEEKER_GOAL;

function ctxFor(runId, baseUrl) {
  const run = store.db.runs.find(r => r.id === runId && r.source === 'workbuddy');
  if (!run) return null;
  return agent.makeCtx(run, baseUrl);
}
const bad = (msg, next) => ({ ok: false, problem: msg, next });
const student = ctx => store.db.students.find(x => x.id === ctx.run.studentId);
const fileSafe = t => t.replace(/[^\w -]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

function widenFor(ctx, s) {
  return agent.seekerOptions(s, ctx.run.search, !!ctx.run.walkStated).map(o => ({
    change: o.id, what: o.label, adds: o.jobs.map(r => `${r.title} at ${r.business}`),
    allowed: !o.yours, ...(o.yours ? { why_not_allowed: 'This gives up something the user asked for. Only the user can choose it.' } : {}),
  }));
}

const h = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// A small page for the user's own computer: headings and lists a screen reader can jump through,
// no scripts, large text, and works offline.
function resultsPage(s, ivs, run, check, baseUrl) {
  const suitable = matchJobs(s, run.search).filter(r => r.suitable && !r.applied);
  const ok = (run.outside || []).filter(r => r.verdict !== 'not suitable');
  const no = (run.outside || []).filter(r => r.verdict === 'not suitable');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your jobs, ${h(s.name)}</title>
<style>body{font:1.25rem/1.6 system-ui,sans-serif;max-width:44rem;margin:0 auto;padding:1rem;color:#0b0c0c;background:#fff}h1,h2,h3{line-height:1.25}a{color:#003f8a}pre{white-space:pre-wrap;background:#f4f6f5;padding:.75rem;font-size:1rem}li{margin:.5rem 0}
@media (prefers-color-scheme:dark){body{color:#f7f7f5;background:#0d0f0f}a{color:#9ecbff}pre{background:#1a1e1d}}</style></head><body><main>
<h1>Your jobs, ${h(s.name)}</h1>
<p>${check.passed} of ${check.total} checks passed.</p>
<h2>Suitable jobs</h2>
${suitable.length ? `<ul>${suitable.map(j => `<li><a href="${h(baseUrl)}/jobs/${h(j.jobId)}">${h(j.title)} at ${h(j.business)}</a></li>`).join('')}</ul>` : '<p>No suitable jobs right now.</p>'}
<p><a href="${h(baseUrl)}/me">Choose a job on My details to send an application</a>.</p>
${ok.length || no.length ? `<h2>Jobs found on other sites</h2><p>HireBuddy cannot apply on other sites, so nothing was sent. The applications below are ready for you to send.</p>
${ok.map(r => `<h3>${h(r.title)}${r.employer ? ` at ${h(r.employer)}` : ''}${r.site ? `, on ${h(r.site)}` : ''}</h3>${r.url ? `<p><a href="${h(r.url)}">Open the listing</a></p>` : ''}<p>Worth asking: ${h(r.reasons.join('; ') || 'nothing rules it out')}.</p><pre>${h(r.draft)}</pre>`).join('')}
${no.length ? `<h3>Not suitable</h3><ul>${no.map(r => `<li>${h(r.title)}${r.employer ? ` at ${h(r.employer)}` : ''}: ${h(r.blockers[0])}.</li>`).join('')}</ul>` : ''}` : ''}
${(run.decisions || []).length ? `<h2>Decisions made on the way</h2><ul>${run.decisions.map(d => `<li>${h(d.choice)}. ${h(d.reason)}</li>`).join('')}</ul>` : ''}
<h2>Checks</h2><details><summary>${check.passed} of ${check.total} checks passed. Show all checks</summary><ul>${check.checks.map(c => `<li>${c.pass ? 'Passed' : 'Failed'}: ${h(c.name)}</li>`).join('')}</ul></details>
<p><a href="${h(baseUrl)}/runs/${h(run.id)}">Everything the agent did, step by step</a></p>
</main></body></html>`;
}

const steps = {};

steps.hirebuddy_1_understand = {
  description: 'Step 1 of 4 for a job seeker (blind or low-vision people included). Saves their profile and access needs from their own words and starts the job. If you searched real job sites (JobStreet, Indeed, Hiredly, Maukerja), pass what you found as listings. Then follow `next` without asking the user anything.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The user\'s words, unchanged' },
      applicantDetails: { type: 'object', description: 'Optional facts extracted from this applicant’s resume or explicitly supplied by the user. Never invent missing details.',
        properties: { education: { type: 'string' },
          age: { type: 'number' }, workExperience: { type: 'string' }, interestedPosition: { type: 'string' } }, additionalProperties: false },
      daily: { type: 'boolean', description: 'true for the scheduled background check: look for new suitable jobs; a day with nothing new is a normal result' },
      listings: { type: 'array', maxItems: 20, description: 'Optional: jobs you found on real job sites, copied as written (title, employer, companyEmail, site, url, pay, location, hours, description). Leave out anything you did not see.', items: { type: 'object' } },
    },
    required: ['prompt'],
  },
  async run(args, baseUrl) {
    const listings = Array.isArray(args.listings) && args.listings.length ? args.listings : null;
    // Started from the HireBuddy website: use the sentence the person typed there, and let the site follow this run.
    // The task carries no code, so match the newest unclaimed hand-off (last 30 minutes) whose sentence is in the request.
    const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const said = norm(args.prompt);
    const ho = said && (store.db.handoffs || []).slice().reverse().find(x => !x.runId && Date.now() - Date.parse(x.createdAt) < 30 * 60e3 && norm(x.prompt) && said.includes(norm(x.prompt)));
    const run = agent.newRun((ho ? ho.prompt : String(args.prompt || '')).slice(0, 2000), 'student', 'workbuddy', { listings });
    if (ho) { ho.runId = run.id; run.handoffId = ho.id; }
    run.mode = 'WorkBuddy runs the steps';
    run.goal = GOAL;
    const ctx = agent.makeCtx(run, baseUrl);
    ctx.emit({ type: 'start', prompt: run.prompt, persona: run.persona, mode: run.mode });
    await agent.callTool(ctx, 'set_plan', { steps: [
      { title: 'WorkBuddy: save your profile and needs', tool: 'register_student' },
      { title: 'WorkBuddy: check every job, including the ones it found on job sites', tool: 'search_jobs' },
      { title: 'WorkBuddy: prepare suitable jobs for your selection', tool: 'apply_to_job' },
      { title: 'WorkBuddy: check everything again', tool: 'verify_applications' },
      { title: 'WorkBuddy: get the files to save on your computer', tool: 'finish' },
    ] });
    const p = parse.student(run.prompt);
    const reg = await agent.callTool(ctx, 'register_student', { name: p.name, email: p.email || undefined, area: p.area, campus: p.campus || undefined, skills: p.skills,
      availability: p.availability, expectedRate: p.expectedRate || undefined, bio: p.bio, needs: p.needs || undefined,
      education: args.applicantDetails?.education,
      age: args.applicantDetails?.age, workExperience: args.applicantDetails?.workExperience, interestedPosition: args.applicantDetails?.interestedPosition });
    if (!reg.ok) return bad((reg.problems || [reg.error]).join(' '), 'Tell the user what is missing in one sentence.');
    const s = student(ctx);
    run.search = { maxDistanceKm: 25, minPay: p.minPay || 0, maxWalkMin: p.needs?.maxWalkMin, askAboutTech: false };
    run.walkStated = !!p.needs?.walkStated;
    run.daily = !!args.daily || /hirebuddy daily check/i.test(String(args.prompt || ''));
    store.save();
    const n = s.needs;
    return {
      ok: true, runId: run.id, liveLog: `${baseUrl}/runs/${run.id}`,
      understood: `${s.name}, ${s.area || 'area not given'}, free ${L.describeSchedule(s.availability)}, skills ${s.skills.join(', ')}`
        + `${n ? `. ${n.vision}, uses ${n.tool}${n.remoteOnly ? ', remote work only' : `, up to a ${n.maxWalkMin || L.DEFAULT_WALK}-minute walk from a stop`}` : ''}`
        + `${s.expectedRate ? `. At least RM${s.expectedRate} an hour` : ''}.`,
      goal: `${GOAL} suitable jobs`, jobsFromOtherSites: outside.clean(listings || []).length,
      plan: ['1. Understand (done)', '2. hirebuddy_2_check_jobs', '3. hirebuddy_3_apply_and_book prepares jobs for manual selection', '4. hirebuddy_4_verify', '5. Save the files it returns on the user\'s computer'],
      next: `Call hirebuddy_2_check_jobs now with runId "${run.id}". Do not ask the user anything.`,
    };
  },
};

steps.hirebuddy_2_check_jobs = {
  description: 'Step 2 of 4. Checks every open job, and the jobs you found on job sites, against the user: legal pay, their pay floor, tasks that need sight, screen reader support, hours and travel. Returns the suitable jobs with ids. To widen the search, call it again with `change` set to one of the allowed options it returned and your reason. Then follow `next`.',
  inputSchema: {
    type: 'object',
    properties: {
      runId: { type: 'string' },
      change: { type: 'string', enum: ['ask_about_screen_reader', 'whole_klang_valley', 'walk_15_minutes', 'lower_pay_floor'], description: 'Optional: widen the search with one allowed option from the last result' },
      reason: { type: 'string', description: 'Required with change: why you chose it, in one sentence' },
      listings: { type: 'array', maxItems: 20, description: 'Optional: jobs you found on job sites, if you searched while step 1 ran. Same shape as in step 1.', items: { type: 'object' } },
    },
    required: ['runId'],
  },
  async run(args, baseUrl) {
    const ctx = ctxFor(args.runId, baseUrl);
    if (!ctx) return bad('Unknown runId.', 'Start again with hirebuddy_1_understand.');
    const s = student(ctx);
    if (args.change) {
      const opts = widenFor(ctx, s);
      const o = opts.find(x => x.change === args.change);
      if (!o) return bad(`"${args.change}" is not available now. Options: ${opts.map(x => x.change).join(', ') || 'none'}.`, `Call hirebuddy_4_verify with runId "${ctx.run.id}".`);
      if (!o.allowed) return bad(`"${args.change}" gives up something ${s.name} asked for, so only they can choose it.`, `Call hirebuddy_4_verify with runId "${ctx.run.id}"; the result will tell the user what this option would add.`);
      const real = agent.seekerOptions(s, ctx.run.search, ctx.run.walkStated).find(x => x.id === args.change);
      await agent.callTool(ctx, 'log_decision', {
        situation: 'WorkBuddy is widening the job search.',
        options: opts.map(x => `${x.what} (${x.adds.length ? `+${x.adds.length}` : 'adds nothing'}${x.allowed ? '' : ', needs your OK'})`),
        choice: o.what, reason: `WorkBuddy: ${String(args.reason || 'it adds jobs without giving up a stated need').slice(0, 300)}`,
      });
      Object.assign(ctx.run.search, real.change);
    }
    if (Array.isArray(args.listings) && args.listings.length && !ctx.run.outside) ctx.run.options = { ...ctx.run.options, listings: args.listings };
    const found = await agent.callTool(ctx, 'search_jobs', { studentId: s.id, ...ctx.run.search });
    let other = [];
    if (ctx.run.options?.listings?.length && !ctx.run.outside) other = (await agent.callTool(ctx, 'check_outside_listings', { studentId: s.id })).results || [];
    const suitable = found.results.filter(r => r.suitable && !r.applied);
    const need = GOAL;
    const widen = suitable.length < need ? widenFor(ctx, s).filter(o => o.adds.length) : [];
    const allowed = widen.filter(o => o.allowed);
    store.save();
    return {
      ok: true,
      suitable: suitable.map(r => ({ jobId: r.jobId, job: `${r.title} at ${r.business}`, pay: r.pay, score: r.score, why: [...r.access.reasons, ...r.access.asks].join('; ') })),
      notSuitable: found.results.filter(r => !r.suitable && !r.applied && r.score >= 40).slice(0, 6).map(r => `${r.title} at ${r.business}: ${r.whyNot}`),
      jobsFromOtherSites: other.map(r => ({ job: `${r.title}${r.employer ? ` at ${r.employer}` : ''}`, site: r.site, verdict: r.verdict, why: (r.verdict === 'not suitable' ? r.blockers : r.reasons).join('; '), questionsForEmployer: r.asks })),
      suitableJobsFound: suitable.length,
      ...(widen.length ? { widenOptions: widen } : {}),
      next: suitable.length >= GOAL ? `Call hirebuddy_4_verify now with runId "${ctx.run.id}".`
        : suitable.length
        ? `Call hirebuddy_3_apply_and_book now with runId "${ctx.run.id}" and jobIds ${JSON.stringify(suitable.slice(0, need).map(r => r.jobId))}.`
        : allowed.length
          ? `No suitable job left. Pick the allowed option that adds jobs without giving up anything the user asked for, then call hirebuddy_2_check_jobs with runId "${ctx.run.id}", change and your reason. (Suggested: ${allowed[0].change}.)`
          : `Call hirebuddy_4_verify now with runId "${ctx.run.id}".`,
    };
  },
};

steps.hirebuddy_3_apply_and_book = {
  description: 'Step 3 of 4. Leaves suitable jobs for the user to select and apply manually. Then follow next.',
  inputSchema: {
    type: 'object',
    properties: { runId: { type: 'string' }, jobIds: { type: 'array', items: { type: 'string' }, maxItems: 3 } },
    required: ['runId', 'jobIds'],
  },
  async run(args, baseUrl) {
    const ctx = ctxFor(args.runId, baseUrl);
    if (!ctx) return bad('Unknown runId.', 'Start again with hirebuddy_1_understand.');
    return { ok: true, message: 'Choose a suitable job on My details to send an application.', next: `Call hirebuddy_4_verify now with runId "${ctx.run.id}".` };
  },
};

steps.hirebuddy_4_verify = {
  description: 'Step 4 of 4. Re-checks everything (pay, access, and the job-site listings), writes the summary for the user, and returns the files to save on their computer. Then save the files and give the user the summary.',
  inputSchema: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'] },
  async run(args, baseUrl) {
    const ctx = ctxFor(args.runId, baseUrl);
    if (!ctx) return bad('Unknown runId.', 'Start again with hirebuddy_1_understand.');
    const run = ctx.run, s = student(ctx);
    if (run.options?.listings?.length && !run.outside) await agent.callTool(ctx, 'check_outside_listings', { studentId: s.id });
    const ivs = [];
    const check = await agent.callTool(ctx, 'verify_applications', { studentId: s.id });
    const suitable = matchJobs(s, run.search).filter(r => r.suitable && !r.applied);
    const summary = `Found ${suitable.length} suitable jobs. Choose a job on My details to send an application.${outside.summarise(run.outside || [])} ${check.passed} of ${check.total} checks passed.`;
    if (check.pass) await agent.callTool(ctx, 'finish', { summary });
    run.status = run.done ? 'done' : 'incomplete';
    ctx.emit({ type: 'final', status: run.status, verified: run.verified, summary: run.summary, plan: run.plan, links: agent.links(run, baseUrl) });
    store.save();
    const folder = `HireBuddy - ${fileSafe(s.name)}`;
    const files = [
      { path: `${folder}/Results.html`, content: resultsPage(s, ivs, run, check, baseUrl), open: true },
      { path: `${folder}/Summary.txt`, content: `${summary}\n\nRun log: ${baseUrl}/runs/${run.id}\n` },
      ...(run.outside || []).filter(r => r.draft).map(r => ({ path: `${folder}/Application - ${fileSafe(r.employer || r.title)}.txt`, content: r.draft })),
    ];
    return {
      ok: check.pass, verified: check.pass, summary,
      selfChecks: check.checks.map(c => `${c.pass ? 'PASS' : 'FAIL'} ${c.name}`),
      saveToComputer: { folder: `Documents/${folder}`, files },
      runLog: `${baseUrl}/runs/${run.id}`,
      next: check.pass && run.daily
        ? `Daily check done. Save every file in saveToComputer into the user's Documents folder, replacing the old ones. Then tell the user in one or two short sentences only what is new today (or that nothing new suits them yet). Do not ask anything.`
        : check.pass
        ? `Save every file in saveToComputer into the user's Documents folder (write each file's content exactly as given), and open Results.html in your preview if you can. Then give the user the summary in short plain sentences for a screen reader: suitable jobs first, then the jobs from other sites (drafted, not sent), then "${check.passed} of ${check.total} checks passed" and where the files are. If the user is messaging you from a chat app such as Telegram, they are not at the computer: still save the files but skip the preview, write plain text with no Markdown, and end with the run log link ${baseUrl}/runs/${run.id} instead of the folder. Do not ask anything else.`
        : 'Tell the user which checks failed, in one sentence each.',
    };
  },
};

module.exports = { steps };
