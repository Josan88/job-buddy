#!/usr/bin/env node
// HireBuddy Voice: press Ctrl+Alt+H anywhere on Windows, say the work you want, and WorkBuddy does it.
// It listens (Windows speech recognition), hands your sentence to WorkBuddy as a task, then reads
// WorkBuddy's progress and the result aloud from HireBuddy's live run log while you do other things.
// It only acts when you press its hotkey on this computer. WorkBuddy does the work, not this app.
//
//   HireBuddyVoice.exe --install   add the Ctrl+Alt+H shortcut (Start menu)
//   HireBuddyVoice.exe             listen now (what the shortcut runs)
//   HireBuddyVoice.exe --type      type instead of speaking
//   HireBuddyVoice.exe --say "..." skip listening and use this sentence
//   HireBuddyVoice.exe --bridge    let "Hand it to WorkBuddy" on the HireBuddy page send the task straight in
//   HireBuddyVoice.exe --test      check speech, recognition, the WorkBuddy window and the shortcut
//
// Optional hirebuddy-voice.json next to the exe: { "url": "...", "windowTitle": "WorkBuddy", "newTaskKeys": "" }
// newTaskKeys are SendKeys codes pressed after WorkBuddy comes to the front, e.g. "^n" if a new task needs Ctrl+N.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const exe = process.execPath;
const isSea = (() => { try { return require('node:sea').isSea(); } catch { return false; } })();
const home = isSea ? path.dirname(exe) : __dirname;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(home, 'hirebuddy-voice.json'), 'utf8')); } catch {}
const BASE = (process.env.HIREBUDDY_URL || cfg.url || 'https://hirebuddy-k543.onrender.com').replace(/\/$/, '');
const TITLE = cfg.windowTitle || 'WorkBuddy';
const NEW_TASK_KEYS = cfg.newTaskKeys || '';
const args = process.argv.slice(isSea ? 1 : 2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LOG = path.join(require('os').tmpdir(), 'hirebuddy-voice.log');
const log = (...a) => { const line = `${new Date().toLocaleTimeString()} ${a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')}`; console.log(line); try { fs.appendFileSync(LOG, line + '\n'); } catch {} };

// Run a PowerShell snippet. Values go in through environment variables, never pasted into the code.
function ps(script, env = {}) {
  if (process.platform !== 'win32') { log('[powershell skipped: not Windows]', Object.values(env).join(' | ')); return { stdout: '', status: 0 }; }
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(`$ProgressPreference = 'SilentlyContinue'
${script}`, 'utf16le').toString('base64')],
    { env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const out = { stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim(), status: r.status };
  if (r.error) log('powershell could not start:', r.error.message);
  // PowerShell's first-run progress messages arrive on stderr as CLIXML; they aren't errors.
  if (out.stderr && !/^#< CLIXML[\s\S]*<\/Objs>$/.test(out.stderr) || /S="Error"/.test(out.stderr)) log('powershell error:', out.stderr.slice(0, 500));
  return out;
}

const speak = text => {
  log('SAY:', text);
  const r = ps(SPEAK_PS, { HB_TEXT: text });
  if (r.stdout && r.stdout !== 'ok') log('speech:', r.stdout);
};
// Speak on the default audio device with an enabled voice. If .NET speech fails, use the Windows SAPI voice directly.
const SPEAK_PS = `
try {
  Add-Type -AssemblyName System.Speech
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $v = $s.GetInstalledVoices() | Where-Object { $_.Enabled } | Select-Object -First 1
  if ($v -eq $null) { throw 'no enabled voice' }
  $s.SelectVoice($v.VoiceInfo.Name)
  $s.SetOutputToDefaultAudioDevice()
  $s.Volume = 100; $s.Rate = 1
  $s.Speak($env:HB_TEXT)
  Write-Output 'ok'
} catch {
  $first = $_.Exception.Message
  try { $c = New-Object -ComObject SAPI.SpVoice; $c.Volume = 100; [void]$c.Speak($env:HB_TEXT); Write-Output ('used SAPI because: ' + $first) }
  catch { Write-Output ('NO SPEECH: ' + $first + ' / SAPI: ' + $_.Exception.Message) }
}`;

// Windows speech recognition, phrase by phrase, until about three seconds of silence.
function listen() {
  const r = ps(`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Speech
  $all = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  if ($all.Count -eq 0) { Write-Output 'ERR:no-recognizer'; exit }
  $pick = $all | Where-Object { $_.Culture.Name -like 'en-*' } | Select-Object -First 1
  if ($pick -eq $null) { $pick = $all | Select-Object -First 1 }
  $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine($pick)
  $r.SetInputToDefaultAudioDevice()
  $r.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $r.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
  $r.EndSilenceTimeout = [TimeSpan]::FromSeconds(1.2)
  $parts = @()
  while ($true) {
    $res = $r.Recognize([TimeSpan]::FromSeconds(25))
    if ($res -eq $null -or [string]::IsNullOrWhiteSpace($res.Text)) { break }
    $parts += $res.Text
    $r.InitialSilenceTimeout = [TimeSpan]::FromSeconds(3)
  }
  Write-Output ($parts -join ' ')
} catch { Write-Output ('ERR:' + $_.Exception.Message) }`);
  if (r.stdout.startsWith('ERR:')) {
    log('listen failed:', r.stdout);
    speak(r.stdout === 'ERR:no-recognizer'
      ? 'Windows speech recognition is not installed, so I will open a typing box instead. To speak, add English speech recognition in Windows settings, under Time and language, Speech.'
      : 'I could not use the microphone, so I will open a typing box instead.');
    return '';
  }
  return r.stdout;
}

// Checks each part and says what works, so a problem can be found quickly.
function selfTest() {
  log('--- self-test', BASE, process.platform, process.version);
  const r = ps(`
$o = @()
try { Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $o += 'voices: ' + (($s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }) -join ', ') } catch { $o += 'voices: ERROR ' + $_.Exception.Message }
try { $o += 'recognizers: ' + (([System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { $_.Culture.Name }) -join ', ') } catch { $o += 'recognizers: ERROR ' + $_.Exception.Message }
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.MainWindowTitle -like ('*' + $env:HB_TITLE + '*') -or $_.ProcessName -like ('*' + $env:HB_TITLE + '*')) } | Select-Object -First 1
$o += 'workbuddy window: ' + $(if ($p) { $p.ProcessName + ' / ' + $p.MainWindowTitle } else { 'NOT FOUND' })
$o += 'windows with titles: ' + ((Get-Process | Where-Object { $_.MainWindowTitle } | ForEach-Object { $_.ProcessName + '=' + $_.MainWindowTitle }) -join '; ')
$lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'HireBuddy Voice.lnk'
$o += 'shortcut: ' + $(if (Test-Path $lnk) { (New-Object -ComObject WScript.Shell).CreateShortcut($lnk).Hotkey } else { 'NOT INSTALLED' })
try { $c = New-Object -ComObject SAPI.SpVoice; $o += 'SAPI voice: ' + $c.Voice.GetDescription() + ', volume ' + $c.Volume } catch { $o += 'SAPI voice: ERROR ' + $_.Exception.Message }
try { $o += 'sound devices: ' + ((Get-CimInstance Win32_SoundDevice | ForEach-Object { $_.Name + ' (' + $_.Status + ')' }) -join '; ') } catch {}
$o -join [Environment]::NewLine`, { HB_TITLE: TITLE });
  log(r.stdout || '(no output from PowerShell)');
  return r.stdout;
}

// A standard Windows input box: screen readers read its label and text field.
const askTyped = prompt => ps(`Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox($env:HB_TEXT, 'HireBuddy Voice', '')`, { HB_TEXT: prompt }).stdout;

// Bring WorkBuddy to the front and paste the task into it, the way the person would.
function sendToWorkBuddy(task) {
  // Keys are pressed only once WorkBuddy is confirmed as the window in front, so Ctrl+V and Enter
  // can never land in another app (for example the browser, where Enter would press a button again).
  const r = ps(`
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class HBWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
Set-Clipboard -Value $env:HB_TASK
$p = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and ($_.MainWindowTitle -like ('*' + $env:HB_TITLE + '*') -or $_.ProcessName -like ('*' + $env:HB_TITLE + '*')) } | Select-Object -First 1
if ($p -eq $null) { Write-Output 'notfound'; exit }
$h = $p.MainWindowHandle
for ($i = 0; $i -lt 5 -and [HBWin]::GetForegroundWindow() -ne $h; $i++) {
  if ([HBWin]::IsIconic($h)) { [void][HBWin]::ShowWindow($h, 9) }
  # A tap of Alt lets this app hand the foreground to WorkBuddy (Windows blocks it otherwise).
  [HBWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [HBWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
  [void][HBWin]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 300
}
if ([HBWin]::GetForegroundWindow() -ne $h) { Write-Output 'nofocus'; exit }
Start-Sleep -Milliseconds 500
if ($env:HB_NEWTASK) { [System.Windows.Forms.SendKeys]::SendWait($env:HB_NEWTASK); Start-Sleep -Milliseconds 800 }
if ([HBWin]::GetForegroundWindow() -ne $h) { Write-Output 'nofocus'; exit }
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 400
if ([HBWin]::GetForegroundWindow() -ne $h) { Write-Output 'nofocus'; exit }
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Write-Output 'sent'`, { HB_TASK: task, HB_TITLE: TITLE, HB_NEWTASK: NEW_TASK_KEYS });
  if (process.platform !== 'win32') return 'sent';
  return ['sent', 'notfound', 'nofocus'].includes(r.stdout) ? r.stdout : 'nofocus';
}

function install() {
  const target = isSea ? exe : process.execPath;
  const targetArgs = isSea ? '' : `"${__filename}"`;
  const r = ps(`
$w = New-Object -ComObject WScript.Shell
$dir = [Environment]::GetFolderPath('Programs')
$s = $w.CreateShortcut((Join-Path $dir 'HireBuddy Voice.lnk'))
$s.TargetPath = $env:HB_TARGET
$s.Arguments = $env:HB_ARGS
$s.WorkingDirectory = $env:HB_HOME
$s.Hotkey = 'CTRL+ALT+H'
$s.Description = 'Say the work you want; WorkBuddy does it with HireBuddy'
$s.WindowStyle = 7
$s.Save()
Write-Output 'ok'`, { HB_TARGET: target, HB_ARGS: targetArgs, HB_HOME: home });
  speak(r.stdout === 'ok' || process.platform !== 'win32'
    ? 'HireBuddy Voice is ready. Press Control Alt H anywhere, then say the work you want.'
    : 'Sorry, I could not add the shortcut.');
}

const plain = t => String(t || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();

async function follow(handoffId) {
  let runId = null;
  for (let i = 0; i < 90 && !runId; i++) {
    await sleep(2000);
    const h = await fetch(`${BASE}/api/handoffs/${handoffId}`).then(r => r.json()).catch(() => ({}));
    runId = h.runId;
    if (i === 30) speak('WorkBuddy has not started yet. If the task is not in WorkBuddy, switch to it and press Control V, then Enter.');
  }
  if (!runId) return speak('WorkBuddy did not start the task. The task is still copied: paste it into WorkBuddy.');
  speak('WorkBuddy has started. I will tell you each step.');
  const said = new Set();
  for (let i = 0; i < 900; i++) {
    await sleep(2000);
    const run = await fetch(`${BASE}/api/runs/${runId}`).then(r => r.json()).catch(() => null);
    if (!run) continue;
    (run.plan || []).forEach((s, n) => {
      const key = `step${n}${s.status}`;
      if ((s.status === 'active' || s.status === 'done') && !said.has(`step${n}`)) { said.add(`step${n}`); said.add(key); speak(`Step ${n + 1} of ${run.plan.length}: ${s.title.replace(/^WorkBuddy: /, '')}.`); }
    });
    for (const e of (run.events || []).filter(e => e.type === 'decision')) {
      const key = `d${e.t}`;
      if (!said.has(key)) { said.add(key); speak(`Decision: ${plain(e.choice)}.`); }
    }
    if (run.status !== 'running') {
      speak(run.summary ? plain(run.summary) : 'WorkBuddy stopped before finishing. It will tell you what happened.');
      return;
    }
  }
}

// Ask the person at this computer before anything is sent. A standard Windows Yes/No box: screen readers
// read it, Enter means Yes. Returns true only if they chose Yes.
function confirmSend(sentence) {
  if (process.platform !== 'win32') { log('[confirm skipped: not Windows]', sentence); return process.env.HB_BRIDGE_TEST_YES === '1'; }
  const r = ps(`Add-Type -AssemblyName System.Windows.Forms
$a = [System.Windows.Forms.MessageBox]::Show($env:HB_TEXT, 'HireBuddy: send to WorkBuddy?', 'YesNo', 'Question', 'Button1', 'DefaultDesktopOnly')
Write-Output $a`, { HB_TEXT: `Send this to WorkBuddy?\n\n"${sentence}"\n\nPress Enter for Yes, or Escape for No.` });
  return r.stdout === 'Yes';
}

// HireBuddy bridge: a small web server on this computer only (127.0.0.1). When the person presses
// "Hand it to WorkBuddy" on the HireBuddy page, the page asks the bridge to paste the task into WorkBuddy,
// so there is no Alt+Tab or Ctrl+V. Guards, because any web page in the browser can call 127.0.0.1:
//  - only HireBuddy's own pages may call it (the browser's Origin header, which pages can't fake);
//  - the page sends only a handoff code; the task text comes from HireBuddy, never from the request;
//  - every task is shown and confirmed in a Windows Yes/No box by the person at the computer first;
//  - one task at a time, and a handoff that WorkBuddy already started can't be sent again.
const BRIDGE_PORT = Number(cfg.bridgePort || 47321);
function bridge() {
  const http = require('http');
  const allowed = new Set([new URL(BASE).origin, ...(cfg.allowOrigins || [])]);
  let busy = false, lastSend = 0;
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin || '';
    const hostOk = [`127.0.0.1:${BRIDGE_PORT}`, `localhost:${BRIDGE_PORT}`].includes(req.headers.host);
    const send = (code, body) => {
      const h = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' };
      if (allowed.has(origin)) Object.assign(h, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'content-type', 'access-control-allow-private-network': 'true' });
      res.writeHead(code, h); res.end(body ? JSON.stringify(body) : '');
    };
    // HireBuddy running on this same computer (npm start) counts as HireBuddy too.
    if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) allowed.add(origin);
    if (!hostOk || !allowed.has(origin)) { log('bridge: refused', req.method, req.url, 'from', origin || '(no origin)'); return send(403, { error: 'Only HireBuddy pages may use this bridge.' }); }
    if (req.method === 'OPTIONS') return send(204);
    if (req.method === 'GET' && req.url === '/status') return send(200, { ok: true, app: 'hirebuddy-bridge' });
    if (req.method !== 'POST' || req.url !== '/send') return send(404, { error: 'not found' });
    let raw = '';
    for await (const c of req) { raw += c; if (raw.length > 1000) return send(413, { error: 'too large' }); }
    const id = (() => { try { return String(JSON.parse(raw).handoff || ''); } catch { return ''; } })();
    if (!/^ho-[a-z0-9]{4,12}$/.test(id)) return send(400, { error: 'handoff code required' });
    // Dropped, never queued: a request while one is under way, or within 10 seconds of the last send.
    // Keys from one send are finished before the next Yes/No box can open, so they can never answer it.
    if (busy || Date.now() - lastSend < 10000) { log('bridge: dropped', id, busy ? '(busy)' : '(too soon after the last send)'); return send(409, { result: 'busy' }); }
    busy = true;
    try {
      const h = await fetch(`${BASE}/api/handoffs/${id}`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (!h?.task) return send(404, { result: 'unknown' });
      if (h.runId) return send(409, { result: 'already-started' });
      log('bridge: asking to send', id);
      if (!confirmSend(h.prompt || h.task)) { log('bridge: declined', id); return send(200, { result: 'declined' }); }
      const result = sendToWorkBuddy(h.task);
      lastSend = Date.now();
      log('bridge:', result, id);
      if (result === 'notfound') speak('WorkBuddy is not open. Open WorkBuddy, then press Control V and Enter. The task is copied.');
      else if (result === 'nofocus') speak('I could not switch to WorkBuddy. Switch to it, then press Control V and Enter. The task is copied.');
      return send(200, { result });
    } finally { busy = false; }
  });
  server.listen(BRIDGE_PORT, '127.0.0.1', () => {
    log(`HireBuddy bridge is on. Pages from ${[...allowed].join(', ')} can ask to send a task to WorkBuddy; you confirm each one. Leave this window open. Ctrl+C stops it.`);
    speak('HireBuddy bridge is on.');
  });
  server.on('error', e => { log('bridge could not start:', e.message); speak(e.code === 'EADDRINUSE' ? 'The HireBuddy bridge is already running.' : 'The HireBuddy bridge could not start.'); });
}

(async () => {
  if (args.includes('--bridge')) return bridge();
  if (args.includes('--install')) return install();
  if (args.includes('--test')) {
    const out = selfTest();
    const ok = await fetch(`${BASE}/health`).then(r => r.json()).catch(e => ({ error: e.message }));
    log('hirebuddy:', ok);
    speak('This is HireBuddy Voice. If you can hear me, speaking works.');
    console.log(`\nFull log: ${LOG}`);
    return;
  }
  let sentence = args.includes('--say') ? args[args.indexOf('--say') + 1] : '';
  if (!sentence && !args.includes('--type')) {
    speak('Listening. Say the work you want, then stop talking.');
    sentence = listen();
  }
  if (!sentence) sentence = askTyped('Type the work you want in one sentence, then press Enter.');
  if (!sentence) return speak('I did not get a sentence, so I did nothing.');
  speak(`I heard: ${sentence}. Sending it to WorkBuddy.`);
  const h = await fetch(`${BASE}/api/handoffs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: sentence }) })
    .then(r => r.json()).catch(() => null);
  if (!h?.task) return speak('I could not reach HireBuddy. Check the internet connection and try again.');
  const sent = sendToWorkBuddy(h.task);
  if (sent === 'notfound') speak('WorkBuddy is not open. Open WorkBuddy, then press Control V and Enter. The task is copied.');
  else if (sent === 'nofocus') speak('I could not switch to WorkBuddy. Switch to it, then press Control V and Enter. The task is copied.');
  await follow(h.id);
})().catch(e => { log(e); speak('Something went wrong in HireBuddy Voice.'); });
