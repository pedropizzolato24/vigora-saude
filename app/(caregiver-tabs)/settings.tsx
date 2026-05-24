import { Text, View } from 'react-native';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';

export default function CaregiverSettingsScreen() {
  const colors = useColors();
  return (
    <ScreenContainer>
      <View style={{ flex: 1, padding: 20 }}>
        <Text style={{ color: colors.foreground, fontSize: 24, fontWeight: '800' }}>
          Configurações
        </Text>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          Em construção — conteúdo completo na Task 12.
        </Text>
      </View>
    </ScreenContainer>
  );
}
