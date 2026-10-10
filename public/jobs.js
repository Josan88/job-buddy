const cards = document.querySelectorAll('[data-job-card]');
const message = document.getElementById('apply-msg');
let me = null;
try { me = JSON.parse(localStorage.getItem('hirebuddy.me')); } catch {}
if (!me || me.role !== 'student' || !me.id) {
  me = { role: 'student', id: 'stu-nadia', name: 'Nadia Rahim' };
  console.info('[HireBuddy application] No selected job seeker; using the demo profile Nadia Rahim.');
}

// Render the server-filtered job list for the selected applicant.
if (window.location?.href) {
  const pageUrl = new URL(window.location.href);
  if (pageUrl.searchParams.get('studentId') !== me.id) {
    cards.forEach(card => { card.hidden = true; });
    pageUrl.searchParams.set('studentId', me.id);
    window.location.replace(pageUrl.href);
  }
}

function report(text, ok) {
  message.hidden = false;
  message.className = `panel ${ok ? 'good' : 'bad'}`;
  message.textContent = text;
  message.focus();
  window.HB.announce(text);
}

async function apply(button) {
  if (button.disabled) return;
  console.info('[HireBuddy application] button activated', { jobId: button.dataset.applyJob, studentId: me.id });
  button.disabled = true;
  window.HB.announce('Sending application request to WorkBuddy through Telegram.');
  const result = await window.HB.sendApplication(button.dataset.applyJob, me.id);
  console.info('[HireBuddy application] response', result);
  report(result.ok ? result.message : (result.error || 'The application could not be sent.'), result.ok);
  if (!result.ok) button.disabled = false;
}

cards.forEach(card => {
  const button = card.querySelector('[data-apply-job]');
  card.addEventListener('focus', () => {
    window.HB.debug('job card focused', { jobId: button.dataset.applyJob });
    window.HB.readControl(`${card.innerText} Press Enter to send this application.`);
  });
  button.addEventListener('click', () => apply(button));
  card.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.target !== card || event.repeat) return;
    console.info('[HireBuddy application] Enter pressed on job card', { jobId: button.dataset.applyJob });
    event.preventDefault();
    window.HB.debug('job card Enter', { jobId: button.dataset.applyJob });
    button.click();
  });
});
