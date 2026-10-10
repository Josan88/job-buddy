const assert = require('node:assert/strict');
const intake = require('../src/intake');
const details = { name: 'Nadia Rahim', age: '24', workExperience: 'No work experience',
  education: 'Diploma in Business', location: 'Subang Jaya', interestedPosition: 'Customer service' };
assert.deepEqual(intake.collect('').missing, Object.keys(details));
assert.equal(intake.collect('', {}, details).complete, true);
for (const key of Object.keys(details)) {
  assert.deepEqual(intake.collect('', {}, { ...details, [key]: '' }).missing, [key]);
}
const labelled = intake.append('Find jobs for me', details);
assert.deepEqual(intake.collect(labelled).details, details);
assert.equal(intake.collect('', { name: details.name, age: details.age, workExperience: details.workExperience,
  education: details.education, area: details.location, interestedPosition: details.interestedPosition }).complete, true);
assert.equal(intake.collect('I am 24 years old. I live in Subang Jaya. I worked in customer service for a year. I hold a diploma. I am looking for customer service jobs.').details.age, '24');
assert.equal(intake.collect('', {}, { ...details, age: 'unknown' }).complete, false);
assert.equal(intake.collect('', {}, { ...details, age: '0' }).complete, false);
assert.equal(intake.collect('Location: Kuala Lumpur', { area: 'Subang Jaya' }).details.location, 'Kuala Lumpur');
assert.equal(intake.collect('', { bio: labelled }).complete, true);
console.log('PASS required search details, saved profile, prompt extraction, missing fields and explicit corrections');
