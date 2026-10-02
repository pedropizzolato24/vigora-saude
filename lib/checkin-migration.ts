/**
 * checkin-migration.ts
 *
 * Migra o check-in diário antigo (notificações `checkin_prompt`/`checkin_timeout`
 * + `settings.checkin*`) para um alarme `kind: 'checkin'`.
 *
 * A decisão é tomada sobre o estado SINCRONIZADO, não sobre uma marca local:
 * `settings.checkinEnabled` viaja no backup da nuvem, então `false` é o marcador
 * durável de "já migrado / nunca ligado" em qualquer aparelho. Quem restaura de
 * outro aparelho (ou reinstala) com `checkinEnabled: true` e sem alarme de
 * check-in é migrado quando esse estado chega.
 *
 * Regras:
 *  - `checkinEnabled` true e nenhum alarme de check-in: cria o alarme, agenda,
 *    e só então desliga o sistema antigo.
 *  - `checkinEnabled` true e já existe check-in: não cria outro, só desliga o antigo.
 *  - Falhou agendar (ou sem espaço nos MAX_ALARMS): o sistema antigo CONTINUA
 *    valendo e a próxima avaliação tenta de novo. Ficar sem check-in é pior do
 *    que ter dois por um dia.
 *  - O alarme migrado tem id fixo e o ADD_ALARM do reducer é idempotente por id
 *    (substitui no lugar): se um estado da nuvem já trouxe o mesmo alarme enquanto
 *    o agendamento esperava, não há duplicata no estado; o agendador nativo também
 *    é chaveado pelo id.
 *  - Duas chamadas ao mesmo tempo compartilham a mesma execução: um alarme só.
 */
import type { Alarm } from '@/lib/app-context';
import { MAX_ALARMS } from '@/components/pro-limits';
import {
  MIGRATED_CHECKIN_ALARM_ID,
  MIGRATED_CHECKIN_ESCALATE_MINUTES,
  checkinAlarms,
} from '@/lib/alarm-kind';

export interface LegacyCheckinSettings {
  checkinEnabled?: boolean;
  checkinTime?: string;
}

export interface MigrationDeps {
  scheduleAlarm(alarm: Alarm): Promise<Alarm>;
  addAlarm(alarm: Alarm): void;
  /** Desliga `settings.checkinEnabled`: o CheckinInitializer antigo se desarma sozinho. */
  disableLegacy(): void;
}

export type MigrationOutcome = 'nothing' | 'migrated' | 'failed';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
/** Padrão do sistema antigo (lib/checkin-defaults.ts, removido numa tarefa posterior). */
const LEGACY_DEFAULT_CHECKIN_TIME = '09:00';

export function buildMigratedCheckin(
  settings: LegacyCheckinSettings,
  alarms: Alarm[]
): Alarm | null {
  if (!settings.checkinEnabled) return null;
  if (checkinAlarms(alarms).length > 0) return null;
  let time = settings.checkinTime ?? '';
  if (!TIME_RE.test(time)) {
    console.warn(
      `[CheckinMigration] horário do check-in antigo inutilizável; usando ${LEGACY_DEFAULT_CHECKIN_TIME}.`
    );
    time = LEGACY_DEFAULT_CHECKIN_TIME;
  }
  return {
    id: MIGRATED_CHECKIN_ALARM_ID,
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
  if (!state.settings.checkinEnabled) return 'nothing';

  const alarm = buildMigratedCheckin(state.settings, state.alarms);
  if (alarm) {
    if (state.alarms.length >= MAX_ALARMS) {
      console.warn(
        `[CheckinMigration] ${MAX_ALARMS} alarmes já cadastrados — o check-in antigo continua valendo.`
      );
      return 'failed';
    }
    try {
      deps.addAlarm(await deps.scheduleAlarm(alarm));
    } catch (error) {
      console.error('[CheckinMigration] não foi possível agendar o check-in migrado:', error);
      return 'failed';
    }
  }
  deps.disableLegacy();
  return alarm ? 'migrated' : 'nothing';
}
