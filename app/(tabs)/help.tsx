/**
 * app/(tabs)/help.tsx — rota de Ajuda dentro do grupo do monitorado.
 * O conteúdo vive em components/help-screen.tsx (compartilhado com a rota raiz
 * app/help.tsx, usada pelo cuidador).
 */
import { HelpScreen } from '@/components/help-screen';

export default function HelpRoute() {
  return <HelpScreen />;
}
