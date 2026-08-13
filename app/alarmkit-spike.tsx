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
import { useColors } from '@/hooks/use-colors';
import * as AlarmKit from 'expo-alarm-kit';

const LOG_KEY = 'spike:alarmkit:log';
const APP_GROUP = 'group.com.vigora.saude.alarms';
// 30s dá tempo de bloquear a tela / virar a chavinha antes de tocar.
const FIRE_IN_SECONDS = 30;

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
    })();
  }, [append]);

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
