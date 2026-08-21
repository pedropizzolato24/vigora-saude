import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { SOSCountdownDialog } from '@/components/sos-countdown-dialog';
import { SOSActiveScreen } from '@/components/sos-active-screen';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';
import { useAccessibility } from '@/lib/accessibility-context';
import { getNextAlarm, useAppContext } from '@/lib/app-context';
import { useNotifications } from '@/lib/notifications-context';
import { PulseView } from '@/components/animated-components';
import { MonitoringStatusBadge } from '@/components/monitoring-status-badge';
import { usePurchases } from '@/hooks/use-purchases';
import { SosStrip } from '@/components/sos-strip';
import { BigTile } from '@/components/big-tile';
import { escalateSOSToContacts } from '@/lib/alarm-escalation';
import { trpc } from '@/lib/trpc';

export default function DashboardScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, dispatch } = useAppContext();
  const { sendNotification } = useNotifications();
  const [sosPressing, setSosPressing] = useState(false);
  const { isAccessibilityMode, a11yFontSize, a11yColors, a11ySpacing } = useAccessibility();
  const { isPro } = usePurchases();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const [sosCountdownVisible, setSosCountdownVisible] = React.useState(false);
  const [sosActiveVisible, setSosActiveVisible] = React.useState(false);
  const [sosActivatedAt, setSosActivatedAt] = React.useState<number | null>(null);
  const nextAlarm = getNextAlarm(state.alarms);

  const caregiversQuery = trpc.link.getMyCaregivers.useQuery();
  const caregivers = caregiversQuery.data ?? [];
  const sosAlertCaregivers = trpc.monitoring.sosAlertCaregivers.useMutation();

  const activateSOS = React.useCallback(async () => {
    dispatch({ type: 'TRIGGER_SOS' });
    setSosActivatedAt(Date.now());
    setSosActiveVisible(true);

    // Push aos cuidadores vinculados — SEMPRE, independente de haver contatos
    // de emergência (canal próprio, não passa pelo WhatsApp). Cobre o caso de
    // quem tem cuidador mas nenhum contato cadastrado.
    sosAlertCaregivers
      .mutateAsync({ userName: state.profile.name || undefined })
      .catch((err) => console.error('[SOS] Caregiver push failed:', err));

    if (state.emergencyContacts.length === 0) {
      await sendNotification(
        'SOS ativado',
        'Nenhum contato de emergência cadastrado. Adicione contatos para que eles sejam avisados.',
        { type: 'sos' }
      );
      return;
    }

    // Avisa os CONTATOS (WhatsApp via servidor, com fallback de deep link) de
    // que o USUÁRIO precisa de ajuda. A notificação local é só a confirmação
    // para o próprio usuário — nunca o alerta em si.
    escalateSOSToContacts(state.emergencyContacts, state.profile.name).catch((err) =>
      console.error('[SOS] Escalation failed:', err)
    );
    await sendNotification(
      'SOS ativado',
      'Seus contatos de emergência estão sendo avisados de que você precisa de ajuda.',
      { type: 'sos' }
    );
  }, [state.emergencyContacts, state.profile.name, dispatch, sendNotification, sosAlertCaregivers]);

  const handleSOS = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    setSosCountdownVisible(true);
  };

  const navigate = (route: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(route as any);
  };

  // Card do próximo remédio: abre o alarme que ele está mostrando. Sem nenhum
  // alarme cadastrado, leva à lista para o usuário criar o primeiro.
  const openNextAlarm = () => {
    navigate(nextAlarm ? `/(tabs)/alarms?alarmId=${nextAlarm.id}` : '/(tabs)/alarms');
  };

  // --- MODO ACESSÍVEL --------------------------------------------------------
  if (isAccessibilityMode) {
    const ac = a11yColors;
    const af = a11yFontSize;
    const as_ = a11ySpacing;

    return (
      <ScreenContainer edges={['left', 'right']} containerStyle={{ backgroundColor: a11yColors.background }}>
        {/* Header fixo — não rola com o conteúdo (não fica atrás da status bar) */}
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.bar, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>
              Vigora
            </Text>
            {state.profile.name ? (
              <Text style={{ fontSize: af.md, color: ac.muted, marginTop: 4 }}>
                Olá, {state.profile.name}
              </Text>
            ) : null}
          </View>
          <MonitoringStatusBadge accessible={true} />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: ac.background }}
        >

          {/* SOS — modo acessível: botão grande */}
          <PulseView active={!sosPressing} minScale={0.98} maxScale={1.02} duration={1500}>
            <Pressable
              onPress={handleSOS}
              onPressIn={() => setSosPressing(true)}
              onPressOut={() => setSosPressing(false)}
              style={({ pressed }) => [{
                backgroundColor: colors.emergency,
                borderRadius: 24,
                paddingVertical: 36,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}
              accessibilityLabel="Botão SOS de emergência"
              accessibilityRole="button"
            >
              <MaterialIcons name="warning" size={64} color={colors.onEmergency} />
              <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.title, fontWeight: '900', color: colors.onEmergency, letterSpacing: 6 }}>
                SOS
              </Text>
              <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.md, color: colors.onEmergency, fontWeight: '600' }}>
                Toque para pedir socorro
              </Text>
            </Pressable>
          </PulseView>

          <Pressable
            onPress={() => navigate('/(tabs)/ambulance')}
            style={({ pressed }) => [{
              backgroundColor: colors.primary,
              borderRadius: 20,
              paddingVertical: as_.buttonPadding,
              paddingHorizontal: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            }]}
            accessibilityLabel="Chamar ambulância"
            accessibilityRole="button"
          >
            <MaterialIcons name="local-hospital" size={36} color={colors.onPrimary} />
            <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.xl, fontWeight: '800', color: colors.onPrimary }}>
              Chamar Ambulância
            </Text>
          </Pressable>

          {/* Próximo alarme */}
          <Pressable
            onPress={openNextAlarm}
            style={({ pressed }) => [{
              backgroundColor: colors.surface,
              borderRadius: as_.cardRadius,
              padding: 20,
              borderWidth: 1,
              borderColor: colors.border,
              gap: 6,
              opacity: pressed ? 0.85 : 1,
            }]}
            accessibilityRole="button"
            accessibilityLabel={
              nextAlarm
                ? `Próximo alarme às ${nextAlarm.time}, ${nextAlarm.description}. Toque para ver o alarme.`
                : 'Nenhum alarme configurado. Toque para criar um.'
            }
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialIcons name="alarm" size={32} color={colors.primary} />
              <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.lg, fontWeight: '800', color: colors.foreground }}>
                Próximo Alarme
              </Text>
            </View>
            <Text style={{ fontFamily: 'SpaceMono-Regular', fontSize: af['3xl'], fontWeight: '900', color: colors.primary }}>
              {nextAlarm ? nextAlarm.time : '--:--'}
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.md, color: colors.muted }}>
              {nextAlarm ? nextAlarm.description : 'Nenhum alarme configurado'}
            </Text>
          </Pressable>

          <View style={{ gap: 14 }}>
            <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.lg, fontWeight: '800', color: colors.foreground }}>
              Ações Rápidas
            </Text>
            <Pressable
              onPress={() => navigate('/(tabs)/alarms')}
              style={({ pressed }) => [{
                backgroundColor: colors.primary,
                borderRadius: 20,
                paddingVertical: as_.buttonPadding,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <MaterialIcons name="alarm" size={36} color={colors.onPrimary} />
              <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.xl, fontWeight: '800', color: colors.onPrimary }}>
                Meus Alarmes
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigate('/(tabs)/health')}
              style={({ pressed }) => [{
                backgroundColor: colors.success,
                borderRadius: 20,
                paddingVertical: as_.buttonPadding,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <MaterialIcons name="favorite" size={36} color={colors.onSuccess} />
              <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.xl, fontWeight: '800', color: colors.onSuccess }}>
                Registrar Saúde
              </Text>
            </Pressable>
          </View>

          {/* Rede de apoio */}
          {caregivers.length > 0 ? (
            <Pressable
              onPress={() => navigate('/(tabs)/invite-caregiver')}
              style={({ pressed }) => [{
                backgroundColor: colors.surface,
                borderRadius: as_.cardRadius,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                minHeight: 64,
                opacity: pressed ? 0.85 : 1,
              }]}
              accessibilityRole="button"
              accessibilityLabel={`${caregivers.length} ${caregivers.length === 1 ? 'pessoa te acompanhando' : 'pessoas te acompanhando'}. Toque para ver.`}
            >
              <View style={{ flexDirection: 'row' }}>
                {caregivers.slice(0, 3).map((c, i) => (
                  <View
                    key={c.caregiverOpenId}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.primaryLight,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginLeft: i === 0 ? 0 : -10,
                      borderWidth: 2,
                      borderColor: colors.surface,
                    }}
                  >
                    <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.md, fontWeight: '800', color: colors.primary }}>
                      {c.caregiverName ? c.caregiverName.charAt(0).toUpperCase() : '?'}
                    </Text>
                  </View>
                ))}
                {caregivers.length > 3 && (
                  <View style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.primaryLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginLeft: -10,
                    borderWidth: 2,
                    borderColor: colors.surface,
                  }}>
                    <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.sm, fontWeight: '800', color: colors.primary }}>
                      +{caregivers.length - 3}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ flex: 1, fontFamily: 'PlusJakartaSans', fontSize: af.lg, fontWeight: '700', color: colors.foreground }}>
                {caregivers.length === 1 ? '1 pessoa te acompanhando' : `${caregivers.length} pessoas te acompanhando`}
              </Text>
              <MaterialIcons name="chevron-right" size={28} color={colors.muted} />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => navigate('/(tabs)/invite-caregiver')}
              style={({ pressed }) => [{
                backgroundColor: colors.surface,
                borderRadius: as_.cardRadius,
                padding: 20,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                minHeight: 64,
                opacity: pressed ? 0.85 : 1,
              }]}
              accessibilityRole="button"
              accessibilityLabel="Convide um familiar para te acompanhar. Toque para convidar."
            >
              <View style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.primaryLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <MaterialIcons name="person-add" size={26} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.lg, fontWeight: '700', color: colors.foreground }}>
                  Convide um familiar
                </Text>
                <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.md, color: colors.muted }}>
                  para te acompanhar
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={28} color={colors.muted} />
            </Pressable>
          )}

          {/* Aviso legal */}
          <View style={{
            backgroundColor: colors.warningLight,
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: colors.warning + '40',
            flexDirection: 'row',
            gap: 12,
            alignItems: 'flex-start',
          }}>
            <MaterialIcons name="info" size={24} color={colors.warningDark} />
            <Text style={{ flex: 1, fontFamily: 'PlusJakartaSans', fontSize: af.sm, color: colors.warningDark, fontWeight: '600', lineHeight: af.sm * 1.5 }}>
              Para emergências graves, ligue para o SAMU (192) ou Bombeiros (193).
            </Text>
          </View>
        </ScrollView>
        <AppDialog {...dialogProps} />
        <AppToast {...toastProps} />
        <SOSCountdownDialog
          visible={sosCountdownVisible}
          onConfirm={() => { setSosCountdownVisible(false); activateSOS(); }}
          onCancel={() => setSosCountdownVisible(false)}
        />
        <SOSActiveScreen
          visible={sosActiveVisible}
          contacts={state.emergencyContacts}
          activatedAt={sosActivatedAt}
          onDeactivate={() => setSosActiveVisible(false)}
        />
      </ScreenContainer>
    );
  }

  // --- MODO NORMAL -----------------------------------------------------------

  return (
    <ScreenContainer edges={['left', 'right']}>
      {/* Header fixo — não rola com o conteúdo (não fica atrás da status bar) */}
      <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.bar, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          {state.profile.name ? (
            <Text style={[styles.greeting, { color: colors.muted, fontFamily: 'PlusJakartaSans', fontSize: fs.sm }]}>
              Bom dia,
            </Text>
          ) : (
            <Text style={[styles.greeting, { color: colors.muted, fontFamily: 'PlusJakartaSans', fontSize: fs.sm }]}>
              Bem-vindo ao
            </Text>
          )}
          <Text style={[styles.appName, { color: colors.primary, fontFamily: 'Fraunces-Italic', fontStyle: 'italic', fontSize: fs.scaled(28), lineHeight: fs.scaled(34) }]}>
            {state.profile.name || 'Vigora'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isPro && (
            <View style={[styles.proBadge, { backgroundColor: colors.successLight }]}>
              <MaterialIcons name="verified" size={13} color={colors.success} />
              <Text style={{ fontFamily: 'PlusJakartaSans', color: colors.success, fontSize: fs.xs, fontWeight: '700' }}>PRO</Text>
            </View>
          )}
          <MonitoringStatusBadge accessible={false} />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SOS Strip */}
        <SosStrip onPress={handleSOS} />

        {/* 2x2 BigTile grid */}
        <View style={styles.tilesGrid}>
          <View style={styles.tileWrapper}>
            <BigTile
              icon="medication"
              iconColor={colors.warning}
              iconBg={colors.warningLight}
              title="Meus remédios"
              subtitle="Seus lembretes"
              onPress={() => navigate('/(tabs)/alarms')}
            />
          </View>
          <View style={styles.tileWrapper}>
            <BigTile
              icon="favorite"
              iconColor={colors.success}
              iconBg={colors.successLight}
              title="Anotar saúde"
              subtitle="Registrar agora"
              onPress={() => navigate('/(tabs)/health')}
            />
          </View>
          <View style={styles.tileWrapper}>
            <BigTile
              icon="local-hospital"
              iconColor={colors.primary}
              iconBg={colors.primaryLight}
              title="Chamar ambulância"
              subtitle="Emergência médica"
              onPress={() => navigate('/(tabs)/ambulance')}
            />
          </View>
          <View style={styles.tileWrapper}>
            <BigTile
              icon="people"
              iconColor={colors.emergency}
              iconBg={colors.emergencyLight}
              title="Avisar família"
              subtitle="Contatos de emergência"
              onPress={() => navigate('/(tabs)/contacts')}
            />
          </View>
        </View>

        {/* Próximo remédio card */}
        <Pressable
          onPress={openNextAlarm}
          style={({ pressed }) => [styles.nextAlarmCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.warning, opacity: pressed ? 0.85 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={
            nextAlarm
              ? `Próximo remédio às ${nextAlarm.time}, ${nextAlarm.description}. Toque para ver o alarme.`
              : 'Nenhum lembrete configurado. Toque para criar um.'
          }
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[styles.nextAlarmLabel, { color: colors.muted, fontFamily: 'PlusJakartaSans', fontSize: fs.sm }]}>
              PRÓXIMO REMÉDIO
            </Text>
            <Text style={{ fontFamily: 'SpaceMono-Regular', fontSize: fs.scaled(22), color: colors.foreground }}>
              {nextAlarm ? nextAlarm.time : '--:--'}
            </Text>
            <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: fs.base, color: colors.muted }}>
              {nextAlarm ? nextAlarm.description : 'Nenhum lembrete configurado'}
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
        </Pressable>

        {/* Rede de apoio */}
        {caregivers.length > 0 ? (
          <Pressable
            onPress={() => navigate('/(tabs)/invite-caregiver')}
            style={({ pressed }) => [styles.supportNetworkCard, { backgroundColor: colors.surface, borderColor: colors.border, minHeight: fs.touch(48), opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`${caregivers.length} ${caregivers.length === 1 ? 'pessoa te acompanhando' : 'pessoas te acompanhando'}. Toque para ver.`}
          >
            <View style={styles.avatarRow}>
              {caregivers.slice(0, 3).map((c, i) => (
                <View
                  key={c.caregiverOpenId}
                  style={[styles.avatarCircle, { backgroundColor: colors.primaryLight, borderColor: colors.surface, marginLeft: i === 0 ? 0 : -10 }]}
                >
                  <Text style={[styles.avatarInitial, { color: colors.primary, fontSize: fs.md }]}>
                    {c.caregiverName ? c.caregiverName.charAt(0).toUpperCase() : '?'}
                  </Text>
                </View>
              ))}
              {caregivers.length > 3 && (
                <View style={[styles.avatarCircle, { backgroundColor: colors.primaryLight, borderColor: colors.surface, marginLeft: -10 }]}>
                  <Text style={[styles.avatarInitial, { color: colors.primary, fontSize: fs.sm }]}>
                    +{caregivers.length - 3}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.supportNetworkLabel, { color: colors.foreground, fontFamily: 'PlusJakartaSans', fontSize: fs.base }]}>
              {caregivers.length === 1 ? '1 pessoa te acompanhando' : `${caregivers.length} pessoas te acompanhando`}
            </Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => navigate('/(tabs)/invite-caregiver')}
            style={({ pressed }) => [styles.supportNetworkCard, { backgroundColor: colors.surface, borderColor: colors.border, minHeight: fs.touch(48), opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Convide um familiar para te acompanhar. Toque para convidar."
          >
            <View style={[styles.emptyAvatarCircle, { backgroundColor: colors.primaryLight }]}>
              <MaterialIcons name="person-add" size={22} color={colors.primary} />
            </View>
            <Text style={[styles.supportNetworkLabel, { color: colors.foreground, fontFamily: 'PlusJakartaSans', fontSize: fs.base }]}>
              Convide um familiar para te acompanhar
            </Text>
            <MaterialIcons name="chevron-right" size={22} color={colors.muted} />
          </Pressable>
        )}

        {/* Aviso legal */}
        <View style={[styles.warningBanner, { backgroundColor: colors.warningLight, borderColor: colors.warning + '40' }]}>
          <MaterialIcons name="info" size={18} color={colors.warningDark} />
          <Text style={[styles.warningText, { color: colors.warningDark, fontFamily: 'PlusJakartaSans', fontSize: fs.xs, lineHeight: fs.scaled(18) }]}>
            <Text style={{ fontWeight: '700' }}>Emergências graves: </Text>
            ligue para o SAMU (192) ou Bombeiros (193). Este app é um suporte, não substitui serviços de emergência.
          </Text>
        </View>
      </ScrollView>

      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
      <SOSCountdownDialog
        visible={sosCountdownVisible}
        onConfirm={() => { setSosCountdownVisible(false); activateSOS(); }}
        onCancel={() => setSosCountdownVisible(false)}
      />
      <SOSActiveScreen
        visible={sosActiveVisible}
        contacts={state.emergencyContacts}
        activatedAt={sosActivatedAt}
        onDeactivate={() => setSosActiveVisible(false)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
    gap: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  greeting: {
    fontSize: 16,
    fontWeight: '500',
  },
  appName: {
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  tileWrapper: {
    width: '48%',
  },
  nextAlarmCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderLeftWidth: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nextAlarmLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
  },
  supportNetworkCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarRow: {
    flexDirection: 'row',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  avatarInitial: {
    fontFamily: 'PlusJakartaSans',
    fontWeight: '800',
  },
  emptyAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supportNetworkLabel: {
    flex: 1,
    fontWeight: '600',
  },
});
