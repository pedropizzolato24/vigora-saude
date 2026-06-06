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

  const activateSOS = React.useCallback(async () => {
    dispatch({ type: 'TRIGGER_SOS' });
    for (const contact of state.emergencyContacts) {
      await sendNotification(
        'EMERGÊNCIA SOS',
        `${contact.name} precisa de ajuda urgente!`,
        { type: 'sos', contactId: contact.id }
      );
    }
    if (state.emergencyContacts.length === 0) {
      await sendNotification(
        'EMERGÊNCIA SOS ATIVADO',
        'SOS ativado. Cadastre contatos de emergência para notificá-los.',
        { type: 'sos' }
      );
    }
    setSosActivatedAt(Date.now());
    setSosActiveVisible(true);
  }, [state.emergencyContacts, dispatch, sendNotification]);

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

  // --- MODO ACESSÍVEL --------------------------------------------------------
  if (isAccessibilityMode) {
    const ac = a11yColors;
    const af = a11yFontSize;
    const as_ = a11ySpacing;

    return (
      <ScreenContainer edges={['left', 'right']} containerClassName="bg-white">
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
          showsVerticalScrollIndicator={false}
          style={{ backgroundColor: ac.background }}
        >
          <View style={{ paddingTop: insets.top + 12, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>
                Vigora Saúde
              </Text>
              {state.profile.name ? (
                <Text style={{ fontSize: af.md, color: ac.muted, marginTop: 4 }}>
                  Olá, {state.profile.name}
                </Text>
              ) : null}
            </View>
            <MonitoringStatusBadge accessible={true} />
          </View>

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
          <View style={{
            backgroundColor: colors.surface,
            borderRadius: as_.cardRadius,
            padding: 20,
            borderWidth: 1,
            borderColor: colors.border,
            gap: 6,
          }}>
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
          </View>

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
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
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
            <Text style={[styles.appName, { color: colors.primary, fontFamily: 'Fraunces-Italic', fontStyle: 'italic', fontSize: fs.scaled(28) }]}>
              {state.profile.name || 'Vigora Saúde'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isPro && (
              <View style={[styles.proBadge, { backgroundColor: colors.successLight }]}>
                <MaterialIcons name="verified" size={13} color={colors.success} />
                <Text style={{ fontFamily: 'PlusJakartaSans', color: colors.success, fontSize: 11, fontWeight: '700' }}>PRO</Text>
              </View>
            )}
            <MonitoringStatusBadge accessible={false} />
          </View>
        </View>

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
        <View style={[styles.nextAlarmCard, { backgroundColor: colors.surface, borderColor: colors.border, borderLeftColor: colors.warning }]}>
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

        {/* Aviso legal */}
        <View style={[styles.warningBanner, { backgroundColor: colors.warningLight, borderColor: colors.warning + '40' }]}>
          <MaterialIcons name="info" size={18} color={colors.warningDark} />
          <Text style={[styles.warningText, { color: colors.warningDark, fontFamily: 'PlusJakartaSans', fontSize: fs.xs }]}>
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
    paddingBottom: 12,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '500',
  },
  appName: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 34,
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
    gap: 4,
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
    fontSize: 12,
    lineHeight: 18,
  },
});
