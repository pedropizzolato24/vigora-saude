import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  extractPlayStoreVersion,
  isNewerVersion,
  parseItunesLookup,
} from '@/lib/app-update-core';

describe('compareVersions / isNewerVersion', () => {
  it('versões iguais', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('patch/minor/major maiores', () => {
    expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(true);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('compara numericamente, não lexicograficamente', () => {
    expect(isNewerVersion('1.0.10', '1.0.9')).toBe(true);
    expect(isNewerVersion('1.0.9', '1.0.10')).toBe(false);
  });

  it('comprimentos diferentes (segmento ausente = 0)', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(isNewerVersion('1.0.1', '1.0')).toBe(true);
    expect(isNewerVersion('1.1', '1.0.5')).toBe(true);
  });

  it('segmentos não numéricos contam como 0', () => {
    expect(isNewerVersion('1.0.beta', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.1', '1.0.x')).toBe(true);
  });
});

describe('parseItunesLookup', () => {
  it('app não publicado (resultCount 0) → null', () => {
    expect(parseItunesLookup({ resultCount: 0, results: [] })).toBeNull();
  });

  it('resposta inválida → null', () => {
    expect(parseItunesLookup(null)).toBeNull();
    expect(parseItunesLookup({})).toBeNull();
    expect(parseItunesLookup({ results: [{}] })).toBeNull();
    expect(parseItunesLookup({ results: [{ version: 123 }] })).toBeNull();
  });

  it('resposta válida → versão + URL da loja', () => {
    const result = parseItunesLookup({
      resultCount: 1,
      results: [{ version: '1.2.0', trackViewUrl: 'https://apps.apple.com/br/app/id123' }],
    });
    expect(result).toEqual({ version: '1.2.0', storeUrl: 'https://apps.apple.com/br/app/id123' });
  });

  it('sem trackViewUrl → storeUrl null', () => {
    const result = parseItunesLookup({ results: [{ version: '1.2.0' }] });
    expect(result).toEqual({ version: '1.2.0', storeUrl: null });
  });
});

describe('extractPlayStoreVersion', () => {
  it('extrai a versão do blob de dados da página', () => {
    const html = 'xxx AF_initDataCallback({key:"ds:5",data:[[["2.1.3"]],[["Vigora"]]]}) yyy';
    expect(extractPlayStoreVersion(html)).toBe('2.1.3');
  });

  it('HTML sem o padrão → null (falha silenciosa)', () => {
    expect(extractPlayStoreVersion('<html><body>404</body></html>')).toBeNull();
    expect(extractPlayStoreVersion('')).toBeNull();
  });

  it('não casa com número simples sem pontos', () => {
    expect(extractPlayStoreVersion('[[["42"]]')).toBeNull();
  });
});
