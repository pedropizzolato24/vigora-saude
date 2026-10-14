/**
 * management-request-initializer.tsx
 *
 * Do lado do idoso: quando um cuidador pede para cuidar dos alarmes, mostra o
 * AppDialog do pedido (spec 3.2). Montado em app/(tabs)/_layout.tsx.
 *
 * REGRA DESTE ARQUIVO: só os dois botões respondem ao pedido. Tocar fora do
 * diálogo, o botão "voltar" do Android e sair do app NÃO são recusa: o AppDialog
 * chama apenas o onDismiss nesses casos, e aqui o onDismiss é o do hook (só
 * esconde). O pedido continua pendente no servidor e o diálogo volta na próxima
 * abertura.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { usePathname } from 'expo-router';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import * as Auth from '@/lib/_core/auth';
import { useAppContext } from '@/lib/app-context';
import { useAppLock } from '@/lib/app-lock-context';
import {
  acceptedToastText,
  alarmsForAccept,
  caregiverLabel,
  pickRequestToShow,
  requestDialogCopy,
} from '@/lib/managed-alarms-copy';
import { onManagedSyncRequested, requestManagedSync, type MineResponse } from '@/lib/managed-alarms-sync';
import { trpcMutation, trpcQuery } from '@/lib/monitoring-service';
import { shouldResync } from '@/lib/resync-throttle';

/**
 * Espera antes da checagem de abertura, para não colidir com o aviso de
 * "alarmes não confirmados" (aparece 2 s depois do bootstrap, no
 * MonitoringInitializer): dois Modals ao mesmo tempo falham no iOS.
 */
const OPEN_CHECK_DELAY_MS = 3000;

export function ManagementRequestInitializer() {
  const { state } = useAppContext();
  const { status: lockStatus } = useAppLock();
  const pathname = usePathname();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const stateRef = useRef(state);
  stateRef.current = state;
  // Sobre o PIN o Modal (janela nativa) apareceria por cima da tela de bloqueio;
  // sobre o alarme tocando cobriria o botão de desligar.
  const blocked = lockStatus !== 'unlocked' || (pathname ?? '').startsWith('/alarm-ring');
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;
  // Ids de pedido cujo diálogo já apareceu NESTA abertura do app.
  const shownRef = useRef<Set<number>>(new Set());
  const busyRef = useRef(false);
  const lastCheckRef = useRef<number | null>(null);

  const answer = useCallback(
    async (requestId: number, accept: boolean, name: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        // trpcMutation devolve null em toda falha e nunca lança.
        const result = await trpcMutation(
          'managedAlarms.respond',
          accept
            ? { requestId, accept: true, alarms: alarmsForAccept(stateRef.current.alarms) }
            : { requestId, accept: false }
        );
        if (result === null) {
          shownRef.current.delete(requestId); // o pedido continua pendente: volta na próxima abertura
          showDialog({
            title: 'Não deu certo',
            message: accept
              ? 'Não foi possível aceitar agora. Confira a internet e tente de novo. O pedido também pode ter sido cancelado.'
              : 'Não foi possível responder agora. O pedido continua aguardando, e você pode responder depois.',
            variant: 'error',
            buttons: [{ text: 'Entendi' }],
          });
          return;
        }
        if (accept) {
          showToast({ message: acceptedToastText(name), variant: 'success' });
          // Busca a lista já: ela vira a lista local e fecha a edição nas telas.
          requestManagedSync();
        }
      } finally {
        busyRef.current = false;
      }
    },
    [showDialog, showToast]
  );

  const check = useCallback(async () => {
    if (busyRef.current || blockedRef.current) return;
    const user = await Auth.getUserInfo();
    if (!user || user.userType === 'caregiver') return;
    const mine = (await trpcQuery('managedAlarms.mine', null)) as MineResponse | null;
    if (!mine) return; // sem internet: tenta de novo na próxima abertura
    const id = pickRequestToShow({
      pending: mine.pendingRequest,
      shownIds: shownRef.current,
      blocked: blockedRef.current,
    });
    if (id === null || !mine.pendingRequest) return;

    shownRef.current.add(id);
    const name = caregiverLabel(mine.pendingRequest.caregiverName);
    const copy = requestDialogCopy(name);
    showDialog({
      title: copy.title,
      message: copy.message,
      variant: 'confirm',
      buttons: [
        { text: copy.declineLabel, style: 'cancel', onPress: () => void answer(id, false, name) },
        { text: copy.acceptLabel, onPress: () => void answer(id, true, name) },
      ],
    });
  }, [answer, showDialog]);

  // Checagem de abertura (e quando o PIN é destravado ou o alarme termina).
  useEffect(() => {
    if (blocked) return;
    const timer = setTimeout(() => {
      void check();
    }, OPEN_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [blocked, check]);

  // Segundo plano zera os "já mostrados": voltar ao app é uma nova abertura.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background') shownRef.current.clear();
      else if (next === 'active') {
        const now = Date.now();
        if (!shouldResync(lastCheckRef.current, now)) return;
        lastCheckRef.current = now;
        void check();
      }
    });
    return () => sub.remove();
  }, [check]);

  // Toque na notificação do pedido: mostra de novo, mesmo que já tenha aparecido.
  useEffect(() => {
    return onManagedSyncRequested(({ openRequest }) => {
      if (!openRequest) return;
      shownRef.current.clear();
      void check();
    });
  }, [check]);

  return (
    <>
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </>
  );
}
