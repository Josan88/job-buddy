// Jobs found on other sites. WorkBuddy reads real job sites on the user's machine and passes what
// it found to hirebuddy_run as `listings`. HireBuddy never fetches those sites itself. Each listing
// gets the same checks as a HireBuddy job (legal pay, the seeker's pay floor, tasks that need sight,
// screen reader support, hours, travel), and every one that could suit gets a drafted application
// with the questions the listing leaves open. HireBuddy can't apply or book on those sites, so
// nothing is sent: the person decides.
const L = require('./lib');
const { parsePay, parseSchedule } = require('./parse');

const MAX_LISTINGS = 20;
const clip = (v, n = 3000) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function clean(listings) {
  if (!Array.isArray(listings)) return [];
  // A search-result snippet may arrive as plain text, or with only a title: missing details become questions.
  return listings.slice(0, MAX_LISTINGS).map(l => (typeof l === 'string' ? { description: l } : l || {})).map(l => ({
    title: clip(l.title, 160) || clip(String(l.description || '').split(/[.,;]/)[0], 80) || 'A job',
    employer: clip(l.employer || l.company, 160) || null,
    companyEmail: clip(l.companyEmail || l.ownerEmail || l.email, 254) || null,
    site: clip(l.site || l.source, 80) || (/^https?:\/\/(?:www\.)?([^/]+)/i.exec(l.url || '') || [])[1] || null,
    url: /^https?:\/\//i.test(l.url || '') ? clip(l.url, 500) : null,
    pay: clip(l.pay || l.salary, 120),
    location: clip(l.location, 160),
    hours: clip(l.hours || l.schedule, 200),
    description: clip(l.description),
  }));
}

// Tasks a listing names that need sight. The words are checked in the listing's own text.
const SIGHT = [
  [/motorcycle|motorbike|\bdespatch rider|\brider\b|driving licen[cs]e|\bdriver\b|must drive|own (transport|vehicle|car)/i, 'driving or riding'],
  [/good eyesight|visual inspection|inspect (products|items) visually|colou?r vision|colou?r[- ]blind/i, 'checking things by sight'],
  [/graphic design|photoshop|illustrator|photograph|video edit/i, 'visual design work'],
  [/handwrit|printed (tickets|orders|forms|documents)|price tags?|read(ing)? labels/i, 'reading print, tags or labels'],
  [/cctv|surveillance|security guard|patrol/i, 'watching CCTV or patrolling'],
  [/forklift|operate machinery|machine operator/i, 'operating machinery'],
  [/\bwait(er|ress|ing staff)\b|serv(e|ing) tables/i, 'serving tables'],
];
const ACCESS_WORDS = /screen ?reader|\bnvda\b|\bjaws\b|voiceover|talkback|accessib|disabilit|\boku\b|\bpwd\b|inclusive (employer|workplace)/i;

// "Mon to Fri 9am-6pm", "weekdays 9-5", "full time". Without any day words the hours are unknown.
function hoursOf(text) {
  const t = (text || '').toLowerCase();
  if (/full[- ]time/.test(t) && !/weekend|sat|sun/.test(t)) return parseSchedule(`weekdays ${t}`, '09:00-18:00');
  if (!/weekday|weekend|daily|\b(mon(day)?|tues?(day)?|wed(nesday)?|thu(rs?)?(day)?|fri(day)?|sat(urday)?|sun(day)?)s?\b/.test(t)) return null;
  if (/\bdaily\b|7 days/.test(t)) return parseSchedule(`weekdays weekend ${t}`, '09:00-18:00');
  const fromTo = t.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*(?:-|–|to)\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/);
  if (fromTo) {
    const W = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const a = W.indexOf(fromTo[1]), b = W.indexOf(fromTo[2]);
    const days = b >= a ? W.slice(a, b + 1) : [...W.slice(a), ...W.slice(0, b + 1)];
    return parseSchedule(`${days.join(' ')} ${t}`, '09:00-18:00');
  }
  return parseSchedule(t, '09:00-18:00');
}

function assess(l, s) {
  const n = s.needs || {};
  const all = [l.title, l.description, l.location, l.hours, l.pay].join(' ');
  const out = { blockers: [], asks: [], reasons: [] };

  for (const [re, what] of SIGHT) if (re.test(all)) out.blockers.push(`the listing involves ${what}`);

  const p = parsePay((l.pay || all).replace(/(\d),(\d{3})/g, '$1$2'));
  let payText = null;
  if (!p) out.asks.push('What is the pay?');
  else {
    const wage = L.checkWage(p.pay, p.payUnit);
    // Monthly pay to hourly the way the Minimum Wages Order does it: x 12 / 52 / 45.
    const hourly = p.payUnit === 'month' ? p.pay * 12 / 52 / 45 : L.hourlyRate(p);
    payText = `RM${p.pay.toLocaleString('en-MY')}/${p.payUnit}`;
    if (!wage.ok) out.blockers.push(`it pays ${payText}, below the legal minimum of RM${L.MIN_WAGE[p.payUnit].toLocaleString('en-MY')}/${p.payUnit}`);
    else if (s.expectedRate && hourly < s.expectedRate) out.blockers.push(`it pays ${payText}${p.payUnit === 'hour' ? '' : `, about RM${hourly.toFixed(2)} an hour`}, below your RM${s.expectedRate} an hour`);
    else out.reasons.push(`pays ${payText}`);
  }


  const remote = /\bremote\b|work from home|\bwfh\b|home[- ]based/i.test(all);
  const hybrid = /hybrid/i.test(all);
  if (n.remoteOnly && !remote) out.blockers.push('it is not remote and you asked for remote work only');
  else if (remote && !hybrid) out.reasons.push('remote, no travel');
  else {
    const area = L.findArea(`${l.location} ${l.title}`) || L.findArea(all);
    const km = area ? L.distanceKm(area, s.area) : null;
    if (km != null && km > 40) out.blockers.push(`it is in ${area}, about ${Math.round(km)} km from ${s.area}`);
    const m = all.match(/([A-Z0-9][\w']*(?: [A-Z0-9][\w']*)?) (LRT|MRT|BRT|KTM|Monorail)\b/);
    const stop = m && `${m[1].replace(/^(near|at|to|from|by|beside|opposite) /i, '')} ${m[2]}`;
    if (stop) out.reasons.push(`mentions ${stop}`);
    out.asks.push(stop ? `How many minutes' walk is the workplace from ${stop}?` : 'How far is the workplace from the nearest train or bus stop?');
    if (area && km != null && km <= 40) out.reasons.push(km < 3 ? `in ${area}, near you` : `in ${area}, about ${Math.round(km)} km away`);
  }

  if (n.screenReader) {
    if (ACCESS_WORDS.test(all)) out.reasons.push('mentions accessibility or screen readers');
    else out.asks.push(`Do your computer systems work with ${n.tool || 'a screen reader'}?`);
  }

  const sched = hoursOf(l.hours || all);
  if (!sched) out.asks.push('What are the working hours?');
  else if (s.availability && L.overlapMinutes(sched, s.availability) <= 0) out.blockers.push(`its hours (${L.describeSchedule(sched)}) are outside your free time`);
  else out.reasons.push(`hours ${L.describeSchedule(sched)} overlap your free time`);

  const verdict = out.blockers.length ? 'not suitable' : 'worth asking';
  return { ...l, payText, verdict, ...out, draft: verdict === 'not suitable' ? null : draft(l, s, out.asks) };
}

function draft(l, s, asks) {
  const n = s.needs || {};
  const skills = (s.skills || []).filter(x => x !== 'screen reader').slice(0, 3)
    .map(x => x === 'bahasa melayu' ? 'Malay' : /^(english|mandarin|cantonese|tamil)$/.test(x) ? x[0].toUpperCase() + x.slice(1) : x);
  const lines = [
    `Subject: Application for ${l.title}`,
    '',
    `Dear ${l.employer ? `${l.employer} hiring team` : 'hiring team'},`,
    '',
    `I would like to apply for the ${l.title} role I saw${l.site ? ` on ${l.site}` : ' advertised'}. My strengths are ${skills.length > 1 ? `${skills.slice(0, -1).join(', ')} and ${skills[skills.length - 1]}` : skills[0] || 'customer service'}, and I am free ${L.describeSchedule(s.availability || {})}.`,
  ];
  if (n.vision) lines.push('', `I am ${n.vision === 'blind' ? 'blind' : 'low vision'} and use ${n.tool || (n.screenReader ? 'a screen reader' : 'screen magnification')}.${n.interviewFormat ? ` A ${n.interviewFormat} interview would suit me best.` : ''} Please send any documents or tests as Word or plain text, not scanned images.`);
  if (asks.length) lines.push('', 'Could you tell me:', ...asks.map((a, i) => `${i + 1}. ${a}`));
  lines.push('', 'Thank you,', s.name);
  return lines.join('\n');
}

function assessAll(listings, s) {
  return clean(listings).map(l => assess(l, s));
}

const named = (r, site = true) => `${r.title}${r.employer ? ` at ${r.employer}` : ''}${site && r.site ? ` on ${r.site}` : ''}`;

// One paragraph for the spoken summary.
function summarise(results, student) {
  if (student?.needs?.vision === 'blind') results = results.filter(r => r.verdict !== 'not suitable');
  if (!results.length) return '';
  const ok = results.filter(r => r.verdict !== 'not suitable');
  const no = results.filter(r => r.verdict === 'not suitable');
  let t = ` I also checked ${results.length} job${results.length === 1 ? '' : 's'} WorkBuddy found on other sites.`;
  if (ok.length) t += ` Worth asking about: ${ok.map(r => named(r)).join('; ')}. I drafted an application for ${ok.length === 1 ? 'it' : 'each'} that asks what the listing leaves out, but I can't apply or book interviews on other sites, so nothing was sent.`;
  if (no.length) t += ` Not suitable: ${no.map(r => `${named(r, false)}, because ${r.blockers[0]}`).join('; ')}.`;
  return t;
}

module.exports = { clean, assess, assessAll, summarise, hoursOf, MAX_LISTINGS };
