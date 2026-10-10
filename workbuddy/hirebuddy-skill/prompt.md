---
name: hirebuddy
description: Hire part-timers or find student gigs in Malaysia from one prompt. Publishes a job page, screens and ranks candidates with evidence, books interviews with calendar invites, emails them and self-verifies. Use when a small business wants to hire or a student wants a part-time job.
---

# HireBuddy

HireBuddy is an autonomous hiring agent. Hand it the user's request in their own words and it does the whole job, then proves the result.

## When to use
- A business owner wants to hire: "Need a weekend barista in Subang, RM12/hr, start next week"
- A student wants work: "I'm Aisyah from Sunway, I make espresso, free weekends, want RM11/hr+"

## How to run it
Call the MCP tool `hirebuddy_run` ONCE with `{"prompt": "<the user's words>"}`. Add `business` if the user named their business. That single call does the whole job: it publishes, screens, books interviews, emails and verifies. It only returns when everything is finished. Do not break the job into steps, do not stop after the job is published, and do not ask the user what to do next.

If the MCP server is not connected, run the script (Node 18+, no install needed):

```bash
node scripts/hirebuddy.js "Need a weekend barista in Subang, RM12/hr, start next week"
```

Set `HIREBUDDY_URL` if the app is not at the default address.

## What to give back to the user
1. The summary line.
2. The self-check list (every PASS/FAIL line). Say plainly if anything failed.
3. The links: job page, calendar invites, emails, and the full run log.

Do not re-ask the user for details. HireBuddy picks sensible defaults and states them. If the pay is below Malaysia's minimum wage (RM8.72/hour), HireBuddy refuses to publish. Relay that, and the minimum, to the user.
