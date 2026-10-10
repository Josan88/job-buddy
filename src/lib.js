// Deterministic helpers: places, availability maths, wage rules, scoring and calendar files.
// Everything here is pure so the self-check step can recompute any result independently.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };

// Approximate centre points for Klang Valley areas (lat, lng).
const AREAS = {
  'subang jaya': [3.0500, 101.5850], 'usj': [3.0450, 101.5800], 'ss15': [3.0760, 101.5880],
  'bandar sunway': [3.0680, 101.6070], 'sunway': [3.0680, 101.6070],
  'petaling jaya': [3.1073, 101.6067], 'pj': [3.1073, 101.6067], 'damansara': [3.1500, 101.6200],
  'shah alam': [3.0733, 101.5185], 'kuala lumpur': [3.1390, 101.6869], 'kl': [3.1390, 101.6869],
  'bangsar': [3.1300, 101.6700], 'bukit jalil': [3.0580, 101.6920], 'cheras': [3.0870, 101.7430],
  'puchong': [3.0250, 101.6160], 'cyberjaya': [2.9213, 101.6559], 'putrajaya': [2.9264, 101.6964],
  'klang': [3.0449, 101.4456], 'seri kembangan': [3.0220, 101.7050], 'kajang': [2.9930, 101.7880],
  'ampang': [3.1500, 101.7600], 'setapak': [3.1960, 101.7180], 'kepong': [3.2100, 101.6350],
  'mont kiara': [3.1720, 101.6510], 'semenyih': [2.9510, 101.8430], 'sri petaling': [3.0680, 101.6880], 'wangsa maju': [3.2050, 101.7370],
};

// Pretty names keyed by the canonical lowercase key.
const AREA_LABEL = Object.fromEntries(Object.keys(AREAS).map(k => [k, k.replace(/\b\w/g, c => c.toUpperCase())
  .replace(/^Usj$/, 'USJ').replace(/^Ss15$/, 'SS15').replace(/^Pj$/, 'Petaling Jaya').replace(/^Kl$/, 'Kuala Lumpur')]));

function findArea(text) {
  const t = (text || '').toLowerCase();
  // Longest names first so "bandar sunway" wins over "sunway".
  const keys = Object.keys(AREAS).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`(^|[^a-z])${k.replace(/ /g, '\\s+')}([^a-z]|$)`);
    if (re.test(t)) return AREA_LABEL[k];
  }
  return null;
}

function coords(area) {
  return AREAS[(area || '').toLowerCase()] || null;
}

function distanceKm(a, b) {
  const p = coords(a), q = coords(b);
  if (!p || !q) return null;
  const R = 6371, rad = Math.PI / 180;
  const dLat = (q[0] - p[0]) * rad, dLng = (q[1] - p[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p[0] * rad) * Math.cos(q[0] * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

// ---- Time and availability ------------------------------------------------

const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0); };
const toHHMM = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

function ranges(list) {
  return (list || []).map(r => { const [a, b] = r.split('-'); return [toMin(a), toMin(b)]; });
}

// Minutes of overlap between two weekly availability maps.
function overlapMinutes(a, b) {
  let total = 0;
  for (const d of DAYS) {
    for (const [s1, e1] of ranges(a?.[d])) for (const [s2, e2] of ranges(b?.[d])) {
      total += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
    }
  }
  return total;
}

function totalMinutes(a) {
  return DAYS.reduce((n, d) => n + ranges(a?.[d]).reduce((m, [s, e]) => m + (e - s), 0), 0);
}

function describeSchedule(s) {
  return WEEK.filter(d => s?.[d]?.length).map(d => `${d} ${s[d].join(', ')}`).join('; ') || 'flexible';
}

// Malaysia time is UTC+8 with no daylight saving.
const MYT = 8 * 60 * 60 * 1000;
function mytParts(date) {
  const d = new Date(date.getTime() + MYT);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), dow: DAYS[d.getUTCDay()], h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
function mytDate(y, mo, d, minutes) {
  return new Date(Date.UTC(y, mo, d, 0, 0) - MYT + minutes * 60000);
}
function fmtMyt(date) {
  const p = mytParts(date);
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][p.mo];
  const h12 = ((p.h + 11) % 12) + 1;
  return `${p.dow} ${p.d} ${month}, ${h12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}

// Spoken-friendly form for screen readers: "Monday 12 October, 10:00 AM".
function fmtLong(date) {
  const p = mytParts(date);
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][p.mo];
  const h12 = ((p.h + 11) % 12) + 1;
  return `${DAY_NAMES[p.dow]} ${p.d} ${month}, ${h12}:${String(p.mi).padStart(2, '0')} ${p.h < 12 ? 'AM' : 'PM'}`;
}

// ---- Wages ------------------------------------------------------------------

// Minimum Wages Order 2024, P.U.(A) 376: RM1,700 a month, RM8.72 an hour (1700 x 12 / 52 / 45),
// RM65.38 a day for a 6-day week. Applies to all employers from 1 Aug 2025.
const MIN_WAGE = { hour: 8.72, month: 1700, day: 65.38, source: 'Minimum Wages Order 2024, P.U.(A) 376 (Malaysia), all employers from 1 Aug 2025' };

function checkWage(pay, payUnit = 'hour') {
  const unit = ['hour', 'day', 'month'].includes(payUnit) ? payUnit : 'hour';
  const floor = MIN_WAGE[unit];
  const ok = Number(pay) >= floor;
  const rm = n => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2));
  return {
    ok, pay: Number(pay), unit, minimum: floor, source: MIN_WAGE.source,
    message: ok
      ? `RM${rm(pay)}/${unit} meets the legal minimum of RM${rm(floor)}/${unit}.`
      : `RM${rm(pay)}/${unit} is below the legal minimum of RM${rm(floor)}/${unit}.`,
  };
}

// ---- Skill matching ---------------------------------------------------------

const SYNONYMS = {
  'espresso': ['espresso', 'barista', 'coffee'],
  'barista': ['barista', 'espresso', 'coffee'],
  'latte art': ['latte art'],
  'customer service': ['customer service', 'serving customers', 'customers', 'customer'],
  'cashier': ['cashier', 'till'],
  'food handling': ['food handling', 'typhoid'],
  'tutoring': ['tutor', 'tutoring', 'teaching'],
  'mathematics': ['mathematics', 'maths', 'math'],
  'social media': ['social media', 'instagram', 'tiktok'],
  'data entry': ['data entry', 'key in'],
  'event crew': ['event crew', 'events', 'concert'],
  'english': ['english'], 'bahasa melayu': ['bahasa melayu', 'malay', 'bm'],
  'phone': ['phone', 'calls', 'call centre', 'call center', 'hotline', 'telesales', 'telemarketing'],
  'typing': ['typing', 'touch type', 'words a minute', 'transcrib', 'type up', 'type fast', 'typist'],
  'screen reader': ['screen reader', 'nvda', 'jaws', 'voiceover', 'talkback'],
  'massage': ['massage', 'reflexology'],
  'copywriting': ['copywriting', 'captions', 'articles', 'content writ'],
  'mandarin': ['mandarin', 'chinese'], 'driving license': ['driving license', 'driving licence', 'license'],
};

function termsFor(skill) {
  const k = skill.toLowerCase().trim();
  return SYNONYMS[k] || [k];
}

const NEGATION = /\b(no|not|never|without)\b|eager to learn|keen to learn|want to learn/;

function sentences(text) {
  return (text || '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

// Find a verbatim quote that proves a skill. Returns { quote, source } or null.
function evidenceFor(person, skill) {
  const terms = termsFor(skill);
  for (const s of sentences(person.bio)) {
    const low = s.toLowerCase();
    if (NEGATION.test(low)) continue; // "no barista experience yet" is not evidence
    if (terms.some(t => new RegExp(`\\b${t}`).test(low))) return { quote: s, source: 'bio' };
  }
  const listed = (person.skills || []).find(x => terms.includes(x.toLowerCase()) || x.toLowerCase() === skill.toLowerCase());
  if (listed) return { quote: listed, source: 'skills' };
  return null;
}

// ---- Scoring ------------------------------------------------------------------
// 100 points: required skills 35, nice-to-have 5, availability 25, distance 15, experience 15, pay fit 5.

function scoreMatch(job, person) {
  const req = job.requirements || [];
  const nice = job.niceToHave || [];
  const evidence = [];
  const missing = [];

  const judged = (job.judged || {})[person.id] || {};
  const find = r => evidenceFor(person, r) || (judged[r] && person.bio?.includes(judged[r].quote) ? { quote: judged[r].quote, source: 'bio', judged: true } : null);
  let reqHit = 0;
  for (const r of req) {
    const ev = find(r);
    if (ev) { reqHit++; evidence.push({ skill: r, required: true, ...ev }); } else missing.push(r);
  }
  let niceHit = 0;
  for (const r of nice) {
    const ev = find(r);
    if (ev) { niceHit++; evidence.push({ skill: r, required: false, ...ev }); }
  }
  const skills = req.length ? Math.round((35 * reqHit) / req.length) : 35;
  const niceScore = nice.length ? Math.round((5 * niceHit) / nice.length) : 5;

  const jobMin = totalMinutes(job.schedule);
  const ov = overlapMinutes(job.schedule, person.availability);
  const availability = jobMin ? Math.round(25 * Math.min(1, ov / jobMin)) : 25;

  const remote = job.access?.workMode === 'remote';
  const km = remote ? null : distanceKm(job.area, person.area);
  const distance = remote ? 15 : km == null ? 5 : km <= 5 ? 15 : km <= 10 ? 11 : km <= 20 ? 6 : 2;

  // Experience: a bio sentence naming the role or a core requirement plus a duration.
  const roleWords = [...new Set([...(job.title || '').toLowerCase().split(/\W+/).filter(w => w.length > 3 && !['weekend', 'part', 'time', 'weekends', 'assistant'].includes(w)), ...req.flatMap(termsFor)])];
  let experience = 0, expQuote = null;
  for (const s of sentences(person.bio)) {
    const low = s.toLowerCase();
    if (NEGATION.test(low)) continue;
    if (roleWords.some(w => low.includes(w))) {
      const dur = low.match(/(\d+)\+?\s*(month|year)s?/);
      const months = dur ? Number(dur[1]) * (dur[2] === 'year' ? 12 : 1) : 0;
      const pts = 8 + (months >= 12 ? 7 : months >= 6 ? 5 : months > 0 ? 3 : 0);
      if (pts > experience) { experience = pts; expQuote = s; }
    }
  }

  const exp = Number(person.expectedRate || 0);
  const rate = hourlyRate(job);
  const payFit = !exp || exp <= rate ? 5 : exp - rate <= 2 ? 2 : 0;

  const breakdown = { skills, niceToHave: niceScore, availability, distance, experience, payFit };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return {
    total, breakdown, evidence, missing, requiredCoverage: req.length ? reqHit / req.length : 1,
    overlapMinutes: ov, scheduleMinutes: jobMin, distanceKm: km,
    experienceQuote: expQuote,
  };
}

// Compare pay on an hourly basis: a day is taken as an 8-hour shift, a month as 26 days of 8 hours.
function hourlyRate(job) {
  return job.payUnit === 'day' ? job.pay / 8 : job.payUnit === 'month' ? job.pay / (26 * 8) : job.pay;
}

function explain(job, person, s) {
  const bits = [];
  bits.push(`${s.evidence.filter(e => e.required).length}/${(job.requirements || []).length} required skills`);
  bits.push(`free ${Math.round(s.overlapMinutes / 60)}h of the ${Math.round(s.scheduleMinutes / 60)}h shift`);
  if (job.access?.workMode === 'remote') bits.push('remote'); else if (s.distanceKm != null) bits.push(`${s.distanceKm} km away`);
  if (s.missing.length) bits.push(`missing ${s.missing.join(', ')}`);
  if (person.expectedRate > hourlyRate(job)) bits.push(`asks RM${person.expectedRate}/h vs about RM${Math.round(hourlyRate(job) * 100) / 100}/h`);
  return bits.join(', ');
}

// ---- Access fit for blind and low-vision job seekers ---------------------------
// A job is checked against what the seeker told us they need. Blockers rule a job out,
// "asks" are open questions the application raises with the employer.

const DEFAULT_WALK = 10;

function accessFit(job, person, relax = {}) {
  const n = person.needs;
  const a = job.access || {};
  const out = { fit: 'good', blockers: [], asks: [], reasons: [], workMode: a.workMode || 'on-site' };
  if (!n) return out;
  const mode = out.workMode;
  const maxWalk = relax.maxWalkMin || n.maxWalkMin || DEFAULT_WALK;
  if (n.remoteOnly && mode !== 'remote') out.blockers.push(`it is ${mode} and you asked for remote work only`);
  else if (mode === 'remote') out.reasons.push('remote, no travel');
  else if (!a.transit) out.blockers.push('no train or bus stop is listed near the workplace');
  else if (a.transit.walkMin > maxWalk) out.blockers.push(`it is a ${a.transit.walkMin}-minute walk from ${a.transit.station}, more than your ${maxWalk} minutes`);
  else out.reasons.push(`${mode === 'hybrid' ? 'hybrid, ' : ''}${a.transit.walkMin}-minute walk from ${a.transit.station}`);
  for (const t of a.sightTasks || []) out.blockers.push(`the listing requires: ${t}`);
  if (a.computerWork === false) out.reasons.push('no computer work, so no screen reader needed');
  else if (n.screenReader) {
    const at = (a.assistiveTech || []).filter(x => !/magnif|zoom/i.test(x));
    if (at.length) out.reasons.push(`supports ${at.join(' and ')}`);
    else if (!relax.askAboutTech) out.blockers.push('the listing does not say screen readers are supported');
    else out.asks.push('the listing does not say screen readers are supported, so the application asks');
  } else if (n.magnification) {
    if ((a.assistiveTech || []).length) out.reasons.push(`supports ${a.assistiveTech.join(' and ')}`);
  }
  const formats = a.interviewFormats || ['in person'];
  if (n.interviewFormat && !formats.includes(n.interviewFormat)) out.asks.push(`no ${n.interviewFormat} interview offered, so it will be ${formats[0]}`);
  out.fit = out.blockers.length ? 'not suitable' : out.asks.length ? 'ask first' : 'good';
  return out;
}

// Which interview format to book: the seeker's preference if offered, else the first accessible one.
function pickFormat(job, person) {
  const formats = job.access?.interviewFormats || ['in person'];
  const want = person.needs?.interviewFormat;
  if (want && formats.includes(want)) return want;
  return ['phone', 'video', 'in person'].find(f => formats.includes(f)) || formats[0];
}

// ---- Calendar ---------------------------------------------------------------

function icsStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function makeIcs({ uid, start, end, summary, description, location, url, organizer, organizerName, attendee, attendeeName }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HireBuddy//Interview//EN', 'CALSCALE:GREGORIAN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}@hirebuddy`, `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`, 'SEQUENCE:0', 'STATUS:CONFIRMED',
    `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(description)}`, `LOCATION:${icsEscape(location)}`,
    url ? `URL:${url}` : null,
    organizer ? `ORGANIZER;CN=${icsEscape(organizerName || organizer)}:mailto:${organizer}` : null,
    attendee ? `ATTENDEE;CN=${icsEscape(attendeeName || attendee)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee}` : null,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Interview in 30 minutes', 'TRIGGER:-PT30M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].filter(Boolean).join('\r\n');
}

// One calendar invite per interview. `attendee` overrides who it is addressed to (the real inbox
// it is delivered to), so Gmail and Outlook show Accept / Decline for that recipient.
function interviewIcs(iv, job, base, { attendee, organizer } = {}) {
  return makeIcs({
    uid: iv.id, start: new Date(iv.start), end: new Date(iv.end),
    summary: `Interview: ${job.title} (${job.business})`,
    description: `Interview with ${iv.name} for ${job.title} at ${job.business}.\n${iv.howToJoin || `Join the video call: ${iv.meetUrl || 'see location'}`}\nJob: ${base}/jobs/${job.id}`,
    location: iv.meetUrl || (iv.format === 'phone' ? 'Phone call' : iv.format === 'in person' ? `${job.business}, ${job.area}` : iv.mode), url: iv.meetUrl,
    organizer: organizer || job.ownerEmail || 'interviews@hirebuddy.example.com', organizerName: job.business,
    attendee: attendee || iv.email, attendeeName: iv.name,
  });
}

function parseIcs(text) {
  const get = k => (text.match(new RegExp(`^${k}[^:]*:(.+)$`, 'm')) || [])[1]?.trim();
  const toDate = s => s && new Date(s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
  return { method: get('METHOD'), start: toDate(get('DTSTART')), end: toDate(get('DTEND')), summary: get('SUMMARY'), url: get('URL'), attendee: (get('ATTENDEE') || '').replace('mailto:', '') };
}

module.exports = {
  DAYS, DAY_NAMES, AREAS, findArea, distanceKm, coords,
  toMin, toHHMM, ranges, overlapMinutes, totalMinutes, describeSchedule,
  mytParts, mytDate, fmtMyt, fmtLong, MIN_WAGE, checkWage,
  termsFor, evidenceFor, sentences, scoreMatch, explain, hourlyRate,
  makeIcs, interviewIcs, parseIcs, accessFit, pickFormat, DEFAULT_WALK,
};
