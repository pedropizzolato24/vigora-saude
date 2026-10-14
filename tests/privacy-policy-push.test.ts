import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('a Política de Privacidade cita os provedores de push e avisa que o nome do lembrete pode aparecer', () => {
  const settings = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'settings.tsx'), 'utf8');
  expect(settings).toMatch(/Expo, Google e Apple \(notificações push aos cuidadores/);
  expect(settings).toMatch(/pode mostrar o nome do lembrete/);
});
