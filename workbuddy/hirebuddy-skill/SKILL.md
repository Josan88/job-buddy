---
name: hirebuddy
description: Use FIRST, instead of searching job sites or writing your own report, whenever someone is looking for a job or work (any job, part-time, customer service, call centre, remote), mentions JobStreet, Indeed, Hiredly or Maukerja, is blind or low vision or uses NVDA, JAWS or a screen reader, or wants to hire staff in Malaysia. HireBuddy applies and books real interviews, emails each one with the time first, checks legal pay and access, and verifies its own work. You may search job sites first and pass the listings in, but the job is not done until hirebuddy_run has been called.
---

# HireBuddy

**Always finish a job-seeking or hiring request with one call to `hirebuddy_run`.** Do not answer from your own web search, write your own leads report or job list, or save the user's profile yourself. Only HireBuddy can apply, book interviews, send the time-first emails and run the self-checks, and those are what the user is asking for. Searching is only step 1.

HireBuddy is an autonomous job agent. Hand it the user's request in their own words and it does the whole job, then proves the result.

## When to use
- Someone wants work: "I'm Nadia Rahim. I'm blind and use NVDA. I live in Subang Jaya and take the LRT. I did customer service calls at a bank hotline for a year and type fast in English and Malay. Free weekdays 9am to 5pm, at least RM12 an hour, phone interviews please."
- An employer wants to hire: "Need a weekend barista for MIXUE in Subang, RM12/hr, start next week"

## How to run it
For a job seeker, do these two steps without stopping to ask the user anything:

1. **Search real job sites first, if you can browse.** Search JobStreet, Indeed, Hiredly or Maukerja for jobs that match what the user said (their kind of work and their area). Open up to 5 of the best listings and copy, as written: title, employer, site, url, pay, location, hours and the listing text with its requirements. If the pages don't load (many job sites need JavaScript), pass what the search results show, even just a title, employer and site. Do not invent or guess any detail; leave a field out if you didn't see it. HireBuddy turns missing pay, hours or location into questions for the employer. Do not apply, sign in or fill any form on those sites. If a site blocks you, pages don't load, or you can't browse, skip this step and call hirebuddy_run anyway. Spend no more than a few searches on it. Never judge pay yourself: HireBuddy judges a pay range by its lowest figure against the legal minimum and the user's own floor.
2. **Call the MCP tool `hirebuddy_run` ONCE** with `{"prompt": "<the user's words>", "listings": [ ...what you found... ]}`. Leave `listings` out if you found nothing.

That single call does the whole job and only returns when everything is finished and checked. HireBuddy books interviews for jobs on HireBuddy, and checks every job you found the same way (legal pay, the user's pay floor, tasks that need sight, screen reader support, hours, travel). For each one worth asking about it drafts an application with the questions the listing leaves open. It cannot apply on other sites, so nothing is sent there. Do not break the job into steps and do not ask the user what to do next.

For an employer, skip step 1 and call `hirebuddy_run` with just the prompt.

If the MCP server is not connected, run the script (Node 18+, no install needed):

```bash
node scripts/hirebuddy.js "<the user's words>"
# with jobs you found on other sites, saved as a JSON array:
node scripts/hirebuddy.js --listings found.json "<the user's words>"
```

Set `HIREBUDDY_URL` if the app is not at the default address.

## What to give back to the user
The user may be listening with a screen reader. Answer in short plain sentences, most important first. No tables, no emoji, no long lists of links.
1. The summary: how many interviews, then one line each with the job, employer, day and time, and how to join.
2. Jobs from other sites: which are worth asking about (the application is drafted, not sent) and which don't suit and why, one sentence each. Offer to read a drafted application aloud.
3. Any decision HireBuddy made and why, in one sentence each.
4. How many self-checks passed. Say plainly if anything failed.
5. One link: the run log.

Do not re-ask the user for details. HireBuddy picks sensible defaults and states them. It never applies to a job paying below Malaysia's minimum wage (RM8.72 an hour) or to one with tasks that need sight, and it refuses to publish an underpaid job for an employer. Relay that to the user.
