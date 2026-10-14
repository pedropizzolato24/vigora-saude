// No Android o ScrollView faz cloneElement(refreshControl, { style }, <NativeScrollView>conteúdo</NativeScrollView>):
// o refreshControl PRECISA repassar `children` e `style`, senão a tela fica em branco.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  ActivityIndicator: 'ActivityIndicator',
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  Text: 'Text',
  View: 'View',
}));
vi.mock('@expo/vector-icons/MaterialIcons', () => ({ default: 'MaterialIcons' }));
vi.mock('@/hooks/use-colors', () => ({ useColors: () => ({ primary: '#abc' }) }));
vi.mock('@/lib/accessibility-context', () => ({ useAccessibility: () => ({}) }));
vi.mock('@/lib/_core/theme', () => ({ BrandFonts: {} }));
vi.mock('@/lib/caregiver-format', () => ({ relativeTime: () => '' }));
vi.mock('@/lib/font-size-context', () => ({ useFontSize: () => ({}) }));

import { CaregiverRefreshControl } from '@/components/caregiver-refresh';

const root = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) return sourceFiles(rel);
    return rel.endsWith('.tsx') ? [rel] : [];
  });
}

describe('CaregiverRefreshControl', () => {
  it('repassa children e style ao RefreshControl (contrato do ScrollView no Android)', () => {
    const child = { type: 'NativeScrollView', props: {} };
    const style = { flex: 1 };
    const el = CaregiverRefreshControl({
      refreshing: false,
      onRefresh: () => {},
      children: child as never,
      style,
    }) as unknown as { type: unknown; props: Record<string, unknown> };

    expect(el.type).toBe('RefreshControl');
    expect(el.props.children).toBe(child);
    expect(el.props.style).toBe(style);
    expect(el.props.refreshing).toBe(false);
  });

  it('pinta o spinner do Android (colors) e do iOS (tintColor) com o token primário', () => {
    const el = CaregiverRefreshControl({ refreshing: true, onRefresh: () => {} }) as unknown as {
      props: Record<string, unknown>;
    };
    expect(el.props.tintColor).toBe('#abc');
    expect(el.props.colors).toEqual(['#abc']);
  });
});

describe('refreshControl={...} no app', () => {
  it('só usa RefreshControl ou CaregiverRefreshControl (wrappers que perdem children quebram o Android)', () => {
    const used = new Set<string>();
    for (const file of [...sourceFiles('app'), ...sourceFiles('components')]) {
      const src = readFileSync(join(root, file), 'utf8');
      for (const m of src.matchAll(/refreshControl=\{\s*<(\w+)/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((n) => n !== 'RefreshControl' && n !== 'CaregiverRefreshControl')).toEqual([]);
  });
});
