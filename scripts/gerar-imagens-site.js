// Gera site/assets/og-image.png (1200x630, prévia de link) e apple-touch-icon.png (180x180).
// Uso: node scripts/gerar-imagens-site.js (precisa do Playwright com Chromium).
/* global __dirname */
const { chromium } = require('playwright');
const path = require('path');
const R = path.resolve(__dirname, '..');
const fsys = require('fs');
const font = 'data:font/woff2;base64,' + fsys.readFileSync(path.join(R, 'site/assets/fonts/plus-jakarta-sans.woff2')).toString('base64');
const mono = 'data:font/woff2;base64,' + fsys.readFileSync(path.join(R, 'site/assets/fonts/space-mono.woff2')).toString('base64');
const LUA = 'M38.58 8.12A28 28 0 1 0 62.73 44.34A22 22 0 1 1 38.58 8.12Z';
const base = `<style>
@font-face{font-family:J;src:url(${font}) format("woff2");font-weight:200 800}
@font-face{font-family:M;src:url(${mono}) format("woff2")}
*{box-sizing:border-box;margin:0}body{font-family:J}</style>`;
const og = `${base}<body style="width:1200px;height:630px;background:#1E4D8C;color:#F4EFE5;padding:72px 80px;display:flex;flex-direction:column;justify-content:space-between;position:relative;overflow:hidden">
<div style="display:flex;align-items:center;gap:18px;font-weight:800;font-size:44px">
 <svg width="64" height="64" viewBox="0 0 72 72"><path d="${LUA}" fill="#F4EFE5"/></svg>Vigora</div>
<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:48px">
 <h1 style="font-weight:800;font-size:76px;line-height:1.04;letter-spacing:-0.025em;white-space:nowrap">Uma mensagem<span style="margin-left:-0.09em">,</span><br>na hora em que<br>ela importa<span style="margin-left:-0.09em">.</span></h1>
 <div style="flex:none;width:400px;margin-bottom:10px;background:#F4EFE5;color:#0E1417;border-radius:28px 28px 28px 8px;padding:26px 30px 16px;font-size:32px;font-weight:600;line-height:1.35;box-shadow:0 12px 32px rgba(14,20,23,.25)">
  A Lúcia não respondeu ao alarme das 8h00.<span style="display:block;text-align:right;font-family:M;font-size:26px;color:#5B636A;margin-top:8px">08:07</span></div>
</div></body>`;
const icon = `${base}<body style="width:180px;height:180px;background:#F4EFE5;display:flex;align-items:center;justify-content:center">
<svg width="132" height="132" viewBox="0 0 72 72"><path d="${LUA}" fill="#1E4D8C"/></svg></body>`;
(async () => {
  const b = await chromium.launch();
  for (const [html, w, h, out] of [[og, 1200, 630, 'og-image.png'], [icon, 180, 180, 'apple-touch-icon.png']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(R, 'site/assets', out) }); await p.close();
  }
  await b.close();
})();
