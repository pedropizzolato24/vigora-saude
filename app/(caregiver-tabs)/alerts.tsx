import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useCaregiverContext } from '@/lib/caregiver-context';

export default function CaregiverAlertsScreen() {
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

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

  // Linked state implemented in Task 11.
  return <ScreenContainer><View /></ScreenContainer>;
}
