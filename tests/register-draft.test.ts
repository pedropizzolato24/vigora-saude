/**
 * Rascunho do cadastro — é ele que decide, no startup, se o usuário volta ao
 * formulário (/register) ou ao login. Formulário em branco NÃO pode virar
 * rascunho: era o caso de "Continuar sem conta", que prendia o usuário na tela
 * de cadastro a cada abertura do app.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn(async (k: string) => {
      store.delete(k);
    }),
  },
}));

import {
  clearRegisterDraft,
  hasRegisterDraft,
  loadRegisterDraft,
  saveRegisterDraft,
  type RegisterDraft,
} from '../lib/register-draft';

const EMPTY: RegisterDraft = {
  name: '',
  phone: '',
  birthDate: '',
  bloodType: null,
  userType: null,
  healthConsent: false,
};

describe('register-draft', () => {
  beforeEach(() => {
    store.clear();
  });

  it('formulário em branco não vira rascunho', async () => {
    await saveRegisterDraft(EMPTY);
    expect(await hasRegisterDraft()).toBe(false);
  });

  it('campo só com espaços continua sendo em branco', async () => {
    await saveRegisterDraft({ ...EMPTY, name: '   ' });
    expect(await hasRegisterDraft()).toBe(false);
  });

  it('qualquer campo preenchido vira rascunho e é restaurado', async () => {
    await saveRegisterDraft({ ...EMPTY, name: 'Maria', phone: '(11) 99999-9999' });
    expect(await hasRegisterDraft()).toBe(true);
    const draft = await loadRegisterDraft();
    expect(draft?.name).toBe('Maria');
    expect(draft?.phone).toBe('(11) 99999-9999');
  });

  it('escolher só o tipo de conta já conta como cadastro iniciado', async () => {
    await saveRegisterDraft({ ...EMPTY, userType: 'monitored' });
    expect(await hasRegisterDraft()).toBe(true);
  });

  it('apagar o que foi digitado descarta o rascunho', async () => {
    await saveRegisterDraft({ ...EMPTY, name: 'Maria' });
    await saveRegisterDraft(EMPTY);
    expect(await hasRegisterDraft()).toBe(false);
  });

  it('concluir o cadastro limpa o rascunho', async () => {
    await saveRegisterDraft({ ...EMPTY, name: 'Maria' });
    await clearRegisterDraft();
    expect(await hasRegisterDraft()).toBe(false);
    expect(await loadRegisterDraft()).toBeNull();
  });
});
