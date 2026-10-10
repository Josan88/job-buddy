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
})();

window.HB = {
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  // Polite announcement for screen readers through the page's live region.
  announce(text) {
    const r = document.getElementById('announcer');
    if (!r) return;
    r.textContent = '';
    setTimeout(() => { r.textContent = text; }, 60);
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
