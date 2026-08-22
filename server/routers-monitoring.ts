/**
 * routers-monitoring.ts
 *
 * tRPC routes for the server-side alarm monitoring system.
 *
 * SECURITY: All procedures require authentication. A posse dos dados é
 * IMPLÍCITA pela conta autenticada (ctx.user.openId) — cada rota só toca os
 * dados do próprio openId. Não existe mais posse por deviceId (e portanto não
 * existem mais 403 DEVICE_OWNED_BY_ANOTHER_USER ao trocar de conta no mesmo
 * aparelho). Ver docs/design/2026-07-12-monitoring-account-ownership.md.
 *
 * Compat: clientes antigos ainda enviam `deviceId` no input — o zod descarta
 * chaves desconhecidas, e onde o campo segue declarado ele é só metadado.
 *
 * Routes:
 *   monitoring.register        - (deprecated) compat: registra sinal de vida
 *   monitoring.heartbeat       - Send "I'm alive" ping (liveness da conta)
 *   monitoring.syncAlarms      - (deprecated) compat no-op: agenda vive em user_data
 *   monitoring.createEvent     - Create a pending alarm event
 *   monitoring.confirmEvent    - Confirm alarm as responded/missed/not_sent
 *   monitoring.getHistory      - Get alarm event history (own account)
 *   monitoring.getWarnings     - Get warning log (own account)
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import {
  createAlarmEvent,
  getAccountLiveness,
  getAlarmEventHistory,
  getWarningHistory,
  recordHeartbeat,
  updateAlarmEventStatusByAlarmId,
} from "./db-monitoring";
import { getUserData } from "./db";
import { getActiveCaregiversForMonitored } from "./db-links";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";
import { formatEventTime } from "./_core/format-event-time";

/**
 * Rate limit por processo/usuário para o push de SOS aos cuidadores.
 * 5 acionamentos em 60s: cobre um SOS legítimo e bloqueia spam ao cuidador.
 */
const SOS_WINDOW_MS = 60_000;
const SOS_LIMIT = 5;
const sosRateLimit = new Map<string, number[]>();

// Mesmo id usado pelo check-in diário no cliente (lib/checkin-*) e no
// monitoring-job (Passos 3/4). O push ao cuidador ramifica por ele.
const CHECKIN_ALARM_ID = "checkin-daily";

function isSosRateLimited(openId: string): boolean {
  const now = Date.now();
  const recent = (sosRateLimit.get(openId) ?? []).filter(
    (ts) => now - ts < SOS_WINDOW_MS
  );
  if (recent.length >= SOS_LIMIT) {
    sosRateLimit.set(openId, recent);
    return true;
  }
  recent.push(now);
  sosRateLimit.set(openId, recent);
  return false;
}

/**
 * Rate limit por processo/conta para o push de alarme perdido ao cuidador.
 * createEvent aceita alarmId/scheduledAt arbitrários do cliente autenticado —
 * sem isto, um loop createEvent -> confirmEvent(missed) gera push ilimitado ao
 * cuidador. 10 em 60s: acomoda uma rajada legítima (reconexão após offline
 * confirmando vários alarmes pendentes de uma vez) e barra o abuso sustentado.
 * Só o PUSH é limitado — o evento em si sempre é gravado (histórico correto).
 */
const MISSED_ALARM_PUSH_WINDOW_MS = 60_000;
const MISSED_ALARM_PUSH_LIMIT = 10;
const missedAlarmPushRateLimit = new Map<string, number[]>();

function isMissedAlarmPushRateLimited(openId: string): boolean {
  const now = Date.now();
  const recent = (missedAlarmPushRateLimit.get(openId) ?? []).filter(
    (ts) => now - ts < MISSED_ALARM_PUSH_WINDOW_MS
  );
  if (recent.length >= MISSED_ALARM_PUSH_LIMIT) {
    missedAlarmPushRateLimit.set(openId, recent);
    return true;
  }
  recent.push(now);
  missedAlarmPushRateLimit.set(openId, recent);
  return false;
}

/**
 * Push aos cuidadores vinculados quando o monitorado (com o app VIVO) confirma
 * um alarme como perdido em confirmEvent. É o par em tempo real do push que o
 * Passo 4 do monitoring-job faz quando o app MORREU — nunca disparam para o
 * mesmo evento: confirmEvent seta warningSent=true e o Passo 4 só pega
 * warningSent=false. Sem estado de saúde no payload (só "não respondeu").
 *
 * Idempotência vem de fora: só é chamado quando updateAlarmEventStatusByAlarmId
 * de fato transicionou o evento (retry/re-chamada não re-empurra). Best-effort:
 * uma falha aqui não pode derrubar o confirm do cliente.
 *
 * ⚠️ Só cobre o caminho "cliente vivo". Ver a NOTA DE DESIGN em
 * db-monitoring.ts (warningSent): um terceiro canal exigiria flags por-canal.
 */
async function pushMissedAlarmToCaregivers(
  monitoredOpenId: string,
  alarmId: string,
  scheduledAt: Date,
  timezone: string | null
): Promise<void> {
  try {
    const caregivers = await getActiveCaregiversForMonitored(monitoredOpenId);
    if (caregivers.length === 0) return;
    const tokens = await getPushTokensForOpenIds(
      caregivers.map((c) => c.caregiverOpenId)
    );
    // Cuidador vinculado E SEM token = o alerta não chega a ninguém em tempo
    // real (ele só veria abrindo a tela de Alertas). Sair calado aqui escondeu
    // por semanas um app Android buildado sem FCM. Sem openId no log (LGPD).
    if (tokens.length === 0) {
      console.warn(
        `[Monitoring] alarme perdido: ${caregivers.length} cuidador(es) vinculado(s), 0 push tokens — push NÃO enviado. Cliente sem FCM/permissão de notificação?`
      );
      return;
    }

    // Nome do monitorado para o cuidador saber DE QUEM é o alarme (um cuidador
    // pode seguir mais de uma pessoa). Falha ao ler o nome não aborta o push.
    let name = "A pessoa que você acompanha";
    try {
      const data = await getUserData(monitoredOpenId);
      const anamnesis = (data?.anamnesis ?? null) as { fullName?: string } | null;
      if (anamnesis?.fullName) name = anamnesis.fullName;
    } catch {
      // mantém o nome genérico
    }

    const scheduledStr = formatEventTime(scheduledAt, timezone);

    // Check-in e alarme de medicação têm cópia/tipo de push DIFERENTES — e no
    // servidor, branches de escalação distintos (Passo 3 missed_checkin vs
    // Passo 4 missed_alarm). Como confirmEvent é compartilhado pelos dois fluxos
    // (o timeout do check-in também chama confirmAlarmMissed), sem ramificar aqui
    // o check-in saía como "missed_alarm" (texto errado) e, pior, o warningSent=true
    // ainda suprimia o missed_checkin do Passo 3.
    const message =
      alarmId === CHECKIN_ALARM_ID
        ? {
            title: "⚠️ Check-in não respondido — Vigora",
            body: `${name} não respondeu ao check-in das ${scheduledStr}. Toque para ver os detalhes.`,
            data: { type: "missed_checkin", url: "/(caregiver-tabs)/alerts" },
          }
        : {
            title: "⚠️ Alarme não respondido — Vigora",
            body: `${name} não respondeu ao alarme das ${scheduledStr}. Toque para ver os detalhes.`,
            data: { type: "missed_alarm", url: "/(caregiver-tabs)/alerts" },
          };

    await sendExpoPush(tokens.map((t) => t.token), message);
  } catch (err) {
    console.warn("[Monitoring] push de alarme perdido ao cuidador falhou:", err);
  }
}

export const monitoringRouter = router({
  /**
   * DEPRECATED (compat com clientes antigos): contatos e nome agora vivem no
   * cloud backup por conta (userData.put). Registrar ainda conta como sinal
   * de vida — o cliente antigo chama isto no bootstrap.
   */
  register: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().max(64).optional(),
        lastLocation: z.string().optional(), // "lat,lng"
      })
    )
    .mutation(async ({ ctx, input }) => {
      await recordHeartbeat(ctx.user.openId, {
        lastDeviceId: input.deviceId,
        lastLocation: input.lastLocation,
      });
      return { success: true };
    }),

  /**
   * Send a heartbeat ping. Called every 5 minutes while app is active.
   * Liveness é da CONTA: qualquer aparelho da conta que pingar mantém a
   * pessoa "viva" para o dead man's switch. deviceId/lastDeviceId é metadado.
   */
  heartbeat: protectedProcedure
    .input(
      z.object({
        /** Compat: clientes antigos mandam deviceId; novos mandam lastDeviceId. */
        deviceId: z.string().max(64).optional(),
        lastDeviceId: z.string().max(64).optional(),
        appVersion: z.string().optional(),
        lastLocation: z.string().optional(),
        /** Telemetria Android: isenção de otimização de bateria ativa. */
        batteryExempt: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await recordHeartbeat(ctx.user.openId, {
        appVersion: input.appVersion,
        lastDeviceId: input.lastDeviceId ?? input.deviceId,
        lastLocation: input.lastLocation,
        batteryExempt: input.batteryExempt,
      });
      return { success: true, timestamp: new Date().toISOString() };
    }),

  /**
   * DEPRECATED (compat com clientes antigos): a agenda de alarmes autoritativa
   * vive em user_data.alarms (cloud backup). A tabela synced_alarms foi
   * eliminada; aceita a chamada e responde sucesso para não quebrar o cliente.
   */
  syncAlarms: protectedProcedure
    .input(z.object({ alarms: z.array(z.unknown()).optional() }))
    .mutation(async ({ input }) => {
      return { success: true, count: input.alarms?.length ?? 0 };
    }),

  /**
   * Create a pending alarm event.
   * Called when an alarm is about to fire (before the countdown starts).
   * The server will resolve it if the device doesn't confirm within the grace period.
   */
  createEvent: protectedProcedure
    .input(
      z.object({
        alarmId: z.string(),
        alarmDescription: z.string(),
        scheduledAt: z.string(), // ISO string
        // Nome IANA do fuso do aparelho. Opcional: clientes antigos não mandam
        // e ROM sem ICU manda null — os dois caem no fallback de Brasília.
        timezone: z.string().max(64).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await createAlarmEvent({
        openId: ctx.user.openId,
        alarmId: input.alarmId,
        alarmDescription: input.alarmDescription,
        scheduledAt: new Date(input.scheduledAt),
        timezone: input.timezone ?? null,
        status: "pending",
      });
      return { success: true, eventId: id };
    }),

  /**
   * Confirm an alarm event status.
   * Called after the user responds (responded) or the countdown expires (missed).
   */
  confirmEvent: protectedProcedure
    .input(
      z.object({
        alarmId: z.string(),
        scheduledAt: z.string(), // ISO string
        status: z.enum(["responded", "missed", "not_sent"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const scheduledAt = new Date(input.scheduledAt);
      const transitioned = await updateAlarmEventStatusByAlarmId(
        ctx.user.openId,
        input.alarmId,
        scheduledAt,
        input.status
      );
      // App vivo confirmando "perdido": empurra o push ao cuidador AQUI, no
      // mesmo instante em que warningSent=true é setado (senão o Passo 4 nunca
      // dispara e o cuidador não é avisado). Só na transição real → idempotente.
      // Rate limit só no PUSH — o evento em si é sempre gravado corretamente.
      if (
        input.status === "missed" &&
        transitioned &&
        !isMissedAlarmPushRateLimited(ctx.user.openId)
      ) {
        await pushMissedAlarmToCaregivers(
          ctx.user.openId,
          input.alarmId,
          scheduledAt,
          transitioned.timezone
        );
      }
      return { success: true };
    }),

  /**
   * Get alarm event history for the authenticated account.
   */
  getHistory: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(200).optional().default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      const events = await getAlarmEventHistory(ctx.user.openId, input.limit);
      return { events };
    }),

  /**
   * Get warning log for the authenticated account.
   */
  getWarnings: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional().default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const warnings = await getWarningHistory(ctx.user.openId, input.limit);
      return { warnings };
    }),

  /**
   * Get monitoring status summary for the settings panel.
   * Returns last check-in time, alarm counts (from user_data, the
   * authoritative schedule) and recent event counts.
   */
  getStatus: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const [liveness, data, events] = await Promise.all([
        getAccountLiveness(ctx.user.openId),
        getUserData(ctx.user.openId),
        getAlarmEventHistory(ctx.user.openId, 30),
      ]);

      const alarms = ((data?.alarms ?? []) as Array<{ enabled?: boolean }>);
      const respondedCount = events.filter((e) => e.status === "responded").length;
      const missedCount = events.filter((e) => e.status === "missed").length;
      const notSentCount = events.filter((e) => e.status === "not_sent").length;

      return {
        lastCheckIn: liveness?.lastSeenAt ?? null,
        syncedAlarmCount: alarms.length,
        enabledAlarmCount: alarms.filter((a) => a?.enabled).length,
        recentEvents: { respondedCount, missedCount, notSentCount },
      };
    }),

  /**
   * SOS: push em tempo real aos cuidadores vinculados quando o monitorado
   * aciona o botão de emergência. Canal próprio (não WhatsApp) e independente
   * de haver contatos de emergência — paridade com o dead man's switch
   * (server/monitoring-job.ts), que já notifica os cuidadores.
   *
   * Conformidade: notifica APENAS cuidadores com vínculo ATIVO (aceito no app
   * deles) e token push registrado; sem dado de saúde no payload; sem 192/193.
   */
  sosAlertCaregivers: protectedProcedure
    .input(z.object({ userName: z.string().max(255).optional() }))
    .mutation(async ({ ctx, input }) => {
      if (isSosRateLimited(ctx.user.openId)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Muitos acionamentos de SOS em pouco tempo. Aguarde um minuto.",
        });
      }

      const caregivers = await getActiveCaregiversForMonitored(ctx.user.openId);
      const tokens = await getPushTokensForOpenIds(
        caregivers.map((c) => c.caregiverOpenId)
      );
      if (tokens.length === 0) {
        return { caregiverPushes: 0 };
      }

      const name = input.userName?.trim() || "A pessoa que você acompanha";
      const caregiverPushes = await sendExpoPush(
        tokens.map((t) => t.token),
        {
          title: "🆘 SOS — Vigora",
          body: `${name} acionou o botão de emergência e precisa de ajuda agora. Toque para ver os detalhes.`,
          data: { type: "sos", url: "/(caregiver-tabs)/alerts" },
        }
      );
      return { caregiverPushes };
    }),
});
