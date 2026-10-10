// WorkBuddy decides which facts are sufficient; JobBuddy relays its questions and answers.
const FIELDS = { name: 'Name', age: 'Age', workExperience: 'Work experience', education: 'Education', location: 'Location', interestedPosition: 'Interested job position' };
const answers = values => Object.fromEntries(Object.keys(FIELDS).filter(k => values?.[k] !== undefined).map(k => [k, String(values[k] ?? '').trim().slice(0, 1000)]));
function find(args) {
  const store = require('./store');
  if (args.handoffId) return (store.db.handoffs || []).find(h => h.id === args.handoffId);
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const prompt = norm(args.prompt);
  return (store.db.handoffs || []).slice().reverse().find(h => !h.runId && Date.now() - Date.parse(h.createdAt) < 30 * 60e3 && norm(h.prompt) && prompt.includes(norm(h.prompt)));
}
function review(ho, args) {
  if (!ho?.intake || ho.runId) return { ok: false, error: 'No pending intake for this handoff.' };
  if (args.revision !== ho.intake.revision) return { ok: false, error: 'Read the handoff again; this revision is stale.' };
  if (!Array.isArray(args.missing) || args.missing.some(k => !Object.hasOwn(FIELDS, k))) return { ok: false, error: 'Use the supported field keys for missing.' };
  const details = answers(args.details);
  if (!args.missing.length && Object.keys(FIELDS).some(k => !details[k])) return { ok: false, error: 'Provide all reviewed facts or identify the missing fields.' };
  ho.intake.details = details;
  ho.intake.missing = [...new Set(args.missing)];
  ho.intake.status = args.missing.length ? 'needs_details' : 'ready';
  require('./store').save();
  return { ok: true, status: ho.intake.status, next: args.missing.length ? 'Pause the search. JobBuddy will collect answers and return a new revision for your review.' : 'Continue the existing find-job workflow with these facts; call hirebuddy_1_understand with handoffId.' };
}
function task(ho, base) {
  if (!ho.intake) return `Use the HireBuddy skill to find me work. My request: "${ho.prompt}"`;
  return `Use the HireBuddy skill. Review required applicant details before the existing job search. Handoff: ${ho.id}, revision: ${ho.intake.revision}. Read original prompt, resume and answers at ${base}/api/handoffs/${ho.id}. Extract name, age, workExperience, education, location and interestedPosition from the prompt and supplied resume. If the prompt gives a resume file path or folder on the user's computer, use your file tools to locate and open it first, then extract its facts for the required details. Search the stated folder for the named resume; do not guess between multiple matches. Use extracted facts before requesting missing fields. YOU decide sufficiency; call hirebuddy_review_intake with handoffId, revision, details and missing field keys. If missing, pause; JobBuddy collects typed or spoken answers and returns them for review. Only after missing is empty, proceed with the existing workflow and scraping sequence unchanged. Never infer unknown facts. No work experience is valid. My request: "${ho.prompt}".${ho.resumeUrl ? ` Resume: ${ho.resumeUrl}` : ''}`;
}
module.exports = { FIELDS, answers, find, review, task };
