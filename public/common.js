// Shared by every page: text size control (remembered) and the person's name in the header.
(function () {
  const root = document.documentElement;
  const buttons = document.querySelectorAll('.textsize button');
  const sync = () => buttons.forEach(b => b.setAttribute('aria-pressed', String((root.dataset.size || 'normal') === b.dataset.size)));
  buttons.forEach(b => b.addEventListener('click', () => {
    if (b.dataset.size === 'normal') delete root.dataset.size; else root.dataset.size = b.dataset.size;
    try { localStorage.setItem('hirebuddy.size', b.dataset.size); } catch (e) {}
    sync();
  }));
  sync();
  try {
    const me = JSON.parse(localStorage.getItem('hirebuddy.me'));
    const link = document.getElementById('me-link');
    if (me && link) link.textContent = `My page (${me.name.split(' ')[0]})`;
  } catch (e) {}
  // "Speak out loud": the page says its updates through the computer's voice, for people without a
  // screen reader (and for the room in a demo). On by default; screen reader users can turn it off.
  const t = document.getElementById('speak-toggle');
  let on = true;
  try { on = localStorage.getItem('hirebuddy.speak') !== 'off'; } catch (e) {}
  if (!('speechSynthesis' in window)) { on = false; if (t) t.remove(); }
  window.HB_SPEAK = on;
  if (t) {
    t.setAttribute('aria-pressed', String(on));
    t.addEventListener('click', () => {
      window.HB_SPEAK = !window.HB_SPEAK;
      t.setAttribute('aria-pressed', String(window.HB_SPEAK));
      try { localStorage.setItem('hirebuddy.speak', window.HB_SPEAK ? 'on' : 'off'); } catch (e) {}
      speechSynthesis.cancel();
      if (window.HB_SPEAK) speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance('Speaking out loud is on.'), { lang: 'en-GB' }));
    });
  }
})();

window.HB = {
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  // Polite announcement for screen readers through the page's live region.
  announce(text) {
    const r = document.getElementById('announcer');
    if (!r) return;
    r.textContent = '';
    setTimeout(() => { r.textContent = text; }, 60);
    if (window.HB_SPEAK && text) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB'; u.rate = 1.05;
      speechSynthesis.speak(u);
    }
  },
  // Optional voice output for low-vision users who don't run a screen reader.
  speak(text, button) {
    if (!('speechSynthesis' in window)) return;
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); if (button) button.textContent = 'Read aloud'; return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB'; u.rate = 1;
    u.onend = () => { if (button) button.textContent = 'Read aloud'; };
    speechSynthesis.speak(u);
    if (button) button.textContent = 'Stop reading';
  },
};
