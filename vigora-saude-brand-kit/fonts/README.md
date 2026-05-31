# Vigora Saúde — Fonts

## License

All three typefaces are licensed under the SIL Open Font License (OFL), which permits:
- Free use in personal and commercial projects
- Redistribution as part of a brand kit or product
- Modification under the same license

## Typefaces

### Fraunces (Display)
- **Role:** Headlines, wordmark, display text — always italic
- **File:** `Fraunces-Variable.ttf` (variable font, covers opsz and wght axes)
- **Google Fonts:** https://fonts.google.com/specimen/Fraunces
- **GitHub source:** https://github.com/google/fonts/tree/main/ofl/fraunces

### Plus Jakarta Sans (Body)
- **Role:** Body text, UI labels, buttons, all readable prose
- **File:** `PlusJakartaSans-Variable.ttf` (variable font, wght axis)
- **Google Fonts:** https://fonts.google.com/specimen/Plus+Jakarta+Sans
- **GitHub source:** https://github.com/google/fonts/tree/main/ofl/plusjakartasans

### Space Mono (Mono)
- **Role:** Code snippets, data readouts, monospaced UI elements
- **Files:** `SpaceMono-Regular.ttf`, `SpaceMono-Bold.ttf`
- **Google Fonts:** https://fonts.google.com/specimen/Space+Mono
- **GitHub source:** https://github.com/google/fonts/tree/main/ofl/spacemono

## Installation

**macOS/Windows:** Double-click each `.ttf` file and click "Install Font."

**Web usage (HTML):**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,100..900&family=Plus+Jakarta+Sans:wght@300..800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
```

**CSS @font-face (self-hosted):**
```css
@font-face {
  font-family: 'Fraunces';
  src: url('./Fraunces-Variable.ttf') format('truetype');
  font-style: italic;
  font-weight: 100 900;
}

@font-face {
  font-family: 'Plus Jakarta Sans';
  src: url('./PlusJakartaSans-Variable.ttf') format('truetype');
  font-weight: 300 800;
}

@font-face {
  font-family: 'Space Mono';
  src: url('./SpaceMono-Regular.ttf') format('truetype');
  font-weight: 400;
}

@font-face {
  font-family: 'Space Mono';
  src: url('./SpaceMono-Bold.ttf') format('truetype');
  font-weight: 700;
}
```

## React Native (Expo)

Place the TTF files in `assets/fonts/` and load them with `expo-font`:
```typescript
const [fontsLoaded] = useFonts({
  'Fraunces-Italic': require('./assets/fonts/Fraunces-Variable.ttf'),
  'PlusJakartaSans': require('./assets/fonts/PlusJakartaSans-Variable.ttf'),
  'SpaceMono-Regular': require('./assets/fonts/SpaceMono-Regular.ttf'),
  'SpaceMono-Bold': require('./assets/fonts/SpaceMono-Bold.ttf'),
});
```
