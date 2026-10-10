// "My details". A job seeker hears their interviews first (time, how to join), can accept or say
// they can't make it, then their applications and the jobs that suit them.
// An employer sees only the jobs they published, with the interviews booked.
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
  interview: ['Interview booked', 'good'], applied: ['Applied, waiting to hear', ''],
  not_selected: ['Not selected this time', 'bad'], declined: ['You said you can\'t make it', ''],
};

function interviewCard(a) {
  const iv = a.interview;
  return `<li><h3>${esc(a.title)} at ${esc(a.business)}</h3>
    <dl class="facts"><dt>When</dt><dd>${esc(iv.whenLong)} (Malaysia time)</dd>
    <dt>How</dt><dd>${esc(iv.howToJoin || iv.mode)}</dd>
    <dt>Pay</dt><dd>${esc(a.pay)}</dd>
    <dt>Status</dt><dd>${iv.status === 'accepted' ? 'You accepted' : 'Waiting for your answer'}</dd></dl>
    <div class="actions">
      ${iv.meetUrl ? `<a class="btn" href="${esc(iv.meetUrl)}">Join the ${esc(a.business)} video call</a>` : ''}
      <a class="btn secondary" href="${esc(iv.ics)}">Add to calendar</a>
      ${iv.status !== 'accepted' ? `<button type="button" data-iv="${esc(iv.id)}" data-act="accept" data-label="${esc(a.business)}">Accept</button>` : ''}
      <button type="button" class="danger" data-iv="${esc(iv.id)}" data-act="decline" data-label="${esc(a.business)}">I can't make it</button>
    </div></li>`;
}

async function showStudent(me, focus) {
  const d = await fetch(`/api/me/student/${encodeURIComponent(me.id)}`).then(r => r.ok ? r.json() : null);
  if (!d) { setMe(null); return showPicker(); }
  const n = d.student.needs;
  const ivs = d.mine.filter(a => a.status === 'interview').sort((a, b) => a.interview.start.localeCompare(b.interview.start));
  const others = d.mine.filter(a => a.status !== 'interview');
  const suits = d.open.filter(j => j.suitable);
  const notFor = d.open.filter(j => !j.suitable);
  document.title = `${me.name} · HireBuddy`;
  $('#view').innerHTML = header(me, `${esc(d.student.area)}${n ? `. ${esc(n.vision.replace(/^\w/, c => c.toUpperCase()))}, uses ${esc(n.tool)}` : ''}. Free ${esc(d.student.free)}${d.student.minPay ? `. At least RM${esc(d.student.minPay)} an hour` : ''}`) + `
    <p id="iv-msg" class="panel" hidden tabindex="-1"></p>
    <h2>Your interviews (${ivs.length})</h2>
    ${ivs.length ? `<ol class="interviews">${ivs.map(interviewCard).join('')}</ol>` : '<p>No interviews yet. <a href="/">Ask HireBuddy to find you work</a>.</p>'}
    <h2>Your applications (${others.length})</h2>
    ${others.length ? `<ul class="joblist">${others.map(a => `<li><h3><a href="${esc(a.url)}">${esc(a.title)}</a> at ${esc(a.business)}</h3>
      <p><span class="status-word ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span></p>
      ${a.status === 'declined' && a.interview?.replanRunId ? `<p><a href="/runs/${esc(a.interview.replanRunId)}">What HireBuddy did next</a></p>` : ''}</li>`).join('')}</ul>` : '<p>No other applications.</p>'}
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
    <ul class="joblist">${suits.map(j => `<li><h3><a href="${esc(j.url)}">${esc(j.title)}</a></h3>
      <p>${esc(j.business)}, ${esc(j.workMode)}. ${esc(j.pay)}. ${esc(j.schedule)}. Match ${j.score} out of 100.</p>
      ${j.access ? `<p>${j.access.fit === 'good' ? 'Suits you' : 'Ask first'}: ${esc([...j.access.reasons, ...j.access.asks].join('; '))}.</p>` : ''}</li>`).join('') || (d.mine.length ? '<li>None left. HireBuddy has already applied to every job that suits you.</li>' : '<li>None right now.</li>')}</ul>
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
  document.querySelectorAll('[data-iv]').forEach(b => b.onclick = async () => {
    const decline = b.dataset.act === 'decline';
    b.disabled = true;
    const r = await fetch(`/api/interviews/${encodeURIComponent(b.dataset.iv)}/${b.dataset.act}`, { method: 'POST' }).then(r => r.json());
    const msg = $('#iv-msg');
    msg.hidden = false;
    if (decline && r.runId) {
      msg.innerHTML = `Got it. HireBuddy is finding another time with ${esc(b.dataset.label)} now. <a href="/runs/${esc(r.runId)}">Follow what it does</a>.`;
      msg.focus();
      announce(`Got it. Finding another time with ${b.dataset.label}.`);
      // Refresh once the agent has rebooked, then tell the person the new time.
      for (let i = 0; i < 40; i++) {
        await new Promise(res => setTimeout(res, 750));
        const run = await fetch(`/api/runs/${r.runId}`).then(x => x.json());
        if (run.status !== 'running') {
          await showStudent(me, false);
          const m2 = $('#iv-msg');
          m2.hidden = false;
          m2.className = 'panel good';
          m2.textContent = run.summary || 'Done.';
          m2.focus();
          announce(run.summary || 'Done.');
          return;
        }
      }
    } else {
      await showStudent(me, false);
      const m2 = $('#iv-msg');
      m2.hidden = false;
      m2.textContent = `Accepted. ${b.dataset.label} knows you are coming.`;
      m2.focus();
      announce(`Accepted the ${b.dataset.label} interview.`);
    }
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
      <h3>Interviews</h3>
      ${j.interviews.length ? `<ul>${j.interviews.map(i => `<li>${esc(i.name)}: ${esc(i.when)}. ${i.status === 'declined' ? 'Declined.' : i.status === 'accepted' ? 'Accepted.' : 'Waiting for an answer.'} ${i.status !== 'declined' ? `<a href="${esc(i.ics)}">Calendar file for ${esc(i.name)}</a>` : ''}</li>`).join('')}</ul>` : '<p>None booked yet.</p>'}
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
