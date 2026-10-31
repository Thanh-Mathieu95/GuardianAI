---
name: Guardian AI
description: A sealed minute of who helped, what they promised, and where to go next.
colors:
  paper: "#f6f7f5"
  sheet: "#ffffff"
  sheet-tint: "#eef0ec"
  rule-grey: "#e6e8e3"
  hairline: "#c8ccd4"
  steel-rule: "#a3a9b8"
  ink: "#1b2550"
  ink-muted: "#4a5378"
  ink-struck: "#8a90a8"
  ballpoint-blue: "#2a4cc0"
  ballpoint-deep: "#1e3a8a"
  ballpoint-wash: "#e8edfb"
  seal-red: "#d22f27"
  seal-deep: "#8f1d17"
  support-amber: "#a86200"
  support-amber-deep: "#6e4100"
  support-amber-wash: "#fbf1dc"
  night-ground: "#141c3f"
  night-shell: "#0f1533"
  night-sheet: "#1a2350"
  night-raised: "#212b5e"
  night-rule: "#2c3770"
  night-text: "#eef0f8"
  night-muted: "#a9b2d6"
  night-blue: "#7f9cff"
  night-amber: "#f0b44c"
  night-red: "#ff5a4c"
typography:
  display:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.7px"
  headline:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  clause:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tnum"
  minute-title:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.14em"
  label:
    fontFamily: "Be Vietnam Pro, Segoe UI, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.1em"
rounded:
  sheet: "2px"
  code: "0px"
  device: "28px"
  mark: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "20px"
  xl: "28px"
components:
  button-default:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "9px 14px"
  button-default-hover:
    backgroundColor: "{colors.sheet-tint}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "9px 14px"
  button-primary-hover:
    backgroundColor: "{colors.ballpoint-blue}"
  button-sos:
    backgroundColor: "{colors.seal-red}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.sheet}"
    padding: "12px 14px"
  input-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "10px"
  panel:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
  venue-code:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.code}"
    padding: "0 4px"
  tab-active:
    textColor: "{colors.ballpoint-blue}"
    padding: "10px 0 12px"
  night-screen:
    backgroundColor: "{colors.night-ground}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.device}"
  night-button:
    backgroundColor: "{colors.night-sheet}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.sheet}"
---

# Design System: Guardian AI

## Overview

**Creative North Star: "The Sealed Minute"** (Biên bản niêm phong)

Every incident is a minute being drawn up in real time. The command center reads as an official record on cool white paper: ballpoint blue-black ink for text and rules, ballpoint blue for quotes, routes and live state, and one vermilion seal that appears only when a place has actually agreed to take the person in. Each offer from a helper becomes a numbered clause ("Điều 2 · Nơi đến") with the helper's own words quoted beneath it, so a viewer can check every AI conclusion against what was said.

Density is high and deliberate: three columns of record (minute, map, call register) sit on one screen for a projector audience, framed by 1px ink rules rather than cards floating on shadows. States are printed marks rather than colored badges: a confirmed clause is stamped, a withdrawn one is struck through in red, and an unanswered one is a dotted blank line waiting to be filled.

The phone companion is the same document carried at night. Inside the phone screen the ground inverts to deep ink and the paper palette shifts to its night equivalents, so the person alone in the street gets a dark, low-glare screen while the record stays recognisably the same system. The world explicitly rejects the near-black neon command console it replaced.

**Key Characteristics:**
- Cool paper ground, ink text, 1px ink frames, 2px corners everywhere.
- One seal red, reserved for SOS, danger and the confirmation stamp.
- States drawn as marks on paper: sealed, struck through, dotted blank.
- Venue codes (Q-27, T-01, K-02) shared verbatim by map labels and minute clauses.
- Tabular numerals throughout; times and counters never jitter.
- Night inversion scoped to the phone screen only.

## Colors

A paper-and-ballpoint palette: near-neutral cool greys, two inks of blue, one red reserved for authority and danger, and a narrow amber for one specific meaning.

### Primary
- **Ballpoint Blue-Black** (ink): all body text, panel frames, the top bar rule, primary buttons, the venue code box. It is the color of the record itself.
- **Ballpoint Blue** (ballpoint-blue): verbatim quotes, clause numbers, the route line (graded from ink to blue along its length), live dots, focus rings, active tabs, primary-button hover. Blue means "said" or "live".
- **Deep Ballpoint** (ballpoint-deep) and **Blue Wash** (ballpoint-wash): text and fill for confirmed venue markers, confirmed candidate letters and status chips.

### Secondary
- **Seal Vermilion** (seal-red): the SOS button and timer, the round seal on the confirmed clause, the strike-through line on withdrawn clauses, risky-route dashes and incident markers on the map. **Seal Deep** (seal-deep) carries declined and failed text where the bright red would be too loud at small sizes.

### Tertiary
- **Support Amber** (support-amber, with support-amber-deep text and support-amber-wash fill): markers for venues on the partner support list, observed dark streets on the map, connection and real-call warnings, the demo-mode badge. Nothing else.

### Neutral
- **Paper** (paper): page ground.
- **Sheet** (sheet): panels, inputs, buttons, map overlays.
- **Sheet Tint** (sheet-tint): button hover, agent cards, metric tiles, call lanes.
- **Rule Grey** (rule-grey): inner dividers inside lists and lanes.
- **Hairline** (hairline): clause separators, input strokes, secondary borders.
- **Steel Rule** (steel-rule): default button and pill strokes, idle dots.
- **Ink Muted** (ink-muted): secondary text, pending clauses, timestamps.
- **Ink Struck** (ink-struck): text of struck-through clauses and superseded routes.

### Night (phone screen only)
- **Night Ground** (night-ground) under **Night Text** (night-text), with **Night Blue** (night-blue) as the accent, **Night Muted** (night-muted) for secondary text, **Night Rule** (night-rule) for borders, **Night Sheet** / **Night Raised** for message cards and buttons, **Night Shell** for the device bezel. **Night Amber** and **Night Red** replace the day amber and red so warnings stay legible on ink.

### Named Rules
**The One Seal Rule.** Seal red appears only for SOS, danger, strike-throughs and the confirmation stamp. A red element that is not one of those dilutes the stamp.

**The Amber Means Support-List Rule.** Amber marks partner support-list venues and warnings, nothing decorative. If it is not a support-list marker or a caution, it is not amber.

**The Scoped Night Rule.** The night palette is applied by redefining the same tokens on the phone screen and standalone phone root, never by inverting the whole page. The command center stays on paper.

## Typography

**Display Font:** Be Vietnam Pro (with Segoe UI, system-ui, sans-serif)
**Body Font:** Be Vietnam Pro
**Label Font:** Be Vietnam Pro, uppercase with wide tracking

**Character:** One humanist sans with full Vietnamese diacritics, loaded through next/font at weights 400 to 700. Hierarchy comes from weight, tracking and case, the way a typed official form separates its headings from its entries.

### Hierarchy
- **Display** (600, 28px, -0.7px): page and receiver headings ("Cửa hàng").
- **Headline** (600, 21px, -0.3px): panel titles, the selected venue name on the right column.
- **Title** (600, 18px): card headings on the receiver page.
- **Body** (400, 14px, 1.5): default text; 16px at 1650px and wider for projector viewing.
- **Clause** (400, 13px, 1.5): minute entries; names in 700.
- **Minute Title** (700, 13px, 0.14em, uppercase): "BIÊN BẢN ĐIỀU PHỐI", centered over a 96px ink rule.
- **Label** (700, 10.5px, 0.1em, uppercase): clause numbers ("ĐIỀU 1 · DỰ PHÒNG") and venue codes.

### Persuade scale (landing `/` only)
The public landing (`app/landing.css`) adds a display scale the working screens never use: hero 800 `clamp(38px, 4.6vw, 68px)` at -0.035em; section heads 800 `clamp(30px, 3.4vw, 48px)` at -0.03em; night-band line 700 `clamp(26px, 3.4vw, 46px)`; step numerals 800 56px in ballpoint blue; lead copy `clamp(17px, 1.5vw, 20px)`; body 16px. Everything below 16px follows the ramp above.

### Named Rules
**The Tabular Record Rule.** `font-variant-numeric: tabular-nums` is set at the root. Timers, clause numbers, ETAs and timestamps must line up column to column.

**The Quote Is Italic Blue Rule.** A helper's own words render in italic ballpoint blue inside curly quotes, directly beneath the clause they support. AI paraphrase stays upright ink.

## Layout

The command center is a full-width record (max 2300px, 30px gutters; 42px at 1650px and wider; 20px under 1200px; 14px under 800px). Above the work area sit stacked ink-ruled bars: the showcase head (brand and minute number, act title, SOS timer in seal red, demo controls), a one-line narration, the venue directory summary and the agent activity strip.

The work row is three columns: the phone companion on the left, the light map in the center with its legend and an ink-ruled simulation bar along the bottom, and on the right a fixed column holding the selected venue and the minute of clauses. Under 1200px the operations panel drops below as a full-width row. Under 800px everything stacks.

The receiver page (`/r/<token>`) is a single 520px column of stacked bordered cards with 12px gaps, built for a phone held in one hand.

Spacing is tight and utilitarian (most gaps 8 to 20px). Clauses are separated by hairline rules with 10px vertical padding, not by gaps.

## Elevation & Depth

Flat by default. Depth comes from 1px ink frames and hairline dividers, the way a printed form separates its fields. The map is the only layered surface: a light positron basemap with pale extruded buildings (#dfe2e8 at 0.9 opacity) and route lines drawn above it.

### Shadow Vocabulary
- **Device bezel** (`box-shadow: 0 15px 40px rgba(8,12,36,0.15), 0 0 0 3px #141c3f`): only on the phone shell, so the phone reads as an object placed on the paper.
- **Modal lift** (`box-shadow: 0 30px 120px rgba(27,37,80,0.22)`): only on modal sheets over a blue-wash backdrop.
- **SOS lift** (`box-shadow: 0 4px 14px rgba(8,12,36,0.3)`): only on the phone's SOS button.

### Named Rules
**The Ruled Not Raised Rule.** Panels, cards, lanes and map controls carry a 1px border and no shadow. A shadow on a panel turns the record back into a dashboard.

## Shapes

Corners are 2px on every sheet, input, button, pill, chip and map label: square enough to read as cut paper, soft enough not to look broken. The venue code box is the one fully square element (0px), like a stamped registration number. Circles are reserved for marks: map pins, live dots, the voice orb and the seal. The phone shell (35px) and screen (28px) are the only large radii, because they depict a physical device. Receiver-page ring buttons are pill-shaped (40px) as a phone call-screen convention.

## Components

### Buttons
- **Shape:** gently squared (2px).
- **Default:** white sheet, ink text, 1px steel-rule stroke, 9px 14px, weight 500. Hover tints the sheet and turns the stroke to ink.
- **Primary:** ink fill with white text, weight 600. Hover shifts fill and stroke to ballpoint blue.
- **SOS:** seal-red fill, white 16px 700 label tracked 1.4px, small pale-red subline. Hover brightens to night red.
- **Focus:** 2px ballpoint-blue outline, 3px offset, on every interactive element.
- **Disabled:** 40% opacity, not-allowed cursor.

### Chips and Pills
- **Style:** 11px weight 500 text, white sheet, 1px steel-rule stroke, 2px corners, 3px 8px.
- **Status chips:** confirmed uses blue wash with ballpoint text; declined uses rule grey with seal-deep text.

### Cards / Containers
- **Corner Style:** 2px.
- **Background:** white sheet on paper; agent cards and call lanes on sheet tint.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px ink for top-level panels and bars; 1px hairline for inner cards.
- **Internal Padding:** 11 to 20px.

### Inputs / Fields
- **Style:** white sheet, 1px hairline stroke, 2px corners, 10px padding, ballpoint-blue caret.
- **Focus:** 2px ballpoint-blue outline at 3px offset.
- **Labels:** 12px ink, stacked 8px above the field.

### Navigation
- **Tabs:** 11px muted text with a 2px transparent bottom rule; active tab turns ballpoint blue with a blue underline.
- **Top bar:** brand mark in a 1px ink frame, a vertical rule before the minute number, SOS timer, then demo controls as square icon buttons.

### The Minute (signature component)
The right column's record. A centered uppercase title over a short ink rule, the "Lập lúc 10:00 · kế hoạch v1" line, then an ordered list of clauses separated by hairlines. Each clause has a head line (clause number and role in uppercase blue label on the left, status in 11px bold ink on the right), the helper's name in bold preceded by its venue code box, the instruction text, and when sealed the verbatim quote in italic blue. Clauses sort sealed, then accepted, then pending, then struck.

- **Sealed:** clause number turns seal red; a round red SVG seal (two concentric rings, "ĐÃ / XÁC NHẬN / time") sits at the right, rotated -11deg at 90% opacity, and stamps in over 260ms (`cubic-bezier(0.16, 1, 0.3, 1)`, from scale 1.35 and zero opacity). Reduced motion removes the animation.
- **Accepted (ok):** ink text, instruction clamped to two lines.
- **Pending:** muted text with a dotted blank line where the answer will go.
- **Struck:** name and text in ink-struck grey with a 1px seal-red line-through, status in seal red, code box stroke softened to steel.

### Venue Codes
A letter for venue kind plus a two-digit index (Q-27 quán, T-01 cửa hàng tiện lợi, K-02 khách sạn). The same code labels the map pin ("Q-27 · Quán Cháo Ấm") and the minute clause, so the eye can jump between the map and the record.

### Map
Light positron basemap. The active route is a 5px line graded from ink to ballpoint blue over an 11px white casing; superseded routes are 3px dashed ink-struck; the free-walk route is dashed blue; risky segments are 2px dashed seal red with a faint red blur; observed dark streets are dashed amber. Pins are 21px circles: blue wash for confirmed, amber wash for support-list, rule grey with a dashed stroke for unknown or closed. Map controls and overlays use the 1px ink frame and 2px corners.

### Phone Companion (night)
The phone screen redefines the ink, muted, blue, amber, red and hairline tokens to their night values. Message cards sit on night sheet with night-rule borders; the voice orb is a ballpoint-blue disc with a night-blue ring; buttons inside the screen take night sheet fill and night-rule strokes, with a night-blue stroke on hover.

### Evidence Dossier
The exported HTML dossier carries its own inline stylesheet using the same values (ink, blue, muted, hairline line, paper soft, red for critical, amber for warnings) and the same seal SVG, so the printed record matches the screen.

## Do's and Don'ts

### Do:
- **Do** frame top-level panels with a 1px ink border and 2px corners on a white sheet over the paper ground.
- **Do** show every AI conclusion next to the quote that supports it, in italic ballpoint blue.
- **Do** express state as a printed mark: the seal for confirmed, a red strike-through for withdrawn, a dotted blank for waiting.
- **Do** give every venue its code and use the same code on the map and in the minute.
- **Do** keep tabular numerals on anything that counts or tells time.
- **Do** scope the night palette by redefining tokens on the phone screen root.
- **Do** respect reduced motion: the seal appears without the stamp animation.

### Don't:
- **Don't** use seal red for anything except SOS, danger, strike-throughs and the confirmation stamp.
- **Don't** use amber except for support-list venue markers and warnings.
- **Don't** return to a near-black neon console look on the command center: no dark page ground, no glowing accents, no cyan on black.
- **Don't** put shadows on panels or cards; only the phone bezel, modal and SOS button lift.
- **Don't** round sheets past 2px or square off the round marks (pins, dots, seal).
- **Don't** show a confirmation as a colored pill when the seal is available; the stamp is the confirmation.
