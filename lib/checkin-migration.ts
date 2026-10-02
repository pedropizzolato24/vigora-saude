/**
 * checkin-migration.ts
 *
 * Migra o check-in diário antigo (notificações `checkin_prompt`/`checkin_timeout`
 * + `settings.checkin*`) para um alarme `kind: 'checkin'`, uma vez por conta.
 *
 * Regras:
 *  - Só migra quem tinha o check-in LIGADO; desligado vira "nada a fazer".
 *  - Idempotente: se já existe um check-in na lista (migração interrompida),
 *    não cria outro — só desarma o sistema antigo e marca como feito.
 *  - Falhou agendar (ou sem espaço nos 24 alarmes): o sistema antigo CONTINUA
 *    valendo e a próxima abertura tenta de novo. Ficar sem check-in é pior do
 *    que ter dois por um dia.
 *  - Duas chamadas ao mesmo tempo (duas aberturas do app, remontagem do
 *    componente) compartilham a mesma execução: um alarme só.
 */
import type { Alarm } from '@/lib/app-context';
import { MAX_ALARMS } from '@/components/pro-limits';
import { MIGRATED_CHECKIN_ESCALATE_MINUTES, checkinAlarms } from '@/lib/alarm-kind';

export interface LegacyCheckinSettings {
  checkinEnabled?: boolean;
  checkinTime?: string;
}

export interface MigrationDeps {
  isDone(): Promise<boolean>;
  markDone(): Promise<void>;
  scheduleAlarm(alarm: Alarm): Promise<Alarm>;
  addAlarm(alarm: Alarm): void;
  /** Desliga `settings.checkinEnabled`: o CheckinInitializer antigo se desarma sozinho. */
  disableLegacy(): void;
  newId(): string;
}

export type MigrationOutcome = 'skipped' | 'nothing' | 'migrated' | 'failed';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function buildMigratedCheckin(
  settings: LegacyCheckinSettings,
  alarms: Alarm[],
  id: string
): Alarm | null {
  if (!settings.checkinEnabled) return null;
  if (checkinAlarms(alarms).length > 0) return null;
  const time = settings.checkinTime ?? '';
  if (!TIME_RE.test(time)) return null;
  return {
    id,
    time: time.padStart(5, '0'),
    description: 'Check-in',
    enabled: true,
    repeat: 'daily',
    customDays: [],
    sound: true,
    vibration: true,
    kind: 'checkin',
    escalateAfterMinutes: MIGRATED_CHECKIN_ESCALATE_MINUTES,
  };
}

let inFlight: Promise<MigrationOutcome> | null = null;

export function migrateLegacyCheckin(
  state: { alarms: Alarm[]; settings: LegacyCheckinSettings },
  deps: MigrationDeps
): Promise<MigrationOutcome> {
  if (inFlight) return inFlight;
  inFlight = run(state, deps).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(
  state: { alarms: Alarm[]; settings: LegacyCheckinSettings },
  deps: MigrationDeps
): Promise<MigrationOutcome> {
  if (await deps.isDone()) return 'skipped';

  const alarm = buildMigratedCheckin(state.settings, state.alarms, deps.newId());
  if (alarm) {
    if (state.alarms.length >= MAX_ALARMS) {
      console.warn('[CheckinMigration] 24 alarmes já cadastrados — o check-in antigo continua valendo.');
      return 'failed';
    }
    try {
      deps.addAlarm(await deps.scheduleAlarm(alarm));
    } catch (error) {
      console.error('[CheckinMigration] não foi possível agendar o check-in migrado:', error);
      return 'failed';
    }
  }
  if (state.settings.checkinEnabled) deps.disableLegacy();
  await deps.markDone();
  return alarm ? 'migrated' : 'nothing';
}
