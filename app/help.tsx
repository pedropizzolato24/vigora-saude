/**
 * app/help.tsx — rota de Ajuda no Stack raiz, acessível ao cuidador sem cair no
 * grupo de abas do monitorado. Mostra botão de voltar (router.back()) que
 * preserva o fluxo de origem. O conteúdo é o mesmo do monitorado
 * (components/help-screen.tsx).
 */
import { useRouter } from 'expo-router';
import { HelpScreen } from '@/components/help-screen';

export default function HelpRootRoute() {
  const router = useRouter();
  return <HelpScreen onBack={() => router.back()} />;
}
