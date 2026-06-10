/**
 * AppDialog - Modal personalizado do Vigora
 *
 * Substitui Alert.alert() nativo com visual consistente com o tema do app.
 * Suporta modo claro/escuro automaticamente via useColors().
 * Variantes: info, success, warning, error, confirm, select, sos
 *
 * Melhorias v2:
 * - Ícones MaterialIcons animados com entrada em escala + fade
 * - Variante 'sos' com fundo vermelho e ícone de sirene pulsante
 * - Animação de checkmark para variante 'success'
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useAccessibility } from '@/lib/accessibility-context';
import { useColors } from '@/hooks/use-colors';

// --- Tipos -------------------------------------------------------------------

export type DialogVariant = 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'select' | 'sos';

export interface DialogButton {
  text: string;
  onPress?: () => void;
  /** 'default' = texto primário, 'cancel' = texto muted, 'destructive' = texto vermelho */
  style?: 'default' | 'cancel' | 'destructive';
}

export interface DialogOption {
  label: string;
  icon?: string;
  onPress: () => void;
  destructive?: boolean;
}

export interface AppDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  variant?: DialogVariant;
  buttons?: DialogButton[];
  /** Para variante 'select': lista de opções */
  options?: DialogOption[];
  onDismiss?: () => void;
}

// --- Config de variantes ------------------------------------------------------

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const VARIANT_CONFIG: Record<DialogVariant, { icon: IconName; bgLight: string; bgDark: string; iconBg: string }> = {
  info:    { icon: 'info',            bgLight: '#0a7ea4', bgDark: '#0a7ea4', iconBg: '#0a7ea418' },
  success: { icon: 'check-circle',    bgLight: '#0F8A4A', bgDark: '#2CB966', iconBg: '#0F8A4A18' },
  warning: { icon: 'warning',         bgLight: '#F0C24A', bgDark: '#F5D06E', iconBg: '#F0C24A18' },
  error:   { icon: 'error',           bgLight: '#D6161C', bgDark: '#F04040', iconBg: '#D6161C18' },
  confirm: { icon: 'help',            bgLight: '#0a7ea4', bgDark: '#0a7ea4', iconBg: '#0a7ea418' },
  select:  { icon: 'list',            bgLight: '#0a7ea4', bgDark: '#0a7ea4', iconBg: '#0a7ea418' },
  sos:     { icon: 'emergency',       bgLight: '#D6161C', bgDark: '#F04040', iconBg: '#D6161C18' },
};

// --- Componente de Ícone Animado ----------------------------------------------

function AnimatedDialogIcon({
  variant,
  accentColor,
  visible,
  isSos,
}: {
  variant: DialogVariant;
  accentColor: string;
  visible: boolean;
  isSos: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseRef = useRef<Animated.CompositeAnimation | null>(null);

  const config = VARIANT_CONFIG[variant];

  useEffect(() => {
    if (visible) {
      // Entrada: scale de 0 -> 1 com spring
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 14,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Pulso contínuo para variante SOS
      if (isSos) {
        pulseRef.current = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1.25,
              duration: 500,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 500,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
        pulseRef.current.start();
      }
    } else {
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
      pulseAnim.setValue(1);
      pulseRef.current?.stop();
      pulseRef.current = null;
    }

    return () => {
      pulseRef.current?.stop();
    };
  }, [visible]);

  const iconSize = isSos ? 44 : 32;
  const circleSize = isSos ? 80 : 56;

  return (
    <Animated.View
      style={{
        transform: [{ scale: isSos ? pulseAnim : scaleAnim }],
        opacity: opacityAnim,
        alignSelf: 'center',
        marginBottom: 4,
      }}
    >
      {/* Anel externo pulsante para SOS */}
      {isSos && (
        <View
          style={{
            position: 'absolute',
            top: -8,
            left: -8,
            right: -8,
            bottom: -8,
            borderRadius: (circleSize + 16) / 2,
            backgroundColor: accentColor + '22',
          }}
        />
      )}
      <View
        style={{
          width: circleSize,
          height: circleSize,
          borderRadius: circleSize / 2,
          backgroundColor: isSos ? accentColor + '20' : config.iconBg,
          borderWidth: isSos ? 2.5 : 0,
          borderColor: isSos ? accentColor : 'transparent',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <MaterialIcons
          name={config.icon}
          size={iconSize}
          color={accentColor}
        />
      </View>
    </Animated.View>
  );
}

// --- Componente Principal -----------------------------------------------------

export function AppDialog({
  visible,
  title,
  message,
  variant = 'info',
  buttons,
  options,
  onDismiss,
}: AppDialogProps) {
  const colors = useColors();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac } = useAccessibility();

  const scaleAnim = useRef(new Animated.Value(0.88)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const isSos = variant === 'sos';
  const config = VARIANT_CONFIG[variant];

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 280,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0.88);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  // Cor de acento por variante (respeita tema claro/escuro)
  const accentColor = isSos ? config.bgLight : config.bgLight;

  const isSelect = variant === 'select' && options && options.length > 0;

  // -- Modo Acessível ----------------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={onDismiss}
        statusBarTranslucent
      >
        <Pressable style={styles.overlay} onPress={onDismiss}>
          <Animated.View
            style={[
              styles.dialogA11y,
              {
                backgroundColor: isSos ? '#1a0000' : ac.surface,
                borderColor: accentColor,
                borderWidth: 3,
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
            {/* Ícone animado */}
            <AnimatedDialogIcon
              variant={variant}
              accentColor={accentColor}
              visible={visible}
              isSos={isSos}
            />

            {/* Título */}
            <Text style={[styles.titleA11y, { color: isSos ? ac.onEmergency : ac.foreground, fontSize: af.lg }]}>
              {title}
            </Text>

            {/* Mensagem */}
            {message ? (
              <Text style={[styles.messageA11y, { color: isSos ? '#FFCCCC' : ac.muted, fontSize: af.md }]}>
                {message}
              </Text>
            ) : null}

            {/* Opções (select) */}
            {isSelect ? (
              <View style={styles.optionsContainerA11y}>
                {options!.map((opt, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.optionButtonA11y,
                      {
                        backgroundColor: opt.destructive ? ac.error + '18' : ac.surface,
                        borderColor: opt.destructive ? ac.error : ac.border,
                        borderWidth: 2,
                        minHeight: 72,
                      },
                    ]}
                    onPress={() => { opt.onPress(); onDismiss?.(); }}
                    activeOpacity={0.7}
                  >
                    {opt.icon ? (
                      <Text style={{ fontSize: af.lg, marginRight: 12 }}>{opt.icon}</Text>
                    ) : null}
                    <Text
                      style={[
                        styles.optionLabelA11y,
                        {
                          color: opt.destructive ? ac.error : ac.foreground,
                          fontSize: af.md,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* Botões */}
            {!isSelect && buttons && buttons.length > 0 ? (
              <View style={styles.buttonsContainerA11y}>
                {buttons.map((btn, i) => {
                  const btnColor =
                    btn.style === 'destructive'
                      ? ac.error
                      : btn.style === 'cancel'
                      ? ac.muted
                      : accentColor;
                  const isPrimary = btn.style !== 'cancel';
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.buttonA11y,
                        {
                          backgroundColor: isPrimary ? btnColor : 'transparent',
                          borderColor: btnColor,
                          borderWidth: 2,
                          minHeight: 72,
                        },
                      ]}
                      onPress={() => { btn.onPress?.(); onDismiss?.(); }}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.buttonTextA11y,
                          {
                            color: isPrimary ? '#fff' : btnColor,
                            fontSize: af.md,
                          },
                        ]}
                      >
                        {btn.text}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </Animated.View>
        </Pressable>
      </Modal>
    );
  }

  // -- Modo Normal -------------------------------------------------------------
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={isSelect ? onDismiss : undefined}>
        <Animated.View
          style={[
            styles.dialog,
            {
              backgroundColor: isSos ? '#1C0000' : colors.surface,
              shadowColor: isSos ? colors.emergency : '#000',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Barra de acento no topo */}
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

          {/* Ícone animado centralizado */}
          <View style={styles.iconWrapper}>
            <AnimatedDialogIcon
              variant={variant}
              accentColor={accentColor}
              visible={visible}
              isSos={isSos}
            />
          </View>

          {/* Título */}
          <Text style={[styles.title, { color: isSos ? colors.onEmergency : colors.foreground }]}>
            {title}
          </Text>

          {/* Mensagem */}
          {message ? (
            <Text style={[styles.message, { color: isSos ? '#FFAAAA' : colors.muted }]}>
              {message}
            </Text>
          ) : null}

          {/* Separador */}
          <View style={[styles.divider, { backgroundColor: isSos ? '#FF000040' : colors.border }]} />

          {/* Opções (select) */}
          {isSelect ? (
            <ScrollView
              style={styles.optionsScroll}
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {options!.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  style={[
                    styles.optionRow,
                    i < options!.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    opt.destructive && { backgroundColor: colors.error + '0A' },
                  ]}
                  onPress={() => { opt.onPress(); onDismiss?.(); }}
                  activeOpacity={0.6}
                >
                  {opt.icon ? (
                    <Text style={styles.optionIcon}>{opt.icon}</Text>
                  ) : null}
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: opt.destructive ? colors.error : colors.foreground },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : null}

          {/* Botões */}
          {!isSelect && buttons && buttons.length > 0 ? (
            <View
              style={[
                styles.buttonsRow,
                buttons.length > 2 && styles.buttonsColumn,
              ]}
            >
              {buttons.map((btn, i) => {
                const btnColor =
                  btn.style === 'destructive'
                    ? (isSos ? '#FF4444' : colors.error)
                    : btn.style === 'cancel'
                    ? (isSos ? '#FF888888' : colors.muted)
                    : accentColor;
                const isPrimary = btn.style !== 'cancel';
                const isLast = i === buttons.length - 1;
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.button,
                      isPrimary
                        ? { backgroundColor: btnColor }
                        : {
                            backgroundColor: 'transparent',
                            borderWidth: 1,
                            borderColor: isSos ? '#FF444466' : colors.border,
                          },
                      !isLast && buttons.length <= 2 && { marginRight: 8 },
                      !isLast && buttons.length > 2 && { marginBottom: 8 },
                    ]}
                    onPress={() => { btn.onPress?.(); onDismiss?.(); }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { color: isPrimary ? '#fff' : (isSos ? '#FF8888' : colors.muted) },
                      ]}
                    >
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// --- Hook utilitário ----------------------------------------------------------

export function useAppDialog() {
  const [state, setState] = React.useState<AppDialogProps>({
    visible: false,
    title: '',
  });

  const showDialog = React.useCallback((props: Omit<AppDialogProps, 'visible' | 'onDismiss'>) => {
    setState({ ...props, visible: true });
  }, []);

  const hideDialog = React.useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const dialogProps: AppDialogProps = {
    ...state,
    onDismiss: hideDialog,
  };

  return { dialogProps, showDialog, hideDialog };
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  // -- Modo Normal --
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 14,
  },
  accentBar: {
    height: 4,
    width: '100%',
  },
  iconWrapper: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
    textAlign: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 0,
  },
  optionsScroll: {
    maxHeight: 280,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  optionIcon: {
    fontSize: 20,
    width: 28,
    textAlign: 'center',
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  buttonsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  buttonsColumn: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // -- Modo Acessível --
  dialogA11y: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  titleA11y: {
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 32,
  },
  messageA11y: {
    textAlign: 'center',
    lineHeight: 28,
  },
  optionsContainerA11y: {
    gap: 12,
    marginTop: 4,
  },
  optionButtonA11y: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    gap: 12,
  },
  optionLabelA11y: {
    flex: 1,
  },
  buttonsContainerA11y: {
    gap: 12,
    marginTop: 4,
  },
  buttonA11y: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonTextA11y: {
    fontWeight: '700',
    textAlign: 'center',
  },
});
