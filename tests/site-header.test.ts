import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DESCRICAO_PADRAO, renderPage } from '../server/site';

const root = join(__dirname, '..');
const layout = readFileSync(join(root, 'site/_layout.html'), 'utf8');
const css = readFileSync(join(root, 'site/assets/site.css'), 'utf8');
const index = readFileSync(join(root, 'site/index.html'), 'utf8');

describe('site: cabeçalho', () => {
  it('logo é uma meia-lua de path único, sem círculo de recorte', () => {
    const svg = layout.slice(layout.indexOf('<svg class="logo"'), layout.indexOf('</svg>'));
    expect(svg).toContain('<path class="logo-lua"');
    expect(svg).not.toContain('<circle');
    expect(css).not.toContain('logo-corte');
  });

  it('celular: marca + "Entrar na lista" na 1ª linha, links na 2ª; desktop: uma linha', () => {
    const nav = layout.slice(layout.indexOf('<nav class="menu"'), layout.indexOf('</nav>'));
    expect(nav).toContain('Como funciona');
    expect(nav).toContain('Perguntas');
    expect(nav).not.toContain('menu-extra');
    // DOM: marca, botão, links. Celular: links com a largura toda (2ª linha).
    expect(layout.indexOf('class="btn btn-menu"')).toBeLessThan(layout.indexOf('<nav class="menu"'));
    expect(css).toMatch(/\.topo-interno \{[^}]*flex-wrap: wrap;/);
    expect(css).toMatch(/\.menu \{ flex-basis: 100%;/);
    // Desktop: uma linha, links antes do botão
    expect(css).toMatch(/@media \(min-width: 40em\) \{[^@]*\.menu \{ flex-basis: auto; order: 1; margin-left: auto;[^@]*\.btn-menu \{ order: 2; \}/);
  });

  it('fixo no topo (quando há altura), com âncoras compensadas e o "pular" por cima', () => {
    expect(css).toMatch(/@media \(min-height: 32em\) \{\s*\.topo \{ position: sticky; top: 0; z-index: 20; \}/);
    expect(css).toMatch(/scroll-padding-top/);
    expect(css).toMatch(/\.pular \{[^}]*z-index: 30;/);
  });
});

describe('site: head', () => {
  afterEach(() => {
    delete process.env.SITE_URL;
  });

  it('prévia de link com título, descrição, URL e imagem absolutas', () => {
    process.env.SITE_URL = 'https://exemplo.test';
    const html = renderPage({ title: 'Título <x>', content: '', path: '/', description: 'Desc "y"' });
    expect(html).toContain('<meta property="og:title" content="Título &lt;x&gt;">');
    expect(html).toContain('<meta name="description" content="Desc &quot;y&quot;">');
    expect(html).toContain('<meta property="og:description" content="Desc &quot;y&quot;">');
    expect(html).toContain('<meta property="og:url" content="https://exemplo.test/">');
    expect(html).toContain('<meta property="og:image" content="https://exemplo.test/assets/og-image.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(html).not.toMatch(/\{\{\w+\}\}/);
  });

  it('sem caminho (página com token), não divulga URL nem em og:url', () => {
    const html = renderPage({ title: 'x', content: '' });
    expect(html).not.toContain('og:url');
    expect(html).toContain(`content="${DESCRICAO_PADRAO}"`);
  });

  it('cor da barra do navegador nos dois temas e ícone do iPhone', () => {
    expect(layout).toContain('<meta name="theme-color" content="#EBE2CD" media="(prefers-color-scheme: light)">');
    expect(layout).toContain('<meta name="theme-color" content="#151C20" media="(prefers-color-scheme: dark)">');
    expect(layout).toContain('<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">');
  });

  it('imagens e fontes existem; fontes em woff2 e leves', () => {
    for (const f of ['og-image.png', 'apple-touch-icon.png']) {
      expect(existsSync(join(root, 'site/assets', f)), f).toBe(true);
    }
    for (const f of ['plus-jakarta-sans.woff2', 'space-mono.woff2']) {
      const p = join(root, 'site/assets/fonts', f);
      expect(statSync(p).size, f).toBeLessThan(60_000);
      expect(css).toContain(`url("/assets/fonts/${f}") format("woff2")`);
    }
    expect(css).not.toMatch(/\.ttf/);
  });
});

describe('site: aviso de "O que o Vigora não faz"', () => {
  it('fica no código, mas oculto; o rodapé de todas as páginas mantém o texto', () => {
    expect(index).toMatch(/<p class="disclaimer" hidden>Vigora é um aplicativo informativo/);
    expect(layout).toMatch(/<p class="aviso-legal">Vigora é um aplicativo informativo/);
  });
});
