/**
 * managed-alarms.tsx (cuidador)
 *
 * "Alarmes de [nome]" (spec 6.1). Estados: sem acordo, pedido pendente, acordo
 * ativo meu, acordo ativo de outro cuidador (e pedido pendente de outro). Só
 * quem tem o acordo ativo edita, e o AlarmFormModal só coleta os valores: quem
 * grava é a rota do servidor (nada vai para o estado local do cuidador). Modo
 * normal e acessível numa árvore só, com `skin` trocando cores e tamanhos.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmFormModal } from '@/components/alarm-form-modal';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { CaregiverRefreshControl, UpdatedAgoBar } from '@/components/caregiver-refresh';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { BrandFonts } from '@/lib/_core/theme';
import { useAccessibility } from '@/lib/accessibility-context';
import { checkinAlarms, medicationAlarms, type AlarmKind } from '@/lib/alarm-kind';
import type { AlarmFormValues } from '@/lib/alarm-form';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { useFontSize } from '@/lib/font-size-context';
import {
  alarmDeliveryStatus,
  alarmRepeatLabel,
  deliveryText,
  describeMutationError,
  listSummary,
  requestExpiryText,
  screenMode,
  toManagedInput,
  type DeliveryStatus,
} from '@/lib/managed-alarms-caregiver';
import { trpc } from '@/lib/trpc';
import { MANAGED_ALARMS_MAX, type ManagedAlarm } from '@/shared/managed-alarm';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type RunResult = 'ok' | 'conflict' | 'error';

type Palette = {
  background: string; surface: string; border: string; foreground: string; muted: string;
  primary: string; onPrimary: string; success: string; warning: string; error: string;
};

/** Cores e tamanhos já resolvidos para o modo ativo (normal ou acessível). */
type Skin = {
  c: Palette;
  bw: number;
  pad: number;
  radius: number;
  /** Altura mínima de alvo de toque: ≥44 no normal, ≥60 no acessível. */
  touch: number;
  icon: number;
  sz: { title: number; heading: number; body: number; button: number; time: number };
};

export default function CaregiverManagedAlarmsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af, a11ySpacing: as_ } = useAccessibility();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<ManagedAlarm | null>(null);
  const [newKind, setNewKind] = useState<AlarmKind>('medication');
  // Versão da lista quando o formulário abriu: é contra ela que o servidor
  // decide se a lista mudou no meio da edição (CONFLICT).
  const formVersion = useRef(0);
  // Uma gravação por vez: toque duplo não manda duas.
  const busy = useRef(false);

  const managed = trpc.managedAlarms.forCaregiver.useQuery(undefined, { enabled: !!linked, refetchOnWindowFocus: true });
  const management = managed.data?.management ?? null;
  const list = managed.data?.list ?? null;
  const mode = screenMode(management);
  // Sem ser o gerente, a lista confirmada não vem: a leitura usa o backup, como a tela da pessoa.
  const backup = trpc.link.getMonitoredData.useQuery(undefined, {
    enabled: !!linked && managed.isSuccess && mode !== 'active-mine',
    refetchOnWindowFocus: true,
  });

  const request = trpc.managedAlarms.request.useMutation();
  const cancelRequest = trpc.managedAlarms.cancelRequest.useMutation();
  const stopManaging = trpc.managedAlarms.stopManaging.useMutation();
  const createAlarm = trpc.managedAlarms.createAlarm.useMutation();
  const updateAlarm = trpc.managedAlarms.updateAlarm.useMutation();
  const deleteAlarm = trpc.managedAlarms.deleteAlarm.useMutation();

  const refreshing = managed.isRefetching;
  const onRefresh = () => {
    managed.refetch();
    if (mode !== 'active-mine') backup.refetch();
  };

  if (!linked) {
    return (
      <ScreenContainer containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
        <CaregiverEmptyState
          icon="person-add"
          title="Nenhuma pessoa acompanhada ainda"
          description="Adicione a pessoa que você cuida para começar a acompanhar."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  const personName = linked.displayName || managed.data?.monitoredName || 'a pessoa';
  const managerName = management?.managerName || 'Outro cuidador';

  const c: Palette = isAccessibilityMode
    ? { background: ac.background, surface: ac.surface, border: ac.border, foreground: ac.foreground, muted: ac.muted, primary: ac.primary, onPrimary: ac.onPrimary, success: ac.success, warning: ac.warning, error: ac.error }
    : { background: colors.background, surface: colors.surface, border: colors.border, foreground: colors.foreground, muted: colors.muted, primary: colors.primary, onPrimary: colors.onPrimary, success: colors.success, warning: colors.warning, error: colors.error };
  const skin: Skin = isAccessibilityMode
    ? { c, bw: 2, pad: 20, radius: 20, touch: as_.touchTarget, icon: 30, sz: { title: af.lg, heading: af.md, body: af.sm, button: af.base, time: af['2xl'] } }
    : { c, bw: 1, pad: 14, radius: 14, touch: fs.touch(44), icon: 22, sz: { title: fs.xl, heading: fs.lg, body: fs.base, button: fs.md, time: fs['2xl'] } };

  /** Gravação no servidor: erro vira toast, e a tela relê o servidor (o acordo ou a lista podem ter mudado). */
  const run = async (action: () => Promise<unknown>, okMessage: string, staleList = false): Promise<RunResult> => {
    if (busy.current) return 'error';
    busy.current = true;
    try {
      await action();
      await managed.refetch();
      showToast({ message: okMessage, variant: 'success' });
      return 'ok';
    } catch (err) {
      const failure = describeMutationError(err, { staleList });
      await managed.refetch();
      showToast({ message: failure.message, variant: failure.kind === 'network' ? 'warning' : 'error' });
      console.warn('[managed-alarms] gravação não concluída:', failure.kind);
      return failure.kind === 'conflict' ? 'conflict' : 'error';
    } finally {
      busy.current = false;
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    // typedRoutes: o .expo/types é gerado e ainda não conhece rotas novas.
    else router.replace('/(caregiver-tabs)/person' as never);
  };

  const openNew = (kind: AlarmKind) => {
    if (!list) return;
    if (list.alarms.length >= MANAGED_ALARMS_MAX) {
      showDialog({
        title: 'Limite atingido',
        message: `A lista tem no máximo ${MANAGED_ALARMS_MAX} alarmes, somando remédios e check-ins. Apague um para criar outro.`,
        variant: 'warning',
        buttons: [{ text: 'Entendi' }],
      });
      return;
    }
    formVersion.current = list.version;
    setEditing(null);
    setNewKind(kind);
    setFormVisible(true);
  };

  const openEdit = (alarm: ManagedAlarm) => {
    if (!list) return;
    formVersion.current = list.version;
    setEditing(alarm);
    setFormVisible(true);
  };

  const handleSave = async (form: AlarmFormValues) => {
    const alarm = toManagedInput(form);
    const baseVersion = formVersion.current;
    const result = await run(
      () =>
        editing
          ? updateAlarm.mutateAsync({ baseVersion, alarmId: editing.id, alarm })
          : createAlarm.mutateAsync({ baseVersion, alarm }),
      'Alarme salvo.',
      true
    );
    // Lista velha: a tela já releu o servidor, então o formulário (que mostrava o alarme antigo) fecha.
    if (result !== 'error') setFormVisible(false);
  };

  const deleteAndClose = async (alarmId: string) => {
    const baseVersion = formVersion.current;
    const result = await run(() => deleteAlarm.mutateAsync({ baseVersion, alarmId }), 'Alarme apagado.', true);
    if (result !== 'error') setFormVisible(false);
  };

  const handleDelete = (alarmId: string) => {
    const target = list?.alarms.find((a) => a.id === alarmId);
    const label = target ? target.description.trim() || target.time : 'Este alarme';
    showDialog({
      title: 'Apagar o alarme?',
      message: `"${label}" vai sumir do celular de ${personName}.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Apagar', style: 'destructive', onPress: () => { void deleteAndClose(alarmId); } },
      ],
    });
  };

  const handleToggle = (alarm: ManagedAlarm) => {
    if (!list) return;
    const baseVersion = list.version;
    void run(
      () =>
        updateAlarm.mutateAsync({
          baseVersion,
          alarmId: alarm.id,
          alarm: toManagedInput({ ...alarm, enabled: !alarm.enabled }),
        }),
      alarm.enabled ? 'Alarme desligado.' : 'Alarme ligado.',
      true
    );
  };

  const askRequest = () =>
    showDialog({
      title: 'Pedir para cuidar dos alarmes?',
      message: `${personName} vai receber um aviso no celular e decide se aceita. Até aceitar, você continua só vendo os alarmes.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Pedir', onPress: () => { void run(() => request.mutateAsync(), `Pedido enviado a ${personName}.`); } },
      ],
    });

  const askCancelRequest = () =>
    showDialog({
      title: 'Cancelar o pedido?',
      message: `${personName} deixa de receber o pedido para você cuidar dos alarmes.`,
      variant: 'confirm',
      buttons: [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Cancelar pedido', style: 'destructive', onPress: () => { void run(() => cancelRequest.mutateAsync(), 'Pedido cancelado.'); } },
      ],
    });

  const askStop = () =>
    showDialog({
      title: 'Parar de cuidar dos alarmes?',
      message: `${personName} será avisado e volta a cuidar dos próprios alarmes. Os alarmes que já estão no celular continuam tocando.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Parar', style: 'destructive', onPress: () => { void run(() => stopManaging.mutateAsync(), 'Você parou de cuidar dos alarmes.'); } },
      ],
    });

  const now = Date.now();
  // O backup é um array livre vindo do aparelho: descarta item que não seja objeto antes de ler campos.
  const readOnlyAlarms: ManagedAlarm[] =
    list?.alarms ?? ((backup.data?.alarms ?? []) as unknown[]).filter((a): a is ManagedAlarm => !!a && typeof a === 'object');
  const meds = medicationAlarms(readOnlyAlarms);
  const checks = checkinAlarms(readOnlyAlarms);

  const readOnlySections = (
    <>
      <Section skin={skin} title="Remédios">
        {backup.isLoading ? <Muted skin={skin} text="Carregando…" /> : null}
        {meds.length === 0 && !backup.isLoading ? <Muted skin={skin} text="Nenhum remédio na lista." /> : null}
        {meds.map((a) => <ReadOnlyRow key={a.id} skin={skin} alarm={a} />)}
      </Section>
      <Section skin={skin} title="Check-ins">
        {checks.length === 0 && !backup.isLoading ? <Muted skin={skin} text="Nenhum check-in na lista." /> : null}
        {checks.map((a) => <ReadOnlyRow key={a.id} skin={skin} alarm={a} />)}
      </Section>
    </>
  );

  let body: React.ReactNode;
  if (managed.isLoading) {
    body = <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />;
  } else if (managed.isError && !managed.data) {
    body = (
      <Card skin={skin}>
        <Muted skin={skin} text="Não foi possível carregar os alarmes. Confira a internet e tente de novo." />
        <ActionButton skin={skin} variant="outline" label="Tentar de novo" icon="refresh" onPress={() => { managed.refetch(); }} />
      </Card>
    );
  } else if (mode === 'no-agreement') {
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={`Você vê os alarmes de ${personName}, mas não pode mudá-los`} />
          <Muted
            skin={skin}
            text={`Se ${personName} aceitar, você passa a criar, mudar e apagar os remédios e check-ins, e ${personName} continua vendo e respondendo. ${personName} escolhe no próprio celular e pode parar quando quiser.`}
          />
          <ActionButton skin={skin} variant="primary" label="Pedir para cuidar dos alarmes" icon="alarm-add" onPress={askRequest} />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (mode === 'pending') {
    const expiry = requestExpiryText(management?.expiresAt ?? null, now);
    const waiting = expiry ? `Aguardando ${personName} aceitar (${expiry})` : `Aguardando ${personName} aceitar`;
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={waiting} />
          <Muted skin={skin} text={`${personName} recebeu um aviso no celular. Até a resposta, você continua só vendo os alarmes.`} />
          <ActionButton skin={skin} variant="outline" label="Cancelar pedido" icon="close" onPress={askCancelRequest} />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (mode === 'pending-other') {
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={`${managerName} já pediu para cuidar dos alarmes de ${personName}`} />
          <Muted skin={skin} text={`Aguardando ${personName} responder. Você continua só vendo os alarmes.`} />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (mode === 'active-other') {
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={`${managerName} cuida dos alarmes de ${personName}`} />
          <Muted skin={skin} text="Você vê a lista, mas só quem cuida dos alarmes pode mudá-la." />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (list) {
    // active-mine
    const summary = listSummary(list, personName, now);
    const summaryTone = summary.tone === 'ok' ? c.success : summary.tone === 'pending' ? c.warning : c.error;
    const summaryIcon: IconName = summary.tone === 'ok' ? 'check-circle' : summary.tone === 'pending' ? 'schedule' : 'error';
    const rowFor = (a: ManagedAlarm) => {
      const status = alarmDeliveryStatus(list, a.id);
      return (
        <AlarmRow
          key={a.id}
          skin={skin}
          alarm={a}
          status={status}
          statusText={deliveryText(status, { name: personName, alarm: a, pendingSince: list.updatedAt, now })}
          onEdit={() => openEdit(a)}
          onToggle={() => handleToggle(a)}
        />
      );
    };
    const myMeds = medicationAlarms(list.alarms);
    const myChecks = checkinAlarms(list.alarms);
    body = (
      <>
        <Card skin={skin}>
          <View style={styles.statusRow}>
            <MaterialIcons name={summaryIcon} size={skin.icon} color={summaryTone} />
            <Text style={{ flex: 1, color: c.foreground, fontSize: skin.sz.body, fontFamily: BrandFonts.body }}>{summary.text}</Text>
          </View>
        </Card>
        <ActionButton skin={skin} variant="primary" label="Novo remédio" icon="add" onPress={() => openNew('medication')} />
        <ActionButton skin={skin} variant="outline" label="Novo check-in" icon="add" onPress={() => openNew('checkin')} />
        <Section skin={skin} title="Remédios">
          {myMeds.length === 0 ? <Muted skin={skin} text="Nenhum remédio na lista." /> : myMeds.map(rowFor)}
        </Section>
        <Section skin={skin} title="Check-ins">
          {myChecks.length === 0 ? <Muted skin={skin} text="Nenhum check-in na lista." /> : myChecks.map(rowFor)}
        </Section>
        <ActionButton skin={skin} variant="danger" label="Parar de cuidar dos alarmes" icon="block" onPress={askStop} />
      </>
    );
  } else {
    // Acordo ativo meu, mas a lista não veio: relê em vez de mostrar uma tela vazia.
    body = (
      <Card skin={skin}>
        <Muted skin={skin} text="A lista de alarmes ainda não carregou." />
        <ActionButton skin={skin} variant="outline" label="Tentar de novo" icon="refresh" onPress={() => { managed.refetch(); }} />
      </Card>
    );
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right']} containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: skin.pad, gap: 12, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        refreshControl={<CaregiverRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <UpdatedAgoBar updatedAt={managed.dataUpdatedAt} refreshing={refreshing} onRefresh={onRefresh} />
        <View style={styles.headerRow}>
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            style={{ minWidth: skin.touch, minHeight: skin.touch, alignItems: 'center', justifyContent: 'center' }}
          >
            <MaterialIcons name="arrow-back" size={skin.icon + 2} color={c.foreground} />
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{ flex: 1, color: c.foreground, fontSize: skin.sz.title, fontWeight: '800', fontFamily: BrandFonts.body }}
          >
            Alarmes de {personName}
          </Text>
        </View>
        {body}
      </ScrollView>
      <AlarmFormModal
        visible={formVisible}
        editingAlarm={editing}
        newKind={newKind}
        onCancel={() => setFormVisible(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
  );
}

// --- Pedaços da tela ---------------------------------------------------------

function Card({ skin, children }: { skin: Skin; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: skin.c.surface, borderColor: skin.c.border, borderWidth: skin.bw, borderRadius: skin.radius, padding: skin.pad },
      ]}
    >
      {children}
    </View>
  );
}

function Heading({ skin, text }: { skin: Skin; text: string }) {
  return <Text style={{ color: skin.c.foreground, fontSize: skin.sz.heading, fontWeight: '700', fontFamily: BrandFonts.body }}>{text}</Text>;
}

function Muted({ skin, text }: { skin: Skin; text: string }) {
  return <Text style={{ color: skin.c.muted, fontSize: skin.sz.body, lineHeight: Math.round(skin.sz.body * 1.35), fontFamily: BrandFonts.body }}>{text}</Text>;
}

function Section({ skin, title, children }: { skin: Skin; title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: skin.c.foreground, fontSize: skin.sz.heading, fontWeight: '700', fontFamily: BrandFonts.body }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ActionButton({
  skin, label, icon, variant, onPress,
}: { skin: Skin; label: string; icon: IconName; variant: 'primary' | 'outline' | 'danger'; onPress: () => void }) {
  const { c } = skin;
  const color = variant === 'primary' ? c.onPrimary : variant === 'danger' ? c.error : c.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: skin.touch,
          borderRadius: skin.radius,
          borderWidth: variant === 'primary' ? 0 : skin.bw,
          borderColor: variant === 'danger' ? c.error : c.primary,
          backgroundColor: variant === 'primary' ? c.primary : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <MaterialIcons name={icon} size={skin.icon} color={color} />
      <Text style={{ color, fontSize: skin.sz.button, fontWeight: '700', fontFamily: BrandFonts.body }}>{label}</Text>
    </Pressable>
  );
}

function alarmName(a: ManagedAlarm): string {
  return (a.description ?? '').trim() || (a.kind === 'checkin' ? 'Check-in' : 'Remédio');
}

function alarmSubtitle(a: ManagedAlarm): string {
  const parts = [alarmRepeatLabel(a)];
  if (a.kind === 'checkin' && a.escalateAfterMinutes) parts.push(`avisa após ${a.escalateAfterMinutes} min`);
  if (!a.enabled) parts.push('Desligado');
  return parts.join(' · ');
}

function ReadOnlyRow({ skin, alarm }: { skin: Skin; alarm: ManagedAlarm }) {
  const { c, sz } = skin;
  return (
    <Card skin={skin}>
      <View style={styles.rowMain}>
        <Text style={{ color: c.foreground, fontSize: sz.time, fontWeight: '800', fontFamily: BrandFonts.body }}>{alarm.time}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: sz.body, fontWeight: '600', fontFamily: BrandFonts.body }}>{alarmName(alarm)}</Text>
          <Text style={{ color: c.muted, fontSize: sz.body, fontFamily: BrandFonts.body }}>{alarmSubtitle(alarm)}</Text>
        </View>
      </View>
    </Card>
  );
}

function AlarmRow({
  skin, alarm, status, statusText, onEdit, onToggle,
}: { skin: Skin; alarm: ManagedAlarm; status: DeliveryStatus; statusText: string; onEdit: () => void; onToggle: () => void }) {
  const { c, sz } = skin;
  const tone = status === 'confirmed' ? c.success : status === 'pending' ? c.warning : c.error;
  const statusIcon: IconName = status === 'confirmed' ? 'check-circle' : status === 'pending' ? 'schedule' : 'error';
  return (
    <Card skin={skin}>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Editar ${alarmName(alarm)} das ${alarm.time}`}
        style={({ pressed }) => [styles.rowMain, { minHeight: skin.touch, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={{ color: c.foreground, fontSize: sz.time, fontWeight: '800', fontFamily: BrandFonts.body }}>{alarm.time}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: sz.body, fontWeight: '600', fontFamily: BrandFonts.body }}>{alarmName(alarm)}</Text>
          <Text style={{ color: c.muted, fontSize: sz.body, fontFamily: BrandFonts.body }}>{alarmSubtitle(alarm)}</Text>
        </View>
        <MaterialIcons name="edit" size={skin.icon} color={c.muted} />
      </Pressable>
      <View style={styles.statusRow}>
        <MaterialIcons name={statusIcon} size={skin.icon} color={tone} />
        <Text style={{ flex: 1, color: c.foreground, fontSize: sz.body, fontFamily: BrandFonts.body }}>{statusText}</Text>
      </View>
      <ActionButton
        skin={skin}
        variant="outline"
        label={alarm.enabled ? 'Desligar' : 'Ligar'}
        icon={alarm.enabled ? 'notifications-off' : 'notifications-active'}
        onPress={onToggle}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { gap: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
