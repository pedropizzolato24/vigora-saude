/**
 * TELA DE SPIKE — AlarmKit (iOS 26+). NÃO VAI PARA PRODUÇÃO.
 *
 * Existe só para responder, medindo num iPhone real, as três perguntas que
 * decidem se migramos o alarme do iOS para o AlarmKit:
 *
 *   Q1. O som .default toca EM LOOP até o usuário parar, com a chavinha no
 *       silencioso e com Foco ligado?
 *   Q2. Som próprio (.named) toca de verdade hoje, ou sai o bipe de erro do
 *       sistema relatado no iOS 26.0? E se tocar, repete ou toca uma vez só?
 *   Q3. O intent de stop RODA nos caminhos reais de dispensa? É dele que
 *       depende o dead man's switch: sem ele o servidor escala um alarme que
 *       o idoso respondeu.
 *
 * Q3 atravessa um relaunch do app, então o log é persistido em AsyncStorage —
 * sem isso a evidência morre junto com o processo.
 *
 * Acesso: abra o app e depois `vigora://alarmkit-spike` no Safari.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useColors } from '@/hooks/use-colors';
import * as Auth from '@/lib/_core/auth';
import { listPendingConfirmations } from '@/lib/pending-confirmations';
import { flushPendingConfirmations } from '@/lib/monitoring-service';
import { scheduleAlarmNotification } from '@/lib/notifications-utils';
import type { Alarm } from '@/lib/app-context';
import * as AlarmKit from 'expo-alarm-kit';

const LOG_KEY = 'spike:alarmkit:log';
const APP_GROUP = 'group.com.vigora.saude.alarms';
// 30s dá tempo de bloquear a tela / virar a chavinha antes de tocar.
const FIRE_IN_SECONDS = 30;
// Notificação (não AlarmKit): 2min para dar tempo de fechar o app e bloquear.
const NOTIF_IN_MINUTES = 2;

/** HH:MM daqui a N minutos — mesmo formato que o formulário de alarme produz. */
function horaDaquiA(minutos: number): string {
  const d = new Date(Date.now() + minutos * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Alarme mínimo no formato que scheduleAlarmNotification espera. */
function alarmeDeTeste(som: boolean, hora: string): Alarm {
  return {
    id: `spike-${som ? 'com' : 'sem'}-som`,
    time: hora,
    description: som ? 'TESTE com som' : 'TESTE sem som',
    enabled: true,
    repeat: 'daily',
    customDays: [],
    sound: som,
    vibration: true,
  } as Alarm;
}

export default function AlarmKitSpikeScreen() {
  const colors = useColors();
  const [log, setLog] = useState<string[]>([]);

  const append = useCallback(async (line: string) => {
    const stamped = `${new Date().toLocaleTimeString('pt-BR')}  ${line}`;
    setLog((prev) => {
      const next = [...prev, stamped];
      AsyncStorage.setItem(LOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    console.log('[AlarmKitSpike]', stamped);
  }, []);

  // Ao montar: recupera o log de execuções anteriores (inclusive de antes do
  // relaunch pelo intent) e lê o payload de dismiss, que é a evidência do Q3.
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(LOG_KEY).catch(() => null);
      if (raw) {
        try {
          setLog(JSON.parse(raw));
        } catch {}
      }

      if (Platform.OS !== 'ios') {
        append('AVISO: AlarmKit é só iOS. Nada aqui vai funcionar.');
        return;
      }

      try {
        const ok = AlarmKit.configure(APP_GROUP);
        append(`configure(${APP_GROUP}) -> ${ok}`);
        if (!ok) {
          append('FALHA: App Group não acessível. Sem ele o intent não grava nada.');
        }
      } catch (e) {
        append(`configure LANÇOU: ${String(e)}`);
      }

      // Q3: se o app foi aberto pelo intent de dismiss, o payload chega aqui.
      try {
        const payload = AlarmKit.getLaunchPayload();
        append(
          payload
            ? `>>> Q3 launchPayload: ${JSON.stringify(payload)} (o intent RODOU)`
            : 'launchPayload: null (nenhum dismiss pendente nesta sessão)',
        );
      } catch (e) {
        append(`getLaunchPayload LANÇOU: ${String(e)}`);
      }

      try {
        append(`getAllAlarms: ${JSON.stringify(AlarmKit.getAllAlarms())}`);
      } catch (e) {
        append(`getAllAlarms LANÇOU: ${String(e)}`);
      }

      // Diagnóstico do boot. Sem isto a investigação do "app abriu no login"
      // vira palpite: precisamos saber se a leitura do keychain funcionou
      // NAQUELE boot e se a migração já tinha rodado.
      const migrated = await AsyncStorage.getItem(
        'vigora_keychain_after_first_unlock_migrado',
      ).catch(() => null);
      const [token, user] = await Promise.all([
        Auth.getSessionToken().catch(() => null),
        Auth.getUserInfo().catch(() => null),
      ]);
      append(
        `KEYCHAIN: migrado=${migrated === '1'} | token=${token ? 'presente' : 'AUSENTE'} | ` +
          `user=${user ? 'presente' : 'AUSENTE'}`,
      );

      const pending = await listPendingConfirmations().catch(() => []);
      append(`FILA de confirmações pendentes: ${pending.length} ${JSON.stringify(pending)}`);

      // Se o usuário recusou alertas críticos, o alarme COM som também estaria
      // rebaixado — e a comparação com/sem som mudaria de sentido.
      try {
        const perm = await Notifications.getPermissionsAsync();
        append(`PERMISSÃO notificações: ${JSON.stringify(perm.ios ?? perm.status)}`);
      } catch (e) {
        append(`getPermissions LANÇOU: ${String(e)}`);
      }
    })();
  }, [append]);

  /** Roda o flush na mão e mostra o antes/depois — o console.log não é visível no TestFlight. */
  const flushNow = useCallback(async () => {
    const before = await listPendingConfirmations().catch(() => []);
    append(`flush: ${before.length} pendente(s) antes`);
    try {
      await flushPendingConfirmations();
    } catch (e) {
      append(`flush LANÇOU: ${String(e)}`);
    }
    const after = await listPendingConfirmations().catch(() => []);
    append(`flush: ${after.length} pendente(s) depois`);
  }, [append]);

  // --- Sondas do alarme SEM som no iOS -------------------------------------
  // O alarme com "Som" desmarcado não aparece no iPhone: nenhuma notificação.
  // Duas hipóteses já caíram (interruptionLevel crítico; código da lib), então
  // aqui a ideia é MEDIR em vez de supor. Três perguntas, separadas de
  // propósito porque hoje elas estão emboladas num único sintoma:
  //   A. chega a ser agendada? (id de volta, ou null do catch)
  //   B. o iOS aceitou e guardou? (aparece em getAllScheduled)
  //   C. foi entregue e ninguém viu? (aparece em getPresented)

  const dumpAgendadas = useCallback(async () => {
    try {
      const todas = await Notifications.getAllScheduledNotificationsAsync();
      append(`AGENDADAS: ${todas.length}`);
      for (const n of todas) {
        const c = n.content as unknown as Record<string, unknown>;
        append(
          `  · "${String(c.title ?? '').slice(0, 22)}" som=${JSON.stringify(c.sound)} ` +
            `nível=${String(c.interruptionLevel ?? '(ausente)')}`,
        );
      }
    } catch (e) {
      append(`getAllScheduled LANÇOU: ${String(e)}`);
    }
  }, [append]);

  const dumpEntregues = useCallback(async () => {
    try {
      const todas = await Notifications.getPresentedNotificationsAsync();
      append(`ENTREGUES (na Central agora): ${todas.length}`);
      for (const n of todas) {
        const c = n.request.content as unknown as Record<string, unknown>;
        append(`  · "${String(c.title ?? '').slice(0, 30)}"`);
      }
      if (todas.length === 0) {
        append('  ^ vazio. Se o horário já passou, não foi entregue OU já foi dispensada.');
      }
    } catch (e) {
      append(`getPresented LANÇOU: ${String(e)}`);
    }
  }, [append]);

  /**
   * Pergunta A+B pelo caminho REAL de produção: as duas versões do mesmo
   * alarme, no mesmo minuto, mudando só a chave de som. Se só uma sobreviver
   * até getAllScheduled, o problema é no agendamento; se as duas sobreviverem
   * e só uma chegar no aparelho, é entrega — e aí a culpa é do iOS, não nossa.
   */
  const compararComSemSom = useCallback(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    const hora = horaDaquiA(NOTIF_IN_MINUTES);
    append(`--- COM vs SEM som, os dois às ${hora} ---`);
    for (const som of [true, false]) {
      const id = await scheduleAlarmNotification(alarmeDeTeste(som, hora));
      append(
        `scheduleAlarmNotification(sound=${som}) -> ` +
          (id ? `id=${id.slice(0, 8)}` : 'NULL — exceção engolida pelo try/catch da função'),
      );
    }
    await dumpAgendadas();
    append('Feche o app e bloqueie a tela. Depois volte e toque em "Ver entregues".');
  }, [append, dumpAgendadas]);

  /**
   * Isola a variável suspeita sem passar pelo nosso código: 4 notificações
   * cruas, todas SEM som, uma por interruptionLevel. Se timeSensitive for a
   * única que não agenda (ou não chega), a resposta é essa e não há o que
   * adivinhar. Notificação crua = nada do Vigora no meio do caminho.
   */
  const sondarNiveis = useCallback(async () => {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    const quando = new Date(Date.now() + NOTIF_IN_MINUTES * 60 * 1000);
    append(`--- sonda: 4 cruas SEM som, ${quando.toLocaleTimeString('pt-BR')} ---`);
    for (const nivel of ['passive', 'active', 'timeSensitive', 'critical'] as const) {
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: `Sonda ${nivel}`, body: 'sem som', interruptionLevel: nivel },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: quando,
          } as Notifications.DateTriggerInput,
        });
        append(`  ${nivel}: agendou (${id.slice(0, 8)})`);
      } catch (e) {
        append(`  ${nivel}: LANÇOU -> ${String(e)}`);
      }
    }
    await dumpAgendadas();
    append('Bloqueie a tela e espere. Quantas das 4 aparecerem é a resposta.');
  }, [append, dumpAgendadas]);

  const requestAuth = useCallback(async () => {
    try {
      const status = await AlarmKit.requestAuthorization();
      append(`requestAuthorization -> ${status}`);
    } catch (e) {
      append(`requestAuthorization LANÇOU: ${String(e)}`);
    }
  }, [append]);

  /**
   * Agenda um alarme daqui a FIRE_IN_SECONDS.
   * `soundName` undefined = AlertSound.default. Os dois formatos de nome
   * (com e sem extensão) são testados porque a doc da Apple e os relatos do
   * fórum divergem sobre qual é o aceito.
   */
  const schedule = useCallback(
    async (label: string, soundName: string | undefined, launchAppOnDismiss: boolean) => {
      try {
        const id = AlarmKit.generateUUID();
        const date = new Date(Date.now() + FIRE_IN_SECONDS * 1000);
        const ok = await AlarmKit.scheduleAlarm({
          id,
          date,
          title: `Vigora — ${label}`,
          soundName,
          launchAppOnDismiss,
          dismissPayload: label,
          stopButtonLabel: 'Desligar',
          snoozeButtonLabel: 'Soneca',
          tintColor: '#0033CC',
        });
        append(
          `[${label}] scheduleAlarm -> ${ok} | som=${soundName ?? '.default'} | ` +
            `abreApp=${launchAppOnDismiss} | toca ${date.toLocaleTimeString('pt-BR')} | id=${id.slice(0, 8)}`,
        );
        if (!ok) append(`[${label}] FALHOU no agendamento (ver console/Xcode).`);
      } catch (e) {
        append(`[${label}] scheduleAlarm LANÇOU: ${String(e)}`);
      }
    },
    [append],
  );

  const inspect = useCallback(() => {
    try {
      const alarms = AlarmKit.getAllAlarms();
      const payload = AlarmKit.getLaunchPayload();
      append(`ESTADO: alarmes=${JSON.stringify(alarms)} | launchPayload=${JSON.stringify(payload)}`);
      append(
        alarms.length === 0
          ? '  ^ storage vazio: o intent de dismiss RODOU e limpou (sinal indireto do Q3).'
          : '  ^ alarme ainda no storage: o intent NÃO rodou, ou o alarme não tocou ainda.',
      );
    } catch (e) {
      append(`inspect LANÇOU: ${String(e)}`);
    }
  }, [append]);

  const clearAll = useCallback(() => {
    try {
      AlarmKit.clearAllAlarms();
      append('clearAllAlarms() ok');
    } catch (e) {
      append(`clearAllAlarms LANÇOU: ${String(e)}`);
    }
  }, [append]);

  const clearLog = useCallback(() => {
    setLog([]);
    AsyncStorage.removeItem(LOG_KEY).catch(() => {});
  }, []);

  const Btn = ({ label, onPress }: { label: string; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.btnText, { color: colors.foreground }]}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.foreground }]}>SPIKE AlarmKit</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          Cada alarme toca {FIRE_IN_SECONDS}s depois do toque no botão.
        </Text>

        <Btn label="0 · Pedir permissão do AlarmKit" onPress={requestAuth} />
        <Btn label="Q1 · Som .default (abre o app no stop)" onPress={() => schedule('Q1-default', undefined, true)} />
        <Btn label="Q2a · Som 'alarm.mp3'" onPress={() => schedule('Q2a-mp3', 'alarm.mp3', true)} />
        <Btn label="Q2b · Som 'alarm' (sem extensão)" onPress={() => schedule('Q2b-sem-ext', 'alarm', true)} />
        <Btn label="Q3 · Stop SEM abrir o app" onPress={() => schedule('Q3-sem-launch', undefined, false)} />
        <Btn label="Ver estado (alarmes + payload)" onPress={inspect} />

        <Text style={[styles.sub, { color: colors.muted, marginTop: 10 }]}>
          Alarme sem som no iOS (notificação, não AlarmKit) — toca em {NOTIF_IN_MINUTES} min:
        </Text>
        <Btn label="A · Comparar COM vs SEM som" onPress={compararComSemSom} />
        <Btn label="B · Sondar os 4 interruptionLevel" onPress={sondarNiveis} />
        <Btn label="C · Ver agendadas" onPress={dumpAgendadas} />
        <Btn label="D · Ver entregues (depois de tocar)" onPress={dumpEntregues} />

        <Btn label="Flush da fila de confirmações" onPress={flushNow} />
        <Btn label="Cancelar todos os alarmes" onPress={clearAll} />
        <Btn label="Limpar log" onPress={clearLog} />

        <View style={[styles.logBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {log.length === 0 ? (
            <Text style={[styles.logLine, { color: colors.muted }]}>(vazio)</Text>
          ) : (
            log.map((line, i) => (
              <Text key={i} style={[styles.logLine, { color: colors.foreground }]} selectable>
                {line}
              </Text>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, marginBottom: 6 },
  btn: { borderWidth: 1, borderRadius: 10, paddingVertical: 16, paddingHorizontal: 14, minHeight: 56, justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '600' },
  logBox: { marginTop: 12, borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  logLine: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
});
