---
name: Luminous Voyage
colors:
  surface: '#faf8ff'
  surface-dim: '#d2d9f4'
  surface-bright: '#faf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f3ff'
  surface-container: '#eaedff'
  surface-container-high: '#e2e7ff'
  surface-container-highest: '#dae2fd'
  on-surface: '#131b2e'
  on-surface-variant: '#434656'
  inverse-surface: '#283044'
  inverse-on-surface: '#eef0ff'
  outline: '#737688'
  outline-variant: '#c3c5d9'
  surface-tint: '#004dea'
  primary: '#0041c8'
  on-primary: '#ffffff'
  primary-container: '#0055ff'
  on-primary-container: '#e3e6ff'
  inverse-primary: '#b6c4ff'
  secondary: '#006b5b'
  on-secondary: '#ffffff'
  secondary-container: '#26fedc'
  on-secondary-container: '#007261'
  tertiary: '#4d5052'
  on-tertiary: '#ffffff'
  tertiary-container: '#65686a'
  on-tertiary-container: '#e5e8ea'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dce1ff'
  primary-fixed-dim: '#b6c4ff'
  on-primary-fixed: '#001551'
  on-primary-fixed-variant: '#0039b3'
  secondary-fixed: '#26fedc'
  secondary-fixed-dim: '#00dfc1'
  on-secondary-fixed: '#00201a'
  on-secondary-fixed-variant: '#005144'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#faf8ff'
  on-background: '#131b2e'
  surface-variant: '#dae2fd'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '800'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 20px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is centered on **Utility-Driven Modernism**. It prioritizes the trip and the collective memory over the individual user, evoking a sense of clarity, efficiency, and discovery. The emotional response should be one of "effortless orchestration"—where the complexity of travel planning is managed by an invisible, intelligent hand.

The style is a blend of **Minimalism** and **Modern Corporate**, utilizing heavy whitespace to reduce cognitive load during travel. The "AI" presence is manifested through precise, utilitarian interactions:
- **Build:** Structured, logical layout generation.
- **Optimize:** Real-time data density adjustments.
- **Sync:** Seamless, low-latency state transitions.

Visuals avoid "robotic" tropes (no glowing brains or circuit patterns) in favor of crisp execution and high-contrast information architecture.

## Colors

The palette is anchored by a high-performance **International Blue** and a vibrant **Electric Mint**. 

- **Primary (Blue):** Used for critical actions, active navigation states, and "Build" utility indicators.
- **Secondary (Mint):** Used sparingly for "Optimization" indicators, success states, and subtle highlights in travel timelines.
- **Background (White/Off-white):** Pure `#FFFFFF` for primary surfaces to ensure maximum legibility under sunlight.
- **Neutral:** A deep navy-slate for typography to ensure AA+ contrast ratios for on-the-go reading.

Color is used to denote state shifts: Blue for planning, Mint for active traveling, and soft Neutrals for remembering.

## Typography

This design system employs a tiered typography strategy to ensure legibility in high-glare or fast-paced travel environments. 

- **Headlines:** Use **Plus Jakarta Sans** with tight tracking and bold weights to create a strong visual anchor for destination names and trip titles.
- **Body:** **Inter** is used for all descriptive text and itinerary details due to its exceptional x-height and neutrality.
- **Data/Utility:** **JetBrains Mono** is used for "AI Utility" labels (e.g., coordinates, timestamps, "Optimizing..." status) to provide a technical, reliable feel without being decorative.

## Layout & Spacing

The design system utilizes a **12-column fluid grid** for desktop and a **4-column fluid grid** for mobile. 

**Layout Model:**
- **Home States:** 
    - *Planning:* Vertical stack of cards with generous white space for "Build" actions.
    - *Traveling:* Map-centric layout with high-density "Optimize" overlays.
    - *Remembering:* Masonry-style grid for "Syncing" memories and photos.
- **Navigation:** All primary navigation is contained within a 5-tab bottom bar. There is **no central FAB**. Primary actions are contextually placed within the view or the top-right header area.
- **Safe Zones:** 20px side margins on mobile to prevent accidental touches near the edge of the screen during transit.

## Elevation & Depth

Hierarchy is achieved through **Tonal Layering** rather than heavy shadows.

- **Level 0 (Base):** Primary background (`#FFFFFF`).
- **Level 1 (Cards):** Soft, low-opacity borders (`1px solid #E2E8F0`) with no shadow. Used for secondary information.
- **Level 2 (Active States):** A subtle, diffused blue-tinted shadow (`0px 4px 20px rgba(0, 85, 255, 0.08)`) is used only for the most critical active trip card.
- **Overlays:** Glassmorphism is used exclusively for "AI Utility" overlays (Build/Optimize/Sync status bars) with a 12px backdrop blur to maintain context of the map or list underneath.

## Shapes

The shape language is "Rounded-Modern." 

- **Standard Elements:** 0.5rem (8px) for buttons, input fields, and small cards.
- **Large Containers:** 1rem (16px) for main trip cards and bottom sheets.
- **Interactive Indicators:** Small 4px radii for "AI Utility" tags to differentiate them from standard UI elements.

This balance ensures the UI feels approachable yet structured enough for professional travel logistics.

## Components

### Bottom Navigation
A fixed 5-tab bar at the bottom of the viewport. No FAB.
- **Tabs:** Home, Explore, Picks, Trips, More.
- **Active State:** Primary Blue icon + Label.
- **Inactive State:** Slate-400 icon only.

### AI Utility Tags
Small, monospaced badges used for system-led actions.
- **Build Tag:** Blue background, white text.
- **Optimize Tag:** Mint background, dark text.
- **Sync Tag:** Subtle gray border, pulsing dot.

### Trip Cards
The core unit of the design system.
- **Planning State:** Focuses on "Next Steps" and "Add to Trip."
- **Traveling State:** Focuses on "Current Location" and "ETA."
- **Remembering State:** Focuses on "Photo Count" and "Shared With."

### Input Fields
High-contrast borders (1px Slate-200) that transition to 2px Blue on focus. Labels are always visible above the field in `label-sm` JetBrains Mono to ensure the user never loses context.

### Lists & Timelines
Vertical lines for itineraries use the Primary Blue. "Memory" lists use a softer, dashed line to indicate the past. No profile avatars are to be used in lists; use location icons or timestamp icons instead.