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
  debug(stage, details = {}) {
    const line = `${new Date().toLocaleTimeString()} ${stage} ${JSON.stringify(details)}`;
    console.info('[HireBuddy application]', stage, details);
    let output = document.getElementById('application-debug-output');
    if (!output) {
      const panel = document.createElement('details');
      panel.id = 'application-debug';
      panel.className = 'panel';
      const title = document.createElement('summary');
      title.textContent = 'Application debug console';
      output = document.createElement('pre');
      output.id = 'application-debug-output';
      output.style.whiteSpace = 'pre-wrap';
      output.style.overflowWrap = 'anywhere';
      panel.append(title, output);
      document.querySelector('main').appendChild(panel);
    }
    output.textContent = (output.textContent + line + '\n').split('\n').slice(-60).join('\n');
  },
  async sendApplication(jobId, studentId, endpoint) {
    let key = '';
    try { key = localStorage.getItem('hirebuddy.telegramKey') || ''; } catch {}
    const url = endpoint || `/api/jobs/${encodeURIComponent(jobId)}/apply/${encodeURIComponent(studentId)}`;
    window.HB.debug('request', { url, paired: !!key });
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }),
      });
      const result = await response.json();
      window.HB.debug('response', { status: response.status, ok: !!result.ok, sent: result.sent, error: result.error, requestId: result.requestId });
      return result;
    } catch (error) {
      window.HB.debug('network failure', { error: error.message });
      return { ok: false, error: 'The application request could not be sent. Check your connection and try again.' };
    }
  },
  bindResultApplications(root, runId) {
    root.querySelectorAll('[data-result-apply]').forEach(button => {
      const card = button.closest('[data-result-card]');
      card.addEventListener('focus', () => {
        window.HB.debug('result card focused', { runId, listing: button.dataset.resultApply });
        window.HB.readControl(`${card.innerText}. Press Enter to request an application.`);
      });
      card.addEventListener('keydown', event => {
        if (event.key !== 'Enter' || event.target !== card || event.repeat) return;
        event.preventDefault();
        window.HB.debug('result card Enter', { runId, listing: button.dataset.resultApply });
        button.click();
      });
      button.onclick = async () => {
        if (button.disabled) return;
        button.disabled = true;
        window.HB.announce('Sending application request to Telegram.');
        const result = await window.HB.sendApplication(null, null,
          `/api/runs/${encodeURIComponent(runId)}/listings/${button.dataset.resultApply}/apply`);
        const status = card.querySelector('[data-application-status]');
        status.textContent = result.message || result.error || 'Application request failed.';
        status.focus();
        window.HB.announce(status.textContent);
        if (!result.ok) button.disabled = false;
      };
    });
  },
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
    u.lang = 'en-GB'; u.rate = 0.75;
    u.onend = () => { if (button) button.textContent = 'Read aloud'; };
    speechSynthesis.speak(u);
    if (button) button.textContent = 'Stop reading';
  },
  // Read newly focused controls for people using the site's built-in speech rather than a screen reader.
  readFocus(text) {
    if (!('speechSynthesis' in window)) { console.error('[HireBuddy speech] speechSynthesis is unavailable'); return; }
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    const chunks = clean.match(/.{1,180}(?:[.!?](?=\s|$)|\s|$)/g) || [clean];
    console.info('[HireBuddy speech] queue', { characters: clean.length, chunks: chunks.length, text: clean });
    speechSynthesis.resume();
    chunks.filter(Boolean).forEach(chunk => {
      const u = new SpeechSynthesisUtterance(chunk.trim());
      u.lang = 'en-GB'; u.rate = 0.75;
      u.onstart = () => { window.HB._speechStarted = true; console.info('[HireBuddy speech] started', chunk.trim()); };
      u.onend = () => console.info('[HireBuddy speech] ended', chunk.trim());
      u.onerror = event => console.error('[HireBuddy speech] error', event.error, chunk.trim());
      speechSynthesis.speak(u);
    });
  },
  readControl(text) {
    if (!('speechSynthesis' in window)) { console.error('[HireBuddy speech] speechSynthesis is unavailable'); return; }
    speechSynthesis.cancel();
    let spoken = false;
    const speak = source => {
      if (spoken) return;
      spoken = true;
      const u = new SpeechSynthesisUtterance(String(text || '').replace(/\s+/g, ' ').trim());
      u.lang = 'en-GB'; u.rate = 0.75;
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find(v => /^en(-|_)/i.test(v.lang)) || voices[0] || null;
      u.onstart = () => { window.HB._speechStarted = true; console.info('[HireBuddy speech] control started', { source, text: u.text, voice: u.voice?.name }); };
      u.onend = () => console.info('[HireBuddy speech] control ended', u.text);
      u.onerror = event => console.error('[HireBuddy speech] control error', event.error, u.text);
      speechSynthesis.resume();
      speechSynthesis.speak(u);
    };
    const voices = speechSynthesis.getVoices();
    console.info('[HireBuddy speech] control request', { text, voices: voices.length });
    if (voices.length) speak('voices-ready');
    else {
      speechSynthesis.addEventListener('voiceschanged', () => speak('voiceschanged'), { once: true });
      setTimeout(() => speak('voice-timeout'), 300);
    }
  },
  readPage(interrupt = false) {
    const main = document.querySelector('main');
    if (!main) return;
    const title = main.querySelector('h1')?.textContent?.trim() || document.title;
    const intro = main.querySelector('.lede, h1 + p, #job-help')?.textContent?.trim() || '';
    const sections = [...main.querySelectorAll('h2')].filter(h => h.getClientRects().length).map(h => h.textContent.trim());
    const tabs = [...document.querySelectorAll('header nav a, header nav summary')].filter(el => el.getClientRects().length).map(el => el.textContent.trim());
    const text = `${tabs.length ? `Navigation tabs: ${tabs.join(', ')}. ` : ''}${title}. ${intro}${sections.length ? ` This page has these sections: ${sections.join(', ')}.` : ''}`;
    console.info('[HireBuddy speech] page introduction', { title, intro, sections, interrupt });
    (interrupt ? window.HB.readControl : window.HB.readFocus)(text);
  },
  // Listen until the person presses Enter (or the button again). Escape cancels. Calls done(text), with ''
  // when nothing was heard or it was cancelled. Returns a stop function, or null without speech recognition.
  listen(lang, done) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Rec) return null;
    const rec = new Rec();
    rec.lang = lang; rec.continuous = true; rec.interimResults = false;
    let text = '', cancelled = false, error = '';
    rec.onstart = () => console.info('[HireBuddy voice] recognition started', { lang });
    rec.onresult = e => { text = [...e.results].map(r => r[0].transcript).join(' ').trim(); console.info('[HireBuddy voice] recognition result', text); };
    rec.onerror = e => { error = e.error; console.error('[HireBuddy voice] recognition error', e.error); };
    const key = e => {
      if (e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation();
      cancelled = e.key === 'Escape';
      rec.stop();
    };
    document.addEventListener('keydown', key, true);
    rec.onend = () => {
      console.info('[HireBuddy voice] recognition ended', { text, cancelled, error });
      document.removeEventListener('keydown', key, true);
      if (error === 'not-allowed' || error === 'service-not-allowed') window.HB.announce('The browser blocked the microphone. Allow it in the address bar, then try again.');
      done(cancelled ? '' : text);
    };
    try { rec.start(); } catch (e) { console.error('[HireBuddy voice] could not start recognition', e); rec.onend(); }
    return () => rec.stop();
  },
};

// Read all visible main content from top to bottom when the page loads.
window.addEventListener('load', () => {
  window.HB.readPage();
});

// If autoplay was blocked, retry once inside the first trusted keyboard or pointer event.
const retryStartupSpeech = () => {
  console.info('[HireBuddy speech] first user interaction', { alreadyStarted: !!window.HB._speechStarted });
  if (!window.HB._speechStarted) window.HB.readPage(true);
};
document.addEventListener('keydown', retryStartupSpeech, { once: true, capture: true });
document.addEventListener('pointerdown', retryStartupSpeech, { once: true, capture: true });

// Every button announces itself when reached with Tab, including dynamically added buttons.
document.addEventListener('focusin', event => {
  const button = event.target.closest?.('button');
  if (!button) return;
  const name = button.getAttribute('aria-label') || button.textContent.trim() || 'Unnamed';
  const context = button.dataset.label ? `${button.dataset.label}. ` : '';
  window.HB.readControl(`${context}${name}. Button. Press Enter to activate.`);
});

// Navigation items are announced as tabs before their name and activation instruction.
document.addEventListener('focusin', event => {
  const tab = event.target.closest?.('header nav a, header nav summary');
  if (!tab) return;
  const name = tab.getAttribute('aria-label') || tab.textContent.trim();
  window.HB.readControl(`${name}. Navigation tab. Press Enter to select.`);
});

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
  const targets = () => {
    const controls = [...document.querySelectorAll('main button, main a.btn, main summary, main input[type=radio]'), ...document.querySelectorAll('header nav a, header nav summary')]
    .filter(el => el !== btn && visible(el))
    .map(el => ({ el, name: el.matches('input') ? norm(el.closest('label')?.textContent) : nameOf(el), kind: el.closest('header nav') ? 'navigation tab' : 'control' }));
    const sections = [...document.querySelectorAll('main h1, main h2')].filter(visible).map(el => {
      if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
      return { el, name: norm(el.textContent), kind: 'section' };
    });
    return [...controls, ...sections].filter(t => t.name);
  }
  const say = text => { console.info('[HireBuddy voice] feedback', text); window.HB.announce(text); window.HB.readControl(text); };
  const short = n => n.split(' ').slice(0, 6).join(' ');
  const listing = () => {
    const names = targets().map(t => t.name.startsWith('example ') ? null : short(t.name)).filter(Boolean);
    const ex = targets().filter(t => t.name.startsWith('example ')).length;
    const sections = targets().filter(t => t.kind === 'section').map(t => t.name);
    return `You can say a control name such as ${[...new Set(names)].slice(0, 10).join(', ').replace(/\bi m\b/g, "I'm")}${ex ? `, or first example up to example ${ex}` : ''}.${sections.length ? ` You can also say a section name: ${sections.join(', ')}.` : ''}`;
  };

  function act(heard) {
    const h = norm(heard).replace(/^(press|click|choose|select|open|go to|the)\s+/, '').replace(/\s+button$/, '');
    console.info('[HireBuddy voice] command', { heard, normalized: h });
    if (!h) return say("I didn't hear a button. Press Alt V to try again.");
    if (/what can i say|^help$|^options$/.test(h)) return say(listing());
    if (/^(stop|quiet|be quiet|cancel)$/.test(h)) { if ('speechSynthesis' in window) speechSynthesis.cancel(); return; }
    const all = targets();
    console.info('[HireBuddy voice] available targets', all.map(t => t.name));
    // "first example", "example two"
    const ord = h.match(/\b(first|second|third|fourth|one|two|three|four|[1-4])\b/);
    if (/example/.test(h) && ord) {
      const ex = all.filter(t => t.name.startsWith('example '))[ORDINALS[ord[1]]];
      if (ex) { ex.el.focus(); say(`Focused ${ex.name}. ${ex.el.matches('button') ? 'Button. ' : ''}Press Enter to select.`); return; }
    }
    // Best match: the button whose name contains what was said, else the most words in common.
    const words = h.split(' ').filter(w => w.length > 1);
    let best = null, score = 0;
    for (const t of all) {
      let sc = t.name === h ? 100 : t.name.includes(h) ? 50 + h.length / t.name.length : 0;
      if (!sc) { const tw = t.name.split(' '); const hit = words.filter(w => tw.includes(w)).length; sc = words.length ? hit / words.length * (hit >= Math.min(2, words.length) ? 40 : 0) : 0; }
      if (sc > score) { score = sc; best = t; }
    }
    if (!best) { console.warn('[HireBuddy voice] no target matched', { heard, normalized: h }); return say(`I couldn't find a button called ${heard}. ${listing()}`); }
    console.info('[HireBuddy voice] activating target', { heard, target: best.name, score });
    best.el.focus();
    say(best.kind === 'section'
      ? `Focused ${best.name}. Section selected.`
      : `Focused ${best.name}. ${best.kind === 'navigation tab' ? 'Navigation tab. ' : best.el.matches('button') ? 'Button. ' : ''}Press Enter to select.`);
  }

  let stop = null;
  function start() {
    console.info('[HireBuddy voice] start requested');
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
    const typing = e.target.matches?.('input, textarea, select, [contenteditable="true"]');
    if (e.code === 'Space' && !e.altKey && !e.ctrlKey && !e.metaKey && !typing && e.target !== btn) { e.preventDefault(); start(); }
  });
  window.HB.voiceCommand = act;
})();
