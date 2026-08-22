/**
 * monitoring-status-badge.tsx
 *
 * Indicador compacto de status do monitoramento para o header do Dashboard.
 * Exibe um chip colorido com ícone e texto curto:
 *   - Verde  + "Monitorando" -> conectado e recente (< 15 min)
 *   - Laranja + "Sem sinal"  -> conectado mas desatualizado
 *   - Cinza  + "Offline"     -> sem conexão ou erro
 *
 * Atualiza automaticamente a cada 5 minutos.
 */
import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { ComponentProps } from "react";
import { useColors } from "@/hooks/use-colors";
import { useMonitoringStatus } from "@/hooks/use-monitoring-status";

type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

type Props = {
  /** Se true, usa fontes e ícones maiores (modo acessibilidade) */
  accessible?: boolean;
};

export function MonitoringStatusBadge({ accessible = false }: Props) {
  const colors = useColors();
  const { loading, error, isRecent, refresh } = useMonitoringStatus(
    5 * 60 * 1000 // auto-refresh a cada 5 minutos
  );

  const iconSize = accessible ? 18 : 14;
  const fontSize = accessible ? 18 : 15;
  const paddingH = accessible ? 12 : 8;
  const paddingV = accessible ? 8 : 5;
  const borderRadius = accessible ? 14 : 10;
  const gap = accessible ? 6 : 4;

  // Determinar estado visual
  let bgColor: string;
  let textColor: string;
  let iconName: MaterialIconName;
  let label: string;

  if (loading) {
    bgColor = colors.warning + "22";
    textColor = colors.warning;
    iconName = "sync";
    label = "Verificando";
  } else if (error) {
    bgColor = colors.muted + "22";
    textColor = colors.muted;
    iconName = "cloud-off";
    label = "Offline";
  } else if (isRecent) {
    bgColor = colors.success + "22";
    textColor = colors.success;
    iconName = "shield";
    label = "Monitorando";
  } else {
    bgColor = colors.warning + "22";
    textColor = colors.warning;
    iconName = "cloud-off";
    label = "Sem sinal";
  }

  return (
    <TouchableOpacity
      onPress={refresh}
      activeOpacity={0.7}
      accessibilityLabel={`Status do monitoramento: ${label}. Toque para atualizar.`}
      accessibilityRole="button"
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap,
          backgroundColor: bgColor,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          borderRadius,
        }}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={textColor}
            style={{ width: iconSize, height: iconSize }}
          />
        ) : (
          <MaterialIcons name={iconName} size={iconSize} color={textColor} />
        )}
        <Text
          style={{
            fontSize,
            fontWeight: "700",
            color: textColor,
            letterSpacing: 0.2,
          }}
        >
          {label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
