import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { useAccessibility } from '@/lib/accessibility-context';
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { ScreenContainer } from '@/components/screen-container';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/lib/font-size-context';

interface LocationRecord {
  id: string;
  latitude: number;
  longitude: number;
  timestamp: number;
  address?: string;
}

export default function LocationScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const [currentLocation, setCurrentLocation] = useState<LocationRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<LocationRecord[]>([]);
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();

  const getLocation = async () => {
    if ((Platform.OS as string) === 'web') {
      showDialog({ title: 'Não disponível', message: 'O acesso ao GPS não está disponível na versão web.', variant: 'info', buttons: [{ text: 'OK' }] });
      return;
    }

    setLoading(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showDialog({ title: 'Permissão negada', message: 'Para compartilhar sua localização, permita o acesso ao GPS nas configurações do dispositivo.', variant: 'warning', buttons: [{ text: 'OK' }] });
        setLoading(false);
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      // Try reverse geocoding
      let address: string | undefined;
      try {
        const geocode = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geocode.length > 0) {
          const g = geocode[0];
          address = [g.street, g.streetNumber, g.district, g.city, g.region]
            .filter(Boolean)
            .join(', ');
        }
      } catch {
        // Geocoding failed, continue without address
      }

      const record: LocationRecord = {
        id: `${Date.now()}`,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: Date.now(),
        address,
      };

      setCurrentLocation(record);

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      showDialog({ title: 'Erro', message: 'Não foi possível obter sua localização. Tente novamente.', variant: 'error', buttons: [{ text: 'OK' }] });
    } finally {
      setLoading(false);
    }
  };

  const shareLocation = async (record: LocationRecord) => {
    const mapsUrl = `https://maps.google.com/?q=${record.latitude},${record.longitude}`;
    const message = `🚨 Minha localização atual:\n${record.address ? record.address + '\n' : ''}${mapsUrl}`;

    try {
      if (Platform.OS === 'web') {
        await Linking.openURL(mapsUrl);
      } else {
        await Share.share({ message, title: 'Minha Localização - Vigora Saúde' });
        // Add to history
        setHistory((prev) => [record, ...prev].slice(0, 10));
      }
    } catch {
      // User cancelled share
    }
  };

  const openInMaps = async (record: LocationRecord) => {
    const url = `https://maps.google.com/?q=${record.latitude},${record.longitude}`;
    await Linking.openURL(url);
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // --- ACCESSIBILITY MODE --------------------------------------------------
  if (isAccessibilityMode) {
    return (
      <ScreenContainer edges={['left', 'right']} containerClassName="bg-white">
        <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 12, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, backgroundColor: ac.background }}>
          <Text style={{ fontSize: af['2xl'], fontWeight: '900', color: ac.foreground }}>Localização</Text>
          <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 4 }}>Compartilhe sua posição</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Privacy note */}
          <View style={{ backgroundColor: ac.primary + '20', borderRadius: 16, padding: 16, borderWidth: 2, borderColor: ac.primary, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <MaterialIcons name="lock" size={28} color={ac.primary} />
            <Text style={{ flex: 1, fontSize: af.sm, color: ac.primary, fontWeight: '600', lineHeight: af.sm * 1.5 }}>
              Se você ativar "Compartilhar localização automaticamente" em Configurações, sua posição é enviada ao servidor para o monitoramento de emergência. Caso contrário, só é compartilhada quando você toca em Compartilhar. Nunca repassada a terceiros.
            </Text>
          </View>
          {/* Big get location button */}
          <Pressable
            onPress={getLocation}
            disabled={loading}
            style={({ pressed }) => [{ backgroundColor: ac.success, borderRadius: 20, paddingVertical: as_.buttonPadding + 8, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, borderWidth: 4, borderColor: '#004400', opacity: loading ? 0.6 : pressed ? 0.85 : 1 }]}
          >
            <MaterialIcons name={loading ? 'refresh' : 'my-location'} size={44} color={ac.onEmergency} />
            <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.onEmergency }}>
              {loading ? 'Obtendo...' : 'Obter Minha Localização'}
            </Text>
          </Pressable>
          {/* Location result */}
          {currentLocation && (
            <View style={{ backgroundColor: ac.surface, borderRadius: 20, borderWidth: 2, borderColor: ac.success, padding: 20, gap: 16 }}>
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <MaterialIcons name="location-on" size={36} color={ac.success} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: af.lg, fontWeight: '900', color: ac.foreground }}>Localização Encontrada</Text>
                  <Text style={{ fontSize: af.sm, color: ac.muted, marginTop: 2 }}>{formatTimestamp(currentLocation.timestamp)}</Text>
                </View>
              </View>
              {currentLocation.address && (
                <Text style={{ fontSize: af.md, color: ac.foreground, fontWeight: '600', lineHeight: af.md * 1.4 }}>{currentLocation.address}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Pressable
                  onPress={() => shareLocation(currentLocation)}
                  style={({ pressed }) => [{ flex: 1, backgroundColor: ac.primary, borderRadius: 16, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 3, borderColor: ac.primary, opacity: pressed ? 0.85 : 1 }]}
                >
                  <MaterialIcons name="share" size={28} color={ac.onPrimary} />
                  <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.onPrimary }}>Compartilhar</Text>
                </Pressable>
                <Pressable
                  onPress={() => openInMaps(currentLocation)}
                  style={({ pressed }) => [{ flex: 1, backgroundColor: ac.surface, borderRadius: 16, paddingVertical: as_.buttonPadding, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 3, borderColor: ac.border, opacity: pressed ? 0.85 : 1 }]}
                >
                  <MaterialIcons name="map" size={28} color={ac.primary} />
                  <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.primary }}>Ver no Mapa</Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
        <AppDialog {...dialogProps} />
      </ScreenContainer>
    );
  }

  // --- NORMAL MODE --------------------------------------------------
  return (
    <ScreenContainer edges={["left", "right"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border, paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={[styles.title, { color: colors.foreground, fontSize: fs['2xl'] }]}>Localização</Text>
          <Text style={[styles.subtitle, { color: colors.muted, fontSize: fs.sm }]}>
            Compartilhe sua posição
          </Text>
        </View>
        <View style={[styles.headerIcon, { backgroundColor: colors.successLight }]}>
          <MaterialIcons name="location-on" size={24} color={colors.success} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Privacy Note */}
        <View style={[styles.privacyNote, { backgroundColor: colors.primaryLight, borderColor: colors.primary + '30' }]}>
          <MaterialIcons name="lock" size={16} color={colors.primary} />
          <Text style={[styles.privacyText, { color: colors.foreground }]}>
            Se "Compartilhar localização automaticamente" estiver ativo nas Configurações, sua localização é enviada periodicamente ao servidor para o monitoramento de emergência (dead-man's switch). Caso contrário, só é enviada quando você toca em Compartilhar. Nunca é repassada a terceiros.
          </Text>
        </View>

        {/* Get Location Button */}
        <Pressable
          onPress={getLocation}
          style={({ pressed }) => [
            styles.getLocationBtn,
            { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1 },
          ]}
          disabled={loading}
        >
          <MaterialIcons name={loading ? 'refresh' : 'my-location'} size={24} color={colors.onSuccess} />
          <Text style={[styles.getLocationText, { color: colors.onSuccess }]}>
            {loading ? 'Obtendo localização...' : 'Obter Localização Atual'}
          </Text>
        </Pressable>

        {/* Current Location Card */}
        {currentLocation && (
          <View style={[styles.locationCard, { backgroundColor: colors.surface, borderColor: colors.success + '40' }]}>
            <View style={styles.locationCardHeader}>
              <View style={[styles.locationIconBadge, { backgroundColor: colors.successLight }]}>
                <MaterialIcons name="location-on" size={22} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.locationCardTitle, { color: colors.foreground }]}>
                  Localização Atual
                </Text>
                <Text style={[styles.locationTime, { color: colors.muted }]}>
                  {formatTimestamp(currentLocation.timestamp)}
                </Text>
              </View>
            </View>

            {currentLocation.address && (
              <Text style={[styles.addressText, { color: colors.foreground }]}>
                {currentLocation.address}
              </Text>
            )}

            <View style={styles.coordsRow}>
              <View style={[styles.coordBadge, { backgroundColor: colors.border }]}>
                <Text style={[styles.coordText, { color: colors.muted }]}>
                  Lat: {currentLocation.latitude.toFixed(6)}
                </Text>
              </View>
              <View style={[styles.coordBadge, { backgroundColor: colors.border }]}>
                <Text style={[styles.coordText, { color: colors.muted }]}>
                  Lng: {currentLocation.longitude.toFixed(6)}
                </Text>
              </View>
            </View>

            <View style={styles.locationActions}>
              <Pressable
                onPress={() => openInMaps(currentLocation)}
                style={({ pressed }) => [
                  styles.locationActionBtn,
                  { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <MaterialIcons name="map" size={18} color={colors.foreground} />
                <Text style={[styles.locationActionText, { color: colors.foreground }]}>Ver no Mapa</Text>
              </Pressable>
              <Pressable
                onPress={() => shareLocation(currentLocation)}
                style={({ pressed }) => [
                  styles.locationActionBtn,
                  { backgroundColor: colors.success, opacity: pressed ? 0.85 : 1, flex: 1.5 },
                ]}
              >
                <MaterialIcons name="share" size={18} color={colors.onSuccess} />
                <Text style={[styles.locationActionText, { color: colors.onSuccess }]}>Compartilhar</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* History */}
        {history.length > 0 && (
          <>
            <Text style={[styles.historyTitle, { color: colors.foreground }]}>
              Histórico de Compartilhamentos
            </Text>
            {history.map((record) => (
              <View
                key={record.id}
                style={[styles.historyCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <MaterialIcons name="history" size={18} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.historyAddress, { color: colors.foreground }]} numberOfLines={1}>
                    {record.address || `${record.latitude.toFixed(4)}, ${record.longitude.toFixed(4)}`}
                  </Text>
                  <Text style={[styles.historyTime, { color: colors.muted }]}>
                    {formatTimestamp(record.timestamp)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => shareLocation(record)}
                  style={({ pressed }) => [styles.reshareBtn, pressed && { opacity: 0.6 }]}
                >
                  <MaterialIcons name="share" size={18} color={colors.primary} />
                </Pressable>
              </View>
            ))}
          </>
        )}

        {/* Instructions */}
        <View style={[styles.instructionsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.instructionsTitle, { color: colors.foreground }]}>
            Como usar
          </Text>
          <Text style={[styles.instructionsText, { color: colors.muted }]}>
            1. Toque em "Obter Localização Atual" para capturar seu GPS.{'\n'}
            2. Toque em "Compartilhar" para enviar o link do Google Maps via WhatsApp, SMS ou outro app.{'\n'}
            3. Seus contatos de emergência poderão ver exatamente onde você está.
          </Text>
        </View>
      </ScrollView>
      <AppDialog {...dialogProps} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 14, marginTop: 2 },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  privacyText: { flex: 1, fontSize: 13, lineHeight: 18 },
  getLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  getLocationText: { fontSize: 17, fontWeight: '700' },
  locationCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    gap: 12,
  },
  locationCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locationIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCardTitle: { fontSize: 16, fontWeight: '700' },
  locationTime: { fontSize: 13, marginTop: 2 },
  addressText: { fontSize: 15, lineHeight: 21 },
  coordsRow: { flexDirection: 'row', gap: 8 },
  coordBadge: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  coordText: { fontSize: 12, fontWeight: '500' },
  locationActions: { flexDirection: 'row', gap: 10 },
  locationActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  locationActionText: { fontSize: 14, fontWeight: '600' },
  historyTitle: { fontSize: 17, fontWeight: '700', marginTop: 4 },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  historyAddress: { fontSize: 14, fontWeight: '500' },
  historyTime: { fontSize: 12, marginTop: 2 },
  reshareBtn: { padding: 6 },
  instructionsCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  instructionsTitle: { fontSize: 15, fontWeight: '700' },
  instructionsText: { fontSize: 14, lineHeight: 22 },
});
