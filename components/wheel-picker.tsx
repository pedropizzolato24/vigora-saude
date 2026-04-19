import React, { useCallback, useEffect, useRef } from 'react';
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useColors } from '@/hooks/use-colors';

const ITEM_HEIGHT = 56;
const VISIBLE_ITEMS = 5; // odd number so selected is in the middle
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
// Multiplier to create a long looping list (large enough to scroll freely)
const LOOP_MULTIPLIER = 200;

interface WheelPickerProps {
  /** Total number of values (e.g. 24 for hours, 60 for minutes) */
  count: number;
  /** Currently selected value (0-based) */
  value: number;
  /** Called when the user settles on a new value */
  onChange: (value: number) => void;
  /** Label shown below the wheel (e.g. "hora", "min") */
  label?: string;
  /** Pad values with leading zero */
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
  const listRef = useRef<FlatList>(null);
  // Total items in the looped list
  const totalItems = count * LOOP_MULTIPLIER;
  // Start in the middle of the loop so user can scroll both ways
  const midOffset = Math.floor(LOOP_MULTIPLIER / 2) * count;

  // Scroll to the correct position on mount and when value changes externally
  const scrollToValue = useCallback(
    (val: number, animated = false) => {
      const targetIndex = midOffset + val;
      listRef.current?.scrollToOffset({
        offset: targetIndex * ITEM_HEIGHT,
        animated,
      });
    },
    [midOffset]
  );

  useEffect(() => {
    // Small delay to ensure the list has rendered before scrolling
    const timer = setTimeout(() => scrollToValue(value, false), 50);
    return () => clearTimeout(timer);
  }, [value, scrollToValue]);

  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = e.nativeEvent.contentOffset.y;
      const index = Math.round(offset / ITEM_HEIGHT);
      const newValue = ((index % count) + count) % count;
      if (newValue !== value) {
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onChange(newValue);
      }
      // Snap back to the middle section to prevent reaching the ends
      const normalizedIndex = midOffset + newValue;
      const normalizedOffset = normalizedIndex * ITEM_HEIGHT;
      if (Math.abs(offset - normalizedOffset) > ITEM_HEIGHT * count) {
        listRef.current?.scrollToOffset({ offset: normalizedOffset, animated: false });
      }
    },
    [count, value, onChange, midOffset]
  );

  const renderItem = useCallback(
    ({ index }: { index: number }) => {
      const itemValue = ((index % count) + count) % count;
      const isSelected = itemValue === value;
      const displayText = padStart ? String(itemValue).padStart(2, '0') : String(itemValue);
      return (
        <View style={styles.item}>
          <Text
            style={[
              styles.itemText,
              { color: isSelected ? colors.primary : colors.muted },
              isSelected && styles.itemTextSelected,
            ]}
          >
            {displayText}
          </Text>
        </View>
      );
    },
    [count, value, padStart, colors]
  );

  const increment = (delta: number) => {
    const next = ((value + delta) + count) % count;
    onChange(next);
    scrollToValue(next, true);
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <View style={styles.container}>
      {/* Up button */}
      <Pressable
        onPress={() => increment(1)}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-up" size={26} color={colors.primary} />
      </Pressable>

      {/* Wheel */}
      <View style={[styles.wheelWrapper, { borderColor: colors.primary }]}>
        {/* Selection highlight overlay */}
        <View
          pointerEvents="none"
          style={[styles.selectionOverlay, { borderColor: colors.primary + '60', backgroundColor: colors.primary + '12' }]}
        />
        <FlatList
          ref={listRef}
          data={Array.from({ length: totalItems })}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          onScrollEndDrag={handleScrollEnd}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          initialNumToRender={VISIBLE_ITEMS + 2}
          maxToRenderPerBatch={VISIBLE_ITEMS + 4}
          windowSize={5}
          removeClippedSubviews={Platform.OS !== 'web'}
        />
      </View>

      {/* Down button */}
      <Pressable
        onPress={() => increment(-1)}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <MaterialIcons name="keyboard-arrow-down" size={26} color={colors.primary} />
      </Pressable>

      {/* Label */}
      {label && (
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
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
    width: 90,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelWrapper: {
    width: 90,
    height: WHEEL_HEIGHT,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    position: 'relative',
  },
  selectionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
    height: ITEM_HEIGHT,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    zIndex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    // Padding so first and last items can be centered
    paddingVertical: ITEM_HEIGHT * Math.floor(VISIBLE_ITEMS / 2),
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontSize: 28,
    fontWeight: '500',
  },
  itemTextSelected: {
    fontSize: 36,
    fontWeight: '800',
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
