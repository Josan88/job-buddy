// Collect only explicitly supplied facts. Missing information is asked for before a search handoff.
const FIELDS = { name: 'Name', age: 'Age', workExperience: 'Work experience', education: 'Education',
  location: 'Location', interestedPosition: 'Interested job position' };
const clean = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 300) : '';
function extract(text) {
  const values = {};
  const patterns = {
    name: /(?:^|\n)\s*name\s*:\s*([^\n]+)/i,
    age: /\bage\s*:\s*(\d{1,3})\b|\b(?:I am|I'm)\s+(\d{1,3})\s*(?:years? old|year[- ]old)\b/i,
    workExperience: /(?:^|\n)\s*(?:work experience|experience)\s*:\s*([^\n]+)/i,
    education: /(?:^|\n)\s*education\s*:\s*([^\n]+)/i,
    location: /(?:^|\n)\s*location\s*:\s*([^\n]+)/i,
    interestedPosition: /(?:^|\n)\s*(?:interested job position|interested position|job position|target role)\s*:\s*([^\n]+)/i,
  };
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    values[key] = clean(match?.[1] || match?.[2]);
  }
  const sentence = pattern => clean(text.match(pattern)?.[1]);
  values.name ||= sentence(/\b(?:my name is|I'm|I am)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,3})(?=[.,\n]|\s+(?:and|from|aged|age|I|I'm|am)\b)/u);
  values.location ||= sentence(/\b(?:I live in|I'm based in|I am based in|my location is)\s+([^.,\n]+)/i);
  values.workExperience ||= sentence(/\b(I (?:worked|have worked|did|have no work experience|have no experience|am a fresh graduate)[^.!?\n]*)/i);
  values.education ||= sentence(/\b(I (?:hold|have|completed|graduated with|studied)[^.!?\n]*(?:degree|diploma|certificate|SPM|education)[^.!?\n]*)/i);
  values.interestedPosition ||= sentence(/\b(?:looking for|interested in|want to work as|seeking)\s+(?:a |an )?([^.!?\n]+?)(?:\s+jobs?\b|\s+positions?\b|\s+roles?\b|[.!?\n]|$)/i);
  return values;
}
function collect(prompt, profile = {}, supplied = {}) {
  const parsed = extract(prompt);
  const saved = extract(profile.bio || '');
  const known = { ...saved, name: profile.name === 'Student' ? saved.name : profile.name || saved.name,
    age: profile.age || saved.age, education: profile.education || profile.campus || saved.education, location: profile.area || saved.location,
    workExperience: profile.workExperience || saved.workExperience,
    interestedPosition: profile.interestedPosition || saved.interestedPosition };
  const details = {};
  for (const key of Object.keys(FIELDS)) {
    details[key] = clean(supplied[key]) || clean(parsed[key]) || clean(known[key]);
    if (/^(?:unknown|not provided|n\/a|not sure)$/i.test(details[key])) details[key] = '';
  }
  if (!/^\d{1,3}$/.test(details.age) || Number(details.age) < 1 || Number(details.age) > 120) details.age = '';
  const missing = Object.keys(FIELDS).filter(key => !details[key]);
  return { details, missing, complete: missing.length === 0, labels: FIELDS };
}
const append = (prompt, details) => `${prompt}\n\nCollected applicant details:\n${Object.entries(FIELDS).map(([key, label]) => `${label}: ${details[key]}`).join('\n')}`;
module.exports = { collect, append };
