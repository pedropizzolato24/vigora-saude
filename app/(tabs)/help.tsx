/**
 * app/(tabs)/help.tsx — rota de Ajuda dentro do grupo do monitorado.
 * O conteúdo vive em components/help-screen.tsx (compartilhado com a rota raiz
 * app/help.tsx, usada pelo cuidador). Ajuda não está no menu inferior, então
 * recebe o botão de voltar como as demais telas secundárias.
 */
import { useRouter } from 'expo-router';
import { HelpScreen } from '@/components/help-screen';

export default function HelpRoute() {
  const router = useRouter();
  return (
    <HelpScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
    />
  );
}
