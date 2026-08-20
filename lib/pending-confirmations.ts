/**
 * pending-confirmations.ts
 *
 * Fila local das respostas do idoso ao alarme que ainda não chegaram ao
 * servidor. Existe porque perder uma confirmação não é um erro cosmético: o
 * `monitoring-job` marca o evento como perdido e manda WhatsApp para a família
 * dizendo que o idoso não respondeu — o pior falso alarme do produto.
 *
 * E perder era fácil. `trpcMutation` nunca lança: devolve `null` sem sessão,
 * em 4xx, em 5xx depois dos retries, e no timeout de 15s. Como os call sites
 * usam `.catch(() => {})`, a falha não aparecia em lugar nenhum — a função
 * "terminava bem" sem nada ter saído do aparelho. Some com `router.replace`
 * logo depois do dismiss e a janela para o app morrer no meio é real.
 *
 * Só entra aqui evidência POSITIVA (o usuário respondeu de fato), então a fila
 * não afrouxa o dead man's switch: ela só impede que uma resposta que existiu
 * seja esquecida.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'vigora_pending_alarm_confirmations';

/**
 * Depois de um dia, reenviar não ajuda mais ninguém: a escalação já aconteceu
 * ou o evento já foi resolvido. O TTL também evita a fila crescer para sempre
 * com uma entrada que o servidor nunca vai aceitar.
 */
const TTL_MS = 24 * 60 * 60 * 1000;

export type ConfirmationStatus = 'responded' | 'missed';

export interface PendingConfirmation {
  alarmId: string;
  /** ISO do disparo canônico — é a chave do evento no servidor, junto do alarmId. */
  scheduledAtIso: string;
  status: ConfirmationStatus;
  queuedAt: number;
}

const keyOf = (c: Pick<PendingConfirmation, 'alarmId' | 'scheduledAtIso'>) =>
  `${c.alarmId}@${c.scheduledAtIso}`;

async function readAll(): Promise<PendingConfirmation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[PendingConfirm] Fila ilegível, começando vazia:', error);
    return [];
  }
}

async function writeAll(entries: PendingConfirmation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('[PendingConfirm] Falha ao gravar a fila:', error);
  }
}

/**
 * Registra a resposta ANTES de tentar a rede. Reconfirmar o mesmo disparo
 * atualiza a entrada em vez de duplicar — o dismiss pode ser reprocessado
 * (tela empilhada, deep link) e a fila não pode virar N reenvios do mesmo
 * evento.
 */
export async function enqueueConfirmation(
  entry: Omit<PendingConfirmation, 'queuedAt'>
): Promise<void> {
  const entries = await readAll();
  const withoutDuplicate = entries.filter((e) => keyOf(e) !== keyOf(entry));
  withoutDuplicate.push({ ...entry, queuedAt: Date.now() });
  await writeAll(withoutDuplicate);
}

/**
 * Chamada quando a confirmação CHEGOU ao servidor (resposta OK). Não é o mesmo
 * que "o evento pendente casou": `monitoring.confirmEvent` responde
 * `{ success: true }` mesmo quando nenhum evento bate com (alarmId,
 * scheduledAt), e o cliente não tem como distinguir. O que a fila garante é
 * entrega, não casamento.
 */
export async function dequeueConfirmation(
  alarmId: string,
  scheduledAtIso: string
): Promise<void> {
  const entries = await readAll();
  await writeAll(entries.filter((e) => keyOf(e) !== keyOf({ alarmId, scheduledAtIso })));
}

/** Pendências ainda úteis de reenviar. Expirados são descartados de vez. */
export async function listPendingConfirmations(): Promise<PendingConfirmation[]> {
  const entries = await readAll();
  const cutoff = Date.now() - TTL_MS;
  const alive = entries.filter((e) => e.queuedAt > cutoff);
  if (alive.length !== entries.length) {
    console.log(`[PendingConfirm] ${entries.length - alive.length} confirmação(ões) expirada(s) descartada(s)`);
    await writeAll(alive);
  }
  return alive;
}
