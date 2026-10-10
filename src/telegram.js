// Hand tasks to WorkBuddy through Telegram, from the server, with no extra press.
// WorkBuddy's Assistant listens to a Telegram bot, and Telegram bots never see messages from other bots,
// so HireBuddy sends as a Telegram user account (log in once with workbuddy/telegram-login.js).
// Only browsers paired with TELEGRAM_HANDOFF_KEY may send: the site is public, and each message starts a
// task on the WorkBuddy owner's computer.
const crypto = require('crypto');

const BOT = (process.env.WORKBUDDY_TELEGRAM_BOT || '').replace(/^@/, '').trim();
const KEY = process.env.TELEGRAM_HANDOFF_KEY || '';
const configured = () => !!(BOT && KEY && process.env.TELEGRAM_API_ID && process.env.TELEGRAM_API_HASH && process.env.TELEGRAM_SESSION);

const digest = s => crypto.createHash('sha256').update(String(s || '')).digest();
const keyOk = k => configured() && !!k && crypto.timingSafeEqual(digest(k), digest(KEY));

let clientP = null;
function client() {
  if (!clientP) {
    clientP = (async () => {
      const { TelegramClient } = require('telegram');
      const { StringSession } = require('telegram/sessions');
      const c = new TelegramClient(new StringSession(process.env.TELEGRAM_SESSION), Number(process.env.TELEGRAM_API_ID), process.env.TELEGRAM_API_HASH, { connectionRetries: 3 });
      c.setLogLevel('error');
      await c.connect();
      return c;
    })();
    clientP.catch(() => { clientP = null; });
  }
  return clientP;
}

const within = (ms, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('Telegram did not answer in time')), ms))]);
const sendOnce = async text => (await client()).sendMessage(BOT, { message: text });

// One send at a time and at most one every 10 seconds, like the bridge: a double press must not start two runs.
let lastSend = 0;
async function send(text) {
  if (Date.now() - lastSend < 10000) throw new Error('Another task was sent to WorkBuddy a moment ago. Wait 10 seconds and try again.');
  lastSend = Date.now();
  try {
    await within(20000, sendOnce(text));
  } catch (e) {
    // After the free tier sleeps the connection can be stale: reconnect once and retry.
    clientP = null;
    await within(20000, sendOnce(text));
  }
}

module.exports = { configured, keyOk, send, BOT };
