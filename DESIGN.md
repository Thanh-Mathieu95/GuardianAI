---
name: "Guardian AI"
description: "A dark operational workspace for sourced human commitments and the next action."
colors:
  bg: "#080f18"
  panel: "#101b28"
  panel2: "#142232"
  border: "#223142"
  text: "#e5edf5"
  muted: "#a5b4c5"
  cyan: "#3be1bd"
  blue: "#7db7ff"
  amber: "#e9b66f"
  red: "#fa8d91"
  quiet-road: "#bba9e9"
  primary-fill: "#72dfbd"
  primary-hover: "#a1ecd4"
  primary-ink: "#07261e"
  control-hover: "#1b3042"
  field-border: "#3b5168"
  sos-fill: "#943b48"
  sos-rule: "#c86c78"
  white: "#fff"
  dock-active: "#15362f"
  dock-rule: "#2e7966"
  phone-frame: "#050a10"
  phone-frame-border: "#3b4a5b"
  phone-screen: "#0d1823"
  phone-mic: "#123e35"
  phone-mic-text: "#7eebce"
  phone-mic-border: "#3c927b"
  phone-mic-hover: "#1c5145"
  phone-mic-hover-border: "#9df4dc"
  phone-nav: "#09131d"
typography:
  headline:
    fontFamily: "Arial, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  section:
    fontFamily: "Arial, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Arial, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: "Arial, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Arial, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
  metadata:
    fontFamily: "Arial, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "8px"
  panel: "10px"
  sos: "14px"
  map-label: "6px"
  voice: "50%"
  phone-shell: "44px"
  phone-screen: "28px 28px 12px 12px"
  phone-plan: "16px"
  phone-control: "13px"
  conversation: "12px"
spacing:
  compact: "7px"
  control: "10px"
  grid: "12px"
  inset: "14px"
  mobile-panel: "16px"
  workspace: "18px"
  panel: "20px"
components:
  button-default:
    backgroundColor: "{colors.panel2}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-default-hover:
    backgroundColor: "{colors.control-hover}"
  button-primary:
    backgroundColor: "{colors.primary-fill}"
    textColor: "{colors.primary-ink}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-sos:
    backgroundColor: "{colors.sos-fill}"
    textColor: "{colors.white}"
    rounded: "{rounded.sos}"
    padding: "10px 16px"
    width: "100%"
  input-field:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "11px 12px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "20px"
  dock-active:
    backgroundColor: "{colors.dock-active}"
    textColor: "{colors.cyan}"
    rounded: "{rounded.control}"
    padding: "8px 10px"
  source-label:
    textColor: "{colors.amber}"
    padding: "5px 8px"
  tool-disclosure:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 14px"
  commitment-row:
    textColor: "{colors.text}"
    padding: "12px 0"
  phone-microphone:
    backgroundColor: "{colors.phone-mic}"
    textColor: "{colors.phone-mic-text}"
    rounded: "{rounded.voice}"
    width: "108px"
    height: "108px"
  phone-shell:
    backgroundColor: "{colors.phone-frame}"
    textColor: "{colors.text}"
    rounded: "{rounded.phone-shell}"
    width: "100%"
    height: "780px"
    padding: "8px"
  phone-screen:
    backgroundColor: "{colors.phone-screen}"
    textColor: "{colors.text}"
    rounded: "{rounded.phone-screen}"
    height: "calc(100% - 122px)"
  call-row:
    textColor: "{colors.text}"
    padding: "10px 0"
  call-turn:
    backgroundColor: "{colors.panel2}"
    textColor: "{colors.text}"
    rounded: "{rounded.conversation}"
    padding: "12px"
  recipient-call:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.phone-plan}"
    padding: "24px"
  assignment-row:
    textColor: "{colors.text}"
    padding: "10px 0"
---

# Design System: Guardian AI

## Overview

**Creative North Star: "The Command Center"**

The operational workspace is a dark command center: an interactive physical phone simulator, a central map and a coordination panel share a continuous night background. Cyan identifies confirmed or primary coordination, blue supports reference information, amber marks unresolved or simulated information, and muted borders separate dense content.

The interface keeps the need, original human replies, proposed action and user acceptance legible together. The phone has its own scrolling screen, shared VI/EN strip, contact and record sheets, and internal navigation. Rounded command panels organize tools and evidence; the desktop bottom dock replaces the workspace header. Vietnamese and English retain the same compact system-font structure.

This record describes the implemented system in `app/command.css`, `components/workspace.tsx`, `components/guardian-map.tsx` and the command, call, recipient and place components, including inherited rules from `app/globals.css`. The map discovery, call coordination and LIVE setup additions extend the existing world. The command stylesheet loads after the global stylesheet. Its tokens are scoped to the workspace, not the root. The landing page retains its header and existing paper presentation; the recipient page retains its light paper presentation with a scoped dark in-app call panel, while loading and covert screens retain their existing styles. Frontmatter describes the command system, not an asserted global conversion.

Browser captures and functional checks are separate evidence; this source extraction asserts no visual-review verdict. Sidecar ramps are generated swatch previews, not additional runtime tokens. This document describes presentation and does not certify deployment or transport capabilities.

**Key Characteristics:**
- Dark continuous workspace with two levels of panel fill.
- Map-centered operational grid and a fixed bottom dock.
- Eight-pixel command controls, ten-pixel panels and a physical phone frame.
- Explicit provenance, original quotes and acceptance states.

## Colors

The workspace uses a near-black blue ground, two blue-gray panel layers, pale text and restrained semantic accents. Exact reusable values are in frontmatter.

### Primary
- **Cyan**: verified labels, accepted status, primary assignment names and selected dock text.
- **Primary fill, hover and ink**: a softer green button fill, lighter hover and dark label; the primary button is not filled directly with the cyan token.

### Secondary
- **Blue**: support assignments, reference routes, conversing/completed call rows and general focus.
- **Amber**: source tags, unresolved commitment states, backup assignments and synthetic low-light road warnings.
- **Quiet-road lavender**: synthetic low-footfall road segments and their legend label.
- **Red**: emergency boundaries, synthetic incident-road warnings, declined/error call names and withdrawn-state decoration; SOS retains its dedicated fill and border.

### Neutral
- **Background**, **panel**, **panel 2** and **border**: continuous ground, primary regions, nested controls and fine separation.
- **Text** and **muted**: foreground hierarchy across operational surfaces.
- **Control hover** and **field border**: interactive boundaries and hover fill.
- **Dock active** and **dock rule**: the selected navigation surface and its border.

**The Source Before Status Rule.** Keep simulation, device-trial and reference-route labels next to the information they qualify; color does not replace explicit status.

Simple confirmed, available and user markers retain their existing state colors. Discovered open venues add a blue-toned icon tile and blue open badge; an accepted venue uses the green confirmed treatment and check badge. Hover or keyboard focus reveals its name. Opening hours alone never produce the confirmed treatment.

The map uses a solid cyan active route at 5px over a 10px white casing, a dashed blue reference route at 4px, and a muted history route at 3px and 0.45 opacity. These are distinct route meanings, not interchangeable decorative lines. A reference-route label explicitly says reception is unconfirmed.

**The Call Is Not Consent Rule.** Show conversing and completed calls in blue with a phone icon. Reserve acceptance treatments for sourced commitments; answering or ending a call does not confirm help.

## Typography

The workspace explicitly uses Arial, followed by Segoe UI and sans-serif, with 14px body text. This is the selected operational face; the separately styled landing page continues to load Be Vietnam Pro through the app layout. There is no oversized display role in the command workspace.

The frontmatter headline, section and title roles reflect the workspace's base h1, h2 and h3. The scenario director uses 20px. Inside the phone, the sticky app name uses 17px, reduced to 16px on small screens, the voice heading uses 21px at weight 500, and contact/record sheet headings use 23px. An active plan or LIVE setup compacts the voice heading to 17px. Structural headings remain bold. Metadata and operational states generally use 12px; field labels and disclosure summaries use 13px. Paragraphs use line height 1.6, commitment quotes use 1.5, and time values inherit tabular numerals.

Do not infer that every inherited heading has been normalized: more specific setup and record selectors still carry their existing sizes. Small badges in command disclosures and some mobile labels currently fall to 11px; these exceptions are not a new typography role.

## Layout

The workspace has no rendered top header. It starts with source status, a scenario director in demo mode, and collapsible exploration/activity tools. The desktop journey grid is **380px / flexible map / 320px**, with 12px gaps. Outer padding is 14px by 18px, with 88px reserved below for the dock. Panels use 20px padding. The map's normal height is `clamp(450px, 68vh, 820px)` and its region remains sticky at a 12px top offset on wide layouts.

At 1100px and above the three-column layout remains. From 761px through 1099px, the grid becomes a 320px companion plus flexible map, followed by a full-width coordination region using three columns. At 760px and below, it stacks with 10px outer gutters and places the map first. The map becomes 380px tall. The dedicated phone mode caps its workspace at 520px, hides the map, coordination, director and command tools at every breakpoint, and keeps the companion visible.

The bottom dock is 64px high. Navigation occupies 355px on desktop and the footer occupies the remaining width; both are fixed at the bottom with z-index 50. On small screens, navigation gets the width minus 100px, with an icon presentation, and the language footer occupies the last 100px. The source JSX retains text inside the navigation buttons. The dedicated phone route hides this external dock and footer; its own bottom navigation remains inside the device frame.

LIVE setup uses an 8px/6px voice-hero inset, a 72px microphone and a 17px heading, with supporting hero copy hidden. The AI explanation is a disclosure, while GPS status/actions and the existing consent controls remain available. This compact arrangement keeps the manual SOS action before the phone navigation. DEMO retains its scenario controls. New session is available in the phone strip and command controls, retains the current mode and returns to the companion view; DEMO and LIVE are independent session scopes.

The phone shell is 380px wide at most and 780px high on desktop, with 8px frame padding and an isolated stacking context. Its 46px status bar, 86px by 22px camera island, hardware details, 52px app navigation and home indicator frame an independently scrolling screen. The screen height is `calc(100% - 122px)`, with horizontal overflow hidden and contained overscroll. At tablet widths the shell caps at 320px; on small command layouts it caps at 370px and uses a 760px height. The dedicated small-screen phone route uses `calc(100dvh - 24px)` with a 620px minimum height. Its app navigation stays outside the scrolling screen.

Panel toggles collapse the left or right grid column. Map-only mode removes surrounding director and tool regions and uses a map height based on the viewport. A 0.35s grid-column transition supports these changes and is disabled for reduced motion. Catalog content uses an auto-fitting grid with a 270px minimum card width, a 400px maximum scroll region and 10px gaps.

Synthetic road warnings and discovered venue details are map-local overlays. The legend sits 104px above the map bottom, or 145px when a plan overlay is present. Venue details start 103px from the top, use a maximum width of 330px within the map and scroll independently when needed. A call list caps its height at 580px with its own scrollbar; individual recipient conversations remain native expandable rows.

## Elevation & Depth

Command panels use tonal layering and one-pixel borders. The physical phone shell adds an ambient shadow (`0 18px 45px #0005`), and its microphone action has a smaller shadow (`0 9px 24px #0003`). The connected microphone adds a breathing glow (`0 0 25px #3be1bd35` at its midpoint). These shadows belong to the device and its main action, not every command panel. The fixed dock, sticky map, absolute map annotations and library popups establish spatial order. Their positioning is functional rather than a general floating-card motif.

**The Bordered Depth Rule.** Separate command panels with fills and fine borders; reserve ambient shadows for the physical phone frame and its microphone action.

The map initializes with a pitched dark basemap and optional building extrusions when the expected source exists. Camera framing animates over 900ms for a route and 600ms for a location, each reduced to zero when reduced motion is requested. The 2D/3D toggle uses 500ms and now also reduces its duration to zero under that preference. Rendering and availability depend on map resources; these are source behaviors, not verified visual results.

SOS adds a short, location-centered sweep rather than continuous ambient motion: a 2.2s linear rotation, two 2.2s expanding rings separated by 1.1s, and a 3.4s display window. It stops for ended or signal-lost sessions. Venue discovery uses a 0.5s opacity/brightness entrance. Reduced motion suppresses the radar and disables these animations while keeping textual status. These effects indicate coordination activity and synthetic discovery, not a measured physical scanning radius.

## Shapes

Command controls and tools use 8px corners; main command panels and the map use 10px. The phone shell uses 44px, while its screen uses 28px upper and 12px lower corners. Its next-action panel uses 16px, SOS uses 14px, and contact and selected-navigation controls use 13px. The microphone is circular. Small map labels use 6px, with reference annotations using a local 7px radius; source tags remain rectangular.

## Components

### Buttons

Default buttons use panel 2, pale text and a border; hover changes the fill to control hover and the border to cyan. Primary buttons use the dedicated green fill, dark text and matching border, with the lighter green hover. They inherit 10px by 16px padding, an 8px icon gap and the global 44px minimum height. The scenario director, map toolbar, simulation controls and 3D toggle now explicitly enforce a 44px minimum height.

The in-phone SOS action is full width, at least 52px high, with a 14px bold label, muted red fill and a lighter red border. Disabled buttons retain the global 0.45 opacity. Keyboard focus uses the global 3px outline with 3px offset; the workspace blue token supplies its general color, while the companion currently inherits a separate lighter blue focus value.

### Voice Control

The phone microphone is a centered 108px circle with a dark green fill, pale green icon and green border. It contracts to 72px when a plan is present or the LIVE setup is shown, leaving room for the next action. A separate 12px label explains start, setup, unavailable, ended or connected behavior; accessible button names also follow those states. Before consent, activation opens the voice settings and scrolls them into view, using immediate scrolling for reduced motion. The connected state adds a 1.8s ease-in-out breathing glow; reduced motion disables it. The state follows the established voice connection, not measured microphone amplitude. The older settings orb is hidden inside the phone and is no longer the main control.

### Chips

The noninteractive source label uses amber text on a dark brown fill with a warm border, 12px bold text, 0.055em tracking and 5px by 8px padding. It describes simulation or device-trial provenance. Do not turn it into a decorative heading or invent hover states for it.

### Cards / Containers

The coordination panel retains panel fill, the border token, 10px corners and 20px padding. Inside the phone, companion content uses the screen fill without an extra border or corner radius, 20px side padding and a final 6px top inset beneath the sticky language strip. Nested place disclosures use panel 2, 8px corners and 10px padding. Coordination assignments are separated by border rules; primary names are cyan, support names blue and backup names amber. Unused assignments are reduced to 0.65 opacity but retain their textual role.

### Inputs / Fields

Workspace fields use background fill, pale text, the field border and 8px corners, retaining 11px by 12px padding and a 44px minimum height. General textareas retain a 100px minimum height and vertical resize; the phone request field overrides its minimum to 85px with 13px text. Field labels stay visible outside the control. Explicit companion field overrides now apply the same dark fill, field border and pale text.

### Navigation

The bottom dock contains companion, people and record controls with SVG icons and explicit pressed state. The selected item uses cyan text, dock-active fill and dock-rule border. The footer contains VI/EN switching, route links and an explicit AI-result state. The selected language now uses cyan fill, dark primary ink and a cyan border.

### Phone Simulator

The device is an interactive surface, not a static mockup. A shared sticky strip at the top of its screen keeps Guardian AI, New session and VI/EN controls available across companion, contact and record views. The internal navigation uses SVG icons, localized accessible names and explicit pressed states. Contact and record sheets stay inside the frame; switching tabs preserves the companion state. The contacts sheet contains a native invitation disclosure with recipient name, role, create-link action and selectable invitation output. Record content exposes plan/seal counts, recent events and the record link without leaving the phone composition. The status-bar clock derives from session data, while the island and hardware details are decorative.

### Tool Disclosures and Commitment Rows

Exploration and agent activity use native disclosures with panel fill, border, 8px corners and 14px horizontal padding. Their summaries have a 44px minimum height and 13px text. Exploration exposes simulated venues, operating-time filtering and explicitly unconfirmed reference routes. Activity views show source quotes and recorded events without implying that a visual tab establishes a particular transport architecture.

Commitment rows use 12px vertical padding, a fine top rule and a 7px internal gap. A bold name precedes a textual state and a 12px muted italic quote. Unresolved states remain amber; accepted uses cyan, revoked or declined uses red, and on-the-way or keep-contact uses blue. Assignment rows use 10px vertical padding and keep the role next to its person. Original quotes remain distinct from translated interface labels and proposed actions.

### Synthetic Map Conditions and Venue Details

Road overlays appear for a DEMO SOS, using amber for low light, lavender for quiet streets and red for incident flags. A 3px line at 0.9 opacity sits above a 15px blurred underlay at 0.45 opacity. The icon-and-text legend carries the same semantics. The map and discovery state expose simulation provenance; a selected road explicitly says its condition is simulated and not field verified. These layers are absent from the LIVE discovery view.

Open venues use category SVGs, a state badge and a name revealed on hover/focus. A selected venue opens an in-map details card with hours, open/closed text, staffing, waiting and first-aid capabilities, services, goods and limitations. `SIMULATED` stays beside synthetic venue profiles. Reception remains visibly unconfirmed until an original acceptance exists; confirmed reception changes both the status wording and icon. The recipient's editable venue profile uses the existing light-page fields and disclosure, and labels its contents as self-reported rather than acceptance.

### In-App Calls and LIVE Setup

The call board uses an 18px heading, a mode label, numeric activity summary and ruled disclosure rows. Each 64px-minimum summary carries a phone icon, recipient name, explicit call state and inquiry/task purpose. Conversing and completed names are blue; declined/error names are red. There is no cyan checkmark for call completion. Original turns appear in 12px-radius containers: assistant turns use panel 2, recipient turns use background, with 14px message text and 12px speaker/source metadata. Connection history, cancellation and limits remain progressively disclosed.

The recipient page stays in its light world. Its private call panel uses a dark panel fill, pale text, 16px corners and 24px padding, while retaining the recipient page's type family. Incoming calls expose Answer, Busy and Decline; connected conversations expose reply and end actions. Copy differentiates a support inquiry from a task sent after user acceptance. The panel shows that recipient's conversation, with statements attributed to their source. An in-app call is not presented as a telephone-network call.

The LIVE phone retains visible GPS readiness and consent. The compact AI explanation states that AI can activate an in-app SOS after consent and current GPS, while recipients must send their own acceptance. Plan acceptance and emergency dialing remain explicit user actions. Independent DEMO/LIVE mode labels, records and New session behavior prevent a simulated participant or commitment from appearing to be a LIVE one.

## Do's and Don'ts

### Do:
- Do use the scoped dark palette for operational workspace additions.
- Do preserve the map, companion and coordination hierarchy with the bottom dock.
- Do keep original replies and explicit acceptance status beside derived plans.
- Do retain visible keyboard focus and support Vietnamese and English text.
- Do keep reference routes visibly labeled as reception unconfirmed.

- Do label synthetic road conditions and venue profiles beside their visual overlays.

### Don't:
- Don't reintroduce the landing header into the operational workspace.
- Don't use a displayed route or open venue as proof of an accepted commitment.
- Don't apply the workspace palette globally to surfaces that still use their existing stylesheet.
- Don't treat this source documentation as browser or visual approval.
- Don't turn call completion, open hours or a self-reported profile into a confirmed commitment.
