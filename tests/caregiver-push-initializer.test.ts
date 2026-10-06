import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('caregiver-push-initializer', () => {
  it('não engole erro com catch vazio', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'caregiver-push-initializer.tsx'), 'utf8');
    expect(src).not.toMatch(/catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
    expect(src).toMatch(/console\.warn\(`\[caregiver-push\]/);
  });
});
