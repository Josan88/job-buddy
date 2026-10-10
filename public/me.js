// "My page": a student sees open jobs and their own applications with live status;
// a business owner sees only the jobs they published, with the shortlist the agent booked.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'hirebuddy.me';

function getMe() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function setMe(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} }

const STATUS = {
  interview: ['Interview booked', 'good'],
  applied: ['Applied', ''],
  not_selected: ['Not selected this round', 'bad'],
  declined: ['You declined', ''],
};

let role = 'student';

async function showPicker() {
  $('#view').hidden = true;
  $('#pick').hidden = false;
  const people = await fetch('/api/people').then(r => r.json());
  const render = () => {
    document.querySelectorAll('#pick .persona button').forEach(b => b.classList.toggle('on', b.dataset.role === role));
    $('#choices').innerHTML = role === 'student'
      ? people.students.map(s => `<button class="choice" data-id="${esc(s.id)}"><b>${esc(s.name)}</b><span>${esc(s.campus || 'Student')} · ${esc(s.area)}</span></button>`).join('')
      : people.businesses.map(b => `<button class="choice" data-name="${esc(b.name)}"><b>${esc(b.name)}</b><span>${b.jobs} job${b.jobs === 1 ? '' : 's'} posted</span></button>`).join('');
    document.querySelectorAll('.choice').forEach(c => c.onclick = () => {
      setMe(role === 'student' ? { role, id: c.dataset.id, name: c.querySelector('b').textContent } : { role, name: c.dataset.name });
      show();
    });
  };
  document.querySelectorAll('#pick .persona button').forEach(b => b.onclick = () => { role = b.dataset.role; render(); });
  render();
}

function header(me, sub) {
  return `<div class="me-head"><div><p class="eyebrow">${me.role === 'student' ? 'Student' : 'Business owner'}</p><h1>${esc(me.name)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div>
    <button class="btn ghost" id="switch">Switch person</button></div>`;
}

async function showStudent(me) {
  const d = await fetch(`/api/me/student/${encodeURIComponent(me.id)}`).then(r => r.ok ? r.json() : null);
  if (!d) { setMe(null); return showPicker(); }
  $('#view').innerHTML = header(me, `${esc(d.student.campus || '')}${d.student.campus ? ' · ' : ''}${esc(d.student.area)} · ${d.student.skills.map(esc).join(', ')}`) + `
    <h2>My applications</h2>
    ${d.mine.length ? d.mine.map(a => {
      const [label, cls] = STATUS[a.status];
      return `<article class="card app ${a.status}"><div class="app-top"><div><b><a href="${esc(a.url)}">${esc(a.title)}</a></b><div class="muted small">${esc(a.business)} · ${esc(a.area)} · ${esc(a.pay)}</div></div>
        <span class="badge ${cls}">${label}</span></div>
        ${a.status === 'interview' ? `<p class="when">${esc(a.interview.when)} · ${esc(a.interview.mode)}${a.interview.status === 'accepted' ? ' · <span class="good">Accepted</span>' : ''}</p>
          <div class="iv-actions">${a.interview.meetUrl ? `<a class="btn" href="${esc(a.interview.meetUrl)}" target="_blank">Join video call</a>` : ''}<a href="${esc(a.interview.ics)}">Add to calendar</a>
          ${a.interview.status !== 'accepted' ? `<button class="btn ghost" data-iv="${esc(a.interview.id)}" data-act="accept">Accept</button>` : ''}
          <button class="btn ghost danger" data-iv="${esc(a.interview.id)}" data-act="decline">Can't make it</button></div>` : ''}
        ${a.status === 'declined' ? `<p class="muted small">You declined ${esc(a.interview.when)}. HireBuddy offered the slot to the next best candidate.${a.interview.replanRunId ? ` <a href="/runs/${esc(a.interview.replanRunId)}">See what the agent did</a>` : ''}</p>` : ''}
        ${!a.applied && a.interview ? '<p class="muted small">The business found you in the talent pool and invited you.</p>' : ''}</article>`;
    }).join('') : '<p class="muted">No applications yet.</p>'}
    <p id="iv-msg" class="muted small"></p>
    <h2>Open jobs for you</h2><p class="muted small"><a href="/about#demo-data">Demo data, modelled on real listings</a></p>
    ${d.open.map(j => `<a class="card row" href="${esc(j.url)}"><div><b>${esc(j.title)}</b><div class="muted small">${esc(j.business)} · ${esc(j.area)}${j.distanceKm != null ? ` (${j.distanceKm} km)` : ''} · ${esc(j.schedule)}</div></div>
      <div class="right"><span class="chip">${esc(j.pay)}</span><div class="small muted">match ${j.score}/100</div></div></a>`).join('') || '<p class="muted">No open jobs right now.</p>'}`;
  document.querySelectorAll('[data-iv]').forEach(b => b.onclick = async () => {
    const decline = b.dataset.act === 'decline';
    if (decline && !confirm('Decline this interview? HireBuddy will offer your slot to the next best candidate.')) return;
    b.disabled = true;
    const r = await fetch(`/api/interviews/${encodeURIComponent(b.dataset.iv)}/${b.dataset.act}`, { method: 'POST' }).then(r => r.json());
    if (decline && r.runId) {
      $('#iv-msg').innerHTML = `Declined. The agent is booking the next best candidate now: <a href="/runs/${esc(r.runId)}">watch it work</a>.`;
      setTimeout(() => showStudent(me).then(bindSwitch), 2500);
    } else showStudent(me).then(bindSwitch);
  });
}

function bindSwitch() { const b = $('#switch'); if (b) b.onclick = () => { setMe(null); showPicker(); }; }

async function showOwner(me) {
  const d = await fetch(`/api/me/business?name=${encodeURIComponent(me.name)}`).then(r => r.json());
  $('#view').innerHTML = header(me, `${d.jobs.length} job${d.jobs.length === 1 ? '' : 's'} published`) + `
    ${d.jobs.map(j => `<article class="card">
      <div class="app-top"><div><b><a href="${esc(j.url)}">${esc(j.title)}</a></b><div class="muted small">${esc(j.area)} · ${esc(j.pay)} · ${esc(j.schedule)}</div></div>
      ${j.runId ? `<a class="btn ghost" href="/runs/${esc(j.runId)}">How the agent did it</a>` : ''}</div>
      ${j.interviews.length ? `<h3>Interviews booked</h3><div class="people">${j.interviews.map(i => i.status === 'declined'
        ? `<div class="person declined"><div class="person-top"><b>${esc(i.name)}</b><span class="badge">Declined</span></div><div class="muted small">Was ${esc(i.when)}.${i.replanRunId ? ` <a href="/runs/${esc(i.replanRunId)}">Agent rebooked</a>` : ''}</div></div>`
        : `<div class="person"><div class="person-top"><b>${esc(i.name)}</b><span class="score-pill">${i.score}/100</span></div><div class="when">${esc(i.when)}</div>${i.status === 'accepted' ? '<div class="good small">Accepted</div>' : ''}<a href="${esc(i.ics)}">Add to calendar</a></div>`).join('')}</div>` : '<p class="muted">No interviews booked yet.</p>'}
      ${j.applicants.length ? `<h3>Applicants</h3><ul class="plain">${j.applicants.map(a => `<li>${esc(a.name)} <span class="muted small">match ${a.score}/100</span></li>`).join('')}</ul>` : ''}
    </article>`).join('') || '<p class="muted">You have not published any jobs yet. Ask the agent to hire for you.</p>'}
    <p><a class="btn" href="/">Hire with one prompt</a></p>`;
}

async function show() {
  const me = getMe();
  $('#me-link').textContent = me ? me.name.split(' ')[0] : 'My page';
  if (!me) return showPicker();
  $('#pick').hidden = true;
  $('#view').hidden = false;
  $('#view').innerHTML = '<p class="muted">Loading…</p>';
  await (me.role === 'student' ? showStudent(me) : showOwner(me));
  bindSwitch();
}

show();

