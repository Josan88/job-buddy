const cards = document.querySelectorAll('[data-job-card]');
const message = document.getElementById('apply-msg');
let me = null;
try { me = JSON.parse(localStorage.getItem('hirebuddy.me')); } catch {}

function report(text, ok) {
  message.hidden = false;
  message.className = `panel ${ok ? 'good' : 'bad'}`;
  message.textContent = text;
  message.focus();
  window.HB.announce(text);
}

async function apply(button) {
  if (!me || me.role !== 'student' || !me.id) {
    report('Choose your job seeker profile on My page before sending an application.', false);
    return;
  }
  button.disabled = true;
  const response = await fetch(`/api/jobs/${encodeURIComponent(button.dataset.applyJob)}/apply/${encodeURIComponent(me.id)}`, { method: 'POST' });
  const result = await response.json();
  report(result.ok ? result.message : (result.error || 'The application could not be sent.'), result.ok);
  if (!result.ok) button.disabled = false;
}

cards.forEach(card => {
  const button = card.querySelector('[data-apply-job]');
  card.addEventListener('focus', () => window.HB.readFocus(`${card.innerText} Press Enter to send this application.`));
  button.addEventListener('focus', () => window.HB.readFocus(`${button.dataset.label}. Send application button. Press Enter to send.`));
  button.addEventListener('click', () => apply(button));
  card.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.target !== card) return;
    event.preventDefault();
    button.click();
  });
});
