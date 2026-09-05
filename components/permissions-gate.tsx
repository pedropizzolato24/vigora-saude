import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { getUserInfo } from '@/lib/_core/auth';
import { canInterruptRoute, checkPermissions } from '@/lib/permissions-check';

/**
 * Espera antes de checar as permissões no boot.
 *
 * Não é enfeite: neste intervalo o OnboardingGate resolve o funil
 * (login/onboarding/cadastro) e o _layout decide se um alarme nativo trouxe o
 * app para frente — os dois navegam. Checar antes disso é apostar numa corrida
 * cujo prêmio é a central cobrir a tela do alarme.
 *
 * Também tira o `checkPermissions` da janela mais cara do cold start, que num
 * Samsung A / Moto G é onde o app já sofre.
 */
const ESPERA_MS = 2500;

/**
 * Abre a central de permissões no boot enquanto faltar alguma permissão.
 *
 * Roda UMA vez por sessão do app: enquanto o usuário estiver usando o Vigora,
 * ninguém é interrompido de novo. Mas não guarda "já avisei" em disco — no
 * próximo boot volta a checar, que é o ponto: antes o app pedia uma vez e
 * desistia para sempre.
 */
export function PermissionsGate() {
  const router = useRouter();
  const pathname = usePathname();
  const jaChecou = useRef(false);

  // A checagem roda depois do timer; ler `pathname` da ref garante que ela
  // decida com a rota do MOMENTO da decisão, não com a do agendamento.
  const rotaAtual = useRef(pathname);
  rotaAtual.current = pathname;

  useEffect(() => {
    if (jaChecou.current) return;
    jaChecou.current = true;

    let cancelado = false;
    const timer = setTimeout(async () => {
      try {
        if (cancelado || !canInterruptRoute(rotaAtual.current)) return;

        // Sem perfil definido o usuário ainda está no funil — e nem dá para
        // saber quais permissões cobrar dele.
        const user = await getUserInfo();
        if (cancelado || !user?.userType) return;

        const itens = await checkPermissions(
          user.userType === 'caregiver' ? 'caregiver' : 'monitored',
        );
        if (cancelado || itens.every((p) => p.granted)) return;

        // Re-checa a rota: o await acima pode ter atravessado uma navegação.
        if (!canInterruptRoute(rotaAtual.current)) return;
        router.push('/permissions');
      } catch (e) {
        console.warn('[PermissionsGate] checagem do boot falhou:', e);
      }
    }, ESPERA_MS);

    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [router]);

  return null;
}
