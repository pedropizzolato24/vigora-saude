import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(join(__dirname, '..', 'site/_layout.html'), 'utf8');
const css = readFileSync(join(__dirname, '..', 'site/assets/site.css'), 'utf8');

describe('site: cabeçalho', () => {
  it('logo é uma meia-lua de path único, sem círculo de recorte', () => {
    const svg = layout.slice(layout.indexOf('<svg class="logo"'), layout.indexOf('</svg>'));
    expect(svg).toContain('<path class="logo-lua"');
    expect(svg).not.toContain('<circle');
    expect(css).not.toContain('logo-corte');
  });

  it('celular primeiro: links de seção escondidos por padrão, visíveis a partir de 40em', () => {
    expect(layout.match(/class="menu-extra"/g)?.length).toBe(2);
    expect(css).toMatch(/\.menu a\.menu-extra \{ display: none; \}/);
    expect(css).toMatch(/@media \(min-width: 40em\) \{[^}]*\{[^}]*\}\s*\.menu a\.menu-extra \{ display: inline-flex; \}/);
  });
});
