# Pitch claim verification: code review

Every factual claim in `pitch.md` checked against the source code on 11 Oct 2026.

## Verified and accurate

| Claim | Where in code | Evidence |
|-------|---------------|----------|
| RM8.72/hr minimum wage | `src/lib.js:113` | `MIN_WAGE = { hour: 8.72, month: 1700, day: 65.38 }`. Calculation: 1700 x 12 / 52 / 45 = 8.72. Source cited: Minimum Wages Order 2024, P.U.(A) 376. |
| Refuses illegal pay (hirer) | `src/tools.js:83-84` (`publish_job`) + `src/agent.js:228-234` | `checkWage` runs before publishing; if below minimum, the job is not posted and the agent stops. Test case "RM8.50 refused" and "RM50-60/day refused" both pass. |
| Refuses illegal pay (seeker) | `src/tools.js:462` (`apply_to_job`) + `src/tools.js:411` (`matchJobs`) | Application is refused if `!wage.ok`. `matchJobs` marks `suitable: false` for illegal pay. |
| 25/25 checks for Nadia | `src/tools.js:557-616` (`verify_applications`) | 2 baseline + 4 checks x 3 applications + 1 overlap + 3 checks x 2 phone interviews + 4 checks x 1 in-person interview (includes transit check) = 25. Test confirms `r.verified` for Nadia. |
| Rule-based planner fallback | `src/agent.js:30,569-581` + `src/llm.js:9-24` + `src/parse.js` | Mode set from `llm.enabled()`. If the LLM fails mid-run, the autopilot planner takes over. `parse.js` provides deterministic prompt understanding. |
| "I can't make it" rescheduling | `public/me.js:56` + `server.js:338-346` + `agent.js:431-469` | Button labelled "I can't make it" calls `/api/interviews/{id}/decline`. If the seeker booked it, `rescheduleAfterDecline` runs: tries the same employer at a new time, or the next best job. Test confirms. |
| MCP only returns when verified | `src/mcp.js:71-73` + `src/tools.js:624` | `hirebuddy_run` awaits `agent.execute()`. The `finish` tool checks `ctx.run.verified === true` and refuses otherwise. |
| Agent loop: Goal -> Plan -> Tools -> Verify -> Fix -> Deliver | `src/agent.js` + `src/tools.js` | `set_plan` creates the plan. Tools return `{ ok, problems }` on failure. `verify_applications` / `verify_hiring_outcome` run at the end. `finish` delivers only after verification passes. |
| Never lowers pay floor itself | `src/agent.js:345` (`seekerOptions`) + `src/steps.js:137` | `lower_pay_floor` is marked `yours: true`. Step tools check `o.allowed` and refuse with "only they can choose it." Test confirms: "step tools refuse to lower her pay floor." |
| 2 jobs suit Nadia, adapts with askAboutTech | `src/seed.js` + `src/tools.js:400-425` | Initially suitable: job-transcribe-remote (RM12/hr, remote, NVDA+JAWS, phone) and job-a11y-pj (RM18/hr, hybrid, NVDA+JAWS+VoiceOver, phone). `seekerOptions` offers `ask_about_screen_reader` first (cost: 0, not yours), adding job-reception-sunway (clinic, no assistive tech listed). |
| WCAG accessibility features | `server.js:62,65-71` + `style.css:3,39-43` + `common.js:23-26` | Skip link, `aria-label` on nav, `aria-current="page"`, `aria-live="polite"` announcer, AAA contrast (7:1), 4px yellow focus ring, keyboard-navigable job cards (tabindex + Enter), Atkinson Hyperlegible font (Braille Institute). |
| "It asks the employer about that in the application" | `src/tools.js:474` | When `askAboutTech` is on and a listing lacks screen reader support, `apply_to_job` adds: "Question: does your setup work with NVDA? HireBuddy checked your listing and it does not say." |
| Emails her in plain text with time on line one | `src/tools.js:240-245` + `src/agent.js:311-318` | `send_email` enforces: time in first 3 lines, how-to-join in first 3 lines, no HTML. `seekerEmail` puts "Interview: {when}" on line 1. |
| Same engine runs student and employer flows | `src/agent.js:209` (`autopilotHirer`) + `src/agent.js:350` (`autopilotStudent`) | Both use the same `callTool`, `verify_*`, and `finish` gate. |

## Claims corrected in the pitch

### 1. "axe-core in tests" (Q&A) -- NOT FOUND

The Q&A answer "How do you know it works for blind users?" says "axe-core in tests." However:
- `package.json` has no axe-core dependency (only `telegram`).
- `test/e2e.js` does not reference axe-core or any accessibility testing library.

**Fix applied:** Changed to "built to NVDA and keyboard-only patterns, AAA contrast colours, polite live-region updates per step" -- all of which are verified in the code.

### 2. "0 WCAG 2.2 AA violations" (Slide 4) -- designed for, not automatically tested

The CSS explicitly targets AAA (7:1) contrast, and every page has skip links, ARIA landmarks, labelled forms, and a polite live region. But there is no automated axe-core scan in the test suite to prove "0 violations."

**Fix applied:** Changed to "WCAG 2.2 AA built in (AAA contrast)" on slide 4. This is accurate and still strong.

### 3. Privacy / disclosure Q&A -- understated what is shared

The Q&A says: "Her needs go to the employer only as interview arrangements, such as 'send documents as Word or plain text.'"

The actual code (`src/tools.js:444-451`, `accessNote`) sends to the employer:
- "Nadia is blind and uses NVDA."
- "Preferred interview format: phone."
- "Please send any documents or tests as Word or plain text, not scanned images or PDFs of pictures."

And when the listing doesn't mention screen readers (`src/tools.js:474`):
- "Question: does your setup work with NVDA?"

**Fix applied:** Updated the Q&A to state precisely what is shared: that she is blind and uses NVDA, her preferred interview format, and that documents should be in Word or plain text. Nothing else about her personal life is shared.

## Additional notes

- The demo data in `src/seed.js` is fictional but modelled on real Klang Valley listings (see `docs/demo-data.md`).
- The `e2e.js` test suite covers: Nadia (blind seeker), low-vision remote-only seeker, hirer, illegal wage refusal, student, day-rate refusal, RM8.50 refusal, tutor, replans with relaxation, decline + replacement, rescheduling, other-site listings, WorkBuddy-led steps, daily background check, and pay-floor refusal.
- The "I can't make it" button text in `me.js` is exactly "I can't make it" (line 56).
