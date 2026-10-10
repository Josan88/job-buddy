// The job seeker's job as four steps that WorkBuddy runs itself: WorkBuddy plans, calls each step,
// decides how to widen the search when there are too few interviews, and saves the results on
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
const active = ctx => store.db.interviews.filter(i => (ctx.run.interviews || []).includes(i.id) && i.status !== 'declined');
const fileSafe = t => t.replace(/[^\w -]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

function widenFor(ctx, s) {
  return agent.seekerOptions(s, ctx.run.search, !!ctx.run.walkStated).map(o => ({
    change: o.id, what: o.label, adds: o.jobs.map(r => `${r.title} at ${r.business}`),
    allowed: !o.yours, ...(o.yours ? { why_not_allowed: 'This gives up something the user asked for. Only the user can choose it.' } : {}),
  }));
}

const steps = {};

steps.hirebuddy_1_understand = {
  description: 'Step 1 of 4 for a job seeker (blind or low-vision people included). Saves their profile and access needs from their own words and starts the job. If you searched real job sites (JobStreet, Indeed, Hiredly, Maukerja), pass what you found as listings. Then follow `next` without asking the user anything.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The user\'s words, unchanged' },
      listings: { type: 'array', maxItems: 20, description: 'Optional: jobs you found on real job sites, copied as written (title, employer, site, url, pay, location, hours, description). Leave out anything you did not see.', items: { type: 'object' } },
    },
    required: ['prompt'],
  },
  async run(args, baseUrl) {
    const listings = Array.isArray(args.listings) && args.listings.length ? args.listings : null;
    const run = agent.newRun(String(args.prompt || '').slice(0, 2000), 'student', 'workbuddy', { listings });
    run.mode = 'WorkBuddy runs the steps';
    run.goal = GOAL;
    const ctx = agent.makeCtx(run, baseUrl);
    ctx.emit({ type: 'start', prompt: run.prompt, persona: run.persona, mode: run.mode });
    await agent.callTool(ctx, 'set_plan', { steps: [
      { title: 'WorkBuddy: save your profile and needs', tool: 'register_student' },
      { title: 'WorkBuddy: check every job, including the ones it found on job sites', tool: 'search_jobs' },
      { title: 'WorkBuddy: apply and book interviews, widening the search if needed', tool: 'apply_to_job' },
      { title: 'WorkBuddy: check everything again', tool: 'verify_applications' },
      { title: 'WorkBuddy: get the files to save on your computer', tool: 'finish' },
    ] });
    const p = parse.student(run.prompt);
    const reg = await agent.callTool(ctx, 'register_student', { name: p.name, email: p.email || undefined, area: p.area, campus: p.campus || undefined, skills: p.skills,
      availability: p.availability, expectedRate: p.expectedRate || undefined, bio: p.bio, needs: p.needs || undefined });
    if (!reg.ok) return bad((reg.problems || [reg.error]).join(' '), 'Tell the user what is missing in one sentence.');
    const s = student(ctx);
    run.search = { maxDistanceKm: 25, minPay: p.minPay || 0, maxWalkMin: p.needs?.maxWalkMin, askAboutTech: false };
    run.walkStated = !!p.needs?.walkStated;
    // Interviews already booked (a rehearsal or a second visit) still count toward the goal.
    const kept = store.db.interviews.filter(i => i.studentId === s.id && i.status !== 'declined' && new Date(i.start) > new Date()).slice(0, GOAL);
    run.interviews = kept.map(i => i.id);
    store.save();
    const n = s.needs;
    return {
      ok: true, runId: run.id, liveLog: `${baseUrl}/runs/${run.id}`,
      understood: `${s.name}, ${s.area}, free ${L.describeSchedule(s.availability)}, skills ${s.skills.join(', ')}`
        + `${n ? `. ${n.vision}, uses ${n.tool}${n.remoteOnly ? ', remote work only' : `, up to a ${n.maxWalkMin || L.DEFAULT_WALK}-minute walk from a stop`}${n.interviewFormat ? `, ${n.interviewFormat} interviews` : ''}` : ''}`
        + `${s.expectedRate ? `. At least RM${s.expectedRate} an hour` : ''}.`,
      goal: `${GOAL} interviews`, alreadyBooked: kept.length, jobsFromOtherSites: outside.clean(listings || []).length,
      plan: ['1. Understand (done)', '2. hirebuddy_2_check_jobs', `3. hirebuddy_3_apply_and_book, then widen with step 2 if fewer than ${GOAL} interviews`, '4. hirebuddy_4_verify', '5. Save the files it returns on the user\'s computer'],
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
        situation: `${active(ctx).length} of ${GOAL} interviews booked; WorkBuddy is widening the search.`,
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
    const need = GOAL - active(ctx).length;
    const widen = suitable.length < need ? widenFor(ctx, s).filter(o => o.adds.length) : [];
    const allowed = widen.filter(o => o.allowed);
    store.save();
    return {
      ok: true,
      suitable: suitable.map(r => ({ jobId: r.jobId, job: `${r.title} at ${r.business}`, pay: r.pay, score: r.score, why: [...r.access.reasons, ...r.access.asks].join('; ') })),
      notSuitable: found.results.filter(r => !r.suitable && !r.applied && r.score >= 40).slice(0, 6).map(r => `${r.title} at ${r.business}: ${r.whyNot}`),
      jobsFromOtherSites: other.map(r => ({ job: `${r.title}${r.employer ? ` at ${r.employer}` : ''}`, site: r.site, verdict: r.verdict, why: (r.verdict === 'not suitable' ? r.blockers : r.reasons).join('; '), questionsForEmployer: r.asks })),
      interviewsStillNeeded: need,
      ...(widen.length ? { widenOptions: widen } : {}),
      next: need <= 0 ? `All ${GOAL} interviews are already booked. Call hirebuddy_4_verify now with runId "${ctx.run.id}".`
        : suitable.length
        ? `Call hirebuddy_3_apply_and_book now with runId "${ctx.run.id}" and jobIds ${JSON.stringify(suitable.slice(0, need).map(r => r.jobId))}.`
        : allowed.length
          ? `No suitable job left. Pick the allowed option that adds jobs without giving up anything the user asked for, then call hirebuddy_2_check_jobs with runId "${ctx.run.id}", change and your reason. (Suggested: ${allowed[0].change}.)`
          : `Call hirebuddy_4_verify now with runId "${ctx.run.id}".`,
    };
  },
};

steps.hirebuddy_3_apply_and_book = {
  description: 'Step 3 of 4. Applies to the given suitable jobs (the employer gets the user\'s interview needs in plain text), books an interview in each inside both calendars and in the preferred format, and emails the user each interview with the time first. Then follow `next`.',
  inputSchema: {
    type: 'object',
    properties: { runId: { type: 'string' }, jobIds: { type: 'array', items: { type: 'string' }, maxItems: 3 } },
    required: ['runId', 'jobIds'],
  },
  async run(args, baseUrl) {
    const ctx = ctxFor(args.runId, baseUrl);
    if (!ctx) return bad('Unknown runId.', 'Start again with hirebuddy_1_understand.');
    const s = student(ctx);
    const results = matchJobs(s, ctx.run.search);
    const booked = [], refused = [];
    for (const id of (args.jobIds || []).slice(0, GOAL - active(ctx).length)) {
      const r = results.find(x => x.jobId === id);
      if (!r || !r.suitable || r.applied) { refused.push(`${id}: ${!r ? 'unknown job' : r.applied ? 'already applied' : `not suitable (${r.whyNot})`}`); continue; }
      const iv = await agent.applyAndBook(ctx, s, r);
      if (iv) booked.push({ job: `${r.title} at ${r.business}`, when: iv.whenLong, format: iv.format, howToJoin: iv.howToJoin, calendarFile: iv.icsUrl });
      else refused.push(`${r.title}: could not book a time`);
    }
    const have = active(ctx).length;
    const widen = have < GOAL ? widenFor(ctx, s).filter(o => o.adds.length && o.allowed) : [];
    store.save();
    return {
      ok: booked.length > 0 || refused.length === 0, booked, ...(refused.length ? { refused } : {}),
      interviews: `${have} of ${GOAL}`,
      next: have >= GOAL ? `Call hirebuddy_4_verify now with runId "${ctx.run.id}".`
        : widen.length ? `Only ${have} of ${GOAL}. Widen the search: call hirebuddy_2_check_jobs with runId "${ctx.run.id}", change "${widen[0].change}" (adds ${widen[0].adds.join(' and ')}) or another allowed option, and your reason.`
          : `No allowed way to add more. Call hirebuddy_4_verify now with runId "${ctx.run.id}".`,
    };
  },
};

steps.hirebuddy_4_verify = {
  description: 'Step 4 of 4. Re-checks everything (pay, access, both calendars, no clashes, formats, transit, calendar files, time-first emails, and the job-site listings), writes the summary for the user, and returns the files to save on their computer. Then save the files and give the user the summary.',
  inputSchema: { type: 'object', properties: { runId: { type: 'string' } }, required: ['runId'] },
  async run(args, baseUrl) {
    const ctx = ctxFor(args.runId, baseUrl);
    if (!ctx) return bad('Unknown runId.', 'Start again with hirebuddy_1_understand.');
    const run = ctx.run, s = student(ctx);
    if (run.options?.listings?.length && !run.outside) await agent.callTool(ctx, 'check_outside_listings', { studentId: s.id });
    const ivs = active(ctx).sort((a, b) => a.start.localeCompare(b.start));
    if (ivs.length < GOAL && !(run.decisions || []).length) {
      const opts = agent.seekerOptions(s, run.search, run.walkStated).filter(o => o.jobs.length);
      await agent.callTool(ctx, 'log_decision', {
        situation: `${ivs.length} of ${GOAL} interviews booked and nothing else suits ${s.name} with what they asked for.`,
        options: [...opts.map(o => `${o.label} (+${o.jobs.length}, needs your OK)`), `Stop at ${ivs.length} and say what came closest`],
        choice: `Stop at ${ivs.length} and say what came closest`,
        reason: opts.length ? 'The only changes that add jobs give up something you asked for, so that is your call.' : 'No change adds a suitable job.',
      });
    }
    const check = await agent.callTool(ctx, 'verify_applications', { studentId: s.id });
    const lines = ivs.map((iv, i) => { const j = store.db.jobs.find(x => x.id === iv.jobId); return `${i + 1}. ${j.title} at ${j.business}, ${iv.whenLong}, ${iv.format}${s.needs?.interviewFormat && iv.format !== s.needs.interviewFormat ? ` (they only offer ${(j.access?.interviewFormats || []).join(' or ')})` : ''}. ${iv.howToJoin}`; });
    const summary = (ivs.length ? `You have ${ivs.length} interview${ivs.length === 1 ? '' : 's'}.\n${lines.join('\n')}\nEach one is in your email with the time first and a calendar invite.`
      : 'No job on HireBuddy suits you right now, so I booked nothing.') + agent.decisionSummary(ctx) + outside.summarise(run.outside || []) + ` ${check.passed} of ${check.total} checks passed.`;
    if (check.pass) await agent.callTool(ctx, 'finish', { summary });
    run.status = run.done ? 'done' : 'incomplete';
    ctx.emit({ type: 'final', status: run.status, verified: run.verified, summary: run.summary, plan: run.plan, links: agent.links(run, baseUrl) });
    store.save();
    const folder = `HireBuddy - ${fileSafe(s.name)}`;
    const files = [
      { path: `${folder}/Summary.txt`, content: `${summary}\n\nRun log: ${baseUrl}/runs/${run.id}\n` },
      ...await Promise.all(ivs.map(async iv => {
        const j = store.db.jobs.find(x => x.id === iv.jobId);
        const content = await fetch(`${baseUrl}/ics/${iv.id}.ics`).then(r => r.text()).catch(() => null);
        return { path: `${folder}/Interview - ${fileSafe(j.business)}.ics`, ...(content ? { content } : { downloadFrom: `${baseUrl}/ics/${iv.id}.ics` }) };
      })),
      ...(run.outside || []).filter(r => r.draft).map(r => ({ path: `${folder}/Application - ${fileSafe(r.employer || r.title)}.txt`, content: r.draft })),
    ];
    return {
      ok: check.pass, verified: check.pass, summary,
      selfChecks: check.checks.map(c => `${c.pass ? 'PASS' : 'FAIL'} ${c.name}`),
      saveToComputer: { folder: `Documents/${folder}`, files },
      runLog: `${baseUrl}/runs/${run.id}`,
      next: check.pass
        ? `Save every file in saveToComputer into the user's Documents folder (write each file's content exactly as given). Then give the user the summary in short plain sentences for a screen reader: interviews first, one line each, then the jobs from other sites (drafted, not sent), then "${check.passed} of ${check.total} checks passed" and where the files are. Do not ask anything else.`
        : 'Tell the user which checks failed, in one sentence each.',
    };
  },
};

module.exports = { steps };
