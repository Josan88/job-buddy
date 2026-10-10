#!/usr/bin/env node
// One-time Telegram login for HireBuddy's server, so it can send hand-offs to WorkBuddy's Telegram bot.
// Telegram bots can't message other bots, so HireBuddy sends as a Telegram user account. Use a second
// number rather than your personal account: the session string printed at the end is full access to it.
//
// Usage (from the repo root, after npm install): node workbuddy/telegram-login.js
// You need an API ID and API hash from https://my.telegram.org (API development tools).
const crypto = require('crypto');
const readline = require('readline');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, a => r(a.trim())));

(async () => {
  const apiId = Number(await ask('API ID (from my.telegram.org): '));
  const apiHash = await ask('API hash: ');
  const bot = (await ask("WorkBuddy's Telegram bot username (e.g. WorkBuddy8_bot): ")).replace(/^@/, '');
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });
  client.setLogLevel('error');
  await client.start({
    phoneNumber: () => ask('Phone number of the account HireBuddy will send from (with country code, e.g. +60...): '),
    phoneCode: () => ask('Login code Telegram just sent you: '),
    password: () => ask('Two-step verification password (press Enter if none): '),
    onError: e => console.error('Login problem:', e.message),
  });
  // Open the chat with the bot once, the way pressing Start does in the app.
  await client.sendMessage(bot, { message: '/start' });
  const session = client.session.save();
  const key = crypto.randomBytes(12).toString('base64url');
  console.log(`\nLogged in, and opened the chat with @${bot}.`);
  console.log('Add these in Render (HireBuddy service, Environment). Keep TELEGRAM_SESSION secret: it is full access to that account.\n');
  console.log(`WORKBUDDY_TELEGRAM_BOT=${bot}`);
  console.log(`TELEGRAM_API_ID=${apiId}`);
  console.log(`TELEGRAM_API_HASH=${apiHash}`);
  console.log(`TELEGRAM_SESSION=${session}`);
  console.log(`TELEGRAM_HANDOFF_KEY=${key}`);
  console.log('\nThen on the HireBuddy page, open "Send to WorkBuddy automatically, through Telegram" and type the hand-off key once.');
  await client.disconnect();
  rl.close();
  process.exit(0);
})().catch(e => {
  console.error(`\nCould not log in: ${e.message}`);
  process.exit(1);
});
