// The agent's tools. Each one does real work against the store, the web or email,
// and returns a JSON result the agent (LLM or autopilot) reads before deciding the next step.
const store = require('./store');
const L = require('./lib');
const mail = require('./mail');
const outside = require('./outside');

const MINIMUM_MATCH = 50; // below this, or with under half the must-haves, a match is not worth pursuing

function S(type, properties, required = []) {
  return { type, properties, required, additionalProperties: false };
}
const scheduleSchema = {
  type: 'object',
  description: 'Weekly hours as 24h ranges, e.g. {"Sat":["08:00-14:00"],"Sun":["08:00-14:00"]}. Leave out days with no hours.',
  properties: Object.fromEntries(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => [d, { type: 'array', items: { type: 'string' } }])),
};

function jobUrl(ctx, id) { return `${ctx.baseUrl}/jobs/${id}`; }

function publicJob(ctx, j) {
  return {
    id: j.id, title: j.title, business: j.business, area: j.area, pay: j.pay, payUnit: j.payUnit,
    schedule: L.describeSchedule(j.schedule), requirements: j.requirements, niceToHave: j.niceToHave,
    startDate: j.startDate, url: jobUrl(ctx, j.id),
  };
}

async function httpCheck(url, mustContain) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'HireBuddy-selfcheck' } });
    const text = await r.text();
    return { ok: r.ok && (!mustContain || text.includes(mustContain)), status: r.status, bytes: text.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------------------------------------------------------------------------
const tools = {};

// Someone who declined, or already holds a live interview for this job, can't be booked again.
function unavailableFor(jobId, studentId) {
  const ivs = store.db.interviews.filter(i => i.jobId === jobId && i.studentId === studentId);
  if (ivs.some(i => i.status === 'declined')) return 'declined this interview';
  if (ivs.length) return 'already has an interview booked';
  return null;
}

tools.set_plan = {
  description: 'Write your task plan before doing anything else. Each step names the tool that completes it, so progress is tracked automatically.',
  parameters: S('object', {
    steps: { type: 'array', items: S('object', { title: { type: 'string' }, tool: { type: 'string', description: 'Tool that completes this step' } }, ['title', 'tool']) },
  }, ['steps']),
  run: async ({ steps }, ctx) => {
    ctx.run.plan = steps.map(s => ({ ...s, status: 'pending' }));
    ctx.emit({ type: 'plan', plan: ctx.run.plan });
    return { ok: true, steps: steps.length };
  },
};

tools.check_minimum_wage = {
  description: 'Check an offered pay rate against the Malaysian legal minimum wage.',
  parameters: S('object', { pay: { type: 'number' }, payUnit: { type: 'string', enum: ['hour', 'day', 'month'] } }, ['pay', 'payUnit']),
  run: async ({ pay, payUnit }) => L.checkWage(pay, payUnit),
};

tools.publish_job = {
  description: 'Publish a job post as a live public web page that students can apply on. Refuses illegal pay. The page is fetched afterwards to confirm it is live.',
  parameters: S('object', {
    business: { type: 'string' }, ownerEmail: { type: 'string' }, title: { type: 'string' },
    area: { type: 'string', description: 'Klang Valley area, e.g. Subang Jaya' },
    pay: { type: 'number' }, payUnit: { type: 'string', enum: ['hour', 'day', 'month'] },
    schedule: scheduleSchema, startDate: { type: 'string', description: 'YYYY-MM-DD' },
    requirements: { type: 'array', items: { type: 'string' }, description: 'Must-have skills, short lowercase phrases like "espresso", "customer service"' },
    niceToHave: { type: 'array', items: { type: 'string' } },
    description: { type: 'string', description: 'Job ad body. Must mention the pay and the area.' },
  }, ['business', 'title', 'area', 'pay', 'payUnit', 'schedule', 'requirements', 'description']),
  run: async (a, ctx) => {
    const problems = [];
    const area = L.findArea(a.area);
    if (!area) problems.push(`Unknown area "${a.area}". Use a Klang Valley area such as ${Object.keys(L.AREAS).slice(0, 6).join(', ')}.`);
    const wage = L.checkWage(a.pay, a.payUnit);
    if (!wage.ok) problems.push(wage.message + ' Raise the pay before publishing.');
    if (!L.totalMinutes(a.schedule)) problems.push('Schedule has no hours. Use e.g. {"Sat":["08:00-14:00"]}.');
    if (!a.requirements?.length) problems.push('List at least one requirement.');
    const body = (a.description || '').toLowerCase();
    if (!body.includes(String(a.pay))) problems.push(`Description must state the pay (RM${a.pay}).`);
    if (area && !body.includes(area.toLowerCase().split(' ')[0])) problems.push(`Description must mention the area (${area}).`);
    if (problems.length) return { ok: false, problems };

    const job = {
      id: store.id('job'), business: a.business, ownerEmail: a.ownerEmail || null, title: a.title, area,
      pay: a.pay, payUnit: a.payUnit, schedule: a.schedule, startDate: a.startDate || null,
      requirements: a.requirements.map(s => s.toLowerCase()), niceToHave: (a.niceToHave || []).map(s => s.toLowerCase()),
      description: a.description, status: 'open', createdAt: new Date().toISOString(), runId: ctx.run.id,
    };
    store.db.jobs.push(job);
    store.save();
    ctx.run.jobId = job.id;
    const live = await httpCheck(jobUrl(ctx, job.id), job.title);
    return { ok: true, job: publicJob(ctx, job), liveCheck: live };
  },
};

tools.find_candidates = {
  description: 'Find students who could fill the job: people in the talent pool within range (default 10 km) plus anyone who applied on the job page. Widen maxDistanceKm if too few qualify.',
  parameters: S('object', { jobId: { type: 'string' }, maxDistanceKm: { type: 'number' } }, ['jobId']),
  run: async ({ jobId, maxDistanceKm = 10 }) => {
    const job = store.db.jobs.find(j => j.id === jobId);
    if (!job) return { ok: false, error: 'No such job' };
    const applied = new Set(store.db.applications.filter(a => a.jobId === jobId).map(a => a.studentId));
    const out = [];
    for (const s of store.db.students) {
      const km = L.distanceKm(job.area, s.area);
      if (applied.has(s.id) || (km != null && km <= maxDistanceKm)) {
        out.push({ id: s.id, name: s.name, area: s.area, distanceKm: km, campus: s.campus, applied: applied.has(s.id) });
      }
    }
    return { ok: true, job: job.title, radiusKm: maxDistanceKm, count: out.length, candidates: out, excludedOutOfRange: store.db.students.length - out.length };
  },
};

tools.screen_candidates = {
  description: 'Score candidates 0-100 against the job (skills 35, nice-to-have 5, availability 25, distance 15, experience 15, pay fit 5). Every skill point cites a verbatim quote from the candidate profile. qualified = meets every must-have, scores at least 50, and has not declined or already been booked.',
  parameters: S('object', { jobId: { type: 'string' }, candidateIds: { type: 'array', items: { type: 'string' } } }, ['jobId', 'candidateIds']),
  run: async ({ jobId, candidateIds }, ctx) => {
    const job = store.db.jobs.find(j => j.id === jobId);
    if (!job) return { ok: false, error: 'No such job' };
    const results = [];
    for (const cid of candidateIds) {
      const s = store.db.students.find(x => x.id === cid);
      if (!s) { results.push({ id: cid, error: 'unknown candidate' }); continue; }
      const sc = L.scoreMatch(job, s);
      const unavailable = unavailableFor(jobId, s.id);
      results.push({ id: s.id, name: s.name, score: sc.total, requiredCoverage: sc.requiredCoverage,
        qualified: sc.requiredCoverage === 1 && sc.total >= MINIMUM_MATCH && !unavailable, unavailable, bio: s.bio, breakdown: sc.breakdown, why: L.explain(job, s, sc), evidence: sc.evidence, missing: sc.missing });
    }
    results.sort((a, b) => (b.score || 0) - (a.score || 0));
    ctx.run.screening = { jobId, results };
    return { ok: true, ranked: results.map(r => ({ id: r.id, name: r.name, score: r.score, qualified: r.qualified, missing: r.missing, unavailable: r.unavailable, why: r.why })), details: results.map(({ bio, ...r }) => r),
      profiles: results.filter(r => r.missing?.length && !r.unavailable).map(r => ({ id: r.id, name: r.name, missing: r.missing, bio: r.bio })) };
  },
};

tools.verify_screening = {
  description: 'Self-check the screening: recompute every score independently and confirm each evidence quote appears word for word in the candidate profile. Flags any mismatch.',
  parameters: S('object', { jobId: { type: 'string' } }, ['jobId']),
  run: async ({ jobId }, ctx) => {
    const job = store.db.jobs.find(j => j.id === jobId);
    const sc = ctx.run.screening;
    if (!job || !sc || sc.jobId !== jobId) return { ok: false, error: 'Run screen_candidates for this job first.' };
    const checks = [];
    for (const r of sc.results) {
      const s = store.db.students.find(x => x.id === r.id);
      if (!s) continue;
      const again = L.scoreMatch(job, s);
      const quotesOk = (r.evidence || []).every(e => e.source === 'bio' ? s.bio.includes(e.quote) : s.skills.includes(e.quote));
      const scoreOk = again.total === r.score;
      checks.push({ id: s.id, name: s.name, score: r.score, recomputed: again.total, quotesVerbatim: quotesOk, pass: quotesOk && scoreOk });
    }
    const pass = checks.every(c => c.pass);
    ctx.run.screeningVerified = pass;
    return { ok: true, pass, checked: checks.length, checks };
  },
};

tools.schedule_interviews = {
  description: 'Book interview slots for shortlisted candidates in the next withinDays days (default 7). Each slot sits inside both the owner hours and the candidate availability and never overlaps another.',
  parameters: S('object', {
    jobId: { type: 'string' }, candidateIds: { type: 'array', items: { type: 'string' } },
    durationMinutes: { type: 'number' }, ownerHours: scheduleSchema, withinDays: { type: 'number' },
    mode: { type: 'string', description: 'Optional. Default is a video call with a unique Jitsi Meet link. Use e.g. "In person at the cafe" to override.' },
  }, ['jobId', 'candidateIds']),
  run: async ({ jobId, candidateIds, durationMinutes = 20, ownerHours, mode, withinDays = 7 }, ctx) => {
    const job = store.db.jobs.find(j => j.id === jobId);
    if (!job) return { ok: false, error: 'No such job' };
    const weekly = ownerHours && L.totalMinutes(ownerHours) ? ownerHours
      : Object.fromEntries(L.DAYS.map(d => [d, ['10:00-18:00']]));
    const booked = store.db.interviews.filter(i => i.jobId === jobId && i.status !== 'declined').map(i => [new Date(i.start).getTime(), new Date(i.end).getTime()]);
    const now = new Date();
    const today = L.mytParts(now);
    const out = [], unscheduled = [];
    for (const cid of candidateIds) {
      const s = store.db.students.find(x => x.id === cid);
      if (!s) { unscheduled.push({ id: cid, reason: 'unknown candidate' }); continue; }
      let found = null;
      if (unavailableFor(jobId, s.id)) { unscheduled.push({ id: s.id, name: s.name, reason: unavailableFor(jobId, s.id) }); continue; }
      const theirs = store.db.interviews.filter(i => i.studentId === s.id && i.status !== 'declined').map(i => [new Date(i.start).getTime(), new Date(i.end).getTime()]);
      for (let dayOffset = 1; dayOffset <= withinDays && !found; dayOffset++) {
        const base = L.mytDate(today.y, today.mo, today.d + dayOffset, 0);
        const p = L.mytParts(base);
        for (const [os, oe] of L.ranges(weekly[p.dow])) for (const [cs, ce] of L.ranges(s.availability?.[p.dow])) {
          const lo = Math.max(os, cs), hi = Math.min(oe, ce);
          for (let t = Math.ceil(lo / 30) * 30; t + durationMinutes <= hi && !found; t += 30) {
            const st = L.mytDate(p.y, p.mo, p.d, t).getTime(), en = st + durationMinutes * 60000;
            if (booked.some(([a, b]) => st < b + 10 * 60000 && en + 10 * 60000 > a)) continue;
            if (theirs.some(([a, b]) => st < b + 30 * 60000 && en + 30 * 60000 > a)) continue; // their interviews for other jobs
            found = [st, en];
          }
        }
      }
      if (!found) { unscheduled.push({ id: s.id, name: s.name, reason: `no common free time in the next ${withinDays} days` }); continue; }
      booked.push(found);
      const iv = {
        id: store.id('iv'), jobId, studentId: s.id, name: s.name, email: s.email,
        start: new Date(found[0]).toISOString(), end: new Date(found[1]).toISOString(),
        when: L.fmtMyt(new Date(found[0])), runId: ctx.run.id,
      };
      // Each interview gets its own video room, so joining works with no extra setup.
      iv.meetUrl = mode && !/video|jitsi|online|call/i.test(mode) ? null : `https://meet.jit.si/HireBuddy-${iv.id.replace(/^iv-/, '')}`;
      iv.mode = iv.meetUrl ? 'Video call (Jitsi Meet)' : mode;
      store.db.interviews.push(iv);
      out.push({ interviewId: iv.id, candidateId: s.id, name: s.name, email: s.email, when: iv.when, start: iv.start, meetUrl: iv.meetUrl });
    }
    store.save();
    ctx.run.interviews = (ctx.run.interviews || []).concat(out.map(o => o.interviewId));
    return { ok: true, scheduled: out, unscheduled, timezone: 'Asia/Kuala_Lumpur (UTC+8)' };
  },
};

tools.send_email = {
  description: 'Send an email. Interview emails must pass interviewId, and the body must state the exact interview time and the job link. Delivered for real when the address is real and email is configured; demo addresses land in the public outbox.',
  parameters: S('object', {
    to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' },
    interviewId: { type: 'string' }, kind: { type: 'string', enum: ['interview_invite', 'owner_summary', 'application', 'other'] },
  }, ['to', 'subject', 'body']),
  run: async (a, ctx) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.to)) return { ok: false, problems: [`"${a.to}" is not an email address`] };
    let iv = null;
    if (a.interviewId) {
      iv = store.db.interviews.find(i => i.id === a.interviewId);
      if (!iv) return { ok: false, problems: ['Unknown interviewId'] };
      const problems = [];
      if (iv.email !== a.to) problems.push(`This interview belongs to ${iv.email}, not ${a.to}.`);
      if (!a.body.includes(iv.when)) problems.push(`Body must state the interview time exactly as "${iv.when}" (Malaysia time).`);
      const url = jobUrl(ctx, iv.jobId);
      if (!a.body.includes(url)) problems.push(`Body must include the job link ${url}.`);
      if (iv.meetUrl && !a.body.includes(iv.meetUrl)) problems.push(`Body must include the video call link ${iv.meetUrl}.`);
      if (iv.bookedBy === 'seeker') {
        // Screen reader users hear an email top to bottom: the time and how to join come first.
        const head = a.body.split('\n').slice(0, 3).join(' ');
        if (!head.includes(iv.when)) problems.push(`Put the interview time "${iv.when}" in the first three lines, before anything else.`);
        if (!iv.meetUrl && !head.includes(iv.howToJoin.split('.')[0])) problems.push(`Put how to join ("${iv.howToJoin}") in the first three lines.`);
        if (/<[a-z][^>]*>/i.test(a.body)) problems.push('Use plain text only, no HTML.');
      }
      if (problems.length) return { ok: false, problems };
    }
    const email = {
      id: store.id('mail'), to: a.to, subject: a.subject, body: a.body, kind: a.kind || (iv ? 'interview_invite' : 'other'),
      interviewId: iv?.id || null,
      at: new Date().toISOString(), runId: ctx.run.id,
    };
    const delivery = await mail.deliver(email);
    email.delivery = delivery;
    store.db.emails.push(email);
    store.save();
    return { ok: true, emailId: email.id, to: email.to, subject: email.subject, delivery, viewUrl: `${ctx.baseUrl}/outbox#${email.id}` };
  },
};

tools.log_decision = {
  description: 'Record a decision whenever results fall short of the goal (for example too few qualified candidates, nobody free, a decline). State the situation, the options you considered, which one you chose and why. Then act on it.',
  parameters: S('object', {
    situation: { type: 'string' }, options: { type: 'array', items: { type: 'string' } },
    choice: { type: 'string' }, reason: { type: 'string' },
  }, ['situation', 'options', 'choice', 'reason']),
  run: async (a, ctx) => {
    const d = { situation: a.situation, options: a.options, choice: a.choice, reason: a.reason, at: new Date().toISOString() };
    ctx.run.decisions = (ctx.run.decisions || []).concat(d);
    ctx.emit({ type: 'decision', ...d });
    return { ok: true, decisions: ctx.run.decisions.length };
  },
};

tools.relax_requirement = {
  description: 'Move one must-have skill to nice-to-have when nobody (or too few) meet every must-have. The job page updates. The first must-have is the core of the role and cannot be relaxed.',
  parameters: S('object', { jobId: { type: 'string' }, skill: { type: 'string' }, reason: { type: 'string' } }, ['jobId', 'skill', 'reason']),
  run: async ({ jobId, skill, reason }, ctx) => {
    const job = store.db.jobs.find(j => j.id === jobId);
    if (!job) return { ok: false, error: 'No such job' };
    const k = skill.toLowerCase();
    if (!job.requirements.includes(k)) return { ok: false, problems: [`"${skill}" is not a must-have. Must-haves: ${job.requirements.join(', ')}`] };
    if (job.requirements[0] === k) return { ok: false, problems: [`"${skill}" is the core skill of this role and cannot be relaxed.`] };
    job.requirements = job.requirements.filter(r => r !== k);
    job.niceToHave = [...new Set([k, ...(job.niceToHave || [])])];
    job.relaxed = [...(job.relaxed || []), { skill: k, reason, at: new Date().toISOString() }];
    store.save();
    return { ok: true, requirements: job.requirements, niceToHave: job.niceToHave, note: 'Re-run screen_candidates to apply the change.' };
  },
};

tools.record_fit_judgement = {
  description: 'Use your judgement on what a candidate actually wrote: if their profile shows a must-have in other words (e.g. "worked at a bubble tea shop" shows drinks preparation), record it with a verbatim quote from their bio. The quote is checked word for word. Re-run screen_candidates afterwards.',
  parameters: S('object', {
    jobId: { type: 'string' }, candidateId: { type: 'string' }, skill: { type: 'string' },
    quote: { type: 'string', description: 'Exact sentence or phrase copied from the candidate bio' }, reasoning: { type: 'string' },
  }, ['jobId', 'candidateId', 'skill', 'quote', 'reasoning']),
  run: async ({ jobId, candidateId, skill, quote, reasoning }, ctx) => {
    const job = store.db.jobs.find(j => j.id === jobId);
    const s = store.db.students.find(x => x.id === candidateId);
    if (!job || !s) return { ok: false, error: 'Unknown job or candidate' };
    const k = skill.toLowerCase();
    if (![...job.requirements, ...(job.niceToHave || [])].includes(k)) return { ok: false, problems: [`"${skill}" is not a skill this job asks for.`] };
    if (!quote || !s.bio.includes(quote)) return { ok: false, problems: ['Quote must be copied word for word from the candidate bio.'] };
    job.judged = job.judged || {};
    job.judged[s.id] = { ...(job.judged[s.id] || {}), [k]: { quote, reasoning } };
    store.save();
    ctx.emit({ type: 'thought', text: `Judged ${s.name} has "${k}": "${quote}" (${reasoning})` });
    return { ok: true };
  },
};

tools.verify_hiring_outcome = {
  description: 'Final self-check before finishing: job page is live, pay is legal, screening verified, interviews fit both schedules without clashes, and every shortlisted candidate got a correct interview email.',
  parameters: S('object', { jobId: { type: 'string' } }, ['jobId']),
  run: async ({ jobId }, ctx) => {
    const job = store.db.jobs.find(j => j.id === jobId);
    if (!job) return { ok: false, error: 'No such job' };
    const checks = [];
    const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

    const page = await httpCheck(jobUrl(ctx, jobId), job.title);
    add('Job page is live and shows the title', page.ok, `${jobUrl(ctx, jobId)} returned ${page.status || page.error}`);
    add('Pay meets the legal minimum wage', L.checkWage(job.pay, job.payUnit).ok, L.checkWage(job.pay, job.payUnit).message);
    add('Screening recomputed and every quote is verbatim', ctx.run.screeningVerified === true,
      ctx.run.screeningVerified ? 'All scores matched on recompute' : 'verify_screening has not passed');

    const ivs = store.db.interviews.filter(i => i.jobId === jobId && (ctx.run.interviews || []).includes(i.id));
    add('At least one interview booked, or why not explained', ivs.length > 0 || (ctx.run.decisions || []).some(d => /^Stop|Leave/.test(d.choice)), `${ivs.length} booked`);
    const goal = ctx.run.goal || 0;
    if (goal) add(`Goal of ${goal} interviews met, or the shortfall explained`, ivs.length >= goal || (ctx.run.decisions || []).length > 0,
      ivs.length >= goal ? `${ivs.length} of ${goal} booked` : `${ivs.length} of ${goal} booked; ${(ctx.run.decisions || []).length} decision(s) logged`);
    add('Nobody who declined was rebooked', ivs.filter(i => i.status !== 'declined').every(i => !store.db.interviews.some(x => x.jobId === jobId && x.studentId === i.studentId && x.status === 'declined')), 'checked against declines');
    const sorted = [...ivs].sort((a, b) => a.start.localeCompare(b.start));
    const clash = sorted.some((x, i) => i && new Date(x.start) < new Date(sorted[i - 1].end));
    add('No two interviews overlap', !clash, sorted.map(i => `${i.name}: ${i.when}`).join('; '));

    for (const iv of ivs) {
      const s = store.db.students.find(x => x.id === iv.studentId);
      const p = L.mytParts(new Date(iv.start)), q = L.mytParts(new Date(iv.end));
      const st = p.h * 60 + p.mi, en = q.h * 60 + q.mi;
      const inside = L.ranges(s.availability?.[p.dow]).some(([a, b]) => st >= a && en <= b);
      add(`${iv.name} is free at ${iv.when}`, inside, `Their ${p.dow} availability: ${(s.availability?.[p.dow] || []).join(', ') || 'none'}`);

      const em = store.db.emails.find(e => e.interviewId === iv.id);
      add(`${iv.name} was emailed the right time and links`, em && em.body.includes(iv.when) && em.body.includes(jobUrl(ctx, jobId)) && (!iv.meetUrl || em.body.includes(iv.meetUrl)),
        em ? `${em.delivery?.channel}: "${em.subject}"` : 'no interview email found');
    }
    const pass = checks.every(c => c.pass);
    ctx.run.verified = pass;
    return { ok: true, pass, passed: checks.filter(c => c.pass).length, total: checks.length, checks };
  },
};

// ---- Student side -----------------------------------------------------------

const needsSchema = {
  type: 'object',
  description: 'What a blind or low-vision seeker needs. Leave out entirely if they mention no sight loss.',
  properties: {
    vision: { type: 'string', description: '"blind" or "low vision"' },
    screenReader: { type: 'boolean' }, magnification: { type: 'boolean' },
    tool: { type: 'string', description: 'e.g. NVDA, JAWS, VoiceOver, TalkBack, screen magnifier' },
    remoteOnly: { type: 'boolean' }, maxWalkMin: { type: 'number', description: 'Longest walk from a train or bus stop they accept (default 10)' },
    interviewFormat: { type: 'string', description: '"phone", "video" or "in person"' },
  },
};

tools.register_student = {
  description: 'Create or update the job seeker\'s profile so employers can find them. Record any sight-related needs exactly as they described them.',
  parameters: S('object', {
    name: { type: 'string' }, email: { type: 'string' }, area: { type: 'string' }, campus: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' } }, availability: scheduleSchema,
    expectedRate: { type: 'number', description: 'RM per hour' }, bio: { type: 'string', description: 'Short first-person summary built only from facts the seeker gave' },
    needs: needsSchema,
  }, ['name', 'area', 'skills', 'availability', 'bio']),
  run: async (a, ctx) => {
    const area = L.findArea(a.area);
    const problems = [];
    if (!area) problems.push(`Unknown area "${a.area}".`);
    if (!L.totalMinutes(a.availability)) problems.push('Availability has no hours. Use e.g. {"Mon":["09:00-17:00"]}.');
    if (problems.length) return { ok: false, problems };
    const email = a.email || `${a.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@example.com`;
    let s = store.db.students.find(x => x.email === email || x.name.toLowerCase() === a.name.toLowerCase());
    const needs = a.needs && (a.needs.vision || a.needs.screenReader || a.needs.magnification) ? { maxWalkMin: L.DEFAULT_WALK, ...a.needs } : null;
    const skills = a.skills.map(x => x.toLowerCase());
    if (needs?.screenReader && !skills.includes('screen reader')) skills.push('screen reader');
    const fields = { name: a.name, email, area, campus: a.campus || s?.campus || '', skills, availability: a.availability, expectedRate: a.expectedRate || null, bio: a.bio, needs };
    if (s) Object.assign(s, fields); else { s = { id: store.id('stu'), ...fields }; store.db.students.push(s); }
    store.save();
    ctx.run.studentId = s.id;
    return { ok: true, studentId: s.id, profile: s };
  },
};

// Pure matcher shared by search_jobs and the planner's what-if checks.
function matchJobs(s, { maxDistanceKm = 25, minPay = 0, maxWalkMin, askAboutTech = false } = {}) {
  const out = [];
  for (const j of store.db.jobs.filter(j => j.status === 'open')) {
    const remote = j.access?.workMode === 'remote';
    const km = L.distanceKm(j.area, s.area);
    if (!remote && km != null && km > maxDistanceKm) continue;
    const sc = L.scoreMatch(j, s);
    const wage = L.checkWage(j.pay, j.payUnit);
    const access = L.accessFit(j, s, { maxWalkMin, askAboutTech });
    const applied = store.db.applications.some(a => a.jobId === j.id && a.studentId === s.id);
    const freeOverlap = L.overlapMinutes(j.schedule, s.availability || {});
    const suitable = wage.ok && L.hourlyRate(j) >= minPay && freeOverlap > 0 && access.fit !== 'not suitable' && sc.total >= MINIMUM_MATCH && sc.requiredCoverage === 1;
    const whyNot = suitable ? null : !wage.ok ? 'it pays below the legal minimum wage'
      : access.fit === 'not suitable' ? access.blockers[0]
      : L.hourlyRate(j) < minPay ? `it pays ${`RM${j.pay}/${j.payUnit}`}, below your RM${minPay} an hour`
      : freeOverlap <= 0 ? `its hours (${L.describeSchedule(j.schedule)}) are outside your free time`
      : sc.missing.length ? `it asks for ${sc.missing.join(' and ')}` : 'it is a weak match for your skills';
    out.push({
      jobId: j.id, title: j.title, business: j.business, area: j.area, pay: `RM${j.pay}/${j.payUnit}`,
      score: sc.total, requiredCoverage: sc.requiredCoverage, why: L.explain(j, s, sc), evidence: sc.evidence, missing: sc.missing,
      legalPay: wage.ok, belowMinPay: L.hourlyRate(j) < minPay, warning: wage.ok ? null : wage.message,
      access, suitable, whyNot, applied, workMode: access.workMode,
    });
  }
  return out.sort((a, b) => (b.suitable - a.suitable) || b.score - a.score);
}

tools.search_jobs = {
  description: 'Search open jobs for a job seeker. Each job is scored 0-100 and, for blind or low-vision seekers, checked for access: remote or a short walk from a train or bus stop, screen reader support, no tasks that need sight, interview formats. suitable = legal pay, meets their minimum, no access blockers, every required skill, score >= 50. Options widen the search: maxWalkMin, askAboutTech (include jobs that do not state screen reader support), maxDistanceKm, minPay.',
  parameters: S('object', {
    studentId: { type: 'string' }, maxDistanceKm: { type: 'number' }, minPay: { type: 'number' },
    maxWalkMin: { type: 'number' }, askAboutTech: { type: 'boolean' },
  }, ['studentId']),
  run: async (args, ctx) => {
    const s = store.db.students.find(x => x.id === args.studentId);
    if (!s) return { ok: false, error: 'Unknown job seeker' };
    const opts = { maxDistanceKm: args.maxDistanceKm || 25, minPay: args.minPay || 0, maxWalkMin: args.maxWalkMin, askAboutTech: !!args.askAboutTech };
    ctx.run.search = opts;
    const results = matchJobs(s, opts).map(r => ({ ...r, url: jobUrl(ctx, r.jobId) }));
    ctx.run.jobSearch = results;
    return { ok: true, count: results.length, suitable: results.filter(r => r.suitable).length, results };
  },
};

function accessNote(s) {
  const n = s.needs;
  if (!n) return '';
  const bits = [`${s.name.split(' ')[0]} is ${n.vision === 'blind' ? 'blind' : 'a low-vision candidate'} and uses ${n.tool || (n.screenReader ? 'a screen reader' : 'screen magnification')}.`];
  if (n.interviewFormat) bits.push(`Preferred interview format: ${n.interviewFormat}.`);
  bits.push('Please send any documents or tests as Word or plain text, not scanned images or PDFs of pictures.');
  return `\n\nAccess needs for the interview:\n${bits.join('\n')}`;
}

tools.apply_to_job = {
  description: 'Submit an application for the job seeker. The cover note must name the job title and mention at least one real skill from the profile. The employer is emailed in plain text, with the seeker\'s access needs for the interview. Refused for jobs with access blockers or illegal pay.',
  parameters: S('object', { studentId: { type: 'string' }, jobId: { type: 'string' }, coverNote: { type: 'string' } }, ['studentId', 'jobId', 'coverNote']),
  run: async ({ studentId, jobId, coverNote }, ctx) => {
    const s = store.db.students.find(x => x.id === studentId);
    const j = store.db.jobs.find(x => x.id === jobId);
    if (!s || !j) return { ok: false, error: 'Unknown job seeker or job' };
    const problems = [];
    if (j.status !== 'open') problems.push('Job is closed.');
    if (!L.checkWage(j.pay, j.payUnit).ok) problems.push(`This job pays below minimum wage (${L.checkWage(j.pay, j.payUnit).message}). Do not apply.`);
    const fit = L.accessFit(j, s, ctx.run.search || {});
    if (fit.fit === 'not suitable') problems.push(`Not suitable for this seeker: ${fit.blockers.join('; ')}. Do not apply.`);
    if (store.db.applications.some(a => a.jobId === jobId && a.studentId === studentId)) problems.push('Already applied to this job.');
    const note = coverNote.toLowerCase();
    if (!note.includes(j.title.toLowerCase()) && !note.includes(j.business.toLowerCase())) problems.push(`Cover note must name the job ("${j.title}") or the business.`);
    if (!s.skills.some(k => note.includes(k))) problems.push(`Cover note must mention at least one skill from the profile: ${s.skills.join(', ')}.`);
    if (problems.length) return { ok: false, problems };
    const app = { id: store.id('app'), jobId, studentId, coverNote, at: new Date().toISOString(), runId: ctx.run.id, score: L.scoreMatch(j, s).total, asks: fit.asks };
    store.db.applications.push(app);
    store.save();
    ctx.run.applications = (ctx.run.applications || []).concat(app.id);
    const asks = fit.asks.some(a => /screen reader/.test(a)) ? `\n\nQuestion: does your setup work with ${s.needs.tool || 'a screen reader'}? HireBuddy checked your listing and it does not say.` : '';
    const email = {
      id: store.id('mail'), to: mail.APPLICATION_INBOX, kind: 'application',
      subject: `${j.ownerEmail || 'owner@example.com'} — New applicant for ${j.title}: ${s.name}`,
      body: `${s.name} (${s.area}) applied for ${j.title}.\n\n${coverNote}${accessNote(s)}${asks}\n\nMatch score: ${app.score}/100\nReply to: ${s.email}\nJob page: ${jobUrl(ctx, j.id)}`,
      at: new Date().toISOString(), runId: ctx.run.id,
    };
    email.delivery = await mail.deliver(email);
    store.db.emails.push(email);
    store.save();
    return { ok: true, applicationId: app.id, job: j.title, business: j.business, access: fit, businessNotified: email.delivery };
  },
};

function joinText(iv, j) {
  if (iv.format === 'phone') return `${j.business} will phone you. No link or travel needed.`;
  if (iv.format === 'video') return `Join the video call: ${iv.meetUrl}`;
  const t = j.access?.transit;
  return `In person at ${j.business}, ${j.area}.${t ? ` Nearest stop: ${t.station}, about a ${t.walkMin}-minute walk.` : ''}`;
}

tools.book_interview = {
  description: 'Book an interview for the job seeker with an employer they applied to. Picks the first slot in the next 14 days inside the employer\'s interview hours and the seeker\'s availability, clear of their other interviews. Format is the seeker\'s preference when the employer offers it, else the first accessible format offered.',
  parameters: S('object', {
    studentId: { type: 'string' }, jobId: { type: 'string' },
    format: { type: 'string', description: 'Optional: "phone", "video" or "in person"' },
  }, ['studentId', 'jobId']),
  run: async ({ studentId, jobId, format }, ctx) => {
    const s = store.db.students.find(x => x.id === studentId);
    const j = store.db.jobs.find(x => x.id === jobId);
    if (!s || !j) return { ok: false, error: 'Unknown job seeker or job' };
    if (!store.db.applications.some(a => a.jobId === jobId && a.studentId === studentId)) return { ok: false, problems: ['Apply to this job before booking an interview.'] };
    if (store.db.interviews.some(i => i.jobId === jobId && i.studentId === studentId && i.status !== 'declined')) return { ok: false, problems: ['An interview for this job is already booked.'] };
    const offered = j.access?.interviewFormats || ['in person'];
    const fmt = format && offered.includes(format) ? format : L.pickFormat(j, s);
    const hours = j.access?.interviewHours || j.schedule;
    // Avoid every interview this person has, including times they said they can't make.
    const busy = store.db.interviews.filter(i => i.studentId === s.id || (i.jobId === jobId && i.status !== 'declined'))
      .map(i => [new Date(i.start).getTime(), new Date(i.end).getTime()]);
    const today = L.mytParts(new Date());
    let found = null;
    for (let d = 1; d <= 14 && !found; d++) {
      const p = L.mytParts(L.mytDate(today.y, today.mo, today.d + d, 0));
      for (const [os, oe] of L.ranges(hours[p.dow])) for (const [cs, ce] of L.ranges(s.availability?.[p.dow])) {
        for (let t = Math.ceil(Math.max(os, cs) / 30) * 30; t + 30 <= Math.min(oe, ce) && !found; t += 30) {
          const st = L.mytDate(p.y, p.mo, p.d, t).getTime(), en = st + 30 * 60000;
          if (busy.some(([a, b]) => st < b + 30 * 60000 && en + 30 * 60000 > a)) continue;
          found = [st, en];
        }
      }
    }
    if (!found) return { ok: false, problems: [`No time in the next 14 days fits both ${j.business}'s interview hours (${L.describeSchedule(hours)}) and ${s.name}'s availability.`] };
    const iv = {
      id: store.id('iv'), jobId, studentId: s.id, name: s.name, email: s.email,
      start: new Date(found[0]).toISOString(), end: new Date(found[1]).toISOString(),
      when: L.fmtMyt(new Date(found[0])), whenLong: L.fmtLong(new Date(found[0])), runId: ctx.run.id, bookedBy: 'seeker', format: fmt,
    };
    iv.meetUrl = fmt === 'video' ? `https://meet.jit.si/HireBuddy-${iv.id.replace(/^iv-/, '')}` : null;
    iv.mode = fmt === 'video' ? 'Video call (Jitsi Meet)' : fmt === 'phone' ? 'Phone call' : 'In person';
    iv.howToJoin = joinText(iv, j);
    store.db.interviews.push(iv);
    store.save();
    ctx.run.interviews = (ctx.run.interviews || []).concat(iv.id);
    return { ok: true, interviewId: iv.id, job: j.title, business: j.business, email: s.email, when: iv.when, whenLong: iv.whenLong, format: fmt,
      preferred: s.needs?.interviewFormat || null, howToJoin: iv.howToJoin, meetUrl: iv.meetUrl };
  },
};

tools.check_outside_listings = {
  description: 'Check the jobs WorkBuddy found on other job sites (passed to this run as listings) against the seeker: legal pay and their pay floor, tasks that need sight, screen reader support, hours and travel. Drafts an application with the open questions for each one worth asking about. HireBuddy cannot apply or book on other sites, so nothing is sent.',
  parameters: S('object', { studentId: { type: 'string' } }, ['studentId']),
  run: async ({ studentId }, ctx) => {
    const s = store.db.students.find(x => x.id === studentId);
    if (!s) return { ok: false, problems: ['Unknown student'] };
    const results = outside.assessAll(ctx.run.options?.listings || [], s);
    ctx.run.outside = results;
    return { ok: true, checked: results.length, worthAsking: results.filter(r => r.verdict !== 'not suitable').length,
      results: results.map(r => ({ title: r.title, employer: r.employer, site: r.site, url: r.url, verdict: r.verdict, blockers: r.blockers, reasons: r.reasons, questions: r.asks, draft: r.draft })),
      note: 'Nothing was sent. HireBuddy can only apply and book interviews for jobs listed on HireBuddy.' };
  },
};

tools.verify_applications = {
  description: 'Final self-check for a job seeker: every application is stored and the employer notified, pay is legal, access is re-checked with no blockers, each interview fits both schedules and never clashes, the format is accessible, in-person venues are a short walk from a stop, and each email to the seeker states the time and how to join in its first lines, in plain text.',
  parameters: S('object', { studentId: { type: 'string' } }, ['studentId']),
  run: async ({ studentId }, ctx) => {
    const s = store.db.students.find(x => x.id === studentId);
    const apps = store.db.applications.filter(a => a.studentId === studentId && (ctx.run.applications || []).includes(a.id));
    const ivs = store.db.interviews.filter(i => (ctx.run.interviews || []).includes(i.id));
    const checks = [];
    const add = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });
    add(ctx.run.daily ? 'Daily check: any new application or interview is recorded' : 'At least one application or interview', ctx.run.daily || apps.length + ivs.length > 0, `${apps.length} applications, ${ivs.length} interviews${ctx.run.daily && !ivs.length ? ' (no new suitable jobs today)' : ''}`);
    const goal = ctx.run.goal || 0;
    if (goal) add(`Goal of ${goal} interviews met, or the shortfall explained`, ivs.length >= goal || (ctx.run.decisions || []).length > 0,
      `${ivs.length} of ${goal} booked${ivs.length < goal ? `; ${(ctx.run.decisions || []).length} decision(s) logged` : ''}`);
    for (const a of apps) {
      const j = store.db.jobs.find(x => x.id === a.jobId);
      const data = await fetch(`${ctx.baseUrl}/api/jobs/${a.jobId}`).then(r => r.json()).catch(() => null);
      add(`${j.title}: application is on the job record`, data?.applicants?.some(x => x.applicationId === a.id), `${ctx.baseUrl}/api/jobs/${a.jobId}`);
      add(`${j.title}: pays at least minimum wage`, L.checkWage(j.pay, j.payUnit).ok, L.checkWage(j.pay, j.payUnit).message);
      if (s.needs) {
        const fit = L.accessFit(j, s, ctx.run.search || {});
        add(`${j.title}: suits your access needs`, fit.fit !== 'not suitable', [...fit.reasons, ...fit.asks].join('; ') || 'no blockers');
      }
      const em = store.db.emails.find(e => e.kind === 'application' && e.runId === ctx.run.id && e.subject.includes(j.title));
      add(`${j.business} was sent the application as plain text`, !!em && !/<[a-z][^>]*>/i.test(em.body), em ? em.delivery?.channel : 'no email');
    }
    const sorted = [...ivs].filter(i => i.status !== 'declined').sort((a, b) => a.start.localeCompare(b.start));
    add('No two interviews overlap', !sorted.some((x, i) => i && new Date(x.start) < new Date(sorted[i - 1].end)), sorted.map(i => i.when).join('; ') || 'none');
    for (const iv of ivs) {
      const j = store.db.jobs.find(x => x.id === iv.jobId);
      const p = L.mytParts(new Date(iv.start)), q = L.mytParts(new Date(iv.end));
      const st = p.h * 60 + p.mi, en = q.h * 60 + q.mi;
      const inside = (m) => L.ranges(m?.[p.dow]).some(([a, b]) => st >= a && en <= b);
      add(`${j.business}: ${iv.when} is inside your free time and their interview hours`, inside(s.availability) && inside(j.access?.interviewHours || j.schedule), `${p.dow}: you ${(s.availability?.[p.dow] || []).join(', ')}`);
      const offered = j.access?.interviewFormats || ['in person'];
      add(`${j.business}: ${iv.format} interview is offered${s.needs?.interviewFormat ? ` (you asked for ${s.needs.interviewFormat})` : ''}`, offered.includes(iv.format), `Offered: ${offered.join(', ')}`);
      if (iv.format === 'in person' && s.needs) {
        const t = j.access?.transit, max = (ctx.run.search?.maxWalkMin) || s.needs.maxWalkMin || L.DEFAULT_WALK;
        add(`${j.business}: venue is reachable by public transport`, t && t.walkMin <= max, t ? `${t.walkMin}-minute walk from ${t.station}` : 'no stop listed');
      }
      const em = store.db.emails.find(e => e.interviewId === iv.id);
      const head = em ? em.body.split('\n').slice(0, 3).join(' ') : '';
      add(`${j.business}: your email says the time and how to join in its first lines`, em && head.includes(iv.when) && (iv.meetUrl ? em.body.includes(iv.meetUrl) : head.includes(iv.howToJoin.split('.')[0])) && !/<[a-z][^>]*>/i.test(em.body),
        em ? `"${em.subject}"` : 'no email found');
    }
    const given = outside.clean(ctx.run.options?.listings || []);
    if (given.length) {
      const done = ctx.run.outside || [];
      add(`All ${given.length} jobs found on other sites were checked`, done.length === given.length, `${done.length} of ${given.length} checked`);
      const fresh = outside.assessAll(ctx.run.options.listings, s);
      const wrong = done.filter((r, i) => r.verdict !== 'not suitable' && fresh[i]?.verdict === 'not suitable');
      add('No job from another site below your pay floor, the minimum wage, or needing sight is recommended', !wrong.length, wrong.map(r => r.title).join(', ') || 'none');
      const ok = done.filter(r => r.verdict !== 'not suitable');
      add('Each job worth asking about has a drafted application with its open questions', ok.every(r => r.draft && r.draft.includes(r.title) && r.asks.every(q => r.draft.includes(q))), `${ok.length} drafted`);
      if (s.needs?.screenReader) add('Each draft asks about screen reader support unless the listing already mentions it', ok.every(r => r.reasons.includes('mentions accessibility or screen readers') || /screen reader|NVDA|JAWS|VoiceOver|TalkBack/.test(r.draft)), `${ok.length} checked`);
      add('Nothing was sent to employers on other sites', !store.db.emails.some(e => e.runId === ctx.run.id && e.kind === 'outside'), 'drafts only');
    }
    const pass = checks.every(c => c.pass);
    ctx.run.verified = pass;
    return { ok: true, pass, passed: checks.filter(c => c.pass).length, total: checks.length, checks };
  },
};

tools.finish = {
  description: 'Deliver the final result to the user. Only allowed after the final verification passed.',
  parameters: S('object', {
    summary: { type: 'string', description: 'Plain-language result for the user: what was done, the outcome, and links.' },
  }, ['summary']),
  run: async ({ summary }, ctx) => {
    if (ctx.run.verified !== true) {
      return { ok: false, problems: ['Final verification has not passed. Run the verify tool for this persona, fix any failed check, then finish.'] };
    }
    ctx.run.summary = summary;
    ctx.run.done = true;
    return { ok: true };
  },
};

const HIRER_TOOLS = ['set_plan', 'check_minimum_wage', 'publish_job', 'find_candidates', 'screen_candidates', 'record_fit_judgement', 'verify_screening',
  'log_decision', 'relax_requirement', 'schedule_interviews', 'send_email', 'verify_hiring_outcome', 'finish'];
const STUDENT_TOOLS = ['set_plan', 'register_student', 'search_jobs', 'check_outside_listings', 'check_minimum_wage', 'log_decision', 'apply_to_job', 'book_interview', 'send_email', 'verify_applications', 'finish'];

module.exports = { tools, HIRER_TOOLS, STUDENT_TOOLS, MINIMUM_MATCH, jobUrl, matchJobs };
