// Tiny JSON-file store. Everything lives in memory and is flushed to disk on change,
// so a restart keeps jobs, applications, emails and runs (until the host wipes disk).
const fs = require('fs');
const path = require('path');
const seed = require('./seed');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

function fresh() {
  return {
    students: JSON.parse(JSON.stringify(seed.students)),
    jobs: JSON.parse(JSON.stringify(seed.jobs)),
    applications: [],
    interviews: [],
    emails: [],
    runs: [],
  };
}

let db;
try {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  db = fresh();
}

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(db, null, 1));
    } catch (e) {
      console.error('save failed', e.message);
    }
  }, 200);
}

function reset() {
  db = fresh();
  save();
}

function id(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

module.exports = {
  get db() { return db; },
  save, reset, id,
};
