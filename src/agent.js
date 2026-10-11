// The agent: takes one prompt, plans, calls tools, checks its own work and delivers a result.
// Runs with an LLM when LLM_API_KEY is set, otherwise with the rule-based autopilot planner.
const { EventEmitter } = require('events');
const store = require('./store');
const L = require('./lib');
const llm = require('./llm');
const parse = require('./parse');
const outside = require('./outside');
const { tools, HIRER_TOOLS, STUDENT_TOOLS, MINIMUM_MATCH, jobUrl, matchJobs } = require('./tools');

const bus = new EventEmitter();
bus.setMaxListeners(200);
const live = new Map(); // runId -> runtime ctx

function detectPersona(prompt) {
  const t = prompt.toLowerCase();
  if (/\b(blind|low vision|visually impaired|partially sighted|screen ?reader|nvda|jaws|voiceover|talkback|magnifier)\b/.test(t) && !/\bhiring\b|my (cafe|shop|company|business)/.test(t)) return 'student';
  const student = [/\bstudent\b/, /universit|college|campus|\buni\b|semester/, /\b(i am|i'm|im|my name is)\b/, /\bi can\b|my skills|i speak|i have experience/,
    /free (on )?(weekends?|weekdays?|mon|tue|wed|thu|fri|sat|sun)/, /looking for (a )?(part[- ]?time )?(job|gig|work)|find me|want (a )?(job|gig)|at least rm/]
    .filter(re => re.test(t)).length;
  const hirer = [/\b(need|needs|hiring|recruit)\b/, /\bmy (cafe|café|shop|bakery|restaurant|kedai|store|business|company|stall|kopitiam|centre|center)\b/,
    /looking for an? (\w+ )?(barista|cashier|tutor|crew|staff|assistant|helper|waiter|waitress|part[- ]?timer)/, /\bstart (next|this|on|tomorrow)/]
    .filter(re => re.test(t)).length;
  return student > hirer ? 'student' : 'hirer';
}

function newRun(prompt, persona, source = 'web', options = {}) {
  const run = {
    id: store.id('run'), prompt, persona: persona || detectPersona(prompt), source,
    mode: llm.enabled() ? `LLM (${llm.MODEL})` : 'Autopilot (rule-based planner)',
    status: 'running', createdAt: new Date().toISOString(), plan: [], events: [], summary: null, verified: null,
    options: Object.fromEntries(Object.entries(options).filter(([, v]) => v)),
  };
  store.db.runs.push(run);
  store.save();
  return run;
}

function makeCtx(run, baseUrl) {
  const ctx = {
    run, baseUrl,
    emit(ev) {
      const e = { t: Date.now(), ...ev };
      run.events.push(e);
      store.save();
      bus.emit(run.id, e);
    },
  };
  return ctx;
}

function advancePlan(ctx, toolName, status) {
  const plan = ctx.run.plan;
  if (!plan?.length) return;
  let at = plan.findIndex(s => s.tool === toolName && s.status !== 'done');
  if (at < 0) at = plan.map(s => s.tool).lastIndexOf(toolName);
  if (at < 0) return;
  for (let i = 0; i < at; i++) plan[i].status = 'done';
  plan[at].status = status;
  ctx.emit({ type: 'plan', plan });
}

async function callTool(ctx, name, args) {
  const tool = tools[name];
  ctx.emit({ type: 'tool_call', tool: name, args });
  let result;
  try {
    result = tool ? await tool.run(args || {}, ctx) : { ok: false, error: `Unknown tool ${name}` };
  } catch (e) {
    result = { ok: false, error: e.message };
  }
  const ok = result.ok !== false;
  ctx.emit({ type: 'tool_result', tool: name, ok, result });
  if (/^verify_/.test(name) && result.checks) ctx.emit({ type: 'checks', tool: name, pass: result.pass, checks: result.checks });
  if (!ok && (result.problems || result.error)) ctx.emit({ type: 'self_correct', tool: name, problems: result.problems || [result.error] });
  if (name !== 'set_plan') advancePlan(ctx, name, !ok || result.pass === false ? 'retry' : name === 'finish' ? 'done' : 'active');
  return result;
}

const say = (ctx, text) => ctx.emit({ type: 'thought', text });

// ---------------------------------------------------------------------------
// Autopilot: deterministic planner that drives the same tools.

const RADII = [10, 20, 30];

// Who would qualify under a (possibly hypothetical) version of the job: within range or applied,
// meets every must-have, scores at least MINIMUM_MATCH, hasn't declined or been booked already.
function qualifiedUnder(job, radius, skip) {
  const applied = new Set(store.db.applications.filter(a => a.jobId === job.id).map(a => a.studentId));
  return store.db.students.filter(s => {
    if (skip.has(s.id)) return false;
    const km = L.distanceKm(job.area, s.area);
    if (!applied.has(s.id) && !(km != null && km <= radius)) return false;
    const sc = L.scoreMatch(job, s);
    return sc.requiredCoverage === 1 && sc.total >= MINIMUM_MATCH;
  });
}

function hasSkill(job, s, skill) {
  return !!L.scoreMatch({ ...job, requirements: [skill], niceToHave: [] }, s).evidence.length;
}

const names = list => list.map(s => s.name).join(' and ') || 'nobody';

// Goal loop: keep screening until `goal` candidates are shortlisted. Whenever it falls
// short it weighs every option by simulating it, logs the decision with its reason, and acts.
async function bookTowardGoal(ctx, jobId, goal, { radius = RADII[0], relaxBudget = 1, window = 7 } = {}) {
  const booked = [];
  let screened = null;
  let noTime = [];
  for (let round = 1; round <= 8; round++) {
    const found = await callTool(ctx, 'find_candidates', { jobId, maxDistanceKm: radius });
    screened = await callTool(ctx, 'screen_candidates', { jobId, candidateIds: found.candidates.map(c => c.id) });
    const ver = await callTool(ctx, 'verify_screening', { jobId });
    if (!ver.pass) say(ctx, 'Some scores did not reproduce, so I will only shortlist candidates whose checks passed.');
    const passed = new Set(ver.checks.filter(c => c.pass).map(c => c.id));
    const ready = screened.ranked.filter(r => r.qualified && passed.has(r.id) && !booked.some(b => b.candidateId === r.id)).slice(0, goal - booked.length);
    const job = store.db.jobs.find(j => j.id === jobId);
    say(ctx, `Round ${round} (${radius} km): ${screened.ranked.filter(r => r.qualified).length} candidate(s) meet every must-have (${job.requirements.join(', ')}). ${booked.length} of ${goal} candidates shortlisted so far.`);
    if (ready.length) {
      booked.push(...ready.map(r => ({ candidateId: r.id, name: r.name })));
    }
    if (booked.length >= goal) break;

    // Short of the goal: weigh every option by what it would actually change.
    const skip = new Set([...booked.map(b => b.candidateId), ...noTime.map(u => u.id)]);
    const options = [];
    if (noTime.length && window < 14) {
      options.push({ label: `Look 14 days ahead instead of ${window} for ${names(noTime)}`, gain: noTime.length, rank: 0,
        why: `${names(noTime)} qualif${noTime.length === 1 ? 'ies' : 'y'} but ${noTime.length === 1 ? 'has' : 'have'} no free time in the next ${window} days`,
        apply: () => { window = 14; noTime = []; } });
    }
    const next = RADII.find(r => r > radius);
    if (next) {
      const now = qualifiedUnder(job, radius, skip), wider = qualifiedUnder(job, next, skip);
      const core = job.requirements[0];
      const near = store.db.students.filter(s => { const km = L.distanceKm(job.area, s.area); return km != null && km > radius && km <= next && hasSkill(job, s, core); });
      const added = wider.filter(s => !now.includes(s));
      options.push({ label: `Widen the search from ${radius} km to ${next} km`, gain: added.length, potential: near.length, rank: 1,
        why: added.length ? `would add ${names(added)}, who meet every must-have`
          : `nobody within ${radius} km meets every must-have, and ${near.length} more people with ${core} experience live within ${next} km`,
        apply: () => { radius = next; } });
    }
    if (relaxBudget > 0) {
      for (const k of job.requirements.slice(1)) {
        const relaxedJob = { ...job, requirements: job.requirements.filter(r => r !== k), niceToHave: [k, ...(job.niceToHave || [])] };
        const gained = qualifiedUnder(relaxedJob, radius, skip).filter(s => !qualifiedUnder(job, radius, skip).includes(s));
        options.push({ label: `Relax "${k}" from must-have to nice-to-have`, gain: gained.length, rank: 2, skill: k,
          why: gained.length ? `nobody nearby has every must-have; dropping only "${k}" qualifies ${names(gained)}, and ${(rest => `${rest.join(', ')} ${rest.length === 1 ? 'stays' : 'stay'}`)(job.requirements.filter(r => r !== k))} required`
            : `would not add anyone at ${radius} km`,
          apply: async () => {
            await callTool(ctx, 'relax_requirement', { jobId, skill: k, reason: `Only way to reach ${goal} candidates: qualifies ${names(gained)}` });
            relaxBudget--;
          } });
      }
    }
    const stop = { label: `Stop at ${booked.length} and tell the owner who came closest`, gain: 0, rank: 3,
      why: 'no remaining option adds a qualified candidate, and padding the list with weak matches would waste the owner\'s time',
      apply: () => 'stop' };
    options.push(stop);

    const best = [...options].sort((a, b) => b.gain - a.gain || a.rank - b.rank)[0];
    // Nothing helps right now: widening is still worth it if it brings in people with the core skill,
    // because a later relaxation may then qualify them.
    const choice = best.gain > 0 ? best
      : options.find(o => o.rank === 1 && o.potential > 0 && relaxBudget > 0) || stop;
    await callTool(ctx, 'log_decision', {
      situation: `${booked.length} of ${goal} candidates shortlisted after round ${round}; ${qualifiedUnder(job, radius, skip).length || 'no'} other qualified candidate(s) within ${radius} km.`,
      options: options.map(o => `${o.label} (${o.gain ? `+${o.gain} qualified` : 'adds nobody'})`),
      choice: choice.label,
      reason: `${choice.why[0].toUpperCase()}${choice.why.slice(1)}.`,
    });
    if (await choice.apply() === 'stop') break;
  }
  const job = store.db.jobs.find(j => j.id === jobId);
  job.searchRadiusKm = radius;
  store.save();
  return { booked, screened, radius };
}

function nearMisses(job, screened) {
  return (screened?.ranked || []).filter(r => !r.qualified && !r.unavailable && r.missing?.length && r.missing.length <= 2
    && !r.missing.includes(job.requirements[0]) && r.score >= 40).slice(0, 2);
}

function decisionSummary(ctx) {
  const d = ctx.run.decisions || [];
  return d.length ? ` Decisions I made on the way: ${d.map(x => x.choice.replace(/ \(.*\)$/, '')).join('; ')}.` : '';
}

async function autopilotHirer(ctx) {
  const spec = { ...parse.hirer(ctx.run.prompt), ...(ctx.run.options || {}) };
  const goal = Math.max(3, spec.hires);
  ctx.run.goal = goal;
  say(ctx, `Understood the brief: ${spec.title} in ${spec.area}, RM${spec.pay}/${spec.payUnit}, ${L.describeSchedule(spec.schedule)}, start ${spec.startDate}. Must have: ${spec.requirements.join(', ')}. Goal: ${goal} candidates shortlisted.`);
  await callTool(ctx, 'set_plan', { steps: [
    { title: 'Check the pay is legal', tool: 'check_minimum_wage' },
    { title: 'Write and publish the job post', tool: 'publish_job' },
    { title: 'Find candidates nearby', tool: 'find_candidates' },
    { title: 'Screen and rank candidates with evidence', tool: 'screen_candidates' },
    { title: 'Self-check the ranking', tool: 'verify_screening' },
    { title: 'If short: decide to widen, relax or stop', tool: 'log_decision' },
    { title: 'Verify the whole outcome', tool: 'verify_hiring_outcome' },
    { title: 'Deliver the report', tool: 'finish' },
  ] });

  const wage = await callTool(ctx, 'check_minimum_wage', { pay: spec.pay, payUnit: spec.payUnit });
  if (!wage.ok) {
    say(ctx, `Stopping before publishing: ${wage.message} Posting this would break the Minimum Wages Order.`);
    ctx.run.wageBlocked = true;
    const perHour = spec.payUnit === 'day' ? ` For ${/^(8|11|18)\b/.test(String(spec.shiftHours || 8)) ? 'an' : 'a'} ${spec.shiftHours || 8}-hour shift that is about RM${(spec.pay / (spec.shiftHours || 8)).toFixed(2)} an hour, and the legal minimum is RM${L.MIN_WAGE.hour} an hour.` : '';
    return callTool(ctx, 'finish', { summary: `I did not publish the job. ${wage.message}${perHour} Raise the offer to at least RM${wage.minimum}/${wage.unit} and run me again. (${L.MIN_WAGE.source}.)` });
  }

  const description = `${spec.business} is hiring a ${spec.title.toLowerCase()} in ${spec.area}. Pay: RM${spec.pay} per ${spec.payUnit}. `
    + `Shifts: ${L.describeSchedule(spec.schedule)}. Start: ${spec.startDate}. `
    + `You need: ${spec.requirements.join(', ')}.${spec.niceToHave.length ? ` Nice to have: ${spec.niceToHave.join(', ')}.` : ''} `
    + 'Great for students who want steady weekend income close to campus.';
  const pub = await callTool(ctx, 'publish_job', { business: spec.business, ownerEmail: spec.ownerEmail || undefined, title: spec.title, area: spec.area,
    pay: spec.pay, payUnit: spec.payUnit, schedule: spec.schedule, startDate: spec.startDate,
    requirements: spec.requirements, niceToHave: spec.niceToHave, description });
  if (!pub.ok) return say(ctx, `Could not publish: ${(pub.problems || []).join(' ')}`);
  const jobId = pub.job.id;
  say(ctx, `Job is live at ${pub.job.url} (self-check fetched it: HTTP ${pub.liveCheck.status}).`);

  const { booked, screened, radius } = await bookTowardGoal(ctx, jobId, goal);
  const job = store.db.jobs.find(j => j.id === jobId);


  const misses = booked.length < goal ? nearMisses(job, screened) : [];
  const relaxed = (job.relaxed || []).map(r => r.skill);
  if (spec.ownerEmail) {
    const lines = booked.map(iv => `- ${iv.name}`).join('\n');
    await callTool(ctx, 'send_email', { to: spec.ownerEmail, kind: 'owner_summary', subject: `Your ${spec.title} shortlist is ready`,
      body: `Job post: ${jobUrl(ctx, jobId)}\n\nCandidates:\n${lines}\n${(ctx.run.decisions || []).map(d => `\nDecision: ${d.choice}. ${d.reason}`).join('')}\n\nFull agent run: ${ctx.baseUrl}/runs/${ctx.run.id}` });
  }

  let check = await callTool(ctx, 'verify_hiring_outcome', { jobId });
  if (!check.pass) {
    say(ctx, `${check.total - check.passed} check(s) failed. Retrying once.`);
    check = await callTool(ctx, 'verify_hiring_outcome', { jobId });
  }
  const final = screened.details;
  const lines = booked.map(iv => `${iv.name} (${final.find(r => r.id === iv.candidateId)?.score ?? '?'}/100)`);
  await callTool(ctx, 'finish', { summary: `Published "${spec.title}" at ${jobUrl(ctx, jobId)}. Shortlisted ${lines.length} of ${goal} candidates: ${lines.join('; ')}.`
    + `${radius > RADII[0] ? ` Searched up to ${radius} km.` : ''}${relaxed.length ? ` Relaxed to nice-to-have: ${relaxed.join(', ')}.` : ''}${decisionSummary(ctx)}`
    + `${misses.length ? ` Closest near misses: ${misses.map(m => `${m.name} (missing ${m.missing.join(', ')})`).join('; ')}.` : ''} ${check.passed}/${check.total} self-checks passed.` });
}

// Job seeker: find suitable jobs for manual application, widening the search safely.
const SEEKER_GOAL = 3;

// Ways to find more suitable jobs, each simulated first: jobs = what it would add.
// cost: how much of what they asked for an option gives up. Anything they stated themselves
// (their pay floor, a walking limit they named) is never dropped without their word (yours: true).
function seekerOptions(s, opts, walkStated) {
  const now = new Set(matchJobs(s, opts).filter(r => r.suitable && !r.applied).map(r => r.jobId));
  const gain = o => matchJobs(s, { ...opts, ...o }).filter(r => r.suitable && !r.applied && !now.has(r.jobId));
  const options = [];
  if (s.needs?.screenReader && !opts.askAboutTech) options.push({ id: 'ask_about_screen_reader', label: 'Include jobs that don\'t mention screen reader support, and ask the employer in the application', change: { askAboutTech: true }, cost: 0 });
  if (opts.maxDistanceKm < 60) options.push({ id: 'whole_klang_valley', label: 'Search the whole Klang Valley, not just 25 km', change: { maxDistanceKm: 60 }, cost: 1 });
  if (s.needs && !s.needs.remoteOnly && (opts.maxWalkMin || L.DEFAULT_WALK) < 15) options.push({ id: 'walk_15_minutes', label: `Accept up to a 15-minute walk from the stop (now ${opts.maxWalkMin || L.DEFAULT_WALK})`, change: { maxWalkMin: 15 }, cost: 2, yours: !!walkStated });
  if (opts.minPay > L.MIN_WAGE.hour) options.push({ id: 'lower_pay_floor', label: `Lower your minimum pay from RM${opts.minPay}/h to the legal minimum RM${L.MIN_WAGE.hour}/h`, change: { minPay: 0 }, cost: 3, yours: true });
  for (const o of options) o.jobs = gain(o.change);
  return options;
}

async function autopilotStudent(ctx) {

  const p = parse.withDetails(parse.student(ctx.run.prompt), ctx.run.options?.applicantDetails || {});
  ctx.run.resumeArea = p.area || null;
  const goal = SEEKER_GOAL;
  ctx.run.goal = goal;
  const n = p.needs;
  say(ctx, `Understood: ${p.name}, ${p.area ? `based in ${p.area}` : 'area not given'}, ${L.totalMinutes(p.availability) ? `free ${L.describeSchedule(p.availability)}` : 'free time not given'}, skills ${p.skills.join(', ') || 'not given'}.`
    + `${n ? ` Needs: ${n.vision}, uses ${n.tool}${n.remoteOnly ? ', remote work only' : `, up to a ${n.maxWalkMin}-minute walk from a stop`}.` : ''}`
    + `${p.minPay ? ` At least RM${p.minPay}/h.` : ''} Goal: ${goal} suitable jobs.`);
  await callTool(ctx, 'set_plan', { steps: [
    { title: 'Save your profile and needs', tool: 'register_student' },
    { title: 'Find jobs and check each one suits you', tool: 'search_jobs' },
    { title: 'If too few suit you: decide what to change', tool: 'log_decision' },
    ...(ctx.run.options?.listings?.length ? [{ title: `Check the ${outside.clean(ctx.run.options.listings).length} jobs WorkBuddy found on other sites`, tool: 'check_outside_listings' }] : []),
    { title: 'Check everything again', tool: 'verify_applications' },
    { title: 'Tell you the result', tool: 'finish' },
  ] });
  const reg = await callTool(ctx, 'register_student', { name: p.name, email: p.email || undefined, area: p.area, campus: p.campus || undefined, skills: p.skills,
    availability: p.availability, expectedRate: p.expectedRate || undefined, bio: p.bio, needs: n || undefined });
  if (!reg.ok) return say(ctx, (reg.problems || []).join(' '));
  const s = store.db.students.find(x => x.id === reg.studentId);

  let opts = { maxDistanceKm: 25, minPay: p.minPay || 0, maxWalkMin: n?.maxWalkMin, askAboutTech: false };
  let matched = [];
  let found;
  for (let round = 1; round <= 6; round++) {
    found = await callTool(ctx, 'search_jobs', { studentId: s.id, ...opts });
    for (const r of found.results.filter(r => !r.legalPay)) if (round === 1) say(ctx, `Skipping ${r.title} at ${r.business}: ${r.warning}`);
    if (round === 1 && n) {
      const out = found.results.filter(r => r.legalPay && r.access.fit === 'not suitable' && r.score >= MINIMUM_MATCH).slice(0, 3);
      for (const r of out) say(ctx, `Not suitable: ${r.title} at ${r.business}, because ${r.access.blockers[0]}.`);
    }
    const picks = found.results.filter(r => r.suitable && !r.applied).slice(0, goal);
    say(ctx, `Round ${round}: ${found.suitable} job(s) suit you${picks.length ? `. Found ${picks.map(r => `${r.title} at ${r.business} (${r.score}/100)`).join(', ')}` : ''}.`);
    matched = picks;
    if (matched.length >= goal) break;

    // Short of the goal: simulate each change and pick the one that adds the most suitable jobs.
    const options = seekerOptions(s, opts, !!p.needs?.walkStated);
    const best = options.filter(o => o.jobs.length && !o.yours).sort((a, b) => a.cost - b.cost)[0];
    const askYou = options.filter(o => o.jobs.length && o.yours);
    if (!best && askYou.length) ctx.run.suggestions = askYou.map(o => `${o.label.replace(/^Lower your/, 'If you lower your').replace(/^Accept/, 'If you accept')}, I could apply to ${o.jobs.map(r => `${r.title} at ${r.business} (${r.pay})`).join(' and ')}. Tell me and I will.`);
    const stopLabel = `Stop at ${matched.length} suitable jobs and tell you what came closest`;
    await callTool(ctx, 'log_decision', {
      situation: `${matched.length} of ${goal} suitable jobs found after round ${round}.`,
      options: [...options.map(o => `${o.label} (${o.jobs.length ? `+${o.jobs.length} job${o.jobs.length === 1 ? '' : 's'}` : 'adds nothing'}${o.yours ? ', needs your OK' : ''})`), `${stopLabel} (adds nothing)`],
      choice: best ? best.label : stopLabel,
      reason: best ? `It adds ${best.jobs.map(r => `${r.title} at ${r.business}`).join(' and ')}, and nothing about your needs is given up.`.replace('and nothing about your needs is given up', best.change.askAboutTech ? 'and the application asks the question for you' : best.change.minPay === 0 ? 'and those jobs still pay at least the legal minimum' : 'and every other need still holds')
        : askYou.length ? `The only changes that add a job give up something you asked for (${askYou.map(o => o.label.replace(/^\w/, c => c.toLowerCase())).join('; ')}), so that is your call, not mine.`
        : 'No change adds a job that suits you. Applying to unsuitable jobs would waste your time.',
    });
    if (!best) break;
    opts = { ...opts, ...best.change };
  }

  if (ctx.run.options?.listings?.length) await callTool(ctx, 'check_outside_listings', { studentId: s.id });
  const check = await callTool(ctx, 'verify_applications', { studentId: s.id });
  await callTool(ctx, 'finish', { summary: `Found ${matched.length} suitable job${matched.length === 1 ? '' : 's'}. Choose a job from My details to send an application.${decisionSummary(ctx)}${outside.summarise(ctx.run.outside || [])} ${check.passed} of ${check.total} checks passed.` });
}

function systemPrompt(persona, baseUrl, GOAL = 3) {
  const now = new Date();
  const today = L.fmtMyt(now);
  const common = `You are HireBuddy, an autonomous hiring agent for Malaysian small businesses and students. Today is ${today} (Malaysia time, UTC+8). The app runs at ${baseUrl}.
Work fully autonomously from the single user prompt. Never ask the user questions; pick sensible defaults and state them. The one exception is location: never invent an area the user did not name.
1. First call set_plan with your steps, each naming the tool that completes it.
2. Execute with tools. When a tool returns ok:false with problems, fix exactly those problems and call it again.
3. Before finishing you MUST run the final verify tool and it must pass. Then call finish with a short plain-language summary including links.
Weekly schedules use day keys Mon Tue Wed Thu Fri Sat Sun with 24h ranges, e.g. {"Sat":["08:00-14:00"]}. Skills are short lowercase phrases.`;
  if (persona === 'student') return `${common}
Save the profile with register_student, search_jobs, widen safely with log_decision if needed, check_outside_listings when supplied, verify_applications, then finish with suitable jobs and the manual application link. Do not submit applications or book interviews.`;
  return `${common}
User: a small-business owner hiring part-timers. Check minimum wage, publish_job, find_candidates, screen_candidates, verify_screening, widen or relax safely if needed, send the owner a shortlist if they supplied an email, verify_hiring_outcome, then finish. Do not schedule interviews.`;
}

// Some OpenAI-compatible endpoints (e.g. Google Gemini) reject additionalProperties in schemas.
function stripExtras(schema) {
  if (Array.isArray(schema)) return schema.map(stripExtras);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).filter(([k]) => k !== 'additionalProperties').map(([k, v]) => [k, stripExtras(v)]));
}

function toOpenAiTools(names) {
  const clean = /googleapis|gemini/i.test(llm.BASE);
  return names.map(n => ({ type: 'function', function: { name: n, description: tools[n].description, parameters: clean ? stripExtras(tools[n].parameters) : tools[n].parameters } }));
}

async function llmLoop(ctx) {
  const names = ctx.run.persona === 'student' ? STUDENT_TOOLS : HIRER_TOOLS;
  if (ctx.run.persona === 'hirer') ctx.run.goal = ctx.run.options?.replaceInterviewId ? 1 : Math.max(3, parse.hirer(ctx.run.prompt).hires);
  const messages = [
    { role: 'system', content: systemPrompt(ctx.run.persona, ctx.baseUrl, ctx.run.goal) },
    { role: 'user', content: (() => {
      const { listings, ...rest } = ctx.run.options || {};
      return ctx.run.prompt + (Object.keys(rest).length ? `\n(Details: ${JSON.stringify(rest)})` : '')
        + (listings?.length ? `\n(WorkBuddy found ${outside.clean(listings).length} jobs on other sites. Check them with check_outside_listings.)` : '');
    })() },
  ];
  const defs = toOpenAiTools(names);
  let nudges = 0, lastFail = '', repeats = 0, failStreak = 0;
  for (let turn = 0; turn < 45 && !ctx.run.done; turn++) {
    const msg = await llm.chat(messages, defs);
    messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
    if (msg.content?.trim()) say(ctx, msg.content.trim());
    if (!msg.tool_calls?.length) {
      if (++nudges > 3) break;
      messages.push({ role: 'user', content: 'Continue autonomously with tool calls. Call finish only after the final verification passes.' });
      continue;
    }
    for (const tc of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(tc.function.arguments || '{}'); } catch { args = {}; }
      if (tc.function.name === 'check_minimum_wage') {
        const w = L.checkWage(args.pay, args.payUnit);
        if (!w.ok && ctx.run.persona === 'hirer') ctx.run.wageBlocked = true;
      }
      const result = await callTool(ctx, tc.function.name, args);
      const text = JSON.stringify(result);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: text.length > 8000 ? text.slice(0, 8000) + '...(truncated)' : text });
      if (result.ok === false) {
        const sig = tc.function.name + JSON.stringify(result.problems || result.error);
        repeats = sig === lastFail ? repeats + 1 : 0;
        lastFail = sig;
        failStreak++;
      } else { repeats = 0; failStreak = 0; lastFail = ''; }
      if (ctx.run.done) break;
    }
    if (repeats >= 2) {
      messages.push({ role: 'user', content: 'You repeated a call that keeps failing with the same problems. Re-read the earlier tool results for the correct values (ids, emails, times) and change the arguments.' });
      repeats = 0;
    }
    if (failStreak >= 8) throw new Error('The model kept making failing tool calls; stopped to avoid looping.');
  }
}

async function execute(run, baseUrl) {
  const ctx = makeCtx(run, baseUrl);
  live.set(run.id, ctx);
  ctx.emit({ type: 'start', prompt: run.prompt, persona: run.persona, mode: run.mode });
  try {
    // A job with no stated area: ask, before either planner can guess one.
    const noArea = run.persona === 'hirer' && !run.options?.replaceInterviewId && !run.options?.area && !parse.hirer(run.prompt).area;
    if (noArea) say(ctx, `Where is the job? Tell me the area, for example "Need a weekend barista in Petaling Jaya, RM12/hr", and run me again. I won't guess the location.`);
    else if (llm.enabled()) {
      try {
        await llmLoop(ctx);
      } catch (e) {
        if (run.events.some(ev => ev.type === 'tool_call' && ev.tool !== 'set_plan')) throw e;
        say(ctx, `The language model is unavailable (${e.message}). Switching to the rule-based autopilot.`);
        run.mode = 'Autopilot (LLM fallback)';
      }
    }
    if (!noArea && !run.done && !run.events.some(ev => ev.type === 'tool_call' && ev.tool !== 'set_plan')) {
      run.plan = [];
      await (run.persona === 'student' ? autopilotStudent(ctx) : autopilotHirer(ctx));
    }
    run.status = run.done ? 'done' : 'incomplete';
  } catch (e) {
    run.status = 'error';
    ctx.emit({ type: 'error', message: e.message });
  }
  // A refused job stops early: the steps it never reached are shown as skipped, not done.
  if (run.done) for (const s of run.plan) s.status = run.wageBlocked && !run.events.some(e => e.type === 'tool_call' && e.tool === s.tool) ? 'skipped' : 'done';
  ctx.emit({ type: 'final', status: run.status, verified: run.verified, summary: run.summary, plan: run.plan, links: links(run, baseUrl) });
  live.delete(run.id);
  store.save();
  return run;
}

function links(run, baseUrl) {
  const out = [{ label: 'Agent run log', url: `${baseUrl}/runs/${run.id}` }];
  if (run.jobId) out.push({ label: 'Published job page', url: `${baseUrl}/jobs/${run.jobId}` });
  if (store.db.emails.some(e => e.runId === run.id)) out.push({ label: 'Emails sent', url: `${baseUrl}/outbox?run=${run.id}` });
  return out;
}

// Let finish through when the agent correctly refused to publish an illegal wage.
const origFinish = tools.finish.run;
tools.finish.run = async (args, ctx) => {
  if (ctx.run.wageBlocked && ctx.run.persona === 'hirer' && !ctx.run.jobId) ctx.run.verified = true;
  return origFinish(args, ctx);
};

module.exports = { newRun, execute, bus, live, detectPersona, links,
  makeCtx, callTool, say, seekerOptions, decisionSummary, SEEKER_GOAL };
