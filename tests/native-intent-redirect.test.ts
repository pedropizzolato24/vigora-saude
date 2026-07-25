import { describe, expect, it } from 'vitest';
import { redirectSystemPath } from '../app/+native-intent';

describe('redirectSystemPath (deep links da notificação de alarme)', () => {
  it('extrai o alarmId do uid base', () => {
    expect(
      redirectSystemPath({ path: 'vigora://alarm-ring?uid=vigora_abc123', initial: true })
    ).toBe('/alarm-ring?alarmId=abc123');
  });

  it('extrai o alarmId de uid por dia da semana e de soneca', () => {
    expect(
      redirectSystemPath({ path: 'vigora://alarm-ring?uid=vigora_abc123_wd2', initial: false })
    ).toBe('/alarm-ring?alarmId=abc123');
    expect(
      redirectSystemPath({ path: 'vigora://alarm-ring?uid=vigora_abc123_snooze', initial: false })
    ).toBe('/alarm-ring?alarmId=abc123');
  });

  it('repassa snooze=1 do botão Soneca da notificação', () => {
    expect(
      redirectSystemPath({ path: 'vigora://alarm-ring?uid=vigora_abc123&snooze=1', initial: true })
    ).toBe('/alarm-ring?alarmId=abc123&snooze=1');
  });

  it('não inventa snooze quando o parâmetro não veio', () => {
    expect(
      redirectSystemPath({ path: 'vigora://alarm-ring?uid=vigora_abc123&snooze=0', initial: true })
    ).toBe('/alarm-ring?alarmId=abc123');
  });

  it('preserva a query do oauthredirect', () => {
    expect(
      redirectSystemPath({ path: 'vigora://oauthredirect?code=xyz&state=1', initial: true })
    ).toBe('/oauthredirect?code=xyz&state=1');
  });

  it('deixa demais paths inalterados', () => {
    expect(redirectSystemPath({ path: '/qualquer-coisa', initial: false })).toBe('/qualquer-coisa');
  });
});
