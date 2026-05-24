import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { useCaregiverContext } from '@/lib/caregiver-context';

type Filter = 'all' | 'critical' | 'warning';

export default function CaregiverAlertsScreen() {
  const colors = useColors();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const [filter, setFilter] = useState<Filter>('all');

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="notifications-none"
          title="Sem vínculo ativo"
          description="Vincule uma pessoa monitorada para receber alertas."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.filters}>
        {(['all', 'critical', 'warning'] as Filter[]).map((f) => {
          const selected = filter === f;
          const label = f === 'all' ? 'Todos' : f === 'critical' ? 'Críticos' : 'Avisos';
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              style={({ pressed }) => [
                styles.filter,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={[styles.filterText, { color: selected ? '#FFFFFF' : colors.foreground }]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.explainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <MaterialIcons name="info-outline" size={28} color={colors.primary} />
          <Text style={[styles.explainerTitle, { color: colors.foreground }]}>
            Aguardando dados do monitorado
          </Text>
          <Text style={[styles.explainerBody, { color: colors.muted }]}>
            Aqui vão aparecer alertas como medicação perdida, SOS acionado e avisos do dead man's switch.
            A lista fica vazia até a sincronização entre os dois apps estar ativa.
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  filter: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  explainer: { padding: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10 },
  explainerTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  explainerBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
