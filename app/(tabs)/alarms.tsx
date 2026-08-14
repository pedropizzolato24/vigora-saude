import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import React, { useEffect, useRef, useState } from 'react';
import { useAccessibility } from '@/lib/accessibility-context';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { FormKeyboardView } from '@/components/form-keyboard-view';
import { WheelPicker, wheelColumnMetrics } from '@/components/wheel-picker';
import { WizardStep } from '@/components/wizard-step';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { PressableScale } from '@/components/pressable-scale';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmCard } from '@/components/alarm-card';
import { AlarmHistorySheet } from '@/components/alarm-history-sheet';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import { generateId, useAppContext, type Alarm } from '@/lib/app-context';
import { scheduleFullAlarm, cancelFullAlarm } from '@/lib/alarm-sync';
import { openBatteryOptimizationSettings } from '@/lib/battery-optimization';
import { oemBatteryHint } from '@/lib/_core/oem-battery-hint';
import { canScheduleExactAlarms, isIgnoringBatteryOptimizations, openExactAlarmSettings, canUseFullScreenIntent, openFullScreenIntentSettings } from 'expo-alarm-countdown';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MAX_ALARMS } from '@/components/pro-limits';

// Evita repetir o aviso de "Alarmes e lembretes" a cada visita à aba na mesma
// sessão (a permissão continua sendo checada — só o diálogo não re-aparece).
let exactAlarmPromptShown = false;
// Mesma lógica para o aviso de otimização de bateria (a isenção continua sendo
// re-checada a cada visita — só o diálogo não re-aparece na mesma sessão).
let batteryPromptShown = false;
// Mesma lógica para o aviso de "Notificações em tela cheia" (Android 14+): a
// permissão continua sendo re-checada a cada visita — só o diálogo não re-aparece.
let fullScreenPromptShown = false;
// Um aviso de configuração por sessão: os efeitos de bateria e de alarmes
// exatos disparam quase juntos no mount e o AppDialog é único — sem este gate o
// segundo showDialog sobrescreve o primeiro e engole um dos avisos em silêncio.
// O que não aparecer nesta sessão volta na próxima (a flag de tópico só é
// marcada para o que de fato foi exibido).
let alarmSetupPromptShownThisSession = false;

const REPEAT_OPTIONS: { value: Alarm['repeat']; label: string }[] = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekdays', label: 'Dias úteis' },
  { value: 'weekends', label: 'Fins de semana' },
  { value: 'custom', label: 'Personalizado' },
];

const EMPTY_FORM: Omit<Alarm, 'id'> = {
  time: '08:00',
  description: '',
  enabled: true,
  repeat: 'daily',
  customDays: [],
  sound: true,
  vibration: true,
};

const WEEKDAYS = [
  { day: 0, label: 'D', full: 'Dom' },
  { day: 1, label: 'S', full: 'Seg' },
  { day: 2, label: 'T', full: 'Ter' },
  { day: 3, label: 'Q', full: 'Qua' },
  { day: 4, label: 'Q', full: 'Qui' },
  { day: 5, label: 'S', full: 'Sex' },
  { day: 6, label: 'S', full: 'Sáb' },
];

const TIME_QUICK_PICKS = ['08:00', '12:00', '20:00'];

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
  const [form, setForm] = useState<Omit<Alarm, 'id'>>(EMPTY_FORM);
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [historyVisible, setHistoryVisible] = useState(false);
  const minuteInputRef = useRef<TextInput>(null);
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  // Otimização de bateria: OEMs agressivos (Samsung/Xiaomi) matam o app e o
  // alarme não toca. Igual ao aviso de alarmes exatos abaixo: re-checa o estado
  // REAL da isenção a cada visita e avisa 1x por sessão enquanto ela não
  // estiver concedida (antes só marcava "já vi" e nunca mais avisava).
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    (async () => {
      const exempt = await isIgnoringBatteryOptimizations();
      if (exempt || cancelled || batteryPromptShown || alarmSetupPromptShownThisSession) return;
      batteryPromptShown = true;
      alarmSetupPromptShownThisSession = true;
      // Passo extra por fabricante (Samsung/Xiaomi têm listas próprias além da
      // isenção padrão do Android); null nos OEMs stock.
      const manufacturer = (Platform.constants as { Manufacturer?: string }).Manufacturer ?? '';
      const hint = oemBatteryHint(manufacturer);
      showDialog({
        title: 'Para o alarme tocar sempre',
        message:
          'Para economizar energia, o celular pode fechar o Vigora sozinho. Se isso acontecer, o alarme não toca.\n\n' +
          'Vamos resolver:\n' +
          '1. Toque em "Continuar" aqui embaixo\n' +
          '2. Na pergunta que aparecer, escolha "Permitir"' +
          (hint ? `\n\n${hint}` : ''),
        variant: 'warning',
        buttons: [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Continuar', onPress: () => openBatteryOptimizationSettings() },
        ],
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android 12/12L: a permissão "Alarmes e lembretes" pode estar revogada —
  // sem ela o alarme dispara inexato (pode atrasar minutos). Diferente do
  // aviso de bateria (uma vez só), este re-checa a permissão a cada visita e
  // avisa 1x por sessão enquanto ela estiver desligada.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let cancelled = false;
    (async () => {
      const allowed = await canScheduleExactAlarms();
      if (allowed || cancelled || exactAlarmPromptShown || alarmSetupPromptShownThisSession) return;
      exactAlarmPromptShown = true;
      alarmSetupPromptShownThisSession = true;
      showDialog({
        title: 'Permita alarmes exatos',
        message:
          'Para os alarmes tocarem na hora certa, o Vigora precisa da permissão "Alarmes e lembretes". Toque em "Abrir configurações" e ative a chave para o Vigora.',
        variant: 'warning',
        buttons: [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Abrir configurações', onPress: () => { openExactAlarmSettings(); } },
        ],
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sem a permissão "Notificações em tela cheia" (Android 14+) o alarme vira um
  // aviso pequeno no alto da tela: a alarm-ring só abre se o idoso TOCAR nele,
  // em vez de tomar a tela sozinha como um alarme de verdade. Ela deixou de ser
  // concedida no install para apps fora da categoria alarme/chamada da loja.
  //
  // Este aviso NÃO roda no mount junto com os outros dois. Rodava, e perdia a
  // vaga única da sessão para o de bateria — só aparecia numa visita posterior,
  // que na prática caía DEPOIS do primeiro alarme já ter tocado sem tela cheia.
  // Tarde demais: o alarme que ele conserta é justamente aquele. Agora sai na
  // criação do alarme (ver handleSave), que é quando a permissão passa a valer
  // e quando o idoso está olhando para o assunto.
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

  // Derived hour/minute from form.time for the split picker
  const [timeHour, timeMinute] = form.time.split(':');

  // Alinha o ":" à faixa selecionada da roda (em vez de um margin fixo, que
  // desalinhou quando a roda passou de 5 para 3 itens).
  const colonMetrics = wheelColumnMetrics(isAccessibilityMode, as_.touchTarget);

  const handleHourChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    const hNum = parseInt(digits, 10);
    // Auto-jump to minute field when 2 digits entered or hour > 2
    if (digits.length === 2 || (digits.length === 1 && hNum > 2)) {
      const clampedH = isNaN(hNum) ? '00' : String(Math.min(hNum, 23)).padStart(2, '0');
      setForm((f) => ({ ...f, time: `${clampedH}:${f.time.split(':')[1] || '00'}` }));
      if (digits.length === 2) minuteInputRef.current?.focus();
    } else {
      setForm((f) => ({ ...f, time: `${digits}:${f.time.split(':')[1] || '00'}` }));
    }
  };

  const handleMinuteChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    const mNum = parseInt(digits, 10);
    const clampedM = digits.length === 2 ? String(Math.min(mNum, 59)).padStart(2, '0') : digits;
    const currentHour = form.time.split(':')[0] || '00';
    setForm((f) => ({ ...f, time: `${currentHour}:${clampedM}` }));
  };

  const handleHourBlur = () => {
    const h = parseInt(timeHour, 10);
    const clamped = isNaN(h) ? '00' : String(Math.min(h, 23)).padStart(2, '0');
    setForm((f) => ({ ...f, time: `${clamped}:${f.time.split(':')[1] || '00'}` }));
  };

  const handleMinuteBlur = () => {
    const m = parseInt(timeMinute, 10);
    const clamped = isNaN(m) ? '00' : String(Math.min(m, 59)).padStart(2, '0');
    setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${clamped}` }));
  };

  const incrementHour = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const h = parseInt(timeHour, 10);
    const base = isNaN(h) ? 0 : h;
    const next = ((base + delta + 24) % 24);
    setForm((f) => ({ ...f, time: `${String(next).padStart(2, '0')}:${f.time.split(':')[1] || '00'}` }));
  };

  const incrementMinute = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const m = parseInt(timeMinute, 10);
    const base = isNaN(m) ? 0 : m;
    const next = ((base + delta + 60) % 60);
    setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${String(next).padStart(2, '0')}` }));
  };

  const sortedAlarms = [...state.alarms].sort((a, b) => {
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
    setForm(EMPTY_FORM);
    setWizardStep(1);
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
    setForm({
      time: alarm.time,
      description: alarm.description,
      enabled: alarm.enabled,
      repeat: alarm.repeat,
      customDays: alarm.customDays,
      sound: alarm.sound,
      vibration: alarm.vibration,
    });
    setWizardStep(1);
    setModalVisible(true);
  };

  const handleSave = async () => {
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
      showDialog({ title: 'Erro', message: 'Não foi possível agendar a notificação do alarme.', variant: 'error', buttons: [{ text: 'OK' }] });
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
            {state.alarms.length} lembrete(s) configurado(s)
          </Text>
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

        {/* Simplified Modal for Accessibility Mode */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: ac.background }}>
            {/* Título apenas — Cancelar/Salvar ficam na barra inferior */}
            <View style={{
              paddingHorizontal: 20,
              paddingTop: insets.top + 16,
              paddingBottom: 16,
              borderBottomWidth: 2,
              borderBottomColor: ac.border,
              alignItems: 'center',
              backgroundColor: ac.bar,
            }}>
              <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>
                {editingAlarm ? 'Editar Lembrete' : 'Novo Lembrete'}
              </Text>
            </View>
            <FormKeyboardView
              style={{ flex: 1 }}
            >
            <ScrollView contentContainerStyle={{ padding: 24, gap: 28 }} keyboardShouldPersistTaps="handled">
              {/* Time */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Horário</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={() => incrementHour(1)}
                      style={({ pressed }) => [{ backgroundColor: ac.surface, borderRadius: 16, padding: 12, borderWidth: 2, borderColor: ac.border, opacity: pressed ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Aumentar hora"
                    >
                      <MaterialIcons name="keyboard-arrow-up" size={36} color={ac.primary} />
                    </Pressable>
                    <TextInput
                      value={timeHour}
                      onChangeText={handleHourChange}
                      onBlur={handleHourBlur}
                      placeholder="08"
                      placeholderTextColor={ac.muted}
                      keyboardType="number-pad"
                      style={{
                        width: 90,
                        height: 90,
                        textAlign: 'center',
                        fontSize: af['3xl'],
                        fontWeight: '900',
                        color: ac.foreground,
                        backgroundColor: ac.surface,
                        borderRadius: 16,
                        borderWidth: 3,
                        borderColor: ac.primary,
                      }}
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Pressable
                      onPress={() => incrementHour(-1)}
                      style={({ pressed }) => [{ backgroundColor: ac.surface, borderRadius: 16, padding: 12, borderWidth: 2, borderColor: ac.border, opacity: pressed ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Diminuir hora"
                    >
                      <MaterialIcons name="keyboard-arrow-down" size={36} color={ac.primary} />
                    </Pressable>
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>hora</Text>
                  </View>
                  <Text style={{ fontSize: af['4xl'], fontWeight: '900', color: ac.foreground, marginBottom: 32 }}>:</Text>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Pressable
                      onPress={() => incrementMinute(1)}
                      style={({ pressed }) => [{ backgroundColor: ac.surface, borderRadius: 16, padding: 12, borderWidth: 2, borderColor: ac.border, opacity: pressed ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Aumentar minuto"
                    >
                      <MaterialIcons name="keyboard-arrow-up" size={36} color={ac.primary} />
                    </Pressable>
                    <TextInput
                      ref={minuteInputRef}
                      value={timeMinute}
                      onChangeText={handleMinuteChange}
                      onBlur={handleMinuteBlur}
                      placeholder="00"
                      placeholderTextColor={ac.muted}
                      keyboardType="number-pad"
                      style={{
                        width: 90,
                        height: 90,
                        textAlign: 'center',
                        fontSize: af['3xl'],
                        fontWeight: '900',
                        color: ac.foreground,
                        backgroundColor: ac.surface,
                        borderRadius: 16,
                        borderWidth: 3,
                        borderColor: ac.primary,
                      }}
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Pressable
                      onPress={() => incrementMinute(-1)}
                      style={({ pressed }) => [{ backgroundColor: ac.surface, borderRadius: 16, padding: 12, borderWidth: 2, borderColor: ac.border, opacity: pressed ? 0.6 : 1 }]}
                      accessibilityRole="button"
                      accessibilityLabel="Diminuir minuto"
                    >
                      <MaterialIcons name="keyboard-arrow-down" size={36} color={ac.primary} />
                    </Pressable>
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>min</Text>
                  </View>
                </View>
              </View>
              {/* Description */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Nome do Lembrete</Text>
                <TextInput
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder="Ex: Tomar remédio para pressão"
                  placeholderTextColor={ac.muted}
                  style={{
                    backgroundColor: ac.surface,
                    color: ac.foreground,
                    borderColor: ac.border,
                    borderWidth: 2,
                    borderRadius: 16,
                    padding: 18,
                    fontSize: af.md,
                    fontWeight: '500',
                  }}
                  returnKeyType="done"
                  maxLength={80}
                />
              </View>
              {/* Repeat - simplified to just daily/weekdays */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Repetição</Text>
                {[{ value: 'daily' as const, label: 'Todos os dias' }, { value: 'weekdays' as const, label: 'Dias úteis (Seg-Sex)' }].map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, repeat: opt.value }))}
                    style={[{
                      paddingVertical: as_.buttonPadding,
                      paddingHorizontal: 20,
                      borderRadius: 16,
                      borderWidth: 3,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      backgroundColor: form.repeat === opt.value ? ac.primary : ac.surface,
                      borderColor: form.repeat === opt.value ? ac.primary : ac.border,
                    }]}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: form.repeat === opt.value }}
                  >
                    <MaterialIcons
                      name={form.repeat === opt.value ? 'radio-button-on' : 'radio-button-off'}
                      size={28}
                      color={form.repeat === opt.value ? ac.onPrimary : ac.muted}
                    />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: form.repeat === opt.value ? ac.onPrimary : ac.foreground }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {/* Delete button in edit mode */}
              {editingAlarm && (
                <Pressable
                  onPress={() => handleDelete(editingAlarm.id)}
                  style={({ pressed }) => [{
                    paddingVertical: as_.buttonPadding,
                    paddingHorizontal: 20,
                    borderRadius: 16,
                    borderWidth: 3,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    backgroundColor: pressed ? ac.error + '20' : ac.background,
                    borderColor: ac.emergency,
                    marginTop: 8,
                  }]}
                  accessibilityRole="button"
                  accessibilityLabel="Excluir este lembrete"
                >
                  <MaterialIcons name="delete" size={28} color={ac.emergency} />
                  <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.emergency }}>Excluir Lembrete</Text>
                </Pressable>
              )}
            </ScrollView>
            {/* Barra inferior de ações: Cancelar + Salvar */}
            <View style={{ flexDirection: 'row', gap: 12, padding: 20, paddingBottom: Math.max(insets.bottom, 20), borderTopWidth: 2, borderTopColor: ac.border, backgroundColor: ac.bar }}>
              <Pressable
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                style={({ pressed }) => [{ flex: 1, minHeight: 64, borderRadius: 16, borderWidth: 3, borderColor: ac.muted, backgroundColor: ac.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                accessibilityRole="button"
                accessibilityLabel="Salvar lembrete"
                style={({ pressed }) => [{ flex: 1.5, minHeight: 64, borderRadius: 16, backgroundColor: ac.success, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.onPrimary }}>Salvar</Text>
              </Pressable>
            </View>
            </FormKeyboardView>
          </View>
        </Modal>
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
            { backgroundColor: colors.primary, minHeight: fs.touch(56), opacity: pressed ? 0.85 : 1 },
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

      {/* Wizard Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          {/* Modal Header — título apenas; Cancelar fica na barra inferior do wizard */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 16 }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: fs.xl, fontFamily: BrandFonts.body }]}>
              {editingAlarm ? 'Editar Lembrete' : 'Novo Lembrete'}
            </Text>
          </View>

          {/* Wizard Steps */}
          <FormKeyboardView
            style={styles.wizardContainer}
          >
            {wizardStep === 1 ? (
              <WizardStep
                total={2}
                current={0}
                categoryTag="Horário"
                tagColor={colors.primary}
                question="Que horas tomar?"
                onNext={() => setWizardStep(2)}
                onCancel={() => setModalVisible(false)}
                nextLabel="Continuar"
              >
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.wizardStepContent}>
                  {/* WheelPicker time selector */}
                  <View style={styles.timePicker}>
                    <WheelPicker
                      count={24}
                      value={parseInt(timeHour, 10) || 0}
                      onChange={(h) =>
                        setForm((f) => ({ ...f, time: `${String(h).padStart(2, '0')}:${f.time.split(':')[1] || '00'}` }))
                      }
                      label="hora"
                    />
                    <View style={{ marginTop: colonMetrics.wheelTop, height: colonMetrics.wheelHeight, justifyContent: 'center' }}>
                      <Text style={[styles.timeColon, { color: colors.foreground, fontSize: fs.scaled(40) }]}>:</Text>
                    </View>
                    <WheelPicker
                      count={60}
                      value={parseInt(timeMinute, 10) || 0}
                      onChange={(m) =>
                        setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${String(m).padStart(2, '0')}` }))
                      }
                      label="min"
                    />
                  </View>

                  {/* Quick-pick chips */}
                  <View style={styles.quickPicks}>
                    <Text style={[styles.quickPickLabel, { color: colors.muted, fontSize: fs.sm }]}>Sugestões</Text>
                    <View style={styles.quickPickRow}>
                      {TIME_QUICK_PICKS.map((t) => {
                        const selected = form.time === t;
                        return (
                          <Pressable
                            key={t}
                            onPress={() => setForm((f) => ({ ...f, time: t }))}
                            style={[
                              styles.quickPickChip,
                              {
                                backgroundColor: selected ? colors.primary : colors.surface,
                                borderColor: selected ? colors.primary : colors.border,
                                minHeight: fs.touch(44),
                              },
                            ]}
                            accessibilityRole="button"
                            accessibilityLabel={`Horário ${t}`}
                            accessibilityState={{ selected }}
                          >
                            <Text style={[styles.quickPickChipText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm, fontFamily: BrandFonts.monoRegular }]}>
                              {t}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </ScrollView>
              </WizardStep>
            ) : (
              <WizardStep
                total={2}
                current={1}
                categoryTag="Detalhes"
                tagColor={colors.primary}
                question="Como configurar?"
                onBack={() => setWizardStep(1)}
                onNext={handleSave}
                nextLabel={editingAlarm ? 'Salvar' : 'Criar lembrete'}
                nextDisabled={form.repeat === 'custom' && (form.customDays ?? []).length === 0}
              >
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.wizardStepContent}>
                  {/* Description */}
                  <View style={styles.formGroup}>
                    <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Nome do lembrete</Text>
                    <TextInput
                      value={form.description}
                      onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                      placeholder="Ex: Tomar remédio para pressão"
                      placeholderTextColor={colors.muted}
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: colors.surface,
                          color: colors.foreground,
                          borderColor: colors.border,
                          fontSize: fs.base,
                        },
                      ]}
                      returnKeyType="done"
                      maxLength={80}
                    />
                  </View>

                  {/* Repeat */}
                  <View style={styles.formGroup}>
                    <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Repetição</Text>
                    <View style={styles.repeatOptions}>
                      {REPEAT_OPTIONS.map((opt) => (
                        <Pressable
                          key={opt.value}
                          onPress={() => setForm((f) => ({ ...f, repeat: opt.value }))}
                          style={[
                            styles.repeatOption,
                            {
                              backgroundColor: form.repeat === opt.value ? colors.primary : colors.surface,
                              borderColor: form.repeat === opt.value ? colors.primary : colors.border,
                              minHeight: fs.touch(44),
                            },
                          ]}
                          accessibilityRole="radio"
                          accessibilityLabel={opt.label}
                          accessibilityState={{ selected: form.repeat === opt.value }}
                        >
                          <Text
                            style={[
                              styles.repeatOptionText,
                              { color: form.repeat === opt.value ? colors.onPrimary : colors.foreground, fontSize: fs.sm },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Custom weekday selector */}
                    {form.repeat === 'custom' && (
                      <View style={[styles.weekdaySelector, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <Text style={[styles.weekdayTitle, { color: colors.muted, fontSize: fs.xs }]}>Dias da semana</Text>
                        <View style={styles.weekdayRow}>
                          {WEEKDAYS.map(({ day, label, full }) => {
                            const selected = (form.customDays ?? []).includes(day);
                            return (
                              <Pressable
                                key={day}
                                onPress={() => {
                                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                  setForm((f) => {
                                    const days = f.customDays ?? [];
                                    return {
                                      ...f,
                                      customDays: selected
                                        ? days.filter((d) => d !== day)
                                        : [...days, day].sort(),
                                    };
                                  });
                                }}
                                style={[
                                  styles.weekdayBtn,
                                  {
                                    backgroundColor: selected ? colors.primary : colors.background,
                                    borderColor: selected ? colors.primary : colors.border,
                                    minHeight: fs.touch(52),
                                  },
                                ]}
                                accessibilityRole="checkbox"
                                accessibilityLabel={full}
                                accessibilityState={{ checked: selected }}
                              >
                                <Text style={[styles.weekdayBtnText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm }]}>
                                  {label}
                                </Text>
                                <Text style={[styles.weekdayBtnFull, { color: selected ? colors.onPrimary + 'CC' : colors.muted, fontSize: fs.xs }]}>
                                  {full}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        {(form.customDays ?? []).length === 0 && (
                          <Text style={[styles.weekdayHint, { color: colors.error, fontSize: fs.sm }]}>
                            Selecione pelo menos um dia
                          </Text>
                        )}
                      </View>
                    )}
                  </View>

                  {/* Toggles */}
                  <View style={[styles.togglesSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <View style={styles.toggleRow}>
                      <View style={styles.toggleLeft}>
                        <MaterialIcons name="volume-up" size={20} color={colors.muted} />
                        <Text style={[styles.toggleLabel, { color: colors.foreground, fontSize: fs.base }]}>Som</Text>
                      </View>
                      <Switch
                        value={form.sound}
                        onValueChange={(v) => setForm((f) => ({ ...f, sound: v }))}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                        accessibilityLabel="Ativar som"
                      />
                    </View>
                    <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.toggleRow}>
                      <View style={styles.toggleLeft}>
                        <MaterialIcons name="vibration" size={20} color={colors.muted} />
                        <Text style={[styles.toggleLabel, { color: colors.foreground, fontSize: fs.base }]}>Vibração</Text>
                      </View>
                      <Switch
                        value={form.vibration}
                        onValueChange={(v) => setForm((f) => ({ ...f, vibration: v }))}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                        accessibilityLabel="Ativar vibração"
                      />
                    </View>
                    <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
                    <View style={styles.toggleRow}>
                      <View style={styles.toggleLeft}>
                        <MaterialIcons name="check-circle" size={20} color={colors.muted} />
                        <Text style={[styles.toggleLabel, { color: colors.foreground, fontSize: fs.base }]}>Habilitado</Text>
                      </View>
                      <Switch
                        value={form.enabled}
                        onValueChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                        accessibilityLabel="Habilitar lembrete"
                      />
                    </View>
                  </View>
                  {/* Delete button — visible in edit mode only */}
                  {editingAlarm && (
                    <Pressable
                      onPress={() => handleDelete(editingAlarm.id)}
                      style={({ pressed }) => [
                        styles.deleteAlarmBtn,
                        { borderColor: colors.error, backgroundColor: pressed ? colors.errorLight : colors.background, minHeight: fs.touch(52) },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel="Excluir este lembrete"
                    >
                      <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                      <Text style={[styles.deleteAlarmBtnText, { color: colors.error, fontSize: fs.base }]}>
                        Excluir lembrete
                      </Text>
                    </Pressable>
                  )}
                </ScrollView>
              </WizardStep>
            )}
          </FormKeyboardView>
        </View>
      </Modal>
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
  modal: {
    flex: 1,
  },
  modalHeader: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontWeight: '600',
  },
  wizardContainer: {
    flex: 1,
    padding: 20,
  },
  wizardStepContent: {
    gap: 20,
    paddingBottom: 16,
  },
  formGroup: {
    gap: 8,
  },
  formLabel: {
    fontWeight: '600',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  repeatOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  repeatOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  repeatOptionText: {
    fontWeight: '500',
  },
  togglesSection: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontWeight: '500',
  },
  toggleDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 16,
  },
  timePicker: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 12,
  },
  timeColon: {
    fontWeight: '800',
    paddingHorizontal: 4,
  },
  quickPicks: {
    gap: 8,
  },
  quickPickLabel: {
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickPickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quickPickChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickPickChipText: {
    fontWeight: '700',
  },
  weekdaySelector: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  weekdayTitle: {
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  weekdayBtn: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  weekdayBtnText: {
    fontWeight: '700',
  },
  weekdayBtnFull: {
    fontWeight: '500',
  },
  weekdayHint: {
    marginTop: 4,
    textAlign: 'center',
  },
  deleteAlarmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderRadius: 14,
    marginTop: 8,
  },
  deleteAlarmBtnText: {
    fontWeight: '600',
  },
});
