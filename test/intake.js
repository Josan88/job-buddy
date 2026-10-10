const assert = require('node:assert/strict');
const intake = require('../src/intake');
const details = { name: 'Nadia Rahim', age: '24', workExperience: 'No work experience',
  education: 'Diploma in Business', location: 'Subang Jaya', interestedPosition: 'Customer service' };
const ho = { id: 'ho-test', prompt: 'Please find me work', resumeUrl: 'https://example.com/resume',
  intake: { revision: 1, status: 'reviewing', answers: {}, details: {}, missing: [] } };
assert(intake.task(ho, 'https://example.com').includes(ho.resumeUrl));
assert(intake.task(ho, 'https://example.com').includes('hirebuddy_review_intake'));
assert.equal(intake.review(ho, { revision: 1, details: {}, missing: [] }).ok, false);
assert.equal(intake.review(ho, { revision: 1, details: { ...details, age: '' }, missing: ['age'] }).status, 'needs_details');
assert.deepEqual(ho.intake.missing, ['age']);
assert.equal(intake.review(ho, { revision: 0, details, missing: [] }).ok, false);
assert.equal(intake.review(ho, { revision: 1, details, missing: ['notAField'] }).ok, false);
assert.equal(intake.review(ho, { revision: 1, details, missing: [] }).status, 'ready');
assert.deepEqual(ho.intake.details, details);
ho.runId = 'run-started';
assert.equal(intake.review(ho, { revision: 1, details, missing: [] }).ok, false);
assert.deepEqual(intake.answers({ age: 24, injected: 'ignored' }), { age: '24' });
console.log('PASS WorkBuddy review states, missing-field relay and stale revision protection');
