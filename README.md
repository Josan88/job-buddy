# HireBuddy

**Say the work you want in one sentence. HireBuddy finds jobs that suit you, checks them, and helps you choose where to apply.**

HireBuddy is an autonomous job agent built first for **blind and low-vision job seekers in Malaysia**. It runs inside **WorkBuddy** (as an MCP server and a Skill) and as a web app that works fully with a screen reader and a keyboard alone.

> *"I'm Nadia Rahim. I'm blind and use NVDA. I live in Subang Jaya and take the LRT. I did customer service calls at a bank hotline for a year and type fast in English and Malay. Free weekdays 9am to 5pm, at least RM12 an hour."*

From that one sentence, with no further questions, HireBuddy:

1. **Plans** the work as a checklist, where each step names the tool that completes it.
2. **Saves her profile and needs**: blind, uses NVDA, up to a 10-minute walk from a stop, and at least RM12 an hour.
3. **Checks every open job** against the law (Minimum Wages Order 2024, RM8.72 an hour) and against her needs: remote or a short walk from a train or bus stop, screen reader support, suitable working hours, and no tasks that require sight (for example riding a motorcycle). It says why each unsuitable job is left out.
4. **Prepares applications without sending them automatically.** Suitable jobs appear as keyboard-focusable cards so she can choose one herself.
5. **Sends only the selected application.** Pressing Enter on a job card asks WorkBuddy through Telegram to email the application to the configured demo inbox. WorkBuddy reports whether it was actually delivered.
6. **Verifies the search and application preparation** before it can finish, then gives a concise result designed to be heard.

HireBuddy does **not** book interviews, send interview invitations, or create interview reminders.

## What makes it an agent, not a button

- **It adapts toward a goal.** The goal is to find suitable jobs without giving up anything the person asked for. When too few jobs suit her, it evaluates safe ways to widen the search and records the reason for its choice. It never lowers her pay floor or walking limit by itself.
- **The user stays in control of applications.** A search never submits applications. The user reviews the suitable jobs, focuses a job card with Tab, and presses Enter only on the job they want WorkBuddy to send.
- **It refuses illegal pay** from both sides: it never applies to an underpaid job, and an employer who types "RM55 a day, 8-hour shifts" is refused before anything is published.
- **With `LLM_API_KEY`** the model makes these choices itself, judged by the same tools and checks. Without a key, the rule-based planner runs the same loop.

## Built for screen readers and low vision

- Skip link, landmarks and a clear heading structure on every page; the current page is announced in the menu.
- While the agent works, one polite live-region update per step and a quiet periodic tone indicate that processing is still underway. When it finishes, a distinct chime plays and focus moves to the result.
- Keyboard only throughout, with a thick yellow focus ring. Buttons are at least 48 pixels high.
- AAA-contrast colours, Atkinson Hyperlegible (the Braille Institute's typeface for low vision), a remembered text-size control (up to 150%), dark mode, reduced motion respected.
- Status always in words ("Suits you", "Not suitable", "Passed"), never colour alone. Tables have captions and header cells.
- The completed result is read automatically, including the Tab-and-Enter instructions when application cards are available. "Speak instead" takes the person's introduction by voice where the browser supports it (press Enter to stop).
- Automated check: axe-core reports 0 WCAG 2.2 AA violations on every page, in light and dark mode, on desktop and phone widths.

## Try it

**Live app: https://hirebuddy-k543.onrender.com** (free tier, so the first load after idle can take about a minute)

- **Web app:** type a sentence on the home page, or pick an example.
- **My details (`/me`):** pick who you are, with no password (switch person from the Demo menu). A job seeker can edit how they describe themselves, upload a resume, review application status, and see which jobs suit them and why others do not. An employer sees their jobs and applicants.
- **Demo menu:** Jobs, Emails and How it works are demo pages, folded into the menu in the header.
- **From WorkBuddy:** see [WorkBuddy setup](#workbuddy-setup).
- **From a terminal:** `node workbuddy/hirebuddy-skill/scripts/hirebuddy.js "<your sentence>"`

The employer side still works too: `Need a weekend barista for MIXUE in Subang, RM12/hr, start next week` publishes the job and screens candidates with quoted evidence; `Need 3 weekend baristas in Cyberjaya, must have latte art and Mandarin, RM13/hr` shows it widening the search and relaxing a requirement.

## Architecture

```
WorkBuddy ──(Skill / MCP)──┐
                           ▼
Web console ──REST/SSE──▶ Agent ──▶ Tools ──▶ store (jobs, students, applications, emails, runs)
                           │          │
                    LLM planner or    ├─ public job pages + apply form
                    rule autopilot    ├─ email (Resend) / outbox
                                      └─ HTTP self-checks against its own public URLs
```

- **Agent** (`src/agent.js`): with `LLM_API_KEY` set, an OpenAI-compatible model (OpenAI, DeepSeek, Groq, Tencent Hunyuan…) plans and calls tools in a loop. It has a stuck-loop guard and a finish gate. Without a key, a rule-based **autopilot** drives the same tools, so the demo never depends on a network call to a model.
- **Tools** (`src/tools.js`): deterministic and auditable. Each returns either a result or a list of specific `problems`, and the agent fixes those and retries before presenting the verified result.
- **Scoring** (`src/lib.js`): must-have skills 35, nice-to-have 5, shift-availability overlap 25, distance 15 (Haversine over Klang Valley areas), experience 15, pay fit 5.
- **MCP server** (`src/mcp.js`): Streamable HTTP at `/mcp`. By default it exposes only `hirebuddy_run` (the whole job from one prompt, returning only when it is verified) plus two read tools. That way a client's model can't stop halfway. Add `?tools=all` to the URL, or set `HIREBUDDY_MCP_TOOLS=all` for the bridge, to expose every step tool as well.
- **One optional dependency.** Plain Node 20+. The Telegram client (`telegram`, gramjs) is loaded only when the Telegram hand-off is set up.

## Run locally

```bash
node server.js          # http://localhost:3000
npm test                # boots a fresh server and runs the hirer, illegal-wage, student and tutor flows plus MCP
```

Environment variables (all optional):

| Var | Purpose |
|---|---|
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Any OpenAI-compatible chat API. Default base `https://api.openai.com/v1`, model `gpt-4o-mini` |
| `BREVO_API_KEY`, `DEMO_INBOX` | Send real email through Brevo's free plan. Real mail **only** goes to inboxes you control: demo candidates are delivered to `DEMO_INBOX` with a +tag (`you+aina@gmail.com`), and anything else stays in the outbox. `MAIL_ALLOW` adds more addresses. `MAIL_FROM` defaults to `DEMO_INBOX` |
| `RESEND_API_KEY` | Alternative provider (without your own domain it only reaches your signup email) |
| `PUBLIC_URL` | Public base URL (auto-detected on Render) |
| `RESET_TOKEN` | Protects `POST /api/reset?token=…` |
| `DATA_DIR` | Where `db.json` lives |

## Deploy (Render, free)

1. Fork or push this repo to GitHub.
2. On Render, choose **New → Blueprint** and select the repo. `render.yaml` sets everything up.
3. Optional: add `LLM_API_KEY` (and `LLM_BASE_URL` / `LLM_MODEL` for a non-OpenAI provider) in the service's Environment tab.

## WorkBuddy setup

WorkBuddy is Tencent's desktop AI agent. HireBuddy plugs into it in two ways:

**Quickest:** from the repo root run `node workbuddy/setup.js`. It checks the live app, then prints the MCP entry below with your machine's path filled in, ready to paste.

**A. MCP server (recommended).** Add HireBuddy to WorkBuddy's MCP servers (`mcp_servers.json` in WorkBuddy's config directory; see `workbuddy/mcp_servers.json`):

```json
{
  "mcpServers": {
    "hirebuddy": {
      "command": "node",
      "args": ["/path/to/hirebuddy/workbuddy/hirebuddy-mcp.js"],
      "env": { "HIREBUDDY_URL": "https://hirebuddy-k543.onrender.com" }
    }
  }
}
```

`hirebuddy-mcp.js` is a zero-dependency stdio-to-HTTP bridge. Clients that support remote MCP can point straight at `https://hirebuddy-k543.onrender.com/mcp`. Restart WorkBuddy, then type the one prompt. WorkBuddy calls `hirebuddy_run` and shows the verified result, the self-checks and the links.

**WorkBuddy runs the steps.** For a job seeker the Skill has WorkBuddy run the job itself: it searches job sites, then calls `hirebuddy_1_understand`, `hirebuddy_2_check_jobs`, the legacy-named `hirebuddy_3_apply_and_book` step, and `hirebuddy_4_verify` in turn. Despite its legacy name, step 3 does not apply or book anything; it prepares suitable jobs for manual selection. When there are fewer than 3 suitable jobs, WorkBuddy chooses how to widen the search, and HireBuddy refuses any option that gives up something the user asked for. At the end it saves the summary and drafted applications on the user's computer. Every step result has a `next` field so the client never stops to ask. `hirebuddy_run` remains the one-call backup and the employer flow.

**Jobs on real sites.** For a job seeker, the Skill tells WorkBuddy to search JobStreet, Indeed, Hiredly or Maukerja on the user's own machine first and pass what it found as `listings` in the same single call. HireBuddy never fetches those sites itself. It checks each listing the same way as its own jobs (legal pay, the seeker's pay floor, tasks that need sight, screen reader support, hours, travel) and drafts an application with the questions the listing leaves open. It does not submit those applications automatically; nothing is sent until the user selects a supported job card. With no listings, the flow is unchanged.

**B. Skill.** Import `workbuddy/hirebuddy-skill/` (which contains `SKILL.md`, `skill.yaml` and `scripts/hirebuddy.js`) through WorkBuddy's Skills panel. The skill tells WorkBuddy when to use HireBuddy, how to call it (MCP, or the script as a fallback), and what to report back.

**C. HireBuddy hands the task to WorkBuddy through Telegram.** WorkBuddy's built-in Assistant channel connects it to a Telegram bot that you own. HireBuddy can't message that bot itself, because Telegram bots never see messages from other bots. So HireBuddy's server sends it as a Telegram *user* account. When you press "Hand it to WorkBuddy" in a paired browser, the server sends the task to the bot, WorkBuddy runs it, and the HireBuddy page follows the run live and announces its progress. Nobody pastes or presses Send. When the result arrives, the page plays a completion chime and reads the result automatically.

1. In Telegram, message **@BotFather**, send `/newbot`, give it a name and a username that is hard to guess (it must end in `bot`), and copy the token it returns.
2. Still in BotFather, send `/setjoingroups`, pick the bot and choose **Disable**, so nobody can add it to a group.
3. In WorkBuddy: **Assistant** (sidebar), then **Assistant Settings**, then **Channels**, then **Telegram**. Paste the token and press **Save**. Keep WorkBuddy open and the computer awake.
4. Do one run at the computer first and choose "Always allow" for the hirebuddy tools. A permission prompt that appears on the computer can't be answered from the phone.
5. Get an **API ID** and **API hash** at [my.telegram.org](https://my.telegram.org) (API development tools), signed in with the account HireBuddy will send from. Use a second number, not your personal account.
6. On your computer, from the repo root: `npm install`, then `node workbuddy/telegram-login.js`. It asks for the API ID and hash, the bot's username, the phone number and the login code Telegram sends. Then it prints five settings, including a random hand-off key.
7. Add those five settings in Render (the HireBuddy service, **Environment**): `WORKBUDDY_TELEGRAM_BOT`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION`, `TELEGRAM_HANDOFF_KEY`. Render redeploys.
8. On the HireBuddy home page, open **Send to WorkBuddy automatically, through Telegram** (under the buttons), type the hand-off key and press **Pair this browser**. The button then reads "Hand it to WorkBuddy on Telegram". Browsers that aren't paired still get copy and paste (or the bridge), so visitors to the public site can't start tasks on your computer.

`TELEGRAM_SESSION` is full access to that Telegram account: keep it only in Render's secret settings. Telegram may limit accounts that look automated, so keep it to real hand-offs (HireBuddy sends at most one every 10 seconds).

Treat the bot token like a password too: anyone who has it, or who finds the bot and messages it, can give WorkBuddy tasks on your computer. If the token leaks, revoke it in BotFather with `/revoke`. See [WorkBuddy's Telegram guide](https://www.workbuddy.ai/docs/workbuddy/Platform-Integration/Telegram-Guide).

Every run started from WorkBuddy also appears in the web app's **Recent runs**, labelled "via WorkBuddy/MCP".

## Demo data

The talent pool holds 12 fictional students. The 9 open gigs use made-up shop names, but their role, area, pay and shifts are **modelled on real Klang Valley part-time listings** read on 10 Oct 2026. That includes a weekend cashier at RM55/day, which is below the legal daily minimum, just like a real listing we found. See [docs/demo-data.md](docs/demo-data.md) for the table and sources. All seeded emails use `example.com` and are never delivered.

## License

MIT

## Keyboard applications through Telegram

On Jobs and My details, use Tab to focus a job card and Enter to request an application through WorkBuddy's Telegram connection. Select your job seeker profile on My details and pair the browser using the Telegram hand-off key on Find work first. The public Jobs page falls back to the fictional Nadia demo profile when no profile has been selected.

Application requests instruct WorkBuddy to send only to `stephanieshinhuiyeo@gmail.com`. The original company email is placed first in the subject and retained in the email body and stored application data, together with the job details, applicant profile, availability, accessibility needs, and resume link when available. A successful Telegram hand-off does not confirm email delivery; WorkBuddy reports the actual send result through Telegram. Failed hand-offs can be retried.

Outside-site jobs in the completed search result also support Tab and Enter. They use the applicant profile belonging to that search. Only listings assessed as worth asking about offer the application action.

Expand **Application debug console** at the bottom of the page after focusing or activating a card. The same events appear in the browser developer console with `[HireBuddy application]`. Server logs include a request ID, response status, recipient and Telegram message length; Telegram logs show acceptance or connection errors. Keys, sessions and application bodies are not logged. A 403 means pair the browser on Find work; a 503 means configure Telegram on the server; a 502 includes the Telegram failure reason. After editing the WorkBuddy skill, copy or reinstall that skill on the WorkBuddy computer so its selected-job instructions are current.

Run `npm run test:application` to check keyboard activation, Telegram hand-off, recipient handling and duplicate protection using a mocked Telegram connection.

For website job-search handoffs, WorkBuddy reviews the prompt and supplied resume for name, age, work experience, education, location and interested position. It requests missing fields through hirebuddy_review_intake; JobBuddy collects typed or spoken answers and returns them under the same handoff for review. Search starts after WorkBuddy confirms all required details, with the existing workflow sequence unchanged. Update the installed HireBuddy skill and refresh its MCP tools to enable the review tool.

Run node test/intake.js to verify review, voice-field entry, stale revisions and the answer round trip. Speech recognition requires browser support and microphone permission; typing remains available.
