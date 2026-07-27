# Vigora — Design System

## Color Strategy: Committed

O azul profundo carrega 30-60% da superfície em componentes de ação. Fundo creme quente.

## Palette

O app tem tema claro **e** escuro; todo token existe nos dois. Fonte de verdade: `theme.config.js` (consumido via `useColors()` ou classes NativeWind). **Nunca hardcode hex na UI.**

| Token | Light | Dark |
|---|---|---|
| `background` | `#F4EFE5` (creme) | `#0E1417` |
| `surface` | `#FFFFFF` | `#1A1714` (warm dark) |
| `bar` (barras sup./inf.) | `#EBE2CD` | `#151C20` |
| `primary` (azul profundo) | `#1E4D8C` | `#4A7EC4` |
| `accent` (terracota) | `#C96442` | `#D4784A` |
| `foreground` | `#0E1417` | `#F4EFE5` |
| `muted` | `#5B636A` | `#8A9298` |
| `border` | `#D8D1C2` | `#2D2722` |
| `success` | `#0F8A4A` | `#2CB966` |
| `warning` (âmbar) | `#F0C24A` | `#F5D06E` |
| `error` | `#D6161C` | `#F04040` |
| `emergency` (dead man's switch — não suavizar) | `#D6161C` | `#F04040` |

Complementares: `on*` (texto sobre fundo colorido), `*Light` (fundos ghost com alpha) e `emergencyDark` (`#9E0F14`, sombra 3D do botão SOS).

## Typography

- Display: Fraunces italic — headlines, wordmark, hero text
- Body: Plus Jakarta Sans — todo texto de interface
- Mono: Space Mono — timestamps, dados numéricos de saúde

## Font Sizes

Tamanhos base na escala `medium` (`lib/_core/font-scale.ts`); o usuário escolhe `small` (×0,85), `medium` (×1,0) ou `large` (×1,2).

| Papel | Base | `large` |
|---|---|---|
| `xs` / `sm` | 11 / 13px | 13 / 16px |
| `base` (corpo) | 15px | 18px |
| `md` (botão) | 16px | 19px |
| `lg` | 18px | 22px |
| `xl` (título) | 20px | 24px |
| `2xl` / `3xl` | 22 / 26px | 26 / 31px |
| `4xl` | 32px | 38px |

## Touch Targets

Piso absoluto de **44px** em qualquer escala; no modo acessível, ≥60px. A caixa escala junto com o texto (`touchTargetFor(base, scale)`) — texto crescendo dentro de botão parado é bug, não estilo.

## Spacing Scale

4, 8, 12, 16, 20, 24, 32, 40, 48, 64px

## Radius

- sm: 8px | md: 12px | lg: 18px | full: 9999px

## Elevation

- sm: 0 1px 3px rgba(14,20,23,0.08)
- md: 0 4px 12px rgba(14,20,23,0.12)
- lg: 0 8px 24px rgba(14,20,23,0.16)

## Component Notes

- Cards: superfície branca (#FFFFFF) sobre fundo creme — cria separação sutil e quente
- Botão primário: azul profundo + texto creme (contraste 7.2:1)
- Botão SOS: #D6161C — max legibility, nunca suavizar por estética
- Tabs: azul profundo como cor ativa
