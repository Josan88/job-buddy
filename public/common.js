// Shared by every page: text size control (remembered).
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
})();

// The demo menu closes with Escape (focus back on it) or a click elsewhere.
document.querySelectorAll('details.menu').forEach(m => {
  m.addEventListener('keydown', e => { if (e.key === 'Escape' && m.open) { m.open = false; m.querySelector('summary').focus(); } });
  document.addEventListener('click', e => { if (m.open && !m.contains(e.target)) m.open = false; });
});

window.HB = {
  esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  // Polite announcement for screen readers through the page's live region.
  announce(text) {
    const r = document.getElementById('announcer');
    if (r) { r.textContent = ''; setTimeout(() => { r.textContent = text; }, 60); }
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
  // Read newly focused controls for people using the site's built-in speech rather than a screen reader.
  readFocus(text) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text || '').replace(/\s+/g, ' ').trim());
    u.lang = 'en-GB'; u.rate = 1;
    speechSynthesis.resume();
    speechSynthesis.speak(u);
  },
  // Listen until the person presses Enter (or the button again). Escape cancels. Calls done(text), with ''
  // when nothing was heard or it was cancelled. Returns a stop function, or null without speech recognition.
  listen(lang, done) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return null;
    const rec = new Rec();
    rec.lang = lang; rec.continuous = true; rec.interimResults = false;
    let text = '', cancelled = false, error = '';
    rec.onresult = e => { text = [...e.results].map(r => r[0].transcript).join(' ').trim(); };
    rec.onerror = e => { error = e.error; };
    const key = e => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      cancelled = e.key === 'Escape';
      rec.stop();
    };
    document.addEventListener('keydown', key, true);
    rec.onend = () => {
      document.removeEventListener('keydown', key, true);
      if (error === 'not-allowed' || error === 'service-not-allowed') window.HB.announce('The browser blocked the microphone. Allow it in the address bar, then try again.');
      done(cancelled ? '' : text);
    };
    try { rec.start(); } catch (e) { rec.onend(); }
    return () => rec.stop();
  },
};

// Voice commands: press Alt+V (or the "Voice command" button), say a button's name, such as
// "Hand it to WorkBuddy", "first example" or "read aloud", then press Enter. "What can I say" lists the buttons on screen.
// Without speech recognition in the browser, a box asks for the button's name instead.
(function () {
  const btn = document.getElementById('voice-command');
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ORDINALS = { first: 0, one: 0, '1': 0, second: 1, two: 1, '2': 1, third: 2, three: 2, '3': 2, fourth: 3, four: 3, '4': 3 };
  const visible = el => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0;
  const nameOf = el => norm(el.getAttribute('aria-label') || el.textContent).replace(/^use this example /, 'example ');
  // Buttons on the page first, then the menu; the text-size buttons are left out.
  const targets = () => [...document.querySelectorAll('main button, main a.btn, main summary, main input[type=radio]'), ...document.querySelectorAll('header nav a')]
    .filter(el => el !== btn && visible(el))
    .map(el => ({ el, name: el.matches('input') ? norm(el.closest('label')?.textContent) : nameOf(el) }))
    .filter(t => t.name);
  const say = text => window.HB.announce(text);
  const short = n => n.split(' ').slice(0, 6).join(' ');
  const listing = () => {
    const names = targets().map(t => t.name.startsWith('example ') ? null : short(t.name)).filter(Boolean);
    const ex = targets().filter(t => t.name.startsWith('example ')).length;
    return `You can say: ${[...new Set(names)].slice(0, 10).join(', ').replace(/\bi m\b/g, "I'm")}${ex ? `, or first example up to example ${ex}` : ''}.`;
  };

  function act(heard) {
    const h = norm(heard).replace(/^(press|click|choose|select|open|go to|the)\s+/, '').replace(/\s+button$/, '');
    if (!h) return say("I didn't hear a button. Press Alt V to try again.");
    if (/what can i say|^help$|^options$/.test(h)) return say(listing());
    if (/^(stop|quiet|be quiet|cancel)$/.test(h)) { if ('speechSynthesis' in window) speechSynthesis.cancel(); return; }
    const all = targets();
    // "first example", "example two"
    const ord = h.match(/\b(first|second|third|fourth|one|two|three|four|[1-4])\b/);
    if (/example/.test(h) && ord) {
      const ex = all.filter(t => t.name.startsWith('example '))[ORDINALS[ord[1]]];
      if (ex) { ex.el.click(); return; }
    }
    // Best match: the button whose name contains what was said, else the most words in common.
    const words = h.split(' ').filter(w => w.length > 1);
    let best = null, score = 0;
    for (const t of all) {
      let sc = t.name === h ? 100 : t.name.includes(h) ? 50 + h.length / t.name.length : 0;
      if (!sc) { const tw = t.name.split(' '); const hit = words.filter(w => tw.includes(w)).length; sc = words.length ? hit / words.length * (hit >= Math.min(2, words.length) ? 40 : 0) : 0; }
      if (sc > score) { score = sc; best = t; }
    }
    if (!best) return say(`I couldn't find a button called ${heard}. ${listing()}`);
    best.el.focus();
    best.el.click();
  }

  let stop = null;
  function start() {
    if (stop) return stop();
    const reset = () => { stop = null; if (btn) { btn.disabled = false; btn.textContent = 'Voice command'; } };
    stop = window.HB.listen('en-GB', heard => { reset(); if (heard) act(heard); else say("I didn't hear a button. Press Alt V to try again."); });
    if (!stop) {
      const typed = window.prompt('Type the name of the button you want, for example Hand it to WorkBuddy. Type help to hear the buttons.');
      if (typed) act(typed);
      return;
    }
    if (btn) btn.textContent = 'Listening. Press Enter to stop';
    say('Listening. Say a button, then press Enter.');
  }

  if (btn) btn.addEventListener('click', start);
  document.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) { e.preventDefault(); start(); }
  });
  window.HB.voiceCommand = act;
})();
