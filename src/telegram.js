// Hand tasks to WorkBuddy through Telegram, from the server, with no extra press.
// WorkBuddy's Assistant listens to a Telegram bot, and Telegram bots never see messages from other bots,
// so HireBuddy sends as a Telegram user account (log in once with workbuddy/telegram-login.js).
// Only browsers paired with TELEGRAM_HANDOFF_KEY may send: the site is public, and each message starts a
// task on the WorkBuddy owner's computer. WorkBuddy's replies come back to that account; HireBuddy keeps the
// last few in memory so a paired browser can see that WorkBuddy is answering.
const crypto = require('crypto');

const BOT = (process.env.WORKBUDDY_TELEGRAM_BOT || '').replace(/^@/, '').trim();
const KEY = process.env.TELEGRAM_HANDOFF_KEY || '';
const configured = () => !!(BOT && KEY && process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_SESSION);

const digest = s => crypto.createHash('sha256').update(String(s || '')).digest();
const keyOk = k => configured() && !!k && crypto.timingSafeEqual(digest(k), digest(KEY));

const state = { account: null, error: null, lastSent: null, replies: [] };

// Keep the newest version of each reply: WorkBuddy may edit a message as it writes its answer.
function record(m) {
  const reply = { id: m.id, at: new Date((m.editDate || m.date) * 1000).toISOString(), text: String(m.message || (m.media ? '(a file or photo)' : '')).slice(0, 4000) };
  const i = state.replies.findIndex(r => r.id === m.id);
  if (i >= 0) state.replies[i] = reply; else state.replies.push(reply);
  state.replies = state.replies.slice(-10);
}

let clientP = null;
function client() {
  if (!clientP) {
    clientP = (async () => {
      const { TelegramClient } = require('telegram');
      const { StringSession } = require('telegram/sessions');
      const { NewMessage } = require('telegram/events');
      const { EditedMessage } = require('telegram/events/EditedMessage');
      const c = new TelegramClient(new StringSession(process.env.TELEGRAM_SESSION), Number(process.env.TELEGRAM_API_ID), process.env.TELEGRAM_API_HASH, { connectionRetries: 3 });
      c.setLogLevel('error');
      await c.connect();
      const me = await c.getMe();
      const bot = await c.getEntity(BOT);
      const fromBot = ev => { if (String(ev.message.senderId) === String(bot.id)) record(ev.message); };
      c.addEventHandler(fromBot, new NewMessage({ incoming: true }));
      c.addEventHandler(fromBot, new EditedMessage({ incoming: true }));
      state.account = me.username ? `@${me.username}` : [me.firstName, me.lastName].filter(Boolean).join(' ');
      state.error = null;
      return c;
    })();
    clientP.catch(e => { clientP = null; state.error = e.message; });
  }
  return clientP;
}
function reconnect() {
  const old = clientP;
  clientP = null;
  if (old) old.then(c => c.disconnect()).catch(() => {});
}

const within = (ms, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('Telegram did not answer in time')), ms))]);
const sendOnce = async text => (await client()).sendMessage(BOT, { message: text });

// One send at a time and at most one every 10 seconds, like the bridge: a double press must not start two runs.
let lastSend = 0;
async function send(text) {
  if (Date.now() - lastSend < 10000) throw new Error('Another message was sent to WorkBuddy a moment ago. Wait 10 seconds and try again.');
  lastSend = Date.now();
  try {
    await within(20000, sendOnce(text));
  } catch (e) {
    // After the free tier sleeps the connection can be stale: reconnect once and retry.
    reconnect();
    await within(20000, sendOnce(text));
  }
  state.lastSent = new Date().toISOString();
}

// Connect (or reconnect) and say how it went, with WorkBuddy's latest replies.
async function status() {
  if (!configured()) return { connected: false, error: 'Telegram is not set up on this HireBuddy.' };
  let connected = false;
  try { connected = !!(await within(20000, client())).connected; } catch (e) { state.error = e.message; }
  if (!connected && clientP) reconnect();
  return { connected, account: state.account, bot: BOT, error: connected ? null : state.error || 'Not connected to Telegram.', lastSent: state.lastSent, replies: state.replies };
}

// Connect at start-up so WorkBuddy's replies are caught even before the first hand-off.
function start() { if (configured()) client().catch(e => console.error('Telegram did not connect:', e.message)); }
// For /health: no account details, just whether it works.
const health = () => !configured() ? 'off' : state.error ? 'not connected' : state.account ? 'connected' : 'connecting';

module.exports = { configured, keyOk, send, status, start, health, BOT };
