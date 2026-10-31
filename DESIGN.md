---
name: "Guardian AI"
description: "Practical human support, recorded in paper and blue ink."
colors:
  paper: "#f6f7f5"
  sheet: "#fff"
  ink: "#1b2550"
  muted: "#4a5378"
  blue: "#2a4cc0"
  wash: "#e8edfb"
  rule: "#c8ccd4"
  control-rule: "#a3a9b8"
  red: "#d22f27"
  night: "#141c3f"
  night-sheet: "#1a2350"
  night-text: "#eef0f8"
  night-muted: "#a9b2d6"
  night-rule: "#6473a3"
  night-confirmation: "#a9c0ff"
  warning-wash: "#fbf1dc"
  warning-ink: "#6e4100"
  warning-rule: "#a86200"
  error-ink: "#8f1d17"
typography:
  display:
    fontFamily: "Be Vietnam Pro"
    fontSize: "clamp(42px, 4.5vw, 70px)"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Be Vietnam Pro"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Be Vietnam Pro"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Be Vietnam Pro"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Be Vietnam Pro"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  button:
    fontFamily: "Be Vietnam Pro"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
rounded:
  control: "2px"
  circle: "50%"
spacing:
  compact: "8px"
  action-gap: "10px"
  field: "12px"
  inset: "16px"
  grid-gap: "18px"
  mobile-page: "20px"
  panel: "22px"
  page: "24px"
components:
  button-default:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.button}"
  button-default-hover:
    backgroundColor: "{colors.wash}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    typography: "{typography.button}"
  button-primary-hover:
    backgroundColor: "{colors.blue}"
  button-danger:
    backgroundColor: "{colors.red}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-night-primary:
    backgroundColor: "{colors.night-text}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-sos:
    backgroundColor: "{colors.red}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    width: "100%"
  input-field:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  workspace-tab-active:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.blue}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  language-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.control}"
    padding: "8px"
  source-label:
    textColor: "{colors.muted}"
    padding: "5px 8px"
  commitment-row:
    textColor: "{colors.ink}"
    padding: "16px 0"
---

# Design System: Guardian AI

## Overview

**Creative North Star: "Paper and Blue Ink"**

Guardian AI presents human support as a record that can be read and checked. Cool paper, blue-black text, explicit rules and quoted commitments connect the public introduction, operational workspace and recipient page. The companion surface inverts the same family into a restrained night palette.

The public introduction is spacious and editorial; operational surfaces are denser, with clear separation between a person's next action, the map and the people offering help. Original statements stay visibly distinct from status and proposed actions. Vietnamese and English share one type family and the same component structure.

This is a source-derived snapshot of the new local demo implementation, based on `app/globals.css`, `app/layout.tsx`, and the home, workspace and receiver components. It reconciles the earlier direction document with current code. No approved raster composition or rendered captures were available; this document does not certify visual QA. Sidecar tonal ramps are generated swatch previews, not extra runtime color tokens.

**Key Characteristics:**
- Cool paper and blue ink, with a dark companion surface.
- Flat, ruled containers and nearly square controls.
- Quoted human commitments beside explicit status text.
- One Vietnamese-capable family across both interface languages.

## Colors

The palette pairs cool paper with blue ink; warning and error colors carry operational meaning. Normative values are in frontmatter.

### Primary
- **Blue ink** (`ink`): primary text, strong boundaries and primary buttons on light surfaces.
- **Ballpoint blue** (`blue`): active tabs, confirmations, links, focus and primary-button hover.
- **Blue wash** (`wash`): selected navigation, proposed-plan blocks and supporting information.

### Secondary
- **Action red** (`red`): SOS, emergency and destructive actions; it is not a confirmation seal.
- **Warning paper, ink and rule** (`warning-wash`, `warning-ink`, `warning-rule`): warning and check-in surfaces.
- **Error ink** (`error-ink`): error text and withdrawn-commitment status.

### Neutral
- **Cool paper** (`paper`) and **white sheet** (`sheet`): page ground and bordered content surfaces.
- **Muted ink** (`muted`), **divider rule** (`rule`) and **control rule** (`control-rule`): secondary text, section divisions and field boundaries.
- **Night ground** (`night`) and **night sheet** (`night-sheet`): companion background and its text fields.
- **Night text**, **night muted**, **night rule** and **night confirmation**: corresponding text, field-border and focus/confirmation roles on the dark companion.

**The Source Before Status Rule.** Keep the simulation or device-trial label and original response visible alongside derived status; color does not replace that text.

## Typography

Be Vietnam Pro is loaded through `next/font/google` with Latin and Vietnamese subsets and weights 400, 500, 600 and 700. The framework supplies its generated fallback; no separate display or monospace face is declared.

The display role is the landing headline. Its fluid size is overridden to 48px at widths up to 1200px and 43px at widths up to 760px. The base headline and title roles correspond to h2 and h3; individual surfaces adjust these: the demo director uses a 29px h1, setup and record headings use 36px, and the receiver uses 31px. The companion heading is 26px at weight 500.

Body text uses the frontmatter role; paragraphs have a more open line height of 1.8. Introductory copy is 16px with a 61ch limit, while setup lead text is 15px with a 75ch limit. Labels sit above controls. Time elements and record totals use tabular numerals. Functional source tags and secondary metadata use 12px text; they are not a display-heading pattern.

## Layout

The landing page uses 4vw side gutters and a two-column hero with a 1.15:1 ratio. Its content becomes a single column at 760px. At widths of 1550px and above, the landing container is capped at 1700px. Hero actions provide direct access to simulation and companion routes; the adjacent sample record is explicitly labeled as simulated.

The default operational grid is 330px / flexible map / 270px, with an 18px gap and 22px by 24px outer padding. The walk variant uses 380px / flexible map / 280px. Above 1550px, the demo grid becomes 380px / flexible map / 320px. At 1200px and below, both use a 320px companion and flexible map, followed by a full-width coordination region.

At 760px and below, the workspace stacks with 16px gutters. The demo places the map before the companion; the walk route keeps the companion first. The map is no longer sticky. Map height is 630px by default, 700px on large screens, 650px in the intermediate layout, and 330px on small screens; the small walk map is 300px. These are current source rules, not measurements from rendered captures.

Setup and record views cap at 1060px; the receiver caps at 520px. Setup's two columns collapse at 760px. Repeated gaps and insets appear in frontmatter; they describe observed values rather than an invented mathematical spacing scale. Printing removes workspace navigation and action chrome around the record.

## Elevation & Depth

The authored stylesheet has no box-shadow vocabulary. Rules, background changes and content hierarchy establish depth. The landing sample record alone rotates by minus one degree at wide widths and returns upright at 1200px; that is a surface-specific composition, not a universal card treatment. The map is sticky on wider layouts. External map-library styling is outside this extracted system.

**The Flat Paper Rule.** Use borders and tonal surfaces for record structure; the authored containers do not rely on floating shadows.

## Shapes

Buttons and inputs have the slight control radius in frontmatter. Major panels, records, dividers and source labels remain rectangular. Circular shapes belong to map markers, the covert-call avatar and the call-ending control. The companion is a rectangular dark panel; the old document's rounded phone shell is not implemented here.

## Components

### Buttons

Buttons are compact actions with a base minimum height of 44px, an 8px icon gap and the padding defined in frontmatter. Default buttons use a white surface and control rule; hover changes the fill to blue wash and the border to blue. Primary buttons use blue ink and turn blue on hover. Danger buttons use action red. Disabled buttons use 0.45 opacity and a not-allowed cursor.

The companion's primary action uses night text as a light fill with ink text and a 12px label; hover changes its fill and border to blue wash. SOS is full width, at least 58px high, with a 16px bold label and a darker red hover. Preserve its prominence within the companion rather than applying it to ordinary actions.

Global keyboard focus uses a 3px blue outline offset by 3px; companion focus uses night confirmation. Background and border changes transition over 0.15s. Reduced-motion preferences disable transitions and animations and remove smooth scrolling. Disclosure summaries and error-dismiss controls also carry a 44px minimum target in the current source.

### Chips

The source label is a noninteractive rectangular tag with a control-rule border, muted text, 12px bold lettering and 0.055em tracking. It identifies simulation or device trial; it is neither a decorative eyebrow nor a selectable filter. Do not give it fabricated interactive states.

### Cards / Containers

The coordination panel is a white, ink-bordered rectangle padded 22px vertically and 18px horizontally. The companion uses night ground and 26px by 22px padding. Receiver plan summaries use blue wash with 20px padding. Rows and sections use fine rules, without shadows or an assumed all-purpose card radius.

### Inputs / Fields

Fields use white, ink text, a control-rule border and the frontmatter padding, with a minimum height of 44px. Textareas start at 100px high, resize vertically and use line height 1.7. The companion substitutes night sheet, night text, night rule and night-muted placeholders. Visible labels remain outside fields; a placeholder is supporting copy. Errors appear in separate alert boxes.

### Navigation

The header carries a bold wordmark, route links and the VI/EN switch. Header route links change to blue on hover and are hidden at the small breakpoint; direct landing actions remain. Workspace tabs use transparent rest states and blue text, a blue border and blue wash when `aria-pressed` is true. On small screens they share the available width. The language switch gives each language a minimum 44px width; the active language has ink fill and white text.

### Commitment Rows

Each ruled row places a person's name above explicit status and an original quote. The row uses 16px vertical padding and a 7px internal gap. Names use 14px bold text; status uses 12px blue text; quotes use 12px italic muted text with line height 1.8 and wrap long content. Withdrawn names are struck through in red, and their status uses error ink. This text-based state treatment replaces the legacy document's numbered clauses and confirmation stamps.

## Do's and Don'ts

### Do:
- Do keep source labels, human quotes and derived status visually distinct.
- Do use blue ink on paper for records and the night palette for the companion.
- Do retain visible keyboard focus and reduced-motion behavior.
- Do preserve Vietnamese diacritics and allow both interface languages to wrap.
- Do retain the base 44px action and field target when extending the interface.

### Don't:
- Don't use action red as a verified-commitment seal.
- Don't infer a rounded phone frame, numbered clause system or stamp motif from the superseded direction document.
- Don't replace explicit state text and original quotes with color alone.
- Don't treat this source extraction as completed visual or responsive QA.
