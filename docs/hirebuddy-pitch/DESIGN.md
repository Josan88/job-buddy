# HireBuddy Pitch Deck - Design

## 1. Canvas & Global Master

- **Canvas**: 1280 x 720px (16:9)
- **Default master (A/B/C zones)**:

| Zone | Vertical | Height | Content rule |
|---|---|---|---|
| A - Title block | 0-100px | 100px (incl. top padding 20) | Page title 32-36px bold |
| B - Content area | 100-660px | 560px usable | All body content, charts, diagrams |
| C - Footer bar | 660-720px | 60px (incl. bottom padding 20) | Left: "HireBuddy" wordmark / Right: page number NN/05, 14px |
| Page padding | top/bottom 20px, left/right 60px | - | A/B/C within padding |

Cover (Slide 1) and ending (Slide 5) may omit C zone or use custom layout. Slides 2-4 maintain strict master consistency.

## 2. Color System

| Role | Hex | Usage |
|---|---|---|
| Background (main) | `#0F172A` | Dark slate navy - all page backgrounds |
| Main color | `#3B82F6` | Blue - titles, diagram nodes, key highlights |
| Accent color | `#10B981` | Emerald green - verified/success metrics, checkmarks |
| Text primary | `#F1F5F9` | Near-white - all body text on dark background |
| Text secondary | `#94A3B8` | Slate gray - subtitles, secondary text, footer |

### Color area allocation

| Color role | Area ratio | Notes |
|---|---|---|
| Main (background) | <= 60% | Dark navy background dominates |
| Secondary (blue) | <= 25% | Titles, diagram elements, quote highlights |
| Accent (green) | <= 10% | Only on verified metrics, checkmarks, "25/25" |
| Neutral (text) | remaining | Body text, footer |

Hero pages (Slide 1, 3): accent may reach 15%. Supporting pages (Slide 2, 4): accent <= 5%.

### Gradients & transparency

- Slide 1 background: `linear-gradient(135deg, #0F172A 0%, #1E293B 100%)` for subtle depth
- Slide 3 diagram nodes: `linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)` for blue nodes, `linear-gradient(135deg, #10B981 0%, #047857 100%)` for the Verify node
- Cards: `rgba(59, 130, 246, 0.08)` for subtle blue tint on dark background
- No image overlays needed (no photographic backgrounds)

## 3. Font System

| Level | Size (px) | Weight | Line height | Usage |
|---|---|---|---|---|
| Cover title | 88 | bold | 1.1 | Slide 1 "HireBuddy" |
| Big number/anchor | 72 | bold | 1.0 | Slide 4 metrics (25/25, RM8.72) |
| Page title | 36 | bold | 1.3 | Slides 2-5 A-zone title |
| Quote text | 28 | normal | 1.5 | Slide 2 Nadia's sentence |
| Body text | 22 | regular | 1.5 | All paragraph text |
| Subtitle/label | 18 | 600 | 1.4 | Card headers, labels |
| Footer | 14 | regular | 1.4 | C-zone page number, wordmark |

**Font families**:
- All text: `Inter, Helvetica Neue, Arial, sans-serif`
- Monospace (code-like elements, if any): `JetBrains Mono, Consolas, monospace`

Single font family throughout. No mixing of serif/sans-serif. Bold weight for titles and anchors, regular for body.

## 4. Information Density

| Page type | Min elements | Min text | Images | Main visual area |
|---|---|---|---|---|
| Cover (Slide 1) | Title + tagline + problem line | 60 | 0 (typography as visual) | B area >= 35% (title block) |
| Content single-theme (Slide 2) | Title + quote + context | 180 | 0 (quote is visual) | B area >= 30% |
| Content diagram (Slide 3) | Title + description + SVG diagram | 120 | 1 SVG | B area >= 50% |
| Data/metrics (Slide 4) | Title + 3 metrics + tagline | 100 | 0 (numbers as visual) | B area >= 30% |
| Ending (Slide 5) | Title + 2 links | 40 | 0 | - |

Whitespace: Slides 2-4 <= 35%. Slides 1, 5 may reach 40-45% (hero/ending).

## 5. Image System

No photographic images needed. Visual anchors are:
- **Typography**: Large titles (88px), big numbers (72px) as visual anchors
- **SVG diagrams**: Slide 3 agent loop flow diagram (inline `<svg>`)
- **FAIcon**: Small icons for links (Slide 5), checkmarks (Slide 4)

All visual weight carried by typography, SVG, and color blocks. No ImageGen needed.

## 6. Page Mapping Table

| # | File | Type | Role | Layout | L1 | Text estimate | Whitespace | Color allocation | Key constraint |
|---|---|---|---|---|---|---|---|---|---|
| 01 | 01.slide | cover | hero | 全幅视觉+骑线文字 | Typography (88px title) | 60 | 35% | Main 60% + Secondary 25% + Accent 5% | Full-bleed dark bg; title left-aligned; tagline below |
| 02 | 02.slide | content | supporting | 非对称双栏 65:35 | Quote text (28px) | 180 | 25% | Main 60% + Secondary 20% | Left 65% quote; right 35% context; no card frame on quote |
| 03 | 03.slide | content | hero | 左标题+右图 | SVG agent loop diagram | 120 | 20% | Main 50% + Secondary 30% + Accent 10% | Left 30% text; right 70% SVG; 6 nodes in flow |
| 04 | 04.slide | content | supporting | 巨型数字+洞察 | Big numbers (72px) | 100 | 30% | Main 55% + Secondary 15% + Accent 15% | 3 metrics non-symmetric; accent green on "25/25" |
| 05 | 05.slide | ending | transition | 居中金句 | FAIcon links | 40 | 45% | Main 70% + Secondary 15% | Centered; 2 links with icons; calm close |
