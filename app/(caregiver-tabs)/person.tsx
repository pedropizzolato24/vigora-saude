import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { ScreenContainer } from '@/components/screen-container';
import { useCaregiverContext } from '@/lib/caregiver-context';

export default function CaregiverPersonScreen() {
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;

  if (!linked) {
    return (
      <ScreenContainer>
        <CaregiverEmptyState
          icon="person-add"
          title="Nenhuma pessoa monitorada ainda"
          description="Adicione a pessoa que você cuida para começar a acompanhar."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  // Linked state implemented in Task 10.
  return <ScreenContainer><View /></ScreenContainer>;
}
