# HireBuddy

**Describe the work you want in one sentence. HireBuddy finds suitable jobs, checks them, and lets you choose where to apply.**

HireBuddy is a job agent designed first for blind and low-vision job seekers in Malaysia. It works with WorkBuddy and also includes an accessible web app.

**Live app:** https://hirebuddy-k543.onrender.com

The free server may take about one minute to wake up.

## WorkBuddy setup

### Requirements

- WorkBuddy
- Node.js 20 or newer
- This repository downloaded to the same computer

### 1. Generate the WorkBuddy MCP configuration

From the repository folder, run:

```bash
node workbuddy/setup.js
```

The script checks the live HireBuddy service and creates:

```text
workbuddy/mcp_servers.local.json
```

### 2. Add HireBuddy to WorkBuddy

Copy the JSON printed by the setup script into WorkBuddy's MCP server settings. It's in Experts.Skills.Connect - Connectors - Custom connectors - Add MCP. It will look like this, with the correct path for your computer:

```json
{
  "mcpServers": {
    "hirebuddy": {
      "command": "node",
      "args": ["/absolute/path/to/job-buddy/workbuddy/hirebuddy-mcp.js"],
      "env": {
        "HIREBUDDY_URL": "https://hirebuddy-k543.onrender.com"
      }
    }
  }
}
```

Restart WorkBuddy after saving the configuration.

### 3. Import the HireBuddy skill

In WorkBuddy's Skills panel, import this folder:

```text
workbuddy/hirebuddy-skill
```

### 4. Test it

Send this prompt in WorkBuddy:

> I'm Nadia Rahim. I'm blind and use NVDA. I live in Subang Jaya and take the LRT. I did customer service calls for a year and type fast in English and Malay. I am free weekdays from 9am to 5pm and need at least RM12 an hour. Check JobStreet and Indeed too.

On the first run, approve the HireBuddy tools and choose **Always allow** when WorkBuddy asks. Keep **Default Permissions** enabled.

If WorkBuddy does not support MCP settings, ask it to run the fallback command printed by `node workbuddy/setup.js`.

## Quick web demo

1. Open https://hirebuddy-k543.onrender.com.
2. Enter a job request requirement or choose an example.
3. Select **Find job**.
4. Review the suitable and unsuitable jobs.
5. Use Tab to focus a suitable job card and press Enter to choose it.

A search does not send an application. The user must select and confirm a job first.

## What HireBuddy does

From one sentence, HireBuddy:

1. Reads the request and an optional resume.
2. Uses the details that are available without blocking on missing information.
3. Searches for jobs and checks pay, hours, travel, required tasks, and screen-reader support.
4. Explains why each unsuitable job was excluded.
5. Prepares suitable jobs for the user to review.
6. Sends an application only after the user selects a job.
7. Verifies its work before showing the result.

HireBuddy does not automatically book interviews, send interview invitations, or create interview reminders.

## Verification checks

HireBuddy shows the result as **X of Y checks passed**. The total changes with the type of request.

Every job-seeker search checks that:

1. The job seeker's profile was saved.
2. The job search completed successfully.

When WorkBuddy supplies jobs from JobStreet, Indeed, Hiredly, or Maukerja, HireBuddy also checks that:

3. Every supplied job was checked.
4. No recommended job is below the legal minimum wage, below the user's pay requirement, or requires sight.
5. Every job worth asking about has an application draft containing its unanswered questions.
6. Every draft asks about screen-reader support unless the listing already mentions it.
7. Nothing was sent automatically to employers on other sites.

For an employer request, HireBuddy checks that:

1. The published job page is live and shows the correct title.
2. The pay meets the legal minimum wage.
3. Candidate scores were recalculated and every evidence quote matches the candidate's profile word for word.

HireBuddy cannot finish a run unless its final verification passes.

## Accessibility

- Full keyboard operation with clear focus indicators
- Screen-reader landmarks, headings, labels, and live status updates
- High-contrast colours, dark mode, and adjustable text size
- Progress tones and a completion sound
- Results written to be easy to hear
- Status shown in words, not colour alone

## Run locally

```bash
npm install
node server.js
```

Open http://localhost:3000.

Run the application hand-off tests with:

```bash
npm run test:application
```

All environment variables are optional:

| Variable | Purpose |
|---|---|
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | Use an OpenAI-compatible model instead of the built-in rule-based planner |
| `BREVO_API_KEY`, `DEMO_INBOX` | Send demo email through Brevo |
| `RESEND_API_KEY` | Use Resend as the email provider |
| `PUBLIC_URL` | Set the public base URL |
| `RESET_TOKEN` | Protect the reset endpoint |
| `DATA_DIR` | Choose where `db.json` is stored |

## Deploy on Render

1. Fork or push this repository to GitHub.
2. In Render, select **New**, then **Blueprint**.
3. Select the repository. Render reads `render.yaml` and deploys the app.
4. Optionally add the LLM or email environment variables above.

## Optional: enable application sending through Telegram

This connects a selected job in the web app to WorkBuddy. Skip this section if you only want to judge job searching and checking.

1. In Telegram, message **@BotFather** and run `/newbot`.
2. Run `/setjoingroups` for the new bot and choose **Disable**.
3. In WorkBuddy, open **Assistant Settings**, then **Channels**, then **Telegram**. Add the bot token and save it.
4. Visit [my.telegram.org](https://my.telegram.org), open **API development tools**, and create an API ID and API hash. Use a separate Telegram account for the hand-off.
5. From this repository, run `npm install`, followed by `node workbuddy/telegram-login.js`.
6. Follow the prompts. The script prints five environment variables.
7. Add those variables to the HireBuddy service in Render:
   - `WORKBUDDY_TELEGRAM_BOT`
   - `TELEGRAM_API_ID`
   - `TELEGRAM_API_HASH`
   - `TELEGRAM_SESSION`
   - `TELEGRAM_HANDOFF_KEY`
8. After Render redeploys, open the HireBuddy home page and pair the browser with `TELEGRAM_HANDOFF_KEY`.

Keep `TELEGRAM_SESSION`, `TELEGRAM_HANDOFF_KEY`, and the bot token secret. If the bot token leaks, revoke it through BotFather with `/revoke`.

## How it works

```text
WorkBuddy ---- Skill / MCP ----> HireBuddy agent ----> tools and checks
Web app  ---- REST / events --->       |
                                         +--> job and applicant data
                                         +--> application hand-off
                                         +--> verification results
```

- `src/agent.js` runs the planning loop. It uses an OpenAI-compatible model when configured and a rule-based planner otherwise.
- `src/tools.js` contains deterministic tools. Each tool returns a result or specific problems for the agent to fix.
- `src/lib.js` scores skills, availability, distance, experience, and pay.
- `src/mcp.js` exposes HireBuddy to WorkBuddy through MCP.
- `workbuddy/hirebuddy-mcp.js` is the local bridge to the hosted MCP service.
- `workbuddy/hirebuddy-skill/` tells WorkBuddy when and how to use HireBuddy.

For job seekers, WorkBuddy can search JobStreet, Indeed, Hiredly, or Maukerja and pass the listings to HireBuddy. HireBuddy checks those listings and prepares application drafts. It does not submit anything until the user selects a supported job card.

Every WorkBuddy run appears in the web app under **Recent runs** with the label **via WorkBuddy/MCP**.

## Application flow and troubleshooting

On **Jobs** or **My details**, focus a suitable job card with Tab and press Enter. HireBuddy sends the selected application request to WorkBuddy through the paired Telegram connection. WorkBuddy reports whether email delivery succeeded.

The demo sends application emails only to the configured demo inbox. The original employer email remains in the subject and application details; it is not used as the delivery address.

Open **Application debug console** at the bottom of the page to see hand-off events:

- `403`: pair the browser on the home page.
- `502`: Telegram returned an error.
- `503`: Telegram is not configured on the server.

Run `npm run test:application` to test keyboard activation, Telegram hand-off, recipient handling, and duplicate protection with a mocked connection.

## Demo data

The project contains 12 fictional job seekers and 9 fictional open jobs. Their roles, locations, pay, and shifts are modelled on Klang Valley part-time listings reviewed on 10 October 2026. Seeded email addresses use `example.com` and are never delivered.

See [docs/demo-data.md](docs/demo-data.md) for the data and sources.

## License

MIT
