---
name: GoKoreaMate
colors:
  surface: '#f9f9fc'
  surface-dim: '#dadadc'
  surface-bright: '#f9f9fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f6'
  surface-container: '#eeeef0'
  surface-container-high: '#e8e8ea'
  surface-container-highest: '#e2e2e5'
  on-surface: '#1a1c1e'
  on-surface-variant: '#434654'
  inverse-surface: '#2f3133'
  inverse-on-surface: '#f0f0f3'
  outline: '#737685'
  outline-variant: '#c3c6d6'
  surface-tint: '#0c56d0'
  primary: '#003d9b'
  on-primary: '#ffffff'
  primary-container: '#0052cc'
  on-primary-container: '#c4d2ff'
  inverse-primary: '#b2c5ff'
  secondary: '#006a6a'
  on-secondary: '#ffffff'
  secondary-container: '#6ef3f3'
  on-secondary-container: '#006e6e'
  tertiary: '#7b2600'
  on-tertiary: '#ffffff'
  tertiary-container: '#a33500'
  on-tertiary-container: '#ffc6b2'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001848'
  on-primary-fixed-variant: '#0040a2'
  secondary-fixed: '#72f6f6'
  secondary-fixed-dim: '#50dad9'
  on-secondary-fixed: '#002020'
  on-secondary-fixed-variant: '#004f4f'
  tertiary-fixed: '#ffdbcf'
  tertiary-fixed-dim: '#ffb59b'
  on-tertiary-fixed: '#380d00'
  on-tertiary-fixed-variant: '#812800'
  background: '#f9f9fc'
  on-background: '#1a1c1e'
  surface-variant: '#e2e2e5'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
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
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  container-max: 1200px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style
The design system for this platform balances professional reliability with the warmth of a local companion. The brand personality is **Inspirational, Organized, and Welcoming**, targeting travelers who seek structured yet authentic Korean experiences.

The aesthetic follows a **Modern Corporate** foundation infused with **Glassmorphism** and **Tactile** elements. This ensures the platform feels like a high-end service while remaining approachable. Key visual drivers include high-quality photography, generous whitespace to reduce cognitive load during trip planning, and a "Dynamic Thematic" approach where city-specific colors subtly shift the UI's accent to match the destination's soul.

## Colors
The core identity is anchored by "Mate Blue" (#0052CC), symbolizing trust and professional guidance. A "Discovery Teal" (#00B2B2) serves as the primary action color for general exploration.

To evoke the specific atmosphere of Korean cities, the design system employs a **Thematic Swap** mechanism. When a user enters a city-specific flow, the accent tokens transition:
- **Busan:** High-energy blues and evening purples reflecting the coastal nightlife.
- **Gyeongju:** Sophisticated earth tones and royal gold honoring Silla dynasty heritage.
- **Seoul:** High-contrast neons and slates representing the intersection of tech and tradition.
- **Jeju:** Organic greens and volcanic greys inspired by the island’s natural basalt and flora.

Backgrounds remain primarily white (#FFFFFF) or light grey (#F8F9FA) to ensure photography remains the focal point.

## Typography
This design system utilizes **Inter** for its exceptional legibility and modern, neutral character, allowing the vibrant photography and city colors to take center stage. 

Typography uses tight tracking for headlines to create a sense of professional authority. Body text maintains a generous line height (1.5x) to ensure readability during long-form itinerary planning. Weights are used purposefully: **SemiBold (600)** for navigation and interactive labels, and **Bold (700)** for structural headings.

## Layout & Spacing
The layout follows a **Fluid Grid** model with a soft 8px rhythm. 
- **Desktop:** A 12-column grid with a 1200px max-width. Large gutters (24px) prevent the UI from feeling cramped.
- **Tablet:** A 6-column grid with 24px margins.
- **Mobile:** A 2-column or single-stack layout with 16px horizontal margins.

Whitespace is used as a functional tool to group related travel content. Itinerary steps use vertical connectors with 32px of spacing between activities to imply a timeline flow.

## Elevation & Depth
The system uses **Ambient Shadows** and **Tonal Layers** to create a sense of "physicality." 
- **Low Elevation:** Used for standard cards. A very soft, diffused shadow (0px 4px 20px rgba(0, 0, 0, 0.05)) helps images pop from the white background.
- **Medium Elevation:** Used for hover states and dropdowns. The shadow becomes deeper and slightly more opaque.
- **High Elevation:** Reserved for the 'Build My Trip' Floating Action Button (FAB) and modal overlays. These use a shadow with a subtle tint of the primary color (e.g., #0052CC at 15% opacity) to create a glowing effect.
- **Backdrop Blur:** Navigational headers and city selection sheets use a 12px blur with 80% opacity to maintain context while ensuring legibility.

## Shapes
A **Rounded** (0.5rem base) shape language is applied to the design system to evoke friendliness. 
- **Cards & Inputs:** 1rem (rounded-lg) for a modern, approachable look.
- **Buttons & Chips:** Fully rounded (pill-shaped) to encourage interaction and touch-friendliness.
- **Images:** Always feature a minimum of 1rem corner radius to soften the visual impact of photography.

## Components
- **Image-Focused Cards:** Large aspect ratios (16:9 or 4:3) with a gradient overlay at the bottom for white text legibility. Labels (e.g., Price, Rating) are placed in semi-transparent "glass" chips over the image.
- **Buttons:** 
  - *Primary:* Solid fill with the current city accent color.
  - *Ghost:* Outlined with a 1.5px border for secondary actions.
- **Floating Action Button (FAB):** The "Build My Trip" button is a large, circular icon button that follows the user. On scroll, it may expand into a pill-shape with a label.
- **Selection States:** When a city or activity is "Added," the component border thickens to 2px in the accent color, and a checkmark icon appears in a high-contrast circle at the top-right.
- **City Swapper:** A horizontal scrolling list of chips with distinct icons (e.g., a Namsan Tower icon for Seoul) that changes the global accent theme upon selection.
- **Input Fields:** Soft grey backgrounds (#F1F3F5) with 0.5rem padding and a 2px accent border that appears only on focus.