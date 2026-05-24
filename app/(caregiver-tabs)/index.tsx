import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useCaregiverContext } from '@/lib/caregiver-context';

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="link"
          title="Vincule uma pessoa monitorada para começar"
          description="Você vai acompanhar a saúde dessa pessoa e receber alertas importantes."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  // Linked state implemented in Task 11.
  return <ScreenContainer><View /></ScreenContainer>;
}
