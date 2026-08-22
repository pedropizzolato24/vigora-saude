/**
 * SOSCountdownDialog - Diálogo de contagem regressiva para ativação do SOS
 *
 * Exibe um contador visual de 3->2->1->0 com animação circular (arco SVG).
 * O usuário pode cancelar a qualquer momento. Se o contador chegar a 0,
 * a ação de SOS é executada automaticamente.
 *
 * Uso:
 * ```tsx
 * const [sosVisible, setSosVisible] = useState(false);
 *
 * <SOSCountdownDialog
 *   visible={sosVisible}
 *   onConfirm={() => { setSosVisible(false); activateSOS(); }}
 *   onCancel={() => setSosVisible(false)}
 * />
 * ```
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';

// --- Constantes ---------------------------------------------------------------

const COUNTDOWN_SECONDS = 3;
const CIRCLE_SIZE = 120;
const STROKE_WIDTH = 8;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// --- Componente de Arco SVG Animado ------------------------------------------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function CountdownArc({
  progress,
  color,
}: {
  progress: Animated.Value;
  color: string;
}) {
  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, 0],
  });

  return (
    <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
      {/* Trilha de fundo */}
      <Circle
        cx={CIRCLE_SIZE / 2}
        cy={CIRCLE_SIZE / 2}
        r={RADIUS}
        stroke={color + '30'}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      {/* Arco de progresso */}
      <AnimatedCircle
        cx={CIRCLE_SIZE / 2}
        cy={CIRCLE_SIZE / 2}
        r={RADIUS}
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        fill="none"
        strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={strokeDashoffset}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// --- Props --------------------------------------------------------------------

export interface SOSCountdownDialogProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// --- Componente Principal -----------------------------------------------------

export function SOSCountdownDialog({
  visible,
  onConfirm,
  onCancel,
}: SOSCountdownDialogProps) {
  const colors = useColors();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();

  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);
  const confirmedRef = useRef(false);

  const stopAll = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    progressAnimRef.current?.stop();
    pulseRef.current?.stop();
    countdownRef.current = null;
    progressAnimRef.current = null;
    pulseRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    stopAll();
    confirmedRef.current = false;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onCancel();
  }, [onCancel, stopAll]);

  useEffect(() => {
    if (visible) {
      confirmedRef.current = false;
      setCount(COUNTDOWN_SECONDS);
      progressAnim.setValue(1);

      // Entrada do modal
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Haptic inicial de alerta
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }

      // Animação do arco: de 1 -> 0 em COUNTDOWN_SECONDS segundos
      progressAnimRef.current = Animated.timing(progressAnim, {
        toValue: 0,
        duration: COUNTDOWN_SECONDS * 1000,
        easing: Easing.linear,
        useNativeDriver: false, // SVG não suporta native driver
      });
      progressAnimRef.current.start(({ finished }) => {
        if (finished && !confirmedRef.current) {
          confirmedRef.current = true;
          if (Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
          Speech.speak('Avisando suas pessoas e ligando para o SAMU', { language: 'pt-BR' });
          onConfirm();
        }
      });

      // Pulso do ícone de sirene
      pulseRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 400,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulseRef.current.start();

      // Contador numérico com haptic a cada segundo
      let remaining = COUNTDOWN_SECONDS;
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining > 0) {
          setCount(remaining);
          if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          }
        } else {
          setCount(0);
          stopAll();
        }
      }, 1000);
    } else {
      // Reset ao fechar
      stopAll();
      scaleAnim.setValue(0.88);
      opacityAnim.setValue(0);
      pulseAnim.setValue(1);
      setCount(COUNTDOWN_SECONDS);
      progressAnim.setValue(1);
    }

    return () => {
      stopAll();
    };
  }, [visible]);

  const SOS_RED = colors.emergency;

  // -- Modo Acessível ----------------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
        statusBarTranslucent
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.dialogA11y,
              {
                backgroundColor: '#1a0000',
                borderColor: SOS_RED,
                borderWidth: 3,
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
            {/* Ícone pulsante */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }], alignSelf: 'center' }}>
              <View style={[styles.iconCircleA11y, { backgroundColor: SOS_RED + '25', borderColor: SOS_RED, borderWidth: 2 }]}>
                <MaterialIcons name="emergency" size={48} color={SOS_RED} />
              </View>
            </Animated.View>

            {/* Contador */}
            <Text style={[styles.countA11y, { color: SOS_RED, fontSize: af.xl * 2 }]}>
              {count}
            </Text>

            <Text style={[styles.titleA11y, { color: '#FFFFFF', fontSize: af.lg }]}>
              SOS SERÁ ATIVADO
            </Text>
            <Text style={[styles.messageA11y, { color: '#FFCCCC', fontSize: af.md }]}>
              Toque em CANCELAR para interromper.
            </Text>

            {/* Botão cancelar */}
            <TouchableOpacity
              style={[styles.cancelBtnA11y, { borderColor: '#FFFFFF55', minHeight: 72 }]}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelTextA11y, { color: '#FFFFFF', fontSize: af.md }]}>
                CANCELAR
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // -- Modo Normal -------------------------------------------------------------
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={undefined}>
        <Animated.View
          style={[
            styles.dialog,
            {
              backgroundColor: '#1C0000',
              shadowColor: SOS_RED,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Barra de acento vermelha */}
          <View style={[styles.accentBar, { backgroundColor: SOS_RED }]} />

          {/* Área do contador circular */}
          <View style={styles.countdownArea}>
            {/* Arco SVG */}
            <CountdownArc progress={progressAnim} color={SOS_RED} />

            {/* Ícone pulsante sobreposto */}
            <Animated.View
              style={[
                styles.iconOverlay,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              <MaterialIcons name="emergency" size={40} color={SOS_RED} />
            </Animated.View>

            {/* Número do contador */}
            <Text style={[styles.countNumber, { color: '#FFFFFF' }]}>
              {count}
            </Text>
          </View>

          {/* Título */}
          <Text style={[styles.title, { color: '#FFFFFF' }]}>
            SOS SERÁ ATIVADO
          </Text>

          {/* Mensagem */}
          <Text style={[styles.message, { color: '#FFAAAA' }]}>
            Aguarde {count}s ou toque em Cancelar para interromper.
          </Text>

          {/* Separador */}
          <View style={[styles.divider, { backgroundColor: '#FF000040' }]} />

          {/* Botão cancelar */}
          <TouchableOpacity
            style={[styles.cancelBtn, { borderColor: '#FF444466' }]}
            onPress={handleCancel}
            activeOpacity={0.75}
          >
            <MaterialIcons name="close" size={18} color="#FF8888" style={{ marginRight: 6 }} />
            <Text style={[styles.cancelText, { color: '#FF8888' }]}>
              CANCELAR
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  // -- Modo Normal --
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 16,
    alignItems: 'center',
  },
  accentBar: {
    height: 4,
    width: '100%',
  },
  countdownArea: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    marginTop: 28,
    marginBottom: 8,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  iconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -24,
  },
  countNumber: {
    position: 'absolute',
    bottom: 4,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    width: '85%',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // -- Modo Acessível --
  dialogA11y: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    gap: 16,
    alignItems: 'center',
  },
  iconCircleA11y: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  countA11y: {
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
  },
  titleA11y: {
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
    lineHeight: 32,
  },
  messageA11y: {
    textAlign: 'center',
    lineHeight: 28,
    color: '#FFCCCC',
  },
  cancelBtnA11y: {
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  cancelTextA11y: {
    fontWeight: '800',
    letterSpacing: 1,
  },
});
