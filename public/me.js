// My details: applications, profile and suitable jobs.
const $ = s => document.querySelector(s);
const { esc, announce } = window.HB;
const KEY = 'hirebuddy.me';

function getMe() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } }
function setMe(v) { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch {} }

let role = 'student';
let people = null;

async function showPicker() {
  $('#view').hidden = true;
  $('#pick').hidden = false;
  document.title = 'Who are you? · HireBuddy';
  people = people || await fetch('/api/people').then(r => r.json());
  const render = () => {
    $('#choices').innerHTML = role === 'student'
      ? people.students.map(s => `<li><button type="button" class="secondary" data-id="${esc(s.id)}" data-name="${esc(s.name)}">${esc(s.name)}</button>
          <p class="small">${esc(s.area)}${s.needs ? `. ${esc(s.needs)}` : s.campus ? `. ${esc(s.campus)}` : ''}</p></li>`).join('')
      : people.businesses.map(b => `<li><button type="button" class="secondary" data-name="${esc(b.name)}">${esc(b.name)}</button>
          <p class="small">${b.jobs} job${b.jobs === 1 ? '' : 's'} posted</p></li>`).join('');
    $('#choices').querySelectorAll('button').forEach(c => c.onclick = () => {
      setMe(role === 'student' ? { role, id: c.dataset.id, name: c.dataset.name } : { role, name: c.dataset.name });
      show(true);
    });
  };
  document.querySelectorAll('input[name="role"]').forEach(r => { r.checked = r.value === role; r.onchange = () => { role = r.value; render(); }; });
  render();
  $('#pick-title').focus();
}

function header(me, sub) {
  return `<h1 id="me-title" tabindex="-1">${esc(me.name)}</h1>
    <p>${me.role === 'student' ? 'Job seeker' : 'Employer'}${sub ? `. ${sub}` : ''}</p>
`;
}

const STATUS = {
  requested: ['Sent to Telegram, email delivery not confirmed', ''],
  applied: ['Applied, waiting to hear', ''],
  not_selected: ['Not selected this time', 'bad'],
};

async function showStudent(me, focus) {
  const d = await fetch(`/api/me/student/${encodeURIComponent(me.id)}`).then(r => r.ok ? r.json() : null);
  if (!d) { setMe(null); return showPicker(); }
  const n = d.student.needs;
  const others = d.mine.map(a => ({ ...a, status: a.status === 'interview' || a.status === 'declined' ? 'applied' : a.status }));
  const suits = d.open.filter(j => j.suitable);
  const notFor = d.open.filter(j => !j.suitable);
  document.title = `${me.name} · HireBuddy`;
  $('#view').innerHTML = header(me, `${esc(d.student.area)}${n ? `. ${esc(n.vision.replace(/^\w/, c => c.toUpperCase()))}, uses ${esc(n.tool)}` : ''}. Free ${esc(d.student.free)}${d.student.minPay ? `. At least RM${esc(d.student.minPay)} an hour` : ''}`) + `
    <h2>Your applications (${others.length})</h2>
    ${others.length ? `<ul class="joblist">${others.map(a => `<li><h3><a href="${esc(a.url)}">${esc(a.title)}</a> at ${esc(a.business)}</h3>
      <p><span class="status-word ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span></p>
</li>`).join('')}</ul>` : '<p>No applications.</p>'}
    <h2 id="about-title">About me</h2>
    <form id="about-form" class="stack" novalidate>
      <label for="about">How you describe yourself to employers</label>
      <span class="hint" id="about-hint">HireBuddy checks jobs against these words. Add skills, experience and what helps you work.</span>
      <textarea id="about" rows="5" aria-describedby="about-hint about-msg">${esc(d.student.bio)}</textarea>
      <p class="actions"><button type="submit">Save</button></p>
      <p id="about-msg" role="status"></p>
    </form>
    <h2 id="resume-title">My resume</h2>
    <p id="resume-now">${d.student.resume ? `<a href="/api/me/student/${esc(me.id)}/resume">${esc(d.student.resume.name)}</a>, added ${esc(new Date(d.student.resume.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }))}. <button type="button" class="secondary" id="resume-remove">Remove</button>` : 'No resume yet.'}</p>
    <label for="resume-file">${d.student.resume ? 'Replace it' : 'Upload a resume'}</label>
    <span class="hint" id="resume-hint">PDF, Word or text, up to 5 MB.</span>
    <input id="resume-file" type="file" accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" aria-describedby="resume-hint resume-msg">
    <p id="resume-msg" role="status"></p>
    <h2>Jobs that suit you (${suits.length})</h2>
    <p id="job-help">Press Tab to move through the jobs. Press Enter on a job card to send your application.</p>
    <p id="apply-msg" class="panel" role="status" tabindex="-1" hidden></p>
    <ul class="joblist">${suits.map((j, i) => `<li class="job-card" tabindex="0" aria-labelledby="job-title-${i}" aria-describedby="job-detail-${i} job-access-${i} job-action-${i}" data-job-card>
      <h3 id="job-title-${i}"><a tabindex="-1" href="${esc(j.url)}">${esc(j.title)}</a></h3>
      <p id="job-detail-${i}">${esc(j.business)}, ${esc(j.workMode)}. ${esc(j.pay)}. ${esc(j.schedule)}. Match ${j.score} out of 100.</p>
      ${j.access ? `<p id="job-access-${i}">${j.access.fit === 'good' ? 'Suits you' : 'Ask first'}: ${esc([...j.access.reasons, ...j.access.asks].join('; '))}.</p>` : `<span id="job-access-${i}" class="sr-only">No additional access details.</span>`}
      <p class="actions" id="job-action-${i}"><button type="button" data-apply-job="${esc(j.jobId)}" data-label="${esc(j.title)} at ${esc(j.business)}">Send application</button> <a href="${esc(j.url)}">Read full job details</a></p>
    </li>`).join('') || (d.mine.length ? '<li>None left. HireBuddy has already applied to every job that suits you.</li>' : '<li>None right now.</li>')}</ul>
    ${notFor.length ? `<details><summary>Other jobs, and why they don't suit you (${notFor.length})</summary><ul>${notFor.map(j => `<li>${esc(j.title)} at ${esc(j.business)}: ${esc(j.whyNot)}.</li>`).join('')}</ul></details>` : ''}`;
  bind(me);
  bindDetails(me);
  if (focus) $('#me-title').focus();
}

// Saving the description and the resume. Each says what happened in the status line beside it.
function bindDetails(me) {
  const base = `/api/me/student/${encodeURIComponent(me.id)}`;
  $('#about-form').onsubmit = async e => {
    e.preventDefault();
    const r = await fetch(`${base}/about`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bio: $('#about').value }) }).then(r => r.json());
    $('#about-msg').textContent = r.ok ? 'Saved.' : `Error: ${r.error}`;
  };
  $('#resume-file').onchange = async () => {
    const f = $('#resume-file').files[0];
    if (!f) return;
    const msg = $('#resume-msg');
    if (f.size > 5 * 1024 * 1024) { msg.textContent = 'Error: the file is over 5 MB.'; return; }
    msg.textContent = `Uploading ${f.name}…`;
    const r = await fetch(`${base}/resume`, { method: 'PUT', headers: { 'content-type': f.type || 'application/octet-stream', 'x-filename': encodeURIComponent(f.name) }, body: f })
      .then(r => r.json()).catch(() => ({ error: 'Upload failed. Try again.' }));
    if (!r.ok) { msg.textContent = `Error: ${r.error}`; return; }
    await showStudent(me, false);
    $('#resume-msg').textContent = `Uploaded ${f.name}.`;
    $('#resume-file').focus();
  };
  const rm = $('#resume-remove');
  if (rm) rm.onclick = async () => {
    await fetch(`${base}/resume`, { method: 'DELETE' });
    await showStudent(me, false);
    $('#resume-msg').textContent = 'Resume removed.';
    $('#resume-file').focus();
  };
}

function bind(me) {
  document.querySelectorAll('[data-job-card]').forEach(card => {
    card.addEventListener('focus', () => window.HB.readControl(`${card.innerText} Press Enter to send this application.`));
    card.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.target !== card || e.repeat) return;
      console.info('[HireBuddy application] Enter pressed on My details job card', { jobId: card.querySelector('[data-apply-job]').dataset.applyJob, studentId: me.id });
      e.preventDefault();
      window.HB.debug('job card Enter', { jobId: card.querySelector('[data-apply-job]').dataset.applyJob });
      card.querySelector('[data-apply-job]').click();
    });
  });
  document.querySelectorAll('[data-apply-job]').forEach(b => b.onclick = async () => {
    if (b.disabled) return;
    b.disabled = true;
    console.info('[HireBuddy application] My details button activated', { jobId: b.dataset.applyJob, studentId: me.id });
    announce('Sending application request to WorkBuddy through Telegram.');
    const r = await window.HB.sendApplication(b.dataset.applyJob, me.id);
    console.info('[HireBuddy application] My details response', r);
    const msg = $('#apply-msg');
    msg.hidden = false;
    msg.className = `panel ${r.ok ? 'good' : 'bad'}`;
    msg.textContent = r.ok ? r.message : (r.error || 'The application could not be sent.');
    msg.focus();
    announce(msg.textContent);
    if (!r.ok) b.disabled = false;
  });
}

async function showOwner(me, focus) {
  const d = await fetch(`/api/me/business?name=${encodeURIComponent(me.name)}`).then(r => r.json());
  document.title = `${me.name} · HireBuddy`;
  $('#view').innerHTML = header(me, `${d.jobs.length} job${d.jobs.length === 1 ? '' : 's'} published`) + `
    ${d.jobs.map(j => `<section class="panel" aria-labelledby="job-${esc(j.id)}">
      <h2 id="job-${esc(j.id)}"><a href="${esc(j.url)}">${esc(j.title)}</a></h2>
      <p>${esc(j.area)}. ${esc(j.pay)}. ${esc(j.schedule)}.</p>
      ${j.runId ? `<p><a href="/runs/${esc(j.runId)}">How the agent did it</a></p>` : ''}
      ${j.applicants.length ? `<h3>Applicants</h3><ul>${j.applicants.map(a => `<li>${esc(a.name)}, match ${a.score} out of 100</li>`).join('')}</ul>` : ''}
    </section>`).join('') || '<p>You have not published any jobs yet.</p>'}`;
  bind(me);
  if (focus) $('#me-title').focus();
}

async function show(focus) {
  const me = getMe();
  if (!me) return showPicker();
  $('#pick').hidden = true;
  $('#view').hidden = false;
  $('#view').innerHTML = '<p>Loading…</p>';
  await (me.role === 'student' ? showStudent(me, focus) : showOwner(me, focus));
}

// "Switch person" in the demo menu comes here with ?switch=1.
if (new URLSearchParams(location.search).has('switch')) { setMe(null); history.replaceState({}, '', '/me'); }
show(false);
