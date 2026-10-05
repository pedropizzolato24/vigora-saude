// Uso: node scripts/moon-icons.js [pasta-de-saida]  (padrão: assets/images)
// Gera os ícones da meia-lua do Vigora a partir da geometria da tela de login
// (viewBox 72): disco (36,36) r28 menos o recorte (48,28) r22; borda creme de 2
// unidades = disco r30 menos recorte r20. Sem SVG: cobertura por supersampling.
const path = require('path');
const Jimp = require('jimp-compact');

const BLUE = [0x1e, 0x4d, 0x8c];
const CREAM = [0xf4, 0xef, 0xe5];
const WHITE = [0xff, 0xff, 0xff];
const SS = 4; // amostras por eixo

const d = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
const isBlue = (x, y) => d(x, y, 36, 36) < 28 && d(x, y, 48, 28) > 22;
// Pontas do crescente = interseções dos dois círculos.
const TIPS = (() => {
  const [x1, y1, r1, x2, y2, r2] = [36, 36, 28, 48, 28, 22];
  const dd = d(x1, y1, x2, y2);
  const a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(r1 * r1 - a * a);
  const mx = x1 + (a * (x2 - x1)) / dd, my = y1 + (a * (y2 - y1)) / dd;
  return [
    [mx + (h * (y2 - y1)) / dd, my - (h * (x2 - x1)) / dd],
    [mx - (h * (y2 - y1)) / dd, my + (h * (x2 - x1)) / dd],
  ];
})();
// Distância exata até o crescente: arco externo (fora do recorte), arco interno
// (dentro do disco) ou uma das pontas. Borda = até 2 unidades da lua.
function distToMoon(x, y) {
  if (isBlue(x, y)) return 0;
  let best = Infinity;
  const r1 = d(x, y, 36, 36);
  const q1x = 36 + (28 * (x - 36)) / r1, q1y = 36 + (28 * (y - 36)) / r1;
  if (d(q1x, q1y, 48, 28) >= 22) best = Math.min(best, Math.abs(r1 - 28));
  const r2 = d(x, y, 48, 28);
  const q2x = 48 + (22 * (x - 48)) / r2, q2y = 28 + (22 * (y - 28)) / r2;
  if (d(q2x, q2y, 36, 36) <= 28) best = Math.min(best, Math.abs(r2 - 22));
  for (const [tx, ty] of TIPS) best = Math.min(best, d(x, y, tx, ty));
  return best;
}
const isRing = (x, y) => distToMoon(x, y) <= 2;

// Caixa da forma (com borda) para centralizar o crescente, não o círculo.
function bbox(test) {
  let x0 = 99, y0 = 99, x1 = -1, y1 = -1;
  for (let y = 0; y <= 72; y += 0.05)
    for (let x = 0; x <= 72; x += 0.05)
      if (test(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}
const BOX = bbox(isRing);

/**
 * size: lado do PNG; fill: fração do lado ocupada pela maior dimensão da forma;
 * bg: cor de fundo ou null (transparente); mono: silhueta branca sem borda.
 */
async function render(file, size, fill, bg, mono = false) {
  const img = new Jimp(size, size, 0x00000000);
  const w = BOX.x1 - BOX.x0, h = BOX.y1 - BOX.y0;
  const scale = (size * fill) / Math.max(w, h); // px por unidade
  const ox = (size - w * scale) / 2 - BOX.x0 * scale;
  const oy = (size - h * scale) / 2 - BOX.y0 * scale;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let nb = 0, nr = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS - ox) / scale;
          const y = (py + (sy + 0.5) / SS - oy) / scale;
          if (isBlue(x, y)) nb++;
          else if (!mono && isRing(x, y)) nr++;
        }
      const n = SS * SS;
      const fb = nb / n, fr = nr / n, cover = fb + fr;
      const fg = mono ? WHITE : BLUE;
      let r, g, b, a;
      if (bg) {
        const rest = 1 - cover;
        [r, g, b] = [0, 1, 2].map((i) => fg[i] * fb + CREAM[i] * fr + bg[i] * rest);
        a = 255;
      } else {
        if (cover === 0) continue;
        [r, g, b] = [0, 1, 2].map((i) => (fg[i] * fb + CREAM[i] * fr) / cover);
        a = 255 * cover;
      }
      img.setPixelColor(Jimp.rgbaToInt(Math.round(r), Math.round(g), Math.round(b), Math.round(a)), px, py);
    }
  }
  await img.writeAsync(file);
  console.log('ok', path.basename(file), size);
}

(async () => {
  const out = process.argv[2] ?? path.join(__dirname, '..', 'assets', 'images');
  await render(path.join(out, 'icon.png'), 1024, 0.6, CREAM);                    // iOS: precisa ser opaco
  await render(path.join(out, 'android-icon-foreground.png'), 1024, 0.55, null);  // dentro da zona segura de 66%
  await render(path.join(out, 'android-icon-monochrome.png'), 1024, 0.55, null, true);
  await render(path.join(out, 'splash-icon.png'), 1024, 0.8, null);
  await render(path.join(out, 'favicon.png'), 48, 0.9, null);
  const bg = new Jimp(1024, 1024, Jimp.rgbaToInt(...CREAM, 255));
  await bg.writeAsync(path.join(out, 'android-icon-background.png'));
  console.log('ok android-icon-background.png');
})().catch((e) => { console.error(e); process.exit(1); });
