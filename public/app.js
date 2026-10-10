// HireBuddy console: start a run, stream its plan, tool calls and self-checks live.
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const EXAMPLES = {
  hirer: [
    'Need a weekend barista in Subang, RM12/hr, start next week',
    'Need 3 weekend baristas in Cyberjaya, must have latte art and Mandarin, RM13/hr',
    'Hiring 2 part-time cashiers for my bakery in Petaling Jaya, RM10/hr, weekends 10am-6pm',
    'Looking for an SPM maths tutor in Subang Jaya, RM30/hr, Saturday mornings',
    'Need a cashier for my kedai in USJ, RM7/hr, weekends',
  ],
  student: [
    "I'm Aisyah from Sunway University, living in Bandar Sunway. I can make espresso and do latte art, good with customers. Free weekends 8am-2pm, want at least RM11/hr.",
    "I'm Jason, an engineering student at Taylor's in Subang Jaya. I tutor maths and physics, free Saturday and Sunday 9am-12pm.",
  ],
};

const TOOL_LABEL = {
  set_plan: 'Planning', check_minimum_wage: 'Checking minimum wage', publish_job: 'Publishing the job page',
  find_candidates: 'Finding candidates', screen_candidates: 'Screening candidates', verify_screening: 'Self-check: screening',
  schedule_interviews: 'Booking interviews', send_email: 'Sending email', verify_hiring_outcome: 'Self-check: final outcome',
  register_student: 'Creating your profile', search_jobs: 'Searching gigs', apply_to_job: 'Applying',
  verify_applications: 'Self-check: applications', finish: 'Delivering result',
  relax_requirement: 'Relaxing a must-have', record_fit_judgement: 'Judging fit from what they wrote',
};

let persona = 'hirer';
const stats = { tools: 0, checks: 0, passed: 0, fixes: 0, start: 0 };

function setPersona(p) {
  persona = p;
  document.querySelectorAll('.persona button').forEach(b => b.classList.toggle('on', b.dataset.persona === p));
  $('#prompt').placeholder = EXAMPLES[p][0];
  $('#examples').innerHTML = EXAMPLES[p].map(e => `<button type="button" class="ex">${esc(e.length > 60 ? e.slice(0, 58) + '…' : e)}</button>`).join('');
  [...$('#examples').children].forEach((b, i) => b.onclick = () => { $('#prompt').value = EXAMPLES[p][i]; $('#prompt').focus(); });
}

document.querySelectorAll('.persona button').forEach(b => b.onclick = () => setPersona(b.dataset.persona));
setPersona('hirer');

fetch('/api/config').then(r => r.json()).then(c => {
  $('#mode').innerHTML = c.llm
    ? `Reasoning with <b>${esc(c.model)}</b>, guarded by deterministic tools and self-checks.`
    : 'Running the built-in <b>autopilot planner</b> (no LLM key set). Same tools, same self-checks.';
});

$('#ask').onsubmit = async e => {
  e.preventDefault();
  const prompt = $('#prompt').value.trim() || $('#prompt').placeholder;
  $('#go').disabled = true;
  const r = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt, persona }) }).then(r => r.json());
  history.pushState({}, '', `/runs/${r.id}`);
  openRun(r.id);
};

// ---------------------------------------------------------------------------

function openRun(id) {
  $('#composer').hidden = true;
  $('#recent').hidden = true;
  $('#runview').hidden = false;
  $('#timeline').innerHTML = '';
  $('#result').hidden = true;
  outcome = {};
  Object.assign(stats, { tools: 0, checks: 0, passed: 0, fixes: 0, start: 0 });
  const es = new EventSource(`/api/runs/${id}/stream`);
  es.onmessage = m => {
    const e = JSON.parse(m.data);
    if (e.type === 'end') return es.close();
    render(e);
  };
  es.onerror = () => es.close();
}

function renderPlan(plan) {
  $('#plan').innerHTML = plan.map(s => `<li class="st-${s.status}"><span class="dot"></span>${esc(s.title)}</li>`).join('');
}

function renderStats() {
  $('#stats').textContent = `${stats.tools} tool calls · ${stats.passed}/${stats.checks} checks passed${stats.decisions ? ` · ${stats.decisions} decision${stats.decisions === 1 ? '' : 's'}` : ''}${stats.fixes ? ` · ${stats.fixes} self-fixes` : ''}`;
}

const pending = new Map();
let outcome = {};

function add(html, cls = '') {
  const el = document.createElement('div');
  el.className = `ev ${cls}`;
  el.innerHTML = html;
  $('#timeline').appendChild(el);
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return el;
}

function render(e) {
  switch (e.type) {
    case 'start':
      stats.start = e.t;
      $('#rv-persona').textContent = `${e.persona === 'student' ? 'Student' : 'Business owner'} · ${e.mode}`;
      $('#rv-prompt').textContent = e.prompt;
      break;
    case 'plan':
      renderPlan(e.plan);
      break;
    case 'thought':
      add(`<p>${linkify(esc(e.text))}</p>`, 'thought');
      break;
    case 'decision':
      stats.decisions = (stats.decisions || 0) + 1;
      add(`<div class="tool-head"><b>Decision: ${esc(e.choice)}</b></div><p class="small">${esc(e.situation)}</p>
        <ul class="opts">${e.options.map(o => `<li class="${o.startsWith(e.choice) ? 'chosen' : ''}">${esc(o)}</li>`).join('')}</ul><p><b>Why:</b> ${esc(e.reason)}</p>`, 'decision');
      break;
    case 'tool_call': {
      if (e.tool === 'set_plan' || e.tool === 'log_decision') break;
      stats.tools++;
      const el = add(`<div class="tool-head"><span class="spin"></span><b>${esc(TOOL_LABEL[e.tool] || e.tool)}</b><code>${esc(e.tool)}</code></div>
        <details><summary>Input</summary><pre>${esc(JSON.stringify(e.args, null, 2))}</pre></details><div class="out"></div>`, 'tool');
      pending.set(e.tool, el);
      break;
    }
    case 'tool_result': {
      if (e.tool === 'set_plan' || e.tool === 'log_decision') break;
      const el = pending.get(e.tool) || add('', 'tool');
      pending.delete(e.tool);
      el.classList.add(e.ok ? 'ok' : 'fail');
      el.querySelector('.spin')?.remove();
      if (e.ok && e.tool === 'screen_candidates') outcome.screen = e.result.details;
      if (e.ok && e.tool === 'schedule_interviews') outcome.slots = (outcome.slots || []).concat(e.result.scheduled);
      if (e.ok && e.tool === 'apply_to_job') outcome.applied = (outcome.applied || []).concat(e.result);
      el.querySelector('.out').innerHTML = pretty(e.tool, e.result, e.ok)
        + `<details><summary>Raw result</summary><pre>${esc(JSON.stringify(e.result, null, 2))}</pre></details>`;
      break;
    }
    case 'self_correct':
      stats.fixes++;
      if (e.tool !== 'check_minimum_wage') add(`<b>Caught a problem, fixing it:</b><ul>${e.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`, 'fix');
      break;
    case 'checks':
      stats.checks += e.checks.length;
      stats.passed += e.checks.filter(c => c.pass).length;
      break;
    case 'error':
      add(`<b>Error:</b> ${esc(e.message)}`, 'fail');
      break;
    case 'final':
      if (e.plan?.length) renderPlan(e.plan);
      showResult(e);
      break;
  }
  renderStats();
}

function linkify(s) {
  return s.replace(/(https?:\/\/[^\s<)]+[^\s<).,])/g, '<a href="$1" target="_blank">$1</a>');
}

function bar(score) {
  return `<span class="bar"><i style="width:${score}%"></i></span><b class="score">${score}</b>`;
}

function pretty(tool, r, ok) {
  if (!ok && r.problems) return `<ul class="problems">${r.problems.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`;
  if (!ok) return `<p class="bad">${esc(r.error || r.message || 'Failed')}</p>`;
  switch (tool) {
    case 'check_minimum_wage':
      return `<p>${esc(r.message)} <span class="muted">(${esc(r.source)})</span></p>`;
    case 'publish_job':
      return `<p>Live at <a href="${esc(r.job.url)}" target="_blank">${esc(r.job.url)}</a> · fetched back: <span class="${r.liveCheck.ok ? 'good' : 'bad'}">HTTP ${esc(r.liveCheck.status)}</span></p>`;
    case 'find_candidates':
      return `<p>${r.count} candidates in range${r.excludedOutOfRange ? `, ${r.excludedOutOfRange} too far` : ''}.</p><p class="chips">${r.candidates.map(c => `<span class="chip">${esc(c.name)} · ${esc(c.area)}${c.applied ? ' · applied' : ''}</span>`).join('')}</p>`;
    case 'screen_candidates':
      return `<table class="rank"><tbody>${r.details.map((d, i) => `<tr><td>${i + 1}</td><td><b>${esc(d.name)}</b>${d.qualified ? ' <span class="chip ok">qualified</span>' : ''}${d.unavailable ? ` <span class="chip">${esc(d.unavailable)}</span>` : ''}<div class="muted small">${esc(d.why)}</div>
        <details class="evidence"><summary>Evidence</summary><ul>${(d.evidence || []).map(ev => `<li><span class="tag ${ev.required ? '' : 'soft'}">${esc(ev.skill)}</span> “${esc(ev.quote)}”${ev.judged ? ' <span class="muted small">(judged from their wording)</span>' : ''}</li>`).join('') || '<li class="muted">No matching skills found</li>'}</ul>
        <p class="small muted">Skills ${d.breakdown.skills}/35 · Nice-to-have ${d.breakdown.niceToHave}/5 · Availability ${d.breakdown.availability}/25 · Distance ${d.breakdown.distance}/15 · Experience ${d.breakdown.experience}/15 · Pay fit ${d.breakdown.payFit}/5</p></details></td>
        <td class="right">${bar(d.score)}</td></tr>`).join('')}</tbody></table>`;
    case 'verify_screening':
      return `<p class="${r.pass ? 'good' : 'bad'}">${r.checks.filter(c => c.pass).length}/${r.checked} scores reproduced exactly and every quote was found word for word.</p>`;
    case 'schedule_interviews':
      return `<ul class="slots">${r.scheduled.map(s => `<li><b>${esc(s.name)}</b> · ${esc(s.when)} <a href="${esc(s.icsUrl)}">.ics</a></li>`).join('')}${r.unscheduled.map(u => `<li class="muted">${esc(u.name || u.id)}: ${esc(u.reason)}</li>`).join('')}</ul>`;
    case 'send_email':
      return `<p><b>${esc(r.subject)}</b> to ${esc(r.to)} · <a href="${esc(r.viewUrl)}" target="_blank">view email</a> <span class="muted">(${esc(r.delivery?.channel)})</span></p>`;
    case 'verify_hiring_outcome':
    case 'verify_applications':
      return `<ul class="checks">${r.checks.map(c => `<li class="${c.pass ? 'pass' : 'failc'}"><b>${c.pass ? '✓' : '✗'}</b> ${esc(c.name)}<div class="muted small">${linkify(esc(c.detail || ''))}</div></li>`).join('')}</ul>`;
    case 'register_student':
      return `<p>Profile live: <b>${esc(r.profile.name)}</b> · ${esc(r.profile.area)} · ${r.profile.skills.map(s => `<span class="tag">${esc(s)}</span>`).join(' ')}</p>`;
    case 'search_jobs':
      return `<table class="rank"><tbody>${r.results.map(j => `<tr class="${j.legalPay ? '' : 'illegal'}"><td><b><a href="${esc(j.url)}" target="_blank">${esc(j.title)}</a></b> · ${esc(j.business)}<div class="muted small">${esc(j.pay)} · ${esc(j.area)} · ${esc(j.why)}</div>${j.warning ? `<div class="bad small">${esc(j.warning)}</div>` : ''}</td><td class="right">${bar(j.score)}</td></tr>`).join('')}</tbody></table>`;
    case 'apply_to_job':
      return `<p>Applied to <b>${esc(r.job)}</b> at ${esc(r.business)}. Business notified via ${esc(r.businessNotified?.channel)}.</p>`;
    case 'relax_requirement':
      return `<p>Must-have now: ${r.requirements.map(x => `<span class="tag">${esc(x)}</span>`).join(' ')} · nice-to-have: ${r.niceToHave.map(x => `<span class="tag soft">${esc(x)}</span>`).join(' ')}</p>`;
    case 'record_fit_judgement':
      return '<p>Judgement recorded with a verbatim quote.</p>';
    case 'finish':
      return '<p>Result delivered.</p>';
    default:
      return '';
  }
}

function showResult(e) {
  const el = $('#result');
  el.hidden = false;
  const badge = e.verified ? '<span class="badge good">Verified</span>' : e.status === 'done' ? '<span class="badge">Done</span>' : '<span class="badge bad">Needs attention</span>';
  el.innerHTML = `<div class="card result-card ${e.verified ? 'verified' : ''}">
    <div class="result-head">${badge}<h2>Result</h2></div>
    ${outcomeCards()}
    <p class="muted">${linkify(esc(e.summary || 'The agent stopped before finishing. See the timeline below.'))}</p>
    <div class="links">${(e.links || []).filter(l => !(outcome.slots?.length && l.label.startsWith('Calendar invite'))).map(l => `<a class="btn ghost" href="${esc(l.url)}" target="_blank">${esc(l.label)}</a>`).join('')}</div>
  </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// The deliverable, front and centre: who to meet and when, or where the student applied.
function outcomeCards() {
  if (outcome.slots?.length) {
    return `<h3>Your interviews are booked</h3><div class="people">${outcome.slots.map(sl => {
      const d = (outcome.screen || []).find(x => x.id === sl.candidateId) || {};
      const quote = (d.evidence || []).find(ev => ev.required && ev.source === 'bio');
      return `<div class="person"><div class="person-top"><b>${esc(sl.name)}</b><span class="score-pill">${d.score ?? ''}/100</span></div>
        <div class="when">${esc(sl.when)}</div>
        ${quote ? `<p class="quote">“${esc(quote.quote)}”</p>` : ''}
        <a href="${esc(sl.icsUrl)}">Add to calendar</a></div>`;
    }).join('')}</div>`;
  }
  if (outcome.applied?.length) {
    return `<h3>You've applied to</h3><div class="people">${outcome.applied.map(a => `<div class="person"><b>${esc(a.job)}</b><div class="when">${esc(a.business)}</div><p class="muted small">Business notified</p></div>`).join('')}</div>`;
  }
  return '';
}

async function loadRecent() {
  const runs = await fetch('/api/runs').then(r => r.json());
  $('#runs').innerHTML = runs.slice(0, 8).map(r => `<a class="card row" href="/runs/${esc(r.id)}"><div><span class="eyebrow">${r.persona === 'student' ? 'Student' : 'Business'}${r.source === 'mcp' ? ' · via WorkBuddy/MCP' : ''}</span><br>${esc(r.prompt.length > 110 ? r.prompt.slice(0, 108) + '…' : r.prompt)}</div>
    <span class="badge ${r.verified ? 'good' : r.status === 'running' ? '' : 'bad'}">${r.verified ? 'Verified' : esc(r.status)}</span></a>`).join('') || '<p class="muted">No runs yet. Try one of the examples.</p>';
}

const m = location.pathname.match(/^\/runs\/([\w-]+)/);
if (m) openRun(m[1]); else loadRecent();
window.onpopstate = () => location.reload();

// Show who you are in the header when a person is picked on "My page".
try { const me = JSON.parse(localStorage.getItem('hirebuddy.me')); if (me) { document.getElementById('me-link').textContent = me.name.split(' ')[0]; if (!m) setPersona(me.role === 'student' ? 'student' : 'hirer'); } } catch {}
