import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { getNextAlarm, useAppContext } from '@/lib/app-context';
import { useNotifications } from '@/lib/notifications-context';
import { AdBanner } from '@/components/ad-banner';
import { FadeInView, ScaleInView, PulseView, StaggeredItem } from '@/components/animated-components';

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, dispatch } = useAppContext();
  const { sendNotification } = useNotifications();
  const [sosPressing, setSosPressing] = useState(false);

  const nextAlarm = getNextAlarm(state.alarms);

  const handleSOS = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    Alert.alert(
      '🚨 ATIVAR SOS?',
      'Isso enviará uma notificação de emergência para todos os seus contatos cadastrados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'CONFIRMAR SOS',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
            dispatch({ type: 'TRIGGER_SOS' });

            // Send notification for each contact
            for (const contact of state.emergencyContacts) {
              await sendNotification(
                '🚨 EMERGÊNCIA SOS',
                `${contact.name} precisa de ajuda urgente!`,
                { type: 'sos', contactId: contact.id }
              );
            }

            if (state.emergencyContacts.length === 0) {
              await sendNotification(
                '🚨 EMERGÊNCIA SOS ATIVADO',
                'SOS ativado. Cadastre contatos de emergência para notificá-los.',
                { type: 'sos' }
              );
            }

            Alert.alert(
              '✅ SOS Enviado',
              state.emergencyContacts.length > 0
                ? `Notificações enviadas para ${state.emergencyContacts.length} contato(s).`
                : 'SOS registrado. Adicione contatos de emergência para notificá-los.',
              [{ text: 'OK' }]
            );
          },
        },
      ]
    );
  };

  const navigate = (route: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(route as any);
  };

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
            <Text style={[styles.greeting, { color: colors.muted }]}>Bem-vindo ao</Text>
            <Text style={[styles.appName, { color: colors.foreground }]}>Vigora Saúde</Text>
          </View>
          <View style={[styles.heartBadge, { backgroundColor: '#FF000015' }]}>
            <MaterialIcons name="favorite" size={28} color="#FF0000" />
          </View>
        </View>
        </FadeInView>

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
              <Text style={styles.sosText}>SOS</Text>
              <Text style={styles.sosSubtext}>Toque para emergência</Text>
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
          }]}
          accessibilityLabel="Chamar ambulância"
          accessibilityRole="button"
        >
          <MaterialIcons name="local-hospital" size={24} color={colors.onPrimary} />
          <Text style={{
            color: colors.onPrimary,
            fontSize: 16,
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
                  borderColor: card.color + '60',
                  shadowColor: card.color,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 6,
                  elevation: 3,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
              ]}
            >
              <View style={styles.cardTopRow}>
                <View style={[styles.cardIconBadge, { backgroundColor: card.color + '15' }]}>
                  <MaterialIcons name={card.icon} size={22} color={card.color} />
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.muted} />
              </View>
              <Text style={[styles.cardValue, { color: card.color }]}>{card.value}</Text>
              <Text style={[styles.cardLabel, { color: colors.foreground }]} numberOfLines={1}>
                {card.label}
              </Text>
              <Text style={[styles.cardSubtext, { color: colors.muted }]} numberOfLines={1}>
                {card.subtext}
              </Text>
              <View style={[styles.cardTapHint, { backgroundColor: card.color + '12' }]}>
                <Text style={[styles.cardTapHintText, { color: card.color }]}>Toque para ver</Text>
              </View>
            </Pressable>
            </StaggeredItem>
          ))}
        </View>

        {/* Quick Actions */}
        <FadeInView delay={400}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
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
              <Text style={styles.quickActionText}>Gerenciar Alarmes</Text>
            </Pressable>
            <Pressable
              onPress={() => navigate('/(tabs)/health')}
              style={({ pressed }) => [
                styles.quickActionBtn,
                { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <MaterialIcons name="favorite" size={22} color={colors.onSuccess} />
              <Text style={styles.quickActionText}>Registrar Saúde</Text>
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
            onClose={() => {
              // Optionally hide this ad
            }}
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
    paddingVertical: 16,
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
    gap: 12,
  },
  statusCard: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    gap: 6,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardSubtext: {
    fontSize: 12,
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
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
  },
  cardTapHint: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  cardTapHintText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
