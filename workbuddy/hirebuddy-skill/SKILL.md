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
Preferred: call the MCP tool `hirebuddy_run` with `{"prompt": "<the user's words>"}`.

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

## Step-by-step mode
When you want to drive the plan yourself, the MCP server also exposes `hirebuddy_check_minimum_wage`, `hirebuddy_publish_job`, `hirebuddy_find_candidates`, `hirebuddy_screen_candidates`, `hirebuddy_verify_screening`, `hirebuddy_schedule_interviews`, `hirebuddy_send_email` and `hirebuddy_verify_hiring_outcome`. For students it exposes `hirebuddy_register_student`, `hirebuddy_search_jobs`, `hirebuddy_apply_to_job` and `hirebuddy_verify_applications`. Always finish with the matching verify tool.
