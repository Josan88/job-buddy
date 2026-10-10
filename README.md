# HireBuddy

**One prompt. The hiring gets done.**

HireBuddy is an autonomous hiring agent for Malaysian small businesses and the students who want their part-time gigs. It runs inside **WorkBuddy** (as a Skill and an MCP server) and as a standalone web app that shows every step live.

> *"Need a weekend barista in Subang, RM12/hr, start next week"*

From that one line, with no further guidance, HireBuddy:

1. **Plans** the job as a checklist, where each step names the tool that completes it.
2. **Checks the pay is legal** under Malaysia's Minimum Wages Order 2024 (RM8.72/hour). If it isn't, the agent refuses to publish.
3. **Publishes a live job page** with an apply form, then fetches the page back to prove it is up.
4. **Finds candidates** in the student talent pool by distance, plus anyone who applied on the page.
5. **Screens and ranks** every candidate out of 100. Every skill point quotes the candidate's own words.
6. **Self-checks the ranking.** It recomputes each score independently and confirms every quote appears word for word, so no qualification is invented.
7. **Books interviews** that fit both the owner's hours and each candidate's free time, with no clashes. Each interview gets its own Jitsi Meet video room and a real calendar invitation that shows Accept / Decline in Gmail or Outlook.
8. **Emails each candidate** their time, the job link and the invite.
9. **Verifies the whole outcome.** It checks the page is live and the pay is legal. It checks every slot sits inside the candidate's availability with no overlaps, downloads every `.ics` and compares its times with the booking, and confirms every email carries the right time and link.
10. **Delivers** a summary with links. It is **not allowed to finish** until the final verification passes.

Students get the same engine from the other side:

> *"I'm Aisyah from Sunway University, I make espresso and do latte art, free weekends 8am-2pm, want at least RM11/hr."*

The agent builds her profile and ranks the open gigs. It **skips jobs that pay below minimum wage**, applies to the best legal matches with a personal cover note, notifies each business, and verifies each application landed on the job's record.

## Who it's for

| User | Problem | What HireBuddy delivers |
|---|---|---|
| Small business owner (cafe, bakery, tuition centre) with no HR staff | Hiring a part-timer takes hours of posting, reading messages and juggling schedules | A live job post, a ranked shortlist with evidence, interviews booked in calendars and emails sent, all checked |
| University student | Finding legal, nearby gigs that fit around classes | A talent-pool profile and applications to well-matched, legally paid jobs |

## Try it

**Live app: https://hirebuddy-k543.onrender.com** (free tier, so the first load after idle can take about a minute)

- **Web app:** type a prompt on the home page, or click an example, and watch the plan, tool calls, self-fixes and checks stream in live.
- **My page (`/me`):** pick who you are, with no password. A student sees open jobs and their own applications with a live status (applied, interview booked, not selected). A business owner sees only the jobs they published, with the interviews the agent booked.
- **From WorkBuddy:** see [WorkBuddy setup](#workbuddy-setup).
- **From a terminal:** `node workbuddy/hirebuddy-skill/scripts/hirebuddy.js "Need a weekend barista in Subang, RM12/hr"`

## Architecture

```
WorkBuddy ──(Skill / MCP)──┐
                           ▼
Web console ──REST/SSE──▶ Agent ──▶ Tools ──▶ store (jobs, students, applications, interviews, emails, runs)
                           │          │
                    LLM planner or    ├─ public job pages + apply form
                    rule autopilot    ├─ .ics calendar files
                                      ├─ email (Resend) / outbox
                                      └─ HTTP self-checks against its own public URLs
```

- **Agent** (`src/agent.js`): with `LLM_API_KEY` set, an OpenAI-compatible model (OpenAI, DeepSeek, Groq, Tencent Hunyuan…) plans and calls tools in a loop. It has a stuck-loop guard and a finish gate. Without a key, a rule-based **autopilot** drives the same tools, so the demo never depends on a network call to a model.
- **Tools** (`src/tools.js`): deterministic and auditable. Each returns either a result or a list of specific `problems`, and the agent fixes those and retries. The timeline shows each fix as "Caught a problem, fixing it".
- **Scoring** (`src/lib.js`): must-have skills 35, nice-to-have 5, shift-availability overlap 25, distance 15 (Haversine over Klang Valley areas), experience 15, pay fit 5.
- **MCP server** (`src/mcp.js`): Streamable HTTP at `/mcp`. By default it exposes only `hirebuddy_run` (the whole job from one prompt, returning only when it is verified) plus two read tools. That way a client's model can't stop halfway. Add `?tools=all` to the URL, or set `HIREBUDDY_MCP_TOOLS=all` for the bridge, to expose every step tool as well.
- **No dependencies.** Plain Node 20+, so it deploys anywhere in seconds.

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

**B. Skill.** Import `workbuddy/hirebuddy-skill/` (which contains `SKILL.md`, `skill.yaml` and `scripts/hirebuddy.js`) through WorkBuddy's Skills panel. The skill tells WorkBuddy when to use HireBuddy, how to call it (MCP, or the script as a fallback), and what to report back.

Every run started from WorkBuddy also appears in the web app's **Recent runs**, labelled "via WorkBuddy/MCP".

## Demo data

The talent pool holds 12 fictional students. The 9 open gigs use made-up shop names, but their role, area, pay and shifts are **modelled on real Klang Valley part-time listings** read on 10 Oct 2026. That includes a weekend cashier at RM55/day, which is below the legal daily minimum, just like a real listing we found. See [docs/demo-data.md](docs/demo-data.md) for the table and sources. All seeded emails use `example.com` and are never delivered.

## License

MIT
