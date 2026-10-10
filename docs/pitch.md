# HireBuddy pitch: 3 minutes + 2 minutes Q&A

About 380 spoken words. Most of the time goes to the live demo.

## Before going on stage

- Open https://hirebuddy-k543.onrender.com 5 minutes early (the free tier sleeps when idle).
- Have WorkBuddy open with Nadia's sentence ready to paste.
- Keep a screen recording of the demo as a backup if WorkBuddy or the network is slow.
- Check the live site is on the latest commit (Render dashboard).

## Script (3:00)

### Slide 1: The problem (0:00–0:30)

> In Malaysia, a blind job seeker has to do something sighted people never think about. Before applying, they check whether the office is reachable without driving, whether the software works with a screen reader, and whether the interview will be in a format they can use. Every job board leaves that work to them. HireBuddy is an agent that does all of it, from one sentence.

### Slide 2: One prompt (0:30–0:50)

On the slide:

> *"I'm Nadia Rahim. I'm blind and use NVDA. I live in Subang Jaya and take the LRT. I did customer service calls at a bank hotline for a year and type fast in English and Malay. Free weekdays 9am to 5pm, at least RM12 an hour, phone interviews please."*

> This is Nadia. She's blind, uses NVDA, takes the LRT, and wants at least RM12 an hour. That's everything she types. She doesn't answer any more questions.

### Live demo in WorkBuddy (0:50–2:10)

Run `hirebuddy_run` with her sentence. Narrate while it works:

> It plans a checklist, and each step names its tool. It checks every job against the law, RM8.72 an hour, and against her needs: walking distance from a station, screen reader support, no tasks that need sight.
>
> Only 2 jobs suit her, but her goal is 3. So it adapts: it includes a clinic job whose listing doesn't mention screen readers, and it asks the employer about that in the application. It will never lower her pay floor itself. That's her decision.
>
> It applies, books interviews inside both calendars, and emails her in plain text with the time on line one.
>
> And it can't finish until every check passes. Here, 25 of 25.

Switch to the web app at `/me` and press **"I can't make it"**:

> If something comes up, one button hands the interview back. It rebooks, emails her and tells the employer.

### Slide 3: Why it's an agent (2:10–2:40)

On the slide: Goal → Plan → Tools → Verify → Fix → Deliver.

> Every tool returns either a result or a list of specific problems, and the agent fixes those and tries again. It runs on an LLM, or on a rule-based planner when no model is available, judged by the same checks. In WorkBuddy, the MCP tool only returns once everything is verified, so it can't stop halfway.

### Slide 4: Proof and close (2:40–3:00)

On the slide: 0 WCAG 2.2 AA violations · refuses illegal pay · 25/25 checks · repo and live app links.

> No WCAG 2.2 AA violations on any page. It refuses illegal pay from both sides. One sentence in, three interviews booked and verified. HireBuddy: work that gets done.

### Slide 5: Links (for Q&A)

- GitHub: https://github.com/Josan88/job-buddy
- Live app: https://hirebuddy-k543.onrender.com

## Q&A (2:00): about 20 seconds per answer

**Are these real jobs?**
Jobs in our own system are seeded demo listings. For JobStreet and other sites, it checks the listing and drafts an application, but it doesn't submit on sites it doesn't control. Next step: employer partners posting directly.

**What if the LLM makes something up?**
The LLM only chooses which tool to call. The tools are deterministic and the finish gate checks every result. We fixed a case where it invented an area, and now it's checked.

**Why WorkBuddy and not just your app?**
WorkBuddy is where the user already works. Our Skill and MCP let it do the whole job end to end, not just chat about it.

**How do you know it works for blind users?**
Built to NVDA and keyboard-only patterns, axe-core in tests, polite live-region updates per step. Next we'd test with users through groups like MAB, the Malaysian Association for the Blind. (Only say you've tested with real users if you have.)

**Privacy and disability disclosure?**
Her needs go to the employer only as interview arrangements, such as "send documents as Word or plain text." (Check the code shares exactly that before you say it.)

**What if no job suits her?**
It stops, says what came closest and why, and tells her what changing her pay floor or walking limit would add. The choice stays hers.

**Business model?**
Free for job seekers. Employers pay per verified, booked interview. It also helps companies show they're hiring inclusively.

**Scale beyond blind users?**
The same engine already runs student and employer flows. Accessibility needs are just constraints the planner respects.
