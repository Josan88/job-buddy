---
name: hirebuddy
description: Find work for blind and low-vision job seekers in Malaysia from one sentence. Checks every job for legal pay and access (remote or near a stop, screen reader support, no tasks that need sight), applies, books interviews in their preferred format, emails each one with the time first, and self-verifies. Also hires for employers. Use whenever someone wants a job or wants to hire.
---

# HireBuddy

HireBuddy is an autonomous job agent. Hand it the user's request in their own words and it does the whole job, then proves the result.

## When to use
- Someone wants work: "I'm Nadia Rahim. I'm blind and use NVDA. I live in Subang Jaya and take the LRT. I did customer service calls at a bank hotline for a year and type fast in English and Malay. Free weekdays 9am to 5pm, at least RM12 an hour, phone interviews please."
- An employer wants to hire: "Need a weekend barista for MIXUE in Subang, RM12/hr, start next week"

## How to run it
Call the MCP tool `hirebuddy_run` ONCE with `{"prompt": "<the user's words>"}`. That single call does the whole job and only returns when everything is finished and checked. Do not break the job into steps and do not ask the user what to do next.

If the MCP server is not connected, run the script (Node 18+, no install needed):

```bash
node scripts/hirebuddy.js "<the user's words>"
```

Set `HIREBUDDY_URL` if the app is not at the default address.

## What to give back to the user
The user may be listening with a screen reader. Answer in short plain sentences, most important first. No tables, no emoji, no long lists of links.
1. The summary: how many interviews, then one line each with the job, employer, day and time, and how to join.
2. Any decision HireBuddy made and why, in one sentence each.
3. How many self-checks passed. Say plainly if anything failed.
4. One link: the run log.

Do not re-ask the user for details. HireBuddy picks sensible defaults and states them. It never applies to a job paying below Malaysia's minimum wage (RM8.72 an hour) or to one with tasks that need sight, and it refuses to publish an underpaid job for an employer. Relay that to the user.
