// Rule-based understanding of a one-line prompt. Used by the autopilot planner when no LLM key is set,
// so the whole flow still runs end to end offline.
const L = require('./lib');

const ROLES = [
  { re: /barista|coffee/, title: 'Barista', biz: 'cafe', req: ['espresso', 'customer service'], nice: ['latte art', 'food handling'] },
  { re: /cashier|till/, title: 'Cashier', biz: 'shop', req: ['cashier', 'customer service'], nice: ['bahasa melayu'] },
  { re: /tutor|teacher|teach/, title: 'Tutor', biz: 'tuition centre', req: ['tutoring'], nice: [] },
  { re: /waiter|waitress|server|f&b crew|service crew/, title: 'Service Crew', biz: 'restaurant', req: ['customer service', 'food handling'], nice: ['cashier'] },
  { re: /event|usher|crew/, title: 'Event Crew', biz: 'events company', req: ['event crew', 'customer service'], nice: ['photography'] },
  { re: /social media|instagram|tiktok|content/, title: 'Social Media Assistant', biz: 'business', req: ['social media', 'canva'], nice: ['video editing', 'copywriting'] },
  { re: /data entry|excel|admin/, title: 'Data Entry Assistant', biz: 'office', req: ['data entry', 'excel'], nice: ['python'] },
  { re: /warehouse|packer|packing|driver|rider|delivery/, title: 'Warehouse Assistant', biz: 'warehouse', req: ['warehouse'], nice: ['driving license'] },
];

const SKILL_WORDS = ['espresso', 'latte art', 'cashier', 'customer service', 'food handling', 'tutoring', 'mathematics', 'physics',
  'social media', 'canva', 'video editing', 'copywriting', 'data entry', 'excel', 'python', 'web development', 'event crew',
  'photography', 'warehouse', 'driving license', 'english', 'bahasa melayu', 'mandarin', 'cantonese', 'tamil'];

const DAY_WORDS = { 'mon(day)?': 'Mon', 'tue(s|sday)?': 'Tue', 'wed(nesday)?': 'Wed', 'thu(r|rs|rsday)?': 'Thu', 'fri(day)?': 'Fri', 'sat(urday)?': 'Sat', 'sun(day)?': 'Sun' };

function to24(h, m, ap) {
  let H = Number(h) % 12;
  if (!ap) H = Number(h); else if (ap.toLowerCase() === 'pm') H += 12;
  return `${String(H).padStart(2, '0')}:${m || '00'}`;
}

function parseSchedule(text, defaultHours) {
  const t = text.toLowerCase();
  let days = [];
  if (/weekend|sat(urday)?s? (and|&) sun|sat-sun/.test(t)) days.push('Sat', 'Sun');
  if (/weekday/.test(t)) days.push('Mon', 'Tue', 'Wed', 'Thu', 'Fri');
  for (const [k, v] of Object.entries(DAY_WORDS)) if (new RegExp(`\\b${k}s?\\b`).test(t) && !days.includes(v)) days.push(v);
  let hours = /morning/.test(t) ? '08:00-12:00' : /afternoon/.test(t) ? '13:00-17:00' : /evening|night/.test(t) ? '18:00-22:00' : defaultHours;
  const m = t.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (m) hours = `${to24(m[1], m[2], m[3] || m[6])}-${to24(m[4], m[5], m[6])}`;
  if (!days.length) days = ['Sat', 'Sun'];
  return Object.fromEntries(days.map(d => [d, [hours]]));
}

function parsePay(text) {
  const m = text.match(/rm\s?(\d+(?:\.\d+)?)\s*(?:\/|per|an?|a)?\s*(hr|hour|h|day|month|mth|mo)?\b/i);
  if (!m) return null;
  const u = (m[2] || 'hour').toLowerCase();
  return { pay: Number(m[1]), payUnit: u.startsWith('d') ? 'day' : u.startsWith('m') ? 'month' : 'hour' };
}

function parseEmail(text) {
  return (text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || null;
}

function startDate(text, now = new Date()) {
  const t = text.toLowerCase();
  const p = L.mytParts(now);
  const dayIdx = L.DAYS.indexOf(p.dow);
  let add = 7;
  if (/tomorrow/.test(t)) add = 1;
  else if (/next week/.test(t)) add = ((8 - dayIdx) % 7) || 7; // next Monday
  else if (/asap|immediately|this week/.test(t)) add = 2;
  const d = L.mytDate(p.y, p.mo, p.d + add, 12 * 60);
  return d.toISOString().slice(0, 10);
}

function hirer(prompt) {
  const t = prompt.toLowerCase();
  const role = ROLES.find(r => r.re.test(t)) || { title: 'Part-timer', biz: 'business', req: ['customer service'], nice: [] };
  const area = L.findArea(prompt) || 'Subang Jaya';
  const pay = parsePay(prompt) || { pay: 10, payUnit: 'hour' };
  const schedule = parseSchedule(prompt, role.title === 'Barista' ? '08:00-14:00' : '09:00-17:00');
  const weekend = Object.keys(schedule).every(d => d === 'Sat' || d === 'Sun');
  const req = [...role.req];
  const nice = [...role.nice];
  for (const s of SKILL_WORDS) if (t.includes(s) && !req.includes(s)) {
    // "must have latte art and Mandarin" makes both must-haves, even ones the role lists as nice-to-have.
    if (new RegExp(`(must|need|required?)[^.,]{0,40}${s}`).test(t)) { req.push(s); if (nice.includes(s)) nice.splice(nice.indexOf(s), 1); }
    else if (!nice.includes(s)) nice.push(s);
  }
  if (role.title === 'Tutor') {
    for (const subj of ['mathematics', 'physics', 'english', 'mandarin']) {
      const short = { mathematics: 'math', physics: 'physics', english: 'english', mandarin: 'mandarin' }[subj];
      if (t.includes(short) && !req.includes(subj)) req.push(subj);
    }
  }
  const named = prompt.match(/(?:for|at|from)\s+(?:my\s+)?(?:cafe|shop|restaurant|store|company|business)?\s*([A-Z][\w'&]*(?:\s+[A-Z][\w'&]*){0,3})/);
  const bizWord = (t.match(/\b(bakery|cafe|café|kopitiam|kedai|restaurant|shop|store|boutique|salon|tuition centre|warehouse|clinic|bistro|stall|mamak)\b/) || [])[1];
  const business = named && !L.findArea(named[1]) ? named[1] : `A ${bizWord || role.biz} in ${area}`;
  const hires = Number((t.match(/(\d+)\s+(?:weekend\s+|part[- ]?time\s+|full[- ]?time\s+)*(?:barista|cashier|tutor|crew|staff|part[- ]?timer|people|waiter)/) || [])[1] || 1);
  const subject = role.title === 'Tutor' ? (t.match(/\b(spm|pt3|igcse|upsr)?\s*(maths?|mathematics|physics|chemistry|biology|english|bm|mandarin|science|add maths)\b/) || []) : [];
  const subjectLabel = subject[0] ? subject[0].trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/^Spm|^Pt3|^Igcse|^Upsr/, x => x.toUpperCase()) + ' ' : '';
  return {
    title: `${weekend ? 'Weekend ' : ''}${subjectLabel}${role.title}`, business, area, ...pay, schedule,
    requirements: req, niceToHave: nice, startDate: startDate(prompt), ownerEmail: parseEmail(prompt), hires,
  };
}

const CAMPUSES = ["Taylor's University", 'Sunway University', 'Monash University Malaysia', 'Universiti Malaya', 'UiTM Shah Alam',
  'INTI International University', 'UCSI University', 'Multimedia University', 'SEGi University', 'Asia Pacific University', 'HELP University', 'TAR UMT', 'UPM', 'Swinburne'];

function student(prompt) {
  const t = prompt.toLowerCase();
  const name = (prompt.match(/(?:\b[Ii] am|\b[Ii]'m|\b[Ii]m|[Mm]y name is|[Tt]his is)\s+([A-Z][a-z]+(?:\s+(?!From\b|At\b)[A-Z][a-z]+)?)/) || [])[1] || 'Student';
  const campus = CAMPUSES.find(c => t.includes(c.toLowerCase().split(' ')[0].replace("'s", ''))) || '';
  const skills = SKILL_WORDS.filter(s => L.termsFor(s).some(w => t.includes(w)));
  if (/coffee|barista/.test(t) && !skills.includes('espresso')) skills.push('espresso');
  const pay = parsePay(prompt);
  return {
    name, campus, area: L.findArea(prompt) || 'Subang Jaya', email: parseEmail(prompt),
    skills: skills.length ? skills : ['customer service'],
    availability: parseSchedule(prompt, '09:00-18:00'),
    expectedRate: pay ? pay.pay : null,
    minPay: pay ? pay.pay : 0,
    bio: prompt.trim(),
  };
}

module.exports = { hirer, student, parseEmail };
