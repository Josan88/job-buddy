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
    if (r) { r.textContent = ''; setTimeout(() => { r.textContent = text; }, 60); }
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

// Voice commands: press Alt+V (or the "Voice command" button), then say a button's name, such as
// "Find me work", "first example" or "read aloud". "What can I say" lists the buttons on screen.
// Without speech recognition in the browser, a box asks for the button's name instead.
(function () {
  const btn = document.getElementById('voice-command');
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ORDINALS = { first: 0, one: 0, '1': 0, second: 1, two: 1, '2': 1, third: 2, three: 2, '3': 2, fourth: 3, four: 3, '4': 3 };
  const visible = el => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0;
  const nameOf = el => norm(el.getAttribute('aria-label') || el.textContent).replace(/^use this example /, 'example ');
  // Buttons on the page first, then the menu; the text-size buttons are left out.
  const targets = () => [...document.querySelectorAll('main button, main a.btn, main summary, main input[type=radio]'), ...document.querySelectorAll('header nav a, #speak-toggle')]
    .filter(el => el !== btn && visible(el))
    .map(el => ({ el, name: el.matches('input') ? norm(el.closest('label')?.textContent) : nameOf(el) }))
    .filter(t => t.name);
  const say = (text, then) => {
    if (window.HB_SPEAK && 'speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-GB'; u.rate = 1.05;
      if (then) u.onend = u.onerror = then;
      speechSynthesis.speak(u);
    } else {
      window.HB.announce(text);
      if (then) setTimeout(then, 1200 + text.length * 40);
    }
  };
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

  function start() {
    if (!Rec) {
      const typed = window.prompt('Type the name of the button you want, for example Find me work. Type help to hear the buttons.');
      if (typed) act(typed);
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Listening…'; }
    say('Say a button.', () => {
      const rec = new Rec();
      rec.lang = 'en-GB'; rec.interimResults = false; rec.maxAlternatives = 1;
      let got = false;
      rec.onresult = e => { got = true; act(e.results[0][0].transcript); };
      rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { got = true; say('The browser blocked the microphone. Allow it in the address bar, then try again.'); } };
      rec.onend = () => { if (btn) { btn.disabled = false; btn.textContent = 'Voice command'; } if (!got) say("I didn't hear anything. Press Alt V to try again."); };
      try { rec.start(); } catch (e) { rec.onend(); }
    });
  }

  if (btn) btn.addEventListener('click', start);
  document.addEventListener('keydown', e => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) { e.preventDefault(); start(); }
  });
  window.HB.voiceCommand = act;
})();
