import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import {
  requestForegroundLocation,
  requestBackgroundLocation,
  isForegroundLocationGranted,
  isBackgroundLocationGranted,
  openLocationSettings,
} from '@/lib/location-permission';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ONBOARDING_KEY = 'vigora_onboarding_completed';

type SlideType = 'info' | 'location_foreground' | 'location_background';

interface OnboardingSlide {
  id: string;
  type: SlideType;
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    type: 'info',
    icon: 'favorite',
    iconColor: '#FFFFFF',
    iconBg: '#1E4D8C',
    title: 'Bem-vindo ao Vigora Saúde',
    description:
      'Seu assistente pessoal de saúde e segurança. Monitore sua saúde, configure alarmes de medicamentos e tenha acesso rápido a serviços de emergência.',
  },
  {
    id: '2',
    type: 'info',
    icon: 'warning',
    iconColor: '#FFFFFF',
    iconBg: '#D6161C',
    title: 'Botão SOS',
    description:
      'Em caso de emergência, pressione o botão SOS na tela inicial. Seus contatos de emergência serão notificados automaticamente via WhatsApp com sua localização.',
  },
  {
    id: '3',
    type: 'info',
    icon: 'alarm',
    iconColor: '#FFFFFF',
    iconBg: '#F0C24A',
    title: 'Alarmes Inteligentes',
    description:
      'Configure até 24 alarmes para medicamentos e consultas. Se você não responder, o app notifica automaticamente seus contatos de emergência.',
  },
  {
    id: '4',
    type: 'info',
    icon: 'people',
    iconColor: '#FFFFFF',
    iconBg: '#0F8A4A',
    title: 'Contatos de Emergência',
    description:
      'Cadastre contatos de emergência ou importe direto da agenda do celular. Eles serão notificados via WhatsApp em situações de emergência.',
  },
  {
    id: '5',
    type: 'info',
    icon: 'local-hospital',
    iconColor: '#FFFFFF',
    iconBg: '#8B5CF6',
    title: 'Ambulância e Saúde',
    description:
      'Chame ambulância com um toque (SAMU, Plano de Saúde, Bombeiros). Registre métricas de saúde e mantenha sua ficha médica sempre atualizada.',
  },
  {
    id: '6',
    type: 'location_foreground',
    icon: 'location-on',
    iconColor: '#FFFFFF',
    iconBg: '#0891B2',
    title: 'Permissão de Localização',
    description:
      'Para enviar sua localização em emergências, o Vigora Saúde precisa de acesso à sua localização. Toque em "Permitir" para continuar.',
  },
  {
    id: '7',
    type: 'location_background',
    icon: 'my-location',
    iconColor: '#FFFFFF',
    iconBg: '#0E7490',
    title: 'Localização em Segundo Plano',
    description:
      'Para funcionar mesmo com o app fechado, precisamos de acesso à localização "o tempo todo". Isso garante que sua posição seja enviada mesmo se o app não estiver aberto.',
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { firstLaunch } = useLocalSearchParams<{ firstLaunch?: string }>();
  // Hide skip button on first launch to ensure location permission is granted
  const isFirstLaunch = firstLaunch === 'true';
  const [currentIndex, setCurrentIndex] = useState(0);
  const [locationGranted, setLocationGranted] = useState(false);
  const [backgroundGranted, setBackgroundGranted] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const currentSlide = SLIDES[currentIndex];

  const handleComplete = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    } catch {}
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    router.replace('/login');
  };

  const handleRequestForegroundLocation = async () => {
    setRequestingPermission(true);
    try {
      const granted = await requestForegroundLocation();
      setLocationGranted(granted);
      if (granted) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
        // Auto-advance after a short delay
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
        }, 600);
      }
    } finally {
      setRequestingPermission(false);
    }
  };

  const handleRequestBackgroundLocation = async () => {
    setRequestingPermission(true);
    try {
      // On Android 10+, requestBackgroundPermissionsAsync may open Settings directly
      const granted = await requestBackgroundLocation();
      setBackgroundGranted(granted);
      if (granted && Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setRequestingPermission(false);
    }
  };

  const handleOpenSettings = async () => {
    await openLocationSettings();
  };

  const handleNext = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (currentIndex < SLIDES.length - 1) {
      // If on foreground location slide and not yet granted, request first
      if (currentSlide.type === 'location_foreground' && !locationGranted) {
        await handleRequestForegroundLocation();
        return;
      }
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  // Get the next button label based on current slide
  const getNextButtonLabel = () => {
    if (currentIndex === SLIDES.length - 1) return 'Começar';
    if (currentSlide.type === 'location_foreground') {
      return locationGranted ? 'Próximo' : 'Permitir Localização';
    }
    if (currentSlide.type === 'location_background') {
      return 'Próximo';
    }
    return 'Próximo';
  };

  const renderLocationForegroundSlide = (item: OnboardingSlide) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={styles.slideContent}>
        <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
          <MaterialIcons name={item.icon as any} size={56} color={item.iconColor} />
        </View>
        <Text style={[styles.slideTitle, { color: colors.foreground }]}>{item.title}</Text>
        <Text style={[styles.slideDescription, { color: colors.muted }]}>
          {item.description}
        </Text>

        {locationGranted ? (
          <View style={[styles.permissionGrantedBadge, { backgroundColor: colors.successLight }]}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <Text style={[styles.permissionGrantedText, { color: colors.success }]}>
              Localização permitida
            </Text>
          </View>
        ) : (
          <View style={[styles.permissionInfoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <MaterialIcons name="info-outline" size={18} color={colors.muted} />
            <Text style={[styles.permissionInfoText, { color: colors.muted }]}>
              Selecione "Permitir enquanto usa o app" ou "Permitir o tempo todo" no diálogo do sistema.
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderLocationBackgroundSlide = (item: OnboardingSlide) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <ScrollView
        contentContainerStyle={[styles.slideContent, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
          <MaterialIcons name={item.icon as any} size={56} color={item.iconColor} />
        </View>
        <Text style={[styles.slideTitle, { color: colors.foreground }]}>{item.title}</Text>
        <Text style={[styles.slideDescription, { color: colors.muted }]}>
          {item.description}
        </Text>

        {backgroundGranted ? (
          <View style={[styles.permissionGrantedBadge, { backgroundColor: colors.successLight }]}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
            <Text style={[styles.permissionGrantedText, { color: colors.success }]}>
              Localização em segundo plano ativada
            </Text>
          </View>
        ) : (
          <>
            {/* Step-by-step guide */}
            <View style={[styles.guideBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.guideTitle, { color: colors.foreground }]}>
                Como ativar no Android:
              </Text>
              {[
                'Toque em "Ir para Configurações" abaixo',
                'Toque em "Permissões"',
                'Toque em "Localização"',
                'Selecione "Permitir o tempo todo"',
                'Volte ao app e toque em "Próximo"',
              ].map((step, i) => (
                <View key={i} style={styles.guideStep}>
                  <View style={[styles.guideStepNumber, { backgroundColor: item.iconBg }]}>
                    <Text style={[styles.guideStepNumberText, { color: colors.onPrimary }]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.guideStepText, { color: colors.foreground }]}>{step}</Text>
                </View>
              ))}
            </View>

            <Pressable
              onPress={handleOpenSettings}
              style={({ pressed }) => [
                styles.settingsButton,
                { backgroundColor: item.iconBg, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <MaterialIcons name="settings" size={20} color={colors.onPrimary} />
              <Text style={[styles.settingsButtonText, { color: colors.onPrimary }]}>Ir para Configurações</Text>
            </Pressable>

            <Text style={[styles.skipHint, { color: colors.muted }]}>
              Você pode pular esta etapa e configurar depois em Configurações {'>'}{'>'} Localização.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    if (item.type === 'location_foreground') {
      return renderLocationForegroundSlide(item);
    }
    if (item.type === 'location_background') {
      return renderLocationBackgroundSlide(item);
    }

    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <View style={styles.slideContent}>
          <View style={[styles.iconCircle, { backgroundColor: item.iconBg }]}>
            <MaterialIcons name={item.icon as any} size={56} color={item.iconColor} />
          </View>
          <Text style={[styles.slideTitle, { color: colors.foreground }]}>{item.title}</Text>
          <Text style={[styles.slideDescription, { color: colors.muted }]}>
            {item.description}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <View style={{ width: 60 }} />
        <Text style={[styles.pageIndicator, { color: colors.muted }]}>
          {currentIndex + 1} / {SLIDES.length}
        </Text>
        {!isFirstLaunch && currentIndex < SLIDES.length - 1 ? (
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [styles.skipButton, pressed && { opacity: 0.6 }]}
          >
            <Text style={[styles.skipText, { color: colors.primary }]}>Pular</Text>
          </Pressable>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEnabled={false} // Prevent manual swiping - use buttons only
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
      />

      {/* Bottom Section */}
      <View style={[styles.bottomSection, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
        {/* Dots */}
        <View style={styles.dotsContainer}>
          {SLIDES.map((_, index) => {
            const inputRange = [
              (index - 1) * SCREEN_WIDTH,
              index * SCREEN_WIDTH,
              (index + 1) * SCREEN_WIDTH,
            ];
            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: colors.primary,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Next / Start Button */}
        <Pressable
          onPress={handleNext}
          disabled={requestingPermission}
          style={({ pressed }) => [
            styles.nextButton,
            {
              backgroundColor: colors.primary,
              opacity: pressed || requestingPermission ? 0.75 : 1,
            },
          ]}
        >
          <Text style={[styles.nextButtonText, { color: colors.onPrimary }]}>{getNextButtonLabel()}</Text>
          <MaterialIcons name="arrow-forward" size={22} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  pageIndicator: {
    fontSize: 14,
    fontWeight: '600',
  },
  skipButton: {
    width: 60,
    alignItems: 'flex-end',
    padding: 4,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 20,
    width: SCREEN_WIDTH,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  slideTitle: {
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 34,
  },
  slideDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  permissionGrantedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  permissionGrantedText: {
    fontSize: 15,
    fontWeight: '600',
  },
  permissionInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    width: '100%',
  },
  permissionInfoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  guideBox: {
    width: '100%',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  guideTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  guideStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guideStepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  guideStepNumberText: {
    fontSize: 13,
    fontWeight: '700',
  },
  guideStepText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
  },
  settingsButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  skipHint: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  bottomSection: {
    paddingHorizontal: 24,
    gap: 24,
    alignItems: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 16,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
