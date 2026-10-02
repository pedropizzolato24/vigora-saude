import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import React, { useEffect, useState } from 'react';
import { useAccessibility } from '@/lib/accessibility-context';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PressableScale } from '@/components/pressable-scale';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmFormModal } from '@/components/alarm-form-modal';
import { AlarmCard } from '@/components/alarm-card';
import { AlarmHistorySheet } from '@/components/alarm-history-sheet';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import { generateId, useAppContext, type Alarm } from '@/lib/app-context';
import { REPEAT_OPTIONS, type AlarmFormValues } from '@/lib/alarm-form';
import { scheduleFullAlarm, cancelFullAlarm } from '@/lib/alarm-sync';
import { canUseFullScreenIntent, openFullScreenIntentSettings } from 'expo-alarm-countdown';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MAX_ALARMS } from '@/components/pro-limits';
import { medicationAlarms } from '@/lib/alarm-kind';

// Evita repetir o aviso de "Notificações em tela cheia" a cada alarme criado
// na mesma sessão (a permissão continua sendo re-checada — só o diálogo não
// re-aparece). Os avisos de bateria e de alarme exato saíram daqui para a
// central de permissões (app/permissions.tsx), que os re-oferece a cada boot.
let fullScreenPromptShown = false;

/** Returns a human-friendly "em X h" / "em X min" string for a given HH:MM time. */
function hoursUntilLabel(time: string): string | null {
  const [hStr, mStr] = time.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return null;
  const now = new Date();
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  const diffMs = target.getTime() - now.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `em ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  return `em ${diffH} h`;
}

export default function AlarmsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { alarmId: focusAlarmId } = useLocalSearchParams<{ alarmId?: string }>();
  const { state, dispatch } = useAppContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAlarm, setEditingAlarm] = useState<Alarm | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  // Sem a permissão "Notificações em tela cheia" (Android 14+) o alarme vira um
  // aviso pequeno no alto da tela: a alarm-ring só abre se o idoso TOCAR nele,
  // em vez de tomar a tela sozinha como um alarme de verdade. Ela deixou de ser
  // concedida no install para apps fora da categoria alarme/chamada da loja.
  //
  // Este aviso NÃO roda no mount da aba. Rodava, e perdia a vaga única da
  // sessão para o aviso de bateria que existia aqui — só aparecia numa visita
  // posterior, que na prática caía DEPOIS do primeiro alarme já ter tocado sem
  // tela cheia. Tarde demais: o alarme que ele conserta é justamente aquele.
  // Sai na criação do alarme (ver handleSave), que é quando a permissão passa a
  // valer e quando o idoso está olhando para o assunto.
  //
  // A central de permissões (app/permissions.tsx) já oferece esta permissão a
  // cada boot; este caminho cobre o caso de ela ser revogada durante a sessão.
  const promptFullScreenIfNeeded = async () => {
    if (Platform.OS !== 'android') return;
    if (fullScreenPromptShown) return;
    if (await canUseFullScreenIntent()) return;
    fullScreenPromptShown = true;
    showDialog({
      title: 'Para o alarme aparecer na tela toda',
      message:
        'Do jeito que está, o alarme vai chegar como um aviso pequeno no alto da tela — e é fácil não perceber.\n\n' +
        'Vamos resolver:\n' +
        '1. Toque em "Abrir configurações" aqui embaixo\n' +
        '2. Na tela que abrir, ligue a chave "Notificações em tela cheia"',
      variant: 'warning',
      buttons: [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Abrir configurações', onPress: () => { openFullScreenIntentSettings(); } },
      ],
    });
  };

  const sortedAlarms = [...medicationAlarms(state.alarms)].sort((a, b) => {
    const [ah, am] = a.time.split(':').map(Number);
    const [bh, bm] = b.time.split(':').map(Number);
    return ah * 60 + am - (bh * 60 + bm);
  });

  // Next upcoming enabled alarm (by time of day, wrapping midnight)
  const nextAlarm = (() => {
    const enabled = sortedAlarms.filter((a) => a.enabled);
    if (enabled.length === 0) return null;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const upcoming = enabled.find((a) => {
      const [h, m] = a.time.split(':').map(Number);
      return h * 60 + m > nowMin;
    });
    return upcoming ?? enabled[0];
  })();

  const openAddModal = () => {
    // Teto técnico do agendador — não é limite de plano.
    if (state.alarms.length >= MAX_ALARMS) {
      showDialog({ title: 'Limite atingido', message: `Você pode ter no máximo ${MAX_ALARMS} alarmes.`, variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }
    setEditingAlarm(null);
    setModalVisible(true);
  };

  // Abre direto um alarme quando a tela é chamada com ?alarmId= (card "próximo
  // remédio" da tela inicial). Consome o parâmetro para não reabrir o modal ao
  // voltar para a aba depois.
  useEffect(() => {
    if (!focusAlarmId) return;
    const target = state.alarms.find((a) => a.id === focusAlarmId);
    // Sem o alarme em mãos ainda (AsyncStorage carregando) o parâmetro fica de
    // pé e o efeito roda de novo quando a lista chegar.
    if (!target) return;
    router.setParams({ alarmId: undefined });
    openEditModal(target);
  }, [focusAlarmId, state.alarms]);  // eslint-disable-line react-hooks/exhaustive-deps

  const openEditModal = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setModalVisible(true);
  };

  const handleSave = async (form: AlarmFormValues) => {
    // Validate time format
    const timeRegex = /^([01]?\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(form.time)) {
      showDialog({ title: 'Hora inválida', message: 'Use o formato HH:MM (ex: 08:30)', variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    try {
      if (editingAlarm) {
        // Cancel old notification if exists
        await cancelFullAlarm(editingAlarm);
        // Schedule new alarm (native + notification)
        const updatedAlarm = await scheduleFullAlarm({ ...form, id: editingAlarm.id } as Alarm);
        dispatch({ type: 'UPDATE_ALARM', payload: updatedAlarm });
      } else {
        const alarmId = generateId();
        const newAlarm = await scheduleFullAlarm({ ...form, id: alarmId } as Alarm);
        dispatch({ type: 'ADD_ALARM', payload: newAlarm });
        // TTS confirmation — only on create
        Speech.speak(`Lembrete criado para as ${form.time}`, { language: 'pt-BR' });
      }
      setModalVisible(false);

      // Confirmation message
      const repeatLabel = REPEAT_OPTIONS.find(r => r.value === form.repeat)?.label ?? form.repeat;
      const desc = form.description ? `\n"${form.description}"` : '';
      const action = editingAlarm ? 'atualizado' : 'criado';
      showToast({ message: `Alarme ${action}: ${form.time} · ${repeatLabel}${desc}`, variant: 'success' });

      // Depois do toast, e só na criação: agora existe um alarme para tocar, e
      // é o momento em que a permissão de tela cheia significa alguma coisa. O
      // atraso deixa o modal terminar de fechar — o AppDialog é irmão dele na
      // árvore e apareceria por baixo se subisse junto.
      if (!editingAlarm) {
        setTimeout(() => { promptFullScreenIfNeeded(); }, 800);
      }
    } catch (error) {
      console.error('Error scheduling alarm notification:', error);
      // Na edição, cancelFullAlarm já derrubou o alarme ANTIGO antes desta
      // tentativa. Deixá-lo ligado na lista mostraria um alarme que não vai
      // mais tocar — a mesma mentira de antes, só que mais tarde e mais
      // perigosa, porque o idoso já confiava nele.
      if (editingAlarm) {
        dispatch({
          type: 'UPDATE_ALARM',
          payload: { ...editingAlarm, enabled: false, notificationId: undefined, nativeAlarmUids: [] },
        });
      }
      showDialog({
        title: editingAlarm ? 'O alarme foi desligado' : 'O alarme não foi criado',
        message: editingAlarm
          ? 'Não foi possível salvar a mudança, e o alarme foi desligado por segurança. Ele NÃO vai tocar.\n\nAbra o alarme e ligue de novo.'
          : 'O celular não aceitou este alarme. Ele NÃO vai tocar.\n\nTente criar de novo.',
        variant: 'error',
        buttons: [{ text: 'Entendi' }],
      });
    }
  };

  const handleDelete = (id: string) => {
    showDialog({
      title: 'Excluir lembrete',
      message: 'Excluir este lembrete?',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            const alarm = state.alarms.find(a => a.id === id);
            if (alarm) {
              await cancelFullAlarm(alarm);
            }
            dispatch({ type: 'DELETE_ALARM', payload: id });
            setModalVisible(false);
          },
        },
      ],
    });
  };

  const handleToggle = async (alarm: Alarm) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    const newEnabled = !alarm.enabled;

    try {
      if (newEnabled) {
        // Enable alarm: schedule native + notification
        const updatedAlarm = await scheduleFullAlarm({ ...alarm, enabled: true });
        dispatch({ type: 'UPDATE_ALARM', payload: updatedAlarm });
      } else {
        // Disable alarm: cancel both
        await cancelFullAlarm(alarm);
        dispatch({ type: 'UPDATE_ALARM', payload: { ...alarm, enabled: false, notificationId: undefined, nativeAlarmUids: [] } });
      }
    } catch (error) {
      console.error('Error toggling alarm notification:', error);
      // Sem dispatch a chavinha volta sozinha para o estado anterior, e o
      // usuário só via ela "pular de volta" sem nenhuma explicação. Se falhou
      // ao LIGAR, o alarme não vai tocar e isso precisa ser dito.
      showDialog({
        title: newEnabled ? 'O alarme não foi ligado' : 'O alarme não foi desligado',
        message: newEnabled
          ? 'O celular não aceitou este alarme. Ele NÃO vai tocar.\n\nTente ligar de novo.'
          : 'Não foi possível desligar o alarme. Ele ainda pode tocar.\n\nTente de novo.',
        variant: 'error',
        buttons: [{ text: 'Entendi' }],
      });
    }
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: ac.background }}>
        {/* Header — só título; a ação de adicionar fica na barra inferior,
            igual ao modo normal (nada de ações no topo). */}
        <View style={{
          paddingHorizontal: 20,
          paddingTop: insets.top + 12,
          paddingBottom: 16,
          borderBottomWidth: 2,
          borderBottomColor: ac.border,
          backgroundColor: ac.bar,
        }}>
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Remédios</Text>
          <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>
            {sortedAlarms.length} lembrete(s) configurado(s)
          </Text>
        </View>
        <AlarmHistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} />
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
          <Pressable
            onPress={() => setHistoryVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Histórico de alarmes"
            style={({ pressed }) => [{
              minHeight: as_.touchTarget,
              borderRadius: 16,
              borderWidth: 3,
              borderColor: ac.primary,
              backgroundColor: ac.surface,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              opacity: pressed ? 0.85 : 1,
            }]}
          >
            <MaterialIcons name="history" size={30} color={ac.primary} />
            <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.primary }}>Ver histórico</Text>
          </Pressable>
        </View>

        {sortedAlarms.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
            <MaterialIcons name="alarm" size={80} color={ac.muted} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.foreground, textAlign: 'center' }}>
              Nenhum lembrete
            </Text>
            <Text style={{ fontSize: af.md, color: ac.muted, textAlign: 'center', lineHeight: af.md * 1.5 }}>
              Toque no botão abaixo para adicionar um lembrete de medicação.
            </Text>
          </View>
        ) : (
          <FlatList
            data={sortedAlarms}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={{
                margin: 12,
                marginBottom: 0,
                backgroundColor: ac.surface,
                borderRadius: as_.cardRadius,
                borderWidth: 2,
                borderColor: ac.border,
                overflow: 'hidden',
              }}>
                {/* Alarm Info */}
                <View style={{ padding: 20, gap: 6 }}>
                  <Text style={{ fontSize: af['3xl'], fontWeight: '900', color: ac.primary, fontFamily: BrandFonts.monoRegular }}>
                    {item.time}
                  </Text>
                  <Text style={{ fontSize: af.md, color: ac.foreground, fontWeight: '600' }}>
                    {item.description || 'Sem descrição'}
                  </Text>
                  <Text style={{ fontSize: af.sm, color: ac.muted }}>
                    {item.repeat === 'daily' ? 'Todos os dias' :
                     item.repeat === 'weekdays' ? 'Dias úteis' :
                     item.repeat === 'weekends' ? 'Fins de semana' : 'Personalizado'}
                  </Text>
                </View>
                {/* Action Buttons — delete lives inside the edit modal (confirm-guarded) */}
                <View style={{ borderTopWidth: 2, borderTopColor: ac.border }}>
                  <Pressable
                    onPress={() => openEditModal(item)}
                    style={({ pressed }) => [{
                      paddingVertical: as_.buttonPadding,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 10,
                      backgroundColor: pressed ? ac.primary + '20' : ac.background,
                    }]}
                    accessibilityRole="button"
                    accessibilityLabel="Editar lembrete"
                  >
                    <MaterialIcons name="edit" size={28} color={ac.primary} />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.primary }}>Editar</Text>
                  </Pressable>
                </View>
              </View>
            )}
            contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Adicionar — barra inferior, mesma posição do modo normal */}
        <View style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderTopWidth: 2,
          borderTopColor: ac.border,
          backgroundColor: ac.bar,
        }}>
          <Pressable
            onPress={openAddModal}
            style={({ pressed }) => [{
              backgroundColor: ac.primary,
              borderRadius: 20,
              minHeight: as_.touchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              borderWidth: 3,
              borderColor: ac.primary,
              opacity: pressed ? 0.85 : 1,
            }]}
            accessibilityRole="button"
            accessibilityLabel="Adicionar lembrete de medicação"
          >
            <MaterialIcons name="add" size={32} color={ac.onPrimary} />
            <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.onPrimary }}>Adicionar Lembrete</Text>
          </Pressable>
        </View>

        <AlarmFormModal
          visible={modalVisible}
          editingAlarm={editingAlarm}
          onCancel={() => setModalVisible(false)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
        <AppDialog {...dialogProps} />
        <AppToast {...toastProps} />
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE ----------------------------------------------------------
  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header — só título, sem botões (regra do app: nada de ações no topo) */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'], fontFamily: BrandFonts.body }]}>Remédios</Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
            Seus lembretes de medicação
          </Text>
        </View>
      </View>
      <AlarmHistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} />

      {/* Atalho para o histórico — fora da área do título */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <Pressable
          onPress={() => setHistoryVisible(true)}
          style={({ pressed }) => [
            styles.historyLinkBtn,
            { backgroundColor: colors.surface, borderColor: colors.border, minHeight: fs.touch(40), opacity: pressed ? 0.75 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Histórico de alarmes"
        >
          <MaterialIcons name="history" size={18} color={colors.primary} />
          <Text style={[styles.historyLinkText, { color: colors.primary, fontSize: fs.sm, fontFamily: BrandFonts.body }]}>
            Ver histórico
          </Text>
        </Pressable>
      </View>

      {/* "Próximo" highlight card */}
      {nextAlarm && (
        <View style={[styles.nextCard, {
          backgroundColor: colors.warningLight,
          borderColor: colors.warning,
          marginHorizontal: 16,
          marginTop: 12,
        }]}>
          <View style={styles.nextCardInner}>
            <MaterialIcons name="alarm" size={20} color={colors.warningDark} />
            <Text style={[styles.nextCardLabel, { color: colors.warningDark, fontSize: fs.xs }]}>
              PRÓXIMO{hoursUntilLabel(nextAlarm.time) ? ` · ${hoursUntilLabel(nextAlarm.time)}` : ''}
            </Text>
          </View>
          <Text style={[styles.nextCardTime, { color: colors.warningDark, fontFamily: BrandFonts.monoRegular, fontSize: fs.scaled(28) }]}>
            {nextAlarm.time}
          </Text>
          {nextAlarm.description ? (
            <Text style={[styles.nextCardDesc, { color: colors.warningDark, fontSize: fs.sm }]} numberOfLines={1}>
              {nextAlarm.description}
            </Text>
          ) : null}
        </View>
      )}

      {/* List */}
      {sortedAlarms.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="alarm" size={64} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground, fontSize: fs.lg, fontFamily: BrandFonts.body }]}>
            Nenhum lembrete configurado
          </Text>
          <Text style={[styles.emptySubtext, { color: colors.muted, fontSize: fs.sm, lineHeight: fs.scaled(22) }]}>
            Adicione seu primeiro lembrete de medicação abaixo.
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedAlarms}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <AlarmCard
              alarm={item}
              onEdit={openEditModal}
              onToggle={handleToggle}
              onTest={(alarm) => router.push(`/alarm-ring?alarmId=${alarm.id}`)}
            />
          )}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add button — full width, min 56dp */}
      <View style={[styles.addBtnContainer, { borderTopColor: colors.border, backgroundColor: colors.bar }]}>
        <PressableScale
          onPress={openAddModal}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.primarySurface, minHeight: fs.touch(56), opacity: pressed ? 0.85 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Adicionar lembrete de medicação"
        >
          <MaterialIcons name="add" size={22} color={colors.onPrimary} />
          <Text style={[styles.addBtnText, { color: colors.onPrimary, fontSize: fs.md, fontFamily: BrandFonts.body }]}>
            Adicionar lembrete
          </Text>
        </PressableScale>
      </View>

      <AlarmFormModal
        visible={modalVisible}
        editingAlarm={editingAlarm}
        onCancel={() => setModalVisible(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
  },
  historyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyLinkText: {
    fontWeight: '600',
  },
  nextCard: {
    borderWidth: 0,
    borderLeftWidth: 6,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  nextCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextCardLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  nextCardTime: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextCardDesc: {
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtext: {
    textAlign: 'center',
  },
  addBtnContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  addBtnText: {
    fontWeight: '700',
  },
});
