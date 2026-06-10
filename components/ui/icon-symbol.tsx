// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * SF Symbols -> Material Icons mappings for Vigora
 */
const MAPPING = {
  // Navigation
  "house.fill": "home",
  "alarm": "alarm",
  "heart.fill": "favorite",
  "gearshape.fill": "settings",
  "line.3.horizontal": "menu",
  // Contacts & People
  "person.fill": "person",
  "person.2.fill": "people",
  "phone.fill": "phone",
  // Health
  "waveform.path.ecg": "monitor-heart",
  "drop.fill": "water-drop",
  "cross.case.fill": "medical-services",
  // Emergency
  "exclamationmark.triangle.fill": "warning",
  "bell.fill": "notifications",
  "location.fill": "location-on",
  "map.fill": "map",
  // Actions
  "plus": "add",
  "pencil": "edit",
  "trash.fill": "delete",
  "xmark": "close",
  "checkmark": "check",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "keyboard-arrow-down",
  // Misc
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "info.circle.fill": "info",
  "doc.text.fill": "description",
  "ambulance": "local-hospital",
  "shareplay": "share",
  "whatsapp": "chat",
  "clock.fill": "access-time",
  "star.fill": "star",
  "speaker.wave.2.fill": "volume-up",
  "speaker.slash.fill": "volume-off",
  "globe": "language",
  "trash": "delete-outline",
  "arrow.clockwise": "refresh",
} as unknown as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
