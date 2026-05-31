# Vigora Saúde — Brand Kit

**Tagline:** Perto de você. Sempre.
**Version:** 1.0 — May 2026

---

## What's in This Kit

```
vigora-saude-brand-kit/
├── brand.md                     Machine-readable brand spec (paste into AI tools)
├── brand-guidelines.pdf         Full visual brand guidelines PDF
├── README.md                    This file
├── logo/
│   ├── symbol/                  Crescent moon mark — 3 color variants
│   ├── wordmark/                "Vigora Saúde" type treatment — 2 color variants
│   └── lockup/
│       ├── horizontal/          Symbol + wordmark side by side — 2 variants
│       └── stacked/             Symbol above wordmark — 2 variants
├── icons/                       12 SVG icons (stroke-based, currentColor)
├── fonts/
│   ├── Fraunces-Variable.ttf    Display font (italic headlines)
│   ├── PlusJakartaSans-Variable.ttf  Body font
│   ├── SpaceMono-Regular.ttf    Mono font
│   ├── SpaceMono-Bold.ttf
│   └── README.md                Font license + install instructions
├── tokens/
│   ├── tokens.css               CSS custom properties
│   ├── tokens.json              Design token JSON
│   └── tailwind.config.snippet.js  Drop into tailwind.config.js
└── prompts/
    ├── system-prompt.md         Paste into Claude/GPT for on-brand work
    ├── tweet.md                 Social post task starter
    ├── landing-hero.md          Hero copy task starter
    ├── email.md                 Email copy task starter
    ├── error-message.md         Error/empty state copy task starter
    └── photography.md           Image generation prompt template
```

---

## Which Logo File for Which Context

| Use case | File to use |
|---|---|
| App icon (iOS/Android) | `logo/symbol/symbol-blue-on-cream.svg` |
| App icon dark mode | `logo/symbol/symbol-cream-on-dark.svg` |
| Web header (light bg) | `logo/lockup/horizontal/lockup-h-blue.svg` |
| Web header (dark bg) | `logo/lockup/horizontal/lockup-h-cream.svg` |
| Splash screen | `logo/lockup/stacked/lockup-s-blue.svg` |
| Dark splash / loading | `logo/lockup/stacked/lockup-s-cream.svg` |
| Favicon | `logo/symbol/symbol-blue-on-cream.svg` (resize to 32×32) |
| Print materials (light) | `logo/lockup/horizontal/lockup-h-blue.svg` + `brand-guidelines.pdf` for specs |
| Email header | `logo/lockup/horizontal/lockup-h-blue.svg` |
| Wordmark only (no symbol) | `logo/wordmark/wordmark-blue.svg` or `wordmark-cream.svg` |

**Rule of thumb:**
- Cream background → use `-blue` variants
- Dark background → use `-cream` variants
- When in doubt → symbol-blue-on-cream for digital, lockup-h-blue for everything else

---

## Icons

All 12 icons are in `icons/`. They use `stroke="currentColor"` — set color via CSS or the `color` prop in React Native. Default size is 24×24px.

```html
<!-- Web: color via CSS -->
<img src="icons/heart.svg" style="color: #1E4D8C; width: 24px;">

<!-- Or inline SVG with color control -->
<svg ... stroke="#1E4D8C">...</svg>
```

```tsx
// React Native: use as Image or SvgUri
import HeartIcon from '@/assets/icons/heart.svg';
<HeartIcon width={24} height={24} color={colors.primary} />
```

---

## Font Installation

### Option 1 — Local TTF (for design tools / app builds)
Double-click each `.ttf` file in the `fonts/` folder and click "Install Font" (macOS) or "Install for all users" (Windows).

### Option 2 — Google Fonts (for web/CSS)
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,400..900&family=Plus+Jakarta+Sans:wght@300..800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

### Option 3 — Figma
1. Install fonts locally (Option 1)
2. Restart Figma
3. Fonts appear in the font picker as "Fraunces", "Plus Jakarta Sans", "Space Mono"

---

## Using brand.md with Claude or GPT

1. Open `brand.md` in any text editor and copy all contents
2. Paste at the top of a new Claude or ChatGPT conversation
3. Then give your task: "Using the brand spec above, write a push notification for..."

For the fastest setup, use `prompts/system-prompt.md` — it's a condensed version pre-formatted as a system prompt.

---

## Generating Brand-Style Photos

Open `prompts/photography.md`. It contains a master prompt template for:
- **DALL-E / gpt-image-2** (paste directly into ChatGPT)
- **Midjourney** (add `--ar 4:3 --style raw --v 6` to the end)
- **Stable Diffusion** (use as positive prompt; see negative prompt list in the file)

Three ready-to-use example prompts are included at the bottom of the file.

---

## Design Token Usage

### CSS
```css
@import './tokens/tokens.css';

.button-primary {
  background-color: var(--color-azul);
  color: var(--color-creme);
  font-family: var(--font-body);
  font-size: var(--font-size-button);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-5);
}
```

### Tailwind
Copy the contents of `tokens/tailwind.config.snippet.js` into your `tailwind.config.js` under `theme.extend`.

### React Native (NativeWind)
The token values in `tokens.json` match the NativeWind custom theme configuration in the app's `theme.config.js`.

---

## Brand Guidelines PDF

The `brand-guidelines.pdf` file contains the complete visual brand guidelines including:
- Logo usage rules with examples
- Color system with CMYK/Pantone equivalents
- Typography specimens
- Layout examples and grid
- Photography art direction

When in doubt, the PDF is the source of truth for visual decisions.

---

## Questions & Updates

Brand maintained by the Vigora Saúde product team.
For brand questions: design@vigora.com.br (placeholder — update with real contact)
