# HireBuddy Voice (Windows)

Press **Ctrl+Alt+H** anywhere and say the work you want. HireBuddy Voice:

1. Listens with Windows speech recognition. If none is set up, or nothing was heard, it opens a typing box instead.
2. Hands your sentence to **WorkBuddy**: it brings WorkBuddy to the front, pastes the task and presses Enter, the way you would. WorkBuddy then does the job with the HireBuddy Skill.
3. Reads WorkBuddy's progress and the result aloud while you do other things.

It acts only when you press its hotkey on this computer, and it never runs the job itself. It needs Node 18+ and the HireBuddy Skill set up in WorkBuddy.

```bat
cd job-buddy
node workbuddy\voice\voice.js --install
```

That adds a "HireBuddy Voice" Start menu shortcut with the Ctrl+Alt+H hotkey. Other options:

- `node workbuddy\voice\voice.js --type` lets you type instead of speaking.
- `node workbuddy\voice\voice.js --say "..."` uses the given sentence.
- `node workbuddy\voice\voice.js --test` checks speech, the speech recognizer, the WorkBuddy window and the Ctrl+Alt+H shortcut, and prints what fails. Each run also writes a log to `%TEMP%\hirebuddy-voice.log`.

**Settings (optional):** create `workbuddy/voice/hirebuddy-voice.json` with:
- `url`: the HireBuddy address.
- `windowTitle`: the WorkBuddy window title (default "WorkBuddy").
- `newTaskKeys`: SendKeys codes to open a new task, if WorkBuddy needs them, e.g. `"^n"`.

**If WorkBuddy doesn't come to the front:** HireBuddy Voice says so. The task is already copied, so switch to WorkBuddy, press Ctrl+V, then Enter.

## Bridge: "Hand it to WorkBuddy" without Alt+Tab

Run `node workbuddy\voice\voice.js --bridge` and leave that window open. Then "Hand it to WorkBuddy" on the HireBuddy page (or Alt+V, "Hand it to WorkBuddy") opens a Windows box: "Send this to WorkBuddy?" with her sentence. Enter sends it. The bridge brings WorkBuddy to the front, pastes the task and presses Enter, and the page reads out each step.

- It listens on 127.0.0.1:47321 only, and only HireBuddy's own pages may call it (the browser's Origin header).
- The page sends only a handoff code; the bridge fetches the task from HireBuddy, never text from the page.
- Nothing reaches WorkBuddy until the person at the computer presses Yes.
- Chrome or Edge may ask once to let the site reach "apps on this device": press Allow.
- If the browser is paired for Telegram (see "through Telegram" in the main README), HireBuddy's server sends the task instead and the page doesn't call the bridge.
- Without the bridge, the page falls back to "Copied. Press Alt Tab to WorkBuddy, Control V, then Enter."
