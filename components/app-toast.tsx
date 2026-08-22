/**
 * AppToast - Snackbar/Toast personalizado do Vigora
 *
 * Para confirmações rápidas que não precisam interromper o fluxo do usuário.
 * Aparece na parte inferior da tela, some automaticamente após alguns segundos.
 *
 * Variantes: success, info, warning, error
 *
 * Uso:
 * ```tsx
 * const { toastProps, showToast } = useAppToast();
 *
 * showToast({ message: 'Contato salvo!', variant: 'success' });
 *
 * return (
 *   <>
 *     <MinhasTela />
 *     <AppToast {...toastProps} />
 *   </>
 * );
 * ```
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';

// --- Tipos --------------------------------------------------------------------

export type ToastVariant = 'success' | 'info' | 'warning' | 'error';

export interface AppToastProps {
  visible: boolean;
  message: string;
  variant?: ToastVariant;
  /** Duração em ms antes de sumir automaticamente. Padrão: 3000 */
  duration?: number;
  /** Ação opcional no lado direito */
  action?: { label: string; onPress: () => void };
  onHide?: () => void;
}

// --- Config de variantes ------------------------------------------------------

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

/**
 * Acento por variante — o TOKEN, não o valor. A tabela antiga tinha `color` e
 * `darkColor` copiados do theme.config.js e o componente só lia o `color`:
 * no modo escuro todo toast usava a cor do tema claro. Mesmo defeito que o
 * app-dialog tinha. Com o token, o esquema é resolvido por quem já sabe.
 *
 * 'info' usava '#0a7ea4', teal que não existe na paleta — agora é o azul da marca.
 */
const TOAST_CONFIG: Record<ToastVariant, { icon: IconName; token: 'primary' | 'success' | 'warning' | 'error' }> = {
  success: { icon: 'check-circle',  token: 'success' },
  info:    { icon: 'info',          token: 'primary' },
  warning: { icon: 'warning',       token: 'warning' },
  error:   { icon: 'error',         token: 'error' },
};

// --- Componente ---------------------------------------------------------------

export function AppToast({
  visible,
  message,
  variant = 'success',
  duration = 3000,
  action,
  onHide,
}: AppToastProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(100)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const config = TOAST_CONFIG[variant];
  const cor = colors[config.token];

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 100,
        duration: 250,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onHide?.();
    });
  }, [onHide]);

  useEffect(() => {
    if (visible) {
      // Limpar timer anterior
      if (timerRef.current) clearTimeout(timerRef.current);

      // Haptic feedback por variante
      if (Platform.OS !== 'web') {
        if (variant === 'success') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (variant === 'error') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else if (variant === 'warning') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }

      // Entrada: slide de baixo + fade
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 20,
          stiffness: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide após duração
      timerRef.current = setTimeout(() => {
        hide();
      }, duration);
    } else {
      translateY.setValue(100);
      opacityAnim.setValue(0);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, duration]);

  if (!visible) return null;

  const bottomOffset = insets.bottom + 80; // acima da tab bar

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: cor + '44',
          bottom: bottomOffset,
          transform: [{ translateY }],
          opacity: opacityAnim,
          shadowColor: cor,
        },
      ]}
      pointerEvents="box-none"
    >
      {/* Linha de acento lateral */}
      <View style={[styles.accentLine, { backgroundColor: cor }]} />

      {/* Ícone */}
      <MaterialIcons name={config.icon} size={22} color={cor} />

      {/* Mensagem */}
      <Text
        style={[styles.message, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {message}
      </Text>

      {/* Ação opcional */}
      {action ? (
        <TouchableOpacity
          onPress={() => { action.onPress(); hide(); }}
          activeOpacity={0.7}
          style={styles.actionButton}
        >
          <Text style={[styles.actionText, { color: cor }]}>
            {action.label}
          </Text>
        </TouchableOpacity>
      ) : null}

      {/* Botão fechar */}
      <TouchableOpacity onPress={hide} activeOpacity={0.6} style={styles.closeButton}>
        <MaterialIcons name="close" size={18} color={colors.muted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// --- Hook utilitário ----------------------------------------------------------

export function useAppToast() {
  const [state, setState] = useState<AppToastProps>({
    visible: false,
    message: '',
  });

  const showToast = useCallback((props: Omit<AppToastProps, 'visible' | 'onHide'>) => {
    // Força re-trigger mesmo se já estava visível
    setState({ ...props, visible: false });
    setTimeout(() => {
      setState({ ...props, visible: true });
    }, 50);
  }, []);

  const hideToast = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const toastProps: AppToastProps = {
    ...state,
    onHide: hideToast,
  };

  return { toastProps, showToast, hideToast };
}

// --- Estilos ------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 9999,
  },
  accentLine: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderRadius: 2,
  },
  message: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 20,
    paddingLeft: 4,
  },
  actionButton: {
    paddingHorizontal: 4,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    padding: 2,
  },
});
