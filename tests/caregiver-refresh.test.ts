import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setEventListener = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  focusManager: { setEventListener: (...a: unknown[]) => setEventListener(...a) },
}));

const remove = vi.fn();
const addEventListener = vi.fn((_event: string, _handler: (state: string) => void) => ({ remove }));
vi.mock('react-native', () => ({
  AppState: { addEventListener: (event: string, handler: (state: string) => void) => addEventListener(event, handler) },
}));

import { installQueryFocusManager } from '../lib/query-focus';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('installQueryFocusManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('instala uma vez só e trata "app ativo" como foco', () => {
    installQueryFocusManager();
    installQueryFocusManager();
    expect(setEventListener).toHaveBeenCalledTimes(1);

    // O React Query chama o "setup" com o handleFocus dele.
    const setup = setEventListener.mock.calls[0][0] as (
      handleFocus: (focused: boolean) => void
    ) => () => void;
    const handleFocus = vi.fn();
    const cleanup = setup(handleFocus);

    const onChange = addEventListener.mock.calls[0][1] as (state: string) => void;
    onChange('active');
    onChange('background');
    expect(handleFocus.mock.calls).toEqual([[true], [false]]);

    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('telas do cuidador', () => {
  it('as consultas recarregam ao voltar ao app', () => {
    for (const file of ['index.tsx', 'person.tsx', 'alerts.tsx']) {
      const src = read(`app/(caregiver-tabs)/${file}`);
      expect(src, file).toMatch(/refetchOnWindowFocus: true/);
    }
  });

  it('as telas têm puxar para atualizar e a linha "Atualizado"', () => {
    for (const file of ['index.tsx', 'person.tsx', 'alerts.tsx']) {
      const src = read(`app/(caregiver-tabs)/${file}`);
      expect(src, file).toMatch(/CaregiverRefreshControl/);
      expect(src, file).toMatch(/<UpdatedAgoBar/);
    }
  });

  it('o layout raiz instala o focusManager', () => {
    expect(read('app/_layout.tsx')).toMatch(/installQueryFocusManager\(\)/);
  });

  it('push recebido com o app aberto recarrega os dados', () => {
    const src = read('components/caregiver-push-initializer.tsx');
    expect(src).toMatch(/addNotificationReceivedListener/);
    expect(src).toMatch(/getMonitoredAlerts\.invalidate/);
    expect(src).toMatch(/getMonitoredData\.invalidate/);
  });
});
