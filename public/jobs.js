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
  if (button.disabled) return;
  if (!me || me.role !== 'student' || !me.id) {
    report('Choose your job seeker profile on My page before sending an application.', false);
    return;
  }
  button.disabled = true;
  window.HB.announce('Sending application request to Telegram.');
  const result = await window.HB.sendApplication(button.dataset.applyJob, me.id);
  report(result.ok ? result.message : (result.error || 'The application could not be sent.'), result.ok);
  if (!result.ok) button.disabled = false;
}

cards.forEach(card => {
  const button = card.querySelector('[data-apply-job]');
  card.addEventListener('focus', () => window.HB.readControl(`${card.innerText} Press Enter to send this application.`));
  button.addEventListener('click', () => apply(button));
  card.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.target !== card || event.repeat) return;
    event.preventDefault();
    button.click();
  });
});
