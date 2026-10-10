# HireBuddy Pitch Deck - Story

## User Intent Alignment

- **Target audience**: Pitch competition judges and investors. 3-minute pitch + 2-minute Q&A. Judges want to see a real working product, not slides.
- **Core goal**: Make them believe HireBuddy works. One sentence in, three verified interviews booked. The agent loop is real, the accessibility is built in, and the code is verifiable.
- **PPT length**: 5 slides total. Compact, every second counts. Most of the 3 minutes is the live demo (narrated over Slides 2-3), not the slides themselves.
- **Visual tone**: Bold, modern, high-contrast, accessible. Dark tech aesthetic reflecting the product's own AAA-contrast dark theme. Confident, not decorative.
- **Content boundaries**: Only claims verified against source code (see code-review.md). No market size stats, no growth projections, no "imagine a world" framing. Concrete proof only.

## Page Layout Skeleton

- **Total pages**: 5, no catalog/section pages (pitch deck, not a report).
- **Hero pages**: Slide 1 (Problem - bold opening) and Slide 3 (Agent Loop - visual centerpiece). 2/5 = 40%, justified for a short impact deck.
- **Rhythm curve**: Slide 1 peak (open strong) → Slide 2 valley (information dense, Nadia's quote) → Slide 3 peak (visual diagram) → Slide 4 transition-to-peak (proof metrics) → Slide 5 transition (links, calm close).
- **Non-symmetric layouts**: 3/5 pages (60%) use non-symmetric layouts. Slides 1, 2, 3, 4 all use non-symmetric or full-bleed layouts. Only Slide 5 (links) is symmetric/centered.

## Page Outline

### Slide 1: The Problem

| Field | Value |
|---|---|
| title | HireBuddy |
| type | cover |
| role | hero |
| rhythm | peak |
| layout | 全幅视觉+骑线文字 (full-bleed dark background + text riding from left) |
| visual | L1: dark gradient background as atmosphere; large "HireBuddy" title as anchor (96px) |
| visual_role | anchor |
| density | 字数约60 / 留白约35% |
| anti_pattern | 禁止等宽卡片横排；禁止把标题缩小为200x70装饰；禁止铺满正文段落 |
| description | Product name + tagline "One sentence in. Three verified interviews out." + one-line problem statement: blind job seekers in Malaysia must check transit, screen reader support, and interview format before every application. Every job board leaves that work to them. |

### Slide 2: One Prompt

| Field | Value |
|---|---|
| title | One Prompt |
| type | content |
| role | supporting |
| rhythm | valley |
| layout | 非对称双栏 (65:35, quote left, context right) |
| visual | L1: Nadia's full sentence as large quote text (the quote IS the visual) |
| visual_role | evidence |
| density | 字数约180 / 留白约25% |
| anti_pattern | 禁止50:50等分双栏；禁止把引用缩小为脚注；禁止用卡片框住引用 |
| description | Nadia's full input sentence displayed as a large quote on the left (65%). Right side (35%) gives context: "That's everything she types. She doesn't answer any more questions." + key constraints highlighted (blind, NVDA, RM12/hr, phone interviews, Subang Jaya/LRT). |

### Slide 3: Why It's an Agent

| Field | Value |
|---|---|
| title | Why It's an Agent |
| type | content |
| role | hero |
| rhythm | peak |
| layout | 左标题+右图 (left 30% title/description, right 70% SVG flow diagram) |
| visual | L1: SVG agent loop diagram (Goal -> Plan -> Tools -> Verify -> Fix -> Deliver) |
| visual_role | anchor |
| density | 字数约120 / 图1张 / 留白约20% |
| anti_pattern | 禁止等宽卡片横排；禁止N卡片横排替代流程图；禁止把流程图缩小 |
| description | The agent loop: Goal -> Plan -> Tools -> Verify -> Fix -> Deliver. Every tool returns either a result or a list of specific problems, and the agent fixes those and tries again. Runs on LLM or rule-based planner, same checks. In WorkBuddy, MCP tool only returns once everything is verified. |

### Slide 4: Proof and Close

| Field | Value |
|---|---|
| title | Proof |
| type | content |
| role | supporting |
| rhythm | peak |
| layout | 巨型数字+洞察 (big numbers as anchors, arranged non-symmetrically) |
| visual | L1: Three big numbers/metrics as visual anchors (WCAG 2.2 AA, 25/25, RM8.72) |
| visual_role | anchor |
| density | 字数约100 / 留白约30% |
| anti_pattern | 禁止等宽卡片横排装数据；禁止把核心数字塞进图表卡角落 |
| description | Three proof points as big numbers: "WCAG 2.2 AA" (AAA contrast built in), "25/25" (verification checks pass for Nadia), "RM8.72/hr" (refuses illegal pay from both sides). Tagline: "One sentence in, three interviews booked and verified. HireBuddy: work that gets done." |

### Slide 5: Links

| Field | Value |
|---|---|
| title | Links |
| type | ending |
| role | transition |
| rhythm | transition |
| layout | 居中金句 (centered, calm close) |
| visual | L3: FAIcon links (GitHub + live app) |
| visual_role | atmosphere |
| density | 字数约40 / 留白约45% |
| anti_pattern | 禁止铺满正文；禁止四卡片预览 |
| description | Two links for Q&A: GitHub repo and live app. Clean, centered, minimal. |
