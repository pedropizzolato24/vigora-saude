/**
 * WheelPicker - drum-roll style time selector
 *
 * Renders only COPIES × count items (e.g. 3×24=72 for hours) so the component
 * stays lightweight and lag-free even inside a modal ScrollView.
 *
 * Uses a plain ScrollView (not FlatList) to avoid "VirtualizedLists nested" warnings.
 *
 * Supports two visual modes:
 *   - Normal mode: compact wheel with ▲/▼ step buttons
 *   - Accessibility mode: larger wheel + larger step buttons + high-contrast colours
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';

// --- Normal mode constants ----------------------------------------------------
const ITEM_HEIGHT = 56;
// 3 itens visíveis (centro + 1 acima + 1 abaixo): menos poluído para o público
// idoso, com os vizinhos esmaecidos (feedback do beta). Deve ser ímpar.
const VISIBLE_ITEMS = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;

// --- Accessibility mode constants --------------------------------------------
const A11Y_ITEM_HEIGHT = 72;
const A11Y_VISIBLE_ITEMS = 3;
const A11Y_WHEEL_HEIGHT = A11Y_ITEM_HEIGHT * A11Y_VISIBLE_ITEMS;

// We render 3 full copies of the list so the user can always scroll in both
// directions without hitting an edge. After settling we silently re-centre.
const COPIES = 3;

// Gap between the step buttons and the wheel (styles.container gap).
const CONTAINER_GAP = 6;
const NORMAL_BTN_HEIGHT = 44;

/**
 * Geometry of a wheel column so callers (e.g. the alarm time screen's ":")
 * can align to the wheel's selection band instead of guessing a margin.
 * `wheelTop` is the distance from the column top to the wheel; centring a box
 * of `wheelHeight` there lands exactly on the highlighted band, in both modes.
 */
export function wheelColumnMetrics(isAccessibilityMode: boolean, a11yTouchTarget: number) {
  const itemH = isAccessibilityMode ? A11Y_ITEM_HEIGHT : ITEM_HEIGHT;
  const visible = isAccessibilityMode ? A11Y_VISIBLE_ITEMS : VISIBLE_ITEMS;
  const btnH = isAccessibilityMode ? a11yTouchTarget : NORMAL_BTN_HEIGHT;
  return { wheelTop: btnH + CONTAINER_GAP, wheelHeight: itemH * visible };
}

interface WheelPickerProps {
  count: number;       // total values (24 for hours, 60 for minutes)
  value: number;       // currently selected value (0-based)
  onChange: (v: number) => void;
  label?: string;
  padStart?: boolean;
}

export function WheelPicker({
  count,
  value,
  onChange,
  label,
  padStart = true,
}: WheelPickerProps) {
  const colors = useColors();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af, a11ySpacing: as_ } = useAccessibility();

  // Pick constants based on mode
  const itemH = isAccessibilityMode ? A11Y_ITEM_HEIGHT : ITEM_HEIGHT;
  const visibleItems = isAccessibilityMode ? A11Y_VISIBLE_ITEMS : VISIBLE_ITEMS;
  const wheelH = isAccessibilityMode ? A11Y_WHEEL_HEIGHT : WHEEL_HEIGHT;
  const wheelWidth = isAccessibilityMode ? 116 : 90;
  const btnHeight = isAccessibilityMode ? as_.touchTarget : NORMAL_BTN_HEIGHT;
  const iconSize = isAccessibilityMode ? 36 : 26;
  const labelSize = isAccessibilityMode ? af.sm : 12;

  const scrollRef = useRef<ScrollView>(null);
  const centreStart = count * Math.floor(COPIES / 2);

  // Último índice que NÓS mandamos a roda mostrar. Sem isto, o reancoramento
  // abaixo cortava o scroll animado da setinha no meio; no iOS o corte dispara
  // onMomentumScrollEnd com um offset intermediário e o handler "corrigia" o
  // valor de volta para o anterior — o número piscava e voltava.
  const commandedIndex = useRef<number | null>(null);

  const scrollToIndex = useCallback(
    (index: number, animated = false) => {
      commandedIndex.current = index;
      scrollRef.current?.scrollTo({ y: index * itemH, animated });
    },
    [itemH],
  );

  useEffect(() => {
    const targetIndex = centreStart + value;
    // Já comandado (setinha, digitação ou arrasto): a roda está indo pra lá.
    if (commandedIndex.current === targetIndex) return;
    const timer = setTimeout(() => scrollToIndex(targetIndex, false), 50);
    return () => clearTimeout(timer);
  }, [value, centreStart, scrollToIndex]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.y;
      const rawIndex = Math.round(offset / itemH);
      const newValue = ((rawIndex % count) + count) % count;

      if (newValue !== value) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onChange(newValue);
      }

      const centredIndex = centreStart + newValue;
      commandedIndex.current = centredIndex;
      if (rawIndex !== centredIndex) {
        scrollRef.current?.scrollTo({ y: centredIndex * itemH, animated: false });
      }
    },
    [count, value, onChange, centreStart, itemH],
  );

  // -- Tocar no número central para digitar diretamente (feedback do beta) -------
  // Em vez de só rolar/usar as setinhas, o idoso toca no número e digita a hora.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const increment = (delta: number) => {
    // Usar as setinhas encerra a edição manual (desseleciona o número digitado).
    if (editing) setEditing(false);
    const next = ((value + delta) + count) % count;
    onChange(next);
    scrollToIndex(centreStart + next, true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const beginEdit = useCallback(() => {
    setDraft(String(value));
    setEditing(true);
  }, [value]);

  // Comita ao vivo: cada dígito válido já atualiza o valor no pai, então o
  // horário fica salvo mesmo se o usuário tocar "Continuar" sem dar OK no teclado.
  const handleChangeText = useCallback(
    (t: string) => {
      setDraft(t);
      const n = parseInt(t, 10);
      if (!Number.isNaN(n)) {
        const clamped = Math.min(count - 1, Math.max(0, n));
        if (clamped !== value) onChange(clamped);
      }
    },
    [count, value, onChange],
  );

  // OK no teclado / tocar fora: apenas encerra a edição e reancora a roda no
  // valor atual (já comitado por handleChangeText).
  const commitEdit = useCallback(() => {
    setEditing(false);
    scrollToIndex(centreStart + value, false);
  }, [value, scrollToIndex, centreStart]);

  const totalItems = count * COPIES;
  const unitLabel = label === 'min' ? 'minuto' : label || 'valor';

  // -- Colours resolved per mode ----------------------------------------------
  const primaryColor   = isAccessibilityMode ? ac.primary    : colors.primary;
  const mutedColor     = isAccessibilityMode ? ac.muted      : colors.muted;
  const surfaceColor   = isAccessibilityMode ? ac.surface    : colors.surface;
  const borderColor    = isAccessibilityMode ? ac.border     : colors.border;

  return (
    <View style={styles.container}>
      {/* ▲ - decreases value (scroll up = number goes down) */}
      <Pressable
        onPress={() => increment(-1)}
        accessibilityRole="button"
        accessibilityLabel={`Diminuir ${unitLabel}`}
        style={({ pressed }) => [
          styles.stepBtn,
          {
            width: wheelWidth,
            height: btnHeight,
            backgroundColor: surfaceColor,
            borderColor: isAccessibilityMode ? ac.border : colors.border,
            borderWidth: isAccessibilityMode ? 2 : 1,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-up" size={iconSize} color={primaryColor} />
      </Pressable>

      {/* Wheel */}
      <View
        style={[
          styles.wheelWrapper,
          {
            width: wheelWidth,
            height: wheelH,
            borderColor: primaryColor,
            borderWidth: isAccessibilityMode ? 3 : 2,
          },
        ]}
      >
        {/* Selection highlight */}
        <View
          pointerEvents="none"
          style={[
            styles.selectionOverlay,
            {
              top: itemH * Math.floor(visibleItems / 2),
              height: itemH,
              borderColor: primaryColor + '60',
              backgroundColor: primaryColor + '18',
              borderTopWidth: isAccessibilityMode ? 3 : 2,
              borderBottomWidth: isAccessibilityMode ? 3 : 2,
            },
          ]}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={itemH}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          scrollEventThrottle={32}
          nestedScrollEnabled
          contentContainerStyle={{ paddingVertical: itemH * Math.floor(visibleItems / 2) }}
        >
          {Array.from({ length: totalItems }, (_, i) => {
            const itemValue = ((i % count) + count) % count;
            const isSelected = itemValue === value;
            const displayText = padStart
              ? String(itemValue).padStart(2, '0')
              : String(itemValue);

            const normalTextSize   = isSelected ? 36 : 24;
            const a11yTextSize     = isSelected ? af['2xl'] : af.lg;
            const textSize         = isAccessibilityMode ? a11yTextSize : normalTextSize;
            const textColor        = isSelected ? primaryColor : mutedColor;
            const fontWeight: any  = isSelected ? '800' : '500';
            // Vizinhos esmaecidos para destacar o número central (feedback do beta).
            const itemOpacity      = isSelected ? 1 : 0.4;

            // O número central é tocável (digitar direto). Fica DENTRO do
            // ScrollView, então tocar abre a edição e arrastar rola normalmente —
            // sem a antiga sobreposição que bloqueava o scroll a partir do centro.
            const ItemComponent = isSelected ? Pressable : View;
            return (
              <ItemComponent
                key={i}
                onPress={isSelected ? beginEdit : undefined}
                accessibilityRole={isSelected ? 'button' : undefined}
                accessibilityLabel={isSelected ? `${label ? label + ': ' : ''}toque para digitar` : undefined}
                style={{ height: itemH, alignItems: 'center', justifyContent: 'center' }}
              >
                {/* itemH é fixo; o modo acessível já amplia roda+fonte juntos, então
                    limitamos a escala de fonte do SO para os números não estourarem. */}
                <Text maxFontSizeMultiplier={1.15} style={{ fontSize: textSize, fontWeight, color: textColor, opacity: itemOpacity }}>
                  {displayText}
                </Text>
              </ItemComponent>
            );
          })}
        </ScrollView>

        {/* Em edição, um TextInput cobre só a faixa central. Fora de edição não
            há sobreposição alguma, então o scroll a partir do centro funciona. */}
        {editing && (
          <TextInput
            autoFocus
            keyboardType="number-pad"
            maxLength={2}
            value={draft}
            onChangeText={handleChangeText}
            onSubmitEditing={commitEdit}
            onBlur={commitEdit}
            selectTextOnFocus
            maxFontSizeMultiplier={1.15}
            textAlign="center"
            style={[
              styles.centerInput,
              {
                top: itemH * Math.floor(visibleItems / 2),
                height: itemH,
                fontSize: isAccessibilityMode ? af['2xl'] : 36,
                color: primaryColor,
                backgroundColor: surfaceColor,
              },
            ]}
          />
        )}
      </View>

      {/* ▼ - increases value (scroll down = number goes up) */}
      <Pressable
        onPress={() => increment(1)}
        accessibilityRole="button"
        accessibilityLabel={`Aumentar ${unitLabel}`}
        style={({ pressed }) => [
          styles.stepBtn,
          {
            width: wheelWidth,
            height: btnHeight,
            backgroundColor: surfaceColor,
            borderColor: isAccessibilityMode ? ac.border : colors.border,
            borderWidth: isAccessibilityMode ? 2 : 1,
            opacity: pressed ? 0.6 : 1,
          },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-down" size={iconSize} color={primaryColor} />
      </Pressable>

      {label && (
        <Text style={[styles.label, { color: mutedColor, fontSize: labelSize }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 6,
  },
  stepBtn: {
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  selectionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1,
  },
  centerInput: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    textAlign: 'center',
    fontWeight: '800',
    padding: 0,
  },
  label: {
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
