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
  'mont kiara': [3.1720, 101.6510], 'semenyih': [2.9510, 101.8430],
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

// ---- Wages ------------------------------------------------------------------

// Minimum Wages Order 2024 (in force from 1 Feb 2025): RM1,700 a month, RM8.17 an hour.
const MIN_WAGE = { hour: 8.17, month: 1700, day: 65.38, source: 'Minimum Wages Order 2024 (Malaysia), effective 1 Feb 2025' };

function checkWage(pay, payUnit = 'hour') {
  const unit = ['hour', 'day', 'month'].includes(payUnit) ? payUnit : 'hour';
  const floor = MIN_WAGE[unit];
  const ok = Number(pay) >= floor;
  return {
    ok, pay: Number(pay), unit, minimum: floor, source: MIN_WAGE.source,
    message: ok
      ? `RM${pay}/${unit} meets the legal minimum of RM${floor}/${unit}.`
      : `RM${pay}/${unit} is below the legal minimum of RM${floor}/${unit}.`,
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

  let reqHit = 0;
  for (const r of req) {
    const ev = evidenceFor(person, r);
    if (ev) { reqHit++; evidence.push({ skill: r, required: true, ...ev }); } else missing.push(r);
  }
  let niceHit = 0;
  for (const r of nice) {
    const ev = evidenceFor(person, r);
    if (ev) { niceHit++; evidence.push({ skill: r, required: false, ...ev }); }
  }
  const skills = req.length ? Math.round((35 * reqHit) / req.length) : 35;
  const niceScore = nice.length ? Math.round((5 * niceHit) / nice.length) : 5;

  const jobMin = totalMinutes(job.schedule);
  const ov = overlapMinutes(job.schedule, person.availability);
  const availability = jobMin ? Math.round(25 * Math.min(1, ov / jobMin)) : 25;

  const km = distanceKm(job.area, person.area);
  const distance = km == null ? 5 : km <= 5 ? 15 : km <= 10 ? 11 : km <= 20 ? 6 : 2;

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
  const payFit = !exp || exp <= job.pay ? 5 : exp - job.pay <= 2 ? 2 : 0;

  const breakdown = { skills, niceToHave: niceScore, availability, distance, experience, payFit };
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return {
    total, breakdown, evidence, missing, requiredCoverage: req.length ? reqHit / req.length : 1,
    overlapMinutes: ov, scheduleMinutes: jobMin, distanceKm: km,
    experienceQuote: expQuote,
  };
}

function explain(job, person, s) {
  const bits = [];
  bits.push(`${s.evidence.filter(e => e.required).length}/${(job.requirements || []).length} required skills`);
  bits.push(`free ${Math.round(s.overlapMinutes / 60)}h of the ${Math.round(s.scheduleMinutes / 60)}h shift`);
  if (s.distanceKm != null) bits.push(`${s.distanceKm} km away`);
  if (s.missing.length) bits.push(`missing ${s.missing.join(', ')}`);
  if (person.expectedRate > job.pay) bits.push(`asks RM${person.expectedRate}/h vs RM${job.pay}`);
  return bits.join(', ');
}

// ---- Calendar ---------------------------------------------------------------

function icsStamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function makeIcs({ uid, start, end, summary, description, location, organizer, attendee }) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HireBuddy//Interview//EN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}@hirebuddy`, `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(description)}`, `LOCATION:${icsEscape(location)}`,
    organizer ? `ORGANIZER:mailto:${organizer}` : null,
    attendee ? `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${attendee}` : null,
    'END:VEVENT', 'END:VCALENDAR', '',
  ].filter(Boolean).join('\r\n');
}

function parseIcs(text) {
  const get = k => (text.match(new RegExp(`^${k}[^:]*:(.+)$`, 'm')) || [])[1]?.trim();
  const toDate = s => s && new Date(s.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z'));
  return { start: toDate(get('DTSTART')), end: toDate(get('DTEND')), summary: get('SUMMARY'), attendee: (get('ATTENDEE') || '').replace('mailto:', '') };
}

module.exports = {
  DAYS, DAY_NAMES, AREAS, findArea, distanceKm, coords,
  toMin, toHHMM, ranges, overlapMinutes, totalMinutes, describeSchedule,
  mytParts, mytDate, fmtMyt, MIN_WAGE, checkWage,
  termsFor, evidenceFor, sentences, scoreMatch, explain,
  makeIcs, parseIcs,
};
