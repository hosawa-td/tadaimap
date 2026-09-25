---
name: Warm Hearth Presence
colors:
  surface: '#fef9f1'
  surface-dim: '#ded9d2'
  surface-bright: '#fef9f1'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f3eb'
  surface-container: '#f2ede5'
  surface-container-high: '#ece8e0'
  surface-container-highest: '#e7e2da'
  on-surface: '#1d1c17'
  on-surface-variant: '#44474b'
  inverse-surface: '#32302b'
  inverse-on-surface: '#f5f0e8'
  outline: '#74777c'
  outline-variant: '#c4c6cc'
  surface-tint: '#53606d'
  primary: '#030e19'
  on-primary: '#ffffff'
  primary-container: '#182430'
  on-primary-container: '#7f8b9a'
  inverse-primary: '#bbc8d8'
  secondary: '#825500'
  on-secondary: '#ffffff'
  secondary-container: '#ffb233'
  on-secondary-container: '#6d4700'
  tertiary: '#001105'
  on-tertiary: '#ffffff'
  tertiary-container: '#002a13'
  on-tertiary-container: '#639671'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d7e4f4'
  primary-fixed-dim: '#bbc8d8'
  on-primary-fixed: '#101d28'
  on-primary-fixed-variant: '#3c4855'
  secondary-fixed: '#ffddb3'
  secondary-fixed-dim: '#ffb94f'
  on-secondary-fixed: '#291800'
  on-secondary-fixed-variant: '#624000'
  tertiary-fixed: '#b9efc5'
  tertiary-fixed-dim: '#9dd3aa'
  on-tertiary-fixed: '#00210e'
  on-tertiary-fixed-variant: '#1e5031'
  background: '#fef9f1'
  on-background: '#1d1c17'
  surface-variant: '#e7e2da'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-lg:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 26px
  title-md:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
  label-md:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Noto Sans
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system expresses safety, quiet reassurance, and domestic warmth. Created for a family presence tracking application, the interface avoids the cold, invasive feel of surveillance tools in favor of an atmosphere reminiscent of walking into a softly lit home with dinner on the table.

The aesthetic fuses Japanese minimal clarity with tactile warmth:
- **Tone:** Gentle, reliable, protective, calm.
- **Audience:** Multigenerational families, parents checking children's safe arrivals, and partners coordinating homecomings without unnecessary messaging friction.
- **Visual Stance:** Soft-minimalism with generous pill shapes, creamy layered surfaces, and high-legibility typographic scale. Shadows are extremely diffuse and barely noticeable; depth is communicated almost entirely via soft tone-on-tone container fills.

## Colors

The palette grounds itself in comforting natural tones:

- **Primary (`#182430` - Deep Navy):** Anchors headlines, primary text, high-priority icons, and major interactive anchors. Provides high-contrast clarity without the harshness of pure black.
- **Secondary / Accent (`#D9920A` / `#E69A12` - Warm Amber):** Highlights active state markers, cheerful family updates, urgent alerts, and the signature "帰宅" (returning/arrived) notification energy.
- **Tertiary / Home Status (`#4A7C59` - Gentle Sage):** Denotes the peaceful state of "在宅" (at home/safe).
- **Away / Inactive Status (`#7D8A99` - Soft Slate):** Conveys "外出中" (away/in transit) in an unobtrusive, low-alarm tone.
- **Base Background (`#FDF8F0` - Warm Cream):** Canvas tint that reduces eye strain and feels organic.
- **Surface Elevation (`#FFFFFF` - Pure Off-White):** Used for elevated cards, avatar containers, and input sheets.
- **Subtle Surface Fills (`#F5E6D3` / `#EFE2CF` - Warm Sand):** Used for secondary action buttons, inactive state chips, and unread background tracks.

## Typography

Typography prioritizes bilingual legibility across Latin figures and Japanese Kanji/Kana characters.

- **Display & Large Numerals:** Rendered in `Plus Jakarta Sans` for soft, geometric warmth that mirrors rounded UI geometry.
- **Body, Captions & Status Labels:** Rendered in `Noto Sans` (with Japanese fallback `Noto Sans JP`) to ensure legibility across all generations, including elders and small children reading status notices.
- **Rhythm:** Generous line heights (`1.5` to `1.6`) ensure Japanese text flows smoothly without cognitive density.

## Layout & Spacing

Designed primarily for single-hand mobile interactions (390px base portrait viewport).

- **Grid & Alignment:** 4-column fluid mobile grid with `16px` (`1rem`) gutters and `20px` (`1.25rem`) safe edge margins.
- **Touch Targets:** Minimum touch height for interactive targets is 48px to support quick, effortless tapping while commuting or multitasking.
- **Vertical Cadence:** Multi-tier stacking keeps the home status map or member listing centered, while quick-reaction drawers dock cleanly along bottom navigation bars with safe-area padding.

## Elevation & Depth

Visual hierarchy uses **tonal layer nesting** and **ambient color diffusion** rather than traditional structural drop shadows.

- **Level 0 (Canvas):** Base warm cream `#FDF8F0`.
- **Level 1 (Card / List Item):** Pure `#FFFFFF` surface resting on Level 0. Casts an ultra-soft shadow: `0 4px 20px -2px rgba(24, 36, 48, 0.04)`.
- **Level 2 (Floating Action / Sheet):** Raised modals and floating status chips use `#FFFFFF` backed with `0 12px 32px -4px rgba(24, 36, 48, 0.08)`.
- **Tonal Insets:** Inactive or recessed zones (such as timestamp chips, history log containers, and search bars) use solid tint surfaces `#F5E6D3` with no shadows.

## Shapes

The design uses a generous, organic shape language:

- Standard cards and sheet surfaces utilize `rounded-2xl` (`1.5rem / 24px`) or `rounded-3xl` (`2rem / 32px`).
- Buttons, status badges, and search bars adopt full pill contours (`rounded-full`).
- Family member avatars are circular with a 3px solid border tinted to match their live status color (Sage for at home, Amber for in transit, Slate for away).

## Components

### Buttons
- **Primary:** Deep Navy (`#182430`) background, crisp white label, pill-shaped (`rounded-full`), height 52px. Active press state shifts subtly to `#243547`.
- **Secondary / Warm:** Sand tint (`#F5E6D3`) background with Deep Navy label (`#182430`). Height 48px.
- **Quick Action ("ただいま" / Arrived):** Amber Orange (`#D9920A`) background, white bold label, icon prepended.

### Status Chips & Badges
- **"在宅" (Home):** Soft sage background (`rgba(74, 124, 89, 0.12)`) with deep sage text (`#2D5237`), prepended by a solid green pulse dot.
- **"外出中" (Away):** Soft slate background (`rgba(125, 138, 153, 0.15)`) with muted slate text (`#475361`).
- **"移動中 / 帰宅中" (Heading Home):** Warm amber background (`rgba(217, 146, 10, 0.15)`) with amber text (`#996400`).

### Family Member Cards
- Surface: Flat white `#FFFFFF` with `rounded-3xl` corners and `space-md` internal padding.
- Left: 56px avatar with colored status ring.
- Center: Member name in `title-md`, followed by location/timestamp in `body-sm` (`#7D8A99`).
- Right: Dynamic status pill showing current presence mode.

### Inputs & Search
- Container: Filled `#F5E6D3` at 48px height, `rounded-full`, with Deep Navy placeholder text at 50% opacity.
- Focus State: Smooth outline transition to Amber Orange (`#D9920A`) 2px border, background shifting to `#FFFFFF`.

### Checkboxes & Radios
- Rounded circular checkboxes (24px) that feel like gentle stamps. Checked state fills with `#D9920A` and features a bold white checkmark.