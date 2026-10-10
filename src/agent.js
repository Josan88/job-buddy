// The agent: takes one prompt, plans, calls tools, checks its own work and delivers a result.
// Runs with an LLM when LLM_API_KEY is set, otherwise with the rule-based autopilot planner.
const { EventEmitter } = require('events');
const store = require('./store');
const L = require('./lib');
const llm = require('./llm');
const parse = require('./parse');
const { tools, HIRER_TOOLS, STUDENT_TOOLS, MINIMUM_MATCH, jobUrl } = require('./tools');

const bus = new EventEmitter();
bus.setMaxListeners(200);
const live = new Map(); // runId -> runtime ctx

function detectPersona(prompt) {
  const t = prompt.toLowerCase();
  const student = [/\bstudent\b/, /universit|college|campus|\buni\b|semester/, /\b(i am|i'm|im|my name is)\b/, /\bi can\b|my skills|i speak|i have experience/,
    /free (on )?(weekends?|weekdays?|mon|tue|wed|thu|fri|sat|sun)/, /looking for (a )?(part[- ]?time )?(job|gig|work)|find me|want (a )?(job|gig)|at least rm/]
    .filter(re => re.test(t)).length;
  const hirer = [/\b(need|needs|hiring|recruit)\b/, /\bmy (cafe|café|shop|bakery|restaurant|kedai|store|business|company|stall|kopitiam|centre|center)\b/,
    /looking for an? (\w+ )?(barista|cashier|tutor|crew|staff|assistant|helper|waiter|waitress|part[- ]?timer)/, /\bstart (next|this|on|tomorrow)/]
    .filter(re => re.test(t)).length;
  return student > hirer ? 'student' : 'hirer';
}

function newRun(prompt, persona, source = 'web') {
  const run = {
    id: store.id('run'), prompt, persona: persona || detectPersona(prompt), source,
    mode: llm.enabled() ? `LLM (${llm.MODEL})` : 'Autopilot (rule-based planner)',
    status: 'running', createdAt: new Date().toISOString(), plan: [], events: [], summary: null, verified: null,
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

async function autopilotHirer(ctx) {
  const spec = parse.hirer(ctx.run.prompt);
  say(ctx, `Understood the brief: ${spec.title} in ${spec.area}, RM${spec.pay}/${spec.payUnit}, ${L.describeSchedule(spec.schedule)}, start ${spec.startDate}. Must have: ${spec.requirements.join(', ')}.`);
  await callTool(ctx, 'set_plan', { steps: [
    { title: 'Check the pay is legal', tool: 'check_minimum_wage' },
    { title: 'Write and publish the job post', tool: 'publish_job' },
    { title: 'Find candidates nearby', tool: 'find_candidates' },
    { title: 'Screen and rank candidates with evidence', tool: 'screen_candidates' },
    { title: 'Self-check the ranking', tool: 'verify_screening' },
    { title: 'Book interviews for the shortlist', tool: 'schedule_interviews' },
    { title: 'Email invites with calendar files', tool: 'send_email' },
    { title: 'Verify the whole outcome', tool: 'verify_hiring_outcome' },
    { title: 'Deliver the report', tool: 'finish' },
  ] });

  const wage = await callTool(ctx, 'check_minimum_wage', { pay: spec.pay, payUnit: spec.payUnit });
  if (!wage.ok) {
    say(ctx, `Stopping before publishing: ${wage.message} Posting this would break the Minimum Wages Order.`);
    ctx.run.wageBlocked = true;
    return callTool(ctx, 'finish', { summary: `I did not publish the job. ${wage.message} Raise the offer to at least RM${wage.minimum}/${wage.unit} and run me again.` });
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

  const found = await callTool(ctx, 'find_candidates', { jobId, maxDistanceKm: 15 });
  say(ctx, `${found.count} candidates within 15 km or who applied directly; ${found.excludedOutOfRange} too far away.`);

  const screened = await callTool(ctx, 'screen_candidates', { jobId, candidateIds: found.candidates.map(c => c.id) });
  const ver = await callTool(ctx, 'verify_screening', { jobId });
  if (!ver.pass) say(ctx, 'Some scores did not reproduce, so I will only shortlist candidates whose checks passed.');
  const passed = new Set(ver.checks.filter(c => c.pass).map(c => c.id));
  const want = Math.max(3, spec.hires * 2);
  const shortlist = screened.ranked.filter(r => passed.has(r.id) && r.score >= MINIMUM_MATCH && r.requiredCoverage >= 0.5).slice(0, want);
  say(ctx, `Shortlisting the top ${shortlist.length} (score of at least ${MINIMUM_MATCH} and at least half the must-haves): ${shortlist.map(s => `${s.name} ${s.score}`).join(', ')}.`);

  const sched = await callTool(ctx, 'schedule_interviews', { jobId, candidateIds: shortlist.map(s => s.id), durationMinutes: 20 });
  for (const u of sched.unscheduled) say(ctx, `${u.name || u.id} could not be booked: ${u.reason}.`);

  for (const iv of sched.scheduled) {
    const cand = screened.details.find(d => d.id === iv.candidateId);
    const body = `Hi ${iv.name.split(' ')[0]},\n\nThanks for your interest in the ${spec.title} role at ${spec.business}. `
      + `You scored ${cand.score}/100 on our screening (${cand.why}).\n\n`
      + `Your interview: ${iv.when} (Malaysia time), 20 minutes, in person in ${spec.area}.\n`
      + `The calendar invite is attached. Job details: ${jobUrl(ctx, jobId)}\n\nReply to this email if the time doesn't work.\n\n${spec.business}`;
    await callTool(ctx, 'send_email', { to: iv.email || store.db.students.find(s => s.id === iv.candidateId).email,
      subject: `Interview for ${spec.title}: ${iv.when}`, body, interviewId: iv.interviewId, kind: 'interview_invite' });
  }

  if (spec.ownerEmail) {
    const lines = sched.scheduled.map(iv => `- ${iv.name}: ${iv.when}`).join('\n');
    await callTool(ctx, 'send_email', { to: spec.ownerEmail, kind: 'owner_summary', subject: `Your ${spec.title} shortlist is booked`,
      body: `Job post: ${jobUrl(ctx, jobId)}\n\nInterviews:\n${lines}\n\nFull agent run: ${ctx.baseUrl}/runs/${ctx.run.id}` });
  }

  let check = await callTool(ctx, 'verify_hiring_outcome', { jobId });
  if (!check.pass) {
    say(ctx, `${check.total - check.passed} check(s) failed. Retrying once.`);
    check = await callTool(ctx, 'verify_hiring_outcome', { jobId });
  }
  const lines = sched.scheduled.map(iv => `${iv.name} (${screened.ranked.find(r => r.id === iv.candidateId).score}/100) on ${iv.when}`);
  await callTool(ctx, 'finish', { summary: `Published "${spec.title}" at ${jobUrl(ctx, jobId)}. Screened ${screened.ranked.length} candidates and booked ${lines.length} interview${lines.length === 1 ? '' : 's'}: ${lines.join('; ')}. Invites with calendar files were emailed. ${check.passed}/${check.total} self-checks passed.` });
}

async function autopilotStudent(ctx) {
  const p = parse.student(ctx.run.prompt);
  say(ctx, `Understood: ${p.name}${p.campus ? ` from ${p.campus}` : ''}, based in ${p.area}, free ${L.describeSchedule(p.availability)}, skills ${p.skills.join(', ')}${p.minPay ? `, wants at least RM${p.minPay}/h` : ''}.`);
  await callTool(ctx, 'set_plan', { steps: [
    { title: 'Create your profile in the talent pool', tool: 'register_student' },
    { title: 'Search and rank open gigs nearby', tool: 'search_jobs' },
    { title: 'Apply to the best legal matches', tool: 'apply_to_job' },
    { title: 'Verify applications landed', tool: 'verify_applications' },
    { title: 'Deliver the report', tool: 'finish' },
  ] });
  const reg = await callTool(ctx, 'register_student', { name: p.name, email: p.email || undefined, area: p.area, campus: p.campus, skills: p.skills, availability: p.availability, expectedRate: p.expectedRate || undefined, bio: p.bio });
  if (!reg.ok) return say(ctx, (reg.problems || []).join(' '));
  const sid = reg.studentId;
  const found = await callTool(ctx, 'search_jobs', { studentId: sid, maxDistanceKm: 25, minPay: p.minPay });
  const illegal = found.results.filter(r => !r.legalPay);
  for (const r of illegal) say(ctx, `Skipping ${r.title} at ${r.business}: ${r.warning}`);
  const picks = found.results.filter(r => r.legalPay && !r.belowMinPay && r.score >= MINIMUM_MATCH && r.requiredCoverage >= 0.5).slice(0, 3);
  say(ctx, picks.length ? `Applying to ${picks.map(r => `${r.title} (${r.score})`).join(', ')}.` : 'No open gig scores high enough yet. Your profile is live so businesses can find you.');
  const student = store.db.students.find(s => s.id === sid);
  for (const r of picks) {
    const ev = r.evidence.filter(e => e.required).map(e => e.skill);
    const skill = ev[0] || student.skills[0];
    const note = `Hi ${r.business}, I'd like to apply for the ${r.title} role. I have ${ev.length ? ev.join(' and ') : skill} experience`
      + `${student.campus ? ` and study at ${student.campus}` : ''}. I'm based in ${student.area} and free ${L.describeSchedule(student.availability)}. Thank you!`;
    await callTool(ctx, 'apply_to_job', { studentId: sid, jobId: r.jobId, coverNote: note });
  }
  if (!picks.length) { ctx.run.verified = true; return callTool(ctx, 'finish', { summary: `Your profile is live in the talent pool (${student.name}, ${student.area}). No legal, well-matched gig is open right now.` }); }
  const check = await callTool(ctx, 'verify_applications', { studentId: sid });
  await callTool(ctx, 'finish', { summary: `Applied to ${picks.length} gig${picks.length === 1 ? '' : 's'}: ${picks.map(r => `${r.title} at ${r.business} (${r.score}/100, ${r.pay})`).join('; ')}.${illegal.length ? ` Skipped ${illegal.length} paying below minimum wage.` : ''} ${check.passed}/${check.total} self-checks passed.` });
}

// ---------------------------------------------------------------------------
// LLM mode: the model plans and calls the same tools; a gate stops it finishing unverified.

function systemPrompt(persona, baseUrl) {
  const now = new Date();
  const today = L.fmtMyt(now);
  const common = `You are HireBuddy, an autonomous hiring agent for Malaysian small businesses and students. Today is ${today} (Malaysia time, UTC+8). The app runs at ${baseUrl}.
Work fully autonomously from the single user prompt. Never ask the user questions; pick sensible defaults and state them.
1. First call set_plan with your steps, each naming the tool that completes it.
2. Execute with tools. When a tool returns ok:false with problems, fix exactly those problems and call it again.
3. Before finishing you MUST run the final verify tool and it must pass. Then call finish with a short plain-language summary including links.
Weekly schedules use day keys Mon Tue Wed Thu Fri Sat Sun with 24h ranges, e.g. {"Sat":["08:00-14:00"]}. Skills are short lowercase phrases.`;
  if (persona === 'student') return `${common}
User: a university student looking for part-time gigs. Steps: register_student (bio built only from what they said), search_jobs, check pay legality, apply_to_job to up to 3 legal jobs scoring >= ${MINIMUM_MATCH} with requiredCoverage >= 0.5 (write a personal cover note naming the job and a real skill), verify_applications, finish.`;
  return `${common}
User: a small-business owner hiring part-timers. Steps: check_minimum_wage (if illegal, explain and finish without publishing), publish_job (write an attractive ad that states pay and area; infer must-have skills), find_candidates, screen_candidates on all of them, verify_screening, pick a shortlist of the top 3 (or 2x the hires requested) with score >= ${MINIMUM_MATCH} and requiredCoverage >= 0.5, schedule_interviews, send_email an invite to each (pass interviewId; body must contain the exact "when" text and the job link), email the owner a summary if they gave an email, verify_hiring_outcome, finish.`;
}

function toOpenAiTools(names) {
  return names.map(n => ({ type: 'function', function: { name: n, description: tools[n].description, parameters: tools[n].parameters } }));
}

async function llmLoop(ctx) {
  const names = ctx.run.persona === 'student' ? STUDENT_TOOLS : HIRER_TOOLS;
  const messages = [
    { role: 'system', content: systemPrompt(ctx.run.persona, ctx.baseUrl) },
    { role: 'user', content: ctx.run.prompt },
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
    if (llm.enabled()) {
      try {
        await llmLoop(ctx);
      } catch (e) {
        if (run.events.some(ev => ev.type === 'tool_call' && ev.tool !== 'set_plan')) throw e;
        say(ctx, `The language model is unavailable (${e.message}). Switching to the rule-based autopilot.`);
        run.mode = 'Autopilot (LLM fallback)';
      }
    }
    if (!run.done && !run.events.some(ev => ev.type === 'tool_call' && ev.tool !== 'set_plan')) {
      run.plan = [];
      await (run.persona === 'student' ? autopilotStudent(ctx) : autopilotHirer(ctx));
    }
    run.status = run.done ? 'done' : 'incomplete';
  } catch (e) {
    run.status = 'error';
    ctx.emit({ type: 'error', message: e.message });
  }
  if (run.done) for (const s of run.plan) s.status = 'done';
  ctx.emit({ type: 'final', status: run.status, verified: run.verified, summary: run.summary, plan: run.plan, links: links(run, baseUrl) });
  live.delete(run.id);
  store.save();
  return run;
}

function links(run, baseUrl) {
  const out = [{ label: 'Agent run log', url: `${baseUrl}/runs/${run.id}` }];
  if (run.jobId) out.push({ label: 'Published job page', url: `${baseUrl}/jobs/${run.jobId}` });
  for (const id of run.interviews || []) {
    const iv = store.db.interviews.find(i => i.id === id);
    if (iv) out.push({ label: `Calendar invite: ${iv.name}`, url: `${baseUrl}/ics/${iv.id}.ics` });
  }
  if (store.db.emails.some(e => e.runId === run.id)) out.push({ label: 'Emails sent', url: `${baseUrl}/outbox?run=${run.id}` });
  return out;
}

// Let finish through when the agent correctly refused to publish an illegal wage.
const origFinish = tools.finish.run;
tools.finish.run = async (args, ctx) => {
  if (ctx.run.wageBlocked && ctx.run.persona === 'hirer' && !ctx.run.jobId) ctx.run.verified = true;
  return origFinish(args, ctx);
};

module.exports = { newRun, execute, bus, live, detectPersona, links };
