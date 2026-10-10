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
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// Run a PowerShell snippet. Values go in through environment variables, never pasted into the code.
function ps(script, env = {}) {
  if (process.platform !== 'win32') { log('[powershell skipped: not Windows]', Object.values(env).join(' | ')); return { stdout: '', status: 0 }; }
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { env: { ...process.env, ...env }, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return { stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim(), status: r.status };
}

const speak = text => {
  log('SAY:', text);
  ps(`Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = 1; $s.Speak($env:HB_TEXT)`, { HB_TEXT: text });
};

// Windows speech recognition, phrase by phrase, until about three seconds of silence.
function listen() {
  const r = ps(`
$ErrorActionPreference = 'Stop'
try {
  Add-Type -AssemblyName System.Speech
  $r = New-Object System.Speech.Recognition.SpeechRecognitionEngine
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
} catch { Write-Output '' }`);
  return r.stdout;
}

// A standard Windows input box: screen readers read its label and text field.
const askTyped = prompt => ps(`Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.Interaction]::InputBox($env:HB_TEXT, 'HireBuddy Voice', '')`, { HB_TEXT: prompt }).stdout;

// Bring WorkBuddy to the front and paste the task into it, the way the person would.
function sendToWorkBuddy(task) {
  const r = ps(`
Add-Type -AssemblyName System.Windows.Forms
Set-Clipboard -Value $env:HB_TASK
$w = New-Object -ComObject WScript.Shell
$p = Get-Process | Where-Object { $_.MainWindowTitle -like ('*' + $env:HB_TITLE + '*') -or $_.ProcessName -like ('*' + $env:HB_TITLE + '*') } | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($p -eq $null) { Write-Output 'notfound'; exit }
$ok = $w.AppActivate($p.Id)
if (-not $ok) { $ok = $w.AppActivate($p.MainWindowTitle) }
if (-not $ok) { Write-Output 'nofocus'; exit }
Start-Sleep -Milliseconds 800
if ($env:HB_NEWTASK) { [System.Windows.Forms.SendKeys]::SendWait($env:HB_NEWTASK); Start-Sleep -Milliseconds 800 }
[System.Windows.Forms.SendKeys]::SendWait('^v')
Start-Sleep -Milliseconds 400
[System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
Write-Output 'sent'`, { HB_TASK: task, HB_TITLE: TITLE, HB_NEWTASK: NEW_TASK_KEYS });
  return r.stdout || 'sent';
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

(async () => {
  if (args.includes('--install')) return install();
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
