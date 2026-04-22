/**
 * AppDialog — Modal personalizado do Vigora Saúde
 *
 * Substitui Alert.alert() nativo com visual consistente com o tema do app.
 * Suporta modo claro/escuro automaticamente via useColors().
 * Variantes: info, success, warning, error, confirm, select
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAccessibility } from '@/lib/accessibility-context';
import { useColors } from '@/hooks/use-colors';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type DialogVariant = 'info' | 'success' | 'warning' | 'error' | 'confirm' | 'select';

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

// ─── Ícones por variante ──────────────────────────────────────────────────────

const VARIANT_ICONS: Record<DialogVariant, string> = {
  info: 'ℹ',
  success: '✓',
  warning: '⚠',
  error: '✕',
  confirm: '?',
  select: '☰',
};

// ─── Componente Principal ─────────────────────────────────────────────────────

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
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

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
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  // Cor do ícone/acento por variante
  const accentColor = {
    info: colors.primary,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
    confirm: colors.primary,
    select: colors.primary,
  }[variant];

  const isSelect = variant === 'select' && options && options.length > 0;

  // ── Modo Acessível ──────────────────────────────────────────────────────────
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
                backgroundColor: ac.surface,
                borderColor: accentColor,
                borderWidth: 3,
                transform: [{ scale: scaleAnim }],
                opacity: opacityAnim,
              },
            ]}
          >
            {/* Ícone */}
            <View style={[styles.iconCircleA11y, { backgroundColor: accentColor + '22' }]}>
              <Text style={[styles.iconTextA11y, { color: accentColor, fontSize: af.xl }]}>
                {VARIANT_ICONS[variant]}
              </Text>
            </View>

            {/* Título */}
            <Text style={[styles.titleA11y, { color: ac.foreground, fontSize: af.lg }]}>
              {title}
            </Text>

            {/* Mensagem */}
            {message ? (
              <Text style={[styles.messageA11y, { color: ac.muted, fontSize: af.md }]}>
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

  // ── Modo Normal ─────────────────────────────────────────────────────────────
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
              backgroundColor: colors.surface,
              shadowColor: '#000',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Barra de acento no topo */}
          <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

          {/* Cabeçalho com ícone */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: accentColor + '18' }]}>
              <Text style={[styles.iconText, { color: accentColor }]}>
                {VARIANT_ICONS[variant]}
              </Text>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          </View>

          {/* Mensagem */}
          {message ? (
            <Text style={[styles.message, { color: colors.muted }]}>{message}</Text>
          ) : null}

          {/* Separador */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

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
                    ? colors.error
                    : btn.style === 'cancel'
                    ? colors.muted
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
                        : { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
                      !isLast && buttons.length <= 2 && { marginRight: 8 },
                      !isLast && buttons.length > 2 && { marginBottom: 8 },
                    ]}
                    onPress={() => { btn.onPress?.(); onDismiss?.(); }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        { color: isPrimary ? '#fff' : colors.muted },
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

// ─── Hook utilitário ──────────────────────────────────────────────────────────

/**
 * useAppDialog — hook para controlar um AppDialog de forma imperativa,
 * similar ao Alert.alert() mas com visual personalizado.
 *
 * Uso:
 * ```tsx
 * const { dialogProps, showDialog } = useAppDialog();
 *
 * showDialog({
 *   title: 'Confirmar',
 *   message: 'Deseja excluir?',
 *   variant: 'error',
 *   buttons: [
 *     { text: 'Cancelar', style: 'cancel' },
 *     { text: 'Excluir', style: 'destructive', onPress: handleDelete },
 *   ],
 * });
 *
 * return <AppDialog {...dialogProps} />;
 * ```
 */
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

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  // ── Modo Normal ──
  dialog: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  accentBar: {
    height: 4,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
    gap: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 20,
    paddingBottom: 16,
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

  // ── Modo Acessível ──
  dialogA11y: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 24,
    gap: 16,
  },
  iconCircleA11y: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  iconTextA11y: {
    fontWeight: '800',
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
