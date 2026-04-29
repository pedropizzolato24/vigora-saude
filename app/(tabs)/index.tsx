import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import {
  Dimensions,
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
import { AdBanner } from '@/components/ad-banner';
import { FadeInView, ScaleInView, PulseView, StaggeredItem } from '@/components/animated-components';
import { MonitoringStatusBadge } from '@/components/monitoring-status-badge';
import { usePurchases } from '@/hooks/use-purchases';
import { TrialBanner, ExpiredBanner } from '@/components/trial-banner';

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
    const now = Date.now();
    setSosActivatedAt(now);
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

  // ─── ACCESSIBILITY MODE ────────────────────────────────────────────────────
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
          {/* Header */}
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

          {/* Trial / Expired Banners */}
          <TrialBanner />
          <ExpiredBanner />

          {/* SOS Button — very large */}
          <PulseView active={!sosPressing} minScale={0.98} maxScale={1.02} duration={1500}>
            <Pressable
              onPress={handleSOS}
              onPressIn={() => setSosPressing(true)}
              onPressOut={() => setSosPressing(false)}
              style={({ pressed }) => [{
                backgroundColor: ac.emergency,
                borderRadius: 24,
                paddingVertical: 36,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                borderWidth: 4,
                borderColor: '#880000',
                transform: [{ scale: pressed ? 0.97 : 1 }],
              }]}
              accessibilityLabel="Botão SOS de emergência"
              accessibilityRole="button"
            >
              <MaterialIcons name="warning" size={64} color={ac.onEmergency} />
              <Text style={{ fontSize: af.title, fontWeight: '900', color: ac.onEmergency, letterSpacing: 6 }}>
                SOS
              </Text>
              <Text style={{ fontSize: af.md, color: ac.onEmergency, fontWeight: '600' }}>
                Toque para pedir socorro
              </Text>
            </Pressable>
          </PulseView>

          {/* Ambulance Button */}
          <Pressable
            onPress={() => navigate('/(tabs)/ambulance')}
            style={({ pressed }) => [{
              backgroundColor: ac.primary,
              borderRadius: 20,
              paddingVertical: as_.buttonPadding,
              paddingHorizontal: 24,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
              borderWidth: 3,
              borderColor: '#003388',
              transform: [{ scale: pressed ? 0.97 : 1 }],
            }]}
            accessibilityLabel="Chamar ambulância"
            accessibilityRole="button"
          >
            <MaterialIcons name="local-hospital" size={36} color={ac.onPrimary} />
            <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.onPrimary }}>
              Chamar Ambulância
            </Text>
          </Pressable>

          {/* Next Alarm Card */}
          <View style={{
            backgroundColor: ac.surface,
            borderRadius: as_.cardRadius,
            padding: 20,
            borderWidth: 2,
            borderColor: ac.border,
            gap: 6,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <MaterialIcons name="alarm" size={32} color={ac.primary} />
              <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>
                Próximo Alarme
              </Text>
            </View>
            <Text style={{ fontSize: af['3xl'], fontWeight: '900', color: ac.primary }}>
              {nextAlarm ? nextAlarm.time : '--:--'}
            </Text>
            <Text style={{ fontSize: af.md, color: ac.muted }}>
              {nextAlarm ? nextAlarm.description : 'Nenhum alarme configurado'}
            </Text>
          </View>

          {/* Quick Actions: 2 large buttons */}
          <View style={{ gap: 14 }}>
            <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>
              Ações Rápidas
            </Text>
            <Pressable
              onPress={() => navigate('/(tabs)/alarms')}
              style={({ pressed }) => [{
                backgroundColor: ac.primary,
                borderRadius: 20,
                paddingVertical: as_.buttonPadding,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                borderWidth: 3,
                borderColor: '#003388',
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <MaterialIcons name="alarm" size={36} color={ac.onPrimary} />
              <Text style={{ fontSize: af.xl, fontWeight: '800', color: ac.onPrimary }}>
                Meus Alarmes
              </Text>
            </Pressable>
            <Pressable
              onPress={() => navigate('/(tabs)/health')}
              style={({ pressed }) => [{
                backgroundColor: ac.success,
                borderRadius: 20,
                paddingVertical: as_.buttonPadding,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                borderWidth: 3,
                borderColor: '#004400',
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <MaterialIcons name="favorite" size={36} color="#FFFFFF" />
              <Text style={{ fontSize: af.xl, fontWeight: '800', color: '#FFFFFF' }}>
                Registrar Saúde
              </Text>
            </Pressable>
          </View>

          {/* Emergency warning */}
          <View style={{
            backgroundColor: '#FFF3CD',
            borderRadius: 16,
            padding: 16,
            borderWidth: 2,
            borderColor: '#885500',
            flexDirection: 'row',
            gap: 12,
            alignItems: 'flex-start',
          }}>
            <MaterialIcons name="info" size={28} color="#885500" />
            <Text style={{ flex: 1, fontSize: af.sm, color: '#553300', fontWeight: '600', lineHeight: af.sm * 1.5 }}>
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
  // ─── NORMAL MODEE ───────────────────────────────────────────────────────────

  const statusCards = [
    {
      label: 'Próximo Alarme',
      value: nextAlarm ? nextAlarm.time : '--:--',
      subtext: nextAlarm ? nextAlarm.description : 'Nenhum alarme',
      icon: 'alarm' as const,
      color: '#0066CC',
      route: '/(tabs)/alarms',
    },
    {
      label: 'Alarmes Config.',
      value: String(state.alarms.length),
      subtext: state.alarms.length === 1 ? 'alarme' : 'alarmes',
      icon: 'notifications' as const,
      color: '#0066CC',
      route: '/(tabs)/alarms',
    },
    {
      label: 'Contatos SOS',
      value: String(state.emergencyContacts.length),
      subtext: state.emergencyContacts.length === 1 ? 'contato' : 'contatos',
      icon: 'people' as const,
      color: '#FF0000',
      route: '/(tabs)/contacts',
    },
    {
      label: 'Registros Saúde',
      value: String(state.healthMetrics.length),
      subtext: state.healthMetrics.length === 1 ? 'registro' : 'registros',
      icon: 'monitor-heart' as const,
      color: '#22C55E',
      route: '/(tabs)/health',
    },
  ];

  return (
    <ScreenContainer edges={["left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <FadeInView delay={0}>
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View>
            <Text style={[styles.greeting, { color: colors.muted, fontSize: fs.sm }]}>Bem-vindo ao</Text>
            <Text style={[styles.appName, { color: colors.foreground, fontSize: fs.scaled(26) }]}>Vigora Saúde</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isPro && (
              <Pressable
                onPress={() => router.push('/(modal)/paywall')}
                style={({ pressed }) => [{
                  backgroundColor: colors.success + '20',
                  borderRadius: 10,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 3,
                  opacity: pressed ? 0.7 : 1,
                }]}
              >
                <MaterialIcons name="verified" size={14} color={colors.success} />
                <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>PRO</Text>
              </Pressable>
            )}
            <MonitoringStatusBadge accessible={false} />
            <View style={[styles.heartBadge, { backgroundColor: '#FF000015' }]}>
              <MaterialIcons name="favorite" size={28} color="#FF0000" />
            </View>
          </View>
        </View>
        </FadeInView>

        {/* Trial / Expired Banners */}
        <TrialBanner />
        <ExpiredBanner />

        {/* SOS Button */}
        <ScaleInView delay={100}>
        <View style={styles.sosSection}>
          <PulseView active={!sosPressing} minScale={0.98} maxScale={1.02} duration={1500}>
          <Pressable
            onPress={handleSOS}
            onPressIn={() => setSosPressing(true)}
            onPressOut={() => setSosPressing(false)}
            style={({ pressed }) => [
              styles.sosButton,
              { transform: [{ scale: pressed ? 0.96 : 1 }] },
            ]}
            accessibilityLabel="Botão SOS de emergência"
            accessibilityRole="button"
          >
            <View
              style={[
                styles.sosInner,
                { opacity: sosPressing ? 0.9 : 1 },
              ]}
            >
              <MaterialIcons name="warning" size={52} color={colors.onEmergency} />
              <Text style={[styles.sosText, { fontSize: fs.scaled(40) }]}>SOS</Text>
              <Text style={[styles.sosSubtext, { fontSize: fs.scaled(12) }]}>Toque para emergência</Text>
            </View>
          </Pressable>
          </PulseView>
          <Text style={[styles.sosHint, { color: colors.muted }]}>
            Pressione para acionar emergência
          </Text>
        </View>
        </ScaleInView>

        {/* Ambulance Button */}
        <FadeInView delay={200}>
        <Pressable
          onPress={() => navigate('/(tabs)/ambulance')}
          style={({ pressed }) => [{
            backgroundColor: colors.primary,
            opacity: pressed ? 0.85 : 1,
            paddingVertical: 16,
            paddingHorizontal: 24,
            borderRadius: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginHorizontal: 20,
            transform: [{ scale: pressed ? 0.97 : 1 }],
          }]}
          accessibilityLabel="Chamar ambulância"
          accessibilityRole="button"
        >
          <MaterialIcons name="local-hospital" size={24} color={colors.onPrimary} />
          <Text style={{
            color: colors.onPrimary,
            fontSize: fs.md,
            fontWeight: '600',
          }}>
            Chamar Ambulância
          </Text>
        </Pressable>
        </FadeInView>

        {/* Status Cards */}
        <View style={styles.cardsGrid}>
          {statusCards.map((card, idx) => (
            <StaggeredItem key={card.label} index={idx} staggerDelay={80}>
            <Pressable
              onPress={() => navigate(card.route)}
              style={({ pressed }) => [
                styles.statusCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: card.color + '40',
                  shadowColor: card.color,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.08,
                  shadowRadius: 4,
                  elevation: 2,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <View style={[styles.cardIconBadge, { backgroundColor: card.color + '15' }]}>
                  <MaterialIcons name={card.icon} size={22} color={card.color} />
                </View>
                <MaterialIcons name="chevron-right" size={18} color={colors.muted} />
              </View>
              <Text style={[styles.cardValue, { color: card.color, fontSize: fs.scaled(28) }]}>{card.value}</Text>
              <Text style={[styles.cardLabel, { color: colors.foreground, fontSize: fs.sm }]} numberOfLines={2}>
                {card.label}
              </Text>
              <Text style={[styles.cardSubtext, { color: colors.muted, fontSize: fs.xs }]} numberOfLines={1}>
                {card.subtext}
              </Text>
              <View style={[styles.cardTapHint, { backgroundColor: card.color + '10' }]}>
                <Text style={[styles.cardTapHintText, { color: card.color }]}>Toque para ver</Text>
              </View>
            </Pressable>
            </StaggeredItem>
          ))}
        </View>

        {/* Quick Actions */}
        <FadeInView delay={400}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground, fontSize: fs.lg }]}>
            Ações Rápidas
          </Text>
          <View style={styles.quickActions}>
            <Pressable
              onPress={() => navigate('/(tabs)/alarms')}
              style={({ pressed }) => [
                styles.quickActionBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <MaterialIcons name="alarm" size={22} color={colors.onPrimary} />
              <Text style={[styles.quickActionText, { fontSize: fs.sm }]}>Gerenciar Alarmes</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate('/(tabs)/health')}
              style={({ pressed }) => [
                styles.quickActionBtn,
                { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <MaterialIcons name="favorite" size={22} color={colors.onSuccess} />
              <Text style={[styles.quickActionText, { fontSize: fs.sm }]}>Registrar Saúde</Text>
            </Pressable>
          </View>
        </View>
        </FadeInView>

        {/* Promotional Ads */}
        {state.ads.filter(ad => ad.active).slice(0, 2).map(ad => (
          <AdBanner
            key={ad.id}
            title={ad.title}
            description={ad.description}
            imageUrl={ad.imageUrl}
            icon={ad.icon as any}
            onPress={() => {
              if (ad.actionUrl) {
                Linking.openURL(ad.actionUrl).catch((err: any) => console.error('Error opening URL:', err));
              }
            }}
            onClose={() => {}}
          />
        ))}

        {/* Warning Banner */}
        <View style={[styles.warningBanner, { backgroundColor: colors.warningLight, borderColor: colors.warning + '40' }]}>
          <MaterialIcons name="info" size={20} color={colors.warning} />
          <Text style={[styles.warningText, { color: colors.warningDark }]}>
            <Text style={{ fontWeight: '700' }}>Emergências graves: </Text>
            Ligue imediatamente para o SAMU (192) ou Bombeiros (193). Este app é um suporte, não substitui serviços de emergência.
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
    gap: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '500',
  },
  appName: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heartBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosSection: {
    alignItems: 'center',
    gap: 12,
  },
  sosButton: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#FF0000',
    shadowColor: '#FF0000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  sosInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FF0000',
  },
  sosText: {
    fontSize: 40,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 4,
  },
  sosSubtext: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.85,
    fontWeight: '500',
  },
  sosHint: {
    fontSize: 13,
    textAlign: 'center',
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  statusCard: {
    width: (Dimensions.get('window').width - 52) / 2,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 34,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  cardSubtext: {
    fontSize: 11,
    lineHeight: 14,
  },
  cardTapHint: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  cardTapHintText: {
    fontSize: 10,
    fontWeight: '600',
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  warningBanner: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
});
