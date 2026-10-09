# Fase 4 — O cuidador gerencia os alarmes do idoso — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Com o consentimento do idoso, um cuidador cria, edita, desliga e apaga os alarmes dele à distância; o celular do idoso aplica e confirma; e o servidor passa a calcular os disparos de todas as contas, pausando quando o aparelho some.

**Architecture:** Um acordo por idoso (`alarm_management`) e uma lista versionada no servidor (`managed_alarm_lists`) que só o cuidador do acordo grava. O celular do idoso busca a lista (ao abrir, ao voltar, por push silencioso ou visível), agenda, e confirma com `ack`; o dead man's switch só cobra o que foi confirmado. O job do servidor ganha três rotinas antes do Passo 1: pré-registro dos próximos disparos (com uma regra de horários única, compartilhada entre app e servidor, ciente de fuso), pausas (logout, app removido, 48 h sem sinal) e a manutenção do acordo.

**Tech Stack:** React Native 0.81 + Expo 54 + Expo Router 6; tRPC 11 + Zod 4; Drizzle 0.45 + MySQL; Expo Push (tickets e recibos); `expo-task-manager` (nova, só na Tarefa 17); Vitest 3 (`pnpm test`), `pnpm check` (tsc), pnpm 9.12.

**Spec:** `docs/superpowers/specs/2026-10-06-fase-4-cuidador-gerencia-alarmes-design.md`

## Global Constraints

- Texto de UI sempre em português do Brasil; textos de push e diálogos exatamente como na spec e nas tarefas.
- Cores só por token (`useColors()` / `ac.*`), nenhum hex novo; `fontSize` numérico ≥15; alvo de toque ≥44px (≥60px no modo acessível); `AppDialog`/`AppToast`, nunca `Alert.alert()`; toda tela mexida funciona nos modos normal e acessível, claro e escuro; tela nova em `app/` contém `useAccessibility`.
- Imports absolutos via `@/` no app; arquivos kebab-case; nenhum `any` novo; `pnpm check` sem erro novo (só os 5 TS2307 `expo-alarm-countdown` já existentes).
- Toda rota tRPC nova ou alterada valida a entrada com Zod; o idoso alvo de uma rota de cuidador vem do vínculo ativo, nunca do input. Nenhuma permissão Android nova.
- Logs de erro só com nome e código do erro; nenhum nome de remédio ou dado de saúde em log. Notificação ao idoso nunca leva nome de remédio.
- Push que não segura a resposta tRPC (`void promise.catch(log seguro)`).
- No máximo 24 alarmes por conta, somando remédios e check-ins; check-in sempre diário; atraso do check-in ∈ {5, 10, 15, 30}; nome do alarme até 80 caracteres.
- Migração só cria tabelas/colunas (roda sozinha no deploy).
- Toda tabela nova entra na exclusão de conta (`server/db-account.ts`) e na exportação (`userData.export` + `ExportServerData`).
- Nada interpreta métrica de saúde (ANVISA); o servidor nunca faz tocar nem manda mensagem ao idoso quando um alarme deveria tocar.
- Commits em português terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; `git push` depois de cada commit.
- `pnpm install`/`pnpm add` travam nesta máquina: só `CI=true pnpm add …` com timeout; se travar, parar e reportar.

### Procedimento de entrega

```bash
git switch fix/launch-prep && git pull --ff-only
git switch -c fase-4/gerenciamento     # uma vez, antes da Tarefa 1
# cada tarefa: passos → pnpm test && pnpm check → commit → git push
```

Um PR único de `fase-4/gerenciamento` para `fix/launch-prep` no fim (Tarefa 19). A Tarefa 0 roda num branch descartável `spike/push-silencioso` e não é mergeada.

**Ordem de execução:** 1 a 19 na ordem. A Tarefa 0 é do Pedro, em aparelho, e pode correr em paralelo às Tarefas 1 a 16; só a Tarefa 17 espera o resultado dela.

**Anexo:** as notas de quem redigiu cada parte (decisões locais, fatos do código, avisos) estão no fim, em "Anexo — notas dos redatores". Quem executa uma tarefa deve ler a nota da parte dela.

### Desvios da spec (decididos ao escrever o plano)

1. **Sinal do aparelho e pausa em `account_liveness`** (spec 5.5 dizia `user_data`): a tabela já guarda `lastSeenAt`, atualizado pelo heartbeat e usado pelo Passo 1 para separar "não respondeu" de "aparelho sem sinal". Os campos `dmsPausedReason`, `dmsPausedAt` e `pauseNoticeSentAt` ficam ao lado. O fuso fica em `user_data.timezone`, como na spec.
2. **Janela de 2 h numa função nova** (`ensureServerAlarmEvent`) em vez de alterar `createAlarmEvent`, cujos testes dependem da ordem das consultas. O servidor registra só o próximo disparo de cada alarme (um alarme toca no máximo uma vez por dia), como o celular já faz.
3. **"App removido" só pausa quando a verificação diária encontrou `DeviceNotRegistered` e a conta ficou sem nenhum token.** Contar "zero tokens" pausaria todo idoso em versão antiga, que nunca registrou token.
5. **Instalação abandonada pausa em silêncio:** no primeiro ciclo depois do deploy, contas de idoso paradas há mais de 7 dias são pausadas sem aviso ao cuidador (Tarefa 10, Passo 3e); as de 48 h a 7 dias avisam.
6. **Exportação na Tarefa 4** (não na 2), porque usa funções que só existem lá; a exclusão de conta fica na Tarefa 2.
4. **`alarm_changes` ganha `changedByOpenId` e o tipo `created`**, para o registro e o push dizerem quem mudou e incluírem criações (spec 4.2).

## Review Focus

Entradas e condições que a spec deixa implícitas e que mais provavelmente quebram para quem usa o app. Cada uma tem teste na tarefa dona.

1. **Idoso aceita com uma lista antiga e estranha** (item sem id, horário inválido, nome com mais de 80 caracteres, mais de 24 itens): o aceite não pode apagar alarme em silêncio nem travar; descrição é cortada, item ilegível recusa o aceite com mensagem clara. → Tarefa 3 (`sanitizeAcceptedList`) e Tarefa 6 (`respond`).
2. **Celular do idoso fecha o diálogo do pedido tocando fora ou no "voltar"**: isso não pode contar como recusa; o pedido continua pendente e reaparece na próxima abertura. → Tarefa 14.
3. **Agendamento falha para um alarme no meio da aplicação** (Android recusou, iOS sem permissão): os outros seguem, o `ack` só sai depois de terminar e leva a falha em `failedAlarmIds`, o servidor não cobra aquele alarme e o cuidador vê "não conseguiu agendar". → Tarefas 12, 7 e 9.
4. **Fuso do aparelho diferente do fuso guardado** (viagem, fuso ainda nulo): o servidor não pode criar um segundo evento do mesmo disparo e acusar a pessoa à toa. → Tarefa 9 (janela de 120 min) e Tarefa 1 (fusos).
5. **Idoso que nunca abriu a versão nova** (sem token, sem fuso): não é pausado como "app removido", recebe pré-registro só se deu sinal nas últimas 48 h, e o pedido de gerenciamento fica pendente até vencer em 7 dias. → Tarefas 10, 9 e 11.

---

## Tarefa 0: Spike do push silencioso em aparelho (executada por Pedro, sem agente)

**Quem executa:** Pedro, com o Samsung A15 e o iPhone 12. Nenhum agente roda esta tarefa: ela depende de mexer nos dois aparelhos, esperar o relógio e olhar a tela. O código abaixo é **descartável**, vive no branch `spike/push-silencioso` e **nunca é mergeado** nem empurrado (`git push`) para o GitHub.
**Depende de:** nenhuma. Roda antes de qualquer outra tarefa (spec 9.1 e ordem de entrega 1).
**Decide:** se a Tarefa 17 (segundo plano) existe, e em quais plataformas.

**Pergunta que o spike responde** (spec 9.1), em cada aparelho e em cada estado do app (aberto, em segundo plano, fechado, fechado e parado há 30 min):

1. Um push **só de dados** (sem título nem texto) do Expo **chega** ao aparelho?
2. A **tarefa em segundo plano** (`expo-task-manager` + `Notifications.registerTaskAsync`) **roda** sem o usuário abrir o app?
3. Dentro dessa execução, o `scheduleFullAlarm` (o mesmo que o app usa hoje) **agenda um alarme de verdade** que depois **toca** na hora?

**Files (todos só no branch `spike/push-silencioso`):**
- Modify: `package.json` e `pnpm-lock.yaml` (dependência `expo-task-manager`)
- Modify: `app.config.ts` (iOS: `UIBackgroundModes`)
- Modify: `index.ts` (importa a sonda no começo do bundle; a tarefa precisa ser definida no escopo global)
- Create: `lib/spike-push.ts` (a tarefa e as funções da sonda)
- Create: `app/spike-push.tsx` (tela de teste com botões e o registro do que aconteceu)
- Modify: `app/(tabs)/settings.tsx` (um botão de entrada para a tela)
- Na branch de integração: Create `docs/superpowers/plans/2026-10-fase-4-spike-resultado.md` (a tabela preenchida; é a única coisa desta tarefa que vai para o `fase-4/gerenciamento`)

**Interfaces:**
- Consumes: `scheduleFullAlarm`/`cancelFullAlarm` (`lib/alarm-sync.ts`), `getDevicePushToken` (`lib/push-registration.ts`).
- Produces: a tabela de resultados e a regra de decisão da Tarefa 17 (abaixo). Nenhuma assinatura de código.

> Este branch **não roda** `pnpm test` nem `pnpm check`: a sonda quebra de propósito as regras de UI do repositório (cores, modo acessível). Não corrija isso; o branch é jogado fora no fim.

- [ ] **Passo 1: Criar o branch e instalar a dependência**

```bash
cd /d/Pedro/vigora-saude
git switch fix/launch-prep && git pull --ff-only
git switch -c spike/push-silencioso
CI=true timeout 180 pnpm add expo-task-manager@~14.0.0
grep -n "expo-task-manager" package.json
```

Esperado: a última linha mostra `"expo-task-manager": "~14.0.x"`. Se o `pnpm add` travar ou der erro de versão, **pare e avise** (não rode `pnpm install`).

- [ ] **Passo 2: Escrever a sonda**

Criar `lib/spike-push.ts`:

```ts
/**
 * SPIKE DESCARTÁVEL (branch spike/push-silencioso). NUNCA mergear.
 *
 * Mede, em aparelho de verdade, o que o push silencioso consegue fazer:
 * chegar, acordar uma tarefa em segundo plano e agendar um alarme.
 * Nada aqui toca em dado de saúde nem no servidor do Vigora.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { cancelFullAlarm, scheduleFullAlarm } from '@/lib/alarm-sync';
import type { Alarm } from '@/lib/app-context';

export const SPIKE_TASK = 'VIGORA_SPIKE_PUSH_TASK';
const LOG_KEY = 'spike:log';
const ALARMS_KEY = 'spike:alarms';

export type SpikeEntry = {
  at: string;
  where: 'tarefa' | 'primeiro-plano';
  appState: string;
  /** Formato cru do que a tarefa recebeu (a Tarefa 17 precisa saber ler isto). */
  payload: string;
  alarm: 'agendou' | 'falhou' | 'nao-tentou';
  alarmeParaAs?: string;
  erro?: string;
};

export async function readLog(): Promise<SpikeEntry[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(LOG_KEY)) ?? '[]') as SpikeEntry[];
  } catch {
    return [];
  }
}

export async function appendLog(entry: SpikeEntry): Promise<void> {
  const log = await readLog();
  log.unshift(entry);
  await AsyncStorage.setItem(LOG_KEY, JSON.stringify(log.slice(0, 60)));
}

/** Alarme diário de teste para daqui a 3 minutos. O id é UUID (o AlarmKit exige). */
function probeAlarm(): Alarm {
  const d = new Date(Date.now() + 3 * 60_000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return {
    id: Crypto.randomUUID(),
    time: `${hh}:${mm}`,
    description: 'Spike push',
    enabled: true,
    repeat: 'daily',
    sound: true,
    vibration: true,
  };
}

/** Agenda o alarme de teste pelo mesmo caminho do app (scheduleFullAlarm). */
export async function scheduleProbeAlarm(): Promise<{ ok: boolean; time: string; error?: string }> {
  const alarm = probeAlarm();
  try {
    const scheduled = await scheduleFullAlarm(alarm);
    const saved = JSON.parse((await AsyncStorage.getItem(ALARMS_KEY)) ?? '[]') as Alarm[];
    saved.push(scheduled);
    await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(saved));
    return { ok: true, time: alarm.time };
  } catch (e) {
    return { ok: false, time: alarm.time, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Cancela todos os alarmes de teste e zera o registro. */
export async function cleanupProbe(): Promise<number> {
  const saved = JSON.parse((await AsyncStorage.getItem(ALARMS_KEY)) ?? '[]') as Alarm[];
  for (const a of saved) {
    await cancelFullAlarm(a).catch((e) => console.warn('[spike] cancelamento falhou:', e));
  }
  await AsyncStorage.multiRemove([ALARMS_KEY, LOG_KEY]);
  return saved.length;
}

export async function registerSpikeTask(): Promise<string> {
  await Notifications.registerTaskAsync(SPIKE_TASK);
  return TaskManager.isTaskDefined(SPIKE_TASK)
    ? 'Tarefa definida e registrada.'
    : 'ATENÇÃO: a tarefa NÃO está definida (o import em index.ts não rodou).';
}

// A tarefa precisa ser definida no escopo global do módulo (o index.ts importa
// este arquivo no começo do bundle), senão o sistema acorda o app e não acha nada.
TaskManager.defineTask(SPIKE_TASK, async ({ data, error, executionInfo }) => {
  const base = {
    at: new Date().toISOString(),
    where: 'tarefa' as const,
    appState: String((executionInfo as { appState?: string } | undefined)?.appState ?? AppState.currentState),
    payload: JSON.stringify(data ?? null).slice(0, 240),
  };
  if (error) {
    await appendLog({ ...base, alarm: 'nao-tentou', erro: `erro da tarefa: ${String(error)}` });
    return;
  }
  const r = await scheduleProbeAlarm();
  await appendLog({
    ...base,
    alarm: r.ok ? 'agendou' : 'falhou',
    alarmeParaAs: r.time,
    erro: r.error,
  });
  // Prova visível para quem não abre a tela: aparece mesmo com o app fechado.
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Spike: a tarefa rodou',
      body: r.ok ? `Alarme de teste para as ${r.time}` : `O agendamento falhou: ${r.error}`,
    },
    trigger: null,
  });
});
```

Criar `app/spike-push.tsx`:

```tsx
/** SPIKE DESCARTÁVEL. Tela de teste do push silencioso. */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDevicePushToken } from '@/lib/push-registration';
import {
  appendLog,
  cleanupProbe,
  readLog,
  registerSpikeTask,
  scheduleProbeAlarm,
  type SpikeEntry,
} from '@/lib/spike-push';

function Botao({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: '#1E4D8C', padding: 16, borderRadius: 12, minHeight: 56, justifyContent: 'center' }}
    >
      <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>{texto}</Text>
    </Pressable>
  );
}

export default function SpikePushScreen() {
  const insets = useSafeAreaInsets();
  const [aviso, setAviso] = useState('');
  const [token, setToken] = useState('');
  const [log, setLog] = useState<SpikeEntry[]>([]);

  const atualizar = useCallback(async () => setLog(await readLog()), []);

  useEffect(() => {
    atualizar();
    // Controle: com o app ABERTO o push também precisa chegar.
    const sub = Notifications.addNotificationReceivedListener((n) => {
      appendLog({
        at: new Date().toISOString(),
        where: 'primeiro-plano',
        appState: 'active',
        payload: JSON.stringify(n.request.content.data ?? null).slice(0, 240),
        alarm: 'nao-tentou',
      }).then(atualizar);
    });
    return () => sub.remove();
  }, [atualizar]);

  return (
    <ScrollView
      contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, gap: 12, paddingBottom: 60 }}
    >
      <Text style={{ fontSize: 22, fontWeight: '800' }}>Spike do push silencioso</Text>
      <Botao
        texto="1. Registrar a tarefa"
        onPress={async () => setAviso(await registerSpikeTask().catch((e) => `Falhou: ${String(e)}`))}
      />
      <Botao
        texto="2. Mostrar e compartilhar o token"
        onPress={async () => {
          const r = await getDevicePushToken();
          const t = r ? r.token : '';
          setToken(t || 'SEM TOKEN (permissão negada ou sem projectId)');
          if (t) await Share.share({ message: t });
        }}
      />
      <Botao
        texto="3. Controle: agendar alarme de teste agora"
        onPress={async () => {
          const r = await scheduleProbeAlarm();
          setAviso(r.ok ? `Alarme de teste agendado para as ${r.time}.` : `FALHOU: ${r.error}`);
        }}
      />
      <Botao texto="Atualizar o registro" onPress={atualizar} />
      <Botao
        texto="Limpar alarmes de teste e registro"
        onPress={async () => {
          const n = await cleanupProbe();
          setAviso(`${n} alarme(s) de teste cancelado(s).`);
          atualizar();
        }}
      />
      {aviso ? <Text style={{ fontSize: 16 }}>{aviso}</Text> : null}
      {token ? <Text selectable style={{ fontSize: 14 }}>{token}</Text> : null}
      <Text style={{ fontSize: 18, fontWeight: '700', marginTop: 8 }}>Registro ({log.length})</Text>
      {log.map((e, i) => (
        <View key={i} style={{ borderWidth: 1, borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 14 }}>
            {e.at.slice(11, 19)} UTC | {e.where} | app: {e.appState}
          </Text>
          <Text style={{ fontSize: 14 }}>
            alarme: {e.alarm}
            {e.alarmeParaAs ? ` (para as ${e.alarmeParaAs})` : ''}
            {e.erro ? ` | erro: ${e.erro}` : ''}
          </Text>
          <Text style={{ fontSize: 12 }}>{e.payload}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
```

Em `index.ts`, logo depois da linha `import { widgetTaskHandler } from './widgets/widget-task-handler';`, acrescentar:

```ts
import './lib/spike-push'; // SPIKE descartável: define a tarefa no escopo global
```

Em `app/(tabs)/settings.tsx`, **no ramo normal** (o segundo `return`), trocar:

```tsx
        <ProtectAccountBanner />

        {/* ═══ ACCESSIBILITY TOGGLE (always at top, outside any group) ═══ */}
```

por:

```tsx
        <ProtectAccountBanner />

        <Pressable
          onPress={() => router.push('/spike-push' as never)}
          style={{ backgroundColor: '#C96442', padding: 16, borderRadius: 12 }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '700' }}>SPIKE: push silencioso</Text>
        </Pressable>

        {/* ═══ ACCESSIBILITY TOGGLE (always at top, outside any group) ═══ */}
```

Em `app.config.ts`, dentro de `ios.infoPlist`, trocar:

```ts
      "ITSAppUsesNonExemptEncryption": false,
```

por:

```ts
      "ITSAppUsesNonExemptEncryption": false,
      // SPIKE: sem isto o iOS nunca acorda o app com push silencioso.
      "UIBackgroundModes": ["remote-notification"],
```

Depois, commitar (o EAS Build só enxerga o que está commitado) **sem** dar push:

```bash
git add package.json pnpm-lock.yaml app.config.ts index.ts lib/spike-push.ts app/spike-push.tsx "app/(tabs)/settings.tsx"
git commit -m "spike: sonda do push silencioso (descartável, nunca mergear)"
```

- [ ] **Passo 3: Gerar os dois builds**

```bash
pnpm eas:build:preview:android
pnpm eas:build:preview:ios
```

O build `preview` é interno (APK no Android; ad hoc no iOS). Se o iPhone 12 não estiver no perfil de provisionamento, rode antes `eas device:create` e refaça o build. Instalar cada build no aparelho pelo link do EAS. Entre no app com a conta de teste de **idoso** (a tela de Configurações do idoso é a entrada da sonda).

- [ ] **Passo 4: Preparar cada aparelho**

Em cada aparelho: abrir o app, entrar, aceitar **todas** as permissões de notificação e de alarme que o app pedir, e ir em **Configurações → botão laranja "SPIKE: push silencioso"** (com o modo acessível desligado). Apertar:

1. **"1. Registrar a tarefa"**. Esperado: "Tarefa definida e registrada."
2. **"2. Mostrar e compartilhar o token"**: o token (`ExponentPushToken[...]`) aparece e abre o compartilhamento do sistema; mande para você mesmo (WhatsApp, e-mail) e copie no computador.
3. **"3. Controle: agendar alarme de teste agora"**: em ~3 minutos o alarme **tem que tocar**. Isso prova que o `scheduleFullAlarm` funciona neste build. Se não tocar, o resto do spike não vale: anote e pare. Depois aperte "Limpar alarmes de teste e registro".

No **Samsung A15**, anote o estado da bateria do app (**Configurações → Aplicativos → Vigora → Bateria**). A rodada A usa o que estiver (é o que a maioria dos usuários tem); a rodada B repete C3 e C4 com **"Irrestrito"**. No **iPhone 12**, anote a versão do iOS (precisa ser 26 ou mais para o caminho do AlarmKit; abaixo disso o teste mede a notificação agendada).

- [ ] **Passo 5: Enviar os pushes (no computador, Git Bash)**

```bash
TOKEN='ExponentPushToken[COLE_O_TOKEN_AQUI]'
send() {
  curl -s -X POST https://exp.host/--/api/v2/push/send \
    -H 'Content-Type: application/json' \
    -d "{\"to\":\"$TOKEN\",\"data\":{\"type\":\"spike_ping\",\"n\":$1},\"_contentAvailable\":true,\"priority\":\"high\"}"
  echo
}
send 1
```

A resposta traz `"status":"ok"` e um `id` (o recibo). Para conferir se o Expo entregou ao Google/Apple: `curl -s -X POST https://exp.host/--/api/v2/push/getReceipts -H 'Content-Type: application/json' -d '{"ids":["COLE_O_ID"]}'`.

Rode cada cenário abaixo **3 vezes** (`send 1`, `send 2`, `send 3`, esperando 1 minuto entre eles), em cada aparelho. Depois de cada envio, espere 4 minutos e anote o que viu.

| Cenário | Como deixar o app |
|---|---|
| **C1. Aberto** (controle) | App aberto na tela do spike. |
| **C2. Segundo plano** | Abrir o app, apertar Início (ele continua na lista de apps recentes), bloquear a tela. |
| **C3. Fechado** | Abrir a lista de apps recentes e **arrastar o Vigora para fora** (iPhone: deslizar para cima no seletor de apps). Bloquear a tela. |
| **C4. Fechado e parado** | Como C3, mas deixar o aparelho **30 minutos ou mais** bloqueado, sem carregador, sem mexer. Mandar só **2 envios**, com 10 minutos de intervalo. |
| **C5. (só Android) Parada forçada** | Configurações → Aplicativos → Vigora → **Forçar parada**. Informativo: o esperado é **não** chegar; não pesa na decisão. |

O que olhar depois de cada envio:

- **Chegou?** Apareceu a notificação **"Spike: a tarefa rodou"** na tela, sem você abrir o app? (É a prova de que o push chegou e a tarefa rodou.)
- **O alarme tocou na hora?** O texto da notificação diz para que horas é o alarme de teste. Marque se tocou e se tomou a tela.
- Depois, abra o app → spike → "Atualizar o registro". Cada execução da tarefa vira uma linha com `tarefa`, o estado do app (`appState`), `alarme: agendou` ou `falhou` e o formato cru do que a tarefa recebeu.

Entre os cenários, aperte "Limpar alarmes de teste e registro" para não acumular alarmes.

- [ ] **Passo 6: Preencher a tabela de resultados**

Voltar ao branch de integração:

```bash
git switch fix/launch-prep && git pull --ff-only
git switch fase-4/gerenciamento 2>/dev/null || git switch -c fase-4/gerenciamento
```

Criar `docs/superpowers/plans/2026-10-fase-4-spike-resultado.md` (a coluna "_/3" é quantos dos envios deram certo):

```md
# Fase 4: resultado do spike do push silencioso

Data: ____ . Aparelhos: Samsung A15 (Android __, bateria da rodada A: ______) e iPhone 12 (iOS __).

| Aparelho | Cenário | Push chegou e a tarefa rodou | Agendou o alarme | O alarme tocou na hora | Atraso típico | Observações |
|---|---|---|---|---|---|---|
| A15, bateria padrão | C1 aberto | _/3 | _/3 | _/3 | | |
| A15, bateria padrão | C2 segundo plano | _/3 | _/3 | _/3 | | |
| A15, bateria padrão | C3 fechado | _/3 | _/3 | _/3 | | |
| A15, bateria padrão | C4 fechado e parado 30 min | _/2 | _/2 | _/2 | | |
| A15, bateria padrão | C5 parada forçada (informativo) | _/1 | | | | |
| A15, bateria "Irrestrito" | C3 fechado | _/3 | _/3 | _/3 | | |
| A15, bateria "Irrestrito" | C4 fechado e parado 30 min | _/2 | _/2 | _/2 | | |
| iPhone 12 | C1 aberto | _/3 | _/3 | _/3 | | |
| iPhone 12 | C2 segundo plano | _/3 | _/3 | _/3 | | |
| iPhone 12 | C3 fechado | _/3 | _/3 | _/3 | | |
| iPhone 12 | C4 fechado e parado 30 min | _/2 | _/2 | _/2 | | |

Formato cru do que a tarefa recebeu (copie uma linha do registro de cada plataforma):

- Android: `______`
- iOS: `______`

## Decisão para a Tarefa 17

- Android entra: SIM / NÃO
- iOS entra: SIM / NÃO
- Tarefa 17: FAZER (plataformas: ____) / PULAR
```

Commitar só o resultado:

```bash
git add docs/superpowers/plans/2026-10-fase-4-spike-resultado.md
git commit -m "docs(fase4): resultado do spike do push silencioso em aparelho" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Passo 7: Descartar o branch da sonda**

```bash
git branch -D spike/push-silencioso
```

Remover o app de teste dos dois aparelhos (ou reinstalar o build normal depois). O branch nunca foi empurrado, então não há nada para apagar no GitHub.

### Regra de decisão da Tarefa 17

Definições (lidas da tabela, em C3 e C4, que são os estados em que o idoso real fica):

- **P1:** a tarefa roda e a notificação "Spike: a tarefa rodou" aparece sem o app aberto.
- **P2:** na mesma execução o alarme foi agendado **e tocou** na hora (`agendou` + alarme tocou).

Regra padrão (Pedro pode decidir diferente, mas decide por escrito no arquivo de resultado):

| Resultado | Plataforma entra na Tarefa 17? |
|---|---|
| P1 e P2 em C3 em pelo menos 2 de 3 **e** P1 e P2 em C4 em pelo menos 1 de 2 | **Sim** |
| P1 passa, mas P2 falha (a tarefa roda e o sistema recusa agendar de lá) | **Não.** Baixar a lista sem agendar não confirma nada; a reserva visível e a busca ao abrir cobrem |
| P1 só passa em C2 (segundo plano) e falha em C3 | **Não.** Ganho pequeno e imprevisível (no iOS, app fechado à mão nunca recebe push silencioso, por regra da Apple) |
| P1 falha em tudo | **Não** |

Consequências:

1. **Nenhuma plataforma aprovada: pular a Tarefa 17 inteira.** Sem `expo-task-manager`, sem `UIBackgroundModes`. O servidor continua mandando o push de dados `managed_alarms_updated` (ele ainda dispara a busca quando o app está aberto, Tarefa 13) e o push visível de reserva (Tarefa 11) vira o caminho principal para o app fechado. A Tarefa 18 acrescenta a `docs/claude/alarmes.md` que o silencioso não é usado em segundo plano e por quê (a seção 4.3 da spec fica como "visível de reserva").
2. **Só Android aprovado:** a Tarefa 17 registra a tarefa só quando `Platform.OS === 'android'` e **não** acrescenta `UIBackgroundModes` (evita a justificativa extra na revisão da Apple).
3. **Só iOS aprovado:** o inverso: registra só no iOS e acrescenta `UIBackgroundModes: ['remote-notification']`.
4. **As duas aprovadas:** registra nas duas e acrescenta `UIBackgroundModes`.
5. O **formato cru do payload** anotado na tabela é o que a Tarefa 17 usa para ler o tipo do push; mas o tratador de produção deve **ignorar o conteúdo** e só disparar a sincronização (que busca a lista no servidor), então um formato diferente entre plataformas não quebra nada.

---

---

## Tarefa 1: Módulos compartilhados — limites do alarme gerenciado e regra de horários com fuso

**Depende de:** nenhuma (começa a partir de `fase-4/gerenciamento`).

**Files:**
- Create: `shared/managed-alarm.ts` (tipo `ManagedAlarm` e constantes de limites, sem RN/Expo/Node)
- Create: `shared/alarm-schedule.ts` (`firingDays`, `nextFireMs`, `lastFireMs`, `DEFAULT_TIME_ZONE`; só `Intl`, nenhuma dependência nova)
- Modify: `lib/alarm-fire-times.ts` (mantém a API pública atual e passa a delegar para o módulo compartilhado com o fuso do aparelho)
- Test: `tests/alarm-schedule.test.ts` (novo); `tests/alarm-fire-times.test.ts` e `tests/alarm-custom-days-convention.test.ts` **não mudam** e continuam verdes

**Interfaces:**
- Consumes: nada de tarefa anterior. Contrato de comportamento: `lib/alarm-fire-times.ts` atual (cálculo com `Date` local do aparelho).
- Produces:
  - `shared/managed-alarm.ts`: `type ManagedAlarm`, `MANAGED_ALARMS_MAX = 24`, `MANAGED_DESCRIPTION_MAX = 80`, `MANAGEMENT_REQUEST_TTL_DAYS = 7`, `VISIBLE_NOTICE_DELAY_MINUTES = 10`, `PENDING_HINT_HOURS = 12`, `NO_SIGNAL_PAUSE_HOURS = 48`, `SAME_FIRING_WINDOW_MINUTES = 120`.
  - `shared/alarm-schedule.ts`: `DEFAULT_TIME_ZONE = 'America/Sao_Paulo'`; `type ScheduleAlarm = Pick<ManagedAlarm, 'time' | 'enabled' | 'repeat' | 'customDays'>`; `firingDays(alarm: ScheduleAlarm): number[] | 'every'` (0 = domingo .. 6 = sábado); `nextFireMs(alarm: ScheduleAlarm, timeZone: string | null | undefined, now: Date): number | null`; `lastFireMs(alarm: ScheduleAlarm, timeZone: string | null | undefined, now: Date): number | null`. (O contrato fala `timeZone: string`; aceitar `null`/`undefined` é compatível e já cai no fuso padrão.)
  - `lib/alarm-fire-times.ts` segue exportando `firingJsDays`, `weeklyJsDays`, `nextAlarmFireMs`, `lastAlarmFireMs` com as mesmas assinaturas de hoje.

**Por que um cálculo novo e não só mover o código:** o código atual usa `setHours`/`getDay` do `Date` **local**, que só serve a quem roda no fuso do aparelho. O servidor roda em UTC e precisa ler "08:00 de domingo" no fuso da conta. A regra nova calcula a parede do relógio de qualquer fuso IANA só com `Intl.DateTimeFormat`, e foi escrita para dar **exatamente** o resultado antigo quando o fuso é o do aparelho (o teste de paridade abaixo compara os dois em sete fusos, inclusive nas viradas do horário de verão, e em Lord Howe, que muda 30 min).

**Horário de verão — decisão determinística** (a mesma que o `Date` local do JS toma no aparelho): horário que **não existe** (02:30 na primavera de Nova York) dispara adiantado, às 03:30; horário que **existe duas vezes** (01:30 no outono) dispara na primeira. Um dia de calendário é sempre "mesma hora na parede", nunca "+24 h". Uma diferença conhecida e proposital em relação ao código antigo: no dia seguinte a um horário que caiu num pulo, o código antigo carregava o 03:30 adiante (bug), e a regra nova volta a 02:30. Por isso a comparação de paridade usa horas fora de pulos/repetições, e os pulos têm teste próprio com Nova York.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/alarm-schedule.test.ts`:

```ts
/**
 * alarm-schedule.test.ts
 *
 * Regra única de dias e horários (shared/alarm-schedule.ts), ciente de fuso.
 * O app usa o fuso do aparelho; o servidor, o fuso guardado da conta. Aqui:
 *  - o cálculo em fusos diferentes (Brasil, Acre, Nova York com horário de verão);
 *  - dias personalizados atravessando a virada de dia (o instante é sábado em
 *    São Paulo e domingo em UTC — o servidor roda em UTC);
 *  - paridade exata com o comportamento antigo do aparelho (Date local), nos
 *    fusos do mundo, incluindo as viradas do horário de verão.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_TIME_ZONE,
  firingDays,
  lastFireMs,
  nextFireMs,
  type ScheduleAlarm,
} from '../shared/alarm-schedule';
import {
  MANAGED_ALARMS_MAX,
  MANAGED_DESCRIPTION_MAX,
  MANAGEMENT_REQUEST_TTL_DAYS,
  NO_SIGNAL_PAUSE_HOURS,
  PENDING_HINT_HOURS,
  SAME_FIRING_WINDOW_MINUTES,
  VISIBLE_NOTICE_DELAY_MINUTES,
} from '../shared/managed-alarm';

const mk = (over: Partial<ScheduleAlarm> = {}): ScheduleAlarm => ({
  time: '08:00',
  enabled: true,
  repeat: 'daily',
  customDays: [],
  ...over,
});

const z = (iso: string) => new Date(iso);
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

describe('constantes compartilhadas', () => {
  it('têm os valores combinados com o servidor e o app', () => {
    expect(MANAGED_ALARMS_MAX).toBe(24);
    expect(MANAGED_DESCRIPTION_MAX).toBe(80);
    expect(MANAGEMENT_REQUEST_TTL_DAYS).toBe(7);
    expect(VISIBLE_NOTICE_DELAY_MINUTES).toBe(10);
    expect(PENDING_HINT_HOURS).toBe(12);
    expect(NO_SIGNAL_PAUSE_HOURS).toBe(48);
    expect(SAME_FIRING_WINDOW_MINUTES).toBe(120);
    expect(DEFAULT_TIME_ZONE).toBe('America/Sao_Paulo');
  });
});

describe('firingDays — a convenção de dias (0 = domingo) numa fonte só', () => {
  it('daily e repetição desconhecida são diários', () => {
    expect(firingDays(mk({ repeat: 'daily' }))).toBe('every');
    expect(firingDays(mk({ repeat: 'qualquer' as never }))).toBe('every');
  });

  it('weekdays = segunda a sexta; weekends = domingo e sábado', () => {
    expect(firingDays(mk({ repeat: 'weekdays' }))).toEqual([1, 2, 3, 4, 5]);
    expect(firingDays(mk({ repeat: 'weekends' }))).toEqual([0, 6]);
  });

  it('custom usa os dias como estão e descarta o que está fora de 0..6', () => {
    expect(firingDays(mk({ repeat: 'custom', customDays: [0, 3, 6] }))).toEqual([0, 3, 6]);
    expect(firingDays(mk({ repeat: 'custom', customDays: [-1, 7, 2.5, 4] }))).toEqual([4]);
    expect(firingDays(mk({ repeat: 'custom' }))).toEqual([]);
  });
});

describe('entradas sem disparo', () => {
  it('desabilitado, horário ilegível ou fora do relógio: null', () => {
    const now = z('2026-06-24T13:00:00Z');
    for (const over of [{ enabled: false }, { time: 'xx:yy' }, { time: '8' }, { time: '25:00' }, { time: '08:60' }, { time: '' }]) {
      expect(nextFireMs(mk(over), DEFAULT_TIME_ZONE, now), JSON.stringify(over)).toBeNull();
      expect(lastFireMs(mk(over), DEFAULT_TIME_ZONE, now), JSON.stringify(over)).toBeNull();
    }
  });

  it('custom sem dias válidos: null', () => {
    const now = z('2026-06-24T13:00:00Z');
    expect(nextFireMs(mk({ repeat: 'custom', customDays: [] }), DEFAULT_TIME_ZONE, now)).toBeNull();
    expect(lastFireMs(mk({ repeat: 'custom', customDays: [9] }), DEFAULT_TIME_ZONE, now)).toBeNull();
  });

  it('data inválida: null, sem lançar', () => {
    expect(nextFireMs(mk(), DEFAULT_TIME_ZONE, new Date(NaN))).toBeNull();
  });

  it('fuso desconhecido, vazio ou nulo cai em America/Sao_Paulo', () => {
    const now = z('2026-06-24T13:00:00Z');
    const esperado = nextFireMs(mk(), DEFAULT_TIME_ZONE, now);
    expect(nextFireMs(mk(), 'Marte/Olympus', now)).toBe(esperado);
    expect(nextFireMs(mk(), '', now)).toBe(esperado);
    expect(nextFireMs(mk(), null, now)).toBe(esperado);
    expect(lastFireMs(mk(), undefined, now)).toBe(lastFireMs(mk(), DEFAULT_TIME_ZONE, now));
  });
});

describe('America/Sao_Paulo (UTC-3, sem horário de verão)', () => {
  const tz = 'America/Sao_Paulo';
  const now = z('2026-06-24T13:00:00Z'); // 10:00 em São Paulo

  it('diário com a hora já passada hoje: próximo = amanhã, último = hoje', () => {
    expect(iso(nextFireMs(mk({ time: '08:00' }), tz, now))).toBe('2026-06-25T11:00:00.000Z');
    expect(iso(lastFireMs(mk({ time: '08:00' }), tz, now))).toBe('2026-06-24T11:00:00.000Z');
  });

  it('diário com a hora ainda por vir hoje: próximo = hoje, último = ontem', () => {
    expect(iso(nextFireMs(mk({ time: '20:00' }), tz, now))).toBe('2026-06-24T23:00:00.000Z');
    expect(iso(lastFireMs(mk({ time: '20:00' }), tz, now))).toBe('2026-06-23T23:00:00.000Z');
  });

  it('exatamente na hora do alarme: próximo é o de amanhã, último é este', () => {
    const naHora = z('2026-06-24T11:00:00Z'); // 08:00:00 em São Paulo
    expect(iso(nextFireMs(mk({ time: '08:00' }), tz, naHora))).toBe('2026-06-25T11:00:00.000Z');
    expect(iso(lastFireMs(mk({ time: '08:00' }), tz, naHora))).toBe('2026-06-24T11:00:00.000Z');
  });

  it('o "próximo" pré-registrado é o mesmo instante do "último" no disparo', () => {
    const antes = z('2026-06-24T10:59:00Z'); // 07:59
    const depois = z('2026-06-24T11:00:30Z'); // 08:00:30
    expect(nextFireMs(mk(), tz, antes)).toBe(lastFireMs(mk(), tz, depois));
  });

  it('weekdays na sexta à noite pula para a segunda', () => {
    const sexta22h = z('2026-06-27T01:00:00Z'); // sexta 26/06, 22:00 em São Paulo
    expect(iso(nextFireMs(mk({ repeat: 'weekdays' }), tz, sexta22h))).toBe('2026-06-29T11:00:00.000Z'); // segunda 08:00
    expect(iso(lastFireMs(mk({ repeat: 'weekdays' }), tz, sexta22h))).toBe('2026-06-26T11:00:00.000Z'); // sexta 08:00
  });
});

describe('America/Rio_Branco (UTC-5, sem horário de verão)', () => {
  const tz = 'America/Rio_Branco';

  it('08:00 do Acre é 13:00 UTC e 2 h depois do mesmo alarme em São Paulo', () => {
    const now = z('2026-06-24T10:00:00Z'); // 05:00 no Acre, 07:00 em São Paulo
    expect(iso(nextFireMs(mk(), tz, now))).toBe('2026-06-24T13:00:00.000Z');
    expect(iso(nextFireMs(mk(), 'America/Sao_Paulo', now))).toBe('2026-06-24T11:00:00.000Z');
  });

  it('uma hora depois do alarme no Acre ainda é "ontem" para o último', () => {
    const now = z('2026-06-24T12:30:00Z'); // 07:30 no Acre
    expect(iso(lastFireMs(mk(), tz, now))).toBe('2026-06-23T13:00:00.000Z');
    expect(iso(lastFireMs(mk(), 'America/Sao_Paulo', now))).toBe('2026-06-24T11:00:00.000Z');
  });
});

describe('America/New_York atravessando o horário de verão', () => {
  const tz = 'America/New_York';

  it('primavera (08/03/2026): 08:00 é 13:00Z antes da virada e 12:00Z depois, e o dia tem 23 h', () => {
    const sabado15h = z('2026-03-07T20:00:00Z'); // 15:00 EST
    expect(iso(nextFireMs(mk(), tz, sabado15h))).toBe('2026-03-08T12:00:00.000Z'); // 08:00 EDT
    expect(iso(lastFireMs(mk(), tz, sabado15h))).toBe('2026-03-07T13:00:00.000Z'); // 08:00 EST
    const domingo14h = z('2026-03-08T18:00:00Z'); // 14:00 EDT
    expect(iso(lastFireMs(mk(), tz, domingo14h))).toBe('2026-03-08T12:00:00.000Z');
    expect(iso(nextFireMs(mk(), tz, domingo14h))).toBe('2026-03-09T12:00:00.000Z');
  });

  it('outono (01/11/2026): 08:00 é 12:00Z antes da virada e 13:00Z depois, e o dia tem 25 h', () => {
    const sabado15h = z('2026-10-31T19:00:00Z'); // 15:00 EDT
    expect(iso(nextFireMs(mk(), tz, sabado15h))).toBe('2026-11-01T13:00:00.000Z'); // 08:00 EST
    expect(iso(lastFireMs(mk(), tz, sabado15h))).toBe('2026-10-31T12:00:00.000Z'); // 08:00 EDT
  });

  it('hora que não existe (02:30 na virada da primavera) dispara adiantada, às 03:30', () => {
    const meiaNoite = z('2026-03-08T05:00:00Z'); // 00:00 EST
    expect(iso(nextFireMs(mk({ time: '02:30' }), tz, meiaNoite))).toBe('2026-03-08T07:30:00.000Z'); // 03:30 EDT
    // No dia seguinte volta a ser 02:30 de verdade (06:30Z).
    const depois = z('2026-03-08T08:00:00Z'); // 04:00 EDT
    expect(iso(nextFireMs(mk({ time: '02:30' }), tz, depois))).toBe('2026-03-09T06:30:00.000Z');
  });

  it('hora que existe duas vezes (01:30 na virada do outono) dispara na primeira', () => {
    const antes = z('2026-11-01T04:00:00Z'); // 00:00 EDT
    expect(iso(nextFireMs(mk({ time: '01:30' }), tz, antes))).toBe('2026-11-01T05:30:00.000Z'); // 1ª vez: 01:30 EDT
    const depoisDoPrimeiro = z('2026-11-01T05:31:00Z');
    expect(iso(nextFireMs(mk({ time: '01:30' }), tz, depoisDoPrimeiro))).toBe('2026-11-02T06:30:00.000Z'); // 01:30 EST de amanhã
    expect(iso(lastFireMs(mk({ time: '01:30' }), tz, z('2026-11-01T07:00:00Z')))).toBe('2026-11-01T05:30:00.000Z');
  });

  it('weekdays atravessa a virada sem perder um dia', () => {
    const sexta = z('2026-03-06T20:00:00Z'); // sexta 15:00 EST
    // sábado e domingo não contam: segunda 09/03 08:00 EDT = 12:00Z
    expect(iso(nextFireMs(mk({ repeat: 'weekdays' }), tz, sexta))).toBe('2026-03-09T12:00:00.000Z');
  });
});

describe('dias personalizados atravessando a virada de dia', () => {
  it('o mesmo instante é sábado em São Paulo e domingo em UTC: vale o dia do fuso da conta', () => {
    const agora = z('2026-06-28T01:00:00Z'); // sáb 27/06 22:00 em São Paulo; dom 28/06 01:00 em UTC
    const domingo2330 = mk({ time: '23:30', repeat: 'custom', customDays: [0] });
    const sabado2330 = mk({ time: '23:30', repeat: 'custom', customDays: [6] });

    // Domingo 28/06 23:30 em São Paulo = 29/06 02:30Z. Se o servidor usasse o dia UTC,
    // acharia que "domingo" é agora e cobraria o alarme do domingo errado.
    expect(iso(nextFireMs(domingo2330, 'America/Sao_Paulo', agora))).toBe('2026-06-29T02:30:00.000Z');
    // Sábado 27/06 23:30 em São Paulo = 28/06 02:30Z, daqui a 1h30.
    expect(iso(nextFireMs(sabado2330, 'America/Sao_Paulo', agora))).toBe('2026-06-28T02:30:00.000Z');
    // Em UTC o mesmo instante já é domingo: o alarme de domingo 23:30 UTC é hoje.
    expect(iso(nextFireMs(domingo2330, 'UTC', agora))).toBe('2026-06-28T23:30:00.000Z');
  });

  it('o último disparo atravessa a meia-noite: segunda 00:30 em São Paulo, o último de domingo 23:30 foi há 1 h', () => {
    const agora = z('2026-06-29T03:30:00Z'); // seg 29/06 00:30 em São Paulo
    const domingo2330 = mk({ time: '23:30', repeat: 'custom', customDays: [0] });
    expect(iso(lastFireMs(domingo2330, 'America/Sao_Paulo', agora))).toBe('2026-06-29T02:30:00.000Z');
    // Em Tóquio (UTC+9) o mesmo instante já é segunda 12:30; o último domingo 23:30 foi ontem 14:30Z.
    expect(iso(lastFireMs(domingo2330, 'Asia/Tokyo', agora))).toBe('2026-06-28T14:30:00.000Z');
  });

  it('a leste de Greenwich o dia vira antes: domingo 08:00 em Tóquio já é hoje no sábado à noite em São Paulo', () => {
    const agora = z('2026-06-27T20:00:00Z'); // dom 28/06 05:00 em Tóquio; sáb 27/06 17:00 em São Paulo
    const domingo0800 = mk({ time: '08:00', repeat: 'custom', customDays: [0] });
    expect(iso(nextFireMs(domingo0800, 'Asia/Tokyo', agora))).toBe('2026-06-27T23:00:00.000Z');
    expect(iso(nextFireMs(domingo0800, 'America/Sao_Paulo', agora))).toBe('2026-06-28T11:00:00.000Z');
  });

  it('vários dias: escolhe o mais próximo, em qualquer fuso', () => {
    const quartaSabado = mk({ time: '09:00', repeat: 'custom', customDays: [6, 3] });
    // quinta 25/06 10:00 em São Paulo -> próximo sábado 27/06 09:00 = 12:00Z; último quarta 24/06 09:00 = 12:00Z
    const quinta = z('2026-06-25T13:00:00Z');
    expect(iso(nextFireMs(quartaSabado, 'America/Sao_Paulo', quinta))).toBe('2026-06-27T12:00:00.000Z');
    expect(iso(lastFireMs(quartaSabado, 'America/Sao_Paulo', quinta))).toBe('2026-06-24T12:00:00.000Z');
  });
});

/**
 * Paridade com o comportamento ANTIGO do aparelho (cálculo com Date local), que
 * o app continua usando via lib/alarm-fire-times.ts. A cópia abaixo é o código
 * antigo, só como oráculo. Roda em vários fusos trocando o TZ do processo.
 *
 * Fora desta comparação ficam os horários dentro de um pulo ou repetição do
 * relógio (02:30 na primavera de Nova York): o código antigo errava o dia
 * seguinte (levava o 03:30 do pulo adiante), e a regra nova acerta — isso está
 * coberto nos testes de Nova York acima.
 */
describe('paridade com o cálculo antigo (Date local do aparelho)', () => {
  function legacyHM(time: string): [number, number] | null {
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return [h, m];
  }
  function legacyDays(a: ScheduleAlarm): number[] | 'every' {
    switch (a.repeat) {
      case 'weekdays': return [1, 2, 3, 4, 5];
      case 'weekends': return [0, 6];
      case 'custom': return (a.customDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      default: return 'every';
    }
  }
  function legacyNext(a: ScheduleAlarm, now: Date): number | null {
    if (!a.enabled) return null;
    const hm = legacyHM(a.time);
    if (!hm) return null;
    const days = legacyDays(a);
    if (days === 'every') {
      const d = new Date(now);
      d.setHours(hm[0], hm[1], 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d.getTime();
    }
    if (days.length === 0) return null;
    const todayJs = now.getDay();
    return Math.min(
      ...days.map((jsDay) => {
        const d = new Date(now);
        d.setHours(hm[0], hm[1], 0, 0);
        let daysUntil = (jsDay - todayJs + 7) % 7;
        if (daysUntil === 0 && d.getTime() <= now.getTime()) daysUntil = 7;
        d.setDate(d.getDate() + daysUntil);
        return d.getTime();
      })
    );
  }
  function legacyLast(a: ScheduleAlarm, now: Date): number | null {
    if (!a.enabled) return null;
    const hm = legacyHM(a.time);
    if (!hm) return null;
    const days = legacyDays(a);
    if (days === 'every') {
      const d = new Date(now);
      d.setHours(hm[0], hm[1], 0, 0);
      if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
      return d.getTime();
    }
    if (days.length === 0) return null;
    const todayJs = now.getDay();
    return Math.max(
      ...days.map((jsDay) => {
        const d = new Date(now);
        d.setHours(hm[0], hm[1], 0, 0);
        let daysAgo = (todayJs - jsDay + 7) % 7;
        if (daysAgo === 0 && d.getTime() > now.getTime()) daysAgo = 7;
        d.setDate(d.getDate() - daysAgo);
        return d.getTime();
      })
    );
  }

  // Horas fora de qualquer pulo/repetição de relógio dos fusos abaixo.
  const alarms: ScheduleAlarm[] = [
    mk({ time: '08:00' }),
    mk({ time: '23:30' }),
    mk({ time: '12:00', repeat: 'weekdays' }),
    mk({ time: '15:45', repeat: 'weekends' }),
    mk({ time: '09:15', repeat: 'custom', customDays: [0, 3] }),
    mk({ time: '20:00', repeat: 'custom', customDays: [6] }),
  ];

  const ORIGINAL_TZ = process.env.TZ;
  afterEach(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  /** Instantes onde o deslocamento local muda (virada do horário de verão), no ano. */
  function transitionsOf(year: number): number[] {
    const out: number[] = [];
    const step = 30 * 60_000;
    let prev = new Date(Date.UTC(year, 0, 1)).getTimezoneOffset();
    for (let t = Date.UTC(year, 0, 1) + step; t < Date.UTC(year + 1, 0, 1); t += step) {
      const off = new Date(t).getTimezoneOffset();
      if (off !== prev) out.push(t);
      prev = off;
    }
    return out;
  }

  const zones = [
    'America/Sao_Paulo',
    'America/Rio_Branco',
    'America/New_York',
    'Europe/London',
    'Asia/Calcutta',
    'Australia/Lord_Howe',
    'Pacific/Auckland',
  ];

  it.each(zones)('%s: mesmos resultados do Date local em 2026, inclusive nas viradas', (zone) => {
    process.env.TZ = zone;
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone, 'o TZ do processo não foi aplicado').toBe(zone);

    const instants: number[] = [];
    // Varredura do ano inteiro (passo de 6 h 53 min, que não alinha com nenhum horário).
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2027, 0, 1); t += 413 * 60_000) instants.push(t);
    // Varredura fina em volta de cada virada do horário de verão.
    for (const tr of transitionsOf(2026)) {
      for (let t = tr - 30 * 3_600_000; t <= tr + 30 * 3_600_000; t += 17 * 60_000) instants.push(t);
    }

    const diffs: string[] = [];
    for (const t of instants) {
      const now = new Date(t);
      for (const a of alarms) {
        const n = nextFireMs(a, zone, now);
        const l = lastFireMs(a, zone, now);
        if (n !== legacyNext(a, now)) diffs.push(`next ${a.time}/${a.repeat} @ ${now.toISOString()}: ${iso(n)} != ${iso(legacyNext(a, now))}`);
        if (l !== legacyLast(a, now)) diffs.push(`last ${a.time}/${a.repeat} @ ${now.toISOString()}: ${iso(l)} != ${iso(legacyLast(a, now))}`);
        if (diffs.length >= 5) break;
      }
      if (diffs.length >= 5) break;
    }
    expect(diffs).toEqual([]);
  }, 60_000);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/alarm-schedule.test.ts`
Esperado: FAIL, `Failed to resolve import "../shared/alarm-schedule"` (o módulo ainda não existe).

- [ ] **Passo 3: Implementar**

Criar `shared/managed-alarm.ts`:

```ts
/**
 * Tipos e limites da lista de alarmes gerenciada (Fase 4).
 *
 * Módulo PURO (sem React Native, Expo, Node ou banco): é importado pelo servidor
 * e pelo app, para as duas pontas concordarem no formato do alarme e nos limites.
 */

/** Alarme como vive na lista gerenciada: o `Alarm` do app, sem os ids do sistema. */
export type ManagedAlarm = {
  id: string;
  /** "HH:MM", 24 h. */
  time: string;
  description: string;
  enabled: boolean;
  repeat: 'daily' | 'weekdays' | 'weekends' | 'custom';
  /** 0 = domingo .. 6 = sábado; só vale com repeat 'custom'. */
  customDays?: number[];
  sound: boolean;
  vibration: boolean;
  /** Ausente = remédio. */
  kind?: 'medication' | 'checkin';
  /** Só check-in: minutos até o servidor cobrar a resposta. */
  escalateAfterMinutes?: 5 | 10 | 15 | 30;
};

/** Remédios e check-ins somados (o mesmo limite do app: `MAX_ALARMS`). */
export const MANAGED_ALARMS_MAX = 24;
export const MANAGED_DESCRIPTION_MAX = 80;
/** Pedido que o idoso não respondeu vence depois disto. */
export const MANAGEMENT_REQUEST_TTL_DAYS = 7;
/** Sem confirmação do celular depois disto, o servidor manda a notificação visível de reserva. */
export const VISIBLE_NOTICE_DELAY_MINUTES = 10;
/** O cuidador vê "Peça para [nome] abrir o Vigora" depois disto sem confirmação. */
export const PENDING_HINT_HOURS = 12;
/** Sem nenhum sinal do aparelho por este tempo, o servidor pausa os disparos da conta. */
export const NO_SIGNAL_PAUSE_HOURS = 48;
/** Dois eventos do mesmo alarme a menos disto são o mesmo disparo. */
export const SAME_FIRING_WINDOW_MINUTES = 120;
```

Criar `shared/alarm-schedule.ts`:

```ts
import type { ManagedAlarm } from './managed-alarm';

/**
 * Regra ÚNICA de dias e horários dos alarmes, ciente de fuso horário.
 *
 * Importada pelo app (com o fuso do aparelho, via `lib/alarm-fire-times.ts`) e
 * pelo servidor (com o fuso guardado da conta). Módulo PURO: só `Intl`, sem
 * dependência nova, sem React Native e sem Node.
 *
 * A convenção de dias (0 = domingo .. 6 = sábado, a do `getDay()` do JS) mora
 * aqui e em nenhum outro lugar: foi a duplicação dela que fez todo alarme semanal
 * disparar um dia depois.
 *
 * Horário de verão, decidido de forma determinística (o mesmo que o `Date` local
 * do JS faz no aparelho):
 *  - horário que NÃO existe (pulo da primavera, ex.: 02:30 em 08/03/2026 em Nova
 *    York) dispara adiantado, às 03:30;
 *  - horário que existe DUAS vezes (volta do outono, ex.: 01:30) dispara na
 *    primeira vez.
 */

export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

export type ScheduleAlarm = Pick<ManagedAlarm, 'time' | 'enabled' | 'repeat' | 'customDays'>;

const DAY_MS = 86_400_000;

/**
 * Dias (0 = domingo .. 6 = sábado) em que o alarme dispara, ou 'every' (diário;
 * também trata repetição desconhecida como diário). `customDays` pode vir de
 * estado restaurado da nuvem, então dia fora de 0..6 é descartado aqui, uma vez só.
 */
export function firingDays(alarm: ScheduleAlarm): number[] | 'every' {
  switch (alarm.repeat) {
    case 'weekdays':
      return [1, 2, 3, 4, 5];
    case 'weekends':
      return [0, 6];
    case 'custom':
      return (alarm.customDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    default:
      return 'every';
  }
}

function parseHM(time: string): [number, number] | null {
  if (typeof time !== 'string') return null;
  const [h, m] = time.split(':').map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return [h, m];
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Formatador do fuso, ou null se o nome não for um fuso IANA conhecido. */
function formatterFor(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(timeZone, fmt);
    return fmt;
  } catch (err) {
    // Fuso inválido é entrada normal (vem do aparelho/banco): cai no padrão.
    // Qualquer outro erro é bug de verdade e não pode ser engolido.
    if (!(err instanceof RangeError)) throw err;
    return null;
  }
}

/** Parede (ano, mês, dia, hora, minuto, segundo) do instante `ms` no fuso, lida como se fosse UTC. */
function wallAsUtc(fmt: Intl.DateTimeFormat, ms: number): number {
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
}

/** Deslocamento do fuso (ms, positivo a leste de Greenwich) no instante `ms`. */
function offsetAt(fmt: Intl.DateTimeFormat, ms: number): number {
  const whole = Math.floor(ms / 1000) * 1000;
  return wallAsUtc(fmt, whole) - whole;
}

/**
 * Instante em que a parede do fuso marca `year-month-day hour:minute`.
 * Relógio que pula: usa o deslocamento de ANTES da virada (02:30 vira 03:30).
 * Relógio que repete: fica com a primeira ocorrência.
 */
function zonedWallToMs(
  fmt: Intl.DateTimeFormat,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): number {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const before = offsetAt(fmt, asUtc - DAY_MS);
  const after = offsetAt(fmt, asUtc + DAY_MS);
  const valid = [before, after]
    .map((offset) => asUtc - offset)
    .filter((t) => wallAsUtc(fmt, t) === asUtc)
    .sort((a, b) => a - b);
  return valid.length > 0 ? valid[0] : asUtc - before;
}

type Today = { fmt: Intl.DateTimeFormat; year: number; month: number; day: number; weekday: number };

/** O dia de hoje no fuso, para o instante `now`. */
function resolveToday(timeZone: string | null | undefined, now: Date): Today | null {
  if (Number.isNaN(now.getTime())) return null;
  const fmt = formatterFor(timeZone || DEFAULT_TIME_ZONE) ?? formatterFor(DEFAULT_TIME_ZONE);
  if (!fmt) return null;
  const wall = new Date(wallAsUtc(fmt, Math.floor(now.getTime() / 1000) * 1000));
  return {
    fmt,
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    weekday: wall.getUTCDay(),
  };
}

/** `hour:minute` no dia `hoje + offsetDays` (dias de calendário, não blocos de 24 h). */
function atDay(today: Today, offsetDays: number, hm: [number, number]): number {
  const day = new Date(Date.UTC(today.year, today.month - 1, today.day + offsetDays));
  return zonedWallToMs(today.fmt, day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hm[0], hm[1]);
}

/**
 * Próximo disparo futuro (> now) do alarme, em ms epoch, com os dias e a hora
 * lidos no `timeZone`. null se desabilitado, horário ilegível ou sem dias.
 * Fuso desconhecido ou vazio cai em `DEFAULT_TIME_ZONE`.
 */
export function nextFireMs(alarm: ScheduleAlarm, timeZone: string | null | undefined, now: Date): number | null {
  if (!alarm.enabled) return null;
  const hm = parseHM(alarm.time);
  if (!hm) return null;
  const days = firingDays(alarm);
  if (days !== 'every' && days.length === 0) return null;
  const today = resolveToday(timeZone, now);
  if (!today) return null;

  const nowMs = now.getTime();
  const todayAt = atDay(today, 0, hm);
  if (days === 'every') return todayAt > nowMs ? todayAt : atDay(today, 1, hm);

  const times = days.map((jsDay) => {
    let daysUntil = (jsDay - today.weekday + 7) % 7;
    if (daysUntil === 0 && todayAt <= nowMs) daysUntil = 7;
    return daysUntil === 0 ? todayAt : atDay(today, daysUntil, hm);
  });
  return Math.min(...times);
}

/**
 * Disparo mais recente (<= now) do alarme, em ms epoch. É o mesmo instante
 * canônico (HH:MM:00 do dia) que `nextFireMs` devolveu antes do disparo, então o
 * evento idempotente do servidor não duplica.
 */
export function lastFireMs(alarm: ScheduleAlarm, timeZone: string | null | undefined, now: Date): number | null {
  if (!alarm.enabled) return null;
  const hm = parseHM(alarm.time);
  if (!hm) return null;
  const days = firingDays(alarm);
  if (days !== 'every' && days.length === 0) return null;
  const today = resolveToday(timeZone, now);
  if (!today) return null;

  const nowMs = now.getTime();
  const todayAt = atDay(today, 0, hm);
  if (days === 'every') return todayAt <= nowMs ? todayAt : atDay(today, -1, hm);

  const times = days.map((jsDay) => {
    let daysAgo = (today.weekday - jsDay + 7) % 7;
    if (daysAgo === 0 && todayAt > nowMs) daysAgo = 7;
    return daysAgo === 0 ? todayAt : atDay(today, -daysAgo, hm);
  });
  return Math.max(...times);
}
```

Substituir **o arquivo inteiro** `lib/alarm-fire-times.ts` (hoje 102 linhas, cálculo com `Date` local) por:

```ts
import type { Alarm } from './app-context';
import { DEFAULT_TIME_ZONE, firingDays, lastFireMs, nextFireMs } from '@/shared/alarm-schedule';

/**
 * Horário de disparo do alarme (próximo / mais recente), em ms epoch.
 *
 * Usado pela rede de segurança do dead man's switch: o app pré-registra no
 * servidor o PRÓXIMO disparo esperado de cada alarme (assim o servidor sabe que
 * era esperado mesmo se o alarme NÃO tocar — Doze/app morto). No disparo real, o
 * handler usa o disparo MAIS RECENTE — o mesmo timestamp canônico (HH:MM:00 do
 * dia) — então o evento idempotente do servidor não duplica. `now` é injetável
 * para teste.
 *
 * A regra mora em `shared/alarm-schedule.ts` (o servidor usa a mesma, com o fuso
 * da conta). Aqui o fuso é o do aparelho.
 */

/** Fuso do aparelho; sem informação do sistema, o padrão do app. */
function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE;
}

/**
 * Dias JS (getDay: 0=Dom..6=Sáb) em que o alarme dispara, conforme o repeat.
 * 'every' = diário. Fonte ÚNICA da convenção de dias: `shared/alarm-schedule.ts`.
 */
export function firingJsDays(alarm: Alarm): number[] | 'every' {
  return firingDays(alarm);
}

/** Dias semanais do alarme; vazio quando ele não é semanal. */
export function weeklyJsDays(alarm: Alarm): number[] {
  const dias = firingJsDays(alarm);
  return dias === 'every' ? [] : dias;
}

/** Próximo disparo futuro (> now). null se desabilitado/inválido/sem dias. */
export function nextAlarmFireMs(alarm: Alarm, now: Date = new Date()): number | null {
  return nextFireMs(alarm, deviceTimeZone(), now);
}

/** Disparo mais recente (<= now). null se desabilitado/inválido/sem dias. */
export function lastAlarmFireMs(alarm: Alarm, now: Date = new Date()): number | null {
  return lastFireMs(alarm, deviceTimeZone(), now);
}
```

Os seis consumidores (`app/alarm-ring.tsx`, `components/alarm-notification-handler.tsx`, `lib/ios-alarm-kit.ts`, `lib/monitoring-service.ts`, `lib/native-alarm-manager.ts`, `lib/notifications-utils.ts`) continuam importando de `lib/alarm-fire-times` sem mudar uma linha: a API pública é a mesma.

- [ ] **Passo 4: Rodar e ver passar**

```bash
pnpm vitest run tests/alarm-schedule.test.ts tests/alarm-fire-times.test.ts tests/alarm-custom-days-convention.test.ts
```

Esperado: PASS nos três arquivos. Os dois testes antigos passam **sem nenhuma edição**: `alarm-fire-times.test.ts` exercita `nextAlarmFireMs`/`lastAlarmFireMs` no fuso do aparelho (agora via o módulo compartilhado) e `alarm-custom-days-convention.test.ts` trava a convenção 0 = domingo nos dois agendadores. Se a paridade falhar num fuso, a mensagem lista os primeiros instantes que divergem (`next 08:00/daily @ ...`); corrija em `shared/alarm-schedule.ts`, não relaxe o teste.

> O teste de paridade troca `process.env.TZ` dentro do processo (funciona no Node de Windows e de Linux, e o teste confere que o TZ foi aplicado). Ele roda em segundos; se um dia o seu ambiente não aplicar o TZ, a falha diz isso explicitamente.

- [ ] **Passo 5: Suíte, tipos e commit**

```bash
pnpm test && pnpm check
```

(só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add shared/managed-alarm.ts shared/alarm-schedule.ts lib/alarm-fire-times.ts tests/alarm-schedule.test.ts
git commit -m "feat(alarmes): regra de horários compartilhada com fuso (shared/alarm-schedule) e limites do alarme gerenciado" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 2: Migração 0017, schema e exclusão de conta

**Depende de:** Tarefa 1 (só pela ordem do branch; esta tarefa não importa nada do `shared/`).

**Files:**
- Modify: `drizzle/schema.ts` (coluna `user_data.timezone`; três colunas de pausa em `account_liveness`; `alarm_changes.changedByOpenId` e o valor `created`; tabelas novas `alarm_management` e `managed_alarm_lists`)
- Create: `drizzle/0017_fase4_gerenciamento.sql`, `drizzle/meta/0017_snapshot.json` (gerados) e entrada `idx 17` em `drizzle/meta/_journal.json` (gerada)
- Modify: `server/db-account.ts` (`deleteAccountData` apaga o acordo e a lista gerenciada)
- Modify: `lib/caregiver-format.ts` (`alarmChangeTitle` aceita o tipo `created`; ver "Por que esta tarefa mexe no formatador do cuidador")
- Test: `tests/fase4-migration.test.ts` (novo), `tests/account-deletion-managed.test.ts` (novo), `tests/caregiver-format.test.ts` (acrescentar um caso)

**Interfaces:**
- Consumes: o schema atual (`alarmChanges`, `accountLiveness`, `userData`) e `deleteAccountData(openId)`.
- Produces (`drizzle/schema.ts`):
  - `alarmManagement` / `AlarmManagementRow` / `InsertAlarmManagement`: `id`, `monitoredOpenId`, `caregiverOpenId`, `status` (`'pending' | 'active' | 'ended'`), `endedReason` (`'declined' | 'expired' | 'cancelled' | 'stopped_by_monitored' | 'stopped_by_caregiver' | 'unlinked' | 'account_deleted'`, nulo), `requestedAt`, `respondedAt` (nulo), `endedAt` (nulo); índices `alarm_management_monitored_idx` e `alarm_management_caregiver_idx`.
  - `managedAlarmLists` / `ManagedAlarmListRow` / `InsertManagedAlarmList`: `id`, `monitoredOpenId` (único), `version`, `alarms`, `appliedVersion` (padrão 0), `appliedAlarms`, `failedAlarmIds`, `appliedAt` (nulo), `updatedByOpenId`, `updatedAt` (atualiza sozinho), `visibleNoticeSentForVersion` (padrão 0).
  - `userData.timezone` (`varchar(64)`, nulo); `accountLiveness.dmsPausedReason` (`'logged_out' | 'app_removed' | 'no_signal'`, nulo), `dmsPausedAt` e `pauseNoticeSentAt` (nulos); `alarmChanges.changedByOpenId` (`varchar(64)`, nulo) e `alarmChanges.changeType` com o valor extra `'created'`.
  - `deleteAccountData` passa a apagar `alarm_management` (como idoso e como cuidador) e `managed_alarm_lists`.

**Onde fica a exportação (LGPD Art. 18, V):** o contrato lista a exportação aqui, mas ela precisa de `getManagementHistory` e `getManagedList`, que só existem depois da Tarefa 4. A exportação (`userData.export` e `ExportServerData`) é ligada no **Passo 3c da Tarefa 4**, que é quando as duas funções passam a existir. O par exclusão/exportação fica completo ao fim da Tarefa 4.

**Por que esta tarefa mexe no formatador do cuidador:** o tipo das mudanças que `link.getMonitoredAlerts` devolve vem do enum do schema. Ao acrescentar `'created'` ao enum, `app/(caregiver-tabs)/alerts.tsx` passa a chamar `alarmChangeTitle` com um tipo que a função ainda não aceita, e o `pnpm check` ganharia um erro novo (TS2345). A correção mínima é a função aceitar `created` com o texto definitivo (`Criou "Losartana" (08:00)`). A Tarefa 16 troca a função inteira por uma que também diz quem mudou; o texto de `created` sem autor é o mesmo, então o teste daqui continua valendo.

**Decisões do schema:**
- `'created'` entra no **fim** do enum de `changeType`. No MySQL, acrescentar valor no fim é só metadado (não reescreve a tabela e não remapeia as linhas antigas); no começo ou no meio, reescreveria. É o único `MODIFY COLUMN` da migração.
- Todas as colunas novas em tabelas existentes são **nulas**: linhas antigas continuam válidas e o deploy não precisa preencher nada.
- Os campos de pausa ficam em `account_liveness` (onde já mora o `lastSeenAt` que o Passo 1 do job usa), não em `user_data` (desvio 1 do cabeçalho do plano).

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/fase4-migration.test.ts`:

```ts
/**
 * fase4-migration.test.ts
 *
 * A migração 0017 roda sozinha no deploy (runPendingMigrations), antes do servidor
 * aceitar tráfego. Por isso ela só pode ADICIONAR: tabelas, índices, colunas — e
 * um único alargamento de enum (alarm_changes.changeType ganha 'created', no
 * fim da lista, o que no MySQL não reescreve a tabela). Nada que apague, renomeie
 * ou reescreva dado existente.
 *
 * Também trava que o schema do Drizzle, o SQL, o journal e o snapshot contam a
 * mesma história (um deploy com schema divergente derrubou o monitoramento por
 * 27 h em julho/2026).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accountLiveness,
  alarmChanges,
  alarmManagement,
  managedAlarmLists,
  userData,
} from "../drizzle/schema";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

const SQL = read("drizzle/0017_fase4_gerenciamento.sql");
const statements = SQL.split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

describe("0017_fase4_gerenciamento.sql — só adiciona", () => {
  it("todo comando é CREATE TABLE, CREATE INDEX, ADD de coluna ou o único MODIFY COLUMN", () => {
    for (const s of statements) {
      expect(
        /^(CREATE TABLE `\w+` \(|CREATE INDEX `\w+` ON `\w+`|ALTER TABLE `\w+` ADD `\w+` |ALTER TABLE `\w+` MODIFY COLUMN `\w+` enum)/.test(
          s,
        ),
        s.slice(0, 80),
      ).toBe(true);
    }
  });

  it("não apaga, renomeia nem reescreve nada", () => {
    expect(SQL).not.toMatch(/\bDROP\b/i);
    expect(SQL).not.toMatch(/\bDELETE\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
    expect(SQL).not.toMatch(/\bRENAME\b/i);
    expect(SQL).not.toMatch(/\bUPDATE\s+`/i);
    expect(SQL).not.toMatch(/\bCHANGE\s+`/i);
  });

  it("tem exatamente um MODIFY COLUMN: o enum alarm_changes.changeType, sem perder valor e com 'created'", () => {
    const modifies = statements.filter((s) => /MODIFY COLUMN/i.test(s));
    expect(modifies).toHaveLength(1);
    expect(modifies[0]).toBe(
      "ALTER TABLE `alarm_changes` MODIFY COLUMN `changeType` enum('deleted','disabled','rescheduled','created') NOT NULL;",
    );
  });

  it("cria as duas tabelas novas e os índices do acordo", () => {
    expect(SQL).toMatch(/CREATE TABLE `alarm_management`/);
    expect(SQL).toMatch(/CREATE TABLE `managed_alarm_lists`/);
    expect(SQL).toMatch(/managed_alarm_lists_monitoredOpenId_unique` UNIQUE\(`monitoredOpenId`\)/);
    expect(SQL).toMatch(/CREATE INDEX `alarm_management_monitored_idx` ON `alarm_management` \(`monitoredOpenId`\)/);
    expect(SQL).toMatch(/CREATE INDEX `alarm_management_caregiver_idx` ON `alarm_management` \(`caregiverOpenId`\)/);
  });

  it("acrescenta as colunas novas, todas anuláveis (linhas antigas continuam válidas)", () => {
    for (const col of [
      "ALTER TABLE `user_data` ADD `timezone` varchar(64);",
      "ALTER TABLE `account_liveness` ADD `dmsPausedReason` enum('logged_out','app_removed','no_signal');",
      "ALTER TABLE `account_liveness` ADD `dmsPausedAt` timestamp;",
      "ALTER TABLE `account_liveness` ADD `pauseNoticeSentAt` timestamp;",
      "ALTER TABLE `alarm_changes` ADD `changedByOpenId` varchar(64);",
    ]) {
      expect(SQL).toContain(col);
    }
  });
});

describe("schema, journal e snapshot contam a mesma história", () => {
  it("o schema do Drizzle tem as tabelas e colunas do contrato", () => {
    expect(Object.keys(getTableColumns(alarmManagement)).sort()).toEqual(
      [
        "caregiverOpenId",
        "endedAt",
        "endedReason",
        "id",
        "monitoredOpenId",
        "requestedAt",
        "respondedAt",
        "status",
      ].sort(),
    );
    expect(Object.keys(getTableColumns(managedAlarmLists)).sort()).toEqual(
      [
        "alarms",
        "appliedAlarms",
        "appliedAt",
        "appliedVersion",
        "failedAlarmIds",
        "id",
        "monitoredOpenId",
        "updatedAt",
        "updatedByOpenId",
        "version",
        "visibleNoticeSentForVersion",
      ].sort(),
    );
    expect(userData.timezone.notNull).toBe(false);
    expect(accountLiveness.dmsPausedReason.enumValues).toEqual(["logged_out", "app_removed", "no_signal"]);
    expect(accountLiveness.dmsPausedAt.notNull).toBe(false);
    expect(accountLiveness.pauseNoticeSentAt.notNull).toBe(false);
    expect(alarmChanges.changedByOpenId.notNull).toBe(false);
    expect(alarmChanges.changeType.enumValues).toEqual(["deleted", "disabled", "rescheduled", "created"]);
    expect(alarmManagement.status.enumValues).toEqual(["pending", "active", "ended"]);
    expect(alarmManagement.endedReason.enumValues).toEqual([
      "declined",
      "expired",
      "cancelled",
      "stopped_by_monitored",
      "stopped_by_caregiver",
      "unlinked",
      "account_deleted",
    ]);
  });

  it("o journal registra a 0017 logo depois da 0016", () => {
    const journal = JSON.parse(read("drizzle/meta/_journal.json")) as {
      entries: Array<{ idx: number; tag: string; breakpoints: boolean }>;
    };
    expect(journal.entries[16].tag).toBe("0016_alarm_events_kind_grace");
    expect(journal.entries[17]).toMatchObject({
      idx: 17,
      tag: "0017_fase4_gerenciamento",
      breakpoints: true,
    });
  });

  it("o snapshot da 0017 encadeia na 0016 e inclui as tabelas novas", () => {
    const s16 = JSON.parse(read("drizzle/meta/0016_snapshot.json")) as { id: string };
    const s17 = JSON.parse(read("drizzle/meta/0017_snapshot.json")) as {
      prevId: string;
      tables: Record<string, { columns: Record<string, unknown> }>;
    };
    expect(s17.prevId).toBe(s16.id);
    expect(Object.keys(s17.tables)).toEqual(expect.arrayContaining(["alarm_management", "managed_alarm_lists"]));
    expect(s17.tables["user_data"].columns).toHaveProperty("timezone");
    expect(s17.tables["alarm_changes"].columns).toHaveProperty("changedByOpenId");
    expect(s17.tables["account_liveness"].columns).toHaveProperty("dmsPausedReason");
  });
});
```

Criar `tests/account-deletion-managed.test.ts`:

```ts
/**
 * account-deletion-managed.test.ts
 *
 * Exclusão de conta (LGPD Art. 18, VI) com as tabelas da Fase 4. Roda
 * deleteAccountData contra uma transação falsa e confere QUAIS tabelas são
 * apagadas e com que filtro:
 *  - o acordo (alarm_management) sai da conta como idoso E como cuidador;
 *  - a lista gerenciada sai com o idoso;
 *  - se quem apaga a conta é a CUIDADORA de um acordo ativo, a lista gerenciada do
 *    idoso também sai (senão fica órfã e o servidor segue cobrando os alarmes);
 *  - a linha de `users` continua sendo a ÚLTIMA (derruba as sessões).
 */
import { getTableName } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dialect = new MySqlDialect();
let activeManaged: Array<{ monitoredOpenId: string }> = [];
const deletes: Array<{ table: string; sql: string; params: unknown[] }> = [];

const tx = {
  select: () => {
    const chain: any = {
      from: () => chain,
      where: () => Promise.resolve(activeManaged),
    };
    return chain;
  },
  delete: (table: any) => ({
    where: (condition: any) => {
      const query = dialect.sqlToQuery(condition);
      deletes.push({ table: getTableName(table), sql: query.sql, params: query.params });
      return Promise.resolve();
    },
  }),
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => ({ transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx) })),
  getUserByOpenId: vi.fn(async () => undefined),
}));

import { deleteAccountData } from "../server/db-account";

const deleteOf = (table: string) => deletes.find((d) => d.table === table);

beforeEach(() => {
  activeManaged = [];
  deletes.length = 0;
});

describe("deleteAccountData — acordo e lista gerenciada", () => {
  it("apaga o acordo da conta como idoso E como cuidador", async () => {
    await deleteAccountData("maria");

    const acordo = deleteOf("alarm_management");
    expect(acordo).toBeDefined();
    expect(acordo!.sql).toContain("monitoredOpenId");
    expect(acordo!.sql).toContain("caregiverOpenId");
    expect(acordo!.params).toEqual(["maria", "maria"]);
  });

  it("apaga a lista gerenciada da própria conta", async () => {
    await deleteAccountData("maria");

    const lista = deleteOf("managed_alarm_lists");
    expect(lista).toBeDefined();
    expect(lista!.sql).toContain("monitoredOpenId");
    expect(lista!.params).toEqual(["maria"]);
  });

  it("cuidadora com acordo ativo: a lista do idoso que ela gerenciava sai junto", async () => {
    activeManaged = [{ monitoredOpenId: "maria" }];

    await deleteAccountData("ana");

    expect(deleteOf("managed_alarm_lists")!.params).toEqual(["ana", "maria"]);
    expect(deleteOf("alarm_management")!.params).toEqual(["ana", "ana"]);
  });

  it("a lista é apagada ANTES do acordo (a consulta do acordo ativo precisa ainda existir)", async () => {
    await deleteAccountData("ana");

    const order = deletes.map((d) => d.table);
    expect(order.indexOf("managed_alarm_lists")).toBeLessThan(order.indexOf("alarm_management"));
  });

  it("a linha de users continua sendo a última", async () => {
    await deleteAccountData("maria");

    expect(deletes[deletes.length - 1].table).toBe("users");
    expect(deletes.map((d) => d.table)).toEqual(
      expect.arrayContaining([
        "account_liveness",
        "alarm_events",
        "alarm_changes",
        "warning_log",
        "alarm_management",
        "managed_alarm_lists",
        "user_data",
        "push_tokens",
        "caregiver_links",
      ]),
    );
  });
});
```

Em `tests/caregiver-format.test.ts`, dentro do `describe('alarmChangeTitle', ...)`, logo depois do teste `it('excluído', ...)`, acrescentar:

```ts
  it('criado (tipo novo da Fase 4: um cuidador com o acordo de gerenciamento cria o lembrete)', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'created', oldTime: null, newTime: '08:00' })).toBe(
      'Criou "Losartana" (08:00)'
    );
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/fase4-migration.test.ts tests/account-deletion-managed.test.ts tests/caregiver-format.test.ts`
Esperado: FAIL. `fase4-migration.test.ts` com `ENOENT ... 0017_fase4_gerenciamento.sql` (o arquivo ainda não existe); `account-deletion-managed.test.ts` com `expect(acordo).toBeDefined()` recebendo `undefined` (a exclusão ainda não toca as tabelas novas); `caregiver-format.test.ts` com `Mudou os dias de "Losartana"` no lugar de `Criou "Losartana" (08:00)` (o tipo `created` cai no `default`).

- [ ] **Passo 3: Implementar**

**3a. `drizzle/schema.ts`**, quatro edições.

(1) Em `userData`, trocar

```ts
  /** Client-supplied epoch-ms of the last local data change. Drives last-write-wins. */
  dataUpdatedAt: bigint("dataUpdatedAt", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserData = typeof userData.$inferSelect;
```

por

```ts
  /** Client-supplied epoch-ms of the last local data change. Drives last-write-wins. */
  dataUpdatedAt: bigint("dataUpdatedAt", { mode: "number" }).notNull().default(0),
  /**
   * Fuso IANA do aparelho (ex.: "America/Rio_Branco"), enviado pelo app em todo
   * `userData.put`. O servidor lê os dias e horários dos alarmes neste fuso
   * (shared/alarm-schedule.ts). Nulo = ainda desconhecido → America/Sao_Paulo.
   */
  timezone: varchar("timezone", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserData = typeof userData.$inferSelect;
```

(2) Em `accountLiveness`, trocar

```ts
  batteryExempt: boolean("batteryExempt"),
});

export type AccountLiveness
```

por

```ts
  batteryExempt: boolean("batteryExempt"),
  // Pausa do dead man's switch (Fase 4): o servidor deixa de pré-registrar e
  // cobrar disparos da conta quando o aparelho saiu da conta ('logged_out'), o
  // app foi removido ('app_removed') ou ficou 48 h sem sinal ('no_signal').
  // Qualquer sinal do aparelho limpa os três campos (touchLiveness/recordHeartbeat).
  dmsPausedReason: mysqlEnum("dmsPausedReason", ["logged_out", "app_removed", "no_signal"]),
  dmsPausedAt: timestamp("dmsPausedAt"),
  /** Quando os cuidadores foram avisados desta pausa (um aviso por pausa). */
  pauseNoticeSentAt: timestamp("pauseNoticeSentAt"),
});

export type AccountLiveness
```

(3) Em `alarmChanges` **e logo depois dele**, trocar

```ts
    changeType: mysqlEnum("changeType", ["deleted", "disabled", "rescheduled"]).notNull(),
    oldTime: varchar("oldTime", { length: 5 }),
    newTime: varchar("newTime", { length: 5 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("alarm_changes_openid_idx").on(t.openId)]
);

export type AlarmChangeRow = typeof alarmChanges.$inferSelect;
export type InsertAlarmChange = typeof alarmChanges.$inferInsert;
```

por (o bloco abaixo também inclui as duas tabelas novas, em seguida a `InsertAlarmChange`)

```ts
    // 'created' fica por ÚLTIMO de propósito: acrescentar no fim do enum é só
    // metadado no MySQL (não reescreve a tabela nem remapeia as linhas antigas).
    changeType: mysqlEnum("changeType", ["deleted", "disabled", "rescheduled", "created"]).notNull(),
    oldTime: varchar("oldTime", { length: 5 }),
    newTime: varchar("newTime", { length: 5 }),
    /** Quem fez a mudança. Nulo = o próprio dono da conta (o diff do backup). */
    changedByOpenId: varchar("changedByOpenId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("alarm_changes_openid_idx").on(t.openId)]
);

export type AlarmChangeRow = typeof alarmChanges.$inferSelect;
export type InsertAlarmChange = typeof alarmChanges.$inferInsert;

// -----------------------------------------------------------------------------
// Alarm Management - o acordo "o cuidador cuida dos alarmes do idoso" (Fase 4)
// -----------------------------------------------------------------------------

/**
 * Uma linha por pedido. Só pode existir UM `pending` ou `active` por idoso
 * (garantido em transação em server/db-alarm-management.ts). O histórico nunca
 * é apagado enquanto a conta existir: é a prova do consentimento do idoso
 * (LGPD Art. 8) — `respondedAt` é o aceite ou a recusa. Entra na exclusão de
 * conta (como idoso e como cuidador) e na exportação.
 */
export const alarmManagement = mysqlTable(
  "alarm_management",
  {
    id: int("id").autoincrement().primaryKey(),
    monitoredOpenId: varchar("monitoredOpenId", { length: 64 }).notNull(),
    /** Quem pediu (e, se aceito, quem gerencia). */
    caregiverOpenId: varchar("caregiverOpenId", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "active", "ended"]).notNull(),
    endedReason: mysqlEnum("endedReason", [
      "declined",
      "expired",
      "cancelled",
      "stopped_by_monitored",
      "stopped_by_caregiver",
      "unlinked",
      "account_deleted",
    ]),
    requestedAt: timestamp("requestedAt").defaultNow().notNull(),
    respondedAt: timestamp("respondedAt"),
    endedAt: timestamp("endedAt"),
  },
  (t) => [
    index("alarm_management_monitored_idx").on(t.monitoredOpenId),
    index("alarm_management_caregiver_idx").on(t.caregiverOpenId),
  ]
);

export type AlarmManagementRow = typeof alarmManagement.$inferSelect;
export type InsertAlarmManagement = typeof alarmManagement.$inferInsert;

// -----------------------------------------------------------------------------
// Managed Alarm Lists - a lista versionada que só o cuidador do acordo grava
// -----------------------------------------------------------------------------

/**
 * Uma linha por idoso com acordo ativo (apagada quando o acordo termina; a lista
 * no celular continua e volta a ser do idoso). `alarms` é a lista do cuidador na
 * `version` atual; `appliedAlarms` é a lista da `appliedVersion`, a última que o
 * celular confirmou ter agendado — é DELA que o servidor calcula os disparos,
 * menos `failedAlarmIds`. Formato dos alarmes: `ManagedAlarm` (shared/managed-alarm.ts).
 */
export const managedAlarmLists = mysqlTable("managed_alarm_lists", {
  id: int("id").autoincrement().primaryKey(),
  monitoredOpenId: varchar("monitoredOpenId", { length: 64 }).notNull().unique(),
  /** Sobe a cada gravação do cuidador. */
  version: int("version").notNull(),
  alarms: json("alarms").$type<unknown[]>().notNull(),
  appliedVersion: int("appliedVersion").notNull().default(0),
  appliedAlarms: json("appliedAlarms").$type<unknown[]>().notNull(),
  failedAlarmIds: json("failedAlarmIds").$type<string[]>().notNull(),
  appliedAt: timestamp("appliedAt"),
  updatedByOpenId: varchar("updatedByOpenId", { length: 64 }).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  /** Controla a notificação visível de reserva (uma por versão). */
  visibleNoticeSentForVersion: int("visibleNoticeSentForVersion").notNull().default(0),
});

export type ManagedAlarmListRow = typeof managedAlarmLists.$inferSelect;
export type InsertManagedAlarmList = typeof managedAlarmLists.$inferInsert;
```

**3b. Gerar a migração (offline, não conecta em banco nenhum).**

```bash
DATABASE_URL=mysql://u:p@localhost:3306/x pnpm drizzle-kit generate --name fase4_gerenciamento
```

(O `DATABASE_URL` é só para o `drizzle.config.ts` não reclamar; o comando `generate` compara o schema com o último snapshot e não abre conexão.) Isto cria `drizzle/0017_fase4_gerenciamento.sql`, `drizzle/meta/0017_snapshot.json` e a entrada `idx 17` no `_journal.json`. O SQL gerado tem de ser **exatamente** este (a ordem dos comandos é a do Drizzle; confira que não saiu nenhum `DROP`, nenhum `0018` e nenhum outro `MODIFY COLUMN`):

```sql
CREATE TABLE `alarm_management` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredOpenId` varchar(64) NOT NULL,
	`caregiverOpenId` varchar(64) NOT NULL,
	`status` enum('pending','active','ended') NOT NULL,
	`endedReason` enum('declined','expired','cancelled','stopped_by_monitored','stopped_by_caregiver','unlinked','account_deleted'),
	`requestedAt` timestamp NOT NULL DEFAULT (now()),
	`respondedAt` timestamp,
	`endedAt` timestamp,
	CONSTRAINT `alarm_management_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `managed_alarm_lists` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoredOpenId` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`alarms` json NOT NULL,
	`appliedVersion` int NOT NULL DEFAULT 0,
	`appliedAlarms` json NOT NULL,
	`failedAlarmIds` json NOT NULL,
	`appliedAt` timestamp,
	`updatedByOpenId` varchar(64) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`visibleNoticeSentForVersion` int NOT NULL DEFAULT 0,
	CONSTRAINT `managed_alarm_lists_id` PRIMARY KEY(`id`),
	CONSTRAINT `managed_alarm_lists_monitoredOpenId_unique` UNIQUE(`monitoredOpenId`)
);
--> statement-breakpoint
ALTER TABLE `alarm_changes` MODIFY COLUMN `changeType` enum('deleted','disabled','rescheduled','created') NOT NULL;--> statement-breakpoint
ALTER TABLE `account_liveness` ADD `dmsPausedReason` enum('logged_out','app_removed','no_signal');--> statement-breakpoint
ALTER TABLE `account_liveness` ADD `dmsPausedAt` timestamp;--> statement-breakpoint
ALTER TABLE `account_liveness` ADD `pauseNoticeSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `alarm_changes` ADD `changedByOpenId` varchar(64);--> statement-breakpoint
ALTER TABLE `user_data` ADD `timezone` varchar(64);--> statement-breakpoint
CREATE INDEX `alarm_management_monitored_idx` ON `alarm_management` (`monitoredOpenId`);--> statement-breakpoint
CREATE INDEX `alarm_management_caregiver_idx` ON `alarm_management` (`caregiverOpenId`);
```

Se o `generate` falhar neste ambiente: escrever o SQL acima à mão em `drizzle/0017_fase4_gerenciamento.sql`; acrescentar ao `entries` do `_journal.json` `{ "idx": 17, "version": "5", "when": <Date.now() em ms>, "tag": "0017_fase4_gerenciamento", "breakpoints": true }`; e criar `drizzle/meta/0017_snapshot.json` copiando a `0016_snapshot.json` com um `id` novo (UUID), `prevId` igual ao `id` da 0016, as duas tabelas novas e as cinco colunas novas. O teste do Passo 1 confere o encadeamento `prevId`/`id`, as tabelas e as colunas.

**3c. `server/db-account.ts`**: (1) no import do schema, trocar

```ts
  alarmEvents,
  authCodes,
  authIdentities,
  caregiverLinks,
  linkInvites,
  pushTokens,
```

por

```ts
  alarmEvents,
  alarmManagement,
  authCodes,
  authIdentities,
  caregiverLinks,
  linkInvites,
  managedAlarmLists,
  pushTokens,
```

(2) dentro da transação, trocar

```ts
    await tx.delete(warningLog).where(eq(warningLog.openId, openId));

    // Account data.
```

por

```ts
    await tx.delete(warningLog).where(eq(warningLog.openId, openId));

    // Gerenciamento de alarmes (Fase 4). Se a conta apagada é a CUIDADORA de um
    // acordo ativo, a lista gerenciada do idoso sai junto: sem isso ela ficaria
    // órfã e o servidor seguiria cobrando os alarmes dela.
    const managedByThisAccount = await tx
      .select({ monitoredOpenId: alarmManagement.monitoredOpenId })
      .from(alarmManagement)
      .where(
        and(eq(alarmManagement.caregiverOpenId, openId), eq(alarmManagement.status, "active")),
      );
    await tx
      .delete(managedAlarmLists)
      .where(
        inArray(managedAlarmLists.monitoredOpenId, [
          openId,
          ...managedByThisAccount.map((r) => r.monitoredOpenId),
        ]),
      );
    // O acordo da conta como idoso E como cuidador (histórico do consentimento).
    await tx
      .delete(alarmManagement)
      .where(
        or(eq(alarmManagement.monitoredOpenId, openId), eq(alarmManagement.caregiverOpenId, openId)),
      );

    // Account data.
```

(`and`, `eq`, `inArray` e `or` já estão importados de `drizzle-orm` no topo do arquivo.)

**3d. `lib/caregiver-format.ts`**, em `alarmChangeTitle`, trocar

```ts
  changeType: 'deleted' | 'disabled' | 'rescheduled';
  oldTime: string | null;
  newTime: string | null;
}): string {
  const name = c.alarmDescription.trim() || c.oldTime || c.newTime || 'Lembrete sem nome';
  switch (c.changeType) {
    case 'deleted':
```

por

```ts
  changeType: 'created' | 'deleted' | 'disabled' | 'rescheduled';
  oldTime: string | null;
  newTime: string | null;
}): string {
  const name = c.alarmDescription.trim() || c.oldTime || c.newTime || 'Lembrete sem nome';
  switch (c.changeType) {
    case 'created':
      return `Criou "${name}"${c.newTime ? ` (${c.newTime})` : ''}`;
    case 'deleted':
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/fase4-migration.test.ts tests/account-deletion-managed.test.ts tests/caregiver-format.test.ts tests/alarm-changes-lifecycle.test.ts`
Esperado: PASS (o `alarm-changes-lifecycle` continua verde: a linha de `alarmChanges` na exclusão não mudou).

Conferir que o schema e a migração concordam, sem gerar nada novo:

```bash
DATABASE_URL=mysql://u:p@localhost:3306/x pnpm drizzle-kit generate --name verifica_fase4
```

Esperado: `No schema changes, nothing to migrate`. Se gerar um arquivo `0018_verifica_fase4*`, o schema tem algo que a 0017 não cobre: apagar o arquivo gerado, o snapshot e a entrada nova do journal (`git status` mostra o que sobrou), ajustar o schema e regenerar a 0017.

- [ ] **Passo 5: Suíte, tipos e commit**

```bash
pnpm test && pnpm check
```

(só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add drizzle/schema.ts drizzle/0017_fase4_gerenciamento.sql drizzle/meta/_journal.json drizzle/meta/0017_snapshot.json server/db-account.ts lib/caregiver-format.ts tests/fase4-migration.test.ts tests/account-deletion-managed.test.ts tests/caregiver-format.test.ts
git commit -m "feat(db): migração 0017 do gerenciamento de alarmes e exclusão de conta apaga acordo e lista gerenciada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 3: Validação do alarme gerenciado (Zod, normalização e lista do aceite)

**Depende de:** Tarefa 1 (`shared/managed-alarm.ts`).

**Files:**
- Create: `server/_core/managed-alarm-schema.ts`
- Test: `tests/managed-alarm-schema.test.ts`

**Interfaces:**
- Consumes: `ManagedAlarm`, `MANAGED_ALARMS_MAX`, `MANAGED_DESCRIPTION_MAX` (`shared/managed-alarm.ts`, Tarefa 1).
- Produces (`server/_core/managed-alarm-schema.ts`):
  - `managedAlarmInputSchema`: Zod do alarme **sem id** (o que o cuidador manda em `createAlarm`/`updateAlarm`). Descarta chaves desconhecidas (um `id` mandado pelo cliente, `notificationId`, `nativeAlarmUids`…). Recusa: hora fora de `HH:MM` (aceita hora com um dígito, como `"8:30"`, e a padroniza), repetição desconhecida, `custom` sem dia ou com dia fora de 0..6, nome com mais de 80 caracteres, atraso de check-in fora de 5/10/15/30, tipo desconhecido, `enabled`/`sound`/`vibration` que não sejam booleanos. Quando usada em `.input(...)` do tRPC, um alarme recusado vira `BAD_REQUEST`.
  - `managedAlarmSchema`: o mesmo, com `id` (1 a 64 caracteres).
  - `type ManagedAlarmInput = z.infer<typeof managedAlarmInputSchema>`.
  - `normalizeManagedAlarm(alarm: ManagedAlarmInput, id: string): ManagedAlarm`: check-in vira `repeat: 'daily'`, `customDays: []`, `description: 'Check-in'` (e mantém o atraso); remédio perde `escalateAfterMinutes`, e `customDays` só vale em `custom` (ordenado, sem repetição; `[]` nos demais). `kind` fica como veio.
  - `sanitizeAcceptedList(raw: unknown): ManagedAlarm[]`: a lista que o idoso manda ao aceitar. Cada item passa por `managedAlarmSchema` + `normalizeManagedAlarm`; descrição acima de 80 é **cortada** (não recusa); item sem `id`/`time` válido, repetição desconhecida, dias personalizados vazios, id repetido, entrada que não é lista → `TRPCError` `BAD_REQUEST` com a mensagem `Não foi possível ler seus alarmes.`; mais de 24 itens → `BAD_REQUEST` com `Limite de 24 alarmes atingido.`. Nada é ativado com a lista pela metade.

**Por que duas portas com regras diferentes para o nome:** no cuidador, nome longo é erro de digitação e se recusa (o formulário já limita a 80). No aceite do idoso, a lista já existe no celular dele; recusar por um nome de 90 caracteres travaria um consentimento legítimo, então corta (o `maxLength={80}` do formulário só foi imposto depois, e alarmes antigos podem passar disso).

**Por que a hora aceita um dígito:** o formulário (`alarm-form-modal.tsx`) digita a hora sem zero à esquerda enquanto a pessoa escreve, e `handleSave` aceita `/^([01]?\d|2[0-3]):([0-5]\d)$/`. Existem alarmes salvos como `"8:30"`. Recusá-los no aceite faria o idoso não conseguir aceitar; padronizar para `"08:30"` não muda quando o alarme toca. O celular compara a lista do servidor com a local por campo: o `planManagedApply` (Tarefa 12) deve tratar `customDays` ausente e `[]` como iguais e `kind` ausente como `'medication'`, porque a forma canônica daqui sempre grava `customDays` e o celular pode ter o campo ausente.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/managed-alarm-schema.test.ts`:

```ts
/**
 * managed-alarm-schema.test.ts
 *
 * As regras do formulário de alarme, aplicadas no servidor (Fase 4):
 *  - `managedAlarmInputSchema` + `normalizeManagedAlarm`: o cuidador cria/edita;
 *  - `sanitizeAcceptedList`: o idoso aceita o pedido mandando a lista dele.
 * Funções puras: nada de banco, nada de rede.
 */
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import {
  managedAlarmInputSchema,
  normalizeManagedAlarm,
  sanitizeAcceptedList,
} from "../server/_core/managed-alarm-schema";

const med = (over: Record<string, unknown> = {}) => ({
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  kind: "medication",
  ...over,
});

const phoneAlarm = (over: Record<string, unknown> = {}) => ({ id: "a1", ...med(), ...over });

function trpcError(fn: () => unknown): TRPCError {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(TRPCError);
    return err as TRPCError;
  }
  throw new Error("esperava que lançasse");
}

describe("managedAlarmInputSchema", () => {
  it("aceita um remédio válido e padroniza a hora com dois dígitos", () => {
    expect(managedAlarmInputSchema.parse(med()).time).toBe("08:00");
    expect(managedAlarmInputSchema.parse(med({ time: "8:30" })).time).toBe("08:30");
    expect(managedAlarmInputSchema.parse(med({ time: "23:59" })).time).toBe("23:59");
  });

  it("descarta chaves desconhecidas: id do cliente, ids do sistema, lixo", () => {
    const parsed = managedAlarmInputSchema.parse(
      med({ id: "forcado", notificationId: "n1", nativeAlarmUids: ["u1"], monitoredOpenId: "joao", extra: 1 }),
    );
    expect(Object.keys(parsed).sort()).toEqual(
      ["description", "enabled", "kind", "repeat", "sound", "time", "vibration"].sort(),
    );
  });

  const invalidos: Array<[string, Record<string, unknown>]> = [
    ["horário sem dois dígitos nos minutos", { time: "7:5" }],
    ["hora fora do relógio", { time: "25:00" }],
    ["minuto fora do relógio", { time: "08:60" }],
    ["horário em texto", { time: "xx:yy" }],
    ["horário vazio", { time: "" }],
    ["repetição desconhecida", { repeat: "monthly" }],
    ["dias personalizados vazios", { repeat: "custom", customDays: [] }],
    ["personalizado sem a lista de dias", { repeat: "custom" }],
    ["dia personalizado fora de 0 a 6", { repeat: "custom", customDays: [7] }],
    ["dia personalizado negativo", { repeat: "custom", customDays: [-1] }],
    ["dia personalizado quebrado", { repeat: "custom", customDays: [1.5] }],
    ["nome com mais de 80 caracteres", { description: "x".repeat(81) }],
    ["atraso do check-in fora de 5/10/15/30", { kind: "checkin", escalateAfterMinutes: 7 }],
    ["tipo desconhecido", { kind: "exame" }],
    ["enabled que não é booleano", { enabled: "sim" }],
    ["som que não é booleano", { sound: 1 }],
    ["vibração ausente", { vibration: undefined }],
  ];

  it.each(invalidos)("recusa %s", (_nome, over) => {
    expect(managedAlarmInputSchema.safeParse(med(over)).success).toBe(false);
  });

  it("aceita nome com exatamente 80 caracteres e nome vazio (o formulário permite)", () => {
    expect(managedAlarmInputSchema.safeParse(med({ description: "x".repeat(80) })).success).toBe(true);
    expect(managedAlarmInputSchema.safeParse(med({ description: "" })).success).toBe(true);
  });

  it("check-in com repetição qualquer passa (é forçado a diário na normalização)", () => {
    expect(
      managedAlarmInputSchema.safeParse(
        med({ kind: "checkin", repeat: "custom", customDays: [], escalateAfterMinutes: 15 }),
      ).success,
    ).toBe(true);
  });
});

describe("normalizeManagedAlarm", () => {
  it("remédio: usa o id dado, mantém o que veio e não leva atraso de check-in", () => {
    const input = managedAlarmInputSchema.parse(med({ escalateAfterMinutes: 10, repeat: "weekdays" }));
    expect(normalizeManagedAlarm(input, "id-novo")).toEqual({
      id: "id-novo",
      time: "08:00",
      description: "Losartana",
      enabled: true,
      repeat: "weekdays",
      customDays: [],
      sound: true,
      vibration: true,
      kind: "medication",
    });
  });

  it("remédio sem 'kind' continua sem 'kind' (ausente = remédio)", () => {
    const input = managedAlarmInputSchema.parse(med({ kind: undefined }));
    expect(normalizeManagedAlarm(input, "x")).not.toHaveProperty("kind");
  });

  it("personalizado: dias ordenados e sem repetição; nos outros tipos de repetição, customDays vira []", () => {
    const custom = managedAlarmInputSchema.parse(med({ repeat: "custom", customDays: [6, 0, 3, 3] }));
    expect(normalizeManagedAlarm(custom, "x").customDays).toEqual([0, 3, 6]);

    const daily = managedAlarmInputSchema.parse(med({ repeat: "daily", customDays: [2, 4] }));
    expect(normalizeManagedAlarm(daily, "x").customDays).toEqual([]);
  });

  it("check-in: sempre diário, sem dias, com o nome fixo e o atraso escolhido", () => {
    const input = managedAlarmInputSchema.parse(
      med({
        kind: "checkin",
        repeat: "weekdays",
        customDays: [1, 2],
        description: "Como você está?",
        escalateAfterMinutes: 10,
        time: "9:00",
      }),
    );
    expect(normalizeManagedAlarm(input, "c1")).toEqual({
      id: "c1",
      time: "09:00",
      description: "Check-in",
      enabled: true,
      repeat: "daily",
      customDays: [],
      sound: true,
      vibration: true,
      kind: "checkin",
      escalateAfterMinutes: 10,
    });
  });

  it("não altera o objeto de entrada", () => {
    const input = managedAlarmInputSchema.parse(med({ repeat: "custom", customDays: [3, 1] }));
    const before = JSON.stringify(input);
    normalizeManagedAlarm(input, "x");
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("sanitizeAcceptedList", () => {
  it("lista vazia é válida (o idoso ainda não tem alarmes)", () => {
    expect(sanitizeAcceptedList([])).toEqual([]);
  });

  it("mantém os ids e descarta notificationId, nativeAlarmUids e qualquer chave desconhecida", () => {
    const [alarm] = sanitizeAcceptedList([
      phoneAlarm({ id: "meu-id", notificationId: "n1", nativeAlarmUids: ["u1", "u2"], extra: true }),
    ]);
    expect(alarm.id).toBe("meu-id");
    expect(alarm).not.toHaveProperty("notificationId");
    expect(alarm).not.toHaveProperty("nativeAlarmUids");
    expect(alarm).not.toHaveProperty("extra");
  });

  it("corta o nome acima de 80 caracteres em vez de recusar o aceite", () => {
    const [alarm] = sanitizeAcceptedList([phoneAlarm({ description: "x".repeat(120) })]);
    expect(alarm.description).toHaveLength(80);
  });

  it("hora com um dígito, como o formulário já gravou no passado, vira dois dígitos", () => {
    const [alarm] = sanitizeAcceptedList([phoneAlarm({ time: "8:30" })]);
    expect(alarm.time).toBe("08:30");
  });

  it("check-in antigo: vira diário com o nome fixo e mantém o atraso", () => {
    const [alarm] = sanitizeAcceptedList([
      phoneAlarm({ id: "c1", kind: "checkin", repeat: "weekdays", description: "Tudo bem?", escalateAfterMinutes: 30 }),
    ]);
    expect(alarm).toMatchObject({
      id: "c1",
      kind: "checkin",
      repeat: "daily",
      customDays: [],
      description: "Check-in",
      escalateAfterMinutes: 30,
    });
  });

  it("aceita exatamente 24 alarmes", () => {
    const list = Array.from({ length: 24 }, (_, i) => phoneAlarm({ id: `a${i}` }));
    expect(sanitizeAcceptedList(list)).toHaveLength(24);
  });

  it("mais de 24 alarmes: BAD_REQUEST", () => {
    const list = Array.from({ length: 25 }, (_, i) => phoneAlarm({ id: `a${i}` }));
    expect(trpcError(() => sanitizeAcceptedList(list)).code).toBe("BAD_REQUEST");
  });

  const ilegiveis: Array<[string, unknown]> = [
    ["não é uma lista", { alarms: [] }],
    ["texto", "lixo"],
    ["nulo", null],
    ["item que não é objeto", [42]],
    ["item nulo", [null]],
    ["item sem id", [{ ...med() }]],
    ["id vazio", [phoneAlarm({ id: "" })]],
    ["id com mais de 64 caracteres", [phoneAlarm({ id: "i".repeat(65) })]],
    ["horário inválido", [phoneAlarm({ time: "25:99" })]],
    ["repetição desconhecida", [phoneAlarm({ repeat: "once" })]],
    ["personalizado sem dias", [phoneAlarm({ repeat: "custom", customDays: [] })]],
    ["dia personalizado fora de 0 a 6", [phoneAlarm({ repeat: "custom", customDays: [9] })]],
    ["atraso do check-in inválido", [phoneAlarm({ kind: "checkin", escalateAfterMinutes: 7 })]],
    ["id repetido", [phoneAlarm({ id: "igual" }), phoneAlarm({ id: "igual", time: "20:00" })]],
  ];

  it.each(ilegiveis)("recusa o aceite inteiro quando %s", (_nome, raw) => {
    const err = trpcError(() => sanitizeAcceptedList(raw));
    expect(err.code).toBe("BAD_REQUEST");
    expect(err.message).toBe("Não foi possível ler seus alarmes.");
  });

  it("um item ruim no meio recusa tudo (nada é ativado com a lista pela metade)", () => {
    const list = [phoneAlarm({ id: "ok" }), phoneAlarm({ id: "ruim", time: "99:99" }), phoneAlarm({ id: "ok2" })];
    expect(trpcError(() => sanitizeAcceptedList(list)).code).toBe("BAD_REQUEST");
  });

  it("não altera a lista de entrada", () => {
    const raw = [phoneAlarm({ description: "x".repeat(120), notificationId: "n" })];
    const before = JSON.stringify(raw);
    sanitizeAcceptedList(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarm-schema.test.ts`
Esperado: FAIL, `Failed to resolve import "../server/_core/managed-alarm-schema"`.

- [ ] **Passo 3: Implementar**

Criar `server/_core/managed-alarm-schema.ts`:

```ts
/**
 * managed-alarm-schema.ts
 *
 * Validação da lista de alarmes gerenciada (Fase 4). São as MESMAS regras do
 * formulário do app (`lib/alarm-form.ts` + `AlarmFormModal`), aplicadas no
 * servidor porque o cliente nunca é confiável:
 *  - `time` "HH:MM" (a hora pode vir com um dígito — o formulário já gravou
 *    "8:30" no passado — e sai padronizada com dois);
 *  - `repeat` ∈ daily/weekdays/weekends/custom; `custom` exige pelo menos um dia
 *    em 0..6 (0 = domingo);
 *  - check-in é sempre diário, com nome fixo, e o atraso ∈ 5/10/15/30; remédio
 *    não tem atraso;
 *  - nome até 80 caracteres.
 *
 * Duas portas de entrada, com a mesma forma de saída (`ManagedAlarm`):
 *  - `managedAlarmInputSchema` + `normalizeManagedAlarm`: o cuidador cria/edita
 *    (nome acima de 80 é RECUSADO; o id é do servidor);
 *  - `sanitizeAcceptedList`: o idoso aceita o pedido mandando a lista dele (nome
 *    acima de 80 é CORTADO — recusar travaria um aceite legítimo; nada pode sumir).
 * Chaves desconhecidas (`notificationId`, `nativeAlarmUids`, um `id` mandado por
 * quem não pode escolher o id…) são descartadas, nunca gravadas.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MANAGED_ALARMS_MAX,
  MANAGED_DESCRIPTION_MAX,
  type ManagedAlarm,
} from "../../shared/managed-alarm.js";

/** Hora com um ou dois dígitos (o formulário aceita "8:30") e minutos com dois. */
const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

/** "8:30" -> "08:30". */
function padTime(time: string): string {
  const [hour, minute] = time.split(":");
  return `${hour.padStart(2, "0")}:${minute}`;
}

const alarmShape = {
  time: z.string().regex(TIME_PATTERN).transform(padTime),
  description: z.string().max(MANAGED_DESCRIPTION_MAX),
  enabled: z.boolean(),
  repeat: z.enum(["daily", "weekdays", "weekends", "custom"]),
  customDays: z.array(z.number().int().min(0).max(6)).max(7).nullish(),
  sound: z.boolean(),
  vibration: z.boolean(),
  kind: z.enum(["medication", "checkin"]).nullish(),
  escalateAfterMinutes: z
    .union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)])
    .nullish(),
};

/** "Personalizado" sem nenhum dia não tem quando tocar (o formulário também bloqueia). */
function requireCustomDays(
  alarm: { repeat: string; kind?: string | null; customDays?: number[] | null },
  ctx: z.RefinementCtx,
): void {
  // O check-in não tem escolha de repetição: é forçado a diário em normalizeManagedAlarm.
  if (alarm.kind === "checkin") return;
  if (alarm.repeat === "custom" && (alarm.customDays ?? []).length === 0) {
    ctx.addIssue({ code: "custom", path: ["customDays"], message: "Escolha pelo menos um dia." });
  }
}

/** Alarme SEM id: o que o cuidador manda para criar ou editar. */
export const managedAlarmInputSchema = z.object(alarmShape).superRefine(requireCustomDays);

/** Alarme COM id (1..64 caracteres: cabe em `alarm_events.alarmId`). */
export const managedAlarmSchema = z
  .object({ id: z.string().min(1).max(64), ...alarmShape })
  .superRefine(requireCustomDays);

export type ManagedAlarmInput = z.infer<typeof managedAlarmInputSchema>;

/**
 * Forma canônica gravada na lista. Check-in: sempre diário, `customDays` vazio,
 * nome "Check-in" (como `formForSave` no app). Remédio: sem atraso de check-in;
 * `customDays` só vale em "personalizado" (ordenado, sem repetição) e é `[]` nos
 * demais. `kind` fica como veio (ausente = remédio).
 */
export function normalizeManagedAlarm(alarm: ManagedAlarmInput, id: string): ManagedAlarm {
  const base = {
    id,
    time: alarm.time,
    enabled: alarm.enabled,
    sound: alarm.sound,
    vibration: alarm.vibration,
  };

  if (alarm.kind === "checkin") {
    return {
      ...base,
      description: "Check-in",
      repeat: "daily",
      customDays: [],
      kind: "checkin",
      ...(alarm.escalateAfterMinutes ? { escalateAfterMinutes: alarm.escalateAfterMinutes } : {}),
    };
  }

  const customDays =
    alarm.repeat === "custom" ? [...new Set(alarm.customDays ?? [])].sort((a, b) => a - b) : [];
  return {
    ...base,
    description: alarm.description,
    repeat: alarm.repeat,
    customDays,
    ...(alarm.kind ? { kind: alarm.kind } : {}),
  };
}

const UNREADABLE_LIST = "Não foi possível ler seus alarmes.";

function unreadable(): TRPCError {
  return new TRPCError({ code: "BAD_REQUEST", message: UNREADABLE_LIST });
}

/**
 * Lista que o idoso manda ao aceitar o pedido. Valida cada item com as regras
 * acima, corta nome acima de 80 caracteres (não recusa) e devolve a lista
 * canônica. Qualquer item ilegível — sem id, horário inválido, repetição
 * desconhecida, dias personalizados vazios, id repetido —, lista que não é lista
 * ou mais de 24 alarmes recusa o aceite inteiro com `BAD_REQUEST`: ativar com uma
 * lista pela metade apagaria alarmes dele em silêncio.
 */
export function sanitizeAcceptedList(raw: unknown): ManagedAlarm[] {
  if (!Array.isArray(raw)) throw unreadable();
  if (raw.length > MANAGED_ALARMS_MAX) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Limite de ${MANAGED_ALARMS_MAX} alarmes atingido.`,
    });
  }

  const seen = new Set<string>();
  return raw.map((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) throw unreadable();
    const candidate = item as Record<string, unknown>;
    const clipped =
      typeof candidate.description === "string"
        ? { ...candidate, description: candidate.description.slice(0, MANAGED_DESCRIPTION_MAX) }
        : candidate;

    const parsed = managedAlarmSchema.safeParse(clipped);
    if (!parsed.success || seen.has(parsed.data.id)) throw unreadable();
    seen.add(parsed.data.id);

    const { id, ...input } = parsed.data;
    return normalizeManagedAlarm(input, id);
  });
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarm-schema.test.ts`
Esperado: PASS (49 testes).

- [ ] **Passo 5: Suíte, tipos e commit**

```bash
pnpm test && pnpm check
```

(só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/_core/managed-alarm-schema.ts tests/managed-alarm-schema.test.ts
git commit -m "feat(alarmes): validação Zod do alarme gerenciado e sanitização da lista do aceite" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 4: Acesso ao banco do acordo e da lista gerenciada (e exportação)

**Depende de:** Tarefa 1 (`ManagedAlarm`, `MANAGEMENT_REQUEST_TTL_DAYS`, `VISIBLE_NOTICE_DELAY_MINUTES`) e Tarefa 2 (tabelas `alarmManagement`, `managedAlarmLists`).

**Files:**
- Create: `server/db-alarm-management.ts`
- Create: `server/db-managed-alarm-list.ts`
- Create: `tests/_fake-mysql.ts` (apoio de teste: MySQL em memória que executa de verdade os filtros do Drizzle; não é um teste, o Vitest só roda `*.test.ts`)
- Modify: `server/routers.ts` (dois imports; `userData.export` devolve `acordosDeGerenciamento` e `listaGerenciada`)
- Modify: `lib/_core/data-export.ts` (`ExportServerData` ganha os dois campos)
- Test: `tests/db-alarm-management.test.ts`, `tests/db-managed-alarm-list.test.ts` (novos); `tests/user-data-export.test.ts` e `tests/data-export.test.ts` (acrescentar, sem mudar o que já existe)

**Interfaces:**
- Consumes: `alarmManagement`, `managedAlarmLists`, `users`, `AlarmManagementRow`, `ManagedAlarmListRow` (`drizzle/schema.ts`, Tarefa 2); `getDb` (`server/db`); `ManagedAlarm`, `MANAGEMENT_REQUEST_TTL_DAYS`, `VISIBLE_NOTICE_DELAY_MINUTES` (`shared/managed-alarm.ts`, Tarefa 1).
- Produces (`server/db-alarm-management.ts`):
  - `type EndedReason = 'declined' | 'expired' | 'cancelled' | 'stopped_by_monitored' | 'stopped_by_caregiver' | 'unlinked' | 'account_deleted'`
  - `getOpenManagementForMonitored(monitoredOpenId: string): Promise<AlarmManagementRow | null>` (pendente ou ativo)
  - `getActiveManagementForMonitored(monitoredOpenId: string): Promise<AlarmManagementRow | null>` (só ativo)
  - `getOpenManagementForCaregiver(caregiverOpenId: string): Promise<AlarmManagementRow | null>` (pendente ou ativo que este cuidador abriu)
  - `createManagementRequest(caregiverOpenId: string, monitoredOpenId: string): Promise<AlarmManagementRow>`: `TRPCError` `CONFLICT` (`Já existe um pedido ou acordo para esta pessoa.`) se o idoso já tem pedido pendente ou acordo ativo, inclusive quando dois pedidos chegam juntos.
  - `activateManagement(id: number, list: ManagedAlarm[], monitoredOpenId: string): Promise<void>`: pedido vira `active` e nasce a lista na versão 1 já confirmada; `TRPCError` `CONFLICT` (`Este pedido não está mais aberto.`) se o pedido não está pendente ou não é deste idoso. Tudo ou nada.
  - `endManagement(id: number, reason: EndedReason): Promise<void>`: encerra, grava `endedAt` (e `respondedAt` se `declined`) e apaga a lista do idoso; idempotente.
  - `getExpiredManagementRequests(now: Date): Promise<AlarmManagementRow[]>` (pendentes com mais de 7 dias)
  - `getManagementHistory(openId: string): Promise<AlarmManagementRow[]>` (como idoso ou como cuidador, mais recente primeiro)
- Produces (`server/db-managed-alarm-list.ts`):
  - `class ManagedListConflictError extends Error`
  - `getManagedList(monitoredOpenId: string): Promise<ManagedAlarmListRow | null>`
  - `writeManagedList(monitoredOpenId: string, baseVersion: number, alarms: ManagedAlarm[], updatedByOpenId: string): Promise<number>` (devolve a nova versão; lança `ManagedListConflictError` se a versão atual não é `baseVersion`)
  - `recordManagedAck(monitoredOpenId: string, version: number, failedAlarmIds: string[]): Promise<boolean>`
  - `getListsNeedingVisibleNotice(now: Date): Promise<ManagedAlarmListRow[]>`
  - `markVisibleNoticeSent(monitoredOpenId: string, version: number): Promise<void>`
- Produces (`server/routers.ts`): `userData.export` devolve, além do que já devolvia, `acordosDeGerenciamento: AlarmManagementRow[]` e `listaGerenciada: ManagedAlarmListRow | null`. `ExportServerData` ganha `acordosDeGerenciamento: unknown[]` e `listaGerenciada: unknown`.

**Como "um pedido por idoso" é garantido sem índice único.** A migração só adiciona, então o MySQL não impede dois pedidos abertos para o mesmo idoso. Quem impede é a transação: toda função que muda o acordo de um idoso (`createManagementRequest`, `activateManagement`, `endManagement`) começa com `SELECT … FOR UPDATE` na linha dele em `users` (`openId` é único, então é trava de linha, não de intervalo). Dois pedidos ao mesmo tempo, ou um aceite junto de um cancelamento, entram um de cada vez. A trava **tem de ser o primeiro comando** da transação: no `REPEATABLE READ` do InnoDB o retrato do banco é tirado na primeira leitura comum, e só depois de a trava ser obtida essa leitura enxerga o que o outro pedido já gravou.

**Como a lista é protegida:** `writeManagedList` é um único `UPDATE … WHERE monitoredOpenId = ? AND version = baseVersion`; sem linha afetada, é conflito. `recordManagedAck` também é um único `UPDATE` (`WHERE version = ? AND appliedVersion < ?`) que **copia `alarms` para `appliedAlarms` no próprio comando**, então não há janela para uma gravação do cuidador entrar entre ler a lista e confirmá-la. `appliedAlarms` é, portanto, a lista exata da versão confirmada. Um ack de versão que já foi superada é ignorado (o celular recebe o push da versão nova e confirma essa). `updatedAt` marca a **gravação do cuidador**: o ack e a marca da notificação de reserva escrevem `updatedAt = updatedAt` para o `ON UPDATE CURRENT_TIMESTAMP` do MySQL não mexer nele.

**Por que o fake de teste é um "MySQL em memória" e não uma fila de resultados:** uma fila de `SELECT` só confere a sequência de chamadas; um filtro errado (`and` no lugar de `or`, coluna trocada) passaria. `tests/_fake-mysql.ts` lê o SQL que o Drizzle gera e executa o filtro sobre linhas de verdade, cede a vez ao laço de eventos a cada comando (chamadas concorrentes se intercalam) e implementa `FOR UPDATE` como trava até o fim da transação. Por isso os testes de corrida só passam se a trava existir (conferido removendo a trava: o teste da corrida falha).

**Fábricas de mock existentes:** `routers.ts` passa a importar dois módulos novos que nenhum teste mocka por fábrica, então nenhuma fábrica existente precisa mudar. Os testes que importam `server/routers` e chamam `userData.export` são só `tests/user-data-export.test.ts` (atualizado abaixo, com mocks parciais que preservam o resto dos exports).

- [ ] **Passo 1: Escrever os testes que falham**

**1a.** Criar o apoio `tests/_fake-mysql.ts`:

```ts
/**
 * _fake-mysql.ts
 *
 * Banco MySQL em memória, só o bastante para rodar de verdade as funções
 * `server/db-*.ts` da Fase 4 em teste. Os filtros (`where`) que o Drizzle monta
 * são lidos pelo SQL que ele gera, então um filtro errado no código de produção
 * (coluna trocada, `and` no lugar de `or`, estado esquecido) faz o teste falhar.
 * Um fake que só devolve resultados em fila não pega nada disso.
 *
 * Suporta o que essas funções usam:
 *  - select / insert / update / delete em tabelas do `drizzle/schema.ts`;
 *  - where com and/or, =, <>, <, <=, >, >=, in, not in, is null, is not null, e
 *    coluna contra coluna; orderBy asc/desc; limit; projeção `select({ a: t.a })`;
 *  - `select(...).for("update")` dentro de transação: trava por tabela+filtro até
 *    a transação terminar (é o que serializa dois pedidos para o mesmo idoso);
 *  - transação com desfazer ao lançar erro;
 *  - default (autoincremento, `defaultNow`, valor fixo), unicidade e `onUpdateNow`.
 * Cada operação cede a vez ao laço de eventos, para chamadas concorrentes se
 * intercalarem como num banco de verdade.
 *
 * Não é um banco: sem join, sem agregação, sem `offset`. Se uma função de produção
 * precisar disso, o fake lança "não suportado" em vez de adivinhar.
 */
import { getTableColumns, getTableName, is, SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

export type Row = Record<string, any>;

const dialect = new MySqlDialect();
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Data no formato em que o Drizzle entrega parâmetros de timestamp ao driver. */
function formatDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

const comparable = (v: unknown): unknown => (v instanceof Date ? formatDate(v) : v);

// --- where: lê o SQL gerado pelo Drizzle ---------------------------------------

type Pred = (row: Row, params: unknown[]) => boolean;

const TOKEN = /\s*(\(|\)|`[^`]+`\.`[^`]+`|<=|>=|<>|!=|=|<|>|\?|,|[A-Za-z_]+)/y;

function tokenize(sql: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOKEN.lastIndex < sql.length && (m = TOKEN.exec(sql))) tokens.push(m[1]);
  if (TOKEN.lastIndex < sql.trimEnd().length) throw new Error(`fake-mysql: SQL não suportado: ${sql}`);
  return tokens;
}

function compile(sql: string): Pred {
  const tokens = tokenize(sql);
  let pos = 0;
  let nextParam = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const expect = (t: string) => {
    if (take() !== t) throw new Error(`fake-mysql: esperava "${t}" em: ${sql}`);
  };

  type Operand = (row: Row, params: unknown[]) => unknown;
  const operand = (): Operand => {
    const t = take();
    if (t === "?") {
      const index = nextParam++;
      return (_row, params) => params[index];
    }
    const column = /^`[^`]+`\.`([^`]+)`$/.exec(t);
    if (!column) throw new Error(`fake-mysql: operando não suportado "${t}" em: ${sql}`);
    return (row) => row[column[1]];
  };

  const comparison = (): Pred => {
    const left = operand();
    let op = take().toLowerCase();
    let negate = false;
    if (op === "not") {
      negate = true;
      op = take().toLowerCase();
    }
    if (op === "in") {
      expect("(");
      const items: Operand[] = [operand()];
      while (peek() === ",") {
        take();
        items.push(operand());
      }
      expect(")");
      return (row, params) => {
        const hit = items.some((i) => comparable(i(row, params)) === comparable(left(row, params)));
        return negate ? !hit : hit;
      };
    }
    if (op === "is") {
      let isNot = false;
      if (peek().toLowerCase() === "not") {
        take();
        isNot = true;
      }
      expect("null");
      return (row, params) => {
        const v = left(row, params);
        const isNull = v === null || v === undefined;
        return isNot ? !isNull : isNull;
      };
    }
    const right = operand();
    return (row, params) => {
      const a = comparable(left(row, params)) as any;
      const b = comparable(right(row, params)) as any;
      switch (op) {
        case "=":
          return a === b;
        case "<>":
        case "!=":
          return a !== b;
        case "<":
          return a < b;
        case "<=":
          return a <= b;
        case ">":
          return a > b;
        case ">=":
          return a >= b;
        default:
          throw new Error(`fake-mysql: operador não suportado "${op}" em: ${sql}`);
      }
    };
  };

  const atom = (): Pred => {
    if (peek() === "(") {
      take();
      const inner = or();
      expect(")");
      return inner;
    }
    return comparison();
  };
  const and = (): Pred => {
    const parts = [atom()];
    while (peek()?.toLowerCase() === "and") {
      take();
      parts.push(atom());
    }
    return (row, params) => parts.every((p) => p(row, params));
  };
  const or = (): Pred => {
    const parts = [and()];
    while (peek()?.toLowerCase() === "or") {
      take();
      parts.push(and());
    }
    return (row, params) => parts.some((p) => p(row, params));
  };

  const root = or();
  if (pos !== tokens.length) throw new Error(`fake-mysql: sobrou SQL sem entender: ${sql}`);
  return root;
}

function whereFilter(condition: unknown): { test: (row: Row) => boolean; key: string } {
  if (condition === undefined) return { test: () => true, key: "" };
  const { sql, params } = dialect.sqlToQuery(condition as SQL);
  const pred = compile(sql);
  return { test: (row) => pred(row, params), key: `${sql}|${JSON.stringify(params)}` };
}

// --- o banco ---------------------------------------------------------------------

type Lock = { release: () => void };

export class FakeMysql {
  private data = new Map<string, Row[]>();
  private autoIncrement = new Map<string, number>();
  private locks = new Map<string, Promise<void>>();
  /** Resumo de cada comando, na ordem: `select users for update`, `insert alarm_management`… */
  readonly log: string[] = [];

  /** Linhas atuais da tabela (cópia). */
  rows(table: string): Row[] {
    return (this.data.get(table) ?? []).map((r) => structuredClone(r));
  }

  /** Planta linhas já prontas (sem defaults); atualiza o autoincremento. */
  seed(table: string, rows: Row[]): void {
    const list = this.data.get(table) ?? [];
    for (const row of rows) {
      list.push(structuredClone(row));
      if (typeof row.id === "number") {
        this.autoIncrement.set(table, Math.max(this.autoIncrement.get(table) ?? 0, row.id));
      }
    }
    this.data.set(table, list);
  }

  private list(table: string): Row[] {
    let list = this.data.get(table);
    if (!list) {
      list = [];
      this.data.set(table, list);
    }
    return list;
  }

  private snapshot(): Map<string, Row[]> {
    return new Map([...this.data].map(([k, v]) => [k, structuredClone(v)]));
  }

  // select -----------------------------------------------------------------------

  select = (fields?: Record<string, any>, tx?: TxState) => {
    const q: {
      table?: string;
      where?: unknown;
      order: Array<{ column: string; dir: "asc" | "desc" }>;
      limit?: number;
      lock: boolean;
    } = { order: [], lock: false };
    const builder: any = {
      from: (table: any) => {
        q.table = getTableName(table);
        return builder;
      },
      where: (condition: unknown) => {
        q.where = condition;
        return builder;
      },
      orderBy: (...parts: any[]) => {
        for (const p of parts) {
          if (is(p, SQL)) {
            const m = /^`[^`]+`\.`([^`]+)` (asc|desc)$/.exec(dialect.sqlToQuery(p).sql);
            if (!m) throw new Error("fake-mysql: orderBy não suportado");
            q.order.push({ column: m[1], dir: m[2] as "asc" | "desc" });
          } else {
            q.order.push({ column: p.name, dir: "asc" });
          }
        }
        return builder;
      },
      limit: (n: number) => {
        q.limit = n;
        return builder;
      },
      for: (strength: string) => {
        if (strength !== "update") throw new Error("fake-mysql: só for('update')");
        q.lock = true;
        return builder;
      },
      then: (resolve: (v: Row[]) => void, reject: (e: unknown) => void) =>
        this.runSelect(q, fields, tx).then(resolve, reject),
    };
    return builder;
  };

  private async runSelect(
    q: { table?: string; where?: unknown; order: Array<{ column: string; dir: "asc" | "desc" }>; limit?: number; lock: boolean },
    fields: Record<string, any> | undefined,
    tx: TxState | undefined,
  ): Promise<Row[]> {
    if (!q.table) throw new Error("fake-mysql: select sem from()");
    const filter = whereFilter(q.where);
    if (q.lock) {
      if (!tx) throw new Error("fake-mysql: for('update') fora de transação");
      await this.acquire(`${q.table}|${filter.key}`, tx);
      this.log.push(`select ${q.table} for update`);
    } else {
      this.log.push(`select ${q.table}`);
    }
    await tick();
    let rows = this.list(q.table).filter(filter.test);
    for (const { column, dir } of [...q.order].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = comparable(a[column]) as any;
        const y = comparable(b[column]) as any;
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1);
      });
    }
    if (q.limit !== undefined) rows = rows.slice(0, q.limit);
    if (!fields) return rows.map((r) => structuredClone(r));
    return rows.map((r) =>
      Object.fromEntries(Object.entries(fields).map(([alias, column]) => [alias, structuredClone(r[column.name])])),
    );
  }

  private async acquire(key: string, tx: TxState): Promise<void> {
    if (tx.held.has(key)) return;
    while (this.locks.has(key)) await this.locks.get(key);
    let release!: () => void;
    const promise = new Promise<void>((resolve) => (release = resolve));
    this.locks.set(key, promise);
    tx.held.set(key, {
      release: () => {
        this.locks.delete(key);
        release();
      },
    });
  }

  // insert -----------------------------------------------------------------------

  insert = (table: any, tx?: TxState) => ({
    values: (values: Row | Row[]) => ({
      then: (resolve: (v: any) => void, reject: (e: unknown) => void) =>
        this.runInsert(table, Array.isArray(values) ? values : [values], tx).then(resolve, reject),
    }),
  });

  private async runInsert(table: any, values: Row[], tx?: TxState) {
    const name = getTableName(table);
    this.log.push(`insert ${name}`);
    await tick();
    this.beforeWrite(tx);
    const columns = getTableColumns(table) as Record<string, any>;
    let insertId = 0;
    for (const value of values) {
      const row: Row = {};
      for (const [key, column] of Object.entries(columns)) {
        let v = value[key];
        if (v === undefined) {
          if (column.autoIncrement) {
            v = (this.autoIncrement.get(name) ?? 0) + 1;
          } else if (column.hasDefault) {
            v = is(column.default, SQL) ? new Date() : (column.default ?? null);
          } else {
            v = column.notNull ? undefined : null;
          }
        }
        if (v !== undefined && v !== null && typeof v === "object" && !(v instanceof Date)) v = structuredClone(v);
        row[key] = v;
      }
      for (const [key, column] of Object.entries(columns)) {
        if (column.notNull && (row[key] === undefined || row[key] === null)) {
          throw Object.assign(new Error(`Column '${key}' cannot be null`), { code: "ER_BAD_NULL_ERROR" });
        }
        if (column.isUnique && row[key] != null && this.list(name).some((r) => r[key] === row[key])) {
          throw Object.assign(new Error(`Duplicate entry for ${name}.${key}`), { code: "ER_DUP_ENTRY" });
        }
      }
      if (typeof row.id === "number") {
        insertId = row.id;
        this.autoIncrement.set(name, Math.max(this.autoIncrement.get(name) ?? 0, row.id));
      }
      this.list(name).push(row);
    }
    return [{ insertId, affectedRows: values.length }, undefined];
  }

  // update / delete --------------------------------------------------------------

  update = (table: any, tx?: TxState) => ({
    set: (values: Row) => ({
      where: (condition?: unknown) => ({
        then: (resolve: (v: any) => void, reject: (e: unknown) => void) =>
          this.runUpdate(table, values, condition, tx).then(resolve, reject),
      }),
    }),
  });

  private async runUpdate(table: any, values: Row, condition: unknown, tx?: TxState) {
    const name = getTableName(table);
    this.log.push(`update ${name}`);
    await tick();
    this.beforeWrite(tx);
    const columns = getTableColumns(table) as Record<string, any>;
    const filter = whereFilter(condition);
    let affected = 0;
    for (const row of this.list(name).filter(filter.test)) {
      const before = structuredClone(row);
      for (const [key, value] of Object.entries(values)) {
        if (is(value, SQL)) {
          const copy = /^`[^`]+`\.`([^`]+)`$/.exec(dialect.sqlToQuery(value).sql);
          if (!copy) throw new Error("fake-mysql: expressão no set() não suportada");
          row[key] = row[copy[1]];
        } else {
          row[key] = value !== null && typeof value === "object" && !(value instanceof Date) ? structuredClone(value) : value;
        }
      }
      const changed = Object.keys(row).some((k) => JSON.stringify(row[k]) !== JSON.stringify(before[k]));
      if (changed) {
        for (const [key, column] of Object.entries(columns)) {
          if (column.hasOnUpdateNow === true && !(key in values)) row[key] = new Date();
        }
      }
      affected++;
    }
    return [{ affectedRows: affected }, undefined];
  }

  delete = (table: any, tx?: TxState) => ({
    where: (condition?: unknown) => ({
      then: (resolve: (v: any) => void, reject: (e: unknown) => void) =>
        this.runDelete(table, condition, tx).then(resolve, reject),
    }),
  });

  private async runDelete(table: any, condition: unknown, tx?: TxState) {
    const name = getTableName(table);
    this.log.push(`delete ${name}`);
    await tick();
    this.beforeWrite(tx);
    const filter = whereFilter(condition);
    const list = this.list(name);
    const keep = list.filter((r) => !filter.test(r));
    const affected = list.length - keep.length;
    this.data.set(name, keep);
    return [{ affectedRows: affected }, undefined];
  }

  // transação --------------------------------------------------------------------

  /** Guarda o estado logo antes da PRIMEIRA escrita da transação (para desfazer se ela falhar). */
  private beforeWrite(tx?: TxState): void {
    if (tx && !tx.snapshot) tx.snapshot = this.snapshot();
  }

  transaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    const state: TxState = { held: new Map<string, Lock>() };
    const tx = {
      select: (fields?: Record<string, any>) => this.select(fields, state),
      insert: (table: any) => this.insert(table, state),
      update: (table: any) => this.update(table, state),
      delete: (table: any) => this.delete(table, state),
    };
    try {
      return await fn(tx);
    } catch (err) {
      if (state.snapshot) this.data = state.snapshot;
      throw err;
    } finally {
      for (const lock of state.held.values()) lock.release();
    }
  };
}

type TxState = { held: Map<string, Lock>; snapshot?: Map<string, Row[]> };
```

**1b.** Criar `tests/db-alarm-management.test.ts`:

```ts
/**
 * db-alarm-management.test.ts
 *
 * O acordo "o cuidador cuida dos alarmes do idoso" no banco (server/db-alarm-management.ts),
 * rodando as funções de verdade contra o MySQL em memória de tests/_fake-mysql.ts.
 *
 * O ponto delicado é a regra "um pedido pendente ou acordo ativo por idoso", que o
 * esquema não impõe (a migração só adiciona): quem a garante é a transação com a
 * linha do idoso travada. Os testes de corrida abaixo só passam se essa trava
 * existir de fato.
 */
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMysql } from "./_fake-mysql";

let fake = new FakeMysql();
let dbAvailable = true;

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => (dbAvailable ? fake : null)),
}));

import {
  activateManagement,
  createManagementRequest,
  endManagement,
  getActiveManagementForMonitored,
  getExpiredManagementRequests,
  getManagementHistory,
  getOpenManagementForCaregiver,
  getOpenManagementForMonitored,
} from "../server/db-alarm-management";
import type { ManagedAlarm } from "../shared/managed-alarm";

const NOW = new Date("2026-10-08T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

const agreement = (over: Record<string, unknown> = {}) => ({
  id: 1,
  monitoredOpenId: "maria",
  caregiverOpenId: "ana",
  status: "pending",
  endedReason: null,
  requestedAt: new Date(NOW.getTime() - 60_000),
  respondedAt: null,
  endedAt: null,
  ...over,
});

const alarm = (over: Partial<ManagedAlarm> = {}): ManagedAlarm => ({
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  customDays: [],
  sound: true,
  vibration: true,
  kind: "medication",
  ...over,
});

const agreementsOf = (monitored: string) =>
  fake.rows("alarm_management").filter((r) => r.monitoredOpenId === monitored);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fake = new FakeMysql();
  dbAvailable = true;
  fake.seed("users", [
    { id: 1, openId: "maria" },
    { id: 2, openId: "joao" },
    { id: 3, openId: "ana" },
    { id: 4, openId: "bia" },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createManagementRequest", () => {
  it("cria o pedido pendente, sem resposta nem motivo de encerramento", async () => {
    const row = await createManagementRequest("ana", "maria");

    expect(row).toMatchObject({
      monitoredOpenId: "maria",
      caregiverOpenId: "ana",
      status: "pending",
      endedReason: null,
      respondedAt: null,
      endedAt: null,
    });
    expect(row.requestedAt).toEqual(NOW);
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("trava a linha do idoso ANTES de olhar e gravar o pedido", async () => {
    await createManagementRequest("ana", "maria");

    const log = fake.log;
    expect(log.indexOf("select users for update")).toBeGreaterThanOrEqual(0);
    expect(log.indexOf("select users for update")).toBeLessThan(log.indexOf("insert alarm_management"));
  });

  it("CONFLICT quando já existe pedido pendente do idoso (de qualquer cuidador)", async () => {
    fake.seed("alarm_management", [agreement({ caregiverOpenId: "bia" })]);

    const err = await createManagementRequest("ana", "maria").catch((e) => e);

    expect(err).toBeInstanceOf(TRPCError);
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("Já existe um pedido ou acordo para esta pessoa.");
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("CONFLICT quando já existe acordo ativo", async () => {
    fake.seed("alarm_management", [agreement({ status: "active", respondedAt: NOW })]);

    await expect(createManagementRequest("bia", "maria")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("depois que o acordo termina, um pedido novo é permitido e o histórico fica", async () => {
    fake.seed("alarm_management", [
      agreement({ status: "ended", endedReason: "declined", endedAt: NOW, respondedAt: NOW }),
    ]);

    const row = await createManagementRequest("ana", "maria");

    expect(row.id).toBe(2);
    expect(agreementsOf("maria").map((r) => r.status)).toEqual(["ended", "pending"]);
  });

  it("idosos diferentes não se atrapalham", async () => {
    await createManagementRequest("ana", "maria");
    await expect(createManagementRequest("bia", "joao")).resolves.toMatchObject({ monitoredOpenId: "joao" });
  });

  it("CORRIDA: dois pedidos ao mesmo tempo para o mesmo idoso, só um nasce", async () => {
    const results = await Promise.allSettled([
      createManagementRequest("ana", "maria"),
      createManagementRequest("bia", "maria"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(TRPCError);
    expect(rejected.reason.code).toBe("CONFLICT");
    expect(agreementsOf("maria")).toHaveLength(1);
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(createManagementRequest("ana", "maria")).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});

describe("leituras", () => {
  beforeEach(() => {
    fake.seed("alarm_management", [
      agreement({ id: 1, status: "ended", endedReason: "stopped_by_monitored", endedAt: NOW }),
      agreement({ id: 2, caregiverOpenId: "bia", status: "active", respondedAt: NOW }),
      agreement({ id: 3, monitoredOpenId: "joao", caregiverOpenId: "ana", status: "pending" }),
    ]);
  });

  it("getOpenManagementForMonitored devolve o pedido/acordo aberto e ignora os encerrados", async () => {
    expect(await getOpenManagementForMonitored("maria")).toMatchObject({ id: 2, status: "active" });
    expect(await getOpenManagementForMonitored("joao")).toMatchObject({ id: 3, status: "pending" });
    expect(await getOpenManagementForMonitored("ninguem")).toBeNull();
  });

  it("getOpenManagementForMonitored: só encerrado = null", async () => {
    fake = new FakeMysql();
    fake.seed("alarm_management", [agreement({ status: "ended", endedReason: "cancelled", endedAt: NOW })]);
    expect(await getOpenManagementForMonitored("maria")).toBeNull();
  });

  it("getActiveManagementForMonitored só devolve acordo ATIVO (pedido pendente não conta)", async () => {
    expect(await getActiveManagementForMonitored("maria")).toMatchObject({ id: 2 });
    expect(await getActiveManagementForMonitored("joao")).toBeNull();
  });

  it("getOpenManagementForCaregiver devolve o que ESTE cuidador abriu", async () => {
    expect(await getOpenManagementForCaregiver("bia")).toMatchObject({ id: 2 });
    expect(await getOpenManagementForCaregiver("ana")).toMatchObject({ id: 3 });
    expect(await getOpenManagementForCaregiver("carol")).toBeNull();
  });

  it("sem banco as leituras devolvem vazio", async () => {
    dbAvailable = false;
    expect(await getOpenManagementForMonitored("maria")).toBeNull();
    expect(await getActiveManagementForMonitored("maria")).toBeNull();
    expect(await getOpenManagementForCaregiver("ana")).toBeNull();
    expect(await getExpiredManagementRequests(NOW)).toEqual([]);
    expect(await getManagementHistory("maria")).toEqual([]);
  });
});

describe("activateManagement", () => {
  it("o pedido vira ativo e nasce a lista gerenciada na versão 1, já confirmada", async () => {
    fake.seed("alarm_management", [agreement()]);
    const list = [alarm(), alarm({ id: "a2", time: "20:00", description: "Metformina" })];

    await activateManagement(1, list, "maria");

    expect(agreementsOf("maria")[0]).toMatchObject({ status: "active", endedReason: null });
    expect(agreementsOf("maria")[0].respondedAt).toEqual(NOW);
    const [row] = fake.rows("managed_alarm_lists");
    expect(row).toMatchObject({
      monitoredOpenId: "maria",
      version: 1,
      appliedVersion: 1,
      failedAlarmIds: [],
      updatedByOpenId: "maria",
      visibleNoticeSentForVersion: 0,
    });
    expect(row.alarms).toEqual(list);
    expect(row.appliedAlarms).toEqual(list);
    expect(row.appliedAt).toEqual(NOW);
  });

  it("aceita com a lista vazia (o idoso ainda não tem alarmes)", async () => {
    fake.seed("alarm_management", [agreement()]);

    await activateManagement(1, [], "maria");

    expect(fake.rows("managed_alarm_lists")[0].alarms).toEqual([]);
  });

  it("CONFLICT se o pedido já não está pendente (cancelado ou vencido enquanto o idoso lia)", async () => {
    fake.seed("alarm_management", [
      agreement({ status: "ended", endedReason: "cancelled", endedAt: NOW }),
    ]);

    await expect(activateManagement(1, [alarm()], "maria")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
    expect(agreementsOf("maria")[0].status).toBe("ended");
  });

  it("não ativa pedido de OUTRO idoso, mesmo sabendo o id", async () => {
    fake.seed("alarm_management", [agreement({ id: 7, monitoredOpenId: "joao" })]);

    await expect(activateManagement(7, [alarm()], "maria")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(fake.rows("alarm_management")[0].status).toBe("pending");
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
  });

  it("é tudo ou nada: se a lista não pode ser criada, o pedido continua pendente", async () => {
    fake.seed("alarm_management", [agreement()]);
    // Sobra de uma lista antiga do mesmo idoso: a coluna é única, o insert falha.
    fake.seed("managed_alarm_lists", [
      {
        id: 1,
        monitoredOpenId: "maria",
        version: 9,
        alarms: [],
        appliedVersion: 9,
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: NOW,
        updatedByOpenId: "ana",
        updatedAt: NOW,
        visibleNoticeSentForVersion: 0,
      },
    ]);

    await expect(activateManagement(1, [alarm()], "maria")).rejects.toThrow(/Duplicate/);
    expect(agreementsOf("maria")[0]).toMatchObject({ status: "pending", respondedAt: null });
  });

  it("CORRIDA: aceitar e cancelar ao mesmo tempo nunca deixa acordo sem lista nem lista sem acordo", async () => {
    fake.seed("alarm_management", [agreement()]);

    await Promise.allSettled([activateManagement(1, [alarm()], "maria"), endManagement(1, "cancelled")]);

    const [row] = agreementsOf("maria");
    const lists = fake.rows("managed_alarm_lists");
    if (row.status === "active") {
      expect(lists).toHaveLength(1);
    } else {
      expect(row).toMatchObject({ status: "ended", endedReason: "cancelled" });
      expect(lists).toHaveLength(0);
    }
  });
});

describe("endManagement", () => {
  const reasons = [
    "expired",
    "cancelled",
    "stopped_by_monitored",
    "stopped_by_caregiver",
    "unlinked",
    "account_deleted",
  ] as const;

  it.each(reasons)("encerra com o motivo %s, marca a hora e apaga a lista do idoso", async (reason) => {
    fake.seed("alarm_management", [agreement({ status: "active", respondedAt: new Date(NOW.getTime() - DAY) })]);
    await seedList("maria");

    await endManagement(1, reason);

    expect(agreementsOf("maria")[0]).toMatchObject({ status: "ended", endedReason: reason });
    expect(agreementsOf("maria")[0].endedAt).toEqual(NOW);
    // respondedAt do aceite continua; só a recusa o preenche no encerramento.
    expect(agreementsOf("maria")[0].respondedAt).toEqual(new Date(NOW.getTime() - DAY));
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
  });

  it("recusa: grava respondedAt junto do encerramento", async () => {
    fake.seed("alarm_management", [agreement()]);

    await endManagement(1, "declined");

    expect(agreementsOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "declined" });
    expect(agreementsOf("maria")[0].respondedAt).toEqual(NOW);
  });

  it("não mexe nas listas dos OUTROS idosos", async () => {
    fake.seed("alarm_management", [agreement({ status: "active" })]);
    await seedList("maria");
    await seedList("joao", 2);

    await endManagement(1, "stopped_by_monitored");

    expect(fake.rows("managed_alarm_lists").map((l) => l.monitoredOpenId)).toEqual(["joao"]);
  });

  it("é idempotente: acordo já encerrado mantém o motivo original", async () => {
    fake.seed("alarm_management", [agreement({ status: "active" })]);
    await endManagement(1, "stopped_by_caregiver");

    await endManagement(1, "unlinked");

    expect(agreementsOf("maria")[0].endedReason).toBe("stopped_by_caregiver");
  });

  it("encerrar um acordo VELHO não apaga a lista do acordo novo do mesmo idoso", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, status: "ended", endedReason: "cancelled", endedAt: NOW }),
      agreement({ id: 2, caregiverOpenId: "bia", status: "active" }),
    ]);
    await seedList("maria");

    await endManagement(1, "unlinked");

    expect(fake.rows("managed_alarm_lists")).toHaveLength(1);
    expect(agreementsOf("maria").find((r) => r.id === 2)?.status).toBe("active");
  });

  it("id que não existe: não faz nada e não lança", async () => {
    await expect(endManagement(99, "cancelled")).resolves.toBeUndefined();
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(endManagement(1, "cancelled")).rejects.toThrow("DATABASE_UNAVAILABLE");
  });

  async function seedList(monitoredOpenId: string, id = 1) {
    fake.seed("managed_alarm_lists", [
      {
        id,
        monitoredOpenId,
        version: 1,
        alarms: [],
        appliedVersion: 1,
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: NOW,
        updatedByOpenId: monitoredOpenId,
        updatedAt: NOW,
        visibleNoticeSentForVersion: 0,
      },
    ]);
  }
});

describe("getExpiredManagementRequests", () => {
  it("devolve só pedidos PENDENTES com mais de 7 dias", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, requestedAt: new Date(NOW.getTime() - 8 * DAY) }),
      agreement({ id: 2, monitoredOpenId: "joao", requestedAt: new Date(NOW.getTime() - 6 * DAY) }),
      agreement({ id: 3, monitoredOpenId: "ana", status: "active", requestedAt: new Date(NOW.getTime() - 30 * DAY) }),
      agreement({
        id: 4,
        monitoredOpenId: "bia",
        status: "ended",
        endedReason: "declined",
        requestedAt: new Date(NOW.getTime() - 30 * DAY),
      }),
    ]);

    const expired = await getExpiredManagementRequests(NOW);

    expect(expired.map((r) => r.id)).toEqual([1]);
  });

  it("exatamente 7 dias ainda não venceu; um segundo a mais venceu", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, requestedAt: new Date(NOW.getTime() - 7 * DAY) }),
      agreement({ id: 2, monitoredOpenId: "joao", requestedAt: new Date(NOW.getTime() - 7 * DAY - 1000) }),
    ]);

    expect((await getExpiredManagementRequests(NOW)).map((r) => r.id)).toEqual([2]);
  });
});

describe("getManagementHistory", () => {
  it("junta o que a conta tem como idoso E como cuidador, mais recente primeiro", async () => {
    fake.seed("alarm_management", [
      agreement({ id: 1, monitoredOpenId: "maria", caregiverOpenId: "ana", status: "ended", endedReason: "declined" }),
      agreement({ id: 2, monitoredOpenId: "joao", caregiverOpenId: "maria" }),
      agreement({ id: 3, monitoredOpenId: "joao", caregiverOpenId: "bia" }),
      agreement({ id: 4, monitoredOpenId: "maria", caregiverOpenId: "bia" }),
    ]);

    expect((await getManagementHistory("maria")).map((r) => r.id)).toEqual([4, 2, 1]);
    expect((await getManagementHistory("ninguem")).map((r) => r.id)).toEqual([]);
  });
});
```

**1c.** Criar `tests/db-managed-alarm-list.test.ts`:

```ts
/**
 * db-managed-alarm-list.test.ts
 *
 * A lista gerenciada no banco (server/db-managed-alarm-list.ts), rodando as
 * funções de verdade contra o MySQL em memória de tests/_fake-mysql.ts:
 *  - gravação do cuidador com versão (duas gravações em cima da mesma versão não
 *    se sobrescrevem);
 *  - confirmação do celular (`ack`): só vale a versão atual e só uma vez, e
 *    `appliedAlarms` é a lista DAQUELA versão;
 *  - a notificação visível de reserva (10 minutos sem confirmação, uma por versão).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMysql } from "./_fake-mysql";

let fake = new FakeMysql();
let dbAvailable = true;

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => (dbAvailable ? fake : null)),
}));

import {
  getListsNeedingVisibleNotice,
  getManagedList,
  ManagedListConflictError,
  markVisibleNoticeSent,
  recordManagedAck,
  writeManagedList,
} from "../server/db-managed-alarm-list";
import type { ManagedAlarm } from "../shared/managed-alarm";

const T0 = new Date("2026-10-08T12:00:00.000Z");
const MIN = 60_000;

const alarm = (over: Partial<ManagedAlarm> = {}): ManagedAlarm => ({
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  customDays: [],
  sound: true,
  vibration: true,
  kind: "medication",
  ...over,
});

const A1 = alarm();
const A2 = alarm({ id: "a2", time: "20:00", description: "Metformina" });
const A3 = alarm({ id: "a3", time: "12:00", description: "Omeprazol" });

/** Lista do idoso já ativada: versão 1 confirmada, com [A1]. */
function seedList(over: Record<string, unknown> = {}) {
  fake.seed("managed_alarm_lists", [
    {
      id: 1,
      monitoredOpenId: "maria",
      version: 1,
      alarms: [A1],
      appliedVersion: 1,
      appliedAlarms: [A1],
      failedAlarmIds: [],
      appliedAt: T0,
      updatedByOpenId: "maria",
      updatedAt: T0,
      visibleNoticeSentForVersion: 0,
      ...over,
    },
  ]);
}

const listOf = (monitored = "maria") => fake.rows("managed_alarm_lists").find((l) => l.monitoredOpenId === monitored)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  fake = new FakeMysql();
  dbAvailable = true;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getManagedList", () => {
  it("devolve a linha do idoso, ou null se ele não tem lista", async () => {
    seedList();
    expect(await getManagedList("maria")).toMatchObject({ version: 1, alarms: [A1] });
    expect(await getManagedList("joao")).toBeNull();
  });

  it("sem banco, devolve null", async () => {
    dbAvailable = false;
    expect(await getManagedList("maria")).toBeNull();
  });
});

describe("writeManagedList", () => {
  it("grava em cima da versão que o cuidador via: sobe a versão e guarda quem gravou", async () => {
    seedList();

    const version = await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(version).toBe(2);
    expect(listOf()).toMatchObject({ version: 2, alarms: [A1, A2], updatedByOpenId: "ana" });
  });

  it("não mexe no que o celular confirmou", async () => {
    seedList();

    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(listOf()).toMatchObject({ appliedVersion: 1, appliedAlarms: [A1], failedAlarmIds: [] });
  });

  it("updatedAt passa a ser a hora da gravação", async () => {
    seedList();
    vi.setSystemTime(new Date(T0.getTime() + 5 * MIN));

    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(listOf().updatedAt).toEqual(new Date(T0.getTime() + 5 * MIN));
  });

  it("versão velha: ManagedListConflictError e a lista não muda", async () => {
    seedList({ version: 3, appliedVersion: 3, alarms: [A1, A2], appliedAlarms: [A1, A2] });

    const err = await writeManagedList("maria", 2, [A3], "ana").catch((e) => e);

    expect(err).toBeInstanceOf(ManagedListConflictError);
    expect(listOf()).toMatchObject({ version: 3, alarms: [A1, A2] });
  });

  it("versão do futuro também é conflito", async () => {
    seedList();
    await expect(writeManagedList("maria", 5, [A3], "ana")).rejects.toBeInstanceOf(ManagedListConflictError);
    expect(listOf().version).toBe(1);
  });

  it("idoso sem lista: conflito (não cria lista do nada)", async () => {
    await expect(writeManagedList("maria", 1, [A1], "ana")).rejects.toBeInstanceOf(ManagedListConflictError);
    expect(fake.rows("managed_alarm_lists")).toHaveLength(0);
  });

  it("só grava a lista do idoso pedido", async () => {
    seedList();
    fake.seed("managed_alarm_lists", [
      {
        id: 2,
        monitoredOpenId: "joao",
        version: 1,
        alarms: [],
        appliedVersion: 1,
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: T0,
        updatedByOpenId: "joao",
        updatedAt: T0,
        visibleNoticeSentForVersion: 0,
      },
    ]);

    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(listOf("joao")).toMatchObject({ version: 1, alarms: [] });
  });

  it("CORRIDA: duas gravações em cima da mesma versão, só uma vence e a outra não sobrescreve", async () => {
    seedList();

    const results = await Promise.allSettled([
      writeManagedList("maria", 1, [A1, A2], "ana"),
      writeManagedList("maria", 1, [A1, A3], "bia"),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(ManagedListConflictError);
    expect(listOf().version).toBe(2);
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(writeManagedList("maria", 1, [A1], "ana")).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});

describe("recordManagedAck", () => {
  it("confirma a versão atual: appliedAlarms vira a lista daquela versão e guarda as falhas", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana"); // v2
    vi.setSystemTime(new Date(T0.getTime() + 3 * MIN));

    const recorded = await recordManagedAck("maria", 2, ["a2"]);

    expect(recorded).toBe(true);
    expect(listOf()).toMatchObject({
      version: 2,
      appliedVersion: 2,
      appliedAlarms: [A1, A2],
      failedAlarmIds: ["a2"],
    });
    expect(listOf().appliedAt).toEqual(new Date(T0.getTime() + 3 * MIN));
  });

  it("não mexe em updatedAt (é a hora da gravação do cuidador, não da confirmação)", async () => {
    seedList();
    vi.setSystemTime(new Date(T0.getTime() + 1 * MIN));
    await writeManagedList("maria", 1, [A1, A2], "ana");
    const gravouEm = listOf().updatedAt;
    vi.setSystemTime(new Date(T0.getTime() + 9 * MIN));

    await recordManagedAck("maria", 2, []);

    expect(listOf().updatedAt).toEqual(gravouEm);
  });

  it("guarda cada id de falha uma vez só", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana");

    await recordManagedAck("maria", 2, ["a2", "a2", "a1"]);

    expect(listOf().failedAlarmIds).toEqual(["a2", "a1"]);
  });

  it("ack de versão antiga (já superada) é ignorado: nada muda", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana"); // v2
    await writeManagedList("maria", 2, [A1, A2, A3], "ana"); // v3

    const recorded = await recordManagedAck("maria", 2, ["a2"]);

    expect(recorded).toBe(false);
    expect(listOf()).toMatchObject({ version: 3, appliedVersion: 1, appliedAlarms: [A1], failedAlarmIds: [] });
  });

  it("ack de versão que ainda não existe é ignorado", async () => {
    seedList();
    expect(await recordManagedAck("maria", 9, [])).toBe(false);
    expect(listOf().appliedVersion).toBe(1);
  });

  it("ack repetido da mesma versão é ignorado e não troca as falhas já gravadas", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana");
    await recordManagedAck("maria", 2, ["a2"]);

    const again = await recordManagedAck("maria", 2, []);

    expect(again).toBe(false);
    expect(listOf().failedAlarmIds).toEqual(["a2"]);
  });

  it("ack de versão menor ou igual à já confirmada é ignorado", async () => {
    seedList({ version: 4, appliedVersion: 4, alarms: [A1, A2], appliedAlarms: [A1, A2] });
    expect(await recordManagedAck("maria", 3, [])).toBe(false);
    expect(await recordManagedAck("maria", 4, [])).toBe(false);
  });

  it("appliedAlarms fica com a lista da versão confirmada mesmo que o cuidador grave de novo depois", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana"); // v2
    await recordManagedAck("maria", 2, []);

    await writeManagedList("maria", 2, [A1, A2, A3], "ana"); // v3

    expect(listOf()).toMatchObject({ version: 3, appliedVersion: 2, appliedAlarms: [A1, A2] });
  });

  it("idoso sem lista: false", async () => {
    expect(await recordManagedAck("maria", 1, [])).toBe(false);
  });

  it("só confirma a lista do idoso pedido", async () => {
    seedList();
    await writeManagedList("maria", 1, [A1, A2], "ana");

    expect(await recordManagedAck("joao", 2, [])).toBe(false);
    expect(listOf().appliedVersion).toBe(1);
  });

  it("sem banco, lança DATABASE_UNAVAILABLE", async () => {
    dbAvailable = false;
    await expect(recordManagedAck("maria", 2, [])).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});

describe("notificação visível de reserva", () => {
  const pending = (over: Record<string, unknown> = {}) => ({
    monitoredOpenId: "maria",
    version: 3,
    appliedVersion: 2,
    visibleNoticeSentForVersion: 0,
    updatedAt: new Date(T0.getTime() - 11 * MIN),
    ...over,
  });

  const seedMany = (rows: Array<Record<string, unknown>>) =>
    fake.seed(
      "managed_alarm_lists",
      rows.map((r, i) => ({
        id: i + 1,
        alarms: [],
        appliedAlarms: [],
        failedAlarmIds: [],
        appliedAt: T0,
        updatedByOpenId: "ana",
        ...r,
      })),
    );

  it("lista quem está há mais de 10 min sem confirmar e ainda não foi avisado dessa versão", async () => {
    seedMany([pending()]);

    const lists = await getListsNeedingVisibleNotice(T0);

    expect(lists.map((l) => l.monitoredOpenId)).toEqual(["maria"]);
  });

  it("não lista: dentro dos 10 min, exatamente 10 min, já confirmada, já avisada dessa versão", async () => {
    seedMany([
      pending({ monitoredOpenId: "recente", updatedAt: new Date(T0.getTime() - 5 * MIN) }),
      pending({ monitoredOpenId: "dezMin", updatedAt: new Date(T0.getTime() - 10 * MIN) }),
      pending({ monitoredOpenId: "confirmada", appliedVersion: 3 }),
      pending({ monitoredOpenId: "avisada", visibleNoticeSentForVersion: 3 }),
    ]);

    expect(await getListsNeedingVisibleNotice(T0)).toEqual([]);
  });

  it("uma versão nova depois do aviso volta a ser listada", async () => {
    seedMany([pending({ version: 4, visibleNoticeSentForVersion: 3 })]);

    expect((await getListsNeedingVisibleNotice(T0)).map((l) => l.version)).toEqual([4]);
  });

  it("markVisibleNoticeSent grava a versão, sem mexer em updatedAt, e a lista deixa de ser pendente", async () => {
    seedMany([pending()]);
    const before = listOf().updatedAt;

    await markVisibleNoticeSent("maria", 3);

    expect(listOf().visibleNoticeSentForVersion).toBe(3);
    expect(listOf().updatedAt).toEqual(before);
    expect(await getListsNeedingVisibleNotice(T0)).toEqual([]);
  });

  it("markVisibleNoticeSent nunca volta atrás", async () => {
    seedMany([pending({ visibleNoticeSentForVersion: 4, version: 4 })]);

    await markVisibleNoticeSent("maria", 3);

    expect(listOf().visibleNoticeSentForVersion).toBe(4);
  });

  it("sem banco: a leitura devolve [] e a escrita lança", async () => {
    dbAvailable = false;
    expect(await getListsNeedingVisibleNotice(T0)).toEqual([]);
    await expect(markVisibleNoticeSent("maria", 3)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
```

**1d.** Em `tests/user-data-export.test.ts`, depois do `vi.mock("../server/db-alarm-changes", ...)` (termina com `insertAlarmChanges: vi.fn(),` e `}));`), acrescentar:

```ts
vi.mock("../server/db-alarm-management", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-alarm-management")>()),
  getManagementHistory: vi.fn(async (openId: string) =>
    openId === "maria"
      ? [{ id: 1, monitoredOpenId: "maria", caregiverOpenId: "ana", status: "ended", endedReason: "declined" }]
      : [],
  ),
}));

vi.mock("../server/db-managed-alarm-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-managed-alarm-list")>()),
  getManagedList: vi.fn(async (openId: string) =>
    openId === "maria" ? { monitoredOpenId: "maria", version: 3, alarms: [{ id: "a1" }] } : null,
  ),
}));
```

e, logo depois do teste "devolve todas as seções para o usuário autenticado" (que termina com `expect(result.historicoDeAlteracoesDeAlarmes).toHaveLength(1);` e `});`), acrescentar:

```ts
  it("inclui o histórico do acordo de gerenciamento e a lista gerenciada (LGPD Art. 18, V)", async () => {
    const { getManagementHistory } = await import("../server/db-alarm-management");
    const { getManagedList } = await import("../server/db-managed-alarm-list");

    const maria = await appRouter.createCaller(makeCtx(makeUser("maria"))).userData.export();
    expect(maria.acordosDeGerenciamento).toEqual([
      expect.objectContaining({ caregiverOpenId: "ana", status: "ended", endedReason: "declined" }),
    ]);
    expect(maria.listaGerenciada).toMatchObject({ version: 3, alarms: [{ id: "a1" }] });
    expect(getManagementHistory).toHaveBeenCalledWith("maria");
    expect(getManagedList).toHaveBeenCalledWith("maria");

    const bob = await appRouter.createCaller(makeCtx(makeUser("bob"))).userData.export();
    expect(bob.acordosDeGerenciamento).toEqual([]);
    expect(bob.listaGerenciada).toBeNull();
  });
```

**1e.** Em `tests/data-export.test.ts`, no fixture `SERVER: ExportServerData`, trocar

```ts
  historicoDeAlteracoesDeAlarmes: [],
};
```

por

```ts
  historicoDeAlteracoesDeAlarmes: [],
  acordosDeGerenciamento: [],
  listaGerenciada: null,
};
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/db-alarm-management.test.ts tests/db-managed-alarm-list.test.ts tests/user-data-export.test.ts`
Esperado: FAIL. Os dois primeiros com `Failed to resolve import "../server/db-alarm-management"` / `"../server/db-managed-alarm-list"`; `user-data-export` com o mesmo erro de importação ao carregar os mocks parciais.

- [ ] **Passo 3: Implementar**

**3a.** Criar `server/db-alarm-management.ts`:

```ts
/**
 * db-alarm-management.ts
 *
 * Persistência do acordo "o cuidador cuida dos alarmes do idoso" (tabela
 * `alarm_management`, ver drizzle/schema.ts). Regra central: no máximo UM pedido
 * `pending` ou acordo `active` por idoso. Quem decide isso é o banco, em
 * transação: toda função que muda o acordo de um idoso começa travando a linha
 * dele em `users` (`SELECT … FOR UPDATE`), então dois pedidos ao mesmo tempo, ou
 * um aceite junto de um cancelamento, entram um de cada vez. Não existe índice
 * único que impeça a duplicata (a migração só adiciona), por isso a trava.
 *
 * Leituras devolvem null/[] sem banco, como o resto dos db-*.ts; escritas
 * lançam `DATABASE_UNAVAILABLE` (calar faria o usuário achar que parou o acordo).
 */
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lt, ne, or } from "drizzle-orm";
import {
  alarmManagement,
  managedAlarmLists,
  users,
  type AlarmManagementRow,
} from "../drizzle/schema";
import { MANAGEMENT_REQUEST_TTL_DAYS, type ManagedAlarm } from "../shared/managed-alarm.js";
import { getDb } from "./db";

export type EndedReason = NonNullable<AlarmManagementRow["endedReason"]>;

const OPEN_STATUSES: Array<AlarmManagementRow["status"]> = ["pending", "active"];

function affectedRows(res: unknown): number {
  return (
    (res as { affectedRows?: number }).affectedRows ??
    (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ??
    0
  );
}

// --- Leituras --------------------------------------------------------------------

/** Pedido pendente ou acordo ativo do idoso. */
export async function getOpenManagementForMonitored(
  monitoredOpenId: string,
): Promise<AlarmManagementRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(alarmManagement)
    .where(
      and(
        eq(alarmManagement.monitoredOpenId, monitoredOpenId),
        inArray(alarmManagement.status, OPEN_STATUSES),
      ),
    )
    .orderBy(desc(alarmManagement.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Só o acordo ativo do idoso (o pedido pendente não conta). */
export async function getActiveManagementForMonitored(
  monitoredOpenId: string,
): Promise<AlarmManagementRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(alarmManagement)
    .where(
      and(
        eq(alarmManagement.monitoredOpenId, monitoredOpenId),
        eq(alarmManagement.status, "active"),
      ),
    )
    .orderBy(desc(alarmManagement.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Pedido pendente ou acordo ativo que ESTE cuidador abriu. */
export async function getOpenManagementForCaregiver(
  caregiverOpenId: string,
): Promise<AlarmManagementRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(alarmManagement)
    .where(
      and(
        eq(alarmManagement.caregiverOpenId, caregiverOpenId),
        inArray(alarmManagement.status, OPEN_STATUSES),
      ),
    )
    .orderBy(desc(alarmManagement.id))
    .limit(1);
  return rows[0] ?? null;
}

/** Pedidos pendentes há mais de 7 dias (o job os encerra como `expired`). */
export async function getExpiredManagementRequests(now: Date): Promise<AlarmManagementRow[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(now.getTime() - MANAGEMENT_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmManagement)
    .where(and(eq(alarmManagement.status, "pending"), lt(alarmManagement.requestedAt, cutoff)))
    .orderBy(alarmManagement.id);
}

/** Todo o histórico em que a conta aparece, como idoso OU como cuidador (exportação, LGPD Art. 18 V). Mais recente primeiro. */
export async function getManagementHistory(openId: string): Promise<AlarmManagementRow[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alarmManagement)
    .where(or(eq(alarmManagement.monitoredOpenId, openId), eq(alarmManagement.caregiverOpenId, openId)))
    .orderBy(desc(alarmManagement.id));
}

// --- Escritas (sempre em transação, com a linha do idoso travada) -----------------

/** Trava a linha do idoso em `users`: serializa tudo que muda o acordo dele. */
type Tx = Parameters<Parameters<NonNullable<Awaited<ReturnType<typeof getDb>>>["transaction"]>[0]>[0];
async function lockMonitored(tx: Tx, monitoredOpenId: string): Promise<void> {
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.openId, monitoredOpenId))
    .limit(1)
    .for("update");
}

/**
 * O cuidador pede para cuidar dos alarmes do idoso. `CONFLICT` se o idoso já
 * tem pedido pendente ou acordo ativo (inclusive quando dois pedidos chegam ao
 * mesmo tempo: o segundo espera a trava e então vê o primeiro).
 */
export async function createManagementRequest(
  caregiverOpenId: string,
  monitoredOpenId: string,
): Promise<AlarmManagementRow> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db.transaction(async (tx) => {
    await lockMonitored(tx, monitoredOpenId);
    const open = await tx
      .select({ id: alarmManagement.id })
      .from(alarmManagement)
      .where(
        and(
          eq(alarmManagement.monitoredOpenId, monitoredOpenId),
          inArray(alarmManagement.status, OPEN_STATUSES),
        ),
      )
      .limit(1);
    if (open.length > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe um pedido ou acordo para esta pessoa.",
      });
    }
    await tx.insert(alarmManagement).values({ monitoredOpenId, caregiverOpenId, status: "pending" });
    // Relê a linha criada (a trava garante que é a única pendente deste idoso).
    const [row] = await tx
      .select()
      .from(alarmManagement)
      .where(
        and(
          eq(alarmManagement.monitoredOpenId, monitoredOpenId),
          eq(alarmManagement.status, "pending"),
        ),
      )
      .orderBy(desc(alarmManagement.id))
      .limit(1);
    return row;
  });
}

/**
 * O idoso aceita: o pedido vira `active` e nasce a lista gerenciada na versão 1,
 * já confirmada (`appliedVersion = 1`, `appliedAlarms` = a própria lista). Tudo
 * ou nada. `CONFLICT` se o pedido deixou de estar pendente (cancelado ou vencido
 * enquanto o idoso lia o diálogo) ou não é deste idoso.
 */
export async function activateManagement(
  id: number,
  list: ManagedAlarm[],
  monitoredOpenId: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db.transaction(async (tx) => {
    await lockMonitored(tx, monitoredOpenId);
    const now = new Date();
    const res = await tx
      .update(alarmManagement)
      .set({ status: "active", respondedAt: now })
      .where(
        and(
          eq(alarmManagement.id, id),
          eq(alarmManagement.monitoredOpenId, monitoredOpenId),
          eq(alarmManagement.status, "pending"),
        ),
      );
    if (affectedRows(res) === 0) {
      throw new TRPCError({ code: "CONFLICT", message: "Este pedido não está mais aberto." });
    }
    await tx.insert(managedAlarmLists).values({
      monitoredOpenId,
      version: 1,
      alarms: list,
      appliedVersion: 1,
      appliedAlarms: list,
      failedAlarmIds: [],
      appliedAt: now,
      updatedByOpenId: monitoredOpenId,
    });
  });
}

/**
 * Encerra o pedido/acordo com o motivo, apaga a lista gerenciada do idoso (a
 * lista no celular continua e volta a ser dele) e, se for recusa, registra
 * também `respondedAt`. Idempotente: acordo que já terminou não é tocado (o
 * motivo original fica, e uma lista de um acordo NOVO do mesmo idoso não é
 * apagada por engano).
 */
export async function endManagement(id: number, reason: EndedReason): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [current] = await db
    .select({ monitoredOpenId: alarmManagement.monitoredOpenId })
    .from(alarmManagement)
    .where(eq(alarmManagement.id, id))
    .limit(1);
  if (!current) return;

  await db.transaction(async (tx) => {
    await lockMonitored(tx, current.monitoredOpenId);
    const now = new Date();
    const res = await tx
      .update(alarmManagement)
      .set({
        status: "ended",
        endedReason: reason,
        endedAt: now,
        ...(reason === "declined" ? { respondedAt: now } : {}),
      })
      .where(and(eq(alarmManagement.id, id), ne(alarmManagement.status, "ended")));
    if (affectedRows(res) === 0) return;
    await tx.delete(managedAlarmLists).where(eq(managedAlarmLists.monitoredOpenId, current.monitoredOpenId));
  });
}
```

**3b.** Criar `server/db-managed-alarm-list.ts`:

```ts
/**
 * db-managed-alarm-list.ts
 *
 * Persistência da lista gerenciada (tabela `managed_alarm_lists`, ver
 * drizzle/schema.ts): uma linha por idoso com acordo ativo, versionada.
 *
 *  - `version` sobe a cada gravação do cuidador; a gravação é um
 *    `UPDATE … WHERE version = baseVersion`, então duas gravações em cima da mesma
 *    versão não se sobrescrevem: a segunda não acha linha e vira conflito.
 *  - `appliedVersion`/`appliedAlarms`/`failedAlarmIds` são o que o celular
 *    confirmou. O servidor só cobra (dead man's switch) o que foi confirmado.
 *  - `updatedAt` é o momento da última gravação do cuidador: o ack e a marca da
 *    notificação de reserva NÃO o mexem (o MySQL só pula o `ON UPDATE` quando a
 *    coluna aparece no SET, por isso elas se copiam para si mesmas).
 *
 * Leituras devolvem null/[] sem banco; escritas lançam `DATABASE_UNAVAILABLE`.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { managedAlarmLists, type ManagedAlarmListRow } from "../drizzle/schema";
import { VISIBLE_NOTICE_DELAY_MINUTES, type ManagedAlarm } from "../shared/managed-alarm.js";
import { getDb } from "./db";

/** A versão que o cuidador via já não é a atual (outro cuidador/aba gravou antes, ou a lista acabou). */
export class ManagedListConflictError extends Error {
  constructor(message = "A lista mudou.") {
    super(message);
    this.name = "ManagedListConflictError";
  }
}

function affectedRows(res: unknown): number {
  return (
    (res as { affectedRows?: number }).affectedRows ??
    (res as Array<{ affectedRows?: number }>)[0]?.affectedRows ??
    0
  );
}

export async function getManagedList(monitoredOpenId: string): Promise<ManagedAlarmListRow | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(managedAlarmLists)
    .where(eq(managedAlarmLists.monitoredOpenId, monitoredOpenId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Grava a lista nova em cima de `baseVersion` e devolve a nova versão.
 * `ManagedListConflictError` se a versão atual já não é `baseVersion` (ou se a
 * lista não existe mais).
 */
export async function writeManagedList(
  monitoredOpenId: string,
  baseVersion: number,
  alarms: ManagedAlarm[],
  updatedByOpenId: string,
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const res = await db
    .update(managedAlarmLists)
    .set({ version: baseVersion + 1, alarms, updatedByOpenId })
    .where(
      and(
        eq(managedAlarmLists.monitoredOpenId, monitoredOpenId),
        eq(managedAlarmLists.version, baseVersion),
      ),
    );
  if (affectedRows(res) === 0) throw new ManagedListConflictError();
  return baseVersion + 1;
}

/**
 * O celular confirma que agendou a `version`. Só vale se for a versão ATUAL da
 * lista e maior que a já confirmada: então `appliedAlarms` vira a lista dessa
 * versão (cópia de `alarms`, no mesmo comando, sem janela para outra gravação
 * entrar no meio) e `failedAlarmIds` os que o sistema recusou. Ack de versão
 * velha, de versão que já foi superada ou de lista que não existe é ignorado.
 * Devolve se gravou.
 */
export async function recordManagedAck(
  monitoredOpenId: string,
  version: number,
  failedAlarmIds: string[],
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const res = await db
    .update(managedAlarmLists)
    .set({
      appliedVersion: version,
      appliedAlarms: sql`${managedAlarmLists.alarms}`,
      failedAlarmIds: [...new Set(failedAlarmIds)],
      appliedAt: new Date(),
      updatedAt: sql`${managedAlarmLists.updatedAt}`,
    })
    .where(
      and(
        eq(managedAlarmLists.monitoredOpenId, monitoredOpenId),
        eq(managedAlarmLists.version, version),
        lt(managedAlarmLists.appliedVersion, version),
      ),
    );
  return affectedRows(res) > 0;
}

/**
 * Listas cuja versão o celular ainda não confirmou há mais de 10 minutos e para
 * as quais ainda não foi mandada a notificação visível de reserva.
 */
export async function getListsNeedingVisibleNotice(now: Date): Promise<ManagedAlarmListRow[]> {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(now.getTime() - VISIBLE_NOTICE_DELAY_MINUTES * 60 * 1000);
  return db
    .select()
    .from(managedAlarmLists)
    .where(
      and(
        lt(managedAlarmLists.appliedVersion, managedAlarmLists.version),
        lt(managedAlarmLists.visibleNoticeSentForVersion, managedAlarmLists.version),
        lt(managedAlarmLists.updatedAt, cutoff),
      ),
    );
}

/** Marca que a notificação visível da `version` já saiu (nunca volta atrás). */
export async function markVisibleNoticeSent(monitoredOpenId: string, version: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .update(managedAlarmLists)
    .set({ visibleNoticeSentForVersion: version, updatedAt: sql`${managedAlarmLists.updatedAt}` })
    .where(
      and(
        eq(managedAlarmLists.monitoredOpenId, monitoredOpenId),
        lt(managedAlarmLists.visibleNoticeSentForVersion, version),
      ),
    );
}
```

**3c. Exportação (LGPD Art. 18, V).** Em `server/routers.ts`: (1) depois de `import { getActiveCaregiversForMonitored } from "./db-links";` acrescentar

```ts
import { getManagementHistory } from "./db-alarm-management";
import { getManagedList } from "./db-managed-alarm-list";
```

(2) em `userData.export`, trocar

```ts
        cuidadores,
        alteracoesDeAlarmes,
      ] = await Promise.all([
```

por

```ts
        cuidadores,
        alteracoesDeAlarmes,
        acordosDeGerenciamento,
        listaGerenciada,
      ] = await Promise.all([
```

(3) trocar

```ts
        getRecentAlarmChanges(openId, LIMITE_EXPORTACAO),
      ]);
```

por

```ts
        getRecentAlarmChanges(openId, LIMITE_EXPORTACAO),
        getManagementHistory(openId),
        getManagedList(openId),
      ]);
```

(4) no objeto devolvido, trocar

```ts
        historicoDeAlteracoesDeAlarmes: alteracoesDeAlarmes,
        alertasEnviados,
```

por

```ts
        historicoDeAlteracoesDeAlarmes: alteracoesDeAlarmes,
        acordosDeGerenciamento,
        listaGerenciada: listaGerenciada ?? null,
        alertasEnviados,
```

Em `lib/_core/data-export.ts`, no `ExportServerData`, trocar

```ts
  historicoDeAlteracoesDeAlarmes: unknown[];
  alertasEnviados: unknown[];
```

por

```ts
  historicoDeAlteracoesDeAlarmes: unknown[];
  acordosDeGerenciamento: unknown[];
  listaGerenciada: unknown;
  alertasEnviados: unknown[];
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/db-alarm-management.test.ts tests/db-managed-alarm-list.test.ts tests/user-data-export.test.ts tests/data-export.test.ts tests/alarm-changes-lifecycle.test.ts`
Esperado: PASS (34 + 28 testes novos; os de exportação e o `alarm-changes-lifecycle` continuam verdes).

Prova de que os testes de corrida pegam o defeito (não commitar): remover temporariamente a linha `await lockMonitored(tx, monitoredOpenId);` de `createManagementRequest` deve fazer falharem "trava a linha do idoso ANTES de olhar e gravar o pedido" e "CORRIDA: dois pedidos ao mesmo tempo para o mesmo idoso, só um nasce". Desfazer em seguida.

- [ ] **Passo 5: Suíte, tipos e commit**

```bash
pnpm test && pnpm check
```

(só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/db-alarm-management.ts server/db-managed-alarm-list.ts server/routers.ts lib/_core/data-export.ts tests/_fake-mysql.ts tests/db-alarm-management.test.ts tests/db-managed-alarm-list.test.ts tests/user-data-export.test.ts tests/data-export.test.ts
git commit -m "feat(db): acordo e lista gerenciada no banco (trava por idoso, versão, ack) e exportação dos dois" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 5: Push silencioso e recibos, token com dono, mudanças de alarme com autor

**Depende de:** Tarefa 2 (colunas `alarm_changes.changedByOpenId` e o valor `created` do enum em `drizzle/schema.ts`)

**Files:**
- Modify: `server/push.ts` (`sendExpoDataPush`, `fetchExpoReceipts`)
- Modify: `server/db-push.ts` (`getPushTokensWithOwner`, `countPushTokens`)
- Modify: `server/_core/alarm-diff.ts` (tipo `created`, `changedByOpenId`, `buildAlarmChangePush` com autor)
- Modify: `server/alarm-changes.ts` (`recordCaregiverAlarmChanges`; `pushToCaregivers` aceita um autor a excluir)
- Modify: `server/routers-links.ts` (`link.getMonitoredAlerts` devolve `changedByOpenId` e `changedByName` em cada mudança)
- Test: `tests/push-data.test.ts` (novo), `tests/db-push-owner.test.ts` (novo), `tests/alarm-changes-caregiver.test.ts` (novo), `tests/alarm-diff.test.ts` (acrescenta), `tests/link.alerts-and-revoke.test.ts` (ajusta)

**Interfaces:**
- Consumes: `deletePushToken` (`server/db-push`), `getActiveCaregiversForMonitored` (`server/db-links`), `insertAlarmChanges` (`server/db-alarm-changes`), `getUserByOpenId` (`server/db`), tipo `InsertAlarmChange` com `changedByOpenId` (Tarefa 2).
- Produces:
  - `sendExpoDataPush(tokens: string[], data: Record<string, unknown>): Promise<{ token: string; ticketId: string | null; deviceNotRegistered: boolean }[]>` e `fetchExpoReceipts(ticketIds: string[]): Promise<Record<string, { status: "ok" | "error"; details?: { error?: string } }>>` (`server/push.ts`)
  - `getPushTokensWithOwner(openIds: string[]): Promise<{ token: string; openId: string }[]>` e `countPushTokens(openId: string): Promise<number>` (`server/db-push.ts`)
  - `AlarmChangeType` ganha `"created"`; `AlarmChange` ganha `changedByOpenId?: string | null`; `buildAlarmChangePush(personName: string, changes: AlarmChange[], actorName?: string)` (`server/_core/alarm-diff.ts`)
  - `recordCaregiverAlarmChanges(args: { monitoredOpenId: string; authorOpenId: string; authorName: string; personName: string; changes: AlarmChange[] }): Promise<void>` (`server/alarm-changes.ts`)
  - `link.getMonitoredAlerts().changes[]` ganha `changedByOpenId: string | null` e `changedByName: string | null` (`null` = a própria pessoa mudou; `"Você"` = o cuidador que está chamando; senão o nome do outro cuidador, ou `"Outro cuidador"` se o nome não puder ser consultado — a falha na consulta nunca derruba a lista). A Tarefa 16 usa estes dois campos em `lib/caregiver-format.ts`.

Nenhuma fábrica de mock existente precisa mudar nesta tarefa: nenhum módulo que os testes antigos importam passa a usar um export novo (os exports novos só são usados pelas Tarefas 6 a 11).

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/push-data.test.ts`:

```ts
/**
 * push-data.test.ts
 *
 * Push silencioso (só dados) e leitura de recibos da Expo. O silencioso carrega
 * a lista gerenciada até o celular do idoso e a verificação diária de "app
 * removido"; nenhum dos dois pode virar notificação visível nem apagar token
 * por conta própria (quem chama decide).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deletePushToken = vi.fn(async (_token: string) => {});
vi.mock("../server/db-push", () => ({
  deletePushToken: (token: string) => deletePushToken(token),
}));

import { fetchExpoReceipts, sendExpoDataPush } from "../server/push";

function mockFetchJson(body: unknown, ok = true, status = 200) {
  return vi.spyOn(global, "fetch").mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as unknown as Response);
}

beforeEach(() => {
  deletePushToken.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendExpoDataPush", () => {
  it("sem tokens não chama a Expo e devolve lista vazia", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await expect(sendExpoDataPush([], { type: "ping" })).resolves.toEqual([]);
    await expect(sendExpoDataPush([""], { type: "ping" })).resolves.toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("manda só dados: contentAvailable, prioridade alta, sem título, corpo nem som", async () => {
    const fetchSpy = mockFetchJson({ data: [{ status: "ok", id: "t-1" }] });

    await sendExpoDataPush(["ExpoTok[a]"], { type: "managed_alarms_updated", version: 3 });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://exp.host/--/api/v2/push/send");
    const messages = JSON.parse((init as RequestInit).body as string);
    expect(messages).toEqual([
      {
        to: "ExpoTok[a]",
        data: { type: "managed_alarms_updated", version: 3 },
        _contentAvailable: true,
        priority: "high",
      },
    ]);
    expect(messages[0]).not.toHaveProperty("title");
    expect(messages[0]).not.toHaveProperty("body");
    expect(messages[0]).not.toHaveProperty("sound");
  });

  it("devolve o ticket de cada token e marca DeviceNotRegistered sem apagar o token", async () => {
    mockFetchJson({
      data: [
        { status: "ok", id: "t-1" },
        { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "MessageTooBig" },
      ],
    });

    const result = await sendExpoDataPush(["a", "b", "c"], { type: "ping" });

    expect(result).toEqual([
      { token: "a", ticketId: "t-1", deviceNotRegistered: false },
      { token: "b", ticketId: null, deviceNotRegistered: true },
      { token: "c", ticketId: null, deviceNotRegistered: false },
    ]);
    expect(deletePushToken).not.toHaveBeenCalled();
  });

  it("HTTP de erro devolve os tokens sem ticket (nada some em silêncio)", async () => {
    mockFetchJson({}, false, 500);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await sendExpoDataPush(["a", "b"], { type: "ping" });

    expect(result).toEqual([
      { token: "a", ticketId: null, deviceNotRegistered: false },
      { token: "b", ticketId: null, deviceNotRegistered: false },
    ]);
  });

  it("erro de rede devolve os tokens sem ticket e loga só o nome do erro", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("segredo-no-texto-do-erro"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await sendExpoDataPush(["a"], { type: "ping" });

    expect(result).toEqual([{ token: "a", ticketId: null, deviceNotRegistered: false }]);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("segredo-no-texto-do-erro");
    expect(JSON.stringify(errSpy.mock.calls)).toContain("TypeError");
  });

  it("separa em lotes de no máximo 100 mensagens", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_url, opts) => {
      const msgs = JSON.parse((opts as RequestInit).body as string) as unknown[];
      return {
        ok: true,
        json: async () => ({ data: msgs.map((_, i) => ({ status: "ok", id: `t${i}` })) }),
      } as unknown as Response;
    });
    const tokens = Array.from({ length: 250 }, (_, i) => `tok${i}`);

    const result = await sendExpoDataPush(tokens, { type: "ping" });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(250);
    expect(result[249].token).toBe("tok249");
  });
});

describe("fetchExpoReceipts", () => {
  it("sem ids não chama a Expo", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await expect(fetchExpoReceipts([])).resolves.toEqual({});
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("consulta os recibos e devolve o mapa id -> recibo", async () => {
    const fetchSpy = mockFetchJson({
      data: {
        "t-1": { status: "ok" },
        "t-2": { status: "error", message: "x", details: { error: "DeviceNotRegistered" } },
      },
    });

    const result = await fetchExpoReceipts(["t-1", "t-2"]);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toBe("https://exp.host/--/api/v2/push/getReceipts");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ids: ["t-1", "t-2"] });
    expect(result["t-1"]).toEqual({ status: "ok" });
    expect(result["t-2"].details?.error).toBe("DeviceNotRegistered");
  });

  it("HTTP de erro devolve mapa vazio", async () => {
    mockFetchJson({}, false, 503);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(fetchExpoReceipts(["t-1"])).resolves.toEqual({});
  });

  it("erro de rede devolve mapa vazio e loga só o nome do erro", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new TypeError("segredo-no-texto-do-erro"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(fetchExpoReceipts(["t-1"])).resolves.toEqual({});
    expect(JSON.stringify(warnSpy.mock.calls)).not.toContain("segredo-no-texto-do-erro");
    expect(JSON.stringify(warnSpy.mock.calls)).toContain("TypeError");
  });

  it("junta o resultado de vários lotes", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (_url, opts) => {
      const { ids } = JSON.parse((opts as RequestInit).body as string) as { ids: string[] };
      return {
        ok: true,
        json: async () => ({ data: Object.fromEntries(ids.map((id) => [id, { status: "ok" }])) }),
      } as unknown as Response;
    });
    const ids = Array.from({ length: 650 }, (_, i) => `t${i}`);

    const result = await fetchExpoReceipts(ids);

    expect(fetchSpy).toHaveBeenCalledTimes(3); // 300 + 300 + 50
    expect(Object.keys(result)).toHaveLength(650);
  });
});
```

Criar `tests/db-push-owner.test.ts`:

```ts
/**
 * db-push-owner.test.ts
 *
 * getPushTokensWithOwner (qual conta é dona de cada token — o ping diário
 * precisa saber de quem foi o token que morreu) e countPushTokens (conta sem
 * nenhum token depois de um DeviceNotRegistered = app removido).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let rows: unknown[] = [];
let selectCalls = 0;

const fakeDb = {
  select: () => {
    selectCalls++;
    const chain: any = {
      from: () => chain,
      where: () => Promise.resolve(rows),
    };
    return chain;
  },
};

const getDb = vi.fn(async (): Promise<unknown> => fakeDb);
vi.mock("../server/db", () => ({ getDb: () => getDb() }));

import { countPushTokens, getPushTokensWithOwner } from "../server/db-push";

beforeEach(() => {
  rows = [];
  selectCalls = 0;
  getDb.mockReset();
  getDb.mockImplementation(async () => fakeDb);
});

describe("getPushTokensWithOwner", () => {
  it("lista vazia de contas não consulta o banco", async () => {
    await expect(getPushTokensWithOwner([])).resolves.toEqual([]);
    expect(selectCalls).toBe(0);
  });

  it("devolve token e dono de cada linha", async () => {
    rows = [
      { token: "ExpoTok[a]", openId: "maria" },
      { token: "ExpoTok[b]", openId: "joao" },
    ];
    await expect(getPushTokensWithOwner(["maria", "joao"])).resolves.toEqual(rows);
  });

  it("sem banco devolve vazio", async () => {
    getDb.mockImplementation(async () => null);
    await expect(getPushTokensWithOwner(["maria"])).resolves.toEqual([]);
  });
});

describe("countPushTokens", () => {
  it("devolve o total de tokens da conta", async () => {
    rows = [{ n: 2 }];
    await expect(countPushTokens("maria")).resolves.toBe(2);
  });

  it("conta sem linhas devolve 0", async () => {
    rows = [];
    await expect(countPushTokens("maria")).resolves.toBe(0);
  });

  it("sem banco devolve 0", async () => {
    getDb.mockImplementation(async () => null);
    await expect(countPushTokens("maria")).resolves.toBe(0);
  });
});
```

Criar `tests/alarm-changes-caregiver.test.ts`:

```ts
/**
 * alarm-changes-caregiver.test.ts
 *
 * recordCaregiverAlarmChanges: o cuidador do acordo mudou a lista do idoso.
 * Grava com o cuidador como autor e avisa SÓ os outros cuidadores vinculados
 * (o autor sabe o que fez). Best-effort: nunca derruba a gravação da lista.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-changes", () => ({
  insertAlarmChanges: vi.fn(async () => undefined),
  getRecentAlarmChanges: vi.fn(async () => []),
}));
vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => []),
}));
vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async () => []),
}));
vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 1),
}));

import { recordCaregiverAlarmChanges } from "../server/alarm-changes";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbLinks from "../server/db-links";
import * as dbPush from "../server/db-push";
import * as push from "../server/push";
import type { AlarmChange } from "../server/_core/alarm-diff";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const created: AlarmChange = {
  alarmId: "a1",
  alarmDescription: "Losartana",
  changeType: "created",
  oldTime: null,
  newTime: "08:00",
};

function args(over: Partial<Parameters<typeof recordCaregiverAlarmChanges>[0]> = {}) {
  return {
    monitoredOpenId: "maria-1",
    authorOpenId: "ana",
    authorName: "Ana",
    personName: "Maria",
    changes: [created],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([
    { caregiverOpenId: "ana" },
    { caregiverOpenId: "bia" },
  ] as never);
  vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([{ token: "ExpoTok[bia]" }] as never);
});

describe("recordCaregiverAlarmChanges", () => {
  it("grava a mudança com o cuidador como autor", async () => {
    await recordCaregiverAlarmChanges(args());

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledWith([
      expect.objectContaining({
        openId: "maria-1",
        alarmId: "a1",
        alarmDescription: "Losartana",
        changeType: "created",
        newTime: "08:00",
        changedByOpenId: "ana",
      }),
    ]);
  });

  it("avisa só os OUTROS cuidadores, com o nome do autor no texto", async () => {
    await recordCaregiverAlarmChanges(args());
    await flush();

    expect(dbPush.getPushTokensForOpenIds).toHaveBeenCalledWith(["bia"]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [tokens, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(tokens).toEqual(["ExpoTok[bia]"]);
    expect(message.body).toBe('Ana criou o lembrete "Losartana" (08:00) para Maria.');
    expect(message.data).toMatchObject({ type: "alarm_changed", url: "/(caregiver-tabs)/alerts" });
  });

  it("se o autor é o único cuidador vinculado, grava mas não manda push", async () => {
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([
      { caregiverOpenId: "ana" },
    ] as never);

    await recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-2" }));
    await flush();

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("sem mudanças não grava nem avisa", async () => {
    await recordCaregiverAlarmChanges(args({ changes: [] }));
    await flush();

    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("falha ao gravar não lança e o aviso ainda sai", async () => {
    vi.mocked(dbChanges.insertAlarmChanges).mockRejectedValueOnce(new Error("DB fora do ar"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-3" }))).resolves.toBeUndefined();
    await flush();

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("falha no push não lança", async () => {
    vi.mocked(push.sendExpoPush).mockRejectedValueOnce(new Error("rede"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-4" }))).resolves.toBeUndefined();
    await flush();
  });

  it("limita o push a 5 por minuto por idoso, mas grava todas as mudanças", async () => {
    for (let i = 0; i < 6; i++) {
      await recordCaregiverAlarmChanges(args({ monitoredOpenId: "maria-5" }));
      await flush();
    }
    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(6);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(5);
  });
});
```

Em `tests/alarm-diff.test.ts`, depois do `describe("buildAlarmChangePush", ...)` (termina logo antes de `describe("pickPersonName"`), acrescentar:

```ts
describe("buildAlarmChangePush — com o autor da mudança (cuidador)", () => {
  const change = (over: Partial<AlarmChange>): AlarmChange => ({
    alarmId: "a1",
    alarmDescription: "Losartana",
    changeType: "deleted",
    oldTime: "08:00",
    newTime: null,
    ...over,
  });

  it("criação", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [change({ changeType: "created", oldTime: null, newTime: "08:00" })],
      "Ana"
    );
    expect(push).toEqual({
      title: "Lembrete alterado — Vigora",
      body: 'Ana criou o lembrete "Losartana" (08:00) para Maria.',
    });
  });

  it("exclusão", () => {
    expect(buildAlarmChangePush("Maria", [change({})], "Ana")?.body).toBe(
      'Ana apagou o lembrete "Losartana" de Maria.'
    );
  });

  it("desativação", () => {
    const push = buildAlarmChangePush("Maria", [change({ changeType: "disabled", newTime: "08:00" })], "Ana");
    expect(push?.body).toBe('Ana desativou o lembrete "Losartana" de Maria.');
  });

  it("mudança de horário", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [change({ changeType: "rescheduled", oldTime: "08:00", newTime: "09:30" })],
      "Ana"
    );
    expect(push?.body).toBe('Ana mudou o horário de "Losartana" de Maria para 09:30.');
  });

  it("mudança só de dias", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [change({ changeType: "rescheduled", oldTime: "08:00", newTime: "08:00" })],
      "Ana"
    );
    expect(push?.body).toBe('Ana mudou os dias do lembrete "Losartana" de Maria.');
  });

  it("várias mudanças", () => {
    const push = buildAlarmChangePush(
      "Maria",
      [
        change({ alarmId: "a1", alarmDescription: "Losartana" }),
        change({ alarmId: "a2", alarmDescription: "Metformina" }),
        change({ alarmId: "a3", alarmDescription: "Vitamina D" }),
      ],
      "Ana"
    );
    expect(push).toEqual({
      title: "Lembretes alterados — Vigora",
      body: 'Ana alterou 3 lembretes de Maria: "Losartana", "Metformina" e mais 1.',
    });
  });

  it("sem autor o texto antigo não muda", () => {
    expect(buildAlarmChangePush("Maria", [change({})])?.body).toBe('Maria excluiu o lembrete "Losartana".');
  });

  it("criação sem autor (não acontece pelo backup, mas não quebra)", () => {
    const push = buildAlarmChangePush("Maria", [change({ changeType: "created", oldTime: null, newTime: "08:00" })]);
    expect(push?.body).toBe('Maria criou o lembrete "Losartana".');
  });
});
```

Em `tests/link.alerts-and-revoke.test.ts`:

1. No teste "devolve as mudanças do monitorado vinculado, com createdAt em epoch-ms", acrescentar `changedByOpenId: null,` e `changedByName: null,` depois de `newTime: null,` dentro do objeto esperado de `result.changes`.
2. Acrescentar, junto dos outros imports no topo (depois de `import * as dbPush from "../server/db-push";`): `import * as accountDb from "../server/db";`
3. Logo depois do teste do item 1, acrescentar:

```ts
  it("diz quem fez a mudança: a própria pessoa = null, este cuidador = Você, outro cuidador = o nome dele", async () => {
    const row = (id: number, changedByOpenId: string | null, changeType: string) => ({
      id,
      openId: "vovo",
      alarmId: `a${id}`,
      alarmDescription: "Metformina",
      changeType,
      oldTime: null,
      newTime: "20:00",
      changedByOpenId,
      createdAt: new Date("2026-10-05T12:00:00Z"),
    });
    vi.mocked(dbChanges.getRecentAlarmChanges).mockResolvedValueOnce([
      row(1, null, "deleted"),
      row(2, "cg-1", "created"),
      row(3, "cg-9", "created"),
    ] as never);
    vi.mocked(accountDb.getUserByOpenId).mockResolvedValueOnce({ name: "Ana", openId: "cg-9" } as never);

    const caller = appRouter.createCaller(makeCtx(makeUser("cg-1", "caregiver")));
    const result = await caller.link.getMonitoredAlerts();

    expect(result.changes.map((c) => c.changedByName)).toEqual([null, "Você", "Ana"]);
    // só o outro cuidador é consultado; o chamador e a própria pessoa não
    expect(accountDb.getUserByOpenId).toHaveBeenCalledTimes(1);
    expect(accountDb.getUserByOpenId).toHaveBeenCalledWith("cg-9");
  });

  it("autor que não dá para consultar aparece como \"Outro cuidador\" e não derruba a lista", async () => {
    vi.mocked(dbChanges.getRecentAlarmChanges).mockResolvedValueOnce([
      {
        id: 4, openId: "vovo", alarmId: "a4", alarmDescription: "X", changeType: "deleted",
        oldTime: "08:00", newTime: null, changedByOpenId: "cg-sumiu", createdAt: new Date("2026-10-05T12:00:00Z"),
      },
    ] as never);
    vi.mocked(accountDb.getUserByOpenId).mockRejectedValueOnce(new Error("DB fora do ar"));

    const caller = appRouter.createCaller(makeCtx(makeUser("cg-1", "caregiver")));
    const result = await caller.link.getMonitoredAlerts();

    expect(result.changes[0].changedByName).toBe("Outro cuidador");
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/push-data.test.ts tests/db-push-owner.test.ts tests/alarm-changes-caregiver.test.ts tests/alarm-diff.test.ts tests/link.alerts-and-revoke.test.ts`
Esperado: FAIL com `sendExpoDataPush is not a function`, `fetchExpoReceipts is not a function`, `getPushTokensWithOwner is not a function`, `recordCaregiverAlarmChanges is not a function` e textos com autor diferentes dos atuais.

- [ ] **Passo 3: Implementar**

**3a. `server/push.ts`.** Logo depois de `const MAX_BATCH = 100;` acrescentar:

```ts
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

// A Expo aceita até 1000 ids por consulta de recibos; 300 mantém a requisição pequena.
const RECEIPT_BATCH = 300;
```

e, no fim do arquivo (depois de `sendExpoPush`), acrescentar:

```ts
export interface DataPushResult {
  token: string;
  /** Id do ticket aceito pela Expo (serve para consultar o recibo depois); null se não aceitou. */
  ticketId: string | null;
  /** A Expo disse, já no ticket, que o token não existe mais. NÃO apagamos aqui: quem chama decide. */
  deviceNotRegistered: boolean;
}

/**
 * Push SILENCIOSO (só dados): acorda o app do idoso para buscar a lista
 * gerenciada (`managed_alarms_updated`) ou provar que ainda está instalado
 * (`ping`). Sem título, corpo nem som — não aparece nada na tela.
 *
 * Diferente de sendExpoPush: devolve o resultado de cada token (para o ping
 * diário saber quem morreu) e não apaga token sozinho. Falha de rede ou HTTP
 * devolve o token com `ticketId: null` — nunca lança, nunca some em silêncio.
 * Logs só com o nome do erro (a mensagem pode trazer o token).
 */
export async function sendExpoDataPush(
  tokens: string[],
  data: Record<string, unknown>
): Promise<DataPushResult[]> {
  const valid = tokens.filter((t) => !!t);
  const results: DataPushResult[] = [];

  for (const batch of chunk(valid, MAX_BATCH)) {
    const messages = batch.map((to) => ({
      to,
      data,
      _contentAvailable: true,
      priority: "high",
    }));
    const notSent = (): DataPushResult[] =>
      batch.map((token) => ({ token, ticketId: null, deviceNotRegistered: false }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!res.ok) {
        console.warn(`[Push] Expo data push request failed: HTTP ${res.status}`);
        results.push(...notSent());
        continue;
      }

      const body = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];
      batch.forEach((token, i) => {
        const ticket = tickets[i];
        results.push({
          token,
          ticketId: ticket?.status === "ok" && ticket.id ? ticket.id : null,
          deviceNotRegistered:
            ticket?.status === "error" && ticket.details?.error === "DeviceNotRegistered",
        });
      });
    } catch (error) {
      console.error(
        `[Push] Network error sending data push:`,
        error instanceof Error ? error.name : "Error"
      );
      results.push(...notSent());
    }
  }

  return results;
}

export interface ExpoReceipt {
  status: "ok" | "error";
  details?: { error?: string };
}

/**
 * Consulta os recibos de entrega de tickets antigos. É nos recibos que a Expo
 * conta que o aparelho não existe mais (`DeviceNotRegistered`) — o ticket só
 * diz que a Expo aceitou a mensagem. Falha de rede ou HTTP não lança: o lote
 * é pulado e o chamador simplesmente não vê aqueles recibos nesta rodada.
 */
export async function fetchExpoReceipts(
  ticketIds: string[]
): Promise<Record<string, ExpoReceipt>> {
  const ids = ticketIds.filter((id) => !!id);
  const out: Record<string, ExpoReceipt> = {};

  for (const batch of chunk(ids, RECEIPT_BATCH)) {
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids: batch }),
      });
      if (!res.ok) {
        console.warn(`[Push] Expo receipts request failed: HTTP ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { data?: Record<string, ExpoReceipt> };
      Object.assign(out, body.data ?? {});
    } catch (error) {
      console.warn(
        `[Push] Network error fetching receipts:`,
        error instanceof Error ? error.name : "Error"
      );
    }
  }

  return out;
}
```

**3b. `server/db-push.ts`.** Trocar a linha de import do drizzle:

```ts
import { and, eq, inArray, or } from "drizzle-orm";
```
por
```ts
import { and, count, eq, inArray, or } from "drizzle-orm";
```
e, logo depois da função `getPushTokensForOpenIds`, acrescentar:

```ts
/**
 * Token + dono de cada token (getPushTokensForOpenIds devolve a linha inteira;
 * aqui só o que o ping diário precisa para saber de QUEM foi o token que morreu).
 */
export async function getPushTokensWithOwner(
  openIds: string[]
): Promise<{ token: string; openId: string }[]> {
  if (openIds.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ token: pushTokens.token, openId: pushTokens.openId })
    .from(pushTokens)
    .where(inArray(pushTokens.openId, openIds));
}

/** Quantos tokens a conta tem. Zero depois de um DeviceNotRegistered = app removido. */
export async function countPushTokens(openId: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ n: count() })
    .from(pushTokens)
    .where(eq(pushTokens.openId, openId));
  return Number(rows[0]?.n ?? 0);
}
```

**3c. `server/_core/alarm-diff.ts`.** Dois trechos.

(i) Tipos. Trocar:

```ts
export type AlarmChangeType = "deleted" | "disabled" | "rescheduled";

export interface AlarmChange {
  alarmId: string;
  alarmDescription: string;
  changeType: AlarmChangeType;
  oldTime: string | null;
  newTime: string | null;
}
```
por:
```ts
export type AlarmChangeType = "created" | "deleted" | "disabled" | "rescheduled";

export interface AlarmChange {
  alarmId: string;
  alarmDescription: string;
  changeType: AlarmChangeType;
  oldTime: string | null;
  newTime: string | null;
  /**
   * Quem fez a mudança. O diff do backup (`diffAlarms`) nunca preenche: ali
   * quem mudou foi o próprio idoso (nulo). Só `recordCaregiverAlarmChanges`
   * grava o cuidador. `created` também só nasce lá: o backup não anuncia criação.
   */
  changedByOpenId?: string | null;
}
```

(ii) A função `buildAlarmChangePush` inteira. Trocar:

```ts
export function buildAlarmChangePush(
  personName: string,
  changes: AlarmChange[]
): { title: string; body: string } | null {
  if (changes.length === 0) return null;

  if (changes.length === 1) {
    const c = changes[0];
    const name = shortName(c);
    let body: string;
    if (c.changeType === "deleted") {
      body = `${personName} excluiu o lembrete "${name}".`;
    } else if (c.changeType === "disabled") {
      body = `${personName} desativou o lembrete "${name}".`;
    } else if (c.oldTime && c.newTime && c.oldTime !== c.newTime) {
      body = `${personName} mudou o horário de "${name}" para ${c.newTime}.`;
    } else {
      body = `${personName} mudou os dias do lembrete "${name}".`;
    }
    return { title: "Lembrete alterado — Vigora", body };
  }

  const shown = changes
    .slice(0, 2)
    .map((c) => `"${shortName(c)}"`)
    .join(", ");
  const rest = changes.length - 2;
  return {
    title: "Lembretes alterados — Vigora",
    body: `${personName} alterou ${changes.length} lembretes: ${shown}${rest > 0 ? ` e mais ${rest}` : ""}.`,
  };
}
```
por:
```ts
export function buildAlarmChangePush(
  personName: string,
  changes: AlarmChange[],
  actorName?: string
): { title: string; body: string } | null {
  if (changes.length === 0) return null;

  if (changes.length === 1) {
    const c = changes[0];
    const name = shortName(c);
    const timeChanged = !!c.oldTime && !!c.newTime && c.oldTime !== c.newTime;
    let body: string;
    if (actorName) {
      // Mudança feita por um cuidador: o texto diz quem fez e de quem é o lembrete.
      if (c.changeType === "created") {
        body = `${actorName} criou o lembrete "${name}"${c.newTime ? ` (${c.newTime})` : ""} para ${personName}.`;
      } else if (c.changeType === "deleted") {
        body = `${actorName} apagou o lembrete "${name}" de ${personName}.`;
      } else if (c.changeType === "disabled") {
        body = `${actorName} desativou o lembrete "${name}" de ${personName}.`;
      } else if (timeChanged) {
        body = `${actorName} mudou o horário de "${name}" de ${personName} para ${c.newTime}.`;
      } else {
        body = `${actorName} mudou os dias do lembrete "${name}" de ${personName}.`;
      }
    } else if (c.changeType === "created") {
      body = `${personName} criou o lembrete "${name}".`;
    } else if (c.changeType === "deleted") {
      body = `${personName} excluiu o lembrete "${name}".`;
    } else if (c.changeType === "disabled") {
      body = `${personName} desativou o lembrete "${name}".`;
    } else if (timeChanged) {
      body = `${personName} mudou o horário de "${name}" para ${c.newTime}.`;
    } else {
      body = `${personName} mudou os dias do lembrete "${name}".`;
    }
    return { title: "Lembrete alterado — Vigora", body };
  }

  const shown = changes
    .slice(0, 2)
    .map((c) => `"${shortName(c)}"`)
    .join(", ");
  const rest = changes.length - 2;
  const tail = `${shown}${rest > 0 ? ` e mais ${rest}` : ""}`;
  return {
    title: "Lembretes alterados — Vigora",
    body: actorName
      ? `${actorName} alterou ${changes.length} lembretes de ${personName}: ${tail}.`
      : `${personName} alterou ${changes.length} lembretes: ${tail}.`,
  };
}
```

**3d. `server/alarm-changes.ts`.** Dois trechos.

(i) `pushToCaregivers` passa a aceitar o autor. Trocar:

```ts
async function pushToCaregivers(
  openId: string,
  personName: string,
  changes: AlarmChange[]
): Promise<void> {
  const message = buildAlarmChangePush(personName, changes);
  if (!message) return;
  if (isPushRateLimited(openId)) return;

  const caregivers = await getActiveCaregiversForMonitored(openId);
  if (caregivers.length === 0) return;
```
por:
```ts
async function pushToCaregivers(
  openId: string,
  personName: string,
  changes: AlarmChange[],
  author?: { openId: string; name: string }
): Promise<void> {
  const message = buildAlarmChangePush(personName, changes, author?.name);
  if (!message) return;
  if (isPushRateLimited(openId)) return;

  // O autor da mudança (um cuidador) sabe o que fez: só os outros são avisados.
  const caregivers = (await getActiveCaregiversForMonitored(openId)).filter(
    (c) => c.caregiverOpenId !== author?.openId
  );
  if (caregivers.length === 0) return;
```

(ii) No fim do arquivo, acrescentar:

```ts
/**
 * O cuidador do acordo mudou a lista gerenciada do idoso. Grava cada mudança
 * com o cuidador como autor e avisa os OUTROS cuidadores vinculados. O backup
 * do celular (`userData.put`) não repete isto: com o acordo ativo ele pula o
 * diff, senão o celular da Maria, ao aplicar o que a Ana apagou, geraria
 * "Maria apagou…".
 *
 * Best-effort como o resto do módulo: a lista já foi gravada e NÃO pode falhar
 * por causa de um registro ou de um push.
 */
export async function recordCaregiverAlarmChanges(args: {
  monitoredOpenId: string;
  authorOpenId: string;
  authorName: string;
  personName: string;
  changes: AlarmChange[];
}): Promise<void> {
  if (args.changes.length === 0) return;

  const storable = args.changes.filter((c) => c.alarmId.length <= MAX_ALARM_ID_LENGTH);
  try {
    await insertAlarmChanges(
      storable.map((c) => ({
        openId: args.monitoredOpenId,
        ...c,
        changedByOpenId: args.authorOpenId,
      }))
    );
  } catch (err) {
    console.warn("[AlarmChanges] falha ao registrar mudanças do cuidador:", safeErr(err));
  }

  void pushToCaregivers(args.monitoredOpenId, args.personName, args.changes, {
    openId: args.authorOpenId,
    name: args.authorName,
  }).catch((err) => {
    console.warn("[AlarmChanges] falha ao avisar os outros cuidadores:", safeErr(err));
  });
}
```

**3e. `server/routers-links.ts`.** Em `getMonitoredAlerts`, trocar:

```ts
    const [events, warnings, changes] = await Promise.all([
      getRecentMissedEventsForAccount(link.monitoredOpenId, 30),
      getRecentWarningsForAccount(link.monitoredOpenId, 20),
      getRecentAlarmChanges(link.monitoredOpenId, 20),
    ]);
```
por:
```ts
    const [events, warnings, changes] = await Promise.all([
      getRecentMissedEventsForAccount(link.monitoredOpenId, 30),
      getRecentWarningsForAccount(link.monitoredOpenId, 20),
      getRecentAlarmChanges(link.monitoredOpenId, 20),
    ]);

    // Quem fez cada mudança: null = a própria pessoa (veio do backup), "Você" =
    // este cuidador, senão o nome do outro cuidador (uma consulta por autor
    // distinto). Falha ao consultar um nome nunca derruba a lista.
    const authorIds = [
      ...new Set(
        changes
          .map((c) => c.changedByOpenId)
          .filter((id): id is string => !!id && id !== ctx.user.openId)
      ),
    ];
    const authorNames = new Map<string, string>();
    await Promise.all(
      authorIds.map(async (id) => {
        const author = await getUserByOpenId(id).catch(() => undefined);
        authorNames.set(id, author?.name?.trim() || "Outro cuidador");
      })
    );
    const changedByName = (id: string | null | undefined): string | null =>
      !id ? null : id === ctx.user.openId ? "Você" : (authorNames.get(id) ?? "Outro cuidador");
```
e, no mapeamento de `changes`, trocar:

```ts
        newTime: c.newTime,
        createdAt: c.createdAt.getTime(),
      })),
    };
  }),
```
por:
```ts
        newTime: c.newTime,
        changedByOpenId: c.changedByOpenId ?? null,
        changedByName: changedByName(c.changedByOpenId),
        createdAt: c.createdAt.getTime(),
      })),
    };
  }),
```
(`getUserByOpenId` já está importado de `./db` no topo do arquivo.)

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/push-data.test.ts tests/db-push-owner.test.ts tests/alarm-changes-caregiver.test.ts tests/alarm-diff.test.ts tests/link.alerts-and-revoke.test.ts tests/push.test.ts tests/user-data-put-alarm-changes.test.ts`
Esperado: PASS (os dois últimos arquivos provam que `sendExpoPush` e o aviso do backup continuam iguais).

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/push.ts server/db-push.ts server/_core/alarm-diff.ts server/alarm-changes.ts server/routers-links.ts tests/push-data.test.ts tests/db-push-owner.test.ts tests/alarm-changes-caregiver.test.ts tests/alarm-diff.test.ts tests/link.alerts-and-revoke.test.ts
git commit -m "feat(push): push silencioso, recibos, token com dono e mudanças de alarme com autor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 6: Router `managedAlarms` — o acordo (+ `link.revokeLink` encerra o acordo)

**Depende de:** Tarefas 1 (`shared/managed-alarm.ts`), 3 (`sanitizeAcceptedList`), 4 (`db-alarm-management`, `db-managed-alarm-list`) e 5 (`getMonitoredAlerts` já devolve o autor; a Tarefa 7 usa `recordCaregiverAlarmChanges`)

**Files:**
- Create: `server/routers-managed-alarms.ts` (as sete rotas do acordo)
- Modify: `server/routers.ts` (importar e montar `managedAlarms: managedAlarmsRouter`)
- Modify: `server/routers-links.ts` (`link.revokeLink` encerra o acordo aberto do par)
- Create: `tests/_managed-alarms-fakes.ts` (helper de teste, NÃO é um `*.test.ts`: dublês em memória de `db-alarm-management`, `db-managed-alarm-list`, `db-links`, `db-push`, `push` e `db`, mais `makeCtx`)
- Test: `tests/managed-alarms-agreement.test.ts` (novo), `tests/link.alerts-and-revoke.test.ts` (acrescenta o mock de `db-alarm-management`)

**Interfaces:**
- Consumes (contratos): `getOpenManagementForMonitored`, `getActiveManagementForMonitored`, `createManagementRequest`, `activateManagement`, `endManagement` (`server/db-alarm-management`); `getManagedList` (`server/db-managed-alarm-list`); `sanitizeAcceptedList` (`server/_core/managed-alarm-schema`); `MANAGEMENT_REQUEST_TTL_DAYS`, `ManagedAlarm` (`shared/managed-alarm`); `getActiveLinkForCaregiver`, `getActiveCaregiversForMonitored` (`server/db-links`); `getPushTokensForOpenIds` (`server/db-push`); `sendExpoPush` (`server/push`); `pickPersonName` (`server/_core/alarm-diff`).
- Produces: `managedAlarmsRouter` (`server/routers-managed-alarms.ts`), montado como `appRouter.managedAlarms`, com:
  - `forCaregiver` (query), `request`, `cancelRequest`, `stopManaging` (mutations de cuidador, sem input)
  - `mine` (query), `respond({ requestId, accept, alarms? })`, `stopBeingManaged` (mutations/queries do idoso)
  - tipo `MineResponse` exportado: `{ pendingRequest: { id: number; caregiverName: string } | null; management: { id: number; caregiverOpenId: string; caregiverName: string; since: number } | null; list: { version: number; alarms: ManagedAlarm[] } | null }`
  - helpers internos reaproveitados pela Tarefa 7: `requireCaregiverLink`, `requireMonitored`, `firePush`, `makeRateLimiter`, `safeErr`, `caregiverNameOf`.

**Decisões desta tarefa (leia antes):**
- Cuidador sem vínculo, idoso chamando rota de cuidador e cuidador chamando rota de idoso: sempre `FORBIDDEN`. O idoso alvo das rotas de cuidador vem do vínculo (`getActiveLinkForCaregiver`); nenhuma rota de cuidador tem `monitoredOpenId` no input (um campo extra enviado pelo cliente é descartado pelo Zod/tRPC).
- `respond` só aceita o `requestId` do pedido aberto DESTE idoso; um `requestId` de outra conta dá `NOT_FOUND`, sem revelar que existe.
- `request` tem um limite próprio de 5 pedidos por minuto por cuidador (cancelar e pedir em laço seria spam de notificação no celular do idoso).
- `mine` se cura sozinha: acordo aberto cujo cuidador não está mais vinculado é encerrado com `unlinked` na hora (cobre o caso de `revokeLink` ter falhado depois de revogar o vínculo e deixar a lista do idoso travada).
- Pushes de acordo nunca levam nome de remédio e nunca seguram a resposta (`void ….catch(log seguro)`); push que falha não desfaz o acordo.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/_managed-alarms-fakes.ts` (dublês em memória que espelham o comportamento dos contratos das Tarefas 4 e 5; o arquivo não termina em `.test.ts`, então o Vitest não o executa):

```ts
/**
 * _managed-alarms-fakes.ts
 *
 * Dublês em memória para testar o router `managedAlarms` e o `link.revokeLink`
 * sem banco. Cada dublê espelha a regra do módulo real (uma linha aberta por
 * idoso, versão que sobe a cada gravação, ack que ignora versão velha) para os
 * testes verificarem COMPORTAMENTO do router, não só "a função foi chamada".
 * O banco de verdade é testado nas Tarefas 4 e 9 a 11.
 *
 * Uso (no topo do arquivo de teste, antes do import do router):
 *   vi.mock("../server/db-alarm-management", async () => (await import("./_managed-alarms-fakes")).fakeManagementModule);
 */
import { TRPCError } from "@trpc/server";
import { vi } from "vitest";
import type { User } from "../drizzle/schema";
import type { TrpcContext } from "../server/_core/context";
import type { ManagedAlarm } from "../shared/managed-alarm";

export interface FakeAgreement {
  id: number;
  monitoredOpenId: string;
  caregiverOpenId: string;
  status: "pending" | "active" | "ended";
  endedReason: string | null;
  requestedAt: Date;
  respondedAt: Date | null;
  endedAt: Date | null;
}

export interface FakeList {
  monitoredOpenId: string;
  version: number;
  alarms: ManagedAlarm[];
  appliedVersion: number;
  appliedAlarms: ManagedAlarm[];
  failedAlarmIds: string[];
  appliedAt: Date | null;
  updatedByOpenId: string;
  updatedAt: Date;
  visibleNoticeSentForVersion: number;
}

export const store = {
  agreements: [] as FakeAgreement[],
  lists: new Map<string, FakeList>(),
  links: [] as { caregiverOpenId: string; monitoredOpenId: string }[],
  users: new Map<string, User>(),
  anamnesis: new Map<string, unknown>(),
  tokens: new Map<string, string[]>(),
  nextId: 1,
};

export function makeUser(openId: string, userType: "monitored" | "caregiver", name: string | null): User {
  return {
    id: 1,
    openId,
    name,
    email: `${openId}@example.com`,
    phone: null,
    userType,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

/**
 * Cenário padrão: Maria (idoso) e João (outro idoso); Ana e Bia cuidam da Maria;
 * Dina cuida do João; Carol é cuidadora SEM vínculo; Rita cuida do "rita-mon".
 */
export function resetStore(): void {
  store.agreements = [];
  store.lists = new Map();
  store.nextId = 1;
  store.users = new Map([
    ["maria", makeUser("maria", "monitored", "Conta Maria")],
    ["joao", makeUser("joao", "monitored", "João")],
    ["rita-mon", makeUser("rita-mon", "monitored", "Seu Rita")],
    ["ana", makeUser("ana", "caregiver", "Ana")],
    ["bia", makeUser("bia", "caregiver", "Bia")],
    ["carol", makeUser("carol", "caregiver", "Carol")],
    ["dina", makeUser("dina", "caregiver", "Dina")],
    ["rita", makeUser("rita", "caregiver", "Rita")],
  ]);
  store.anamnesis = new Map([["maria", { fullName: "Vó Maria" }]]);
  store.links = [
    { caregiverOpenId: "ana", monitoredOpenId: "maria" },
    { caregiverOpenId: "bia", monitoredOpenId: "maria" },
    { caregiverOpenId: "dina", monitoredOpenId: "joao" },
    { caregiverOpenId: "rita", monitoredOpenId: "rita-mon" },
  ];
  store.tokens = new Map([
    ["maria", ["ExpoTok[maria]"]],
    ["joao", ["ExpoTok[joao]"]],
    ["ana", ["ExpoTok[ana]"]],
    ["bia", ["ExpoTok[bia]"]],
    ["dina", ["ExpoTok[dina]"]],
  ]);
}

export function makeCtx(openId: string): TrpcContext {
  const user = store.users.get(openId);
  if (!user) throw new Error(`usuário de teste inexistente: ${openId}`);
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

export const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

export function sampleAlarm(over: Partial<ManagedAlarm> = {}): ManagedAlarm {
  return {
    id: "a1",
    time: "08:00",
    description: "Losartana",
    enabled: true,
    repeat: "daily",
    sound: true,
    vibration: true,
    kind: "medication",
    ...over,
  };
}

/** Pedido pendente de `caregiverOpenId` para `monitoredOpenId`. */
export function seedPendingRequest(caregiverOpenId = "ana", monitoredOpenId = "maria"): FakeAgreement {
  const row: FakeAgreement = {
    id: store.nextId++,
    monitoredOpenId,
    caregiverOpenId,
    status: "pending",
    endedReason: null,
    requestedAt: new Date(),
    respondedAt: null,
    endedAt: null,
  };
  store.agreements.push(row);
  return row;
}

/** Acordo ativo + lista gerenciada na versão 1, já confirmada pelo celular. */
export function seedActiveAgreement(
  opts: { caregiverOpenId?: string; monitoredOpenId?: string; alarms?: ManagedAlarm[] } = {}
): FakeAgreement {
  const caregiverOpenId = opts.caregiverOpenId ?? "ana";
  const monitoredOpenId = opts.monitoredOpenId ?? "maria";
  const alarms = opts.alarms ?? [sampleAlarm()];
  const row: FakeAgreement = {
    id: store.nextId++,
    monitoredOpenId,
    caregiverOpenId,
    status: "active",
    endedReason: null,
    requestedAt: new Date(Date.now() - 86_400_000),
    respondedAt: new Date(Date.now() - 3_600_000),
    endedAt: null,
  };
  store.agreements.push(row);
  store.lists.set(monitoredOpenId, {
    monitoredOpenId,
    version: 1,
    alarms: alarms.map((a) => ({ ...a })),
    appliedVersion: 1,
    appliedAlarms: alarms.map((a) => ({ ...a })),
    failedAlarmIds: [],
    appliedAt: new Date(),
    updatedByOpenId: monitoredOpenId,
    updatedAt: new Date(),
    visibleNoticeSentForVersion: 0,
  });
  return row;
}

const openOf = (monitoredOpenId: string) =>
  store.agreements.find((a) => a.monitoredOpenId === monitoredOpenId && a.status !== "ended");

// --- ../server/db-alarm-management -----------------------------------------------

export const fakeManagementModule = {
  getOpenManagementForMonitored: vi.fn(async (monitoredOpenId: string) => {
    const row = openOf(monitoredOpenId);
    return row ? { ...row } : null;
  }),
  getActiveManagementForMonitored: vi.fn(async (monitoredOpenId: string) => {
    const row = store.agreements.find((a) => a.monitoredOpenId === monitoredOpenId && a.status === "active");
    return row ? { ...row } : null;
  }),
  getOpenManagementForCaregiver: vi.fn(async (caregiverOpenId: string) => {
    const row = store.agreements.find((a) => a.caregiverOpenId === caregiverOpenId && a.status !== "ended");
    return row ? { ...row } : null;
  }),
  createManagementRequest: vi.fn(async (caregiverOpenId: string, monitoredOpenId: string) => {
    if (openOf(monitoredOpenId)) {
      throw new TRPCError({ code: "CONFLICT", message: "Já existe um pedido ou acordo para esta pessoa." });
    }
    const row = seedPendingRequest(caregiverOpenId, monitoredOpenId);
    return { ...row };
  }),
  activateManagement: vi.fn(async (id: number, list: ManagedAlarm[], monitoredOpenId: string) => {
    const row = store.agreements.find((a) => a.id === id);
    if (!row) return;
    row.status = "active";
    row.respondedAt = new Date();
    store.lists.set(monitoredOpenId, {
      monitoredOpenId,
      version: 1,
      alarms: list.map((a) => ({ ...a })),
      appliedVersion: 1,
      appliedAlarms: list.map((a) => ({ ...a })),
      failedAlarmIds: [],
      appliedAt: new Date(),
      updatedByOpenId: monitoredOpenId,
      updatedAt: new Date(),
      visibleNoticeSentForVersion: 0,
    });
  }),
  endManagement: vi.fn(async (id: number, reason: string) => {
    const row = store.agreements.find((a) => a.id === id);
    if (!row) return;
    row.status = "ended";
    row.endedReason = reason;
    row.endedAt = new Date();
    if (reason === "declined") row.respondedAt = new Date();
    store.lists.delete(row.monitoredOpenId);
  }),
  getExpiredManagementRequests: vi.fn(async () => []),
  getManagementHistory: vi.fn(async () => []),
};

// --- ../server/db-managed-alarm-list -----------------------------------------------

export class FakeManagedListConflictError extends Error {}

export const fakeListModule = {
  ManagedListConflictError: FakeManagedListConflictError,
  getManagedList: vi.fn(async (monitoredOpenId: string) => {
    const row = store.lists.get(monitoredOpenId);
    return row ? { ...row, alarms: row.alarms.map((a) => ({ ...a })) } : null;
  }),
  writeManagedList: vi.fn(
    async (monitoredOpenId: string, baseVersion: number, alarms: ManagedAlarm[], updatedByOpenId: string) => {
      const row = store.lists.get(monitoredOpenId);
      if (!row || row.version !== baseVersion) throw new FakeManagedListConflictError("versão mudou");
      row.version += 1;
      row.alarms = alarms.map((a) => ({ ...a }));
      row.updatedByOpenId = updatedByOpenId;
      row.updatedAt = new Date();
      return row.version;
    }
  ),
  recordManagedAck: vi.fn(async (monitoredOpenId: string, version: number, failedAlarmIds: string[]) => {
    const row = store.lists.get(monitoredOpenId);
    if (!row) return false;
    // Ack velho (<= aplicada) ou de versão que já foi superada/inexistente: ignorado.
    if (version <= row.appliedVersion || version !== row.version) return false;
    row.appliedVersion = version;
    row.appliedAlarms = row.alarms.map((a) => ({ ...a }));
    row.failedAlarmIds = [...failedAlarmIds];
    row.appliedAt = new Date();
    return true;
  }),
  getListsNeedingVisibleNotice: vi.fn(async () => []),
  markVisibleNoticeSent: vi.fn(async () => undefined),
};

// --- ../server/db-links --------------------------------------------------------------

export const fakeLinksModule = {
  getActiveLinkForCaregiver: vi.fn(async (caregiverOpenId: string) => {
    const link = store.links.find((l) => l.caregiverOpenId === caregiverOpenId);
    return link ? { id: 1, ...link, status: "active" } : null;
  }),
  getActiveCaregiversForMonitored: vi.fn(async (monitoredOpenId: string) =>
    store.links.filter((l) => l.monitoredOpenId === monitoredOpenId).map((l) => ({ id: 1, ...l, status: "active" }))
  ),
  revokeLink: vi.fn(async (caregiverOpenId: string, monitoredOpenId: string) => {
    store.links = store.links.filter(
      (l) => !(l.caregiverOpenId === caregiverOpenId && l.monitoredOpenId === monitoredOpenId)
    );
  }),
  createInvite: vi.fn(),
  consumeInviteByCode: vi.fn(),
  getInviteByCode: vi.fn(),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  upsertActiveLink: vi.fn(),
};

// --- ../server/db-push e ../server/push ------------------------------------------------

export const fakePushDbModule = {
  getPushTokensForOpenIds: vi.fn(async (openIds: string[]) =>
    openIds.flatMap((openId) => (store.tokens.get(openId) ?? []).map((token) => ({ token, openId })))
  ),
  getPushTokensWithOwner: vi.fn(async (openIds: string[]) =>
    openIds.flatMap((openId) => (store.tokens.get(openId) ?? []).map((token) => ({ token, openId })))
  ),
  countPushTokens: vi.fn(async (openId: string) => (store.tokens.get(openId) ?? []).length),
  upsertPushToken: vi.fn(async () => undefined),
  deleteOwnedPushToken: vi.fn(async () => false),
  deletePushToken: vi.fn(async () => undefined),
};

export const fakePushModule = {
  sendExpoPush: vi.fn(async () => 1),
  sendExpoDataPush: vi.fn(async (tokens: string[]) =>
    tokens.map((token) => ({ token, ticketId: "ticket", deviceNotRegistered: false }))
  ),
  fetchExpoReceipts: vi.fn(async () => ({})),
};

// --- ../server/db (só o que os routers leem) -------------------------------------------

export const fakeDbOverrides = {
  getUserByOpenId: vi.fn(async (openId: string) => store.users.get(openId)),
  getUserData: vi.fn(async (openId: string) =>
    store.anamnesis.has(openId) ? { anamnesis: store.anamnesis.get(openId), alarms: [] } : undefined
  ),
};
```

Criar `tests/managed-alarms-agreement.test.ts`:

```ts
/**
 * managed-alarms-agreement.test.ts
 *
 * O acordo do modo gerenciado, pelo router `managedAlarms` (createCaller).
 * Foco em AUTORIZAÇÃO (IDOR) e nas transições do acordo:
 *  - o idoso alvo de uma rota de cuidador vem do vínculo, nunca do input;
 *  - só o cuidador que pediu mexe no pedido/acordo; outro cuidador vinculado,
 *    cuidador sem vínculo e o próprio idoso são recusados;
 *  - o idoso só responde ao pedido DELE (requestId de outra conta = não existe);
 *  - aceite com lista ilegível não ativa nada e não apaga alarme;
 *  - desfazer o vínculo encerra o acordo com o motivo certo e avisa o outro lado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-management", async () => (await import("./_managed-alarms-fakes")).fakeManagementModule);
vi.mock("../server/db-managed-alarm-list", async () => (await import("./_managed-alarms-fakes")).fakeListModule);
vi.mock("../server/db-links", async () => (await import("./_managed-alarms-fakes")).fakeLinksModule);
vi.mock("../server/db-push", async () => (await import("./_managed-alarms-fakes")).fakePushDbModule);
vi.mock("../server/push", async () => (await import("./_managed-alarms-fakes")).fakePushModule);
vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  ...(await import("./_managed-alarms-fakes")).fakeDbOverrides,
}));

import { appRouter } from "../server/routers";
import * as push from "../server/push";
import * as management from "../server/db-alarm-management";
import {
  flush,
  makeCtx,
  resetStore,
  sampleAlarm,
  seedActiveAgreement,
  seedPendingRequest,
  store,
} from "./_managed-alarms-fakes";

const as = (openId: string) => appRouter.createCaller(makeCtx(openId));

/** Pushes visíveis enviados, já achatados: { tokens, title, body, data }. */
const sent = () =>
  vi.mocked(push.sendExpoPush).mock.calls.map(([tokens, message]) => ({ tokens, ...message }));

const agreementOf = (monitoredOpenId: string) =>
  store.agreements.filter((a) => a.monitoredOpenId === monitoredOpenId);

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
});

describe("managedAlarms.request", () => {
  it("o cuidador vinculado pede: nasce um pedido pendente e o idoso recebe a notificação", async () => {
    const result = await as("ana").managedAlarms.request();
    await flush();

    expect(result.status).toBe("pending");
    expect(agreementOf("maria")).toHaveLength(1);
    expect(agreementOf("maria")[0]).toMatchObject({
      caregiverOpenId: "ana",
      monitoredOpenId: "maria",
      status: "pending",
    });
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[maria]"],
        title: "Pedido de Ana",
        body: "Toque para ver",
        data: { type: "management_request" },
      },
    ]);
  });

  it("o idoso do pedido vem do vínculo, não do input (campo extra é descartado)", async () => {
    await as("ana").managedAlarms.request({ monitoredOpenId: "joao" } as never);

    expect(agreementOf("joao")).toHaveLength(0);
    expect(agreementOf("maria")).toHaveLength(1);
  });

  it("já existindo pedido ou acordo aberto para o idoso, outro pedido é CONFLICT e nada é enviado", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("bia").managedAlarms.request()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(agreementOf("maria")).toHaveLength(1);
    expect(sent()).toHaveLength(0);
  });

  it("acordo ativo de outro cuidador também bloqueia um novo pedido", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("bia").managedAlarms.request()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("cuidador sem vínculo é FORBIDDEN e nada é criado", async () => {
    await expect(as("carol").managedAlarms.request()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.agreements).toHaveLength(0);
    expect(management.createManagementRequest).not.toHaveBeenCalled();
  });

  it("o idoso chamando a rota do cuidador é FORBIDDEN", async () => {
    await expect(as("maria").managedAlarms.request()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(store.agreements).toHaveLength(0);
  });

  it("mais de 5 pedidos em um minuto: TOO_MANY_REQUESTS", async () => {
    for (let i = 0; i < 5; i++) {
      await as("rita").managedAlarms.request().catch(() => undefined);
    }
    await expect(as("rita").managedAlarms.request()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("falha no push não desfaz o pedido nem derruba a resposta", async () => {
    vi.mocked(push.sendExpoPush).mockRejectedValueOnce(new Error("rede"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(as("ana").managedAlarms.request()).resolves.toMatchObject({ status: "pending" });
    await flush();
    expect(agreementOf("maria")).toHaveLength(1);
  });
});

describe("managedAlarms.cancelRequest", () => {
  it("quem pediu cancela: encerra com 'cancelled'", async () => {
    seedPendingRequest("ana", "maria");

    await as("ana").managedAlarms.cancelRequest();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "cancelled" });
  });

  it("outro cuidador vinculado NÃO cancela o pedido alheio (FORBIDDEN) e o pedido segue pendente", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("bia").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("sem pedido aberto: NOT_FOUND", async () => {
    await expect(as("ana").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("acordo já ativo não é 'pedido': CONFLICT e o acordo continua", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("ana").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "CONFLICT" });
    expect(agreementOf("maria")[0].status).toBe("active");
  });

  it("cuidador sem vínculo e o próprio idoso são FORBIDDEN", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("carol").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as("maria").managedAlarms.cancelRequest()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });
});

describe("managedAlarms.respond — aceite", () => {
  it("aceitar ativa o acordo com a lista atual do idoso (versão 1, já confirmada) e avisa os cuidadores", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    const result = await as("maria").managedAlarms.respond({
      requestId: pedido.id,
      accept: true,
      alarms: [
        { ...sampleAlarm({ id: "a1" }), notificationId: "n-1", nativeAlarmUids: ["u1"] },
        sampleAlarm({ id: "a2", time: "20:00", description: "Check-in", kind: "checkin", escalateAfterMinutes: 10 }),
      ],
    });
    await flush();

    expect(result).toEqual({ success: true, accepted: true });
    expect(agreementOf("maria")[0].status).toBe("active");
    const lista = store.lists.get("maria");
    expect(lista?.version).toBe(1);
    expect(lista?.appliedVersion).toBe(1);
    expect(lista?.alarms.map((a) => a.id)).toEqual(["a1", "a2"]);
    expect(lista?.alarms[0]).not.toHaveProperty("notificationId");
    expect(lista?.alarms[0]).not.toHaveProperty("nativeAlarmUids");

    const pushes = sent();
    const paraAna = pushes.find((p) => p.tokens.includes("ExpoTok[ana]"));
    expect(paraAna).toMatchObject({
      title: "Alarmes",
      body: "Vó Maria aceitou. Agora você cuida dos alarmes de Vó Maria.",
      data: { type: "management_accepted", url: "/(caregiver-tabs)/managed-alarms" },
    });
    const paraBia = pushes.find((p) => p.tokens.includes("ExpoTok[bia]"));
    expect(paraBia).toMatchObject({
      body: "Ana passou a cuidar dos alarmes de Vó Maria.",
      data: { type: "management_changed" },
    });
    expect(pushes).toHaveLength(2);
  });

  it("aceitar com lista vazia é válido (o idoso ainda não tem alarmes)", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: [] });

    expect(agreementOf("maria")[0].status).toBe("active");
    expect(store.lists.get("maria")?.alarms).toEqual([]);
  });

  it("descrição acima de 80 caracteres é cortada, o aceite não falha e nada é apagado", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await as("maria").managedAlarms.respond({
      requestId: pedido.id,
      accept: true,
      alarms: [sampleAlarm({ description: "x".repeat(120) })],
    });

    expect(store.lists.get("maria")?.alarms[0].description).toHaveLength(80);
  });

  it("item sem id: BAD_REQUEST, o pedido continua pendente e nenhuma lista nasce", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("maria").managedAlarms.respond({
        requestId: pedido.id,
        accept: true,
        alarms: [{ time: "08:00", description: "Sem id", enabled: true, repeat: "daily" }],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Não foi possível ler seus alarmes." });
    expect(agreementOf("maria")[0].status).toBe("pending");
    expect(store.lists.has("maria")).toBe(false);
  });

  it("item com horário inválido: BAD_REQUEST e o pedido continua pendente", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("maria").managedAlarms.respond({
        requestId: pedido.id,
        accept: true,
        alarms: [sampleAlarm({ time: "25:99" })],
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("mais de 24 alarmes: BAD_REQUEST e o pedido continua pendente", async () => {
    const pedido = seedPendingRequest("ana", "maria");
    const muitos = Array.from({ length: 25 }, (_, i) => sampleAlarm({ id: `a${i}` }));

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: muitos })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("aceitar sem mandar a lista: BAD_REQUEST (nunca ativa com lista inventada)", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("requestId de OUTRA conta: NOT_FOUND e o pedido alheio não é tocado", async () => {
    seedPendingRequest("ana", "maria");
    const pedidoDoJoao = seedPendingRequest("dina", "joao");

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedidoDoJoao.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(pedidoDoJoao.status).toBe("pending");
    expect(store.lists.has("joao")).toBe(false);
  });

  it("requestId inexistente: NOT_FOUND", async () => {
    await expect(
      as("maria").managedAlarms.respond({ requestId: 9999, accept: false })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("pedido que já foi respondido: CONFLICT (aceitar duas vezes não recria a lista)", async () => {
    const acordo = seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("maria").managedAlarms.respond({ requestId: acordo.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(store.lists.get("maria")?.alarms).toHaveLength(1);
  });

  it("cuidador chamando a rota do idoso é FORBIDDEN", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(
      as("ana").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("pedido de cuidador que já não está vinculado: NOT_FOUND e o pedido é encerrado como 'unlinked'", async () => {
    const pedido = seedPendingRequest("ana", "maria");
    store.links = store.links.filter((l) => l.caregiverOpenId !== "ana");

    await expect(
      as("maria").managedAlarms.respond({ requestId: pedido.id, accept: true, alarms: [] })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    expect(store.lists.has("maria")).toBe(false);
  });
});

describe("managedAlarms.respond — recusa", () => {
  it("'Agora não' encerra com 'declined', não cria lista e avisa o cuidador", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    const result = await as("maria").managedAlarms.respond({ requestId: pedido.id, accept: false });
    await flush();

    expect(result).toEqual({ success: true, accepted: false });
    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "declined" });
    expect(store.lists.has("maria")).toBe(false);
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[ana]"],
        title: "Alarmes",
        body: "Vó Maria preferiu continuar cuidando dos próprios alarmes.",
        data: { type: "management_declined" },
      },
    ]);
  });
});

describe("managedAlarms.mine", () => {
  it("sem pedido nem acordo: tudo nulo", async () => {
    await expect(as("maria").managedAlarms.mine()).resolves.toEqual({
      pendingRequest: null,
      management: null,
      list: null,
    });
  });

  it("pedido pendente: devolve o id e o nome do cuidador", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    await expect(as("maria").managedAlarms.mine()).resolves.toEqual({
      pendingRequest: { id: pedido.id, caregiverName: "Ana" },
      management: null,
      list: null,
    });
  });

  it("acordo ativo: devolve o cuidador, desde quando e a lista (versão + alarmes)", async () => {
    const acordo = seedActiveAgreement({ caregiverOpenId: "ana" });

    const result = await as("maria").managedAlarms.mine();

    expect(result.pendingRequest).toBeNull();
    expect(result.management).toEqual({
      id: acordo.id,
      caregiverOpenId: "ana",
      caregiverName: "Ana",
      since: acordo.respondedAt!.getTime(),
    });
    expect(result.list?.version).toBe(1);
    expect(result.list?.alarms.map((a) => a.id)).toEqual(["a1"]);
  });

  it("só enxerga o acordo DELE: o pedido de outro idoso não aparece", async () => {
    seedPendingRequest("dina", "joao");

    await expect(as("maria").managedAlarms.mine()).resolves.toMatchObject({ pendingRequest: null });
  });

  it("acordo cujo cuidador já não está vinculado se cura: encerra 'unlinked' e devolve tudo nulo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    store.links = store.links.filter((l) => l.caregiverOpenId !== "ana");

    await expect(as("maria").managedAlarms.mine()).resolves.toEqual({
      pendingRequest: null,
      management: null,
      list: null,
    });
    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
  });

  it("cuidador chamando a rota do idoso é FORBIDDEN", async () => {
    await expect(as("ana").managedAlarms.mine()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("managedAlarms.stopBeingManaged", () => {
  it("o idoso para: encerra 'stopped_by_monitored', apaga a lista gerenciada e avisa o cuidador", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("maria").managedAlarms.stopBeingManaged();
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "stopped_by_monitored" });
    expect(store.lists.has("maria")).toBe(false);
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[ana]"],
        title: "Alarmes",
        body: "Vó Maria voltou a cuidar dos próprios alarmes.",
        data: { type: "management_ended" },
      },
    ]);
  });

  it("sem acordo ativo: NOT_FOUND (pedido pendente não é acordo)", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("maria").managedAlarms.stopBeingManaged()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(agreementOf("maria")[0].status).toBe("pending");
  });

  it("cuidador chamando a rota do idoso é FORBIDDEN e o acordo continua", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("ana").managedAlarms.stopBeingManaged()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("active");
  });
});

describe("managedAlarms.stopManaging", () => {
  it("o cuidador do acordo para: encerra 'stopped_by_caregiver' e o idoso recebe a notificação visível", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.stopManaging();
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "stopped_by_caregiver" });
    expect(store.lists.has("maria")).toBe(false);
    expect(sent()).toEqual([
      {
        tokens: ["ExpoTok[maria]"],
        title: "Alarmes",
        body: "Ana parou de cuidar dos seus alarmes.",
        data: { type: "management_ended" },
      },
    ]);
  });

  it("outro cuidador vinculado NÃO para o acordo do colega (FORBIDDEN) e o acordo continua", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("bia").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("active");
    expect(store.lists.has("maria")).toBe(true);
  });

  it("pedido ainda pendente não é acordo: CONFLICT (o caminho é cancelar o pedido)", async () => {
    seedPendingRequest("ana", "maria");

    await expect(as("ana").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("sem nada aberto: NOT_FOUND", async () => {
    await expect(as("ana").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("o idoso e o cuidador sem vínculo são FORBIDDEN", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("maria").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as("carol").managedAlarms.stopManaging()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(agreementOf("maria")[0].status).toBe("active");
  });
});

describe("managedAlarms.forCaregiver", () => {
  it("sem acordo: devolve o idoso do vínculo e nada de acordo nem lista", async () => {
    await expect(as("ana").managedAlarms.forCaregiver()).resolves.toEqual({
      monitoredOpenId: "maria",
      monitoredName: "Vó Maria",
      management: null,
      list: null,
    });
  });

  it("pedido pendente do próprio cuidador: isMine, vence em 7 dias, sem lista", async () => {
    const pedido = seedPendingRequest("ana", "maria");

    const result = await as("ana").managedAlarms.forCaregiver();

    expect(result.management).toEqual({
      id: pedido.id,
      status: "pending",
      caregiverOpenId: "ana",
      isMine: true,
      managerName: "Ana",
      requestedAt: pedido.requestedAt.getTime(),
      respondedAt: null,
      expiresAt: pedido.requestedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
    });
    expect(result.list).toBeNull();
  });

  it("acordo ativo: o gerente vê a lista com versão, confirmação e falhas", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    const lista = store.lists.get("maria")!;
    lista.failedAlarmIds = ["a1"];

    const result = await as("ana").managedAlarms.forCaregiver();

    expect(result.management).toMatchObject({ status: "active", isMine: true, expiresAt: null });
    expect(result.list).toMatchObject({ version: 1, appliedVersion: 1, failedAlarmIds: ["a1"] });
    expect(result.list?.alarms.map((a) => a.id)).toEqual(["a1"]);
  });

  it("outro cuidador vinculado vê que o acordo é do colega (isMine false, nome do gerente)", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    const result = await as("bia").managedAlarms.forCaregiver();

    expect(result.management).toMatchObject({ isMine: false, managerName: "Ana", caregiverOpenId: "ana" });
  });

  it("cuidador sem vínculo e o idoso são FORBIDDEN", async () => {
    await expect(as("carol").managedAlarms.forCaregiver()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(as("maria").managedAlarms.forCaregiver()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("nunca devolve o acordo de outro idoso", async () => {
    seedActiveAgreement({ caregiverOpenId: "dina", monitoredOpenId: "joao" });

    const result = await as("ana").managedAlarms.forCaregiver();

    expect(result.monitoredOpenId).toBe("maria");
    expect(result.management).toBeNull();
    expect(result.list).toBeNull();
  });
});

describe("link.revokeLink encerra o acordo aberto do par", () => {
  it("o idoso desfaz o vínculo com o gerente: acordo 'unlinked', lista apagada", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("maria").link.revokeLink({ otherOpenId: "ana" });
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    expect(store.lists.has("maria")).toBe(false);
  });

  it("o cuidador gerente desfaz o vínculo: acordo 'unlinked' e o idoso é avisado para a trava sair", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").link.revokeLink({ otherOpenId: "maria" });
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    const paraMaria = sent().filter((p) => p.tokens.includes("ExpoTok[maria]"));
    expect(paraMaria).toEqual([
      {
        tokens: ["ExpoTok[maria]"],
        title: "Alarmes",
        body: "Ana parou de cuidar dos seus alarmes.",
        data: { type: "management_ended" },
      },
    ]);
  });

  it("pedido pendente do cuidador que sai: encerra 'unlinked' sem avisar o idoso", async () => {
    seedPendingRequest("ana", "maria");

    await as("ana").link.revokeLink({ otherOpenId: "maria" });
    await flush();

    expect(agreementOf("maria")[0]).toMatchObject({ status: "ended", endedReason: "unlinked" });
    expect(sent().filter((p) => p.tokens.includes("ExpoTok[maria]"))).toHaveLength(0);
  });

  it("outro cuidador (que não é o gerente) sai: o acordo da Ana segue ativo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("bia").link.revokeLink({ otherOpenId: "maria" });
    await flush();

    expect(agreementOf("maria")[0].status).toBe("active");
    expect(store.lists.has("maria")).toBe(true);
  });

  it("o idoso desvincula quem NÃO é o gerente: o acordo segue ativo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("maria").link.revokeLink({ otherOpenId: "bia" });
    await flush();

    expect(agreementOf("maria")[0].status).toBe("active");
  });

  it("sem acordo nenhum, desvincular continua funcionando", async () => {
    await expect(as("ana").link.revokeLink({ otherOpenId: "maria" })).resolves.toEqual({ success: true });
    expect(management.endManagement).not.toHaveBeenCalled();
  });

  it("falha ao encerrar o acordo não impede o desvínculo (direito do titular)", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(management.endManagement).mockRejectedValueOnce(new Error("DB fora do ar"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(as("maria").link.revokeLink({ otherOpenId: "ana" })).resolves.toEqual({ success: true });
    expect(store.links.some((l) => l.caregiverOpenId === "ana")).toBe(false);
  });
});
```

Em `tests/link.alerts-and-revoke.test.ts` (que passa por `link.revokeLink` real), acrescentar o mock do módulo novo, logo depois do `vi.mock("../server/db-alarm-changes", ...)`:

```ts
vi.mock("../server/db-alarm-management", () => ({
  getOpenManagementForMonitored: vi.fn(async () => null),
  getActiveManagementForMonitored: vi.fn(async () => null),
  getOpenManagementForCaregiver: vi.fn(async () => null),
  createManagementRequest: vi.fn(),
  activateManagement: vi.fn(),
  endManagement: vi.fn(async () => undefined),
  getExpiredManagementRequests: vi.fn(async () => []),
  getManagementHistory: vi.fn(async () => []),
}));
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarms-agreement.test.ts`
Esperado: FAIL — `Cannot read properties of undefined (reading 'request')` (ainda não existe `appRouter.managedAlarms`).

- [ ] **Passo 3: Implementar**

**3a. Criar `server/routers-managed-alarms.ts`:**

```ts
/**
 * routers-managed-alarms.ts
 *
 * O modo gerenciado: um cuidador cuida dos alarmes do idoso, com o
 * consentimento dele. Este arquivo tem (1) o ACORDO — pedir, cancelar, aceitar,
 * recusar, parar — e (2) a LISTA gerenciada (criar/editar/apagar/ack, acrescentada
 * na Tarefa 7). Spec: docs/superpowers/specs/2026-10-06-fase-4-cuidador-gerencia-alarmes-design.md.
 *
 * AUTORIZAÇÃO (o que os testes de IDOR travam):
 *  - Rotas do cuidador: o chamador precisa ser userType "caregiver" COM vínculo
 *    ativo. O idoso alvo vem do vínculo (getActiveLinkForCaregiver), NUNCA do
 *    input — nenhuma rota de cuidador recebe `monitoredOpenId`.
 *  - Rotas do idoso: userType diferente de "caregiver". O acordo é sempre o do
 *    openId do chamador; um `requestId` do cliente só vale se for o pedido aberto
 *    DESTE idoso (de outra conta = NOT_FOUND).
 *  - Só o cuidador que PEDIU mexe no pedido/acordo; outro cuidador vinculado é
 *    FORBIDDEN.
 *
 * Push nunca segura a resposta (void ….catch) e nunca leva nome de remédio.
 * Logs de erro só com nome+código: a mensagem de um erro do drizzle traz os
 * parâmetros da query (openId, nome do lembrete).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MANAGEMENT_REQUEST_TTL_DAYS, type ManagedAlarm } from "../shared/managed-alarm.js";
import { pickPersonName } from "./_core/alarm-diff";
import { sanitizeAcceptedList } from "./_core/managed-alarm-schema";
import { protectedProcedure, router } from "./_core/trpc";
import { getUserByOpenId, getUserData } from "./db";
import {
  activateManagement,
  createManagementRequest,
  endManagement,
  getActiveManagementForMonitored,
  getOpenManagementForMonitored,
} from "./db-alarm-management";
import { getActiveCaregiversForMonitored, getActiveLinkForCaregiver } from "./db-links";
import { getManagedList } from "./db-managed-alarm-list";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";
import type { User } from "../drizzle/schema";

// --- Utilitários locais --------------------------------------------------------------

/** Só campos seguros no log (a mensagem de um erro de banco traz os parâmetros). */
function safeErr(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
  return `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim();
}

/** Rate limit por usuário, em memória do processo (mesmo padrão de routers-links). */
function makeRateLimiter(windowMs: number, limit: number) {
  const buckets = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const recent = (buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
    if (recent.length >= limit) {
      buckets.set(key, recent);
      return true;
    }
    recent.push(now);
    buckets.set(key, recent);
    return false;
  };
}

const isRequestRateLimited = makeRateLimiter(60_000, 5);

/** Nome do cuidador nos textos de push. */
function caregiverNameOf(user: { name?: string | null } | null | undefined): string {
  return user?.name?.trim() || "Seu cuidador";
}

const DAY_MS = 24 * 60 * 60 * 1000;

interface VisiblePush {
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Notificação visível para as contas dadas. Fire-and-forget: o fetch da Expo não
 * tem timeout e não pode segurar a resposta nem desfazer o acordo.
 */
function firePush(openIds: string[], message: VisiblePush): void {
  void (async () => {
    const tokens = await getPushTokensForOpenIds(openIds);
    if (tokens.length === 0) return;
    await sendExpoPush(
      tokens.map((t) => t.token),
      message
    );
  })().catch((err) => {
    console.warn("[ManagedAlarms] push falhou:", safeErr(err));
  });
}

// --- Autorização ---------------------------------------------------------------------

/** O chamador é cuidador COM vínculo ativo; devolve o vínculo (o idoso vem dele). */
async function requireCaregiverLink(user: User) {
  if (user.userType !== "caregiver") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Apenas um cuidador pode usar esta função." });
  }
  const link = await getActiveLinkForCaregiver(user.openId);
  if (!link) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não está vinculado a nenhuma pessoa monitorada.",
    });
  }
  return link;
}

/** O chamador é a pessoa monitorada (qualquer conta que não seja de cuidador). */
function requireMonitored(user: User): void {
  if (user.userType === "caregiver") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas a pessoa monitorada pode usar esta função.",
    });
  }
}

/**
 * Acordo aberto (pendente ou ativo) do idoso. Se existir e não for deste
 * cuidador, FORBIDDEN: outro cuidador vinculado não mexe no pedido do colega.
 * Sem acordo aberto devolve null.
 */
async function getMyOpenAgreement(user: User, monitoredOpenId: string) {
  const open = await getOpenManagementForMonitored(monitoredOpenId);
  if (open && open.caregiverOpenId !== user.openId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Quem cuida dos alarmes desta pessoa é outro cuidador.",
    });
  }
  return open;
}

export interface MineResponse {
  pendingRequest: { id: number; caregiverName: string } | null;
  management: { id: number; caregiverOpenId: string; caregiverName: string; since: number } | null;
  list: { version: number; alarms: ManagedAlarm[] } | null;
}

const NO_AGREEMENT: MineResponse = { pendingRequest: null, management: null, list: null };

export const managedAlarmsRouter = router({
  // =================== CUIDADOR ===================

  /**
   * Cuidador: o acordo (se houver) do idoso do vínculo e, com acordo ativo, a
   * lista gerenciada com o estado de entrega. Outro cuidador vinculado também
   * vê (só leitura, `isMine: false`).
   */
  forCaregiver: protectedProcedure.query(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    const monitoredOpenId = link.monitoredOpenId;
    const [open, data, monitored] = await Promise.all([
      getOpenManagementForMonitored(monitoredOpenId),
      getUserData(monitoredOpenId),
      getUserByOpenId(monitoredOpenId),
    ]);
    const monitoredName = pickPersonName(data?.anamnesis, monitored?.name);
    if (!open) {
      return { monitoredOpenId, monitoredName, management: null, list: null };
    }

    const isMine = open.caregiverOpenId === ctx.user.openId;
    const manager = isMine ? ctx.user : await getUserByOpenId(open.caregiverOpenId);
    const status = open.status === "active" ? ("active" as const) : ("pending" as const);
    const management = {
      id: open.id,
      status,
      caregiverOpenId: open.caregiverOpenId,
      isMine,
      managerName: manager?.name?.trim() || null,
      requestedAt: open.requestedAt.getTime(),
      respondedAt: open.respondedAt ? open.respondedAt.getTime() : null,
      expiresAt: status === "pending" ? open.requestedAt.getTime() + MANAGEMENT_REQUEST_TTL_DAYS * DAY_MS : null,
    };

    let list: {
      version: number;
      alarms: ManagedAlarm[];
      appliedVersion: number;
      failedAlarmIds: string[];
      appliedAt: number | null;
      updatedAt: number;
    } | null = null;
    if (status === "active") {
      const row = await getManagedList(monitoredOpenId);
      if (row) {
        list = {
          version: row.version,
          alarms: row.alarms as ManagedAlarm[],
          appliedVersion: row.appliedVersion,
          failedAlarmIds: row.failedAlarmIds as string[],
          appliedAt: row.appliedAt ? row.appliedAt.getTime() : null,
          updatedAt: row.updatedAt.getTime(),
        };
      }
    }
    return { monitoredOpenId, monitoredName, management, list };
  }),

  /** Cuidador: pede para cuidar dos alarmes do idoso do vínculo. */
  request: protectedProcedure.mutation(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    if (isRequestRateLimited(ctx.user.openId)) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Muitos pedidos em pouco tempo. Aguarde um instante.",
      });
    }
    if (await getOpenManagementForMonitored(link.monitoredOpenId)) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe um pedido ou acordo para esta pessoa.",
      });
    }
    const row = await createManagementRequest(ctx.user.openId, link.monitoredOpenId);
    firePush([link.monitoredOpenId], {
      title: `Pedido de ${caregiverNameOf(ctx.user)}`,
      body: "Toque para ver",
      data: { type: "management_request" },
    });
    return { id: row.id, status: "pending" as const };
  }),

  /** Cuidador: cancela o pedido que ele mesmo fez e ainda não foi respondido. */
  cancelRequest: protectedProcedure.mutation(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    const open = await getMyOpenAgreement(ctx.user, link.monitoredOpenId);
    if (!open) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Não há pedido aberto." });
    }
    if (open.status !== "pending") {
      throw new TRPCError({ code: "CONFLICT", message: "O pedido já foi respondido." });
    }
    await endManagement(open.id, "cancelled");
    return { success: true } as const;
  }),

  /** Cuidador: para de cuidar dos alarmes (acordo ativo, o dele). O idoso é avisado. */
  stopManaging: protectedProcedure.mutation(async ({ ctx }) => {
    const link = await requireCaregiverLink(ctx.user);
    const open = await getMyOpenAgreement(ctx.user, link.monitoredOpenId);
    if (!open) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Não há acordo ativo." });
    }
    if (open.status !== "active") {
      throw new TRPCError({
        code: "CONFLICT",
        message: "O pedido ainda não foi aceito. Cancele o pedido em vez de parar.",
      });
    }
    await endManagement(open.id, "stopped_by_caregiver");
    firePush([link.monitoredOpenId], {
      title: "Alarmes",
      body: `${caregiverNameOf(ctx.user)} parou de cuidar dos seus alarmes.`,
      data: { type: "management_ended" },
    });
    return { success: true } as const;
  }),

  // =================== IDOSO ===================

  /**
   * Idoso: o pedido pendente (para o diálogo), o acordo ativo (para o cartão e
   * as listas só leitura) e a lista gerenciada. Se o cuidador do acordo já não
   * está vinculado, encerra o acordo na hora (`unlinked`) em vez de deixar as
   * listas do idoso travadas.
   */
  mine: protectedProcedure.query(async ({ ctx }): Promise<MineResponse> => {
    requireMonitored(ctx.user);
    const openId = ctx.user.openId;
    const open = await getOpenManagementForMonitored(openId);
    if (!open) return NO_AGREEMENT;

    const caregivers = await getActiveCaregiversForMonitored(openId);
    if (!caregivers.some((c) => c.caregiverOpenId === open.caregiverOpenId)) {
      await endManagement(open.id, "unlinked");
      return NO_AGREEMENT;
    }

    const caregiverName = caregiverNameOf(await getUserByOpenId(open.caregiverOpenId));
    if (open.status === "pending") {
      return { pendingRequest: { id: open.id, caregiverName }, management: null, list: null };
    }
    const row = await getManagedList(openId);
    return {
      pendingRequest: null,
      management: {
        id: open.id,
        caregiverOpenId: open.caregiverOpenId,
        caregiverName,
        since: (open.respondedAt ?? open.requestedAt).getTime(),
      },
      list: row ? { version: row.version, alarms: row.alarms as ManagedAlarm[] } : null,
    };
  }),

  /**
   * Idoso: responde ao pedido. Aceite manda a LISTA ATUAL do aparelho (vira a
   * versão 1 já confirmada); nada some, nada é recriado. Recusa encerra com
   * `declined`. Lista ilegível recusa o aceite sem ativar nada.
   */
  respond: protectedProcedure
    .input(
      z.object({
        requestId: z.number().int().positive(),
        accept: z.boolean(),
        alarms: z.array(z.unknown()).max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireMonitored(ctx.user);
      const openId = ctx.user.openId;

      // requestId vem do cliente: só vale se for o pedido aberto DESTE idoso.
      const open = await getOpenManagementForMonitored(openId);
      if (!open || open.id !== input.requestId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Este pedido não existe mais." });
      }
      if (open.status !== "pending") {
        throw new TRPCError({ code: "CONFLICT", message: "Este pedido já foi respondido." });
      }
      const caregivers = await getActiveCaregiversForMonitored(openId);
      if (!caregivers.some((c) => c.caregiverOpenId === open.caregiverOpenId)) {
        await endManagement(open.id, "unlinked");
        throw new TRPCError({ code: "NOT_FOUND", message: "Este pedido não existe mais." });
      }

      const monitoredName = pickPersonName((await getUserData(openId))?.anamnesis, ctx.user.name);

      if (!input.accept) {
        await endManagement(open.id, "declined");
        firePush([open.caregiverOpenId], {
          title: "Alarmes",
          body: `${monitoredName} preferiu continuar cuidando dos próprios alarmes.`,
          data: { type: "management_declined" },
        });
        return { success: true, accepted: false } as const;
      }

      if (!Array.isArray(input.alarms)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não foi possível ler seus alarmes." });
      }
      const list = sanitizeAcceptedList(input.alarms);
      await activateManagement(open.id, list, openId);

      firePush([open.caregiverOpenId], {
        title: "Alarmes",
        body: `${monitoredName} aceitou. Agora você cuida dos alarmes de ${monitoredName}.`,
        data: { type: "management_accepted", url: "/(caregiver-tabs)/managed-alarms" },
      });
      const others = caregivers
        .map((c) => c.caregiverOpenId)
        .filter((id) => id !== open.caregiverOpenId);
      if (others.length > 0) {
        const manager = await getUserByOpenId(open.caregiverOpenId);
        firePush(others, {
          title: "Alarmes",
          body: `${caregiverNameOf(manager)} passou a cuidar dos alarmes de ${monitoredName}.`,
          data: { type: "management_changed" },
        });
      }
      return { success: true, accepted: true } as const;
    }),

  /** Idoso: para o modo gerenciado (Configurações → "Parar"). O cuidador é avisado. */
  stopBeingManaged: protectedProcedure.mutation(async ({ ctx }) => {
    requireMonitored(ctx.user);
    const active = await getActiveManagementForMonitored(ctx.user.openId);
    if (!active) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nenhum acordo ativo." });
    }
    await endManagement(active.id, "stopped_by_monitored");
    const monitoredName = pickPersonName((await getUserData(ctx.user.openId))?.anamnesis, ctx.user.name);
    firePush([active.caregiverOpenId], {
      title: "Alarmes",
      body: `${monitoredName} voltou a cuidar dos próprios alarmes.`,
      data: { type: "management_ended" },
    });
    return { success: true } as const;
  }),
});
```

**3b. Montar no `appRouter` — `server/routers.ts`.** Depois da linha `import { pushRouter } from "./routers-push";` acrescentar:

```ts
import { managedAlarmsRouter } from "./routers-managed-alarms";
```
e, depois do bloco `push: pushRouter,`, acrescentar:

```ts
  // Modo gerenciado: o cuidador cuida dos alarmes do idoso (Fase 4)
  managedAlarms: managedAlarmsRouter,
```

**3c. `link.revokeLink` encerra o acordo — `server/routers-links.ts`.**

(i) Imports. Depois de `import { sendExpoPush } from "./push";` acrescentar:

```ts
import { endManagement, getOpenManagementForMonitored } from "./db-alarm-management";
```

(ii) Logo depois da função `notifyLinkRevoked` (antes de `export const linkRouter`), acrescentar:

```ts
/**
 * Desfazer o vínculo encerra o acordo de gerenciamento aberto entre o par
 * (`unlinked`). Só encerra se o acordo for DO cuidador que saiu: um colega
 * vinculado que sai, ou o idoso removendo quem não é o gerente, não mexe no
 * acordo dos outros. Se quem saiu foi o gerente com acordo ATIVO, o celular do
 * idoso recebe a notificação visível para a trava das listas sair logo.
 *
 * Best-effort: o desvínculo (direito do titular, LGPD Art. 18) já foi feito e
 * não pode falhar por causa disto. Se falhar, `managedAlarms.mine` se cura na
 * próxima abertura do app do idoso. Log só com nome e código do erro.
 */
async function endManagementOnUnlink(
  caregiverOpenId: string,
  monitoredOpenId: string,
  revokedBy: "caregiver" | "monitored",
  caregiverName?: string | null
): Promise<void> {
  try {
    const open = await getOpenManagementForMonitored(monitoredOpenId);
    if (!open || open.caregiverOpenId !== caregiverOpenId) return;
    await endManagement(open.id, "unlinked");

    if (revokedBy === "caregiver" && open.status === "active") {
      void (async () => {
        const tokens = await getPushTokensForOpenIds([monitoredOpenId]);
        if (tokens.length === 0) return;
        await sendExpoPush(
          tokens.map((t) => t.token),
          {
            title: "Alarmes",
            body: `${caregiverName?.trim() || "Seu cuidador"} parou de cuidar dos seus alarmes.`,
            data: { type: "management_ended" },
          }
        );
      })().catch((err) => {
        const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
        console.warn(
          "[Links] aviso de fim do acordo falhou:",
          `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
        );
      });
    }
  } catch (err) {
    const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
    console.warn(
      "[Links] não foi possível encerrar o acordo de alarmes:",
      `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
    );
  }
}
```

(iii) Em `revokeLink`, trocar:

```ts
        await revokeLinkRow(input.otherOpenId, ctx.user.openId);
        // Fire-and-forget: o fetch do Expo não tem timeout e não segura a resposta.
        if (wasLinked) void notifyLinkRevoked(input.otherOpenId, ctx.user.openId);
      } else {
        await revokeLinkRow(ctx.user.openId, input.otherOpenId);
      }
```
por:
```ts
        await revokeLinkRow(input.otherOpenId, ctx.user.openId);
        await endManagementOnUnlink(input.otherOpenId, ctx.user.openId, "monitored");
        // Fire-and-forget: o fetch do Expo não tem timeout e não segura a resposta.
        if (wasLinked) void notifyLinkRevoked(input.otherOpenId, ctx.user.openId);
      } else {
        await revokeLinkRow(ctx.user.openId, input.otherOpenId);
        await endManagementOnUnlink(ctx.user.openId, input.otherOpenId, "caregiver", ctx.user.name);
      }
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarms-agreement.test.ts tests/link.alerts-and-revoke.test.ts tests/link.getMyCaregivers.test.ts`
Esperado: PASS.

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/routers-managed-alarms.ts server/routers.ts server/routers-links.ts tests/_managed-alarms-fakes.ts tests/managed-alarms-agreement.test.ts tests/link.alerts-and-revoke.test.ts
git commit -m "feat(managed-alarms): router do acordo (pedir, aceitar, parar) e desvínculo encerra o acordo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 7: Router `managedAlarms` — a lista (`createAlarm`, `updateAlarm`, `deleteAlarm`, `ack`)

**Depende de:** Tarefas 3 (`managedAlarmInputSchema`, `normalizeManagedAlarm`), 4 (`writeManagedList`, `recordManagedAck`, `ManagedListConflictError`), 5 (`recordCaregiverAlarmChanges`, `sendExpoDataPush`) e 6 (o arquivo `server/routers-managed-alarms.ts`, os helpers e `tests/_managed-alarms-fakes.ts`)

**Files:**
- Modify: `server/routers-managed-alarms.ts` (imports; helpers de escrita; quatro procedures)
- Test: `tests/managed-alarms-list.test.ts` (novo)

**Interfaces:**
- Consumes: `managedAlarmInputSchema`, `normalizeManagedAlarm` (`server/_core/managed-alarm-schema`); `getManagedList`, `writeManagedList`, `recordManagedAck`, `ManagedListConflictError` (`server/db-managed-alarm-list`); `recordCaregiverAlarmChanges` (`server/alarm-changes`); `diffAlarms`, `AlarmChange` (`server/_core/alarm-diff`); `sendExpoDataPush` (`server/push`); `MANAGED_ALARMS_MAX` (`shared/managed-alarm`); helpers da Tarefa 6 (`requireCaregiverLink`, `requireMonitored`, `makeRateLimiter`, `safeErr`, `caregiverNameOf`).
- Produces (rotas):
  - `managedAlarms.createAlarm({ baseVersion: number, alarm: ManagedAlarmInput })` → `{ version: number }`
  - `managedAlarms.updateAlarm({ baseVersion: number, alarmId: string, alarm: ManagedAlarmInput })` → `{ version: number }`
  - `managedAlarms.deleteAlarm({ baseVersion: number, alarmId: string })` → `{ version: number }`
  - `managedAlarms.ack({ version: number, failedAlarmIds: string[] })` → `{ recorded: boolean }`
  - Erros: `FORBIDDEN` (não é o cuidador do acordo ativo), `CONFLICT` com a mensagem `A lista mudou. Confira de novo.`, `BAD_REQUEST` com `Limite de 24 alarmes atingido.`, `NOT_FOUND` com `Alarme não encontrado.`, `TOO_MANY_REQUESTS` (31ª gravação no minuto).
  - Depois de gravar: `sendExpoDataPush` ao idoso com `{ type: "managed_alarms_updated", version }` e `recordCaregiverAlarmChanges` (ambos sem segurar a resposta).

**Regras que os testes travam (spec 4.2 e 4.4):**
- Autorização em três camadas: (1) é cuidador com vínculo ativo; (2) o idoso é o do vínculo (nenhuma rota recebe `monitoredOpenId`); (3) existe acordo `active` e o `caregiverOpenId` dele é o chamador. Qualquer falha em (3) é `FORBIDDEN` — acordo pendente, encerrado, de outro cuidador ou inexistente.
- `alarmId` só é procurado dentro da lista do idoso do vínculo: um id de outra conta (ou de um idoso que não é o seu) dá `NOT_FOUND` e nada é gravado.
- `baseVersion` diferente da versão atual: `CONFLICT`, sem gravar e sem push. A corrida entre dois cuidadores no mesmo instante cai no `UPDATE … WHERE version = baseVersion` do banco (`ManagedListConflictError`) e vira o mesmo `CONFLICT`.
- O id do alarme novo é um UUID gerado no servidor; um `id` mandado pelo cliente é descartado pelo Zod.
- 24 alarmes no máximo (só `createAlarm` testa o limite; editar e apagar com a lista cheia continua funcionando).
- `ack`: só o idoso; versão menor ou igual à já aplicada, ou que não é a versão atual, é ignorada (`recorded: false`); `appliedAlarms` passa a ser a lista daquela versão e `failedAlarmIds` a falha informada. A chamada a `touchLiveness` no `ack` entra na Tarefa 8.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/managed-alarms-list.test.ts`:

```ts
/**
 * managed-alarms-list.test.ts
 *
 * A lista gerenciada pelo router `managedAlarms`: criar/editar/apagar pelo
 * cuidador do acordo e ack do celular do idoso. Foco em AUTORIZAÇÃO (IDOR),
 * conflito de versão, limite de 24 e ack de versão velha.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-management", async () => (await import("./_managed-alarms-fakes")).fakeManagementModule);
vi.mock("../server/db-managed-alarm-list", async () => (await import("./_managed-alarms-fakes")).fakeListModule);
vi.mock("../server/db-links", async () => (await import("./_managed-alarms-fakes")).fakeLinksModule);
vi.mock("../server/db-push", async () => (await import("./_managed-alarms-fakes")).fakePushDbModule);
vi.mock("../server/push", async () => (await import("./_managed-alarms-fakes")).fakePushModule);
vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  ...(await import("./_managed-alarms-fakes")).fakeDbOverrides,
}));
vi.mock("../server/alarm-changes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/alarm-changes")>()),
  recordCaregiverAlarmChanges: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/routers";
import * as push from "../server/push";
import * as alarmChanges from "../server/alarm-changes";
import * as listDb from "../server/db-managed-alarm-list";
import {
  FakeManagedListConflictError,
  flush,
  makeCtx,
  resetStore,
  sampleAlarm,
  seedActiveAgreement,
  seedPendingRequest,
  store,
} from "./_managed-alarms-fakes";

const as = (openId: string) => appRouter.createCaller(makeCtx(openId));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Alarme de remédio válido para o input (sem id: o servidor gera). */
const medInput = (over: Record<string, unknown> = {}) =>
  ({
    time: "09:30",
    description: "Metformina",
    enabled: true,
    repeat: "daily",
    sound: true,
    vibration: true,
    kind: "medication",
    ...over,
  }) as never;

const listOf = (monitoredOpenId: string) => store.lists.get(monitoredOpenId);

// O limite de 30 gravações/min vive na memória do processo e este arquivo grava
// bem mais que 30 vezes: cada teste roda numa janela de relógio nova (só o Date
// é falsificado; setImmediate e o resto seguem reais).
let relogio = Date.parse("2026-10-09T12:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  resetStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  relogio += 5 * 60_000;
  vi.setSystemTime(relogio);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("managedAlarms.createAlarm", () => {
  it("o cuidador do acordo cria: sobe a versão, grava o autor e devolve a nova versão", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    const result = await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });

    expect(result).toEqual({ version: 2 });
    expect(listOf("maria")?.version).toBe(2);
    expect(listOf("maria")?.updatedByOpenId).toBe("ana");
    expect(listOf("maria")?.alarms).toHaveLength(2);
    expect(listOf("maria")?.alarms[1]).toMatchObject({ time: "09:30", description: "Metformina", enabled: true });
  });

  it("o id é um UUID do servidor; um id mandado pelo cliente é descartado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ id: "forcado-pelo-cliente" }) });

    const novo = listOf("maria")?.alarms[1];
    expect(novo?.id).toMatch(UUID);
    expect(novo?.id).not.toBe("forcado-pelo-cliente");
  });

  it("check-in é forçado a diário, mesmo que o cliente mande outra repetição", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({
      baseVersion: 1,
      alarm: medInput({
        kind: "checkin",
        repeat: "weekdays",
        time: "10:00",
        description: "Como você está?",
        escalateAfterMinutes: 10,
      }),
    });

    const checkin = listOf("maria")?.alarms[1];
    expect(checkin?.kind).toBe("checkin");
    expect(checkin?.repeat).toBe("daily");
  });

  it("remédio não leva escalateAfterMinutes", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ escalateAfterMinutes: 10 }) });

    expect(listOf("maria")?.alarms[1].escalateAfterMinutes).toBeUndefined();
  });

  it("registra a criação com o cuidador como autor e manda o push silencioso ao idoso", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });
    await flush();

    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith({
      monitoredOpenId: "maria",
      authorOpenId: "ana",
      authorName: "Ana",
      personName: "Vó Maria",
      changes: [
        expect.objectContaining({
          changeType: "created",
          alarmDescription: "Metformina",
          oldTime: null,
          newTime: "09:30",
        }),
      ],
    });
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(1);
    expect(push.sendExpoDataPush).toHaveBeenCalledWith(["ExpoTok[maria]"], {
      type: "managed_alarms_updated",
      version: 2,
    });
  });

  it("o push silencioso não leva alarme nenhum, só o tipo e a versão", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ description: "Segredo" }) });
    await flush();

    const [, data] = vi.mocked(push.sendExpoDataPush).mock.calls[0];
    expect(JSON.stringify(data)).not.toContain("Segredo");
    expect(Object.keys(data).sort()).toEqual(["type", "version"]);
  });

  it("falha no push ou no registro da mudança não desfaz a gravação nem derruba a resposta", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(push.sendExpoDataPush).mockRejectedValueOnce(new Error("rede"));
    vi.mocked(alarmChanges.recordCaregiverAlarmChanges).mockRejectedValueOnce(new Error("db"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).resolves.toEqual({ version: 2 });
    await flush();
    expect(listOf("maria")?.version).toBe(2);
  });

  it("no limite de 24 alarmes, o 25º é BAD_REQUEST e a lista não muda", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: Array.from({ length: 24 }, (_, i) => sampleAlarm({ id: `a${i}` })),
    });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Limite de 24 alarmes atingido." });
    expect(listOf("maria")?.alarms).toHaveLength(24);
    expect(listOf("maria")?.version).toBe(1);
    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
  });

  it("com 23 alarmes o 24º entra", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: Array.from({ length: 23 }, (_, i) => sampleAlarm({ id: `a${i}` })),
    });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).resolves.toEqual({ version: 2 });
    expect(listOf("maria")?.alarms).toHaveLength(24);
  });

  it("remédios e check-ins contam juntos no limite", async () => {
    const mistos = Array.from({ length: 24 }, (_, i) =>
      i % 2 === 0 ? sampleAlarm({ id: `m${i}` }) : sampleAlarm({ id: `c${i}`, kind: "checkin", repeat: "daily" })
    );
    seedActiveAgreement({ caregiverOpenId: "ana", alarms: mistos });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ kind: "checkin", escalateAfterMinutes: 5 }) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("managedAlarms.createAlarm — validação (as regras do formulário)", () => {
  const invalidos: Array<[string, Record<string, unknown>]> = [
    ["horário sem dois dígitos", { time: "7:5" }],
    ["horário fora do relógio", { time: "25:00" }],
    ["repetição desconhecida", { repeat: "monthly" }],
    ["dias personalizados vazios", { repeat: "custom", customDays: [] }],
    ["dia personalizado fora de 0 a 6", { repeat: "custom", customDays: [7] }],
    ["nome com mais de 80 caracteres", { description: "x".repeat(81) }],
    ["atraso do check-in fora de 5/10/15/30", { kind: "checkin", escalateAfterMinutes: 7 }],
  ];

  it.each(invalidos)("rejeita %s e não grava nada", async (_nome, over) => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput(over) })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(listOf("maria")?.version).toBe(1);
    expect(listDb.writeManagedList).not.toHaveBeenCalled();
  });

  it("aceita nome com exatamente 80 caracteres", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput({ description: "x".repeat(80) }) })
    ).resolves.toEqual({ version: 2 });
  });
});

describe("managedAlarms.updateAlarm", () => {
  it("muda o horário: mantém o id, sobe a versão e registra 'rescheduled' com os dois horários", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" }); // a1 às 08:00

    const result = await as("ana").managedAlarms.updateAlarm({
      baseVersion: 1,
      alarmId: "a1",
      alarm: medInput({ time: "09:30", description: "Losartana" }),
    });
    await flush();

    expect(result).toEqual({ version: 2 });
    expect(listOf("maria")?.alarms).toHaveLength(1);
    expect(listOf("maria")?.alarms[0]).toMatchObject({ id: "a1", time: "09:30" });
    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        authorOpenId: "ana",
        changes: [
          expect.objectContaining({
            alarmId: "a1",
            changeType: "rescheduled",
            oldTime: "08:00",
            newTime: "09:30",
          }),
        ],
      })
    );
  });

  it("desligar o alarme registra 'disabled'", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.updateAlarm({
      baseVersion: 1,
      alarmId: "a1",
      alarm: medInput({ time: "08:00", description: "Losartana", enabled: false }),
    });
    await flush();

    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith(
      expect.objectContaining({ changes: [expect.objectContaining({ changeType: "disabled" })] })
    );
  });

  it("mudar só o nome grava e avisa o idoso, mas não registra mudança de horário", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("ana").managedAlarms.updateAlarm({
      baseVersion: 1,
      alarmId: "a1",
      alarm: medInput({ time: "08:00", description: "Losartana 50mg" }),
    });
    await flush();

    expect(listOf("maria")?.alarms[0].description).toBe("Losartana 50mg");
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(1);
    expect(alarmChanges.recordCaregiverAlarmChanges).not.toHaveBeenCalled();
  });

  it("alarmId que não existe na lista do idoso: NOT_FOUND e nada é gravado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.updateAlarm({ baseVersion: 1, alarmId: "nao-existe", alarm: medInput() })
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "Alarme não encontrado." });
    expect(listDb.writeManagedList).not.toHaveBeenCalled();
  });
});

describe("managedAlarms.deleteAlarm", () => {
  it("apaga só o alarme pedido, sobe a versão e registra 'deleted'", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: [sampleAlarm({ id: "a1" }), sampleAlarm({ id: "a2", time: "20:00", description: "Metformina" })],
    });

    const result = await as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a1" });
    await flush();

    expect(result).toEqual({ version: 2 });
    expect(listOf("maria")?.alarms.map((a) => a.id)).toEqual(["a2"]);
    expect(alarmChanges.recordCaregiverAlarmChanges).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({ alarmId: "a1", changeType: "deleted", alarmDescription: "Losartana", oldTime: "08:00" }),
        ],
      })
    );
  });

  it("alarmId inexistente: NOT_FOUND", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "nao-existe" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(listOf("maria")?.alarms).toHaveLength(1);
  });

  it("apagar e editar continuam funcionando com a lista cheia (24)", async () => {
    seedActiveAgreement({
      caregiverOpenId: "ana",
      alarms: Array.from({ length: 24 }, (_, i) => sampleAlarm({ id: `a${i}` })),
    });

    await expect(as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a0" })).resolves.toEqual({
      version: 2,
    });
    await expect(
      as("ana").managedAlarms.updateAlarm({ baseVersion: 2, alarmId: "a1", alarm: medInput({ time: "11:00" }) })
    ).resolves.toEqual({ version: 3 });
  });
});

describe("conflito de versão (baseVersion)", () => {
  it("baseVersion velha: CONFLICT com a mensagem do app, nada é gravado nem enviado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2
    vi.clearAllMocks();

    const atrasado = { baseVersion: 1 };
    await expect(
      as("ana").managedAlarms.createAlarm({ ...atrasado, alarm: medInput({ time: "10:00" }) })
    ).rejects.toMatchObject({ code: "CONFLICT", message: "A lista mudou. Confira de novo." });
    await expect(
      as("ana").managedAlarms.updateAlarm({ ...atrasado, alarmId: "a1", alarm: medInput() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      as("ana").managedAlarms.deleteAlarm({ ...atrasado, alarmId: "a1" })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(listOf("maria")?.version).toBe(2);
    expect(listOf("maria")?.alarms).toHaveLength(2);
    expect(listDb.writeManagedList).not.toHaveBeenCalled();
    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
  });

  it("baseVersion do futuro também é conflito", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 99, alarm: medInput() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("corrida: o banco recusa o UPDATE (versão mudou entre a leitura e a gravação) e vira o mesmo CONFLICT", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(listDb.writeManagedList).mockRejectedValueOnce(new FakeManagedListConflictError("corrida"));

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).rejects.toMatchObject({ code: "CONFLICT", message: "A lista mudou. Confira de novo." });
    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
  });

  it("erro de banco que não é conflito NÃO vira CONFLICT", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    vi.mocked(listDb.writeManagedList).mockRejectedValueOnce(new Error("DB fora do ar"));

    await expect(
      as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() })
    ).rejects.not.toMatchObject({ code: "CONFLICT" });
  });
});

describe("autorização (IDOR) das rotas de escrita", () => {
  const tentativas = {
    createAlarm: (openId: string) =>
      as(openId).managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }),
    updateAlarm: (openId: string) =>
      as(openId).managedAlarms.updateAlarm({ baseVersion: 1, alarmId: "a1", alarm: medInput() }),
    deleteAlarm: (openId: string) =>
      as(openId).managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a1" }),
  };

  describe.each(Object.entries(tentativas))("%s", (_nome, tentar) => {
    it("OUTRO cuidador vinculado ao mesmo idoso (que não é o do acordo) é FORBIDDEN e a lista não muda", async () => {
      seedActiveAgreement({ caregiverOpenId: "ana" });

      await expect(tentar("bia")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listOf("maria")?.version).toBe(1);
      expect(listOf("maria")?.alarms).toHaveLength(1);
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("cuidador SEM vínculo é FORBIDDEN", async () => {
      seedActiveAgreement({ caregiverOpenId: "ana" });

      await expect(tentar("carol")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("o IDOSO chamando a rota do cuidador é FORBIDDEN", async () => {
      seedActiveAgreement({ caregiverOpenId: "ana" });

      await expect(tentar("maria")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listOf("maria")?.version).toBe(1);
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("pedido ainda pendente não dá direito de editar", async () => {
      seedPendingRequest("ana", "maria");

      await expect(tentar("ana")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("sem nenhum acordo, o cuidador vinculado não edita", async () => {
      await expect(tentar("ana")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });

    it("acordo já encerrado não dá direito de editar", async () => {
      const acordo = seedActiveAgreement({ caregiverOpenId: "ana" });
      await as("ana").managedAlarms.stopManaging();
      expect(acordo.status).toBe("ended");
      vi.clearAllMocks();

      await expect(tentar("ana")).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(listDb.writeManagedList).not.toHaveBeenCalled();
    });
  });

  it("o idoso alvo vem do vínculo: o cuidador de OUTRO idoso só mexe na lista do idoso dele", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" }); // a1 = Losartana da Maria
    seedActiveAgreement({
      caregiverOpenId: "dina",
      monitoredOpenId: "joao",
      alarms: [sampleAlarm({ id: "a1", description: "Remédio do João" })],
    });

    // A Dina apaga "a1": o id existe nas duas listas, mas só a do João pode mudar.
    await as("dina").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "a1" });

    expect(listOf("joao")?.alarms).toHaveLength(0);
    expect(listOf("maria")?.alarms.map((a) => a.id)).toEqual(["a1"]);
    expect(listOf("maria")?.version).toBe(1);
    expect(vi.mocked(listDb.writeManagedList).mock.calls.every(([monitored]) => monitored === "joao")).toBe(true);
  });

  it("alarmId que só existe na lista de OUTRA conta é NOT_FOUND", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" });
    seedActiveAgreement({
      caregiverOpenId: "dina",
      monitoredOpenId: "joao",
      alarms: [sampleAlarm({ id: "so-do-joao", description: "Remédio do João" })],
    });

    await expect(
      as("ana").managedAlarms.updateAlarm({ baseVersion: 1, alarmId: "so-do-joao", alarm: medInput() })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      as("ana").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "so-do-joao" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(listOf("joao")?.alarms.map((a) => a.id)).toEqual(["so-do-joao"]);
    expect(listOf("joao")?.version).toBe(1);
  });

  it("um monitoredOpenId mandado no input é descartado (não redireciona a escrita)", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" });
    seedActiveAgreement({ caregiverOpenId: "dina", monitoredOpenId: "joao" });

    await as("ana").managedAlarms.createAlarm({
      baseVersion: 1,
      alarm: medInput(),
      monitoredOpenId: "joao",
    } as never);

    expect(listOf("maria")?.version).toBe(2);
    expect(listOf("joao")?.version).toBe(1);
  });

  it("31 gravações no mesmo minuto: a 31ª é TOO_MANY_REQUESTS", async () => {
    seedActiveAgreement({ caregiverOpenId: "rita", monitoredOpenId: "rita-mon" });

    for (let i = 0; i < 30; i++) {
      await as("rita")
        .managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "nao-existe" })
        .catch(() => undefined);
    }
    await expect(
      as("rita").managedAlarms.deleteAlarm({ baseVersion: 1, alarmId: "nao-existe" })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("managedAlarms.ack", () => {
  it("o celular confirma a versão: grava appliedVersion, appliedAlarms (a lista daquela versão) e as falhas", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2

    const result = await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1"] });

    expect(result).toEqual({ recorded: true });
    const lista = listOf("maria");
    expect(lista?.appliedVersion).toBe(2);
    expect(lista?.appliedAlarms).toHaveLength(2);
    expect(lista?.failedAlarmIds).toEqual(["a1"]);
    expect(lista?.appliedAt).toBeInstanceOf(Date);
  });

  it("ack de versão antiga é ignorado: a versão e a lista confirmadas não voltam atrás", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2
    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 2, alarm: medInput({ time: "21:00" }) }); // v3
    await as("maria").managedAlarms.ack({ version: 3, failedAlarmIds: [] });

    const atrasado = await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1"] });

    expect(atrasado).toEqual({ recorded: false });
    expect(listOf("maria")?.appliedVersion).toBe(3);
    expect(listOf("maria")?.appliedAlarms).toHaveLength(3);
    expect(listOf("maria")?.failedAlarmIds).toEqual([]);
  });

  it("repetir o mesmo ack não grava de novo", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });
    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] });

    await expect(as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["x"] })).resolves.toEqual({
      recorded: false,
    });
    expect(listOf("maria")?.failedAlarmIds).toEqual([]);
  });

  it("ack de uma versão que ainda não existe é ignorado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("maria").managedAlarms.ack({ version: 99, failedAlarmIds: [] })).resolves.toEqual({
      recorded: false,
    });
    expect(listOf("maria")?.appliedVersion).toBe(1);
  });

  it("ack de versão superada por uma gravação mais nova não confirma a lista nova", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // v2
    await as("ana").managedAlarms.createAlarm({ baseVersion: 2, alarm: medInput({ time: "21:00" }) }); // v3

    await expect(as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: [] })).resolves.toEqual({
      recorded: false,
    });
    expect(listOf("maria")?.appliedVersion).toBe(1);
  });

  it("sem acordo ativo o ack não grava nada e não dá erro", async () => {
    await expect(as("joao").managedAlarms.ack({ version: 1, failedAlarmIds: [] })).resolves.toEqual({
      recorded: false,
    });
  });

  it("o ack vale só para a lista do PRÓPRIO idoso", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana", monitoredOpenId: "maria" });
    seedActiveAgreement({ caregiverOpenId: "dina", monitoredOpenId: "joao" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() }); // maria v2

    await as("joao").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1"] });

    expect(listOf("maria")?.appliedVersion).toBe(1);
    expect(listOf("joao")?.appliedVersion).toBe(1);
    expect(listOf("joao")?.failedAlarmIds).toEqual([]);
    expect(vi.mocked(listDb.recordManagedAck).mock.calls[0][0]).toBe("joao");
  });

  it("ids de falha repetidos são gravados uma vez só", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });
    await as("ana").managedAlarms.createAlarm({ baseVersion: 1, alarm: medInput() });

    await as("maria").managedAlarms.ack({ version: 2, failedAlarmIds: ["a1", "a1", "a1"] });

    expect(listOf("maria")?.failedAlarmIds).toEqual(["a1"]);
  });

  it("o cuidador chamando o ack do idoso é FORBIDDEN", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("ana").managedAlarms.ack({ version: 1, failedAlarmIds: [] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("versão 0 e mais de 24 falhas são recusadas pelo Zod", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("maria").managedAlarms.ack({ version: 0, failedAlarmIds: [] })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      as("maria").managedAlarms.ack({
        version: 1,
        failedAlarmIds: Array.from({ length: 25 }, (_, i) => `a${i}`),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarms-list.test.ts`
Esperado: FAIL — `as(...).managedAlarms.createAlarm is not a function` (as procedures ainda não existem).

- [ ] **Passo 3: Implementar**

Em `server/routers-managed-alarms.ts`:

**3a. Imports.** Trocar:

```ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { MANAGEMENT_REQUEST_TTL_DAYS, type ManagedAlarm } from "../shared/managed-alarm.js";
import { pickPersonName } from "./_core/alarm-diff";
import { sanitizeAcceptedList } from "./_core/managed-alarm-schema";
```
por:
```ts
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MANAGED_ALARMS_MAX,
  MANAGEMENT_REQUEST_TTL_DAYS,
  type ManagedAlarm,
} from "../shared/managed-alarm.js";
import { diffAlarms, pickPersonName, type AlarmChange } from "./_core/alarm-diff";
import {
  managedAlarmInputSchema,
  normalizeManagedAlarm,
  sanitizeAcceptedList,
} from "./_core/managed-alarm-schema";
```
Trocar:
```ts
import { getManagedList } from "./db-managed-alarm-list";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";
```
por:
```ts
import { recordCaregiverAlarmChanges } from "./alarm-changes";
import {
  ManagedListConflictError,
  getManagedList,
  recordManagedAck,
  writeManagedList,
} from "./db-managed-alarm-list";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoDataPush, sendExpoPush } from "./push";
```

**3b. Helpers de escrita.** Logo depois de `const isRequestRateLimited = makeRateLimiter(60_000, 5);` acrescentar:

```ts
/** 30 gravações por minuto por cuidador (spec 4.2). */
const isWriteRateLimited = makeRateLimiter(60_000, 30);
```
e, logo depois da função `getMyOpenAgreement` (antes de `export interface MineResponse`), acrescentar:

```ts
/**
 * Para gravar a lista: existe acordo ATIVO do idoso do vínculo E o gerente é
 * este cuidador. Qualquer outra situação (sem acordo, pendente, encerrado, de
 * outro cuidador) é FORBIDDEN, como pede a spec 4.2.
 */
async function requireMyActiveAgreement(user: User, monitoredOpenId: string) {
  const open = await getOpenManagementForMonitored(monitoredOpenId);
  if (!open || open.status !== "active" || open.caregiverOpenId !== user.openId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Você não cuida dos alarmes desta pessoa.",
    });
  }
  return open;
}

const STALE_LIST_MESSAGE = "A lista mudou. Confira de novo.";

/**
 * Lê a lista do idoso e confere a versão que o cuidador estava vendo. O
 * `UPDATE … WHERE version = baseVersion` do banco (commitList) cobre a corrida
 * entre a leitura e a gravação.
 */
async function loadListForWrite(monitoredOpenId: string, baseVersion: number): Promise<ManagedAlarm[]> {
  const row = await getManagedList(monitoredOpenId);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Não encontramos os alarmes desta pessoa." });
  }
  if (row.version !== baseVersion) {
    throw new TRPCError({ code: "CONFLICT", message: STALE_LIST_MESSAGE });
  }
  return row.alarms as ManagedAlarm[];
}

/**
 * Grava a lista nova e dispara o que vem depois SEM segurar a resposta: o push
 * silencioso ao idoso (só tipo e versão — nenhum alarme viaja no push) e o
 * registro da mudança com o cuidador como autor (que avisa os OUTROS cuidadores).
 */
async function commitList(args: {
  caregiver: User;
  monitoredOpenId: string;
  baseVersion: number;
  next: ManagedAlarm[];
  changes: AlarmChange[];
}): Promise<{ version: number }> {
  let version: number;
  try {
    version = await writeManagedList(args.monitoredOpenId, args.baseVersion, args.next, args.caregiver.openId);
  } catch (err) {
    if (err instanceof ManagedListConflictError) {
      throw new TRPCError({ code: "CONFLICT", message: STALE_LIST_MESSAGE });
    }
    throw err;
  }

  void (async () => {
    const tokens = await getPushTokensForOpenIds([args.monitoredOpenId]);
    if (tokens.length === 0) return;
    // Não apaga token com DeviceNotRegistered aqui: quem decide "app removido"
    // é a verificação diária (Tarefa 10), que também olha os recibos.
    await sendExpoDataPush(
      tokens.map((t) => t.token),
      { type: "managed_alarms_updated", version }
    );
  })().catch((err) => {
    console.warn("[ManagedAlarms] push silencioso falhou:", safeErr(err));
  });

  if (args.changes.length > 0) {
    void (async () => {
      const [data, monitored] = await Promise.all([
        getUserData(args.monitoredOpenId),
        getUserByOpenId(args.monitoredOpenId),
      ]);
      await recordCaregiverAlarmChanges({
        monitoredOpenId: args.monitoredOpenId,
        authorOpenId: args.caregiver.openId,
        authorName: caregiverNameOf(args.caregiver),
        personName: pickPersonName(data?.anamnesis, monitored?.name),
        changes: args.changes,
      });
    })().catch((err) => {
      console.warn("[ManagedAlarms] registro da mudança falhou:", safeErr(err));
    });
  }

  return { version };
}

/** Entrada comum das três gravações: autoriza, limita e confere a versão. */
async function openWrite(user: User, baseVersion: number) {
  const link = await requireCaregiverLink(user);
  await requireMyActiveAgreement(user, link.monitoredOpenId);
  if (isWriteRateLimited(user.openId)) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Muitas mudanças em pouco tempo. Aguarde um instante.",
    });
  }
  const current = await loadListForWrite(link.monitoredOpenId, baseVersion);
  return { monitoredOpenId: link.monitoredOpenId, current };
}
```

**3c. As quatro procedures.** Trocar o final do router:

```ts
      body: `${monitoredName} voltou a cuidar dos próprios alarmes.`,
      data: { type: "management_ended" },
    });
    return { success: true } as const;
  }),
});
```
por:
```ts
      body: `${monitoredName} voltou a cuidar dos próprios alarmes.`,
      data: { type: "management_ended" },
    });
    return { success: true } as const;
  }),

  // =================== LISTA GERENCIADA ===================

  /** Cuidador do acordo: cria um alarme. O id é um UUID gerado aqui (o AlarmKit do iOS exige UUID). */
  createAlarm: protectedProcedure
    .input(z.object({ baseVersion: z.number().int().nonnegative(), alarm: managedAlarmInputSchema }))
    .mutation(async ({ ctx, input }) => {
      const { monitoredOpenId, current } = await openWrite(ctx.user, input.baseVersion);
      if (current.length >= MANAGED_ALARMS_MAX) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Limite de ${MANAGED_ALARMS_MAX} alarmes atingido.`,
        });
      }
      const alarm = normalizeManagedAlarm(input.alarm, randomUUID());
      return commitList({
        caregiver: ctx.user,
        monitoredOpenId,
        baseVersion: input.baseVersion,
        next: [...current, alarm],
        changes: [
          {
            alarmId: alarm.id,
            alarmDescription: alarm.description,
            changeType: "created",
            oldTime: null,
            newTime: alarm.time,
          },
        ],
      });
    }),

  /** Cuidador do acordo: edita um alarme (inclui ligar/desligar). O id procurado é só da lista do idoso do vínculo. */
  updateAlarm: protectedProcedure
    .input(
      z.object({
        baseVersion: z.number().int().nonnegative(),
        alarmId: z.string().min(1).max(64),
        alarm: managedAlarmInputSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { monitoredOpenId, current } = await openWrite(ctx.user, input.baseVersion);
      if (!current.some((a) => a.id === input.alarmId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alarme não encontrado." });
      }
      const updated = normalizeManagedAlarm(input.alarm, input.alarmId);
      const next = current.map((a) => (a.id === input.alarmId ? updated : a));
      return commitList({
        caregiver: ctx.user,
        monitoredOpenId,
        baseVersion: input.baseVersion,
        next,
        changes: diffAlarms(current, next),
      });
    }),

  /** Cuidador do acordo: apaga um alarme. */
  deleteAlarm: protectedProcedure
    .input(
      z.object({
        baseVersion: z.number().int().nonnegative(),
        alarmId: z.string().min(1).max(64),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { monitoredOpenId, current } = await openWrite(ctx.user, input.baseVersion);
      if (!current.some((a) => a.id === input.alarmId)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Alarme não encontrado." });
      }
      const next = current.filter((a) => a.id !== input.alarmId);
      return commitList({
        caregiver: ctx.user,
        monitoredOpenId,
        baseVersion: input.baseVersion,
        next,
        changes: diffAlarms(current, next),
      });
    }),

  /**
   * Idoso: o celular aplicou a versão `version` da lista e confirma (com os ids
   * que o sistema recusou agendar). O servidor só passa a cobrar no dead man's
   * switch o que foi confirmado. Versão velha, repetida ou inexistente é
   * ignorada (`recorded: false`) — nunca volta a confirmação para trás.
   */
  ack: protectedProcedure
    .input(
      z.object({
        version: z.number().int().positive(),
        failedAlarmIds: z.array(z.string().min(1).max(64)).max(MANAGED_ALARMS_MAX),
      })
    )
    .mutation(async ({ ctx, input }) => {
      requireMonitored(ctx.user);
      const recorded = await recordManagedAck(ctx.user.openId, input.version, [
        ...new Set(input.failedAlarmIds),
      ]);
      return { recorded };
    }),
});
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarms-list.test.ts tests/managed-alarms-agreement.test.ts`
Esperado: PASS.

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/routers-managed-alarms.ts tests/managed-alarms-list.test.ts
git commit -m "feat(managed-alarms): cuidador cria, edita e apaga alarmes do idoso; celular confirma com ack" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 8: Sinal do aparelho (`touchLiveness`), fuso no backup, backup sem diff no acordo e `monitoring.deviceSignedOut`

**Depende de:** Tarefas 2 (colunas `account_liveness.dmsPausedReason/dmsPausedAt/pauseNoticeSentAt` e `user_data.timezone`), 4 (`getActiveManagementForMonitored`) e 7 (a rota `managedAlarms.ack`). **Decisão de montagem:** esta tarefa cria `DmsPauseReason` e `pauseDms` (Passo 3a-bis, código idêntico ao da Tarefa 10, que pula a criação se já existir), para não haver dependência circular com a Tarefa 10 — a ordem de execução fica a natural.

**Files:**
- Modify: `server/db-monitoring.ts` (`touchLiveness`; `recordHeartbeat` limpa a pausa)
- Modify: `server/db.ts` (`upsertUserData` grava o fuso quando o cliente manda)
- Modify: `server/routers.ts` (`userData.put`: `timezone`, `touchLiveness`, pula o diff com acordo ativo)
- Modify: `server/routers-monitoring.ts` (`createEvent` e `confirmEvent` dão sinal; nova `deviceSignedOut`)
- Modify: `server/routers-push.ts` (`push.register` dá sinal)
- Modify: `server/routers-managed-alarms.ts` (`ack` dá sinal)
- Test: `tests/db-liveness.test.ts` (novo), `tests/db-user-data-timezone.test.ts` (novo), `tests/user-data-put-managed.test.ts` (novo), `tests/liveness-signals.test.ts` (novo); ajusta `tests/managed-alarms-list.test.ts`, `tests/monitoring.auth.test.ts`, `tests/monitoring.create-event-kind.test.ts`, `tests/monitoring-missed-alarm-push.test.ts`, `tests/user-data-put-alarm-changes.test.ts`

**Interfaces:**
- Consumes: `getActiveManagementForMonitored` (`server/db-alarm-management`); colunas novas do schema (Tarefa 2); `accountLiveness` (`drizzle/schema`).
- Produces:
  - `touchLiveness(openId: string): Promise<void>` (`server/db-monitoring.ts`): upsert de `lastSeenAt = agora` e limpeza de `dmsPausedReason/dmsPausedAt/pauseNoticeSentAt`. **Nunca lança** (erro vira log com nome+código): o sinal é carona de outra chamada e não pode derrubá-la.
  - `monitoring.deviceSignedOut` (mutation, sem input) → `{ success: true, paused: boolean }`; nunca lança.
  - `userData.put` aceita `timezone?: string | null` (até 64 caracteres) e grava em `user_data.timezone`; ausente preserva o valor guardado.
  - Quem dá sinal: `userData.put`, `monitoring.createEvent`, `monitoring.confirmEvent`, `managedAlarms.ack`, `push.register` e (já era) `heartbeat`/`register`. `userData.put` e `push.register` só dão sinal se a conta não for de cuidador (cuidador não tem dead man's switch).

**Decisões desta tarefa (leia antes):**
- `touchLiveness` é um único upsert que sempre grava `lastSeenAt` e sempre zera os três campos de pausa. Zerar um campo que já é nulo não custa nada e evita um SELECT antes. `recordHeartbeat` ganha a mesma limpeza, então um heartbeat também retoma a conta (spec 5.5: "qualquer sinal retoma").
- `userData.put` pula o `diffAlarms` **somente enquanto existe acordo `active`** da conta (`getActiveManagementForMonitored`): pedido pendente, acordo encerrado ou acordo de OUTRA conta não mudam nada. O backup em si (a cópia dos alarmes) continua sendo gravado sempre. Se a consulta do acordo falhar, o diff é pulado (regra do `diffAlarms`: na dúvida, calar é melhor que acusar a Maria de apagar o que a Ana apagou).
- `timezone` ausente no `put` não apaga o fuso já guardado (cliente antigo); `null` apaga.
- Várias contas no mesmo aparelho: `deviceSignedOut` pausa a CONTA que saiu. Se a mesma conta estiver aberta em outro aparelho, o próximo sinal dele a retoma em até 5 minutos.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/db-liveness.test.ts`:

```ts
/**
 * db-liveness.test.ts
 *
 * touchLiveness e recordHeartbeat: qualquer sinal do aparelho renova o
 * `lastSeenAt` e RETOMA uma conta pausada (spec 5.5). touchLiveness nunca lança.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Gravacao {
  values: Record<string, unknown>;
  set: Record<string, unknown>;
}
let gravacoes: Gravacao[] = [];
let falharAoGravar = false;

const fakeDb = {
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onDuplicateKeyUpdate: ({ set }: { set: Record<string, unknown> }) => {
        if (falharAoGravar) return Promise.reject(Object.assign(new Error("parametros secretos: maria-1"), { code: "ECONNRESET" }));
        gravacoes.push({ values, set });
        return Promise.resolve();
      },
    }),
  }),
};

const getDb = vi.fn(async (): Promise<unknown> => fakeDb);
vi.mock("../server/db", () => ({ getDb: () => getDb() }));

import { recordHeartbeat, touchLiveness } from "../server/db-monitoring";

const PAUSA_LIMPA = { dmsPausedReason: null, dmsPausedAt: null, pauseNoticeSentAt: null };

beforeEach(() => {
  vi.restoreAllMocks();
  gravacoes = [];
  falharAoGravar = false;
  getDb.mockReset();
  getDb.mockImplementation(async () => fakeDb);
});

describe("touchLiveness", () => {
  it("renova o lastSeenAt e limpa a pausa (retoma a conta)", async () => {
    const antes = Date.now();
    await touchLiveness("maria-1");

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].values).toMatchObject({ openId: "maria-1" });
    expect(gravacoes[0].set).toMatchObject(PAUSA_LIMPA);
    const visto = gravacoes[0].set.lastSeenAt as Date;
    expect(visto).toBeInstanceOf(Date);
    expect(visto.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("conta sem linha de liveness nasce com lastSeenAt agora", async () => {
    await touchLiveness("maria-2");

    expect(gravacoes[0].values.lastSeenAt).toBeInstanceOf(Date);
  });

  it("não mexe em localização, aparelho nem versão (só o sinal e a pausa)", async () => {
    await touchLiveness("maria-3");

    expect(Object.keys(gravacoes[0].set).sort()).toEqual(
      ["dmsPausedAt", "dmsPausedReason", "lastSeenAt", "pauseNoticeSentAt"].sort()
    );
  });

  it("sem banco não faz nada e não lança", async () => {
    getDb.mockImplementation(async () => null);
    await expect(touchLiveness("maria-4")).resolves.toBeUndefined();
    expect(gravacoes).toHaveLength(0);
  });

  it("erro de banco não lança e o log não traz a mensagem do erro (tem parâmetros da query)", async () => {
    falharAoGravar = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(touchLiveness("maria-5")).resolves.toBeUndefined();

    const logado = JSON.stringify(warn.mock.calls);
    expect(logado).toContain("ECONNRESET");
    expect(logado).not.toContain("maria-1");
    expect(logado).not.toContain("parametros secretos");
  });
});

describe("recordHeartbeat — retoma a conta pausada", () => {
  it("o heartbeat também limpa a pausa", async () => {
    await recordHeartbeat("maria-6", { appVersion: "1.2.3", lastDeviceId: "dev-1" });

    expect(gravacoes[0].set).toMatchObject({ appVersion: "1.2.3", lastDeviceId: "dev-1", ...PAUSA_LIMPA });
  });

  it("sem coordenada nova, o último fix conhecido é preservado (não entra no set)", async () => {
    await recordHeartbeat("maria-7");

    expect(gravacoes[0].set).not.toHaveProperty("lastLocation");
    expect(gravacoes[0].set).toMatchObject(PAUSA_LIMPA);
  });
});
```

Criar `tests/db-user-data-timezone.test.ts`:

```ts
/**
 * db-user-data-timezone.test.ts
 *
 * upsertUserData grava o fuso da conta (user_data.timezone) quando o cliente
 * manda. Cliente antigo (sem fuso) NÃO apaga o fuso já guardado; null apaga.
 * Usa o db.ts de verdade com o drizzle trocado por um dublê.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

interface Chamada {
  values: Record<string, unknown>;
  set: Record<string, unknown>;
}
const chamadas: Chamada[] = [];

const fakeDb = {
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onDuplicateKeyUpdate: ({ set }: { set: Record<string, unknown> }) => {
        chamadas.push({ values, set });
        return Promise.resolve();
      },
    }),
  }),
};

vi.mock("mysql2", () => ({ default: { createPool: vi.fn(() => ({})) } }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: vi.fn(() => fakeDb) }));
vi.mock("drizzle-orm/mysql2/migrator", () => ({ migrate: vi.fn() }));

import { upsertUserData } from "../server/db";

const base = { openId: "maria-1", dataUpdatedAt: 10 };

beforeEach(() => {
  chamadas.length = 0;
  process.env.DATABASE_URL = "mysql://u:p@localhost:3306/x";
});

describe("upsertUserData — fuso da conta", () => {
  it("fuso informado entra no insert e no update", async () => {
    await upsertUserData({ ...base, timezone: "America/Manaus" });

    expect(chamadas[0].values.timezone).toBe("America/Manaus");
    expect(chamadas[0].set.timezone).toBe("America/Manaus");
  });

  it("fuso null apaga o fuso guardado", async () => {
    await upsertUserData({ ...base, timezone: null });

    expect(chamadas[0].set).toHaveProperty("timezone", null);
  });

  it("fuso ausente (cliente antigo) preserva o guardado: a coluna nem entra no update", async () => {
    await upsertUserData(base);

    expect(chamadas[0].set).not.toHaveProperty("timezone");
    expect(chamadas[0].values).not.toHaveProperty("timezone");
  });

  it("o resto do backup continua sendo gravado como antes", async () => {
    await upsertUserData({ ...base, alarms: [{ id: "a1" }], timezone: "America/Sao_Paulo" });

    expect(chamadas[0].set).toMatchObject({ alarms: [{ id: "a1" }], dataUpdatedAt: 10 });
  });
});
```

Criar `tests/user-data-put-managed.test.ts`:

```ts
/**
 * user-data-put-managed.test.ts
 *
 * userData.put com o modo gerenciado:
 *  - com acordo ATIVO da conta, o backup é gravado mas o diff de alarmes NÃO
 *    roda (quem muda a lista é o cuidador, e cada mudança dele já foi
 *    registrada na gravação; sem isto o celular da Maria, ao aplicar o que a Ana
 *    apagou, geraria "Maria apagou…");
 *  - pedido pendente, acordo encerrado ou acordo de OUTRA conta não mudam nada;
 *  - o fuso do aparelho vai para user_data.timezone;
 *  - o put é sinal de vida do idoso (touchLiveness), mas não do cuidador.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

let storedAlarms: unknown = [];
const comAcordoAtivo = new Set<string>();
let consultaFalha = false;

vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  getUserData: vi.fn(async () => ({ alarms: storedAlarms })),
  upsertUserData: vi.fn(async () => undefined),
}));
vi.mock("../server/db-alarm-changes", () => ({
  insertAlarmChanges: vi.fn(async () => undefined),
  getRecentAlarmChanges: vi.fn(async () => []),
}));
vi.mock("../server/db-links", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-links")>()),
  getActiveCaregiversForMonitored: vi.fn(async () => [{ caregiverOpenId: "cg-1" }]),
}));
vi.mock("../server/db-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-push")>()),
  getPushTokensForOpenIds: vi.fn(async () => [{ token: "ExpoTok[cg-1]" }]),
}));
vi.mock("../server/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/push")>()),
  sendExpoPush: vi.fn(async () => 1),
}));
vi.mock("../server/db-alarm-management", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-alarm-management")>()),
  getActiveManagementForMonitored: vi.fn(async (openId: string) => {
    if (consultaFalha) throw new Error("DB fora do ar");
    return comAcordoAtivo.has(openId) ? { id: 1, monitoredOpenId: openId, status: "active" } : null;
  }),
}));
vi.mock("../server/db-monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-monitoring")>()),
  touchLiveness: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/routers";
import * as db from "../server/db";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbManagement from "../server/db-alarm-management";
import * as dbMonitoring from "../server/db-monitoring";
import * as push from "../server/push";

const losartana = { id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" };

function makeUser(openId: string, userType: "monitored" | "caregiver" = "monitored"): User {
  return {
    id: 1,
    openId,
    name: "Conta Maria",
    email: "maria@example.com",
    phone: null,
    userType,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(user: User): TrpcContext {
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function put(openId: string, extra: Record<string, unknown> = {}, userType: "monitored" | "caregiver" = "monitored") {
  const caller = appRouter.createCaller(makeCtx(makeUser(openId, userType)));
  return caller.userData.put({
    alarms: [],
    anamnesis: { fullName: "Vó Maria" },
    dataUpdatedAt: Date.now(),
    ...extra,
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  storedAlarms = [losartana];
  comAcordoAtivo.clear();
  consultaFalha = false;
});

describe("userData.put — diff de alarmes e acordo gerenciado", () => {
  it("com acordo ATIVO o backup é gravado, mas o diff não roda (nada registrado, nenhum push)", async () => {
    comAcordoAtivo.add("maria-1");

    await put("maria-1");
    await flush();

    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
    expect(vi.mocked(db.upsertUserData).mock.calls[0][0]).toMatchObject({ openId: "maria-1", alarms: [] });
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("sem acordo o diff roda como sempre (registra a exclusão e avisa o cuidador)", async () => {
    await put("maria-2");
    await flush();

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledWith([
      expect.objectContaining({ openId: "maria-2", alarmId: "a1", changeType: "deleted" }),
    ]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("a consulta é do acordo ATIVO da própria conta (pedido pendente e encerrado não contam)", async () => {
    await put("maria-3");

    expect(dbManagement.getActiveManagementForMonitored).toHaveBeenCalledWith("maria-3");
    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
  });

  it("acordo ativo de OUTRA conta não silencia o diff desta", async () => {
    comAcordoAtivo.add("joao-1");

    await put("maria-4");

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
  });

  it("quando o acordo acaba, o próximo backup volta a registrar", async () => {
    comAcordoAtivo.add("maria-5");
    await put("maria-5");
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();

    comAcordoAtivo.clear();
    storedAlarms = [losartana];
    await put("maria-5");

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
  });

  it("se não der para saber do acordo, o backup é gravado e o diff fica quieto (calar é melhor que acusar)", async () => {
    consultaFalha = true;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(put("maria-6")).resolves.toEqual({ success: true });
    await flush();

    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });
});

describe("userData.put — fuso do aparelho", () => {
  it("manda o fuso para o upsert", async () => {
    await put("maria-7", { timezone: "America/Manaus" });

    expect(vi.mocked(db.upsertUserData).mock.calls[0][0]).toMatchObject({ timezone: "America/Manaus" });
  });

  it("null chega como null (apaga) e ausente chega como undefined (preserva)", async () => {
    await put("maria-8", { timezone: null });
    await put("maria-8");

    expect(vi.mocked(db.upsertUserData).mock.calls[0][0].timezone).toBeNull();
    expect(vi.mocked(db.upsertUserData).mock.calls[1][0].timezone).toBeUndefined();
  });

  it("fuso com mais de 64 caracteres é recusado", async () => {
    await expect(put("maria-9", { timezone: "x".repeat(65) })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.upsertUserData).not.toHaveBeenCalled();
  });
});

describe("userData.put — sinal de vida", () => {
  it("o idoso dá sinal", async () => {
    await put("maria-10");

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria-10");
  });

  it("o cuidador não dá sinal (não tem dead man's switch)", async () => {
    await put("cuidador-1", {}, "caregiver");

    expect(dbMonitoring.touchLiveness).not.toHaveBeenCalled();
    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
  });
});
```

Criar `tests/liveness-signals.test.ts`:

```ts
/**
 * liveness-signals.test.ts
 *
 * Quem dá "sinal do aparelho" (renova lastSeenAt e retoma a conta pausada) e a
 * rota monitoring.deviceSignedOut (logout pausa o dead man's switch na hora).
 *  - dão sinal: push.register, monitoring.createEvent, monitoring.confirmEvent
 *    (userData.put e managedAlarms.ack têm testes próprios);
 *  - heartbeat/register já gravam lastSeenAt em recordHeartbeat (que também retoma);
 *  - cuidador não dá sinal no push.register, e nunca é pausado no logout.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

vi.mock("../server/db-monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-monitoring")>()),
  touchLiveness: vi.fn(async () => undefined),
  pauseDms: vi.fn(async () => true),
  recordHeartbeat: vi.fn(async () => undefined),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => null),
}));
vi.mock("../server/db-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-push")>()),
  upsertPushToken: vi.fn(async () => undefined),
}));

import { appRouter } from "../server/routers";
import * as dbMonitoring from "../server/db-monitoring";
import * as dbPush from "../server/db-push";

function makeUser(openId: string, userType: "monitored" | "caregiver" | null): User {
  return {
    id: 1,
    openId,
    name: "Conta",
    email: "x@example.com",
    phone: null,
    userType,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function caller(user: User | null) {
  const ctx: TrpcContext = {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

const evento = { alarmId: "a1", alarmDescription: "Remédio", scheduledAt: new Date().toISOString() };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sinal do aparelho nas rotas do idoso", () => {
  it("push.register dá sinal depois de gravar o token", async () => {
    await caller(makeUser("maria", "monitored")).push.register({ token: "ExpoTok[m]", platform: "android" });

    expect(dbPush.upsertPushToken).toHaveBeenCalledTimes(1);
    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
    const [gravou] = vi.mocked(dbPush.upsertPushToken).mock.invocationCallOrder;
    const [tocou] = vi.mocked(dbMonitoring.touchLiveness).mock.invocationCallOrder;
    expect(gravou).toBeLessThan(tocou);
  });

  it("push.register de CUIDADOR grava o token mas não dá sinal", async () => {
    await caller(makeUser("ana", "caregiver")).push.register({ token: "ExpoTok[a]", platform: "ios" });

    expect(dbPush.upsertPushToken).toHaveBeenCalledTimes(1);
    expect(dbMonitoring.touchLiveness).not.toHaveBeenCalled();
  });

  it("conta sem userType (cliente antigo) ainda conta como idoso no register", async () => {
    await caller(makeUser("velho", null)).push.register({ token: "ExpoTok[v]", platform: "android" });

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("velho");
  });

  it("createEvent dá sinal", async () => {
    await caller(makeUser("maria", "monitored")).monitoring.createEvent(evento);

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
  });

  it("createEvent dá sinal mesmo se a gravação do evento falhar (o aparelho está vivo)", async () => {
    vi.mocked(dbMonitoring.createAlarmEvent).mockRejectedValueOnce(new Error("DB fora do ar"));

    await expect(caller(makeUser("maria", "monitored")).monitoring.createEvent(evento)).rejects.toThrow();
    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
  });

  it("confirmEvent dá sinal", async () => {
    await caller(makeUser("maria", "monitored")).monitoring.confirmEvent({
      alarmId: "a1",
      scheduledAt: new Date().toISOString(),
      status: "responded",
    });

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
  });

  it("heartbeat segue gravando só pelo recordHeartbeat (que também retoma a conta)", async () => {
    await caller(makeUser("maria", "monitored")).monitoring.heartbeat({ lastDeviceId: "dev-1" });

    expect(dbMonitoring.recordHeartbeat).toHaveBeenCalledTimes(1);
    expect(dbMonitoring.touchLiveness).not.toHaveBeenCalled();
  });
});

describe("monitoring.deviceSignedOut", () => {
  it("o idoso saindo da conta pausa o dead man's switch na hora ('logged_out')", async () => {
    const result = await caller(makeUser("maria", "monitored")).monitoring.deviceSignedOut();

    expect(dbMonitoring.pauseDms).toHaveBeenCalledWith("maria", "logged_out");
    expect(result).toEqual({ success: true, paused: true });
  });

  it("conta que já estava pausada devolve paused:false, sem erro", async () => {
    vi.mocked(dbMonitoring.pauseDms).mockResolvedValueOnce(false);

    await expect(caller(makeUser("maria", "monitored")).monitoring.deviceSignedOut()).resolves.toEqual({
      success: true,
      paused: false,
    });
  });

  it("cuidador saindo da conta não pausa nada", async () => {
    const result = await caller(makeUser("ana", "caregiver")).monitoring.deviceSignedOut();

    expect(dbMonitoring.pauseDms).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, paused: false });
  });

  it("falha ao pausar nunca derruba o logout e o log não traz a mensagem do erro", async () => {
    vi.mocked(dbMonitoring.pauseDms).mockRejectedValueOnce(
      Object.assign(new Error("parametros secretos: maria"), { code: "ECONNRESET" })
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(caller(makeUser("maria", "monitored")).monitoring.deviceSignedOut()).resolves.toEqual({
      success: true,
      paused: false,
    });
    expect(JSON.stringify(warn.mock.calls)).toContain("ECONNRESET");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("parametros secretos");
  });

  it("sem sessão é UNAUTHORIZED e nada é pausado", async () => {
    await expect(caller(null).monitoring.deviceSignedOut()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(dbMonitoring.pauseDms).not.toHaveBeenCalled();
  });
});
```

**Ajustes em testes existentes.**

(a) Os três arquivos abaixo trocam `../server/db-monitoring` inteiro por uma fábrica; como `createEvent`/`confirmEvent` passam a chamar `touchLiveness`, a fábrica precisa dele. Em cada um, logo depois da linha `recordHeartbeat: vi.fn(async () => undefined),` da fábrica, acrescentar `touchLiveness: vi.fn(async () => undefined),`:
- `tests/monitoring.auth.test.ts`
- `tests/monitoring.create-event-kind.test.ts`
- `tests/monitoring-missed-alarm-push.test.ts`

(a2) `tests/user-data-put-alarm-changes.test.ts` passa por `userData.put`, que agora consulta o acordo. Para o teste não depender do banco (nem do que `getActiveManagementForMonitored` faz sem `DATABASE_URL`), depois do `vi.mock("../server/push", ...)` acrescentar:

```ts
vi.mock("../server/db-alarm-management", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-alarm-management")>()),
  getActiveManagementForMonitored: vi.fn(async () => null),
}));
```

(b) Os demais arquivos que também têm fábrica de `../server/db-monitoring` (`anonymous-account`, `whatsapp.auth`, `user-data-export`) não chamam nenhuma das rotas que passam a dar sinal; nada a mudar (o export só é acessado no momento da chamada).

(c) Em `tests/managed-alarms-list.test.ts`, o `ack` passa a dar sinal. Depois do `vi.mock("../server/alarm-changes", ...)` acrescentar:

```ts
vi.mock("../server/db-monitoring", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-monitoring")>()),
  touchLiveness: vi.fn(async () => undefined),
}));
```
e, junto dos outros imports (depois de `import * as listDb ...`): `import * as dbMonitoring from "../server/db-monitoring";`. No fim do `describe("managedAlarms.ack", ...)` (antes do `});` que o fecha) acrescentar:

```ts
  it("o ack dá sinal de vida do aparelho do idoso, mesmo quando é ignorado", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await as("maria").managedAlarms.ack({ version: 1, failedAlarmIds: [] }); // versão já aplicada: ignorado
    await as("maria").managedAlarms.ack({ version: 99, failedAlarmIds: [] }); // versão inexistente: ignorado

    expect(dbMonitoring.touchLiveness).toHaveBeenCalledTimes(2);
    expect(dbMonitoring.touchLiveness).toHaveBeenCalledWith("maria");
  });

  it("o cuidador chamando o ack não dá sinal em nome de ninguém", async () => {
    seedActiveAgreement({ caregiverOpenId: "ana" });

    await expect(as("ana").managedAlarms.ack({ version: 1, failedAlarmIds: [] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(dbMonitoring.touchLiveness).not.toHaveBeenCalled();
  });
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/db-liveness.test.ts tests/db-user-data-timezone.test.ts tests/user-data-put-managed.test.ts tests/liveness-signals.test.ts tests/managed-alarms-list.test.ts`
Esperado: FAIL — `touchLiveness is not a function`, `caller.monitoring.deviceSignedOut is not a function`, `timezone` ausente no `set` do upsert e o diff ainda rodando com acordo ativo.

- [ ] **Passo 3: Implementar**

**3a. `server/db-monitoring.ts`.**

(i) `recordHeartbeat` limpa a pausa. Trocar:

```ts
    .onDuplicateKeyUpdate({
      set: {
        lastSeenAt: now,
        appVersion: meta?.appVersion ?? null,
        lastDeviceId: meta?.lastDeviceId ?? null,
        ...locationFields,
        ...batteryFields,
      },
    });
}
```
por:
```ts
    .onDuplicateKeyUpdate({
      set: {
        lastSeenAt: now,
        appVersion: meta?.appVersion ?? null,
        lastDeviceId: meta?.lastDeviceId ?? null,
        ...locationFields,
        ...batteryFields,
        // Qualquer sinal retoma uma conta pausada pelo dead man's switch.
        dmsPausedReason: null,
        dmsPausedAt: null,
        pauseNoticeSentAt: null,
      },
    });
}

/**
 * "O aparelho deu sinal agora", vindo de uma chamada que já aconteceria de
 * qualquer jeito (backup, evento de alarme, token de push, ack). Renova o
 * `lastSeenAt` e RETOMA a conta se estava pausada (logout, app removido ou
 * 48 h sem sinal). Só o essencial: não toca localização, aparelho nem versão —
 * quem grava esses metadados é o heartbeat.
 *
 * NUNCA lança: o sinal é carona de outra chamada e não pode derrubá-la. Erro
 * vira log só com nome e código (a mensagem de um erro do drizzle traz os
 * parâmetros da query, inclusive o openId).
 */
export async function touchLiveness(openId: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    await db
      .insert(accountLiveness)
      .values({ openId, lastSeenAt: now })
      .onDuplicateKeyUpdate({
        set: {
          lastSeenAt: now,
          dmsPausedReason: null,
          dmsPausedAt: null,
          pauseNoticeSentAt: null,
        },
      });
  } catch (err) {
    const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
    console.warn(
      "[Liveness] não foi possível registrar o sinal do aparelho:",
      `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
    );
  }
}
```

**3a-bis. `server/db-monitoring.ts` — `DmsPauseReason` e `pauseDms`** (decisão de montagem: nascem aqui porque `monitoring.deviceSignedOut` os usa; a Tarefa 10 os testa e pula a criação). Acrescentar no fim do arquivo (os imports `and`, `eq`, `gt`, `isNull` e as tabelas `accountLiveness`/`alarmEvents` já existem no arquivo):

```ts
// --- Pausas do dead man's switch (Fase 4) -------------------------------------

export type DmsPauseReason = "logged_out" | "app_removed" | "no_signal";

function affectedRows(result: unknown): number {
  const r = result as { affectedRows?: number } | Array<{ affectedRows?: number }> | null;
  return (Array.isArray(r) ? r[0]?.affectedRows : r?.affectedRows) ?? 0;
}

/**
 * Pausa os disparos da conta. Só pausa conta que NÃO está pausada (não troca o
 * motivo de quem já está) e devolve `true` apenas quando pausou agora.
 *
 * Apaga os eventos PENDENTES FUTUROS (o servidor não cobra o que não vai
 * acontecer). Os que já venceram ficam: seguem a escada normal, porque o alarme
 * podia ter tocado antes da pausa.
 *
 * `pauseNoticeSentAt` zera: cada pausa tem o seu aviso aos cuidadores.
 */
export async function pauseDms(openId: string, reason: DmsPauseReason): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const now = new Date();

  // Logout de quem nunca deu sinal não tem linha de liveness; o `set` é um no-op
  // para não mexer em lastSeenAt de quem já tem.
  await db
    .insert(accountLiveness)
    .values({ openId, lastSeenAt: now })
    .onDuplicateKeyUpdate({ set: { openId } });

  const claimed = await db
    .update(accountLiveness)
    .set({ dmsPausedReason: reason, dmsPausedAt: now, pauseNoticeSentAt: null })
    .where(and(eq(accountLiveness.openId, openId), isNull(accountLiveness.dmsPausedReason)));
  if (affectedRows(claimed) === 0) return false;

  await db
    .delete(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        eq(alarmEvents.status, "pending"),
        gt(alarmEvents.scheduledAt, now)
      )
    );
  return true;
}
```

**3b. `server/db.ts`.** Em `upsertUserData`, trocar:

```ts
    profile: data.profile ?? null,
    dataUpdatedAt: data.dataUpdatedAt ?? 0,
  };
```
por:
```ts
    profile: data.profile ?? null,
    dataUpdatedAt: data.dataUpdatedAt ?? 0,
    // Fuso do aparelho (o servidor calcula os horários dos alarmes com ele).
    // undefined = cliente antigo que não manda o fuso: preserva o já guardado;
    // null apaga.
    ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
  };
```

**3c. `server/routers.ts`.**

(i) Imports. Trocar:

```ts
import { getAccountLiveness, getAlarmEventHistory, getWarningHistory } from "./db-monitoring";
```
por:
```ts
import { getAccountLiveness, getAlarmEventHistory, getWarningHistory, touchLiveness } from "./db-monitoring";
import { getActiveManagementForMonitored } from "./db-alarm-management";
```

(ii) Input do `userData.put`. Trocar:

```ts
          profile: z.record(z.string(), z.unknown()).nullable().optional(),
          dataUpdatedAt: z.number().int().nonnegative(),
        }),
      )
```
por:
```ts
          profile: z.record(z.string(), z.unknown()).nullable().optional(),
          // Nome IANA do fuso do aparelho. Opcional: cliente antigo não manda
          // (preserva o guardado); ROM sem ICU manda null.
          timezone: z.string().max(64).nullish(),
          dataUpdatedAt: z.number().int().nonnegative(),
        }),
      )
```

(iii) Corpo do `put`. Trocar:

```ts
          profile: (input.profile ?? null) as Record<string, unknown> | null,
          dataUpdatedAt: input.dataUpdatedAt,
        });

        await recordAndNotifyAlarmChanges({
          openId,
          previousAlarms,
          nextAlarms,
          personName: pickPersonName(input.anamnesis, ctx.user.name),
        });
        return { success: true } as const;
```
por:
```ts
          profile: (input.profile ?? null) as Record<string, unknown> | null,
          timezone: input.timezone,
          dataUpdatedAt: input.dataUpdatedAt,
        });

        // O backup é sinal de vida do idoso (cuidador não tem dead man's switch).
        if (ctx.user.userType !== "caregiver") await touchLiveness(openId);

        // Com o acordo gerenciado ATIVO, só o cuidador muda a lista, e cada
        // mudança dele já foi registrada (com ele como autor) na gravação. Sem
        // esta regra, o celular da Maria ao aplicar o que a Ana apagou geraria
        // "Maria apagou…". Só vale enquanto o acordo está ativo: pedido pendente
        // ou encerrado não muda nada. Na dúvida (a consulta falhou) o diff fica
        // quieto, mesma regra do diffAlarms: calar é melhor que acusar.
        let acordoAtivo = true;
        try {
          acordoAtivo = (await getActiveManagementForMonitored(openId)) !== null;
        } catch (err) {
          const e = err as { name?: string; cause?: { code?: string }; code?: string };
          console.warn(
            "[UserData] não foi possível consultar o acordo de alarmes:",
            `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim(),
          );
        }
        if (!acordoAtivo) {
          await recordAndNotifyAlarmChanges({
            openId,
            previousAlarms,
            nextAlarms,
            personName: pickPersonName(input.anamnesis, ctx.user.name),
          });
        }
        return { success: true } as const;
```

**3d. `server/routers-monitoring.ts`.**

(i) Import. Trocar:

```ts
  getWarningHistory,
  recordHeartbeat,
  updateAlarmEventStatusByAlarmId,
} from "./db-monitoring";
```
por:
```ts
  getWarningHistory,
  pauseDms,
  recordHeartbeat,
  touchLiveness,
  updateAlarmEventStatusByAlarmId,
} from "./db-monitoring";
```

(ii) `createEvent`. Trocar:

```ts
    .mutation(async ({ ctx, input }) => {
      const id = await createAlarmEvent({
```
por:
```ts
    .mutation(async ({ ctx, input }) => {
      // O aparelho está vivo (e retoma a conta se estava pausada), mesmo que a
      // gravação abaixo falhe.
      await touchLiveness(ctx.user.openId);
      const id = await createAlarmEvent({
```

(iii) `confirmEvent`. Trocar:

```ts
    .mutation(async ({ ctx, input }) => {
      const scheduledAt = new Date(input.scheduledAt);
      const transitioned = await updateAlarmEventStatusByAlarmId(
```
por:
```ts
    .mutation(async ({ ctx, input }) => {
      await touchLiveness(ctx.user.openId);
      const scheduledAt = new Date(input.scheduledAt);
      const transitioned = await updateAlarmEventStatusByAlarmId(
```

(iv) `deviceSignedOut`. Logo depois do fecho de `heartbeat` (a linha `return { success: true, timestamp: new Date().toISOString() };` seguida de `}),`), acrescentar:

```ts

  /**
   * O app do idoso vai sair da conta. Chamado ANTES de a sessão ser descartada
   * (precisa de auth). Pausa o dead man's switch na hora ('logged_out'): sem
   * ninguém logado o celular não pode responder a alarme, e os cuidadores são
   * avisados UMA vez pelo job (Tarefa 10). O próximo sinal da conta retoma.
   *
   * NUNCA lança: o logout não pode falhar por causa disto. Cuidador não tem
   * dead man's switch. Log só com nome e código do erro.
   */
  deviceSignedOut: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.userType === "caregiver") {
      return { success: true, paused: false } as const;
    }
    try {
      const paused = await pauseDms(ctx.user.openId, "logged_out");
      return { success: true, paused } as const;
    } catch (err) {
      const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
      console.warn(
        "[Monitoring] não foi possível pausar o aviso automático no logout:",
        `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim()
      );
      return { success: true, paused: false } as const;
    }
  }),
```
e acrescentar a linha ao comentário de rotas no topo do arquivo, depois de `monitoring.heartbeat       - Send "I'm alive" ping (liveness da conta)`:

```ts
 *   monitoring.deviceSignedOut - Logout do idoso: pausa o dead man's switch na hora
```

**3e. `server/routers-push.ts`.**

Import: trocar

```ts
import { deleteOwnedPushToken, upsertPushToken } from "./db-push";
```
por
```ts
import { deleteOwnedPushToken, upsertPushToken } from "./db-push";
import { touchLiveness } from "./db-monitoring";
```
e em `register`, trocar:

```ts
        deviceId: input.deviceId,
      });
      return { success: true } as const;
    }),

  /**
   * Remove o registro deste aparelho.
```
por:
```ts
        deviceId: input.deviceId,
      });
      // O token chegar é sinal de vida do aparelho do idoso (e prova que o app
      // está instalado). Cuidador não tem dead man's switch.
      if (ctx.user.userType !== "caregiver") await touchLiveness(ctx.user.openId);
      return { success: true } as const;
    }),

  /**
   * Remove o registro deste aparelho.
```

**3f. `server/routers-managed-alarms.ts`.**

Import: trocar `import { getPushTokensForOpenIds } from "./db-push";` por:

```ts
import { touchLiveness } from "./db-monitoring";
import { getPushTokensForOpenIds } from "./db-push";
```
e em `ack`, trocar:

```ts
      requireMonitored(ctx.user);
      const recorded = await recordManagedAck(ctx.user.openId, input.version, [
```
por:
```ts
      requireMonitored(ctx.user);
      // O celular confirmar é sinal de vida, mesmo quando o ack é ignorado.
      await touchLiveness(ctx.user.openId);
      const recorded = await recordManagedAck(ctx.user.openId, input.version, [
```

**3g. Ajustes dos testes existentes** (itens (a) e (c) do Passo 1).

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/db-liveness.test.ts tests/db-user-data-timezone.test.ts tests/user-data-put-managed.test.ts tests/liveness-signals.test.ts tests/managed-alarms-list.test.ts tests/managed-alarms-agreement.test.ts tests/monitoring.auth.test.ts tests/monitoring.create-event-kind.test.ts tests/monitoring-missed-alarm-push.test.ts tests/user-data-put-alarm-changes.test.ts tests/push-unregister.test.ts`
Esperado: PASS. (Os dois últimos provam que o fluxo antigo do backup e do `push.register` segue igual: sem acordo no banco de teste, `getActiveManagementForMonitored` devolve `null` e o diff roda.)

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/db-monitoring.ts server/db.ts server/routers.ts server/routers-monitoring.ts server/routers-push.ts server/routers-managed-alarms.ts tests/db-liveness.test.ts tests/db-user-data-timezone.test.ts tests/user-data-put-managed.test.ts tests/liveness-signals.test.ts tests/managed-alarms-list.test.ts tests/monitoring.auth.test.ts tests/monitoring.create-event-kind.test.ts tests/monitoring-missed-alarm-push.test.ts tests/user-data-put-alarm-changes.test.ts
git commit -m "feat(monitoring): sinal do aparelho retoma a conta, fuso no backup, put sem diff no acordo e deviceSignedOut" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 9: Job: o servidor pré-registra o próximo disparo de cada conta

**Depende de:** Tarefas 1, 2 e 4 (a lista confirmada `appliedAlarms`/`failedAlarmIds` vem de `managed_alarm_lists`).

**Por que:** hoje só o celular pré-registra os disparos (`syncAlarmsToServer`). Idoso que passa dias sem abrir o app não tem evento pendente no servidor, então o alarme que não tocou nunca escala. A partir daqui o servidor registra o próximo disparo de todas as contas **de idoso**, **não pausadas** e **com sinal nas últimas 48 h**. Conta gerenciada: só o que o celular confirmou (`appliedAlarms` menos `failedAlarmIds`); conta comum: os alarmes ligados do backup.

**Files:**
- Create: `server/_core/job-isolation.ts` (`describeError`, `runEach`, `runSteps`: isolamento por item e por passo, log sem a mensagem do erro)
- Create: `server/dms-preregister.ts` (`runPreRegistration`, `alarmsToCharge`, `resolveTimeZone`)
- Modify: `server/db-monitoring.ts` (imports; acréscimos no fim: `PreRegisterCandidate`, `getPreRegisterCandidates`, `findEventNear`, `ensureServerAlarmEvent`, `deleteFuturePendingEvents`)
- Test: `tests/job-isolation.test.ts`, `tests/db-monitoring-preregister.test.ts`, `tests/dms-preregister.test.ts`

**Interfaces:**
- Consumes: `nextFireMs(alarm: ScheduleAlarm, timeZone: string, now: Date): number | null` e `DEFAULT_TIME_ZONE` (`shared/alarm-schedule.ts`); `SAME_FIRING_WINDOW_MINUTES`, `NO_SIGNAL_PAUSE_HOURS`, `ManagedAlarm` (`shared/managed-alarm.ts`); `createAlarmEvent` (já existe); colunas da Tarefa 2.
- Produces (todos em `server/db-monitoring.ts`):
  - `type PreRegisterCandidate = { openId: string; alarms: unknown; timezone: string | null; managed: { appliedAlarms: unknown; failedAlarmIds: unknown } | null }`
  - `getPreRegisterCandidates(now: Date): Promise<PreRegisterCandidate[]>`
  - `findEventNear(openId: string, alarmId: string, at: Date, windowMinutes: number): Promise<boolean>`
  - `ensureServerAlarmEvent(data: InsertAlarmEvent, windowMinutes: number): Promise<"created" | "exists">`
  - `deleteFuturePendingEvents(openId: string, alarmIds: string[], now: Date): Promise<void>`
- Produces (`server/dms-preregister.ts`): `runPreRegistration(now: Date): Promise<{ registered: number }>`; `alarmsToCharge(candidate: PreRegisterCandidate): ChargeableAlarm[]`; `resolveTimeZone(timeZone: string | null): string`.
- Produces (`server/_core/job-isolation.ts`): `describeError(err: unknown): string`; `runEach<T>(items: readonly T[], label: string, fn: (item: T) => Promise<void>): Promise<number>` (devolve quantos itens falharam); `runSteps(label: string, steps: ReadonlyArray<readonly [string, () => Promise<void>]>): Promise<void>` (roda os passos isolados e, se algum falhou, rejeita com `${label}: falhou em ${nomes}`; usado pelas Tarefas 10 e 11).

**Regras que os testes travam (dead man's switch de idosos):**
1. Conta gerenciada só é cobrada pelo que está em `appliedAlarms` menos `failedAlarmIds`, e só os ligados. Alarme que o cuidador criou mas o celular ainda não confirmou **nunca** é pré-registrado (a lista corrente `user_data.alarms` é ignorada para conta gerenciada).
2. Evento antigo e ainda futuro de um alarme que falhou ao agendar é apagado (`deleteFuturePendingEvents`); senão ele venceria sem tocar e acusaria a pessoa à toa.
3. Não nasce segundo evento quando já existe evento (qualquer status) do mesmo `alarmId` a menos de 120 min do horário calculado (fuso do aparelho diferente do da conta).
4. Evento de check-in leva `kind: "checkin"` e `graceMinutes` (5, 10, 15 ou 30; inválido vira 5); remédio não leva nenhum dos dois.
5. Só entram contas não pausadas e com sinal nas últimas 48 h; só o próximo disparo, e só se cair nas próximas 24 h.
6. Falha de uma conta (ou de um alarme) não impede as outras; a rotina rejeita no fim, sem texto do erro (o `lastError` do job aparece em `/api/health`).
7. Nenhum log leva nome de remédio nem a mensagem de erro do drizzle (ela traz os parâmetros da query).

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/job-isolation.test.ts`:

```ts
/**
 * job-isolation.test.ts
 *
 * As rotinas da Fase 4 percorrem várias contas. Uma conta com dado ruim não
 * pode travar as outras, e o log nunca leva a mensagem do erro: a do drizzle
 * traz os parâmetros da query (nome do lembrete, openId) e o `lastError` do job
 * aparece em /api/health.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, runEach, runSteps } from "../server/_core/job-isolation";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeError", () => {
  it("devolve só nome e código, nunca a mensagem", () => {
    const err = Object.assign(new Error("Failed query: insert into alarm_events params: Losartana"), {
      name: "DrizzleQueryError",
      cause: { code: "ER_LOCK_DEADLOCK" },
    });
    expect(describeError(err)).toBe("DrizzleQueryError ER_LOCK_DEADLOCK");
    expect(describeError(err)).not.toContain("Losartana");
  });

  it("aceita valor que não é erro", () => {
    expect(describeError("boom")).toBe("Error");
    expect(describeError(null)).toBe("Error");
  });
});

describe("runEach", () => {
  it("processa todos os itens e devolve quantos falharam", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const visited: number[] = [];

    const failed = await runEach([1, 2, 3], "Teste", async (n) => {
      visited.push(n);
      if (n === 2) throw new Error("linha ruim com Losartana");
    });

    expect(visited).toEqual([1, 2, 3]);
    expect(failed).toBe(1);
  });

  it("não loga a mensagem do erro", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await runEach(["a"], "Teste", async () => {
      throw new Error("params: Losartana 08:00");
    });

    const logged = JSON.stringify(spy.mock.calls);
    expect(logged).toContain("Teste falhou");
    expect(logged).not.toContain("Losartana");
  });

  it("lista vazia devolve 0", async () => {
    await expect(runEach([], "Teste", async () => undefined)).resolves.toBe(0);
  });
});

describe("runSteps", () => {
  it("um passo que falha não impede os seguintes; rejeita no fim só com os nomes dos passos", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ran: string[] = [];

    const result = runSteps("Rotina", [
      ["um", async () => void ran.push("um")],
      [
        "dois",
        async () => {
          ran.push("dois");
          throw new Error("params: Losartana");
        },
      ],
      ["tres", async () => void ran.push("tres")],
    ]);

    await expect(result).rejects.toThrow("Rotina: falhou em dois");
    expect(ran).toEqual(["um", "dois", "tres"]);
    expect(JSON.stringify(spy.mock.calls)).not.toContain("Losartana");
  });

  it("todos os passos ok: resolve", async () => {
    await expect(runSteps("Rotina", [["um", async () => undefined]])).resolves.toBeUndefined();
  });
});
```

Criar `tests/db-monitoring-preregister.test.ts`:

```ts
/**
 * db-monitoring-preregister.test.ts
 *
 * Consultas novas do pré-registro feito pelo servidor. As condições `where` são
 * renderizadas em SQL (MySqlDialect) para travar o que importa: quem entra
 * (idoso, não pausado, sinal nas últimas 48 h) e a janela de 120 min.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

// Fila de resultados de SELECT, consumida na ordem em que as queries rodam.
let selectResults: unknown[][] = [];
const selectWheres: unknown[] = [];
const deleteWheres: unknown[] = [];
const inserts: Array<Record<string, unknown>> = [];

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (condition: unknown) => {
        selectWheres.push(condition);
        return chain;
      },
      limit: () => Promise.resolve(selectResults.shift() ?? []),
      then: (res: any, rej: any) => Promise.resolve(selectResults.shift() ?? []).then(res, rej),
    };
    return chain;
  },
  update: () => ({ set: () => ({ where: () => Promise.resolve([{ affectedRows: 1 }]) }) }),
  delete: () => ({
    where: (condition: unknown) => {
      deleteWheres.push(condition);
      return Promise.resolve([{ affectedRows: 1 }]);
    },
  }),
  insert: () => ({
    values: (values: Record<string, unknown>) => {
      inserts.push(values);
      return Promise.resolve({ insertId: 42 });
    },
  }),
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => fakeDb),
}));

import {
  deleteFuturePendingEvents,
  ensureServerAlarmEvent,
  findEventNear,
  getPreRegisterCandidates,
} from "../server/db-monitoring";

const dialect = new MySqlDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as SQL);
const sqlDate = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

const NOW = new Date("2026-10-10T12:00:00.000Z");

beforeEach(() => {
  selectResults = [];
  selectWheres.length = 0;
  deleteWheres.length = 0;
  inserts.length = 0;
});

describe("findEventNear", () => {
  it("procura evento do MESMO alarme dentro da janela, para os dois lados", async () => {
    selectResults = [[{ id: 5 }]];
    const at = new Date("2026-10-10T11:00:00.000Z");

    await expect(findEventNear("maria", "a1", at, 120)).resolves.toBe(true);

    const { sql, params } = render(selectWheres[0]);
    expect(sql).toContain("`alarm_events`.`openId` = ?");
    expect(sql).toContain("`alarm_events`.`alarmId` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` >= ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` <= ?");
    // Sem filtro de status: evento já resolvido também conta (a pessoa já respondeu).
    expect(sql).not.toContain("`alarm_events`.`status`");
    expect(params).toEqual([
      "maria",
      "a1",
      sqlDate(new Date("2026-10-10T09:00:00.000Z")),
      sqlDate(new Date("2026-10-10T13:00:00.000Z")),
    ]);
  });

  it("false quando não há evento por perto", async () => {
    selectResults = [[]];
    await expect(
      findEventNear("maria", "a1", new Date("2026-10-10T11:00:00.000Z"), 120)
    ).resolves.toBe(false);
  });
});

describe("ensureServerAlarmEvent", () => {
  const FUTURE = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const base = {
    openId: "maria",
    alarmId: "a1",
    alarmDescription: "Losartana",
    scheduledAt: FUTURE,
    status: "pending" as const,
  };

  it("já existe evento do alarme dentro da janela: não cria um segundo", async () => {
    selectResults = [[{ id: 5 }]];

    await expect(ensureServerAlarmEvent(base, 120)).resolves.toBe("exists");

    expect(inserts).toHaveLength(0);
  });

  it("nenhum evento por perto: cria, com kind e graceMinutes do check-in", async () => {
    selectResults = [[], [], []]; // janela, depois os dois SELECTs do createAlarmEvent

    await expect(
      ensureServerAlarmEvent({ ...base, kind: "checkin", graceMinutes: 15 }, 120)
    ).resolves.toBe("created");

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      openId: "maria",
      alarmId: "a1",
      kind: "checkin",
      graceMinutes: 15,
      status: "pending",
    });
  });

  it("usa a janela recebida (a regra de 120 min vem de quem chama)", async () => {
    selectResults = [[{ id: 5 }]];

    await ensureServerAlarmEvent(base, 30);

    const { params } = render(selectWheres[0]);
    expect(params[2]).toBe(sqlDate(new Date(FUTURE.getTime() - 30 * 60_000)));
    expect(params[3]).toBe(sqlDate(new Date(FUTURE.getTime() + 30 * 60_000)));
  });
});

describe("getPreRegisterCandidates", () => {
  it("só idoso (não cuidador), não pausado, com sinal nas últimas 48 h", async () => {
    selectResults = [[]];

    await getPreRegisterCandidates(NOW);

    const { sql, params } = render(selectWheres[0]);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is null");
    expect(sql).toContain("`account_liveness`.`lastSeenAt` >= ?");
    expect(sql).toContain("`users`.`userType` is null or `users`.`userType` <> ?");
    expect(params).toContain(sqlDate(new Date("2026-10-08T12:00:00.000Z")));
    expect(params).toContain("caregiver");
  });

  it("monta o candidato; conta gerenciada leva a lista confirmada, a comum leva managed null", async () => {
    selectResults = [
      [
        {
          openId: "maria",
          alarms: [{ id: "a1" }],
          timezone: "America/Rio_Branco",
          managedOpenId: "maria",
          appliedAlarms: [{ id: "a1" }],
          failedAlarmIds: ["a2"],
        },
        {
          openId: "joao",
          alarms: null,
          timezone: null,
          managedOpenId: null,
          appliedAlarms: null,
          failedAlarmIds: null,
        },
      ],
    ];

    const result = await getPreRegisterCandidates(NOW);

    expect(result).toEqual([
      {
        openId: "maria",
        alarms: [{ id: "a1" }],
        timezone: "America/Rio_Branco",
        managed: { appliedAlarms: [{ id: "a1" }], failedAlarmIds: ["a2"] },
      },
      { openId: "joao", alarms: null, timezone: null, managed: null },
    ]);
  });
});

describe("deleteFuturePendingEvents", () => {
  it("apaga só pendentes FUTUROS dos alarmes dados, da própria conta", async () => {
    await deleteFuturePendingEvents("maria", ["a2", "a3"], NOW);

    const { sql, params } = render(deleteWheres[0]);
    expect(sql).toContain("`alarm_events`.`openId` = ?");
    expect(sql).toContain("`alarm_events`.`alarmId` in (?, ?)");
    expect(sql).toContain("`alarm_events`.`status` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` > ?");
    expect(params).toEqual(["maria", "a2", "a3", "pending", sqlDate(NOW)]);
  });

  it("lista vazia não consulta o banco", async () => {
    await deleteFuturePendingEvents("maria", [], NOW);
    expect(deleteWheres).toHaveLength(0);
  });
});
```

Criar `tests/dms-preregister.test.ts`:

```ts
/**
 * dms-preregister.test.ts
 *
 * O servidor passa a registrar o próximo disparo de cada conta de idoso. Cada
 * erro aqui é um alarme falso (a família acordada de madrugada por um alarme
 * que nunca existiu) ou um alarme mudo (o switch não sabe que era esperado).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getPreRegisterCandidates: vi.fn(async () => []),
  ensureServerAlarmEvent: vi.fn(async () => "created"),
  deleteFuturePendingEvents: vi.fn(async () => undefined),
}));

import { alarmsToCharge, resolveTimeZone, runPreRegistration } from "../server/dms-preregister";
import * as db from "../server/db-monitoring";
import type { PreRegisterCandidate } from "../server/db-monitoring";

// Sábado 10/10/2026, 06:00 UTC = 03:00 em São Paulo = 01:00 em Rio Branco.
const NOW = new Date("2026-10-10T06:00:00.000Z");

const alarm = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

const candidate = (over: Partial<PreRegisterCandidate> = {}): PreRegisterCandidate => ({
  openId: "maria",
  alarms: [],
  timezone: null,
  managed: null,
  ...over,
});

const registered = () =>
  vi.mocked(db.ensureServerAlarmEvent).mock.calls.map(([data]) => data);

function withCandidates(...list: PreRegisterCandidate[]) {
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue(list);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([]);
  vi.mocked(db.ensureServerAlarmEvent).mockResolvedValue("created");
  vi.mocked(db.deleteFuturePendingEvents).mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("conta comum: alarmes do backup", () => {
  it("registra o próximo disparo dos alarmes LIGADOS, no fuso da conta", async () => {
    withCandidates(
      candidate({
        timezone: "America/Rio_Branco",
        alarms: [alarm(), alarm({ id: "a2", time: "20:00", enabled: false })],
      })
    );

    const result = await runPreRegistration(NOW);

    expect(result).toEqual({ registered: 1 });
    expect(registered()).toHaveLength(1);
    expect(registered()[0]).toMatchObject({
      openId: "maria",
      alarmId: "a1",
      alarmDescription: "Losartana",
      timezone: "America/Rio_Branco",
      status: "pending",
    });
    // 08:00 em Rio Branco (UTC-5) = 13:00 UTC.
    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T13:00:00.000Z");
  });

  it("sem fuso conhecido usa America/Sao_Paulo", async () => {
    withCandidates(candidate({ alarms: [alarm()] }));

    await runPreRegistration(NOW);

    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T11:00:00.000Z");
    expect(registered()[0].timezone).toBe("America/Sao_Paulo");
  });

  it("fuso inválido guardado na conta não derruba: usa São Paulo", async () => {
    withCandidates(candidate({ timezone: "Marte/Fobos", alarms: [alarm()] }));

    await expect(runPreRegistration(NOW)).resolves.toEqual({ registered: 1 });

    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T11:00:00.000Z");
  });

  it("só registra disparo das próximas 24 horas", async () => {
    withCandidates(
      candidate({
        alarms: [
          alarm({ id: "hoje", time: "08:00" }),
          alarm({ id: "amanha-cedo", time: "02:00" }), // 23 h adiante
          alarm({ id: "so-segunda", repeat: "weekdays" }), // próximo dia útil é segunda (>24 h)
          alarm({ id: "so-quarta", repeat: "custom", customDays: [3] }),
        ],
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId).sort()).toEqual(["amanha-cedo", "hoje"]);
  });

  it("alarme com horário ilegível ou sem id é ignorado e não atrapalha os outros", async () => {
    withCandidates(
      candidate({
        alarms: [
          alarm({ id: "ruim", time: "abc" }),
          alarm({ id: "impossivel", time: "25:99" }),
          alarm({ id: undefined }),
          null,
          "lixo",
          alarm({ id: "bom" }),
        ],
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId)).toEqual(["bom"]);
  });

  it("passa a janela de 120 min que evita o segundo evento do mesmo disparo", async () => {
    withCandidates(candidate({ alarms: [alarm()] }));

    await runPreRegistration(NOW);

    expect(vi.mocked(db.ensureServerAlarmEvent).mock.calls[0][1]).toBe(120);
  });

  it("evento que já existia (janela) não conta como registrado agora", async () => {
    withCandidates(candidate({ alarms: [alarm(), alarm({ id: "a2", time: "09:00" })] }));
    vi.mocked(db.ensureServerAlarmEvent).mockResolvedValueOnce("exists").mockResolvedValueOnce("created");

    await expect(runPreRegistration(NOW)).resolves.toEqual({ registered: 1 });
  });

  it("não apaga evento nenhum numa conta comum", async () => {
    withCandidates(candidate({ alarms: [alarm()] }));

    await runPreRegistration(NOW);

    expect(db.deleteFuturePendingEvents).not.toHaveBeenCalled();
  });
});

describe("check-in: kind e graceMinutes", () => {
  it("evento de check-in leva kind e o atraso escolhido", async () => {
    withCandidates(
      candidate({
        alarms: [alarm({ id: "c1", kind: "checkin", description: "Check-in", escalateAfterMinutes: 15 })],
      })
    );

    await runPreRegistration(NOW);

    expect(registered()[0]).toMatchObject({ alarmId: "c1", kind: "checkin", graceMinutes: 15 });
  });

  it("atraso ausente ou inválido vira 5 minutos", async () => {
    withCandidates(
      candidate({
        alarms: [
          alarm({ id: "c1", kind: "checkin" }),
          alarm({ id: "c2", kind: "checkin", escalateAfterMinutes: 7 }),
        ],
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.graceMinutes)).toEqual([5, 5]);
  });

  it("remédio não leva kind nem graceMinutes", async () => {
    withCandidates(candidate({ alarms: [alarm({ escalateAfterMinutes: 30 })] }));

    await runPreRegistration(NOW);

    expect(registered()[0]).not.toHaveProperty("kind");
    expect(registered()[0]).not.toHaveProperty("graceMinutes");
  });

  it("conta gerenciada também leva kind e graceMinutes do check-in confirmado", async () => {
    withCandidates(
      candidate({
        managed: {
          appliedAlarms: [alarm({ id: "c1", kind: "checkin", escalateAfterMinutes: 30 })],
          failedAlarmIds: [],
        },
      })
    );

    await runPreRegistration(NOW);

    expect(registered()[0]).toMatchObject({ kind: "checkin", graceMinutes: 30 });
  });
});

describe("conta gerenciada: só o que o celular confirmou", () => {
  it("cobra appliedAlarms MENOS failedAlarmIds, só os ligados", async () => {
    withCandidates(
      candidate({
        managed: {
          appliedAlarms: [
            alarm({ id: "ok", time: "08:00" }),
            alarm({ id: "falhou", time: "09:00" }),
            alarm({ id: "desligado", time: "10:00", enabled: false }),
          ],
          failedAlarmIds: ["falhou"],
        },
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId)).toEqual(["ok"]);
  });

  it("alarme criado pelo cuidador e ainda NÃO confirmado pelo celular nunca é pré-registrado", async () => {
    withCandidates(
      candidate({
        // lista corrente (backup do celular ou a do cuidador): tem o alarme novo "b"
        alarms: [alarm({ id: "a" }), alarm({ id: "b", time: "09:00" })],
        // o que o celular confirmou: só o "a"
        managed: { appliedAlarms: [alarm({ id: "a" })], failedAlarmIds: [] },
      })
    );

    await runPreRegistration(NOW);

    expect(registered().map((e) => e.alarmId)).toEqual(["a"]);
  });

  it("usa o horário CONFIRMADO, não o que o cuidador acabou de mudar", async () => {
    withCandidates(
      candidate({
        alarms: [alarm({ id: "a", time: "09:00" })],
        managed: { appliedAlarms: [alarm({ id: "a", time: "08:00" })], failedAlarmIds: [] },
      })
    );

    await runPreRegistration(NOW);

    expect((registered()[0].scheduledAt as Date).toISOString()).toBe("2026-10-10T11:00:00.000Z");
  });

  it("lista confirmada ilegível não cobra nada (e não usa o backup no lugar)", async () => {
    withCandidates(
      candidate({
        alarms: [alarm({ id: "backup" })],
        managed: { appliedAlarms: "lixo", failedAlarmIds: null },
      })
    );

    await expect(runPreRegistration(NOW)).resolves.toEqual({ registered: 0 });
    expect(db.ensureServerAlarmEvent).not.toHaveBeenCalled();
  });

  it("apaga o evento futuro pendente de alarme que falhou ao agendar", async () => {
    withCandidates(
      candidate({
        managed: { appliedAlarms: [alarm({ id: "ok" }), alarm({ id: "falhou" })], failedAlarmIds: ["falhou"] },
      })
    );

    await runPreRegistration(NOW);

    expect(db.deleteFuturePendingEvents).toHaveBeenCalledWith("maria", ["falhou"], NOW);
  });

  it("sem falha nenhuma não apaga evento", async () => {
    withCandidates(candidate({ managed: { appliedAlarms: [alarm()], failedAlarmIds: [] } }));

    await runPreRegistration(NOW);

    expect(db.deleteFuturePendingEvents).not.toHaveBeenCalled();
  });
});

describe("isolamento de falhas", () => {
  it("uma conta com erro não impede as outras; a rotina rejeita no fim sem vazar o erro", async () => {
    withCandidates(
      candidate({ openId: "ruim", alarms: [alarm({ id: "x" })] }),
      candidate({ openId: "boa", alarms: [alarm({ id: "y" })] })
    );
    vi.mocked(db.ensureServerAlarmEvent).mockImplementation(async (data) => {
      if (data.openId === "ruim") {
        throw new Error("Failed query: insert into alarm_events params: Losartana");
      }
      return "created";
    });

    let message = "";
    await runPreRegistration(NOW).catch((e: Error) => {
      message = e.message;
    });

    expect(message).toBe("Pré-registro: 1 conta(s) falharam");
    expect(registered().map((e) => e.openId)).toEqual(["ruim", "boa"]);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Losartana");
  });

  it("um alarme com erro não impede os outros alarmes da mesma conta", async () => {
    withCandidates(candidate({ alarms: [alarm({ id: "x" }), alarm({ id: "y", time: "09:00" })] }));
    vi.mocked(db.ensureServerAlarmEvent).mockRejectedValueOnce(new Error("deadlock"));

    await expect(runPreRegistration(NOW)).rejects.toThrow("Pré-registro");

    expect(registered().map((e) => e.alarmId)).toEqual(["x", "y"]);
  });

  it("a consulta de candidatos falhar rejeita a rotina (o job registra a falha)", async () => {
    vi.mocked(db.getPreRegisterCandidates).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));

    await expect(runPreRegistration(NOW)).rejects.toThrow("DATABASE_UNAVAILABLE");
  });

  it("nenhum log leva a descrição do alarme nem o fuso do cliente", async () => {
    withCandidates(candidate({ timezone: "Marte/Fobos", alarms: [alarm()] }));

    await runPreRegistration(NOW);

    const logged = JSON.stringify([
      ...vi.mocked(console.warn).mock.calls,
      ...vi.mocked(console.error).mock.calls,
    ]);
    expect(logged).not.toContain("Losartana");
    expect(logged).not.toContain("Marte");
  });
});

describe("alarmsToCharge e resolveTimeZone (funções puras)", () => {
  it("resolveTimeZone: válido passa, nulo e inválido caem em São Paulo", () => {
    expect(resolveTimeZone("Europe/Lisbon")).toBe("Europe/Lisbon");
    expect(resolveTimeZone(null)).toBe("America/Sao_Paulo");
    expect(resolveTimeZone("Marte/Fobos")).toBe("America/Sao_Paulo");
  });

  it("descarta id vazio, id com mais de 64 caracteres e item que não é objeto", () => {
    const list = alarmsToCharge(
      candidate({
        alarms: [alarm({ id: "" }), alarm({ id: "x".repeat(65) }), 7, alarm({ id: "ok" })],
      })
    );
    expect(list.map((a) => a.id)).toEqual(["ok"]);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/job-isolation.test.ts tests/db-monitoring-preregister.test.ts tests/dms-preregister.test.ts`
Esperado: FAIL com `Failed to resolve import "../server/_core/job-isolation"` e `"../server/dms-preregister"`; e `findEventNear is not a function` nos testes de banco.

- [ ] **Passo 3: Implementar**

**3a.** Criar `server/_core/job-isolation.ts`:

```ts
/**
 * job-isolation.ts
 *
 * Apoio das rotinas do monitoring-job que percorrem várias contas (Fase 4).
 *
 * Duas regras valem para todas:
 *  - um item com dado ruim não pode travar os outros (a lição de 24/07/2026:
 *    um try único derrubou o job inteiro e o switch ficou 27 h desarmado);
 *  - o log leva só nome e código do erro. A mensagem de um erro do drizzle traz
 *    os parâmetros da query (openId, nome do lembrete) e o `lastError` do job
 *    aparece em /api/health: nome de remédio não pode vazar por aí.
 */

/** Só campos seguros de um erro. */
export function describeError(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string } } | null;
  return `${e?.name ?? "Error"} ${e?.cause?.code ?? e?.code ?? ""}`.trim();
}

/**
 * Roda `fn` em cada item, isolando falhas. Devolve quantos itens falharam; quem
 * chama decide se isso reprova o ciclo (`throw`), sem a mensagem do erro.
 */
export async function runEach<T>(
  items: readonly T[],
  label: string,
  fn: (item: T) => Promise<void>
): Promise<number> {
  let failed = 0;
  for (const item of items) {
    try {
      await fn(item);
    } catch (err) {
      failed++;
      console.error(`[Monitor] ${label} falhou: ${describeError(err)}`);
    }
  }
  return failed;
}

/**
 * Roda os passos em ordem, cada um isolado. Se algum falhou, rejeita no fim com
 * os NOMES dos passos (nunca a mensagem dos erros): quem chama é o monitoring-job,
 * que guarda o texto em `lastError`, visível em /api/health.
 */
export async function runSteps(
  label: string,
  steps: ReadonlyArray<readonly [string, () => Promise<void>]>
): Promise<void> {
  const failed: string[] = [];
  for (const [name, fn] of steps) {
    try {
      await fn();
    } catch (err) {
      failed.push(name);
      console.error(`[Monitor] ${label} (${name}) falhou: ${describeError(err)}`);
    }
  }
  if (failed.length > 0) throw new Error(`${label}: falhou em ${failed.join(", ")}`);
}
```

**3b.** Em `server/db-monitoring.ts`, trocar o import do schema (linhas 15-21):

```ts
import {
  accountLiveness,
  alarmChanges,
  alarmEvents,
  InsertAlarmEvent,
  warningLog,
} from "../drizzle/schema";
```

por:

```ts
import {
  accountLiveness,
  alarmChanges,
  alarmEvents,
  InsertAlarmEvent,
  managedAlarmLists,
  userData,
  users,
  warningLog,
} from "../drizzle/schema";
```

(Se a Tarefa 8 já mexeu neste bloco, apenas garanta que `managedAlarmLists`, `userData` e `users` estão na lista, sem duplicar nome.)

Logo abaixo da linha `import { LEGACY_CHECKIN_ALARM_ID, warningAnchor } from "./_core/event-kind";`, acrescentar:

```ts
import { NO_SIGNAL_PAUSE_HOURS } from "../shared/managed-alarm";
```

Acrescentar **no fim** de `server/db-monitoring.ts` (depois de `purgeStaleData`):

```ts

// --- Pré-registro feito pelo servidor (Fase 4) --------------------------------

/**
 * Conta de idoso que o servidor pré-registra: não pausada e com sinal do
 * aparelho nas últimas 48 h (`NO_SIGNAL_PAUSE_HOURS`). Conta de cuidador não tem
 * alarmes. `managed` vem preenchido quando há acordo ativo: nesse caso só vale a
 * lista que o celular CONFIRMOU (`appliedAlarms`), nunca `user_data.alarms`.
 */
export type PreRegisterCandidate = {
  openId: string;
  alarms: unknown;
  timezone: string | null;
  managed: { appliedAlarms: unknown; failedAlarmIds: unknown } | null;
};

export async function getPreRegisterCandidates(now: Date): Promise<PreRegisterCandidate[]> {
  const db = await getDb();
  // Fail-closed, como getAccountsWithUnconfirmedEvents: sem banco o job tem que
  // contar a falha, não responder "nenhuma conta".
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cutoff = new Date(now.getTime() - NO_SIGNAL_PAUSE_HOURS * 60 * 60 * 1000);

  const rows = await db
    .select({
      openId: accountLiveness.openId,
      alarms: userData.alarms,
      timezone: userData.timezone,
      managedOpenId: managedAlarmLists.monitoredOpenId,
      appliedAlarms: managedAlarmLists.appliedAlarms,
      failedAlarmIds: managedAlarmLists.failedAlarmIds,
    })
    .from(accountLiveness)
    .innerJoin(users, eq(users.openId, accountLiveness.openId))
    .leftJoin(userData, eq(userData.openId, accountLiveness.openId))
    .leftJoin(managedAlarmLists, eq(managedAlarmLists.monitoredOpenId, accountLiveness.openId))
    .where(
      and(
        isNull(accountLiveness.dmsPausedReason),
        gte(accountLiveness.lastSeenAt, cutoff),
        or(isNull(users.userType), ne(users.userType, "caregiver"))
      )
    );

  return rows.map((r) => ({
    openId: r.openId,
    alarms: r.alarms ?? null,
    timezone: r.timezone ?? null,
    managed: r.managedOpenId
      ? { appliedAlarms: r.appliedAlarms, failedAlarmIds: r.failedAlarmIds }
      : null,
  }));
}

/**
 * Existe evento (de QUALQUER status) do mesmo alarme a até `windowMinutes` do
 * horário `at`, para os dois lados? É a regra "mesmo disparo, um evento só": o
 * fuso do aparelho pode diferir do guardado na conta (viagem, fuso ainda nulo) e
 * o servidor não pode criar um segundo evento que expiraria e acusaria a pessoa
 * à toa. Evento já resolvido conta: quem já respondeu não gera outro.
 */
export async function findEventNear(
  openId: string,
  alarmId: string,
  at: Date,
  windowMinutes: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const windowMs = windowMinutes * 60 * 1000;
  const rows = await db
    .select({ id: alarmEvents.id })
    .from(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        eq(alarmEvents.alarmId, alarmId),
        gte(alarmEvents.scheduledAt, new Date(at.getTime() - windowMs)),
        lte(alarmEvents.scheduledAt, new Date(at.getTime() + windowMs))
      )
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Registro de disparo feito PELO SERVIDOR. Antes de criar, confere a janela de
 * `findEventNear`; criar mesmo é o `createAlarmEvent` de sempre (idempotente, um
 * pendente futuro por alarme). Fica numa função à parte para não mudar a ordem
 * das consultas do `createAlarmEvent`, de que os testes dependem.
 */
export async function ensureServerAlarmEvent(
  data: InsertAlarmEvent,
  windowMinutes: number
): Promise<"created" | "exists"> {
  if (await findEventNear(data.openId, data.alarmId, data.scheduledAt as Date, windowMinutes)) {
    return "exists";
  }
  await createAlarmEvent(data);
  return "created";
}

/**
 * Apaga os eventos PENDENTES e FUTUROS dos alarmes dados. Usado para o alarme que
 * o celular não conseguiu agendar: o evento registrado antes da mudança venceria
 * sem tocar e acusaria a pessoa de não responder. Os que já venceram ficam.
 */
export async function deleteFuturePendingEvents(
  openId: string,
  alarmIds: string[],
  now: Date
): Promise<void> {
  if (alarmIds.length === 0) return;
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .delete(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        inArray(alarmEvents.alarmId, alarmIds),
        eq(alarmEvents.status, "pending"),
        gt(alarmEvents.scheduledAt, now)
      )
    );
}
```

**3c.** Criar `server/dms-preregister.ts`:

```ts
/**
 * dms-preregister.ts
 *
 * O servidor pré-registra o PRÓXIMO disparo de cada alarme das contas de idoso.
 *
 * Até a Fase 4 só o celular pré-registrava (syncAlarmsToServer). Idoso que passa
 * dias sem abrir o app não tinha evento pendente: o alarme que não tocou nunca
 * escalava. Aqui o servidor sabe o que era esperado, sem nunca fazer o alarme
 * tocar nem mandar mensagem ao idoso (quem toca é sempre o celular).
 *
 * De onde vem a lista:
 *  - conta GERENCIADA: `appliedAlarms` menos `failedAlarmIds` (o que o celular
 *    confirmou ter agendado). Alarme que o cuidador criou e o celular ainda não
 *    confirmou NUNCA é cobrado, e `user_data.alarms` é ignorado;
 *  - conta comum: os alarmes ligados do backup (`user_data.alarms`).
 *
 * Só o próximo disparo, e só se cair nas próximas 24 h (um alarme toca no máximo
 * uma vez por dia, como o celular já registra). Conta pausada ou com mais de
 * 48 h sem sinal nem entra na consulta (ver getPreRegisterCandidates).
 */
import { DEFAULT_TIME_ZONE, nextFireMs } from "../shared/alarm-schedule";
import { SAME_FIRING_WINDOW_MINUTES, type ManagedAlarm } from "../shared/managed-alarm";
import { DEFAULT_GRACE_MINUTES } from "./_core/event-kind";
import { runEach } from "./_core/job-isolation";
import {
  deleteFuturePendingEvents,
  ensureServerAlarmEvent,
  getPreRegisterCandidates,
  type PreRegisterCandidate,
} from "./db-monitoring";

const HORIZON_MS = 24 * 60 * 60 * 1000;
/** Atrasos de aviso que o check-in aceita (`CHECKIN_ESCALATE_OPTIONS` do app). */
const CHECKIN_GRACE_OPTIONS: readonly number[] = [5, 10, 15, 30];
const REPEATS: readonly string[] = ["daily", "weekdays", "weekends", "custom"];
/** `alarm_events.alarmId` é varchar(64). */
const MAX_ALARM_ID_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 255;
/** HH:MM de 00:00 a 23:59; "25:99" não viraria um horário real. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export type ChargeableAlarm = {
  id: string;
  time: string;
  description: string;
  repeat: ManagedAlarm["repeat"];
  customDays: number[];
  isCheckin: boolean;
  graceMinutes: number;
};

/** Alarmes LIGADOS de uma lista JSON de origem não confiável. Item ruim é ignorado. */
function readEnabledAlarms(raw: unknown): ChargeableAlarm[] {
  if (!Array.isArray(raw)) return [];
  const out: ChargeableAlarm[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (a.enabled !== true) continue;
    if (typeof a.id !== "string" || a.id.length === 0 || a.id.length > MAX_ALARM_ID_LENGTH) continue;
    if (typeof a.time !== "string" || !TIME_PATTERN.test(a.time)) continue;
    out.push({
      id: a.id,
      time: a.time,
      description: typeof a.description === "string" ? a.description : "",
      // Valor desconhecido dispara todo dia, como firingJsDays faz no app.
      repeat: REPEATS.includes(a.repeat as string) ? (a.repeat as ManagedAlarm["repeat"]) : "daily",
      customDays: Array.isArray(a.customDays)
        ? a.customDays.filter((d): d is number => Number.isInteger(d))
        : [],
      isCheckin: a.kind === "checkin",
      graceMinutes: CHECKIN_GRACE_OPTIONS.includes(a.escalateAfterMinutes as number)
        ? (a.escalateAfterMinutes as number)
        : DEFAULT_GRACE_MINUTES,
    });
  }
  return out;
}

function readIds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

/** O que o servidor cobra desta conta. Ver o cabeçalho do arquivo. */
export function alarmsToCharge(candidate: PreRegisterCandidate): ChargeableAlarm[] {
  if (candidate.managed) {
    const failed = new Set(readIds(candidate.managed.failedAlarmIds));
    return readEnabledAlarms(candidate.managed.appliedAlarms).filter((a) => !failed.has(a.id));
  }
  return readEnabledAlarms(candidate.alarms);
}

/**
 * O fuso vem do aparelho (entrada não confiável): nome inválido faz o Intl
 * lançar RangeError, e isso derrubaria o pré-registro de uma conta inteira.
 */
export function resolveTimeZone(timeZone: string | null): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone });
    return timeZone;
  } catch {
    // Sem o valor no log: é texto vindo do cliente.
    console.warn("[PreRegistro] fuso inválido guardado na conta — usando o padrão");
    return DEFAULT_TIME_ZONE;
  }
}

export async function runPreRegistration(now: Date): Promise<{ registered: number }> {
  const candidates = await getPreRegisterCandidates(now);
  let registered = 0;

  const failedAccounts = await runEach(candidates, "Pré-registro de conta", async (account) => {
    const timeZone = resolveTimeZone(account.timezone);

    // Alarme que o celular não conseguiu agendar não é cobrado, e o evento que
    // ele registrou antes da mudança também sai.
    if (account.managed) {
      const failedIds = readIds(account.managed.failedAlarmIds);
      if (failedIds.length > 0) await deleteFuturePendingEvents(account.openId, failedIds, now);
    }

    const failedAlarms = await runEach(alarmsToCharge(account), "Pré-registro de alarme", async (alarm) => {
      const fireMs = nextFireMs(
        { time: alarm.time, enabled: true, repeat: alarm.repeat, customDays: alarm.customDays },
        timeZone,
        now
      );
      if (fireMs === null || fireMs - now.getTime() > HORIZON_MS) return;

      const outcome = await ensureServerAlarmEvent(
        {
          openId: account.openId,
          alarmId: alarm.id,
          alarmDescription: (alarm.description || alarm.time).slice(0, MAX_DESCRIPTION_LENGTH),
          scheduledAt: new Date(fireMs),
          timezone: timeZone,
          status: "pending",
          // Mesmo contrato de monitoring.createEvent: remédio não leva kind nem grace.
          ...(alarm.isCheckin ? { kind: "checkin", graceMinutes: alarm.graceMinutes } : {}),
        },
        SAME_FIRING_WINDOW_MINUTES
      );
      if (outcome === "created") registered++;
    });
    if (failedAlarms > 0) throw new Error("alarmes da conta falharam");
  });

  // Sem a mensagem dos erros: o `lastError` do job aparece em /api/health.
  if (failedAccounts > 0) throw new Error(`Pré-registro: ${failedAccounts} conta(s) falharam`);
  return { registered };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/job-isolation.test.ts tests/db-monitoring-preregister.test.ts tests/dms-preregister.test.ts tests/create-alarm-event-dedup.test.ts`
Esperado: PASS (o último garante que `createAlarmEvent` não mudou).

Se `dms-preregister.test.ts` falhar só nos horários (13:00Z / 11:00Z), o defeito está em `shared/alarm-schedule.ts` (Tarefa 1): `nextFireMs` com `America/Rio_Branco` precisa devolver 08:00 local. Corrija lá, não aqui.

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/_core/job-isolation.ts server/dms-preregister.ts server/db-monitoring.ts tests/job-isolation.test.ts tests/db-monitoring-preregister.test.ts tests/dms-preregister.test.ts
git commit -m "feat(monitoring): servidor pré-registra o próximo disparo das contas de idoso" -m "Conta gerenciada só é cobrada pelo que o celular confirmou; um evento por disparo numa janela de 2 h; check-in leva kind e atraso." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

A rotina ainda não roda: a ligação no `runMonitoringJob` é a Tarefa 11.

## Tarefa 10: Job: pausas do dead man's switch

**Depende de:** Tarefas 2, 5, 8 e 9 (colunas de pausa; `sendExpoDataPush`/`fetchExpoReceipts`/`getPushTokensWithOwner`/`countPushTokens`; `touchLiveness` e a limpeza da pausa no `recordHeartbeat`; `getPreRegisterCandidates` e `job-isolation`).

**Por que:** não existe aviso de desinstalação no Android nem no iOS. Sem pausa, a família seria avisada todo dia, para sempre, sobre um celular que ficou no fundo da gaveta. Três motivos pausam a conta: `logged_out` (na hora, vem da Tarefa 8), `app_removed` (token de push morto) e `no_signal` (48 h sem nenhum sinal do aparelho). A pausa **apaga só os eventos pendentes futuros** (o servidor não cobra o que não vai acontecer), avisa cada cuidador **uma vez** por pausa, e **qualquer sinal do aparelho retoma**.

**Files:**
- Modify: `server/db-monitoring.ts` (import `isNotNull`; acréscimos no fim: `DmsPauseReason`, `pauseDms`, `getStaleUnpausedMonitoredAccounts`, `getPausesNeedingNotice`, `markPauseNoticeSent`)
- Create: `server/dms-pauses.ts` (`runDmsPauses`, `buildPauseNoticeBody`, `PAUSE_NOTICE_TITLE`, `__testing`)
- Test: `tests/db-monitoring-pauses.test.ts`, `tests/dms-pauses.test.ts`, `tests/dms-pauses-signals.test.ts`

**Interfaces:**
- Consumes: `getPreRegisterCandidates` (Tarefa 9); `sendExpoDataPush(tokens: string[], data: Record<string, unknown>): Promise<{ token: string; ticketId: string | null; deviceNotRegistered: boolean }[]>` e `fetchExpoReceipts(ticketIds: string[]): Promise<Record<string, { status: "ok" | "error"; details?: { error?: string } }>>` (`server/push.ts`, Tarefa 5); `getPushTokensWithOwner(openIds: string[]): Promise<{ token: string; openId: string }[]>` e `countPushTokens(openId: string): Promise<number>` (`server/db-push.ts`, Tarefa 5); `deletePushToken`, `getPushTokensForOpenIds` (já existem); `sendExpoPush`, `getActiveCaregiversForMonitored`, `getUserData`, `getUserByOpenId`, `pickPersonName` (já existem); `touchLiveness`/`recordHeartbeat` com limpeza da pausa (Tarefa 8); `NO_SIGNAL_PAUSE_HOURS` (`shared/managed-alarm.ts`).
- Produces (`server/db-monitoring.ts`):
  - `type DmsPauseReason = "logged_out" | "app_removed" | "no_signal"`
  - `pauseDms(openId: string, reason: DmsPauseReason): Promise<boolean>` (só pausa conta não pausada; apaga pendentes futuros; `true` se pausou agora)
  - `getStaleUnpausedMonitoredAccounts(now: Date): Promise<string[]>`
  - `getPausesNeedingNotice(): Promise<{ openId: string; reason: DmsPauseReason }[]>`
  - `markPauseNoticeSent(openId: string): Promise<void>`
- Produces (`server/dms-pauses.ts`): `runDmsPauses(now: Date): Promise<{ paused: number; noticesSent: number; pinged: number }>`; `buildPauseNoticeBody(reason: DmsPauseReason, name: string): string`; `PAUSE_NOTICE_TITLE = "Avisos pausados — Vigora"`; `__testing.reset()` (zera o estado em memória do ping e dos tickets).

**Regras que os testes travam:**
1. Conta pausada ou com mais de 48 h sem sinal não tem pré-registro (`getPreRegisterCandidates`, Tarefa 9) e a de 48 h é pausada como `no_signal` (aqui).
2. `pauseDms` só pausa conta **não pausada** (não troca o motivo de quem já está pausada) e apaga **somente** eventos `pending` com `scheduledAt` no futuro: os que já venceram seguem a escada normal.
3. **Um aviso por pausa:** `pauseNoticeSentAt` zera quando a pausa nasce e só é preenchido depois que algum cuidador recebeu (ou quando não há cuidador vinculado). Segunda rodada não repete. Se ninguém foi alcançado, tenta de novo na rodada seguinte (o perigo é o cuidador achar que o switch está armado).
4. **Qualquer sinal do aparelho retoma:** `recordHeartbeat` e `touchLiveness` limpam `dmsPausedReason`, `dmsPausedAt` e `pauseNoticeSentAt`; e `userData.put`, `monitoring.createEvent`, `monitoring.confirmEvent`, `push.register` e `managedAlarms.ack` chamam `touchLiveness`.
5. **`app_removed` só quando a verificação diária (ping) encontrou `DeviceNotRegistered` (no ticket ou no recibo) E a conta ficou sem nenhum token.** Conta de app antigo que nunca registrou token não é pingada nem pausada. Quem reinstalou (token novo) apaga o morto e não pausa.
6. Ping uma vez a cada 24 h; recibos consultados nas rodadas seguintes até aparecerem (ou 24 h).
7. Cada passo (recibos, ping, sem sinal, avisos) e cada conta falham isolados; a rotina rejeita no fim sem o texto dos erros.

- [ ] **Passo 1: Escrever os testes que falham**

Antes de escrever, conferir se a Tarefa 8 já criou `pauseDms` (ela precisa dele para `monitoring.deviceSignedOut`):

```bash
grep -n "export async function pauseDms\|export type DmsPauseReason\|export async function touchLiveness" server/db-monitoring.ts
```

Esperado: `touchLiveness`, `pauseDms` e `DmsPauseReason` — os três criados na Tarefa 8. **Não recrie** `pauseDms`/`DmsPauseReason` no Passo 3 (pule esse trecho do 3b): confira que a assinatura é a de "Produces" acima e siga para os outros três.

Criar `tests/db-monitoring-pauses.test.ts`:

```ts
/**
 * db-monitoring-pauses.test.ts
 *
 * Consultas das pausas do dead man's switch. As condições `where` são
 * renderizadas em SQL (MySqlDialect) porque o risco está nelas: apagar evento
 * que já venceu desarmaria o switch; pausar conta que já estava pausada trocaria
 * o motivo; aviso repetido acorda o cuidador à toa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

let selectResults: unknown[][] = [];
let updateAffected = 1;
const selectWheres: unknown[] = [];
const deleteWheres: unknown[] = [];
const updates: Array<{ values: Record<string, unknown>; where: unknown }> = [];
const upserts: Array<{ values: Record<string, unknown>; set: Record<string, unknown> }> = [];

const fakeDb = {
  select: () => {
    const chain: any = {
      from: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      where: (condition: unknown) => {
        selectWheres.push(condition);
        return chain;
      },
      limit: () => Promise.resolve(selectResults.shift() ?? []),
      then: (res: any, rej: any) => Promise.resolve(selectResults.shift() ?? []).then(res, rej),
    };
    return chain;
  },
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: (where: unknown) => {
        updates.push({ values, where });
        return Promise.resolve([{ affectedRows: updateAffected }]);
      },
    }),
  }),
  delete: () => ({
    where: (condition: unknown) => {
      deleteWheres.push(condition);
      return Promise.resolve([{ affectedRows: 1 }]);
    },
  }),
  insert: () => ({
    values: (values: Record<string, unknown>) => ({
      onDuplicateKeyUpdate: ({ set }: { set: Record<string, unknown> }) => {
        upserts.push({ values, set });
        return Promise.resolve([{ affectedRows: 1 }]);
      },
    }),
  }),
};

vi.mock("../server/db", () => ({
  getDb: vi.fn(async () => fakeDb),
}));

import {
  getPausesNeedingNotice,
  getStaleUnpausedMonitoredAccounts,
  markPauseNoticeSent,
  pauseDms,
  recordHeartbeat,
  touchLiveness,
} from "../server/db-monitoring";

const dialect = new MySqlDialect();
const render = (condition: unknown) => dialect.sqlToQuery(condition as SQL);
const sqlDate = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

const NOW = new Date("2026-10-10T12:00:00.000Z");

beforeEach(() => {
  selectResults = [];
  updateAffected = 1;
  selectWheres.length = 0;
  deleteWheres.length = 0;
  updates.length = 0;
  upserts.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("pauseDms", () => {
  it("pausa a conta: grava motivo e hora, zera o aviso e devolve true", async () => {
    await expect(pauseDms("maria", "no_signal")).resolves.toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual({
      dmsPausedReason: "no_signal",
      dmsPausedAt: NOW,
      pauseNoticeSentAt: null,
    });
  });

  it("só pausa conta que NÃO está pausada (não troca o motivo de quem já está)", async () => {
    await pauseDms("maria", "app_removed");

    const { sql, params } = render(updates[0].where);
    expect(sql).toContain("`account_liveness`.`openId` = ?");
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is null");
    expect(params).toEqual(["maria"]);
  });

  it("já pausada: devolve false e NÃO apaga evento nenhum", async () => {
    updateAffected = 0;

    await expect(pauseDms("maria", "no_signal")).resolves.toBe(false);

    expect(deleteWheres).toHaveLength(0);
  });

  it("apaga SÓ os eventos pendentes e FUTUROS da própria conta", async () => {
    await pauseDms("maria", "logged_out");

    expect(deleteWheres).toHaveLength(1);
    const { sql, params } = render(deleteWheres[0]);
    expect(sql).toContain("`alarm_events`.`openId` = ?");
    expect(sql).toContain("`alarm_events`.`status` = ?");
    expect(sql).toContain("`alarm_events`.`scheduledAt` > ?");
    // Evento que já venceu (scheduledAt <= agora) segue a escada normal.
    expect(sql).not.toContain("`scheduledAt` <");
    expect(params).toEqual(["maria", "pending", sqlDate(NOW)]);
  });

  it("garante a linha de liveness (logout de quem nunca deu sinal) sem mexer em lastSeenAt", async () => {
    await pauseDms("maria", "logged_out");

    expect(upserts).toHaveLength(1);
    expect(upserts[0].values).toMatchObject({ openId: "maria" });
    expect(upserts[0].set).toEqual({ openId: "maria" });
  });
});

describe("getStaleUnpausedMonitoredAccounts", () => {
  it("idoso não pausado com último sinal há mais de 48 h, e que tem user_data", async () => {
    selectResults = [[{ openId: "a" }, { openId: "b" }]];

    await expect(getStaleUnpausedMonitoredAccounts(NOW)).resolves.toEqual(["a", "b"]);

    const { sql, params } = render(selectWheres[0]);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is null");
    expect(sql).toContain("`account_liveness`.`lastSeenAt` < ?");
    expect(sql).toContain("`users`.`userType` is null or `users`.`userType` <> ?");
    expect(params).toContain(sqlDate(new Date("2026-10-08T12:00:00.000Z")));
    expect(params).toContain("caregiver");
  });
});

describe("getPausesNeedingNotice / markPauseNoticeSent", () => {
  it("lista só pausadas que ainda não foram avisadas", async () => {
    selectResults = [[{ openId: "maria", reason: "no_signal" }]];

    await expect(getPausesNeedingNotice()).resolves.toEqual([{ openId: "maria", reason: "no_signal" }]);

    const { sql } = render(selectWheres[0]);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is not null");
    expect(sql).toContain("`account_liveness`.`pauseNoticeSentAt` is null");
  });

  it("marcar o aviso só vale para pausa em curso e ainda não avisada (retomada no meio não marca)", async () => {
    await markPauseNoticeSent("maria");

    expect(updates[0].values).toEqual({ pauseNoticeSentAt: NOW });
    const { sql, params } = render(updates[0].where);
    expect(sql).toContain("`account_liveness`.`dmsPausedReason` is not null");
    expect(sql).toContain("`account_liveness`.`pauseNoticeSentAt` is null");
    expect(params).toEqual(["maria"]);
  });
});

// Se estes falharem, a Tarefa 8 deixou de limpar a pausa: o idoso voltaria a
// dar sinal e continuaria sem pré-registro nem aviso, com o switch desarmado.
describe("qualquer sinal do aparelho retoma a pausa", () => {
  const writes = () => [...upserts.map((u) => u.set), ...updates.map((u) => u.values)];
  const clearsPause = (w: Record<string, unknown>) =>
    w.dmsPausedReason === null && w.dmsPausedAt === null && w.pauseNoticeSentAt === null;

  it("heartbeat limpa motivo, hora e aviso da pausa", async () => {
    await recordHeartbeat("maria");

    expect(writes().some(clearsPause)).toBe(true);
  });

  it("touchLiveness atualiza lastSeenAt e limpa a pausa", async () => {
    await touchLiveness("maria");

    expect(writes().some(clearsPause)).toBe(true);
    expect(writes().some((w) => w.lastSeenAt instanceof Date)).toBe(true);
  });
});
```

Criar `tests/dms-pauses.test.ts`:

```ts
/**
 * dms-pauses.test.ts
 *
 * Pausa do dead man's switch: 48 h sem sinal, aviso único ao cuidador, e a
 * verificação diária (ping + recibos) que descobre app removido. Direção do
 * erro: pausar à toa cala o switch de um idoso que está bem; deixar de pausar
 * faz a família ser avisada todo dia sobre um celular abandonado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getStaleUnpausedMonitoredAccounts: vi.fn(async () => []),
  pauseDms: vi.fn(async () => true),
  getPausesNeedingNotice: vi.fn(async () => []),
  markPauseNoticeSent: vi.fn(async () => undefined),
  getPreRegisterCandidates: vi.fn(async () => []),
}));

vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => ({ anamnesis: { fullName: "Dona Maria" } })),
  getUserByOpenId: vi.fn(async () => ({ name: "Conta" })),
}));

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => [{ caregiverOpenId: "ana" }]),
}));

vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async () => [{ token: "ExpoTok[ana]" }]),
  getPushTokensWithOwner: vi.fn(async () => []),
  countPushTokens: vi.fn(async () => 0),
  deletePushToken: vi.fn(async () => undefined),
}));

vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 1),
  sendExpoDataPush: vi.fn(async () => []),
  fetchExpoReceipts: vi.fn(async () => ({})),
}));

import { __testing, buildPauseNoticeBody, PAUSE_NOTICE_TITLE, runDmsPauses } from "../server/dms-pauses";
import * as db from "../server/db-monitoring";
import * as dbLinks from "../server/db-links";
import * as dbPush from "../server/db-push";
import * as push from "../server/push";

const NOW = new Date("2026-10-10T12:00:00.000Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

/** Um idoso com um aparelho, pronto para o ping. */
function withDevice(token = "T1", openId = "maria") {
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([
    { openId, alarms: [], timezone: null, managed: null },
  ]);
  vi.mocked(dbPush.getPushTokensWithOwner).mockResolvedValue([{ token, openId }]);
}

beforeEach(() => {
  vi.clearAllMocks();
  __testing.reset();
  vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue([]);
  vi.mocked(db.pauseDms).mockResolvedValue(true);
  vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([]);
  vi.mocked(db.markPauseNoticeSent).mockResolvedValue(undefined);
  vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([]);
  vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([{ caregiverOpenId: "ana" }] as never);
  vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([{ token: "ExpoTok[ana]" }] as never);
  vi.mocked(dbPush.getPushTokensWithOwner).mockResolvedValue([]);
  vi.mocked(dbPush.countPushTokens).mockResolvedValue(0);
  vi.mocked(push.sendExpoPush).mockResolvedValue(1);
  vi.mocked(push.sendExpoDataPush).mockResolvedValue([]);
  vi.mocked(push.fetchExpoReceipts).mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("48 h sem sinal", () => {
  it("pausa cada conta parada como no_signal e conta só as que pausou agora", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["a", "b"]);
    vi.mocked(db.pauseDms).mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await runDmsPauses(NOW);

    expect(db.getStaleUnpausedMonitoredAccounts).toHaveBeenCalledWith(NOW);
    expect(db.pauseDms).toHaveBeenCalledWith("a", "no_signal");
    expect(db.pauseDms).toHaveBeenCalledWith("b", "no_signal");
    expect(result.paused).toBe(1);
  });

  it("falha numa conta não impede as outras; a rotina rejeita sem vazar o erro", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["a", "b"]);
    vi.mocked(db.pauseDms).mockImplementation(async (openId) => {
      if (openId === "a") throw new Error("Failed query: delete from alarm_events params: Losartana");
      return true;
    });

    let message = "";
    await runDmsPauses(NOW).catch((e: Error) => {
      message = e.message;
    });

    expect(db.pauseDms).toHaveBeenCalledWith("b", "no_signal");
    expect(message).toBe("Pausas: falhou em sem sinal");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Losartana");
  });

  it("um passo quebrado não impede os avisos das pausas que já existem", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "logged_out" }]);

    await expect(runDmsPauses(NOW)).rejects.toThrow("Pausas: falhou em sem sinal");

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });
});

describe("aviso da pausa ao cuidador", () => {
  it.each([
    [
      "logged_out",
      "Dona Maria saiu da conta do Vigora no celular. Os avisos automáticos estão pausados até Dona Maria entrar de novo.",
    ],
    [
      "app_removed",
      "O Vigora parece ter sido removido do celular de Dona Maria. Os avisos automáticos estão pausados.",
    ],
    [
      "no_signal",
      "O celular de Dona Maria não dá sinal há 2 dias. Os avisos automáticos estão pausados até ele voltar a se comunicar.",
    ],
  ] as const)("texto exato do motivo %s", async (reason, body) => {
    expect(buildPauseNoticeBody(reason, "Dona Maria")).toBe(body);

    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason }]);
    await runDmsPauses(NOW);

    expect(push.sendExpoPush).toHaveBeenCalledWith(["ExpoTok[ana]"], {
      title: PAUSE_NOTICE_TITLE,
      body,
      data: { type: "dms_paused", url: "/(caregiver-tabs)/person" },
    });
    expect(PAUSE_NOTICE_TITLE).toBe("Avisos pausados — Vigora");
  });

  it("vai para todos os cuidadores vinculados, num só envio, e marca como avisado", async () => {
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([
      { caregiverOpenId: "ana" },
      { caregiverOpenId: "beto" },
    ] as never);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([
      { token: "ExpoTok[ana]" },
      { token: "ExpoTok[beto]" },
    ] as never);
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "no_signal" }]);

    const result = await runDmsPauses(NOW);

    expect(dbPush.getPushTokensForOpenIds).toHaveBeenCalledWith(["ana", "beto"]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    expect(vi.mocked(push.sendExpoPush).mock.calls[0][0]).toEqual(["ExpoTok[ana]", "ExpoTok[beto]"]);
    expect(db.markPauseNoticeSent).toHaveBeenCalledWith("maria");
    expect(result.noticesSent).toBe(1);
  });

  it("UM aviso por pausa: a rodada seguinte não repete", async () => {
    let pending = [{ openId: "maria", reason: "no_signal" as const }];
    vi.mocked(db.getPausesNeedingNotice).mockImplementation(async () => [...pending]);
    vi.mocked(db.markPauseNoticeSent).mockImplementation(async (openId) => {
      pending = pending.filter((p) => p.openId !== openId);
    });

    await runDmsPauses(NOW);
    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });

  it("ninguém alcançado (Expo recusou): NÃO marca, para tentar de novo na rodada seguinte", async () => {
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "no_signal" }]);
    vi.mocked(push.sendExpoPush).mockResolvedValue(0);

    const result = await runDmsPauses(NOW);

    expect(db.markPauseNoticeSent).not.toHaveBeenCalled();
    expect(result.noticesSent).toBe(0);
  });

  it("cuidador sem nenhum token de push: NÃO marca (ainda não foi avisado)", async () => {
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "no_signal" }]);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([]);

    await runDmsPauses(NOW);

    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(db.markPauseNoticeSent).not.toHaveBeenCalled();
  });

  it("sem cuidador vinculado: marca como avisado, sem push", async () => {
    vi.mocked(db.getPausesNeedingNotice).mockResolvedValue([{ openId: "maria", reason: "logged_out" }]);
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValue([]);

    await runDmsPauses(NOW);

    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(db.markPauseNoticeSent).toHaveBeenCalledWith("maria");
  });
});

describe("verificação diária: ping", () => {
  it("manda push silencioso { type: 'ping' } só aos tokens de idosos não pausados", async () => {
    withDevice("T1", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: "t-1", deviceNotRegistered: false }]);

    const result = await runDmsPauses(NOW);

    expect(dbPush.getPushTokensWithOwner).toHaveBeenCalledWith(["maria"]);
    expect(push.sendExpoDataPush).toHaveBeenCalledWith(["T1"], { type: "ping" });
    expect(result.pinged).toBe(1);
  });

  it("uma vez a cada 24 h", async () => {
    withDevice();
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: "t-1", deviceNotRegistered: false }]);

    await runDmsPauses(NOW);
    await runDmsPauses(later(5));
    await runDmsPauses(later(23 * 60));
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(1);

    await runDmsPauses(later(25 * 60));
    expect(push.sendExpoDataPush).toHaveBeenCalledTimes(2);
  });

  it("conta sem token (app antigo que nunca registrou) não é pingada nem pausada", async () => {
    vi.mocked(db.getPreRegisterCandidates).mockResolvedValue([
      { openId: "vovo", alarms: [], timezone: null, managed: null },
    ]);
    vi.mocked(dbPush.getPushTokensWithOwner).mockResolvedValue([]);

    await runDmsPauses(NOW);

    expect(push.sendExpoDataPush).not.toHaveBeenCalled();
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("DeviceNotRegistered no ticket e conta sem nenhum token: apaga o token e pausa como app_removed", async () => {
    withDevice("T1", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: null, deviceNotRegistered: true }]);
    vi.mocked(dbPush.countPushTokens).mockResolvedValue(0);

    const result = await runDmsPauses(NOW);

    expect(dbPush.deletePushToken).toHaveBeenCalledWith("T1");
    expect(db.pauseDms).toHaveBeenCalledWith("maria", "app_removed");
    expect(result.paused).toBe(1);
  });

  it("DeviceNotRegistered mas a conta ainda tem outro token (reinstalou, ou outro aparelho): apaga o morto e NÃO pausa", async () => {
    withDevice("TVELHO", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "TVELHO", ticketId: null, deviceNotRegistered: true }]);
    vi.mocked(dbPush.countPushTokens).mockResolvedValue(1);

    await runDmsPauses(NOW);

    expect(dbPush.deletePushToken).toHaveBeenCalledWith("TVELHO");
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("ping aceito (token vivo) não pausa nem apaga nada", async () => {
    withDevice();
    vi.mocked(push.sendExpoDataPush).mockResolvedValue([{ token: "T1", ticketId: "t-1", deviceNotRegistered: false }]);

    await runDmsPauses(NOW);

    expect(db.pauseDms).not.toHaveBeenCalled();
    expect(dbPush.deletePushToken).not.toHaveBeenCalled();
  });
});

describe("verificação diária: recibos", () => {
  const receiptError = (error: string) => ({ "t-1": { status: "error" as const, details: { error } } });

  async function pingOnce() {
    withDevice("T1", "maria");
    vi.mocked(push.sendExpoDataPush).mockResolvedValueOnce([
      { token: "T1", ticketId: "t-1", deviceNotRegistered: false },
    ]);
    await runDmsPauses(NOW);
  }

  it("recibo com DeviceNotRegistered na rodada seguinte: apaga o token e pausa como app_removed", async () => {
    await pingOnce();
    expect(db.pauseDms).not.toHaveBeenCalled();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("DeviceNotRegistered"));

    const result = await runDmsPauses(later(5));

    expect(push.fetchExpoReceipts).toHaveBeenCalledWith(["t-1"]);
    expect(dbPush.deletePushToken).toHaveBeenCalledWith("T1");
    expect(db.pauseDms).toHaveBeenCalledWith("maria", "app_removed");
    expect(result.paused).toBe(1);
  });

  it("recibo consumido não é consultado de novo", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("DeviceNotRegistered"));

    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(push.fetchExpoReceipts).toHaveBeenCalledTimes(1);
  });

  it("recibo DeviceNotRegistered com outro token na conta: não pausa", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("DeviceNotRegistered"));
    vi.mocked(dbPush.countPushTokens).mockResolvedValue(1);

    await runDmsPauses(later(5));

    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("recibo ok: nada acontece e o ticket sai da fila", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue({ "t-1": { status: "ok" } });

    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(db.pauseDms).not.toHaveBeenCalled();
    expect(dbPush.deletePushToken).not.toHaveBeenCalled();
    expect(push.fetchExpoReceipts).toHaveBeenCalledTimes(1);
  });

  it("recibo ainda indisponível: o ticket fica e é consultado de novo", async () => {
    await pingOnce();

    await runDmsPauses(later(5));
    await runDmsPauses(later(10));

    expect(push.fetchExpoReceipts).toHaveBeenCalledTimes(2);
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("erro de recibo que não é DeviceNotRegistered não apaga token nem pausa", async () => {
    await pingOnce();
    vi.mocked(push.fetchExpoReceipts).mockResolvedValue(receiptError("MessageRateExceeded"));

    await runDmsPauses(later(5));

    expect(dbPush.deletePushToken).not.toHaveBeenCalled();
    expect(db.pauseDms).not.toHaveBeenCalled();
  });

  it("ticket com mais de 24 h é descartado sem consulta", async () => {
    await pingOnce();

    await runDmsPauses(later(25 * 60));

    expect(push.fetchExpoReceipts).not.toHaveBeenCalled();
  });
});
```

Criar `tests/dms-pauses-signals.test.ts`:

```ts
/**
 * dms-pauses-signals.test.ts
 *
 * "Qualquer sinal do aparelho retoma a pausa." Quem decide o que é sinal são as
 * rotas autenticadas do app do idoso; esta guarda de código-fonte (mesmo estilo
 * de alarm-changes-lifecycle.test.ts) trava que cada uma chama `touchLiveness`.
 * Sem isso o idoso voltaria a dar sinal e ficaria sem pré-registro nem aviso.
 *
 * `monitoring.heartbeat` e `monitoring.register` retomam por `recordHeartbeat`
 * (testado em db-monitoring-pauses.test.ts).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const calls = (src: string) => (src.match(/touchLiveness\(/g) ?? []).length;

describe("sinais que retomam a pausa chamam touchLiveness", () => {
  it("userData.put", () => {
    expect(calls(read("server/routers.ts"))).toBeGreaterThanOrEqual(1);
  });

  it("monitoring.createEvent e monitoring.confirmEvent", () => {
    expect(calls(read("server/routers-monitoring.ts"))).toBeGreaterThanOrEqual(2);
  });

  it("push.register", () => {
    expect(calls(read("server/routers-push.ts"))).toBeGreaterThanOrEqual(1);
  });

  it("managedAlarms.ack", () => {
    expect(calls(read("server/routers-managed-alarms.ts"))).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/db-monitoring-pauses.test.ts tests/dms-pauses.test.ts tests/dms-pauses-signals.test.ts`
Esperado: FAIL com `pauseDms is not a function` / `Failed to resolve import "../server/dms-pauses"`. Os testes "retoma a pausa" e `dms-pauses-signals` só falham se a Tarefa 8 não os cumpriu: nesse caso o conserto é na Tarefa 8, não aqui.

- [ ] **Passo 3: Implementar**

**3a.** Em `server/db-monitoring.ts`, trocar a linha 11:

```ts
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
```

por (acrescenta `isNotNull`; se a Tarefa 8 já acrescentou algo, mantenha o que ela pôs e junte `isNotNull`):

```ts
import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
```

**3b.** Acrescentar **no fim** de `server/db-monitoring.ts` (depois de `deleteFuturePendingEvents`, da Tarefa 9). Pule `DmsPauseReason`/`pauseDms` se o grep do Passo 1 mostrou que já existem:

```ts

// --- Pausas do dead man's switch (Fase 4) -------------------------------------

export type DmsPauseReason = "logged_out" | "app_removed" | "no_signal";

function affectedRows(result: unknown): number {
  const r = result as { affectedRows?: number } | Array<{ affectedRows?: number }> | null;
  return (Array.isArray(r) ? r[0]?.affectedRows : r?.affectedRows) ?? 0;
}

/**
 * Pausa os disparos da conta. Só pausa conta que NÃO está pausada (não troca o
 * motivo de quem já está) e devolve `true` apenas quando pausou agora.
 *
 * Apaga os eventos PENDENTES FUTUROS (o servidor não cobra o que não vai
 * acontecer). Os que já venceram ficam: seguem a escada normal, porque o alarme
 * podia ter tocado antes da pausa.
 *
 * `pauseNoticeSentAt` zera: cada pausa tem o seu aviso aos cuidadores.
 */
export async function pauseDms(openId: string, reason: DmsPauseReason): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const now = new Date();

  // Logout de quem nunca deu sinal não tem linha de liveness; o `set` é um no-op
  // para não mexer em lastSeenAt de quem já tem.
  await db
    .insert(accountLiveness)
    .values({ openId, lastSeenAt: now })
    .onDuplicateKeyUpdate({ set: { openId } });

  const claimed = await db
    .update(accountLiveness)
    .set({ dmsPausedReason: reason, dmsPausedAt: now, pauseNoticeSentAt: null })
    .where(and(eq(accountLiveness.openId, openId), isNull(accountLiveness.dmsPausedReason)));
  if (affectedRows(claimed) === 0) return false;

  await db
    .delete(alarmEvents)
    .where(
      and(
        eq(alarmEvents.openId, openId),
        eq(alarmEvents.status, "pending"),
        gt(alarmEvents.scheduledAt, now)
      )
    );
  return true;
}

/**
 * Contas de idoso (não cuidador), não pausadas, com último sinal há mais de 48 h
 * e com backup no servidor. São as que o job pausa como `no_signal`.
 */
export async function getStaleUnpausedMonitoredAccounts(now: Date): Promise<string[]> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const cutoff = new Date(now.getTime() - NO_SIGNAL_PAUSE_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({ openId: accountLiveness.openId })
    .from(accountLiveness)
    .innerJoin(users, eq(users.openId, accountLiveness.openId))
    .innerJoin(userData, eq(userData.openId, accountLiveness.openId))
    .where(
      and(
        isNull(accountLiveness.dmsPausedReason),
        lt(accountLiveness.lastSeenAt, cutoff),
        or(isNull(users.userType), ne(users.userType, "caregiver"))
      )
    );
  return rows.map((r) => r.openId);
}

/** Pausas em curso cujos cuidadores ainda não foram avisados. */
export async function getPausesNeedingNotice(): Promise<{ openId: string; reason: DmsPauseReason }[]> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const rows = await db
    .select({ openId: accountLiveness.openId, reason: accountLiveness.dmsPausedReason })
    .from(accountLiveness)
    .where(and(isNotNull(accountLiveness.dmsPausedReason), isNull(accountLiveness.pauseNoticeSentAt)));
  return rows.flatMap((r) => (r.reason ? [{ openId: r.openId, reason: r.reason }] : []));
}

/**
 * Marca o aviso da pausa como enviado. A condição protege dois casos: pausa que
 * já foi retomada no meio do caminho (nada a marcar) e aviso já marcado.
 */
export async function markPauseNoticeSent(openId: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  await db
    .update(accountLiveness)
    .set({ pauseNoticeSentAt: new Date() })
    .where(
      and(
        eq(accountLiveness.openId, openId),
        isNotNull(accountLiveness.dmsPausedReason),
        isNull(accountLiveness.pauseNoticeSentAt)
      )
    );
}
```

**3c.** Criar `server/dms-pauses.ts`:

```ts
/**
 * dms-pauses.ts
 *
 * Pausas do dead man's switch (Fase 4, D9). Não existe aviso de desinstalação no
 * Android nem no iOS; sem pausa, a família seria avisada todo dia, para sempre,
 * sobre um celular abandonado. Três motivos pausam uma conta:
 *  - logged_out: o app avisa no logout (monitoring.deviceSignedOut, Tarefa 8);
 *  - app_removed: a verificação diária (ping silencioso) encontrou
 *    DeviceNotRegistered no ticket ou no recibo E a conta ficou sem nenhum token.
 *    Conta de app antigo, que nunca registrou token, não é pingada nem pausada;
 *  - no_signal: 48 h sem nenhum sinal do aparelho.
 *
 * Pausar apaga só os eventos pendentes FUTUROS (ver pauseDms) e cada cuidador
 * vinculado recebe UM aviso por pausa. Qualquer sinal do aparelho retoma (ver
 * touchLiveness / recordHeartbeat em db-monitoring.ts).
 *
 * O servidor nunca faz o alarme tocar nem manda mensagem ao idoso.
 */
import { pickPersonName } from "./_core/alarm-diff";
import { runEach, runSteps } from "./_core/job-isolation";
import { getUserByOpenId, getUserData } from "./db";
import { getActiveCaregiversForMonitored } from "./db-links";
import {
  type DmsPauseReason,
  getPausesNeedingNotice,
  getPreRegisterCandidates,
  getStaleUnpausedMonitoredAccounts,
  markPauseNoticeSent,
  pauseDms,
} from "./db-monitoring";
import {
  countPushTokens,
  deletePushToken,
  getPushTokensForOpenIds,
  getPushTokensWithOwner,
} from "./db-push";
import { fetchExpoReceipts, sendExpoDataPush, sendExpoPush } from "./push";

export const PAUSE_NOTICE_TITLE = "Avisos pausados — Vigora";
const PAUSE_NOTICE_ROUTE = "/(caregiver-tabs)/person";

const DAY_MS = 24 * 60 * 60 * 1000;
/** O Expo guarda os recibos por 24 h; passou disso o ticket é descartado. */
const TICKET_TTL_MS = DAY_MS;
/** Limite de ids por consulta de recibos (o Expo aceita 1000). */
const RECEIPT_BATCH = 300;

export type DmsPausesResult = { paused: number; noticesSent: number; pinged: number };

// Estado em memória do processo. Perdê-lo num deploy só atrasa a verificação em
// um dia (o ping recomeça) e descarta recibos pendentes.
let lastPingAt = 0;
const pendingTickets = new Map<string, { token: string; openId: string; sentAt: number }>();

export const __testing = {
  reset() {
    lastPingAt = 0;
    pendingTickets.clear();
  },
};

/** Textos exatos da spec 5.5. Sem nome de remédio nem dado de saúde. */
export function buildPauseNoticeBody(reason: DmsPauseReason, name: string): string {
  switch (reason) {
    case "logged_out":
      return `${name} saiu da conta do Vigora no celular. Os avisos automáticos estão pausados até ${name} entrar de novo.`;
    case "app_removed":
      return `O Vigora parece ter sido removido do celular de ${name}. Os avisos automáticos estão pausados.`;
    case "no_signal":
      return `O celular de ${name} não dá sinal há 2 dias. Os avisos automáticos estão pausados até ele voltar a se comunicar.`;
  }
}

/**
 * Token que o Expo disse estar morto: apaga e, se a conta ficou SEM nenhum
 * token, pausa como app removido. Quem reinstalou tem um token novo (não pausa).
 */
async function handleDeadToken(token: string, openId: string): Promise<boolean> {
  await deletePushToken(token);
  if ((await countPushTokens(openId)) > 0) return false;
  return pauseDms(openId, "app_removed");
}

async function checkReceipts(now: Date, result: DmsPausesResult): Promise<void> {
  for (const [id, ticket] of pendingTickets) {
    if (now.getTime() - ticket.sentAt > TICKET_TTL_MS) pendingTickets.delete(id);
  }
  const ids = [...pendingTickets.keys()];
  let failed = 0;
  for (let i = 0; i < ids.length; i += RECEIPT_BATCH) {
    const batch = ids.slice(i, i + RECEIPT_BATCH);
    const receipts = await fetchExpoReceipts(batch);
    // Recibo que ainda não saiu fica na fila para a rodada seguinte.
    const answered = batch.filter((id) => receipts[id]);
    failed += await runEach(answered, "Recibo da verificação diária", async (id) => {
      const ticket = pendingTickets.get(id);
      pendingTickets.delete(id);
      const receipt = receipts[id];
      if (!ticket || receipt.status !== "error") return;
      if (receipt.details?.error === "DeviceNotRegistered") {
        if (await handleDeadToken(ticket.token, ticket.openId)) result.paused++;
      }
    });
  }
  if (failed > 0) throw new Error("recibos falharam");
}

async function pingDevices(now: Date, result: DmsPausesResult): Promise<void> {
  if (now.getTime() - lastPingAt < DAY_MS) return;

  // Mesma população do pré-registro: idoso não pausado e com sinal recente.
  const candidates = await getPreRegisterCandidates(now);
  const tokens = await getPushTokensWithOwner(candidates.map((c) => c.openId));
  lastPingAt = now.getTime();
  if (tokens.length === 0) return;

  const ownerOf = new Map(tokens.map((t) => [t.token, t.openId]));
  const sent = await sendExpoDataPush(
    tokens.map((t) => t.token),
    { type: "ping" }
  );
  const failed = await runEach(sent, "Verificação diária do aparelho", async (r) => {
    const openId = ownerOf.get(r.token);
    if (!openId) return;
    if (r.deviceNotRegistered) {
      if (await handleDeadToken(r.token, openId)) result.paused++;
    } else if (r.ticketId) {
      pendingTickets.set(r.ticketId, { token: r.token, openId, sentAt: now.getTime() });
      result.pinged++;
    }
  });
  if (failed > 0) throw new Error("verificação falhou");
}

async function pauseSilentAccounts(now: Date, result: DmsPausesResult): Promise<void> {
  const stale = await getStaleUnpausedMonitoredAccounts(now);
  const failed = await runEach(stale, "Pausa por falta de sinal", async (openId) => {
    if (await pauseDms(openId, "no_signal")) result.paused++;
  });
  if (failed > 0) throw new Error("contas falharam");
}

async function sendPauseNotices(result: DmsPausesResult): Promise<void> {
  const pending = await getPausesNeedingNotice();
  const failed = await runEach(pending, "Aviso de pausa", async ({ openId, reason }) => {
    const caregivers = await getActiveCaregiversForMonitored(openId);
    if (caregivers.length > 0) {
      const tokens = await getPushTokensForOpenIds(caregivers.map((c) => c.caregiverOpenId));
      const [data, user] = await Promise.all([getUserData(openId), getUserByOpenId(openId)]);
      const accepted =
        tokens.length === 0
          ? 0
          : await sendExpoPush(
              tokens.map((t) => t.token),
              {
                title: PAUSE_NOTICE_TITLE,
                body: buildPauseNoticeBody(reason, pickPersonName(data?.anamnesis, user?.name)),
                data: { type: "dms_paused", url: PAUSE_NOTICE_ROUTE },
              }
            );
      // Ninguém alcançado: NÃO marca. Cuidador que acha que o switch está armado
      // é pior que um aviso repetido na rodada seguinte.
      if (accepted === 0) {
        console.warn("[Pausas] aviso de pausa não chegou a nenhum cuidador — tenta de novo na próxima rodada");
        return;
      }
      result.noticesSent++;
    }
    await markPauseNoticeSent(openId);
  });
  if (failed > 0) throw new Error("avisos falharam");
}

export async function runDmsPauses(now: Date): Promise<DmsPausesResult> {
  const result: DmsPausesResult = { paused: 0, noticesSent: 0, pinged: 0 };
  // Ordem: recibos e ping podem pausar (app_removed); depois a pausa por 48 h;
  // os avisos vêm por último para sair na mesma rodada em que a pausa nasceu.
  // Cada passo falha isolado; a rotina rejeita no fim, sem o texto dos erros.
  await runSteps("Pausas", [
    ["recibos", () => checkReceipts(now, result)],
    ["verificação diária", () => pingDevices(now, result)],
    ["sem sinal", () => pauseSilentAccounts(now, result)],
    ["avisos", () => sendPauseNotices(result)],
  ]);
  return result;
}
```

- [ ] **Passo 3e: Conta parada há mais de 7 dias pausa em silêncio (decisão de montagem do plano)**

**Por que:** no primeiro ciclo depois do deploy, toda conta de idoso com backup e mais de 48 h sem sinal é pausada — inclusive instalações abandonadas há meses. Avisar o cuidador de cada uma seria uma rajada de notificações sobre celulares que ninguém usa. Regra: a pausa vale para todas; o aviso ao cuidador só sai se o último sinal foi nos últimos **7 dias**. As mais antigas são marcadas como já avisadas no mesmo instante em que pausam.

Em `tests/dms-pauses.test.ts`, (a) acrescentar `getAccountLiveness: vi.fn(async () => null),` na fábrica de `vi.mock("../server/db-monitoring", …)`; (b) acrescentar ao `describe("48 h sem sinal", …)`:

```ts
  it("conta parada há mais de 7 dias pausa em silêncio (aviso marcado na hora); a de 3 dias recebe aviso", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["antiga", "recente"]);
    vi.mocked(db.pauseDms).mockResolvedValue(true);
    vi.mocked(db.getAccountLiveness).mockImplementation(async (openId: string) =>
      ({
        openId,
        lastSeenAt: new Date(NOW.getTime() - (openId === "antiga" ? 40 : 3) * 24 * 60 * 60 * 1000),
      }) as never
    );

    await runDmsPauses(NOW);

    expect(db.markPauseNoticeSent).toHaveBeenCalledWith("antiga");
    expect(db.markPauseNoticeSent).not.toHaveBeenCalledWith("recente");
  });

  it("conta que já estava pausada não é consultada nem marcada", async () => {
    vi.mocked(db.getStaleUnpausedMonitoredAccounts).mockResolvedValue(["x"]);
    vi.mocked(db.pauseDms).mockResolvedValue(false);

    await runDmsPauses(NOW);

    expect(db.getAccountLiveness).not.toHaveBeenCalled();
    expect(db.markPauseNoticeSent).not.toHaveBeenCalled();
  });
```

Rodar `pnpm vitest run tests/dms-pauses.test.ts` e ver os dois falharem (`markPauseNoticeSent` não chamado para `"antiga"`).

Em `server/dms-pauses.ts`: acrescentar `getAccountLiveness` ao import de `./db-monitoring`, a constante logo abaixo dos imports

```ts
/** Conta parada há mais que isto pausa sem avisar o cuidador (instalação abandonada). */
const SILENT_PAUSE_AFTER_DAYS = 7;
```

e trocar `pauseSilentAccounts` por:

```ts
async function pauseSilentAccounts(now: Date, result: DmsPausesResult): Promise<void> {
  const stale = await getStaleUnpausedMonitoredAccounts(now);
  const silentBefore = now.getTime() - SILENT_PAUSE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const failed = await runEach(stale, "Pausa por falta de sinal", async (openId) => {
    if (!(await pauseDms(openId, "no_signal"))) return;
    result.paused++;
    // Instalação abandonada há mais de 7 dias: pausa sem avisar o cuidador
    // (o aviso fica marcado como enviado e a rotina de avisos não a pega).
    const liveness = await getAccountLiveness(openId);
    if (liveness && liveness.lastSeenAt.getTime() < silentBefore) {
      await markPauseNoticeSent(openId);
    }
  });
  if (failed > 0) throw new Error("contas falharam");
}
```

Rodar de novo `pnpm vitest run tests/dms-pauses.test.ts`: PASS.

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/db-monitoring-pauses.test.ts tests/dms-pauses.test.ts tests/dms-pauses-signals.test.ts tests/db-monitoring-preregister.test.ts`
Esperado: PASS.

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/db-monitoring.ts server/dms-pauses.ts tests/db-monitoring-pauses.test.ts tests/dms-pauses.test.ts tests/dms-pauses-signals.test.ts
git commit -m "feat(monitoring): pausa do dead man's switch (48 h sem sinal, app removido) com aviso único" -m "Pausar apaga só os eventos pendentes futuros; um aviso por pausa; qualquer sinal retoma; app removido só quando o ping achou token morto e a conta ficou sem token." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

A rotina ainda não roda: a ligação no `runMonitoringJob` é a Tarefa 11.

## Tarefa 11: Job: manutenção do acordo e ligação das três rotinas no `runMonitoringJob`

**Depende de:** Tarefas 4, 9 e 10 (`endManagement`, `getExpiredManagementRequests`, `getOpenManagementForMonitored`, `getListsNeedingVisibleNotice`, `markVisibleNoticeSent`; `runPreRegistration`; `runDmsPauses`).

**Por que:** (a) pedido de gerenciamento `pending` há mais de 7 dias vence sozinho e o cuidador é avisado; (b) a notificação visível de reserva (D7): se 10 min depois de o cuidador gravar a lista o celular do idoso ainda não confirmou, o servidor manda uma notificação visível "Abra o Vigora" (o push silencioso pode não ter rodado); (c) as três rotinas novas passam a rodar a cada 5 min, **antes do Passo 1**, cada uma no próprio `try`/`recordFailure`, sem derrubar os Passos 1 a 4.

**Files:**
- Create: `server/managed-alarms-housekeeping.ts` (`runManagementHousekeeping`)
- Modify: `server/monitoring-job.ts` (3 imports; 3 blocos `try` antes do Passo 1)
- Modify: `tests/monitoring-job.alarme-cancelado.test.ts`, `tests/monitoring-job.checkin-alarme.test.ts`, `tests/monitoring-job.classification.test.ts`, `tests/monitoring-job.inactivity.test.ts`, `tests/monitoring-job.resilience.test.ts`, `tests/monitoring-job.sms.test.ts` (3 `vi.mock` de módulo, ver Passo 3d)
- Test (novos): `tests/managed-alarms-housekeeping.test.ts`, `tests/monitoring-job.fase4-rotinas.test.ts`

**Interfaces:**
- Consumes: `getExpiredManagementRequests(now: Date): Promise<AlarmManagementRow[]>`, `getOpenManagementForMonitored(monitoredOpenId: string): Promise<AlarmManagementRow | null>`, `endManagement(id: number, reason: EndedReason): Promise<void>` (`server/db-alarm-management.ts`, Tarefa 4); `getListsNeedingVisibleNotice(now: Date): Promise<ManagedAlarmListRow[]>` (`appliedVersion < version AND visibleNoticeSentForVersion < version AND updatedAt < now - 10 min`), `markVisibleNoticeSent(monitoredOpenId: string, version: number): Promise<void>` (`server/db-managed-alarm-list.ts`, Tarefa 4); `runPreRegistration` (Tarefa 9); `runDmsPauses` (Tarefa 10); `runEach`, `runSteps` (`server/_core/job-isolation.ts`).
- Produces: `runManagementHousekeeping(now: Date): Promise<{ expired: number; visibleNotices: number }>`; textos: pedido vencido (ao cuidador) título `Alarmes`, corpo `O pedido para cuidar dos alarmes de ${nome} venceu.`, data `{ type: "management_expired" }`; reserva (ao idoso) título `Alarmes atualizados`, corpo `${cuidador} atualizou seus alarmes. Abra o Vigora para as mudanças valerem.`, data `{ type: "managed_alarms_updated", version }`.

**Regras que os testes travam:**
1. Vencimento: encerra com motivo `expired` **só se o pedido ainda é o `pending` aberto do idoso** (um aceite entre a consulta e o encerramento nunca é desfeito) e só então avisa o cuidador.
2. A notificação visível nunca leva nome de remédio; o nome é o do autor da gravação (`updatedByOpenId`), com "Seu cuidador" de reserva.
3. Marca `visibleNoticeSentForVersion` só depois de a Expo aceitar o envio (ou quando o idoso não tem nenhum token: nada a reenviar); recusa da Expo repete na rodada seguinte.
4. **Cada rotina nova roda no próprio `try` com `recordFailure`**: a falha de uma não impede as outras duas nem os Passos 1 a 4, e o ciclo continua reprovando `/api/health`.
5. As três rotinas rodam antes do Passo 1, com o mesmo `now` do ciclo.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/managed-alarms-housekeeping.test.ts`:

```ts
/**
 * managed-alarms-housekeeping.test.ts
 *
 * Manutenção do acordo de gerenciamento de alarmes (rodada de 5 em 5 minutos):
 * vencer pedidos de 7 dias e mandar a notificação visível de reserva quando o
 * celular do idoso não confirmou a lista nova em 10 minutos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-alarm-management", () => ({
  getExpiredManagementRequests: vi.fn(async () => []),
  getOpenManagementForMonitored: vi.fn(async () => null),
  endManagement: vi.fn(async () => undefined),
}));

vi.mock("../server/db-managed-alarm-list", () => ({
  getListsNeedingVisibleNotice: vi.fn(async () => []),
  markVisibleNoticeSent: vi.fn(async () => undefined),
}));

vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => ({ anamnesis: { fullName: "Dona Maria" } })),
  getUserByOpenId: vi.fn(async (openId: string) => ({ name: openId === "ana" ? "Ana" : "Conta" })),
}));

vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async (openIds: string[]) => openIds.map((id) => ({ token: `ExpoTok[${id}]` }))),
}));

vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 1),
}));

import { runManagementHousekeeping } from "../server/managed-alarms-housekeeping";
import * as dbManagement from "../server/db-alarm-management";
import * as dbList from "../server/db-managed-alarm-list";
import * as dbPush from "../server/db-push";
import * as dbUsers from "../server/db";
import * as push from "../server/push";

const NOW = new Date("2026-10-20T12:00:00.000Z");

const request = (over: Record<string, unknown> = {}) =>
  ({ id: 7, monitoredOpenId: "maria", caregiverOpenId: "ana", status: "pending", ...over }) as never;

const list = (over: Record<string, unknown> = {}) =>
  ({
    monitoredOpenId: "maria",
    version: 3,
    appliedVersion: 2,
    updatedByOpenId: "ana",
    // O nome do remédio existe na lista; nunca pode ir para a notificação.
    alarms: [{ id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" }],
    ...over,
  }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([]);
  vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue({ id: 7, status: "pending" } as never);
  vi.mocked(dbManagement.endManagement).mockResolvedValue(undefined);
  vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([]);
  vi.mocked(dbList.markVisibleNoticeSent).mockResolvedValue(undefined);
  vi.mocked(dbPush.getPushTokensForOpenIds).mockImplementation(
    async (openIds: string[]) => openIds.map((id) => ({ token: `ExpoTok[${id}]` })) as never
  );
  vi.mocked(push.sendExpoPush).mockResolvedValue(1);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pedido que venceu (7 dias)", () => {
  it("encerra como expired e avisa o cuidador", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);

    const result = await runManagementHousekeeping(NOW);

    expect(dbManagement.getExpiredManagementRequests).toHaveBeenCalledWith(NOW);
    expect(dbManagement.endManagement).toHaveBeenCalledWith(7, "expired");
    expect(push.sendExpoPush).toHaveBeenCalledWith(["ExpoTok[ana]"], {
      title: "Alarmes",
      body: "O pedido para cuidar dos alarmes de Dona Maria venceu.",
      data: { type: "management_expired" },
    });
    expect(result.expired).toBe(1);
  });

  it("encerra ANTES de avisar (aviso de um pedido que não foi encerrado seria mentira)", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);

    await runManagementHousekeeping(NOW);

    const ended = vi.mocked(dbManagement.endManagement).mock.invocationCallOrder[0];
    const pushed = vi.mocked(push.sendExpoPush).mock.invocationCallOrder[0];
    expect(ended).toBeLessThan(pushed);
  });

  it("pedido aceito entre a consulta e o encerramento NÃO é encerrado nem avisado", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);
    vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue({ id: 7, status: "active" } as never);

    const result = await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(result.expired).toBe(0);
  });

  it("pedido que já não está aberto (cancelado, recusado) é ignorado", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);
    vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue(null);

    await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).not.toHaveBeenCalled();
  });

  it("o aberto ser OUTRO pedido do mesmo idoso também não encerra este", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request({ id: 7 })]);
    vi.mocked(dbManagement.getOpenManagementForMonitored).mockResolvedValue({ id: 9, status: "pending" } as never);

    await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).not.toHaveBeenCalled();
  });

  it("cuidador sem token de push: encerra e não manda nada", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockResolvedValue([request()]);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([]);

    const result = await runManagementHousekeeping(NOW);

    expect(dbManagement.endManagement).toHaveBeenCalledWith(7, "expired");
    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(result.expired).toBe(1);
  });
});

describe("notificação visível de reserva", () => {
  it("manda ao idoso, com o nome do autor, sem nome de remédio, e marca a versão", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);

    const result = await runManagementHousekeeping(NOW);

    expect(dbList.getListsNeedingVisibleNotice).toHaveBeenCalledWith(NOW);
    expect(push.sendExpoPush).toHaveBeenCalledWith(["ExpoTok[maria]"], {
      title: "Alarmes atualizados",
      body: "Ana atualizou seus alarmes. Abra o Vigora para as mudanças valerem.",
      data: { type: "managed_alarms_updated", version: 3 },
    });
    expect(JSON.stringify(vi.mocked(push.sendExpoPush).mock.calls)).not.toContain("Losartana");
    expect(dbList.markVisibleNoticeSent).toHaveBeenCalledWith("maria", 3);
    expect(result.visibleNotices).toBe(1);
  });

  it("autor sem nome vira 'Seu cuidador'", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);
    vi.mocked(dbUsers.getUserByOpenId).mockResolvedValueOnce({ name: null } as never);

    await runManagementHousekeeping(NOW);

    expect(vi.mocked(push.sendExpoPush).mock.calls[0][1].body).toBe(
      "Seu cuidador atualizou seus alarmes. Abra o Vigora para as mudanças valerem."
    );
  });

  it("Expo recusou o envio: NÃO marca, para tentar de novo na rodada seguinte", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);
    vi.mocked(push.sendExpoPush).mockResolvedValue(0);

    const result = await runManagementHousekeeping(NOW);

    expect(dbList.markVisibleNoticeSent).not.toHaveBeenCalled();
    expect(result.visibleNotices).toBe(0);
  });

  it("idoso sem nenhum token (app antigo): marca a versão e não manda nada", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);
    vi.mocked(dbPush.getPushTokensForOpenIds).mockResolvedValue([]);

    await runManagementHousekeeping(NOW);

    expect(push.sendExpoPush).not.toHaveBeenCalled();
    expect(dbList.markVisibleNoticeSent).toHaveBeenCalledWith("maria", 3);
  });

  it("uma lista com erro não impede as outras; a rotina rejeita sem vazar o erro", async () => {
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([
      list({ monitoredOpenId: "ruim", version: 1 }),
      list({ monitoredOpenId: "maria", version: 4 }),
    ]);
    vi.mocked(dbList.markVisibleNoticeSent).mockImplementation(async (openId) => {
      if (openId === "ruim") throw new Error("Failed query: update managed_alarm_lists params: Losartana");
    });

    let message = "";
    await runManagementHousekeeping(NOW).catch((e: Error) => {
      message = e.message;
    });

    expect(dbList.markVisibleNoticeSent).toHaveBeenCalledWith("maria", 4);
    expect(message).toBe("Manutenção do acordo: falhou em aviso visível");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("Losartana");
  });
});

describe("isolamento entre os dois passos", () => {
  it("falha ao buscar pedidos vencidos não impede a notificação de reserva", async () => {
    vi.mocked(dbManagement.getExpiredManagementRequests).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    vi.mocked(dbList.getListsNeedingVisibleNotice).mockResolvedValue([list()]);

    await expect(runManagementHousekeeping(NOW)).rejects.toThrow("Manutenção do acordo: falhou em pedidos vencidos");

    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
  });
});
```

Criar `tests/monitoring-job.fase4-rotinas.test.ts`:

```ts
/**
 * monitoring-job.fase4-rotinas.test.ts
 *
 * As três rotinas da Fase 4 (pré-registro, pausas, manutenção do acordo) rodam
 * antes do Passo 1. Cada uma é isolada: a falha de uma não pode impedir as
 * outras nem os Passos 1 a 4, e o ciclo continua reprovando /api/health. É a
 * mesma lição de 24/07/2026 (um try único derrubou o job e o switch ficou 27 h
 * desarmado), agora para as rotinas novas.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/db-monitoring", () => ({
  getExpiredPendingEvents: vi.fn(async () => []),
  getAccountsWithUnconfirmedEvents: vi.fn(async () => []),
  getAccountLiveness: vi.fn(async () => null),
  getWarningHistory: vi.fn(async () => []),
  claimWarning: vi.fn(async () => 1),
  updateWarningResult: vi.fn(async () => undefined),
  releaseWarning: vi.fn(async () => undefined),
  getMissedCheckinEvents: vi.fn(async () => []),
  getMissedMedicationEvents: vi.fn(async () => []),
  markEventWarningSent: vi.fn(async () => undefined),
  updateAlarmEventStatus: vi.fn(async () => undefined),
  deleteAlarmEvent: vi.fn(async () => undefined),
  purgeStaleData: vi.fn(async () => ({ alarmEvents: 0, warningLog: 0, locationsCleared: 0 })),
}));

vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => undefined),
  getUserByOpenId: vi.fn(async () => undefined),
}));

vi.mock("../server/whatsapp", () => ({
  isWhatsAppApiConfigured: vi.fn(() => true),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true })),
}));

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => []),
}));

vi.mock("../server/db-push", () => ({
  getPushTokensForOpenIds: vi.fn(async () => []),
}));

vi.mock("../server/push", () => ({
  sendExpoPush: vi.fn(async () => 0),
}));

vi.mock("../server/dms-preregister", () => ({
  runPreRegistration: vi.fn(async () => ({ registered: 0 })),
}));
vi.mock("../server/dms-pauses", () => ({
  runDmsPauses: vi.fn(async () => ({ paused: 0, noticesSent: 0, pinged: 0 })),
}));
vi.mock("../server/managed-alarms-housekeeping", () => ({
  runManagementHousekeeping: vi.fn(async () => ({ expired: 0, visibleNotices: 0 })),
}));

import { getMonitoringHealth, runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";
import * as preRegister from "../server/dms-preregister";
import * as pauses from "../server/dms-pauses";
import * as housekeeping from "../server/managed-alarms-housekeeping";

const rotinas = [
  ["Pré-registro de disparos", () => vi.mocked(preRegister.runPreRegistration)],
  ["Pausas do dead man's switch", () => vi.mocked(pauses.runDmsPauses)],
  ["Manutenção do acordo de alarmes", () => vi.mocked(housekeeping.runManagementHousekeeping)],
] as const;

/** Primeiras funções que cada Passo 1 a 4 chama. */
const passos = () => [
  db.getExpiredPendingEvents, // Passo 1
  db.getAccountsWithUnconfirmedEvents, // Passo 2
  db.getMissedCheckinEvents, // Passo 3
  db.getMissedMedicationEvents, // Passo 4
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preRegister.runPreRegistration).mockResolvedValue({ registered: 0 });
  vi.mocked(pauses.runDmsPauses).mockResolvedValue({ paused: 0, noticesSent: 0, pinged: 0 });
  vi.mocked(housekeeping.runManagementHousekeeping).mockResolvedValue({ expired: 0, visibleNotices: 0 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("monitoring-job: rotinas da Fase 4", () => {
  it("as três rodam ANTES do Passo 1, com o mesmo `now` do ciclo", async () => {
    await runMonitoringJob();

    const passo1 = vi.mocked(db.getExpiredPendingEvents).mock.invocationCallOrder[0];
    for (const [, rotina] of rotinas) {
      expect(rotina()).toHaveBeenCalledTimes(1);
      expect(rotina().mock.invocationCallOrder[0]).toBeLessThan(passo1);
    }
    const now = vi.mocked(preRegister.runPreRegistration).mock.calls[0][0];
    expect(now).toBeInstanceOf(Date);
    expect(vi.mocked(pauses.runDmsPauses).mock.calls[0][0]).toBe(now);
    expect(vi.mocked(housekeeping.runManagementHousekeeping).mock.calls[0][0]).toBe(now);
  });

  it.each(rotinas)("falha em '%s' não impede as outras rotinas nem os Passos 1 a 4", async (nome, rotina) => {
    rotina().mockRejectedValue(new Error("falha de teste"));

    const antes = getMonitoringHealth().consecutiveFailures;
    await runMonitoringJob();
    const depois = getMonitoringHealth();

    for (const [, outra] of rotinas) expect(outra()).toHaveBeenCalledTimes(1);
    for (const passo of passos()) expect(passo).toHaveBeenCalled();
    // O ciclo ainda é contado como FALHA: /api/health não pode ficar verde.
    expect(depois.consecutiveFailures).toBe(antes + 1);
    expect(depois.lastError).toContain(nome);
  });

  it("as três falharem juntas ainda deixa os Passos 1 a 4 rodarem e lista as três falhas", async () => {
    for (const [, rotina] of rotinas) rotina().mockRejectedValue(new Error("falha de teste"));

    await runMonitoringJob();
    const health = getMonitoringHealth();

    for (const passo of passos()) expect(passo).toHaveBeenCalled();
    for (const [nome] of rotinas) expect(health.lastError).toContain(nome);
  });

  it("um Passo quebrado continua não impedindo as rotinas novas (já rodaram antes)", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockRejectedValueOnce(new Error("DATABASE_UNAVAILABLE"));

    await runMonitoringJob();

    for (const [, rotina] of rotinas) expect(rotina()).toHaveBeenCalledTimes(1);
    expect(db.getAccountsWithUnconfirmedEvents).toHaveBeenCalled();
  });

  it("ciclo sem falha nenhuma volta a reportar saudável", async () => {
    await runMonitoringJob();
    const health = getMonitoringHealth();

    expect(health.consecutiveFailures).toBe(0);
    expect(health.lastError).toBeNull();
    expect(health.healthy).toBe(true);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarms-housekeeping.test.ts tests/monitoring-job.fase4-rotinas.test.ts`
Esperado: FAIL com `Failed to resolve import "../server/managed-alarms-housekeeping"` (o job novo também falha: `vi.mock` de módulo inexistente e rotinas nunca chamadas).

- [ ] **Passo 3: Implementar**

**3a.** Criar `server/managed-alarms-housekeeping.ts`:

```ts
/**
 * managed-alarms-housekeeping.ts
 *
 * Manutenção do acordo de gerenciamento de alarmes (Fase 4), a cada rodada do
 * monitoring-job (5 min):
 *
 *  1. Pedido `pending` há mais de 7 dias vence (`expired`) e o cuidador é avisado.
 *     Só encerra o que ainda é o pedido aberto do idoso: se ele aceitou entre a
 *     consulta e o encerramento, o acordo ativo não é tocado.
 *  2. Notificação visível de reserva (D7): o cuidador gravou a lista, o servidor
 *     mandou o push silencioso e, 10 min depois, o celular do idoso ainda não
 *     confirmou. Manda "Abra o Vigora para as mudanças valerem". Sem nome de
 *     remédio, e uma só vez por versão (`visibleNoticeSentForVersion`).
 *
 * O servidor nunca faz o alarme tocar: esta notificação só convida o idoso a
 * abrir o app, que é quem aplica e confirma a lista.
 */
import { pickPersonName } from "./_core/alarm-diff";
import { runEach, runSteps } from "./_core/job-isolation";
import { getUserByOpenId, getUserData } from "./db";
import {
  endManagement,
  getExpiredManagementRequests,
  getOpenManagementForMonitored,
} from "./db-alarm-management";
import { getListsNeedingVisibleNotice, markVisibleNoticeSent } from "./db-managed-alarm-list";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";

export type HousekeepingResult = { expired: number; visibleNotices: number };

/** Mesmo nome que o resto do servidor usa para o idoso nos avisos ao cuidador. */
async function monitoredName(openId: string): Promise<string> {
  const [data, user] = await Promise.all([getUserData(openId), getUserByOpenId(openId)]);
  return pickPersonName(data?.anamnesis, user?.name);
}

async function expireRequests(now: Date, result: HousekeepingResult): Promise<void> {
  const expired = await getExpiredManagementRequests(now);
  const failed = await runEach(expired, "Pedido de gerenciamento vencido", async (request) => {
    const open = await getOpenManagementForMonitored(request.monitoredOpenId);
    if (!open || open.id !== request.id || open.status !== "pending") return;

    await endManagement(request.id, "expired");
    result.expired++;

    const tokens = await getPushTokensForOpenIds([request.caregiverOpenId]);
    if (tokens.length === 0) return;
    const name = await monitoredName(request.monitoredOpenId);
    await sendExpoPush(
      tokens.map((t) => t.token),
      {
        title: "Alarmes",
        body: `O pedido para cuidar dos alarmes de ${name} venceu.`,
        data: { type: "management_expired" },
      }
    );
  });
  if (failed > 0) throw new Error("pedidos falharam");
}

async function sendVisibleNotices(now: Date, result: HousekeepingResult): Promise<void> {
  const lists = await getListsNeedingVisibleNotice(now);
  const failed = await runEach(lists, "Aviso visível de alarmes atualizados", async (list) => {
    const tokens = await getPushTokensForOpenIds([list.monitoredOpenId]);
    if (tokens.length > 0) {
      const author = (await getUserByOpenId(list.updatedByOpenId))?.name?.trim() || "Seu cuidador";
      const accepted = await sendExpoPush(
        tokens.map((t) => t.token),
        {
          title: "Alarmes atualizados",
          body: `${author} atualizou seus alarmes. Abra o Vigora para as mudanças valerem.`,
          data: { type: "managed_alarms_updated", version: list.version },
        }
      );
      // A Expo recusou: não marca, a rodada seguinte tenta de novo.
      if (accepted === 0) {
        console.warn("[Acordo] aviso visível não foi aceito pela Expo — tenta de novo na próxima rodada");
        return;
      }
      result.visibleNotices++;
    }
    // Sem token nenhum (app antigo) não há o que reenviar: marca e segue.
    await markVisibleNoticeSent(list.monitoredOpenId, list.version);
  });
  if (failed > 0) throw new Error("avisos falharam");
}

export async function runManagementHousekeeping(now: Date): Promise<HousekeepingResult> {
  const result: HousekeepingResult = { expired: 0, visibleNotices: 0 };
  await runSteps("Manutenção do acordo", [
    ["pedidos vencidos", () => expireRequests(now, result)],
    ["aviso visível", () => sendVisibleNotices(now, result)],
  ]);
  return result;
}
```

**3b.** Em `server/monitoring-job.ts`, logo abaixo da linha `import { agendaHasCheckinAlarm, isEventExpired } from "./_core/event-kind";`, acrescentar:

```ts
import { runPreRegistration } from "./dms-preregister";
import { runDmsPauses } from "./dms-pauses";
import { runManagementHousekeeping } from "./managed-alarms-housekeeping";
```

**3c.** Em `server/monitoring-job.ts`, dentro de `runMonitoringJob`, trocar (logo depois da definição de `recordFailure`):

```ts
  try {
    // -- Step 1: Resolve expired pending alarm events --------------------------
```

por:

```ts
  // -- Fase 4: rotinas que antecedem o Passo 1 ---------------------------------
  // Cada uma roda no próprio try, como os passos: a falha entra em `failures` (o
  // ciclo continua reprovando /api/health) sem impedir as outras rotinas nem os
  // Passos 1 a 4. O servidor só registra o que era esperado e pausa quando o
  // aparelho some; quem faz o alarme tocar é sempre o celular.
  try {
    const { registered } = await runPreRegistration(now);
    console.log(`[Monitor] Pré-registro: ${registered} disparo(s) registrado(s) pelo servidor`);
  } catch (error) {
    recordFailure("Pré-registro de disparos", error);
  }

  try {
    const { paused, noticesSent, pinged } = await runDmsPauses(now);
    console.log(
      `[Monitor] Pausas: ${paused} conta(s) pausada(s), ${noticesSent} aviso(s) a cuidadores, ${pinged} verificação(ões) de aparelho`
    );
  } catch (error) {
    recordFailure("Pausas do dead man's switch", error);
  }

  try {
    const { expired, visibleNotices } = await runManagementHousekeeping(now);
    console.log(
      `[Monitor] Acordo de alarmes: ${expired} pedido(s) vencido(s), ${visibleNotices} aviso(s) visível(is)`
    );
  } catch (error) {
    recordFailure("Manutenção do acordo de alarmes", error);
  }

  try {
    // -- Step 1: Resolve expired pending alarm events --------------------------
```

**3d.** Os seis testes do job existentes importam `monitoring-job` de verdade e factory-mockam `../server/db-monitoring`, `../server/db-push` e `../server/push` com listas fechadas de exports. As rotinas novas chamam funções que essas fábricas não têm (e `sendExpoPush` ali é espiado: chamadas extras quebrariam asserções como `mock.calls[0]`). Em vez de inchar 6 fábricas com ~12 exports, cada arquivo passa a **mockar as três rotinas pelo módulo** (elas têm testes próprios, nas Tarefas 9, 10 e 11). Em cada um dos seis arquivos, trocar a linha de import do job pelo bloco abaixo seguido da mesma linha:

| Arquivo | Linha a trocar (`old_string`) |
|---|---|
| `tests/monitoring-job.alarme-cancelado.test.ts` | `import { isAlarmStillArmed, runMonitoringJob } from "../server/monitoring-job";` |
| `tests/monitoring-job.checkin-alarme.test.ts` | `import { runMonitoringJob } from "../server/monitoring-job";` |
| `tests/monitoring-job.classification.test.ts` | `import { runMonitoringJob } from "../server/monitoring-job";` |
| `tests/monitoring-job.inactivity.test.ts` | `import { runMonitoringJob } from "../server/monitoring-job";` |
| `tests/monitoring-job.resilience.test.ts` | `import { getMonitoringHealth, runMonitoringJob } from "../server/monitoring-job";` |
| `tests/monitoring-job.sms.test.ts` | `import { runMonitoringJob } from "../server/monitoring-job";` |

Bloco a inserir imediatamente antes da linha (o `vi.mock` é içado pelo vitest, a posição não importa):

```ts
// Fase 4: as três rotinas novas do job têm testes próprios (dms-preregister,
// dms-pauses, managed-alarms-housekeeping). Aqui ficam fora para este arquivo
// não depender dos mocks de banco/push delas.
vi.mock("../server/dms-preregister", () => ({
  runPreRegistration: vi.fn(async () => ({ registered: 0 })),
}));
vi.mock("../server/dms-pauses", () => ({
  runDmsPauses: vi.fn(async () => ({ paused: 0, noticesSent: 0, pinged: 0 })),
}));
vi.mock("../server/managed-alarms-housekeeping", () => ({
  runManagementHousekeeping: vi.fn(async () => ({ expired: 0, visibleNotices: 0 })),
}));

```

Nenhuma das fábricas de `../server/db-monitoring` desses seis arquivos precisa ganhar os exports novos das Tarefas 9 e 10 (`getPreRegisterCandidates`, `findEventNear`, `ensureServerAlarmEvent`, `deleteFuturePendingEvents`, `pauseDms`, `getStaleUnpausedMonitoredAccounts`, `getPausesNeedingNotice`, `markPauseNoticeSent`): o módulo que os usa está mockado. Idem para `../server/db-push` (`getPushTokensWithOwner`, `countPushTokens`) e `../server/push` (`sendExpoDataPush`, `fetchExpoReceipts`).

**Os outros seis arquivos que factory-mockam `../server/db-monitoring`** (`tests/anonymous-account.test.ts`, `tests/monitoring-missed-alarm-push.test.ts`, `tests/monitoring.auth.test.ts`, `tests/monitoring.create-event-kind.test.ts`, `tests/user-data-export.test.ts`, `tests/whatsapp.auth.test.ts`) importam os routers, não o job: as Tarefas 9, 10 e 11 não os afetam. Quem os afeta é a Tarefa 8 (`touchLiveness`, `pauseDms` importados por `routers.ts`/`routers-monitoring.ts`) e a Tarefa 5 (`getPushTokensWithOwner`/`countPushTokens` em `db-push`): as fábricas desses seis arquivos precisam ganhar `touchLiveness` e `pauseDms` lá.

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarms-housekeeping.test.ts tests/monitoring-job.fase4-rotinas.test.ts tests/monitoring-job.alarme-cancelado.test.ts tests/monitoring-job.checkin-alarme.test.ts tests/monitoring-job.classification.test.ts tests/monitoring-job.inactivity.test.ts tests/monitoring-job.resilience.test.ts tests/monitoring-job.sms.test.ts tests/monitoring-health.test.ts`
Esperado: PASS (os seis arquivos antigos continuam verdes, sem mudar nenhuma asserção).

Se um dos seis falhar com `No "runPreRegistration" export is defined on the mock` ou com `Pré-registro de disparos` em `lastError`, o bloco do Passo 3d não entrou nesse arquivo.

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos)

```bash
git add server/managed-alarms-housekeeping.ts server/monitoring-job.ts tests/managed-alarms-housekeeping.test.ts tests/monitoring-job.fase4-rotinas.test.ts tests/monitoring-job.alarme-cancelado.test.ts tests/monitoring-job.checkin-alarme.test.ts tests/monitoring-job.classification.test.ts tests/monitoring-job.inactivity.test.ts tests/monitoring-job.resilience.test.ts tests/monitoring-job.sms.test.ts
git commit -m "feat(monitoring): job roda pré-registro, pausas e manutenção do acordo antes do Passo 1" -m "Pedido de gerenciamento vence em 7 dias; notificação visível de reserva se o celular não confirmar a lista em 10 min; cada rotina isolada com recordFailure." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

Verificação em produção depois do deploy (Tarefa 19 repete no checklist): `curl -s https://api.vigorasaude.com/api/health` com `monitoringJob.healthy: true` e `lastError: null`; nos logs do Railway, as três linhas `[Monitor] Pré-registro`, `[Monitor] Pausas` e `[Monitor] Acordo de alarmes` a cada 5 min.

## Tarefa 12: App do idoso aplica a lista gerenciada e confirma (estado, aplicador, sincronização)

**Depende de:** Tarefa 1 (tipo `ManagedAlarm` em `shared/managed-alarm.ts`); Tarefas 6 e 7 (rotas `managedAlarms.mine` e `managedAlarms.ack`, só em tempo de execução: o código raw-fetch compila sem elas).

**Files:**
- Modify: `lib/app-context.tsx` (tipo `ManagementInfo`, campo `management`, ações `REPLACE_ALARMS` e `SET_MANAGEMENT`)
- Create: `lib/managed-alarms-apply.ts` (função pura `planManagedApply`)
- Create: `lib/managed-alarms-sync.ts` (`syncManagedAlarms`, `createManagedAlarmsDeps`, barramento `requestManagedSync`/`onManagedSyncRequested`)
- Modify: `lib/monitoring-service.ts` (exportar `trpcQuery` e `trpcMutation`)
- Modify: `components/monitoring-initializer.tsx` (chamar a sincronização no bootstrap, ao voltar ao app e sob pedido)
- Test: `tests/managed-alarms-apply.test.ts`, `tests/managed-alarms-sync.test.ts`, `tests/managed-alarms-deps.test.ts`, `tests/managed-alarms-initializer-interplay.test.ts`, `tests/managed-alarms-wiring.test.ts` (todos novos)

**Interfaces:**
- Consumes: `ManagedAlarm` (`@/shared/managed-alarm`); `scheduleFullAlarm(alarm: Alarm): Promise<Alarm>` e `cancelFullAlarm(alarm: Alarm): Promise<void>` (`lib/alarm-sync.ts`, existentes); rotas `managedAlarms.mine` (query) e `managedAlarms.ack({ version, failedAlarmIds })` (mutation), contrato da Parte B.
- Produces:
  ```ts
  // lib/app-context.tsx
  export type ManagementInfo = { caregiverName: string; since: number; appliedVersion: number };
  // AppState ganha: management: ManagementInfo | null   (persistido no aparelho; NÃO vai ao backup)
  // AppAction ganha: { type: 'REPLACE_ALARMS'; payload: Alarm[] }  (DATA_ACTION: carimba dataUpdatedAt)
  //                  { type: 'SET_MANAGEMENT'; payload: ManagementInfo | null }  (não é DATA_ACTION)

  // lib/managed-alarms-apply.ts
  export interface ManagedApplyPlan { toCancel: Alarm[]; toSchedule: Alarm[]; next: Alarm[] }
  export function sameManagedFields(local: Alarm, server: ManagedAlarm): boolean;
  export function planManagedApply(local: Alarm[], server: ManagedAlarm[]): ManagedApplyPlan;

  // lib/managed-alarms-sync.ts
  export type MineResponse = {
    pendingRequest: null | { id: number; caregiverName: string };
    management: null | { id: number; caregiverOpenId: string; caregiverName: string; since: number };
    list: null | { version: number; alarms: ManagedAlarm[] };
  };
  export type ManagedSyncResult = 'applied' | 'unchanged' | 'not-managed' | 'offline';
  export type ManagedSyncAction =
    | { type: 'REPLACE_ALARMS'; payload: Alarm[] }
    | { type: 'SET_MANAGEMENT'; payload: ManagementInfo | null };
  export interface ManagedSyncDeps {
    getLocal(): Alarm[]; getManagement(): ManagementInfo | null; dispatch(action: ManagedSyncAction): void;
    schedule(alarm: Alarm): Promise<Alarm>; cancel(alarm: Alarm): Promise<void>;
    fetchMine(): Promise<MineResponse | null>;
    ack(version: number, failedAlarmIds: string[]): Promise<void>;   // LANÇA se a confirmação não chegou ao servidor
  }
  export function syncManagedAlarms(deps: ManagedSyncDeps): Promise<ManagedSyncResult>;
  export function createManagedAlarmsDeps(base: Pick<ManagedSyncDeps, 'getLocal' | 'getManagement' | 'dispatch'>): ManagedSyncDeps;
  export type ManagedSyncRequest = { openRequest: boolean };
  export function requestManagedSync(opts?: { openRequest?: boolean }): void;
  export function onManagedSyncRequested(listener: (request: ManagedSyncRequest) => void): () => void;

  // lib/monitoring-service.ts
  export async function trpcMutation(procedure: string, input: unknown): Promise<any>;   // null em toda falha, nunca lança
  export async function trpcQuery(procedure: string, input: unknown): Promise<any>;
  ```

### Regras de desenho desta tarefa (leia antes de codar)

**1. O `ack` nunca sai antes de o agendamento terminar.** A ordem é fixa e travada por teste: `cancelar os removidos/alterados` → `agendar os novos/alterados` (um a um, esperando cada um) → `REPLACE_ALARMS` → `ack` → `SET_MANAGEMENT`. Enquanto o último `scheduleFullAlarm` não resolver, nada é despachado e nada é confirmado.

**2. Falha de agendamento não derruba o resto.** Um alarme que o sistema recusar entra em `failedAlarmIds`; os outros seguem. Na lista local o alarme que falhou fica **desligado e sem uids** (`enabled: false`): um alarme que não existe no sistema não pode aparecer ligado, porque o `syncAlarmsToServer` do aparelho pré-registraria um evento para ele e o dead man's switch acusaria o idoso por um alarme que nunca tocou. É o mesmo princípio que `alarm-list-screen` já aplica quando uma edição falha ("O alarme foi desligado por segurança"). Como a cópia local fica diferente da do servidor (`enabled`), a **próxima aplicação tenta de novo** esse alarme sozinha.

**3. `appliedVersion` só avança depois do `ack` chegar ao servidor.** Se o `ack` falhar (sem internet), a lista local já foi trocada, mas `management.appliedVersion` continua o antigo; a próxima rodada recalcula o plano (agora vazio, salvo as falhas), não reagenda nada e só reenvia o `ack`. Sem isso o servidor ficaria para sempre com "ainda não chegou ao celular" e mandaria a notificação visível de reserva à toa.

**4. `since` identifica o acordo.** O acordo novo recomeça na versão 1. Comparar com o `appliedVersion` de um acordo antigo (digamos, 7) faria o app ignorar a lista nova. Por isso `appliedVersion` só vale se `management.since` for igual ao do servidor.

**5. Por que `REPLACE_ALARMS` não causa agendamento duplo com o `AlarmSyncInitializer`** (leitura de `components/alarm-sync-initializer.tsx` e `lib/alarm-sync.ts`):
- O initializer recalcula uma assinatura `id|time|repeat|customDays` dos alarmes **ligados**. Um `REPLACE_ALARMS` que mude esse conjunto dispara **um** `syncAlarmsOnStartup(state.alarms)`.
- Esse sync é idempotente sobre o que o aplicador acabou de agendar. Android: o uid é determinístico (`vigora_<id>` ou `vigora_<id>_wd<n>`), então `scheduleFullAlarm` de novo **substitui** o mesmo alarme (uma chamada por alarme, nunca duplica). iOS 26+: ele pergunta ao AlarmKit se o id existe (existe) e não reagenda. iOS abaixo de 26: conta notificações por `data.alarmId` (há) e não reagenda. A varredura de órfãos só cancela ids que não estão na lista, e o aplicador já cancelou os removidos.
- O initializer **não cobre** o que o aplicador precisa fazer: mudar só descrição, som, vibração, tipo ou atraso do check-in **não muda a assinatura** (o initializer nem roda), e uma lista que **fica vazia** não roda (`if (state.alarms.length > 0)`). Por isso o aplicador cancela e agenda **por conta própria**, e não delega ao initializer.
- O initializer só despacha `UPDATE_ALARM` se `notificationId` mudar, e como `syncAlarmsOnStartup` não altera o array recebido, isso nunca acontece: não há laço de realimentação.
- O que **seria** danoso é despachar `REPLACE_ALARMS` **antes** de terminar de agendar: no iOS abaixo de 26 o aplicador faz `cancelFullAlarm` e depois `scheduleFullAlarm`; um sync do initializer no meio veria "sem notificações" e agendaria também, deixando duas notificações do mesmo remédio. A regra 1 impede isso, e `tests/managed-alarms-initializer-interplay.test.ts` trava o comportamento do `syncAlarmsOnStartup` nos três caminhos.
- Por fim, o `next` que vira estado carrega as **cópias devolvidas por `scheduleFullAlarm`** (com `nativeAlarmUids`/`notificationId`). Se o aplicador despachasse os alarmes crus do servidor, um `cancelFullAlarm` futuro no Android (que cancela por `nativeAlarmUids`) não acharia nada para cancelar.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/managed-alarms-apply.test.ts`:

```ts
/**
 * Plano de aplicação da lista gerenciada (função pura): o que cancelar, o que
 * agendar e qual lista vira o estado local.
 */
import { describe, expect, it } from "vitest";
import { planManagedApply, sameManagedFields } from "../lib/managed-alarms-apply";
import type { Alarm } from "../lib/app-context";
import type { ManagedAlarm } from "../shared/managed-alarm";

const srv = (id: string, over: Partial<ManagedAlarm> = {}): ManagedAlarm => ({
  id,
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

const loc = (id: string, over: Partial<Alarm> = {}): Alarm => ({
  ...srv(id),
  nativeAlarmUids: [`vigora_${id}`],
  notificationId: `n-${id}`,
  ...over,
});

describe("planManagedApply", () => {
  it("lista igual: nada a cancelar nem agendar, e os inalterados mantêm os uids", () => {
    const a = loc("a");
    const plan = planManagedApply([a], [srv("a")]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next).toEqual([a]);
    expect(plan.next[0]).toBe(a);
  });

  it("alarme novo e ligado: agenda; sem uids", () => {
    const plan = planManagedApply([], [srv("a")]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toSchedule.map((x) => x.id)).toEqual(["a"]);
    expect(plan.next).toHaveLength(1);
    expect(plan.next[0].nativeAlarmUids).toBeUndefined();
  });

  it("alarme novo e desligado: entra na lista, mas não agenda", () => {
    const plan = planManagedApply([], [srv("a", { enabled: false })]);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next.map((x) => x.id)).toEqual(["a"]);
  });

  it("alarme removido pelo cuidador: cancela o local (com os uids dele)", () => {
    const a = loc("a");
    const plan = planManagedApply([a], []);
    expect(plan.toCancel).toEqual([a]);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next).toEqual([]);
  });

  it("horário mudou: cancela o antigo (com uids) e agenda o novo sem herdar os uids", () => {
    const a = loc("a");
    const plan = planManagedApply([a], [srv("a", { time: "09:30" })]);
    expect(plan.toCancel).toEqual([a]);
    expect(plan.toSchedule).toHaveLength(1);
    expect(plan.toSchedule[0].time).toBe("09:30");
    expect(plan.toSchedule[0].nativeAlarmUids).toBeUndefined();
    expect(plan.toSchedule[0].notificationId).toBeUndefined();
  });

  it.each([
    ["descrição", { description: "Metformina" }],
    ["som", { sound: false }],
    ["vibração", { vibration: false }],
    ["repetição", { repeat: "weekdays" as const }],
  ])("só %s mudou: também reagenda (o texto/canal do alarme muda)", (_nome, over) => {
    const plan = planManagedApply([loc("a")], [srv("a", over)]);
    expect(plan.toCancel).toHaveLength(1);
    expect(plan.toSchedule).toHaveLength(1);
  });

  it("ligado -> desligado: cancela e não agenda", () => {
    const plan = planManagedApply([loc("a")], [srv("a", { enabled: false })]);
    expect(plan.toCancel).toHaveLength(1);
    expect(plan.toSchedule).toEqual([]);
    expect(plan.next[0].enabled).toBe(false);
  });

  it("desligado -> ligado: agenda", () => {
    const off = loc("a", { enabled: false, nativeAlarmUids: [], notificationId: undefined });
    const plan = planManagedApply([off], [srv("a")]);
    expect(plan.toSchedule.map((x) => x.id)).toEqual(["a"]);
  });

  it("dias personalizados em outra ordem NÃO contam como mudança", () => {
    const a = loc("a", { repeat: "custom", customDays: [3, 1] });
    const plan = planManagedApply([a], [srv("a", { repeat: "custom", customDays: [1, 3] })]);
    expect(plan.toCancel).toEqual([]);
    expect(plan.toSchedule).toEqual([]);
  });

  it("customDays vazio x ausente em alarme que não é personalizado NÃO conta como mudança", () => {
    const a = loc("a", { customDays: undefined });
    const plan = planManagedApply([a], [srv("a", { customDays: [] })]);
    expect(plan.toCancel).toEqual([]);
  });

  it("kind ausente é remédio: igual a 'medication'", () => {
    const a = loc("a");
    expect(sameManagedFields(a, srv("a", { kind: "medication" }))).toBe(true);
  });

  it("check-in: mudar o atraso do aviso reagenda; em remédio o campo é ignorado", () => {
    const c = loc("c", { kind: "checkin", escalateAfterMinutes: 15 });
    expect(sameManagedFields(c, srv("c", { kind: "checkin", escalateAfterMinutes: 30 }))).toBe(false);
    expect(sameManagedFields(c, srv("c", { kind: "checkin", escalateAfterMinutes: 15 }))).toBe(true);
    const m = loc("m", { escalateAfterMinutes: 5 });
    expect(sameManagedFields(m, srv("m"))).toBe(true);
  });

  it("mistura: mantém, remove, altera e cria na mesma aplicação", () => {
    const keep = loc("keep");
    const gone = loc("gone");
    const edit = loc("edit");
    const plan = planManagedApply(
      [keep, gone, edit],
      [srv("keep"), srv("edit", { time: "21:00" }), srv("new", { time: "07:00" })]
    );
    expect(plan.toCancel.map((x) => x.id).sort()).toEqual(["edit", "gone"]);
    expect(plan.toSchedule.map((x) => x.id).sort()).toEqual(["edit", "new"]);
    expect(plan.next.map((x) => x.id)).toEqual(["keep", "edit", "new"]);
    expect(plan.next[0]).toBe(keep);
  });
});
```

Criar `tests/managed-alarms-sync.test.ts`:

```ts
/**
 * syncManagedAlarms: a ordem é a regra. O ack só sai depois de TODO o
 * agendamento terminar; falha de um alarme não derruba os outros; a versão só
 * conta como aplicada depois do ack chegar ao servidor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  onManagedSyncRequested,
  requestManagedSync,
  syncManagedAlarms,
  type ManagedSyncAction,
  type ManagedSyncDeps,
  type MineResponse,
} from "../lib/managed-alarms-sync";
import type { Alarm, ManagementInfo } from "../lib/app-context";
import type { ManagedAlarm } from "../shared/managed-alarm";

const med = (id: string, time: string, over: Partial<ManagedAlarm> = {}): ManagedAlarm => ({
  id,
  time,
  description: `Remédio ${id}`,
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

const mineWith = (version: number, alarms: ManagedAlarm[], since = 1000): MineResponse => ({
  pendingRequest: null,
  management: { id: 1, caregiverOpenId: "cg-1", caregiverName: "Ana", since },
  list: { version, alarms },
});

let localAlarms: Alarm[];
let management: ManagementInfo | null;
let mine: MineResponse | null;
let calls: string[];
let dispatched: ManagedSyncAction[];

function makeDeps(over: Partial<ManagedSyncDeps> = {}): ManagedSyncDeps {
  return {
    getLocal: () => localAlarms,
    getManagement: () => management,
    dispatch: (a) => {
      calls.push(`dispatch:${a.type}`);
      dispatched.push(a);
      if (a.type === "REPLACE_ALARMS") localAlarms = a.payload;
      if (a.type === "SET_MANAGEMENT") management = a.payload;
    },
    schedule: async (a) => {
      calls.push(`schedule:${a.id}`);
      return { ...a, nativeAlarmUids: [`vigora_${a.id}`] };
    },
    cancel: async (a) => {
      calls.push(`cancel:${a.id}`);
    },
    fetchMine: async () => mine,
    ack: async (version, failed) => {
      calls.push(`ack:${version}:${failed.join(",")}`);
    },
    ...over,
  };
}

beforeEach(() => {
  localAlarms = [];
  management = null;
  mine = null;
  calls = [];
  dispatched = [];
  vi.restoreAllMocks();
});

describe("syncManagedAlarms: ordem e confirmação", () => {
  it("cancela, agenda, troca a lista, confirma e só então marca a versão aplicada", async () => {
    localAlarms = [
      { ...med("velho", "07:00"), nativeAlarmUids: ["vigora_velho"] },
      { ...med("muda", "08:00"), nativeAlarmUids: ["vigora_muda"] },
    ];
    mine = mineWith(4, [med("muda", "09:00"), med("novo", "10:00")]);

    const result = await syncManagedAlarms(makeDeps());

    expect(result).toBe("applied");
    expect(calls).toEqual([
      "cancel:velho",
      "cancel:muda",
      "schedule:muda",
      "schedule:novo",
      "dispatch:REPLACE_ALARMS",
      "ack:4:",
      "dispatch:SET_MANAGEMENT",
    ]);
    expect(management).toEqual({ caregiverName: "Ana", since: 1000, appliedVersion: 4 });
  });

  it("não troca a lista nem confirma enquanto o último agendamento não terminou", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = makeDeps({
      schedule: async (a) => {
        calls.push(`schedule:${a.id}:inicio`);
        await gate;
        calls.push(`schedule:${a.id}:fim`);
        return { ...a, nativeAlarmUids: ["u"] };
      },
    });

    const run = syncManagedAlarms(deps);
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(["schedule:a:inicio"]); // nada de REPLACE nem ack ainda

    release();
    await run;
    expect(calls).toEqual([
      "schedule:a:inicio",
      "schedule:a:fim",
      "dispatch:REPLACE_ALARMS",
      "ack:2:",
      "dispatch:SET_MANAGEMENT",
    ]);
  });

  it("a lista despachada leva as cópias com uids devolvidas pelo agendador", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    await syncManagedAlarms(makeDeps());
    const replace = dispatched.find((d) => d.type === "REPLACE_ALARMS");
    expect(replace?.type === "REPLACE_ALARMS" && replace.payload[0].nativeAlarmUids).toEqual(["vigora_a"]);
  });
});

describe("syncManagedAlarms: falhas", () => {
  it("um alarme que o sistema recusa vai para failedAlarmIds; os outros seguem", async () => {
    mine = mineWith(3, [med("a", "08:00"), med("b", "09:00"), med("c", "10:00")]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps({
      schedule: async (a) => {
        calls.push(`schedule:${a.id}`);
        if (a.id === "b") throw new Error("o sistema recusou");
        return { ...a, nativeAlarmUids: [`u-${a.id}`] };
      },
    });

    expect(await syncManagedAlarms(deps)).toBe("applied");

    expect(calls).toContain("ack:3:b");
    const replace = dispatched.find((d) => d.type === "REPLACE_ALARMS");
    const lista = replace?.type === "REPLACE_ALARMS" ? replace.payload : [];
    expect(lista.map((x) => [x.id, x.enabled, x.nativeAlarmUids])).toEqual([
      ["a", true, ["u-a"]],
      ["b", false, []],
      ["c", true, ["u-c"]],
    ]);
    // o log traz o motivo, mas nunca o nome do remédio
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Remédio");
  });

  it("falha ao cancelar um alarme removido não impede o resto", async () => {
    localAlarms = [{ ...med("velho", "07:00"), nativeAlarmUids: ["x"] }];
    mine = mineWith(2, [med("novo", "10:00")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps({
      cancel: async () => {
        throw new Error("nativo recusou");
      },
    });

    expect(await syncManagedAlarms(deps)).toBe("applied");
    expect(calls).toContain("schedule:novo");
    expect(calls).toContain("ack:2:");
  });

  it("ack que não chega: volta offline, a versão NÃO avança e a próxima rodada só reconfirma", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const semRede = makeDeps({
      ack: async () => {
        throw new Error("sem rede");
      },
    });
    expect(await syncManagedAlarms(semRede)).toBe("offline");
    expect(management).toBeNull();

    calls = [];
    expect(await syncManagedAlarms(makeDeps())).toBe("applied");
    // nada foi reagendado: a lista local já era a do servidor
    expect(calls).toEqual(["dispatch:REPLACE_ALARMS", "ack:2:", "dispatch:SET_MANAGEMENT"]);
    expect(management?.appliedVersion).toBe(2);
  });

  it("depois de uma falha de agendamento, a próxima aplicação tenta de novo só esse alarme", async () => {
    mine = mineWith(2, [med("a", "08:00"), med("b", "09:00")]);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await syncManagedAlarms(
      makeDeps({
        schedule: async (a) => {
          if (a.id === "b") throw new Error("recusou");
          return { ...a, nativeAlarmUids: [`u-${a.id}`] };
        },
        ack: async () => {
          throw new Error("sem rede"); // versão não avança: a próxima rodada reaplica
        },
      })
    );

    calls = [];
    await syncManagedAlarms(makeDeps());
    expect(calls.filter((c) => c.startsWith("schedule:"))).toEqual(["schedule:b"]);
    expect(calls).toContain("ack:2:");
  });

  it("sem resposta do servidor: offline, nada despachado", async () => {
    mine = null;
    expect(await syncManagedAlarms(makeDeps())).toBe("offline");
    expect(dispatched).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("fetchMine que lança também vira offline", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps({
      fetchMine: async () => {
        throw new Error("boom");
      },
    });
    expect(await syncManagedAlarms(deps)).toBe("offline");
  });
});

describe("syncManagedAlarms: sem acordo, versão já aplicada e acordo novo", () => {
  it("sem acordo no servidor: o modo de edição volta ao idoso e os alarmes ficam como estão", async () => {
    localAlarms = [{ ...med("a", "08:00"), nativeAlarmUids: ["u"] }];
    management = { caregiverName: "Ana", since: 1000, appliedVersion: 3 };
    mine = { pendingRequest: null, management: null, list: null };

    expect(await syncManagedAlarms(makeDeps())).toBe("not-managed");

    expect(dispatched).toEqual([{ type: "SET_MANAGEMENT", payload: null }]);
    expect(calls).toEqual(["dispatch:SET_MANAGEMENT"]);
    expect(localAlarms).toHaveLength(1);
  });

  it("sem acordo e sem acordo local: não despacha nada", async () => {
    mine = { pendingRequest: null, management: null, list: null };
    expect(await syncManagedAlarms(makeDeps())).toBe("not-managed");
    expect(dispatched).toEqual([]);
  });

  it("versão que já está aplicada: nada a fazer", async () => {
    management = { caregiverName: "Ana", since: 1000, appliedVersion: 5 };
    mine = mineWith(5, [med("a", "08:00")], 1000);
    expect(await syncManagedAlarms(makeDeps())).toBe("unchanged");
    expect(calls).toEqual([]);
  });

  it("acordo NOVO (outro since) aplica mesmo que a versão seja menor que a do acordo antigo", async () => {
    management = { caregiverName: "Bia", since: 111, appliedVersion: 9 };
    mine = mineWith(1, [med("a", "08:00")], 222);
    expect(await syncManagedAlarms(makeDeps())).toBe("applied");
    expect(management).toEqual({ caregiverName: "Ana", since: 222, appliedVersion: 1 });
  });

  it("acordo ativo sem lista: nada a aplicar", async () => {
    mine = { pendingRequest: null, management: mineWith(1, []).management, list: null };
    expect(await syncManagedAlarms(makeDeps())).toBe("unchanged");
  });

  it("duas chamadas ao mesmo tempo dividem a execução e não agendam duas vezes", async () => {
    mine = mineWith(2, [med("a", "08:00")]);
    const deps = makeDeps();
    await Promise.all([syncManagedAlarms(deps), syncManagedAlarms(deps)]);
    expect(calls.filter((c) => c.startsWith("schedule:"))).toEqual(["schedule:a"]);
  });
});

describe("barramento requestManagedSync", () => {
  it("entrega o pedido aos ouvintes e respeita openRequest", () => {
    const ouvinte = vi.fn();
    const sair = onManagedSyncRequested(ouvinte);

    requestManagedSync();
    requestManagedSync({ openRequest: true });
    expect(ouvinte.mock.calls).toEqual([[{ openRequest: false }], [{ openRequest: true }]]);

    sair();
    requestManagedSync();
    expect(ouvinte).toHaveBeenCalledTimes(2);
  });

  it("um ouvinte que lança não impede os outros", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const bom = vi.fn();
    const sair1 = onManagedSyncRequested(() => {
      throw new Error("ouvinte quebrado");
    });
    const sair2 = onManagedSyncRequested(bom);
    requestManagedSync();
    expect(bom).toHaveBeenCalledTimes(1);
    sair1();
    sair2();
  });
});
```

Criar `tests/managed-alarms-deps.test.ts`:

```ts
/**
 * createManagedAlarmsDeps: a ponte entre o aplicador puro e o servidor.
 * trpcQuery/trpcMutation devolvem null em TODA falha e nunca lançam; o ack
 * precisa traduzir esse null em exceção, senão o aplicador marcaria como
 * confirmada uma versão que o servidor nunca recebeu.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("expo-alarm-countdown", () => ({ isIgnoringBatteryOptimizations: async () => true }));
vi.mock("../lib/device-id", () => ({ getDeviceId: async () => "dev-1" }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://api.test" }));
vi.mock("../lib/alarm-fire-times", () => ({ nextAlarmFireMs: () => null }));
vi.mock("../lib/_core/auth", () => ({
  getSessionToken: async () => "jwt",
  getUserInfo: async () => ({ openId: "u-1", userType: "monitored" }),
  isSessionExpiredStatus: (s: number) => s === 401,
  handleUnauthorized: async () => {},
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => ({ result: { data: { json } } }) });
const recusa = () => ({ ok: false, status: 400, text: async () => "erro" });

const base = { getLocal: () => [], getManagement: () => null, dispatch: () => {} };

beforeEach(() => {
  fetchMock.mockReset();
  vi.resetModules();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("createManagedAlarmsDeps", () => {
  it("fetchMine devolve a resposta de managedAlarms.mine", async () => {
    const mine = { pendingRequest: null, management: null, list: null };
    fetchMock.mockResolvedValue(ok(mine));
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");

    expect(await createManagedAlarmsDeps(base).fetchMine()).toEqual(mine);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/trpc/managedAlarms.mine");
  });

  it("fetchMine devolve null quando o servidor recusa ou a forma não é a esperada", async () => {
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");
    fetchMock.mockResolvedValueOnce(recusa());
    expect(await createManagedAlarmsDeps(base).fetchMine()).toBeNull();

    fetchMock.mockResolvedValueOnce(ok({ qualquer: "coisa" }));
    expect(await createManagedAlarmsDeps(base).fetchMine()).toBeNull();
  });

  it("ack envia a versão e os ids que falharam", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");

    await createManagedAlarmsDeps(base).ack(3, ["b"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/trpc/managedAlarms.ack");
    expect(JSON.parse((init as { body: string }).body)).toEqual({ json: { version: 3, failedAlarmIds: ["b"] } });
  });

  it("ack LANÇA quando a confirmação não chega ao servidor", async () => {
    fetchMock.mockResolvedValue(recusa());
    const { createManagedAlarmsDeps } = await import("../lib/managed-alarms-sync");

    await expect(createManagedAlarmsDeps(base).ack(3, [])).rejects.toThrow();
  });
});
```

Criar `tests/managed-alarms-initializer-interplay.test.ts`:

```ts
/**
 * REPLACE_ALARMS muda a lista de alarmes e, com ela, a assinatura do
 * AlarmSyncInitializer, que então roda syncAlarmsOnStartup(state.alarms). Este
 * teste trava o que isso faz sobre alarmes que o aplicador JÁ agendou: nada de
 * agendamento em dobro. Ver "Regras de desenho", item 5, da Tarefa 12.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let alarmKitDisponivel = false;
let nativoDisponivel = false;
let idsNoAlarmKit: string[] = [];
let notificacoesAgendadas: { content: { data: { alarmId: string } } }[] = [];
const armazenamento = new Map<string, string>();
const agendarAlarmKit = vi.fn(async (_a?: unknown) => {});
const cancelarAlarmKit = vi.fn(async (_id?: string) => {});
const agendarNotificacao = vi.fn(async (_a?: unknown) => "notif-x" as string | null);
const cancelarNotificacoes = vi.fn(async (_id?: string) => 0);
const agendarNativo = vi.fn(async (a: { id: string }) => [`vigora_${a.id}`]);

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => armazenamento.get(k) ?? null,
    setItem: async (k: string, v: string) => void armazenamento.set(k, v),
  },
}));
vi.mock("../lib/ios-alarm-kit", () => ({
  isAlarmKitAvailable: () => alarmKitDisponivel,
  scheduleAlarmKitAlarm: (a: unknown) => agendarAlarmKit(a),
  cancelAlarmKitAlarm: (id: string) => cancelarAlarmKit(id),
  listAlarmKitAlarmIds: () => idsNoAlarmKit,
}));
vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: (a: unknown) => agendarNotificacao(a),
  cancelScheduledAlarmNotifications: (id: string) => cancelarNotificacoes(id),
}));
vi.mock("../lib/native-alarm-manager", () => ({
  get isNativeAlarmAvailable() {
    return nativoDisponivel;
  },
  scheduleNativeAlarm: (a: { id: string }) => agendarNativo(a),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
}));
vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: async () => notificacoesAgendadas,
  cancelAllScheduledNotificationsAsync: async () => {},
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: async () => ({ openId: "u1" }),
  getSessionToken: async () => "t",
}));

import { syncAlarmsOnStartup } from "../lib/alarm-sync";
import type { Alarm } from "../lib/app-context";

const A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const B = "9b2c4d6e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

const alarme = (id: string): Alarm => ({
  id,
  time: "08:00",
  description: "Remédio",
  repeat: "daily",
  enabled: true,
  sound: true,
  vibration: true,
});

beforeEach(async () => {
  alarmKitDisponivel = false;
  nativoDisponivel = false;
  idsNoAlarmKit = [];
  notificacoesAgendadas = [];
  // A primeira rodada de syncAlarmsOnStartup grava a versão do agendamento e
  // reagenda tudo uma vez. Rodar com lista vazia consome essa migração, e o
  // teste mede só o comportamento normal.
  armazenamento.clear();
  await syncAlarmsOnStartup([]);
  vi.clearAllMocks();
});

describe("syncAlarmsOnStartup depois de o aplicador já ter agendado", () => {
  it("iOS 26+: o alarme já está no AlarmKit, então não agenda de novo", async () => {
    alarmKitDisponivel = true;
    idsNoAlarmKit = [A, B];

    await syncAlarmsOnStartup([alarme(A), alarme(B)]);

    expect(agendarAlarmKit).not.toHaveBeenCalled();
    expect(agendarNotificacao).not.toHaveBeenCalled();
    expect(cancelarAlarmKit).not.toHaveBeenCalled();
  });

  it("iOS abaixo de 26: já há notificação por alarmId, então não agenda de novo", async () => {
    notificacoesAgendadas = [{ content: { data: { alarmId: A } } }, { content: { data: { alarmId: B } } }];

    await syncAlarmsOnStartup([alarme(A), alarme(B)]);

    expect(agendarNotificacao).not.toHaveBeenCalled();
  });

  it("Android: uma chamada por alarme, com uid determinístico (substitui, não duplica)", async () => {
    nativoDisponivel = true;

    await syncAlarmsOnStartup([alarme(A), alarme(B)]);

    expect(agendarNativo).toHaveBeenCalledTimes(2);
    expect(agendarNativo.mock.calls.map((c) => c[0].id).sort()).toEqual([A, B].sort());
  });

  it("a varredura de órfãos só cancela o que NÃO está na lista", async () => {
    alarmKitDisponivel = true;
    idsNoAlarmKit = [A, "removido-pelo-cuidador"];

    await syncAlarmsOnStartup([alarme(A)]);

    expect(cancelarAlarmKit).toHaveBeenCalledTimes(1);
    expect(cancelarAlarmKit).toHaveBeenCalledWith("removido-pelo-cuidador");
  });
});
```

Criar `tests/managed-alarms-wiring.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("Tarefa 12: estado e fiação do modo gerenciado", () => {
  const ctx = read("lib/app-context.tsx");

  it("REPLACE_ALARMS conta como mudança de dado (vai ao backup); SET_MANAGEMENT não", () => {
    const inicio = ctx.indexOf("const DATA_ACTIONS");
    const lista = ctx.slice(inicio, ctx.indexOf("]);", inicio));
    expect(lista).toContain("'REPLACE_ALARMS'");
    expect(lista).not.toContain("'SET_MANAGEMENT'");
  });

  it("REPLACE_ALARMS troca a lista inteira, ordenada por horário e sem o teto de 24", () => {
    const i = ctx.indexOf("case 'REPLACE_ALARMS'");
    expect(i).toBeGreaterThan(-1);
    const corpo = ctx.slice(i, ctx.indexOf("case 'SET_MANAGEMENT'", i));
    expect(corpo).toMatch(/sort\(\(a, b\) => a\.time\.localeCompare\(b\.time\)\)/);
    expect(corpo).not.toMatch(/24/);
  });

  it("management começa nulo e não entra no backup", () => {
    expect(ctx).toMatch(/management: null,/);
    expect(ctx).toMatch(/export type ManagementInfo = \{/);
    const snap = ctx.slice(ctx.indexOf("function buildSnapshot"), ctx.indexOf("export function AppProvider"));
    expect(snap).not.toContain("management");
  });

  it("monitoring-service exporta os dois helpers de tRPC", () => {
    const svc = read("lib/monitoring-service.ts");
    expect(svc).toMatch(/export async function trpcMutation\(/);
    expect(svc).toMatch(/export async function trpcQuery\(/);
  });

  it("MonitoringInitializer sincroniza no bootstrap (sem bloquear), ao voltar ao app e sob pedido", () => {
    const init = read("components/monitoring-initializer.tsx");
    expect(init).toMatch(/await syncAlarmsToServer\(s\.alarms\);[\s\S]*void runManagedSync\(\);/);
    expect(init).toMatch(/onManagedSyncRequested\(/);
    // o limitador de 1 por minuto vale também para a busca da lista
    const ouvinte = init.slice(init.indexOf('AppState.addEventListener("change"'));
    expect(ouvinte).toMatch(/shouldResync[\s\S]*runManagedSync/);
  });

  it("conta de cuidador nunca chama managedAlarms.mine (a rota responde FORBIDDEN)", () => {
    const init = read("components/monitoring-initializer.tsx");
    expect(init).toMatch(/userType === ["']caregiver["']/);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarms-apply.test.ts tests/managed-alarms-sync.test.ts tests/managed-alarms-deps.test.ts tests/managed-alarms-initializer-interplay.test.ts tests/managed-alarms-wiring.test.ts`

Esperado: FAIL em `apply`, `sync`, `deps` (`Failed to resolve import "../lib/managed-alarms-apply"` / `"../lib/managed-alarms-sync"`) e em `wiring` (guardas de texto sem match). `managed-alarms-initializer-interplay` **já passa**: ele trava o comportamento que existe hoje do `syncAlarmsOnStartup`.

- [ ] **Passo 3: Implementar**

**3a.** `lib/app-context.tsx`. Cinco edições.

Antes de `export interface AppState {`, trocar:

```ts
export interface AppState {
  alarms: Alarm[];
```

por:

```ts
/**
 * Acordo de gerenciamento ativo: um cuidador cuida dos alarmes desta pessoa.
 * Só existe no aparelho (persistido com o resto do estado) e NÃO vai ao backup:
 * a fonte da verdade é o servidor (`managedAlarms.mine`).
 * `since` identifica o acordo (um acordo novo recomeça na versão 1);
 * `appliedVersion` é a última versão da lista que o servidor confirmou receber.
 */
export type ManagementInfo = { caregiverName: string; since: number; appliedVersion: number };

export interface AppState {
  alarms: Alarm[];
```

Ainda em `AppState`, trocar:

```ts
  /** Epoch ms of the last local data change. Drives cloud last-write-wins. */
  dataUpdatedAt: number;
}
```

por:

```ts
  /** Epoch ms of the last local data change. Drives cloud last-write-wins. */
  dataUpdatedAt: number;
  /** Não nulo = um cuidador gerencia os alarmes: listas só de leitura. */
  management: ManagementInfo | null;
}
```

Nas ações, trocar:

```ts
  | { type: 'CLEAR_ALL_DATA' }
  /** Troca de conta/logout: volta ao estado inicial (isLoading: true) antes de
```

por:

```ts
  | { type: 'CLEAR_ALL_DATA' }
  /** Modo gerenciado: a lista do servidor passa a ser a lista local (já agendada). */
  | { type: 'REPLACE_ALARMS'; payload: Alarm[] }
  | { type: 'SET_MANAGEMENT'; payload: ManagementInfo | null }
  /** Troca de conta/logout: volta ao estado inicial (isLoading: true) antes de
```

No `initialState`, trocar:

```ts
  isLoading: true,
  dataUpdatedAt: 0,
};
```

por:

```ts
  isLoading: true,
  dataUpdatedAt: 0,
  management: null,
};
```

Em `DATA_ACTIONS`, trocar:

```ts
  'DELETE_ALARM',
  'ADD_CONTACT',
```

por:

```ts
  'DELETE_ALARM',
  'REPLACE_ALARMS',
  'ADD_CONTACT',
```

No reducer, trocar:

```ts
    case 'DELETE_ALARM':
      return {
        ...state,
        alarms: state.alarms.filter((a) => a.id !== action.payload),
      };
```

por:

```ts
    case 'DELETE_ALARM':
      return {
        ...state,
        alarms: state.alarms.filter((a) => a.id !== action.payload),
      };

    case 'REPLACE_ALARMS':
      // Sem o teto do ADD_ALARM: o servidor já limita a lista, e cortar aqui
      // descartaria um alarme em silêncio.
      return {
        ...state,
        alarms: [...action.payload].sort((a, b) => a.time.localeCompare(b.time)),
      };

    case 'SET_MANAGEMENT':
      return { ...state, management: action.payload };
```

**3b.** Criar `lib/managed-alarms-apply.ts`:

```ts
/**
 * managed-alarms-apply.ts
 *
 * Função pura: dada a lista local e a lista gerenciada do servidor, diz o que
 * cancelar, o que agendar e qual lista passa a valer. Quem executa (cancelar,
 * agendar, trocar o estado, confirmar) é managed-alarms-sync.ts, na ordem certa.
 */
import type { Alarm } from './app-context';
import type { ManagedAlarm } from '@/shared/managed-alarm';

export interface ManagedApplyPlan {
  /** Alarmes LOCAIS (com os uids do sistema) a cancelar: removidos e alterados. */
  toCancel: Alarm[];
  /** Alarmes a agendar (sem uids): novos e alterados que estão ligados. */
  toSchedule: Alarm[];
  /** A lista que vira o estado local. Inalterados mantêm os uids que já tinham. */
  next: Alarm[];
}

/** Dias só contam em 'custom', e em qualquer ordem. */
function customDaysKey(a: { repeat: string; customDays?: number[] }): string {
  if (a.repeat !== 'custom') return '';
  return [...(a.customDays ?? [])].sort((x, y) => x - y).join(',');
}

/**
 * Igual em tudo o que o servidor controla. Ignora `notificationId` e
 * `nativeAlarmUids` (são do aparelho). Qualquer diferença reagenda: texto,
 * som e vibração fazem parte do agendamento nativo.
 */
export function sameManagedFields(local: Alarm, server: ManagedAlarm): boolean {
  const kind = server.kind ?? 'medication';
  if ((local.kind ?? 'medication') !== kind) return false;
  if (kind === 'checkin' && (local.escalateAfterMinutes ?? null) !== (server.escalateAfterMinutes ?? null)) {
    return false;
  }
  return (
    local.time === server.time &&
    local.description === server.description &&
    local.enabled === server.enabled &&
    local.repeat === server.repeat &&
    customDaysKey(local) === customDaysKey(server) &&
    local.sound === server.sound &&
    local.vibration === server.vibration
  );
}

export function planManagedApply(local: Alarm[], server: ManagedAlarm[]): ManagedApplyPlan {
  const serverIds = new Set(server.map((s) => s.id));
  const localById = new Map(local.map((a) => [a.id, a] as const));

  const toCancel = local.filter((a) => !serverIds.has(a.id));
  const toSchedule: Alarm[] = [];
  const next: Alarm[] = [];

  for (const s of server) {
    const current = localById.get(s.id);
    if (current && sameManagedFields(current, s)) {
      next.push(current);
      continue;
    }
    // Alterado: cancela o antigo pelos uids que ele tem (um alarme semanal
    // pode ter virado diário, e os _wd<n> antigos só saem por aqui).
    if (current) toCancel.push(current);
    const fresh: Alarm = { ...s };
    if (fresh.enabled) toSchedule.push(fresh);
    next.push(fresh);
  }

  return { toCancel, toSchedule, next };
}
```

**3c.** Criar `lib/managed-alarms-sync.ts`:

```ts
/**
 * managed-alarms-sync.ts
 *
 * Busca a lista gerenciada no servidor, aplica no aparelho (cancela e agenda no
 * sistema), troca a lista local e confirma ao servidor (`ack`).
 *
 * A ORDEM é a regra: cancelar -> agendar (esperando cada um) -> REPLACE_ALARMS
 * -> ack -> SET_MANAGEMENT. O ack nunca sai antes de o agendamento terminar, e
 * a versão só conta como aplicada depois que o ack chegou ao servidor.
 * Ver docs da Tarefa 12 (Regras de desenho).
 *
 * Só tipos no topo: o módulo é testável sem React Native. As dependências de
 * verdade (alarm-sync, monitoring-service) entram por import dinâmico em
 * createManagedAlarmsDeps.
 */
import type { Alarm, ManagementInfo } from './app-context';
import type { ManagedAlarm } from '@/shared/managed-alarm';
import { planManagedApply } from './managed-alarms-apply';

export type MineResponse = {
  pendingRequest: null | { id: number; caregiverName: string };
  management: null | { id: number; caregiverOpenId: string; caregiverName: string; since: number };
  list: null | { version: number; alarms: ManagedAlarm[] };
};

export type ManagedSyncResult = 'applied' | 'unchanged' | 'not-managed' | 'offline';

export type ManagedSyncAction =
  | { type: 'REPLACE_ALARMS'; payload: Alarm[] }
  | { type: 'SET_MANAGEMENT'; payload: ManagementInfo | null };

export interface ManagedSyncDeps {
  getLocal(): Alarm[];
  getManagement(): ManagementInfo | null;
  dispatch(action: ManagedSyncAction): void;
  schedule(alarm: Alarm): Promise<Alarm>;
  cancel(alarm: Alarm): Promise<void>;
  fetchMine(): Promise<MineResponse | null>;
  /** LANÇA se a confirmação não chegou ao servidor. */
  ack(version: number, failedAlarmIds: string[]): Promise<void>;
}

// Só o nome do erro vai para o log: a mensagem pode carregar dado do alarme.
const errName = (e: unknown): string => (e instanceof Error ? e.name : typeof e);

async function runOnce(deps: ManagedSyncDeps): Promise<ManagedSyncResult> {
  let mine: MineResponse | null;
  try {
    mine = await deps.fetchMine();
  } catch (e) {
    console.warn('[ManagedAlarms] não foi possível buscar a lista:', errName(e));
    return 'offline';
  }
  if (!mine) return 'offline';

  const current = deps.getManagement();
  const agreement = mine.management;
  if (!agreement) {
    // Sem acordo: os alarmes ficam como estão (spec 3.4); só a edição volta ao idoso.
    if (current) deps.dispatch({ type: 'SET_MANAGEMENT', payload: null });
    return 'not-managed';
  }

  const list = mine.list;
  if (!list) return 'unchanged';

  // `since` identifica o acordo: o acordo novo recomeça na versão 1, e comparar
  // com o appliedVersion de um acordo antigo faria o app ignorar a lista nova.
  const appliedVersion = current && current.since === agreement.since ? current.appliedVersion : 0;
  if (list.version <= appliedVersion) return 'unchanged';

  const plan = planManagedApply(deps.getLocal(), list.alarms);

  // 1. Cancela os removidos e os alterados. Uma falha aqui é registrada e não
  // impede o resto: o agendamento seguinte substitui o mesmo uid.
  for (const alarm of plan.toCancel) {
    try {
      await deps.cancel(alarm);
    } catch (e) {
      console.warn('[ManagedAlarms] o sistema não cancelou um alarme:', errName(e));
    }
  }

  // 2. Agenda os novos e alterados, UM A UM, esperando cada um. A falha de um
  // não derruba os outros: o id vai para failedAlarmIds.
  const scheduled = new Map<string, Alarm>();
  const failed: string[] = [];
  for (const alarm of plan.toSchedule) {
    try {
      scheduled.set(alarm.id, await deps.schedule(alarm));
    } catch (e) {
      failed.push(alarm.id);
      console.warn('[ManagedAlarms] o sistema recusou agendar um alarme:', errName(e));
    }
  }

  // 3. Monta a lista local. Alarme que falhou fica DESLIGADO e sem uids: um
  // alarme que não existe no sistema não pode aparecer ligado (o aparelho
  // pré-registraria um evento e o dead man's switch acusaria o idoso). Como
  // fica diferente do servidor, a próxima aplicação tenta de novo.
  const next = plan.next.map((a) => {
    const done = scheduled.get(a.id);
    if (done) return done;
    if (failed.includes(a.id)) {
      return { ...a, enabled: false, notificationId: undefined, nativeAlarmUids: [] };
    }
    return a;
  });

  // 4. Só agora (TODO o agendamento terminou) a lista local é trocada.
  deps.dispatch({ type: 'REPLACE_ALARMS', payload: next });

  // 5. Confirma. Se não chegar, a versão NÃO avança: a próxima rodada reconfirma.
  try {
    await deps.ack(list.version, failed);
  } catch (e) {
    console.warn('[ManagedAlarms] a confirmação não chegou ao servidor:', errName(e));
    return 'offline';
  }

  deps.dispatch({
    type: 'SET_MANAGEMENT',
    payload: { caregiverName: agreement.caregiverName, since: agreement.since, appliedVersion: list.version },
  });
  return 'applied';
}

let inFlight: Promise<ManagedSyncResult> | null = null;
let rerunRequested = false;

/**
 * Uma execução por vez. Quem chega no meio de uma execução reaproveita a
 * promessa em curso e pede UMA nova rodada ao final (a versão pode ter subido
 * enquanto a anterior aplicava). Duas execuções em paralelo agendariam o mesmo
 * alarme duas vezes.
 */
export function syncManagedAlarms(deps: ManagedSyncDeps): Promise<ManagedSyncResult> {
  if (inFlight) {
    rerunRequested = true;
    return inFlight;
  }
  inFlight = (async () => {
    let result = await runOnce(deps);
    if (rerunRequested) {
      rerunRequested = false;
      result = await runOnce(deps);
    }
    return result;
  })().finally(() => {
    inFlight = null;
    rerunRequested = false;
  });
  return inFlight;
}

function isMineResponse(value: unknown): value is MineResponse {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return 'pendingRequest' in o && 'management' in o && 'list' in o;
}

/**
 * Monta as dependências de verdade. Imports dinâmicos de propósito: este módulo
 * não pode puxar React Native para os testes, e alarm-sync importa o tipo Alarm
 * de app-context (import estático fecharia um ciclo).
 */
export function createManagedAlarmsDeps(
  base: Pick<ManagedSyncDeps, 'getLocal' | 'getManagement' | 'dispatch'>
): ManagedSyncDeps {
  return {
    ...base,
    schedule: async (alarm) => (await import('./alarm-sync')).scheduleFullAlarm(alarm),
    cancel: async (alarm) => (await import('./alarm-sync')).cancelFullAlarm(alarm),
    fetchMine: async () => {
      const { trpcQuery } = await import('./monitoring-service');
      const result = await trpcQuery('managedAlarms.mine', null);
      return isMineResponse(result) ? result : null;
    },
    ack: async (version, failedAlarmIds) => {
      const { trpcMutation } = await import('./monitoring-service');
      const result = await trpcMutation('managedAlarms.ack', { version, failedAlarmIds });
      // trpcMutation devolve null em TODA falha e nunca lança.
      if (result === null) throw new Error('a confirmação não chegou ao servidor');
    },
  };
}

// --- Barramento: "busque a lista agora" ---------------------------------------

export type ManagedSyncRequest = { openRequest: boolean };

const listeners = new Set<(request: ManagedSyncRequest) => void>();

/** Quem sincroniza (MonitoringInitializer) e quem mostra o pedido (diálogo) assinam aqui. */
export function onManagedSyncRequested(listener: (request: ManagedSyncRequest) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Pede a busca da lista agora (push recebido, toque na notificação, aceite do
 * pedido). `openRequest: true` também manda o diálogo do pedido reaparecer.
 */
export function requestManagedSync(opts: { openRequest?: boolean } = {}): void {
  const request: ManagedSyncRequest = { openRequest: opts.openRequest === true };
  listeners.forEach((listener) => {
    try {
      listener(request);
    } catch (e) {
      console.warn('[ManagedAlarms] ouvinte falhou:', errName(e));
    }
  });
}
```

**3d.** `lib/monitoring-service.ts`: exportar os dois helpers. Trocar:

```ts
async function trpcMutation(
  procedure: string,
  input: unknown
): Promise<any> {
```

por:

```ts
export async function trpcMutation(
  procedure: string,
  input: unknown
): Promise<any> {
```

e trocar:

```ts
async function trpcQuery(
  procedure: string,
  input: unknown
): Promise<any> {
```

por:

```ts
export async function trpcQuery(
  procedure: string,
  input: unknown
): Promise<any> {
```

**3e.** `components/monitoring-initializer.tsx`. Seis edições.

Trocar `import { useEffect, useRef } from "react";` por:

```ts
import { useCallback, useEffect, useRef } from "react";
```

Depois do bloco `} from "@/lib/monitoring-service";`, acrescentar:

```ts
import {
  createManagedAlarmsDeps,
  onManagedSyncRequested,
  syncManagedAlarms,
} from "@/lib/managed-alarms-sync";
```

Trocar `  const { state } = useAppContext();` por:

```ts
  const { state, dispatch } = useAppContext();
```

Depois de `  const { dialogProps, showDialog, hideDialog } = useAppDialog();`, acrescentar:

```ts

  // Alarmes gerenciados: se um cuidador cuida dos alarmes desta pessoa, busca a
  // lista no servidor, aplica no aparelho e confirma. Nunca lança (o motivo vai
  // para o log); conta de cuidador nem pergunta (a rota responde FORBIDDEN).
  const runManagedSync = useCallback(async () => {
    try {
      const user = await Auth.getUserInfo();
      if (!user || user.userType === "caregiver") return;
      await syncManagedAlarms(
        createManagedAlarmsDeps({
          getLocal: () => stateRef.current.alarms,
          getManagement: () => stateRef.current.management,
          dispatch,
        })
      );
    } catch (error) {
      console.warn(
        "[Monitoring] sincronização dos alarmes gerenciados falhou:",
        error instanceof Error ? error.name : typeof error
      );
    }
  }, [dispatch]);
```

No bootstrap, trocar:

```ts
        lastResyncRef.current = Date.now();
        await syncAlarmsToServer(s.alarms);
```

por:

```ts
        lastResyncRef.current = Date.now();
        await syncAlarmsToServer(s.alarms);

        // Lista gerenciada. Sem await: sem internet isto leva quase um minuto
        // (três tentativas com timeout) e não pode segurar o aviso de alarmes
        // não confirmados logo abaixo. Quem aplica e confirma é o syncManagedAlarms.
        void runManagedSync();
```

No ouvinte de AppState, trocar:

```ts
      lastResyncRef.current = now;
      syncAlarmsToServer(stateRef.current.alarms).catch(console.warn);
    });
    return () => sub.remove();
  }, []);
```

por:

```ts
      lastResyncRef.current = now;
      syncAlarmsToServer(stateRef.current.alarms).catch(console.warn);
      void runManagedSync();
    });
    return () => sub.remove();
  }, [runManagedSync]);

  // Push (silencioso, visível ou toque na notificação) e o aceite do pedido
  // pedem a busca da lista na hora, sem esperar o próximo ciclo.
  useEffect(() => {
    return onManagedSyncRequested(() => {
      if (!initializedRef.current) return;
      void runManagedSync();
    });
  }, [runManagedSync]);
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarms-apply.test.ts tests/managed-alarms-sync.test.ts tests/managed-alarms-deps.test.ts tests/managed-alarms-initializer-interplay.test.ts tests/managed-alarms-wiring.test.ts tests/monitoring-initializer-sync-key.test.ts tests/resync-throttle.test.ts`

Esperado: PASS (os dois últimos são os testes existentes do `MonitoringInitializer`; a edição do ouvinte de AppState preserva as strings que eles procuram).

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos).

```bash
git add lib/app-context.tsx lib/managed-alarms-apply.ts lib/managed-alarms-sync.ts lib/monitoring-service.ts components/monitoring-initializer.tsx tests/managed-alarms-apply.test.ts tests/managed-alarms-sync.test.ts tests/managed-alarms-deps.test.ts tests/managed-alarms-initializer-interplay.test.ts tests/managed-alarms-wiring.test.ts
git commit -m "feat(app): aplicador da lista gerenciada (REPLACE_ALARMS; o ack só sai depois de agendar)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 13: Aparelho do idoso recebe os pushes de gerenciamento, manda o fuso e avisa o logout

**Depende de:** Tarefa 12 (`requestManagedSync`, `trpcMutation` exportado); Tarefa 8 (rotas `monitoring.deviceSignedOut` e o campo `timezone` do `userData.put`, só em tempo de execução).

**Files:**
- Create: `components/monitored-push-initializer.tsx` (token de push, tipos de push do idoso, toque na notificação)
- Modify: `app/(tabs)/_layout.tsx` (montar o componente; só o idoso passa por este layout)
- Modify: `lib/cloud-sync.ts` (o `userData.put` leva o fuso do aparelho)
- Modify: `lib/monitoring-service.ts` (`notifyDeviceSignedOut`)
- Modify: `hooks/use-auth.ts` (logout chama `notifyDeviceSignedOut` antes de desregistrar o token)
- Test: `tests/monitored-push-initializer.test.ts` (fonte), `tests/cloud-sync-timezone.test.ts`, `tests/device-signed-out.test.ts`, `tests/logout-device-signed-out.test.ts` (fonte) (todos novos)

**Interfaces:**
- Consumes: `requestManagedSync(opts?: { openRequest?: boolean })` (Tarefa 12); `trpcMutation(procedure, input)` (Tarefa 12); `getDevicePushToken(): Promise<{ token: string; platform: 'ios' | 'android' | 'web' } | null>` (`lib/push-registration.ts`); `getDeviceId(): Promise<string>` (`lib/device-id.ts`); rota `push.register({ token, platform, deviceId })` (existente, agora também sinal de vida da conta, Tarefa 8); rota `monitoring.deviceSignedOut` (Tarefa 8; o plano envia o corpo `{ json: {} }`, que serve tanto a uma rota sem `input` quanto a um objeto vazio).
- Produces:
  ```ts
  // components/monitored-push-initializer.tsx
  export const MONITORED_PUSH_TYPES = ['management_request', 'management_ended', 'managed_alarms_updated', 'ping'];
  export function MonitoredPushInitializer(): null;
  // lib/monitoring-service.ts
  export async function notifyDeviceSignedOut(): Promise<void>;   // nunca lança; prazo de 4 s; sem nova tentativa
  // lib/cloud-sync.ts: pushCloudData(snapshot) passa a enviar `timezone` (IANA) no corpo, quando o aparelho sabe qual é.
  ```

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/monitored-push-initializer.test.ts`:

```ts
/**
 * O componente não é importável no vitest (RN): trava no nível do fonte o que
 * importa. Mesmo estilo de tests/caregiver-push-initializer.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const src = read("components/monitored-push-initializer.tsx");

describe("MonitoredPushInitializer", () => {
  it.each(["management_request", "management_ended", "managed_alarms_updated", "ping"])(
    "trata o tipo de push %s",
    (tipo) => {
      const lista = src.slice(src.indexOf("MONITORED_PUSH_TYPES"), src.indexOf("];", src.indexOf("MONITORED_PUSH_TYPES")));
      expect(lista).toContain(`'${tipo}'`);
    }
  );

  it("toda mensagem recebida ou tocada dispara a busca da lista; só o pedido manda reabrir o diálogo", () => {
    expect(src).toMatch(/requestManagedSync\(\{ openRequest: type === 'management_request' \}\)/);
    expect(src).toMatch(/addNotificationReceivedListener/);
    expect(src).toMatch(/addNotificationResponseReceivedListener/);
    expect(src).toMatch(/getLastNotificationResponseAsync/);
  });

  it("o toque que abriu o app a frio é tratado uma vez por processo", () => {
    expect(src).toMatch(/let coldStartHandled = false;/);
    expect(src).toMatch(/if \(!coldStartHandled\)/);
  });

  it("registra o token pelo helper que nunca lança, com o deviceId, e não registra conta de cuidador", () => {
    expect(src).toMatch(/trpcMutation\('push\.register', \{ \.\.\.result, deviceId \}\)/);
    expect(src).toMatch(/getDeviceId\(\)/);
    expect(src).toMatch(/userType === 'caregiver'/);
  });

  it("não engole erro: sem catch vazio, e o log leva só o nome do erro", () => {
    expect(src).not.toMatch(/catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
    expect(src).toMatch(/console\.warn\(`\[monitored-push\]/);
    expect(src).not.toMatch(/console\.(warn|log|error)\([^)]*\bdata\b/);
  });
});

describe("montagem", () => {
  it("o layout do idoso monta o MonitoredPushInitializer", () => {
    const layout = read("app/(tabs)/_layout.tsx");
    expect(layout).toMatch(/import \{ MonitoredPushInitializer \} from "@\/components\/monitored-push-initializer";/);
    expect(layout).toMatch(/<MonitoredPushInitializer \/>/);
  });
});
```

Criar `tests/cloud-sync-timezone.test.ts`:

```ts
/**
 * O servidor calcula os disparos de cada conta no fuso dela (spec 5.1). O fuso
 * só chega se o app mandar em todo userData.put.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://api.test" }));
vi.mock("../lib/_core/auth", () => ({ getSessionToken: async () => "jwt" }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { pushCloudData, type CloudSnapshot } from "../lib/cloud-sync";

const snapshot = {
  anamnesis: null,
  emergencyContacts: [],
  alarms: [],
  settings: null,
  healthMetrics: [],
  profile: null,
  dataUpdatedAt: 123,
} as CloudSnapshot;

const corpoEnviado = () => JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body).json;

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pushCloudData envia o fuso do aparelho", () => {
  it("inclui o fuso IANA resolvido pelo Intl e mantém o snapshot", async () => {
    await pushCloudData(snapshot);
    const json = corpoEnviado();
    expect(json.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(json.dataUpdatedAt).toBe(123);
  });

  it("sem fuso resolvido, a chave não vai (o servidor mantém o que tinha)", async () => {
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(
      () => ({ resolvedOptions: () => ({ timeZone: "" }) }) as never
    );
    await pushCloudData(snapshot);
    expect("timezone" in corpoEnviado()).toBe(false);
  });

  it("Intl que lança (ROM sem ICU) não derruba o backup: a chave não vai e o motivo é logado", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new Error("sem ICU");
    });
    await expect(pushCloudData(snapshot)).resolves.toBe(true);
    expect("timezone" in corpoEnviado()).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});
```

Criar `tests/device-signed-out.test.ts`:

```ts
/**
 * notifyDeviceSignedOut: o logout pausa os avisos da conta na hora. Não pode
 * travar o logout (prazo curto, sem nova tentativa) nem lançar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("expo-alarm-countdown", () => ({ isIgnoringBatteryOptimizations: async () => true }));
vi.mock("../lib/device-id", () => ({ getDeviceId: async () => "dev-1" }));
vi.mock("@/constants/oauth", () => ({ getApiBaseUrl: () => "https://api.test" }));
vi.mock("../lib/alarm-fire-times", () => ({ nextAlarmFireMs: () => null }));

let sessionToken: string | null = "jwt";
let userType: "monitored" | "caregiver" | null = "monitored";
vi.mock("../lib/_core/auth", () => ({
  getSessionToken: async () => sessionToken,
  getUserInfo: async () => (sessionToken ? { openId: "u-1", userType } : null),
  isSessionExpiredStatus: (s: number) => s === 401,
  handleUnauthorized: vi.fn(async () => {}),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  sessionToken = "jwt";
  userType = "monitored";
  vi.resetModules();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("notifyDeviceSignedOut", () => {
  it("avisa o servidor com a sessão ainda válida", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const svc = await import("../lib/monitoring-service");

    await svc.notifyDeviceSignedOut();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.test/api/trpc/monitoring.deviceSignedOut");
    expect((init as { method: string }).method).toBe("POST");
    expect((init as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer jwt");
  });

  it("conta de cuidador não chama (a rota é do idoso)", async () => {
    userType = "caregiver";
    const svc = await import("../lib/monitoring-service");
    await svc.notifyDeviceSignedOut();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem sessão não chama", async () => {
    sessionToken = null;
    const svc = await import("../lib/monitoring-service");
    await svc.notifyDeviceSignedOut();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rede caída: não lança, loga só o nome do erro e faz UMA tentativa", async () => {
    fetchMock.mockRejectedValue(new Error("senha=123 vazou na mensagem"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const svc = await import("../lib/monitoring-service");

    await expect(svc.notifyDeviceSignedOut()).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("senha");
  });

  it("401 não dispara o fluxo de sessão expirada (o usuário já está saindo)", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    const Auth = await import("../lib/_core/auth");
    const svc = await import("../lib/monitoring-service");

    await svc.notifyDeviceSignedOut();

    expect(Auth.handleUnauthorized).not.toHaveBeenCalled();
  });

  it("servidor que não responde: desiste em 4 s em vez de travar o logout", async () => {
    const svc = await import("../lib/monitoring-service"); // antes dos timers falsos
    vi.useFakeTimers();
    let abortado = false;
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            abortado = true;
            reject(Object.assign(new Error("abortado"), { name: "AbortError" }));
          });
        })
    );

    const fim = svc.notifyDeviceSignedOut();
    await vi.advanceTimersByTimeAsync(4100);
    await fim;

    expect(abortado).toBe(true);
  });
});
```

Criar `tests/logout-device-signed-out.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "..", "hooks", "use-auth.ts"), "utf8");
const logout = src.slice(src.indexOf("const logout = useCallback"), src.indexOf("const isAuthenticated"));

describe("logout do idoso", () => {
  it("avisa o servidor ANTES de desregistrar o token e ANTES de derrubar a sessão", () => {
    const avisa = logout.indexOf("await notifyDeviceSignedOut();");
    const desregistra = logout.indexOf("await unregisterDevicePushToken();");
    const encerra = logout.indexOf("await Api.logout();");
    expect(avisa).toBeGreaterThan(-1);
    expect(avisa).toBeLessThan(desregistra);
    expect(desregistra).toBeLessThan(encerra);
  });

  it("importa o helper do serviço de monitoramento", () => {
    expect(src).toMatch(/import \{ notifyDeviceSignedOut \} from "@\/lib\/monitoring-service";/);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/monitored-push-initializer.test.ts tests/cloud-sync-timezone.test.ts tests/device-signed-out.test.ts tests/logout-device-signed-out.test.ts`

Esperado: FAIL (`ENOENT ... monitored-push-initializer.tsx`; `timezone` ausente do corpo; `svc.notifyDeviceSignedOut is not a function`; guardas de texto sem match).

- [ ] **Passo 3: Implementar**

**3a.** Criar `components/monitored-push-initializer.tsx`:

```tsx
/**
 * monitored-push-initializer.tsx
 *
 * Do lado do idoso: registra o token de push deste aparelho (até a Fase 4 só o
 * app do cuidador fazia isso) e reage aos pushes de gerenciamento de alarmes.
 * Qualquer push desses (recebido com o app aberto ou tocado) pede a busca da
 * lista no servidor; o pedido de gerenciamento também manda o diálogo
 * reaparecer. Mesmo estilo do caregiver-push-initializer.
 *
 * Montado em app/(tabs)/_layout.tsx, que só o idoso usa. Conta de cuidador que
 * chegasse aqui por engano é ignorada.
 */
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Auth from '@/lib/_core/auth';
import { getDeviceId } from '@/lib/device-id';
import { requestManagedSync } from '@/lib/managed-alarms-sync';
import { trpcMutation } from '@/lib/monitoring-service';
import { getDevicePushToken } from '@/lib/push-registration';

// Push `data.type` que o servidor manda ao aparelho do idoso. Filtrar por tipo
// evita reagir às notificações dos alarmes (que têm data.alarmId).
export const MONITORED_PUSH_TYPES = [
  'management_request',
  'management_ended',
  'managed_alarms_updated',
  'ping',
];

// Só o nome do erro vai para o log (sem payload: pode carregar dado de saúde).
function warnFailed(what: string, error: unknown) {
  console.warn(`[monitored-push] ${what}`, error instanceof Error ? error.name : typeof error);
}

/**
 * O sistema devolve a MESMA resposta de "última notificação tocada" a cada
 * montagem do layout. Tratada uma vez por processo, senão um toque antigo no
 * pedido reabriria o diálogo toda vez que o layout remontasse.
 */
let coldStartHandled = false;

function handleData(data: Record<string, unknown> | undefined) {
  const type = data?.type;
  if (typeof type !== 'string' || !MONITORED_PUSH_TYPES.includes(type)) return;
  requestManagedSync({ openRequest: type === 'management_request' });
}

export function MonitoredPushInitializer() {
  const registered = useRef(false);

  // Registra o token de push deste aparelho (uma vez por montagem).
  useEffect(() => {
    if (registered.current) return;
    registered.current = true;
    if (Platform.OS === 'web') return;

    (async () => {
      const user = await Auth.getUserInfo();
      if (!user || user.userType === 'caregiver') return;

      const result = await getDevicePushToken();
      if (!result) {
        console.warn('[monitored-push] sem token de push: este aparelho não recebe os avisos do cuidador');
        return;
      }
      // deviceId: prova de posse da linha (o logout apaga por ele).
      const deviceId = await getDeviceId();
      // trpcMutation devolve null em toda falha e nunca lança.
      const sent = await trpcMutation('push.register', { ...result, deviceId });
      if (sent === null) console.warn('[monitored-push] o servidor não registrou o token');
    })().catch((e) => warnFailed('registro do token falhou', e));
  }, []);

  // Toque na notificação: a frio (o toque que abriu o app) e com o app rodando.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onResponse = (response: Notifications.NotificationResponse | null) => {
      handleData(response?.notification.request.content.data);
    };

    if (!coldStartHandled) {
      coldStartHandled = true;
      Notifications.getLastNotificationResponseAsync()
        .then(onResponse)
        .catch((e) => warnFailed('toque inicial falhou', e));
    }
    const sub = Notifications.addNotificationResponseReceivedListener(onResponse);
    return () => sub.remove();
  }, []);

  // Push recebido com o app aberto.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      handleData(notification.request.content.data);
    });
    return () => sub.remove();
  }, []);

  return null;
}
```

**3b.** `app/(tabs)/_layout.tsx`: trocar

```tsx
import { MicFab } from "@/components/mic-fab";
import { View } from "react-native";
```

por

```tsx
import { MicFab } from "@/components/mic-fab";
import { MonitoredPushInitializer } from "@/components/monitored-push-initializer";
import { View } from "react-native";
```

e trocar

```tsx
      </Tabs>
      <MicFab bottomOffset={86} />
```

por

```tsx
      </Tabs>
      <MonitoredPushInitializer />
      <MicFab bottomOffset={86} />
```

**3c.** `lib/cloud-sync.ts`. Antes de `/** Bearer header on native; cookie auth on web. Returns null when unauthenticated. */`, acrescentar:

```ts
/**
 * Fuso IANA do aparelho (ex.: "America/Rio_Branco"). O servidor guarda para
 * calcular os horários dos alarmes desta conta. Em ROM enxuta sem dados de ICU o
 * Intl pode não resolver: a chave simplesmente não vai e o servidor mantém o que
 * já tinha (ou cai em Brasília).
 */
function deviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch (err: any) {
    console.warn("[CloudSync] fuso do aparelho indisponível:", err?.name ?? typeof err);
    return null;
  }
}

```

e em `pushCloudData`, trocar:

```ts
  const url = `${baseUrl}/api/trpc/userData.put`;

  try {
```

por:

```ts
  const url = `${baseUrl}/api/trpc/userData.put`;
  const timezone = deviceTimezone();

  try {
```

e trocar:

```ts
      body: JSON.stringify({ json: snapshot }),
```

por:

```ts
      body: JSON.stringify({ json: timezone ? { ...snapshot, timezone } : snapshot }),
```

**3d.** `lib/monitoring-service.ts`. Antes de `// --- Heartbeat ---...`, acrescentar:

```ts
// --- Logout ---------------------------------------------------------------------

const SIGNED_OUT_TIMEOUT_MS = 4000;

/**
 * Avisa o servidor de que a pessoa saiu da conta neste aparelho: os avisos
 * automáticos da conta ficam pausados na hora, em vez de esperar dois dias sem
 * sinal. Precisa rodar ANTES de a sessão ser descartada (a rota exige auth).
 *
 * Nunca lança e tem prazo curto (4 s, sem nova tentativa): o logout não pode
 * ficar preso numa rede ruim. Conta de cuidador nem chama (a rota é do idoso).
 * Fora do trpcMutation de propósito: ele tenta 3 vezes com 15 s cada e trata 401
 * como sessão expirada, e nada disso cabe num logout.
 */
export async function notifyDeviceSignedOut(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SIGNED_OUT_TIMEOUT_MS);
  try {
    const user = await Auth.getUserInfo();
    if (!user || user.userType === "caregiver") return;
    const headers = await buildAuthHeaders();
    if (!headers) return;
    const res = await fetch(`${getApiBaseUrl()}/api/trpc/monitoring.deviceSignedOut`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify({ json: {} }),
      signal: controller.signal,
    });
    if (!res.ok) console.warn(`[Monitoring] deviceSignedOut respondeu ${res.status}`);
  } catch (err) {
    console.warn("[Monitoring] deviceSignedOut falhou:", err instanceof Error ? err.name : typeof err);
  } finally {
    clearTimeout(timer);
  }
}

```

**3e.** `hooks/use-auth.ts`. Acrescentar o import depois de `import { unregisterDevicePushToken } from "@/lib/push-registration";`:

```ts
import { notifyDeviceSignedOut } from "@/lib/monitoring-service";
```

e trocar:

```ts
    await unregisterDevicePushToken();
    try {
      await Api.logout();
```

por:

```ts
    // O servidor pausa os avisos automáticos desta conta na hora: o idoso saiu
    // de propósito, e esperar dois dias sem sinal avisaria a família à toa.
    // Nunca lança e tem prazo curto; vem ANTES do resto porque a rota exige a
    // sessão que o logout está prestes a descartar.
    await notifyDeviceSignedOut();
    await unregisterDevicePushToken();
    try {
      await Api.logout();
```

- [ ] **Passo 3e: Parar o heartbeat antes de avisar o logout (correção de montagem do plano)**

**Por que:** o heartbeat só para quando `Auth.subscribeActiveUser` avisa que não há usuário, isto é, depois de `Auth.clearUserInfo()` — bem depois do `deviceSignedOut`. Um heartbeat do timer de 5 min (ou do AppState "active") que chegue ao servidor depois do aviso passa por `recordHeartbeat`, que limpa a pausa, e o "saiu da conta" é desfeito.

Em `tests/device-signed-out.test.ts`, acrescentar ao `describe("notifyDeviceSignedOut", …)`:

```ts
  it("para o heartbeat antes de avisar: nenhum heartbeat sai depois do deviceSignedOut", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ result: { data: { json: {} } } }) });
    const svc = await import("../lib/monitoring-service");

    svc.startHeartbeat();
    await vi.advanceTimersByTimeAsync(0);
    await svc.notifyDeviceSignedOut();
    const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
    const avisoEm = urls().findIndex((u) => u.endsWith("/monitoring.deviceSignedOut"));
    expect(avisoEm).toBeGreaterThanOrEqual(0);

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 1000);

    const depois = urls().slice(avisoEm + 1);
    expect(depois.some((u) => u.includes("/monitoring.heartbeat"))).toBe(false);
  });
```

Rodar `pnpm vitest run tests/device-signed-out.test.ts` e ver falhar (um `monitoring.heartbeat` depois do aviso).

Em `lib/monitoring-service.ts`:

1) Em `notifyDeviceSignedOut`, trocar

```ts
export async function notifyDeviceSignedOut(): Promise<void> {
  const controller = new AbortController();
```

por

```ts
export async function notifyDeviceSignedOut(): Promise<void> {
  // Primeiro para o heartbeat: um heartbeat que chegasse depois do aviso
  // retomaria a pausa no servidor (recordHeartbeat limpa a pausa).
  stopHeartbeat();
  const controller = new AbortController();
```

2) Em `sendHeartbeat`, trocar

```ts
    Platform.OS === "android" ? await isIgnoringBatteryOptimizations() : undefined;
  await trpcMutation("monitoring.heartbeat", {
```

por

```ts
    Platform.OS === "android" ? await isIgnoringBatteryOptimizations() : undefined;
  // Parado enquanto esperava o deviceId/bateria (ex.: logout): não envia.
  if (!heartbeatTimer) return;
  await trpcMutation("monitoring.heartbeat", {
```

(O envio imediato de `startHeartbeat` não é afetado: o timer é definido de forma síncrona logo depois de disparar o primeiro envio, antes de `getDeviceId` resolver.)

Rodar de novo `pnpm vitest run tests/device-signed-out.test.ts`: PASS. Resta uma corrida de milissegundos (heartbeat cujo HTTP já saiu antes do `stopHeartbeat`); fica registrada, sem código extra.

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/monitored-push-initializer.test.ts tests/cloud-sync-timezone.test.ts tests/device-signed-out.test.ts tests/logout-device-signed-out.test.ts tests/caregiver-push-initializer.test.ts`

Esperado: PASS.

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos).

```bash
git add components/monitored-push-initializer.tsx "app/(tabs)/_layout.tsx" lib/cloud-sync.ts lib/monitoring-service.ts hooks/use-auth.ts tests/monitored-push-initializer.test.ts tests/cloud-sync-timezone.test.ts tests/device-signed-out.test.ts tests/logout-device-signed-out.test.ts
git commit -m "feat(app): push do idoso (token, tipos de gerenciamento, toque), fuso no backup e aviso de logout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 14: Diálogo do pedido e cartão "X cuida dos seus alarmes" em Configurações

**Depende de:** Tarefas 12 e 13 (`requestManagedSync`, `onManagedSyncRequested`, `trpcQuery`/`trpcMutation`, `MineResponse`, `management` no estado, `MonitoredPushInitializer` já montado); Tarefa 6 (rotas `managedAlarms.mine`, `respond`, `stopBeingManaged`, só em tempo de execução).

**Files:**
- Create: `lib/managed-alarms-copy.ts` (textos da spec e regras puras: qual pedido mostrar, o que enviar no aceite)
- Create: `components/management-request-initializer.tsx` (o diálogo do pedido)
- Create: `components/managed-alarms-card.tsx` (o cartão de Configurações, nos dois modos)
- Modify: `app/(tabs)/_layout.tsx` (montar o `ManagementRequestInitializer`)
- Modify: `app/(tabs)/settings.tsx` (um import e duas linhas: o cartão nos dois ramos)
- Test: `tests/managed-alarms-copy.test.ts`, `tests/management-request-initializer.test.ts` (fonte), `tests/managed-alarms-card.test.ts` (fonte) (todos novos)

**Interfaces:**
- Consumes: `MineResponse`, `requestManagedSync`, `onManagedSyncRequested` (Tarefa 12); `trpcQuery`, `trpcMutation` (Tarefa 12); `useAppContext().state.management` e a ação `SET_MANAGEMENT` (Tarefa 12); rotas `managedAlarms.mine` (query), `managedAlarms.respond({ requestId, accept, alarms? })` e `managedAlarms.stopBeingManaged` (mutations), contrato da Parte B; `useAppLock().status` (`lib/app-lock-context.tsx`); `shouldResync` (`lib/resync-throttle.ts`).
- Produces:
  ```ts
  // lib/managed-alarms-copy.ts (puro, sem React Native)
  export const FALLBACK_CAREGIVER_NAME = 'Seu cuidador';
  export function caregiverLabel(name: string | null | undefined): string;       // início de frase
  export function caregiverMid(name: string | null | undefined): string;        // meio de frase ('seu cuidador' no fallback)
  export function requestDialogCopy(name): { title: string; message: string; acceptLabel: string; declineLabel: string };
  export function stopDialogCopy(name): { title: string; message: string; cancelLabel: string; confirmLabel: string };
  export function managementCardCopy(name): { title: string; subtitle: string; stopLabel: string };
  export function acceptedToastText(name): string;
  export const STOPPED_TOAST_TEXT: string;
  export type AcceptedAlarm = Omit<Alarm, 'notificationId' | 'nativeAlarmUids'>;
  export function alarmsForAccept(alarms: Alarm[]): AcceptedAlarm[];
  export function pickRequestToShow(args: { pending: { id: number } | null; shownIds: ReadonlySet<number>; blocked: boolean }): number | null;
  // components/management-request-initializer.tsx
  export function ManagementRequestInitializer(): JSX.Element;
  // components/managed-alarms-card.tsx
  export function ManagedAlarmsCard(): JSX.Element;     // não mostra nada sem acordo ativo
  ```

### Regras de desenho desta tarefa

**Fechar o diálogo sem escolher NÃO é recusar.** O `AppDialog` chama `btn.onPress()` e depois `onDismiss()` quando um **botão** é tocado, mas toque no fundo, botão "voltar" do Android e `onRequestClose` chamam **só** `onDismiss` (`components/app-dialog.tsx`). Portanto: a resposta ao servidor mora **apenas** dentro do `onPress` dos dois botões; o componente **não passa `onDismiss` próprio** ao `AppDialog` (usa o `hideDialog` do hook, que só esconde). O pedido continua `pending` no servidor e volta na próxima abertura do app: o id do pedido fica numa lista "já mostrado nesta abertura" que é **zerada quando o app vai para segundo plano** e quando o idoso toca na notificação do pedido.

**Quando o diálogo não pode aparecer:** com o bloqueio de PIN ativo (o `Modal` é uma janela nativa e apareceria por cima da tela de PIN, deixando aceitar sem desbloquear) e na tela do alarme tocando (`/alarm-ring`: o diálogo cobriria o botão de desligar; "a tela do alarme tocando não muda", spec 6.2). Ao desbloquear ou sair do alarme, a checagem roda de novo.

**Falha de rede ao responder** (o helper devolve `null`): mostra um `AppDialog` de erro e **tira o id da lista de já mostrados**, para o pedido voltar na próxima abertura. Nunca some em silêncio.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/managed-alarms-copy.test.ts`:

```ts
/**
 * Textos do pedido de gerenciamento (spec 3.2 e 3.4, palavra por palavra) e as
 * regras puras de quando mostrar o diálogo e o que enviar ao aceitar.
 */
import { describe, expect, it } from "vitest";
import {
  acceptedToastText,
  alarmsForAccept,
  caregiverLabel,
  caregiverMid,
  managementCardCopy,
  pickRequestToShow,
  requestDialogCopy,
  stopDialogCopy,
  STOPPED_TOAST_TEXT,
} from "../lib/managed-alarms-copy";
import type { Alarm } from "../lib/app-context";

describe("diálogo do pedido (spec 3.2)", () => {
  it("usa os textos da spec", () => {
    const c = requestDialogCopy("Ana");
    expect(c.title).toBe("Ana quer cuidar dos seus alarmes");
    expect(c.message).toBe(
      "Ana vai poder criar, mudar e apagar os seus remédios e check-ins. Você vai continuar vendo e respondendo, mas não vai conseguir apagar nem desligar. Você pode parar quando quiser em Configurações."
    );
    expect(c.acceptLabel).toBe("Deixar Ana cuidar");
    expect(c.declineLabel).toBe("Agora não");
  });

  it("sem nome, cai em 'Seu cuidador' no começo da frase e 'seu cuidador' no meio", () => {
    for (const vazio of ["", "   ", null, undefined]) {
      expect(caregiverLabel(vazio)).toBe("Seu cuidador");
      expect(caregiverMid(vazio)).toBe("seu cuidador");
      expect(requestDialogCopy(vazio).acceptLabel).toBe("Deixar seu cuidador cuidar");
      expect(requestDialogCopy(vazio).title).toBe("Seu cuidador quer cuidar dos seus alarmes");
    }
    expect(caregiverMid("Ana")).toBe("Ana");
  });
});

describe("parar o gerenciamento (spec 3.4) e cartão de Configurações", () => {
  it("confirma antes de parar e avisa que o cuidador será avisado", () => {
    const c = stopDialogCopy("Ana");
    expect(c.title).toBe("Parar?");
    expect(c.message).toBe("Ana será avisado. Você volta a cuidar dos seus alarmes.");
    expect(c.cancelLabel).toBe("Cancelar");
    expect(c.confirmLabel).toBe("Parar");
  });

  it("o cartão tem o título da spec e o botão Parar", () => {
    const c = managementCardCopy("Ana");
    expect(c.title).toBe("Ana cuida dos seus alarmes");
    expect(c.stopLabel).toBe("Parar");
    expect(c.subtitle).toContain("Você continua vendo e respondendo");
  });

  it("toasts de confirmação", () => {
    expect(acceptedToastText("Ana")).toBe("Ana agora cuida dos seus alarmes.");
    expect(STOPPED_TOAST_TEXT).toBe("Pronto. Você voltou a cuidar dos seus alarmes.");
  });
});

describe("alarmsForAccept: o que vai ao servidor no aceite", () => {
  const alarm = (over: Partial<Alarm> = {}): Alarm => ({
    id: "a1",
    time: "08:00",
    description: "Losartana",
    enabled: true,
    repeat: "daily",
    sound: true,
    vibration: true,
    notificationId: "n1",
    nativeAlarmUids: ["vigora_a1"],
    ...over,
  });

  it("tira notificationId e nativeAlarmUids e mantém o resto, inclusive check-in", () => {
    const checkin = alarm({ id: "c1", kind: "checkin", escalateAfterMinutes: 15, time: "09:00" });
    const lista = alarmsForAccept([alarm(), checkin]);
    expect(lista).toHaveLength(2);
    for (const a of lista) {
      expect("notificationId" in a).toBe(false);
      expect("nativeAlarmUids" in a).toBe(false);
    }
    expect(lista[1]).toMatchObject({ id: "c1", kind: "checkin", escalateAfterMinutes: 15 });
  });

  it("lista vazia continua vazia (aceitar sem nenhum alarme é válido)", () => {
    expect(alarmsForAccept([])).toEqual([]);
  });
});

describe("pickRequestToShow: quando o diálogo aparece", () => {
  const pend = { id: 7 };

  it("pedido pendente e livre: mostra", () => {
    expect(pickRequestToShow({ pending: pend, shownIds: new Set(), blocked: false })).toBe(7);
  });

  it("sem pedido: não mostra", () => {
    expect(pickRequestToShow({ pending: null, shownIds: new Set(), blocked: false })).toBeNull();
  });

  it("já mostrado nesta abertura (idoso fechou tocando fora): não mostra de novo", () => {
    expect(pickRequestToShow({ pending: pend, shownIds: new Set([7]), blocked: false })).toBeNull();
  });

  it("outro pedido (id diferente) volta a aparecer", () => {
    expect(pickRequestToShow({ pending: { id: 8 }, shownIds: new Set([7]), blocked: false })).toBe(8);
  });

  it("bloqueio de PIN ou tela do alarme: não mostra", () => {
    expect(pickRequestToShow({ pending: pend, shownIds: new Set(), blocked: true })).toBeNull();
  });
});
```

Criar `tests/management-request-initializer.test.ts`:

```ts
/**
 * O diálogo do pedido: fechar sem escolher NÃO pode contar como recusa. O
 * componente não é importável no vitest (RN): trava no fonte onde mora cada
 * resposta ao servidor.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const src = read("components/management-request-initializer.tsx");

describe("ManagementRequestInitializer: recusa só pelo botão", () => {
  it("a recusa mora num único lugar: o onPress do botão 'Agora não'", () => {
    expect((src.match(/accept: false/g) ?? []).length).toBe(1);
    expect((src.match(/answer\(id, false/g) ?? []).length).toBe(1);
    expect(src).toMatch(
      /text: copy\.declineLabel, style: 'cancel', onPress: \(\) => void answer\(id, false, name\)/
    );
  });

  it("o AppDialog usa o onDismiss do hook (só esconde): nenhum onDismiss próprio", () => {
    expect(src).toMatch(/<AppDialog \{\.\.\.dialogProps\} \/>/);
    expect(src).not.toMatch(/onDismiss=/);
  });

  it("o aceite envia a lista atual sem os ids do sistema, e depois pede a busca da lista", () => {
    expect(src).toMatch(/accept: true, alarms: alarmsForAccept\(stateRef\.current\.alarms\)/);
    expect(src).toMatch(/requestManagedSync\(\)/);
  });

  it("o que foi fechado sem escolher reaparece na próxima abertura", () => {
    expect(src).toMatch(/if \(next === 'background'\) shownRef\.current\.clear\(\);/);
    expect(src).toMatch(/shownRef\.current\.clear\(\);\s*void check\(\);/); // toque na notificação
  });

  it("falha ao responder avisa e devolve o pedido para a próxima abertura", () => {
    expect(src).toMatch(/if \(result === null\) \{\s*shownRef\.current\.delete\(requestId\);/);
    expect(src).toMatch(/variant: 'error'/);
  });

  it("não aparece sobre o PIN nem sobre a tela do alarme", () => {
    expect(src).toMatch(/lockStatus !== 'unlocked'/);
    expect(src).toMatch(/startsWith\('\/alarm-ring'\)/);
  });

  it("conta de cuidador nunca consulta o pedido", () => {
    expect(src).toMatch(/userType === 'caregiver'/);
  });

  it("usa AppDialog/AppToast, nunca Alert.alert", () => {
    expect(src).not.toMatch(/Alert\.alert/);
    expect(src).toMatch(/useAppToast\(\)/);
  });
});

describe("montagem", () => {
  it("o layout do idoso monta o ManagementRequestInitializer", () => {
    const layout = read("app/(tabs)/_layout.tsx");
    expect(layout).toMatch(
      /import \{ ManagementRequestInitializer \} from "@\/components\/management-request-initializer";/
    );
    expect(layout).toMatch(/<ManagementRequestInitializer \/>/);
  });
});
```

Criar `tests/managed-alarms-card.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const card = read("components/managed-alarms-card.tsx");
const settings = read("app/(tabs)/settings.tsx");

describe("ManagedAlarmsCard", () => {
  it("existe versão para o modo acessível, com alvo de toque grande", () => {
    expect(card).toContain("useAccessibility");
    expect(card).toMatch(/isAccessibilityMode \? \(/);
    expect(card).toMatch(/minHeight: as_\.touchTarget/);
    expect(card).toMatch(/minHeight: fs\.touch\(44\)/);
  });

  it("só aparece com acordo ativo", () => {
    expect(card).toMatch(/const management = state\.management;/);
    expect(card).toMatch(/\{management \? \(/);
  });

  it("parar pede confirmação e só limpa o acordo local depois que o servidor aceitou", () => {
    expect(card).toMatch(/variant: 'confirm'/);
    expect(card).toMatch(/style: 'destructive'/);
    const parar = card.slice(card.indexOf("managedAlarms.stopBeingManaged"));
    const falha = parar.indexOf("result === null");
    const limpa = parar.indexOf("type: 'SET_MANAGEMENT', payload: null");
    expect(falha).toBeGreaterThan(-1);
    expect(limpa).toBeGreaterThan(falha);
  });

  it("não usa Alert.alert nem cor fixa", () => {
    expect(card).not.toMatch(/Alert\.alert/);
    expect(card).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});

describe("Configurações", () => {
  it("o cartão aparece nos dois modos (normal e acessível)", () => {
    expect(settings).toMatch(/import \{ ManagedAlarmsCard \} from '@\/components\/managed-alarms-card';/);
    expect((settings.match(/<ManagedAlarmsCard \/>/g) ?? []).length).toBe(2);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarms-copy.test.ts tests/management-request-initializer.test.ts tests/managed-alarms-card.test.ts`

Esperado: FAIL (`Failed to resolve import "../lib/managed-alarms-copy"`; `ENOENT` nos dois componentes).

- [ ] **Passo 3: Implementar**

**3a.** Criar `lib/managed-alarms-copy.ts`:

```ts
/**
 * managed-alarms-copy.ts
 *
 * Textos do modo gerenciado do lado do idoso (spec 3.2, 3.4 e 6.2) e as regras
 * puras de quando mostrar o diálogo do pedido e o que enviar ao aceitar. Sem
 * React Native: tudo aqui é testável no vitest.
 */
import type { Alarm } from './app-context';

export const FALLBACK_CAREGIVER_NAME = 'Seu cuidador';

/** Nome para começo de frase. Sem nome (o servidor manda 'Seu cuidador'), usa o fallback. */
export function caregiverLabel(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed || FALLBACK_CAREGIVER_NAME;
}

/** Nome para meio de frase: "Deixar Ana cuidar" / "Deixar seu cuidador cuidar". */
export function caregiverMid(name: string | null | undefined): string {
  const label = caregiverLabel(name);
  return label === FALLBACK_CAREGIVER_NAME ? 'seu cuidador' : label;
}

export function requestDialogCopy(name: string | null | undefined) {
  const label = caregiverLabel(name);
  return {
    title: `${label} quer cuidar dos seus alarmes`,
    message: `${label} vai poder criar, mudar e apagar os seus remédios e check-ins. Você vai continuar vendo e respondendo, mas não vai conseguir apagar nem desligar. Você pode parar quando quiser em Configurações.`,
    acceptLabel: `Deixar ${caregiverMid(name)} cuidar`,
    declineLabel: 'Agora não',
  };
}

export function stopDialogCopy(name: string | null | undefined) {
  return {
    title: 'Parar?',
    message: `${caregiverLabel(name)} será avisado. Você volta a cuidar dos seus alarmes.`,
    cancelLabel: 'Cancelar',
    confirmLabel: 'Parar',
  };
}

export function managementCardCopy(name: string | null | undefined) {
  const label = caregiverLabel(name);
  return {
    title: `${label} cuida dos seus alarmes`,
    subtitle: `${label} pode criar e mudar os seus remédios e check-ins. Você continua vendo e respondendo.`,
    stopLabel: 'Parar',
  };
}

export function acceptedToastText(name: string | null | undefined): string {
  return `${caregiverLabel(name)} agora cuida dos seus alarmes.`;
}

export const STOPPED_TOAST_TEXT = 'Pronto. Você voltou a cuidar dos seus alarmes.';

/** O que o aceite envia ao servidor: a lista atual, sem os ids do sistema. */
export type AcceptedAlarm = Omit<Alarm, 'notificationId' | 'nativeAlarmUids'>;

export function alarmsForAccept(alarms: Alarm[]): AcceptedAlarm[] {
  return alarms.map(({ notificationId: _notificationId, nativeAlarmUids: _nativeAlarmUids, ...rest }) => rest);
}

/**
 * Qual pedido o diálogo deve mostrar agora (ou null). O id fica em `shownIds`
 * depois de aparecer uma vez NESTA abertura do app: fechar o diálogo sem
 * escolher não o recusa, só o adia para a próxima abertura (a lista é zerada
 * quando o app vai para segundo plano).
 */
export function pickRequestToShow(args: {
  pending: { id: number } | null;
  shownIds: ReadonlySet<number>;
  blocked: boolean;
}): number | null {
  if (args.blocked || !args.pending) return null;
  return args.shownIds.has(args.pending.id) ? null : args.pending.id;
}
```

**3b.** Criar `components/management-request-initializer.tsx`:

```tsx
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
```

**3c.** Criar `components/managed-alarms-card.tsx`:

```tsx
/**
 * managed-alarms-card.tsx
 *
 * Cartão de Configurações do idoso: "[Nome] cuida dos seus alarmes" com o botão
 * "Parar" (spec 3.4 e 6.2). Só aparece com um acordo ativo. Duas versões: normal
 * e modo acessível (fonte e alvo de toque maiores).
 */
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
import { useAppContext } from '@/lib/app-context';
import { useFontSize } from '@/lib/font-size-context';
import { managementCardCopy, STOPPED_TOAST_TEXT, stopDialogCopy } from '@/lib/managed-alarms-copy';
import { trpcMutation } from '@/lib/monitoring-service';

export function ManagedAlarmsCard() {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const { state, dispatch } = useAppContext();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const [busy, setBusy] = useState(false);

  const management = state.management;
  const name = management?.caregiverName;

  const stop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // trpcMutation devolve null em toda falha e nunca lança.
      const result = await trpcMutation('managedAlarms.stopBeingManaged', {});
      if (result === null) {
        showDialog({
          title: 'Não foi possível parar',
          message: 'Confira a internet e tente de novo. Por enquanto, quem cuida dos seus alarmes continua o mesmo.',
          variant: 'error',
          buttons: [{ text: 'Entendi' }],
        });
        return;
      }
      dispatch({ type: 'SET_MANAGEMENT', payload: null });
      showToast({ message: STOPPED_TOAST_TEXT, variant: 'success' });
    } finally {
      setBusy(false);
    }
  };

  const confirmStop = () => {
    const copy = stopDialogCopy(name);
    showDialog({
      title: copy.title,
      message: copy.message,
      variant: 'confirm',
      buttons: [
        { text: copy.cancelLabel, style: 'cancel' },
        { text: copy.confirmLabel, style: 'destructive', onPress: () => void stop() },
      ],
    });
  };

  const copy = managementCardCopy(name);

  return (
    <>
      {management ? (
        isAccessibilityMode ? (
          <View
            style={{
              backgroundColor: ac.surface,
              borderRadius: 20,
              borderWidth: 2,
              borderColor: ac.border,
              padding: 20,
              gap: 14,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <MaterialIcons name="supervisor-account" size={36} color={ac.primary} />
              <Text style={{ flex: 1, fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>{copy.title}</Text>
            </View>
            <Text style={{ fontSize: af.md, color: ac.muted, lineHeight: af.md * 1.4 }}>{copy.subtitle}</Text>
            <Pressable
              onPress={confirmStop}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={copy.stopLabel}
              style={({ pressed }) => [
                {
                  minHeight: as_.touchTarget,
                  borderRadius: 16,
                  borderWidth: 3,
                  borderColor: ac.primary,
                  backgroundColor: ac.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed || busy ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.primary }}>{copy.stopLabel}</Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: colors.primary,
              padding: 16,
              gap: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: colors.primaryLight,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialIcons name="supervisor-account" size={24} color={colors.primary} />
              </View>
              <Text
                style={{ flex: 1, fontSize: fs.md, fontWeight: '800', color: colors.foreground, fontFamily: BrandFonts.body }}
              >
                {copy.title}
              </Text>
            </View>
            <Text style={{ fontSize: fs.sm, color: colors.muted, lineHeight: fs.scaled(20) }}>{copy.subtitle}</Text>
            <Pressable
              onPress={confirmStop}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={copy.stopLabel}
              style={({ pressed }) => [
                {
                  minHeight: fs.touch(44),
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: colors.primary,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed || busy ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: fs.base, fontWeight: '700', color: colors.primary, fontFamily: BrandFonts.body }}>
                {copy.stopLabel}
              </Text>
            </Pressable>
          </View>
        )
      ) : null}
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </>
  );
}
```

**3d.** `app/(tabs)/_layout.tsx`: depois do import de `MonitoredPushInitializer`, acrescentar:

```tsx
import { ManagementRequestInitializer } from "@/components/management-request-initializer";
```

e trocar:

```tsx
      <MonitoredPushInitializer />
      <MicFab bottomOffset={86} />
```

por:

```tsx
      <MonitoredPushInitializer />
      <ManagementRequestInitializer />
      <MicFab bottomOffset={86} />
```

**3e.** `app/(tabs)/settings.tsx`. Depois de `import { MonitoringStatusPanel } from '@/components/monitoring-status-panel';`, acrescentar:

```tsx
import { ManagedAlarmsCard } from '@/components/managed-alarms-card';
```

No ramo acessível, trocar:

```tsx
          <MonitoringStatusPanel accessible={true} />
```

por:

```tsx
          <MonitoringStatusPanel accessible={true} />

          {/* Quem cuida dos seus alarmes: só aparece com um acordo ativo */}
          <ManagedAlarmsCard />
```

No ramo normal, trocar:

```tsx
        <MonitoringStatusPanel accessible={false} />
```

por:

```tsx
        <MonitoringStatusPanel accessible={false} />

        {/* Quem cuida dos seus alarmes: só aparece com um acordo ativo */}
        <ManagedAlarmsCard />
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarms-copy.test.ts tests/management-request-initializer.test.ts tests/managed-alarms-card.test.ts tests/ui-modo-acessivel.test.ts tests/ui-cores-token.test.ts tests/ui-font-minimum.test.ts tests/config-removidas.test.ts tests/notifications-switch-removed.test.ts`

Esperado: PASS (os quatro últimos são regras de UI do repositório que varrem os arquivos de `components/` e `app/` e a tela de Configurações).

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos).

```bash
git add lib/managed-alarms-copy.ts components/management-request-initializer.tsx components/managed-alarms-card.tsx "app/(tabs)/_layout.tsx" "app/(tabs)/settings.tsx" tests/managed-alarms-copy.test.ts tests/management-request-initializer.test.ts tests/managed-alarms-card.test.ts
git commit -m "feat(app): diálogo do pedido de gerenciamento (fechar não recusa) e cartão em Configurações nos dois modos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```


---

## Tarefa 15: Listas de Remédios e Check-in só leitura quando outra pessoa cuida dos alarmes

**Depende de:** Tarefa 12 (`state.management` e `ManagementInfo` em `lib/app-context.tsx`); Tarefa 14 (`caregiverMid` em `lib/managed-alarms-copy.ts`; é ela que cria o `management` que liga o modo só leitura).

**Files:**
- Create: `lib/alarm-details.ts` (aviso do topo, detalhes de um alarme e resumo da repetição; puro, sem React Native)
- Modify: `components/alarm-card.tsx` (`onToggle` opcional; sem ele o card não tem interruptor)
- Modify: `components/alarm-list-screen.tsx` (modo só leitura nos DOIS modos de tela: aviso, sem Adicionar, sem interruptor, detalhes ao tocar)
- Test: `tests/alarm-details.test.ts`, `tests/alarm-list-read-only.test.ts` (ambos novos)

**Interfaces:**
- Consumes: `useAppContext().state.management` (`ManagementInfo | null`, Tarefa 12); `caregiverMid(name)` (Tarefa 14); `REPEAT_OPTIONS` (`lib/alarm-form.ts`); `DEFAULT_ESCALATE_MINUTES` (`lib/alarm-kind.ts`).
- Produces:
  ```ts
  // lib/alarm-details.ts
  export const READ_ONLY_EMPTY_TEXT: string;
  export function readOnlyBannerText(name: string | null | undefined): string;   // "Quem cuida dos seus alarmes é Ana" / "... é seu cuidador"
  export function repeatSummary(alarm: Pick<Alarm, 'repeat' | 'customDays'>): string;
  export function alarmDetailsCopy(alarm: Alarm): { title: string; message: string; closeLabel: string };
  // components/alarm-card.tsx: AlarmCardProps.onToggle passa a ser `onToggle?: (alarm: Alarm) => void`
  ```

### Regras de desenho desta tarefa (leia antes de codar)

**Só `AlarmListScreen` escreve alarmes por ação do idoso.** Conferido no código: `ADD_ALARM`/`UPDATE_ALARM`/`DELETE_ALARM` só são despachados por `alarm-list-screen.tsx`, pelo reparo de agendamento (`alarm-sync-initializer.tsx`) e pela migração única do check-in (`checkin-migration-initializer.tsx`); os dois últimos não são edição do idoso e não mudam. `AlarmCard` só é usado em `alarm-list-screen.tsx`. Por isso fechar a edição nessas duas telas basta.

**Excluir e ligar/desligar** só existem dentro do `AlarmFormModal` (excluir) e no interruptor do card. Em modo só leitura o modal nunca abre (o `openEditModal` desvia para os detalhes) e o card normal não recebe `onToggle`; o modo acessível já não tem interruptor.

**O que continua:** o card "PRÓXIMO", o histórico e o botão "Testar" (abre a tela do alarme tocando em modo de teste; a spec não manda tirá-lo e "a tela do alarme tocando não muda").

**O arquivo é CRLF na árvore de trabalho** (`core.autocrlf=true`): aplique os trechos com a ferramenta Edit, que casa as quebras de linha sozinha. Cada "Trocar" abaixo foi conferido como único no arquivo atual.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/alarm-details.test.ts`:

```ts
/**
 * Textos das listas só leitura (spec 6.2): o aviso no topo e os detalhes de um
 * alarme quando outra pessoa cuida dos alarmes.
 */
import { describe, expect, it } from "vitest";
import {
  alarmDetailsCopy,
  READ_ONLY_EMPTY_TEXT,
  readOnlyBannerText,
  repeatSummary,
} from "../lib/alarm-details";
import type { Alarm } from "../lib/app-context";

const alarm = (over: Partial<Alarm> = {}): Alarm => ({
  id: "a1",
  time: "08:00",
  description: "Losartana",
  enabled: true,
  repeat: "daily",
  sound: true,
  vibration: true,
  ...over,
});

describe("aviso no topo", () => {
  it("usa o texto da spec com o nome de quem cuida", () => {
    expect(readOnlyBannerText("Ana")).toBe("Quem cuida dos seus alarmes é Ana");
  });

  it("sem nome, diz 'seu cuidador' (nunca 'Seu cuidador' no meio da frase)", () => {
    expect(readOnlyBannerText("")).toBe("Quem cuida dos seus alarmes é seu cuidador");
    expect(readOnlyBannerText(null)).toBe("Quem cuida dos seus alarmes é seu cuidador");
    expect(readOnlyBannerText(undefined)).toBe("Quem cuida dos seus alarmes é seu cuidador");
  });

  it("a lista vazia não manda o idoso adicionar", () => {
    expect(READ_ONLY_EMPTY_TEXT).not.toMatch(/Adicione|Toque no botão/);
    expect(READ_ONLY_EMPTY_TEXT).toContain("Quem cuida dos seus alarmes pode adicionar");
  });
});

describe("repeatSummary", () => {
  it("repetições fixas usam os rótulos do formulário", () => {
    expect(repeatSummary(alarm({ repeat: "daily" }))).toBe("Diário");
    expect(repeatSummary(alarm({ repeat: "weekdays" }))).toBe("Dias úteis");
    expect(repeatSummary(alarm({ repeat: "weekends" }))).toBe("Fins de semana");
  });

  it("personalizado lista os dias em ordem (0 = domingo)", () => {
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [3, 1, 0] }))).toBe("Dom, Seg, Qua");
  });

  it("personalizado com todos os dias, nenhum dia ou dia inválido", () => {
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [0, 1, 2, 3, 4, 5, 6] }))).toBe("Todos os dias");
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [] }))).toBe("Personalizado");
    expect(repeatSummary(alarm({ repeat: "custom" }))).toBe("Personalizado");
    expect(repeatSummary(alarm({ repeat: "custom", customDays: [9, 2, 2] }))).toBe("Ter");
  });
});

describe("alarmDetailsCopy", () => {
  it("remédio: horário no título; nome, repetição e situação na mensagem", () => {
    const d = alarmDetailsCopy(alarm({ repeat: "weekdays" }));
    expect(d.title).toBe("08:00");
    expect(d.message).toBe("Nome: Losartana\nRepetição: Dias úteis\nSituação: Ligado");
    expect(d.closeLabel).toBe("Fechar");
  });

  it("remédio desligado e sem nome", () => {
    const d = alarmDetailsCopy(alarm({ enabled: false, description: "   " }));
    expect(d.message).toContain("Nome: Sem descrição");
    expect(d.message).toContain("Situação: Desligado");
  });

  it("check-in: nome fixo e aviso em N minutos", () => {
    const d = alarmDetailsCopy(
      alarm({ kind: "checkin", description: "Check-in", time: "09:00", escalateAfterMinutes: 15 })
    );
    expect(d.title).toBe("09:00");
    expect(d.message).toContain("Nome: Check-in");
    expect(d.message).toContain("Avisa seus contatos após 15 min sem resposta");
  });

  it("check-in sem o atraso gravado usa o padrão", () => {
    const d = alarmDetailsCopy(alarm({ kind: "checkin" }));
    expect(d.message).toContain("Avisa seus contatos após 5 min sem resposta");
  });
});
```

Criar `tests/alarm-list-read-only.test.ts`:

```ts
/**
 * Listas de Remédios e Check-in com um acordo ativo (spec 6.2): só leitura, nos
 * dois modos. As telas não são importáveis no vitest (React Native), então o
 * teste trava no fonte onde mora cada regra.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const list = read("components/alarm-list-screen.tsx");
const card = read("components/alarm-card.tsx");

describe("AlarmListScreen só leitura", () => {
  it("o modo vem do acordo guardado no estado", () => {
    expect(list).toMatch(/const management = state\.management;/);
    expect(list).toMatch(/const readOnly = !!management;/);
  });

  it("o aviso 'Quem cuida dos seus alarmes é ...' aparece nos dois modos", () => {
    expect(list).toMatch(/const bannerText = readOnlyBannerText\(management\?\.caregiverName\);/);
    expect((list.match(/\{bannerText\}/g) ?? []).length).toBe(2);
    expect(list).toMatch(/\{readOnly && \(\s*<View style=\{\{[^}]*marginHorizontal: 12/); // acessível
    expect(list).toMatch(/\{readOnly && \(\s*<View style=\{\[styles\.managedBanner/); // normal
  });

  it("'Adicionar' some nos dois modos e a função também não abre o formulário", () => {
    expect(list).toMatch(/\{!readOnly && \(\s*<View style=\{\{\s*paddingHorizontal: 16,/); // acessível
    expect(list).toMatch(/\{!readOnly && \(\s*<View style=\{\[styles\.addBtnContainer/); // normal
    expect(list).toMatch(/const openAddModal = \(\) => \{\s*if \(readOnly\) return;/);
  });

  it("o interruptor some: o card normal não recebe onToggle", () => {
    expect(list).toMatch(/onToggle=\{readOnly \? undefined : handleToggle\}/);
  });

  it("tocar num alarme abre os detalhes, nunca o formulário (isso cobre o atalho ?alarmId=)", () => {
    expect(list).toMatch(
      /const openEditModal = \(alarm: Alarm\) => \{\s*if \(readOnly\) \{\s*showDetails\(alarm\);\s*return;\s*\}\s*setEditingAlarm\(alarm\);/
    );
    expect(list).toMatch(/const details = alarmDetailsCopy\(alarm\);/);
    expect(list).toMatch(/buttons: \[\{ text: details\.closeLabel \}\]/);
  });

  it("o botão do card acessível vira 'Ver detalhes'", () => {
    expect(list).toMatch(/\{readOnly \? 'Ver detalhes' : 'Editar'\}/);
  });

  it("o formulário que estava aberto fecha quando o acordo começa (excluir só existe lá dentro)", () => {
    expect(list).toMatch(/useEffect\(\(\) => \{\s*if \(readOnly\) setModalVisible\(false\);\s*\}, \[readOnly\]\);/);
  });

  it("a lista vazia não pede para adicionar", () => {
    expect((list.match(/readOnly \? READ_ONLY_EMPTY_TEXT/g) ?? []).length).toBe(2);
  });

  it("sem cor fixa e sem Alert.alert", () => {
    expect(list).not.toMatch(/Alert\.alert/);
    expect(list).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});

describe("AlarmCard com onToggle opcional", () => {
  it("o tipo aceita ficar sem onToggle", () => {
    expect(card).toMatch(/onToggle\?: \(alarm: Alarm\) => void;/);
  });

  it("o interruptor só existe quando há onToggle; sem ele é só um selo", () => {
    expect(card).toMatch(/\{onToggle \? \(\s*<Pressable/);
    expect((card.match(/onToggle\(alarm\)/g) ?? []).length).toBe(1);
    expect(card).toMatch(/accessibilityLabel=\{alarm\.enabled \? 'Lembrete ativo' : 'Lembrete inativo'\}/);
  });

  it("o texto de ajuda muda para 'Toque para ver'", () => {
    expect(card).toMatch(/\{onToggle \? 'Toque para editar' : 'Toque para ver'\}/);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/alarm-details.test.ts tests/alarm-list-read-only.test.ts`

Esperado: FAIL (`Failed to resolve import "../lib/alarm-details"`; no segundo arquivo, `expected ... to match` nas regras de `readOnly`).

- [ ] **Passo 3: Implementar**

**3a.** Criar `lib/alarm-details.ts`:

```ts
/**
 * alarm-details.ts
 *
 * Textos das listas de alarmes quando outra pessoa cuida deles (Fase 4, spec
 * 6.2): o aviso no topo e os detalhes de um alarme, sem edição. Sem React Native:
 * tudo aqui é testável no vitest.
 */
import { REPEAT_OPTIONS } from '@/lib/alarm-form';
import { DEFAULT_ESCALATE_MINUTES } from '@/lib/alarm-kind';
import type { Alarm } from '@/lib/app-context';
import { caregiverMid } from '@/lib/managed-alarms-copy';

/** Dias da semana na convenção do app: 0 = domingo (a mesma do getDay() do JS). */
const DAY_ABBR = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const READ_ONLY_EMPTY_TEXT = 'Ainda não há nenhum aqui. Quem cuida dos seus alarmes pode adicionar.';

/** "Quem cuida dos seus alarmes é Ana" (ou "... é seu cuidador" quando o nome não veio). */
export function readOnlyBannerText(name: string | null | undefined): string {
  return `Quem cuida dos seus alarmes é ${caregiverMid(name)}`;
}

/** "Diário", "Dias úteis", "Fins de semana" ou os dias escolhidos ("Seg, Qua"). */
export function repeatSummary(alarm: Pick<Alarm, 'repeat' | 'customDays'>): string {
  if (alarm.repeat !== 'custom') {
    return REPEAT_OPTIONS.find((o) => o.value === alarm.repeat)?.label ?? 'Personalizado';
  }
  const days = [...new Set(alarm.customDays ?? [])].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (days.length === 0) return 'Personalizado';
  if (days.length === 7) return 'Todos os dias';
  return days.map((d) => DAY_ABBR[d]).join(', ');
}

/** O que o diálogo de detalhes mostra: horário, nome, repetição e se está ligado. */
export function alarmDetailsCopy(alarm: Alarm): { title: string; message: string; closeLabel: string } {
  const isCheckin = alarm.kind === 'checkin';
  const name = isCheckin ? 'Check-in' : alarm.description.trim() || 'Sem descrição';
  const lines = [
    `Nome: ${name}`,
    `Repetição: ${repeatSummary(alarm)}`,
    `Situação: ${alarm.enabled ? 'Ligado' : 'Desligado'}`,
  ];
  if (isCheckin) {
    lines.push(`Avisa seus contatos após ${alarm.escalateAfterMinutes ?? DEFAULT_ESCALATE_MINUTES} min sem resposta`);
  }
  return { title: alarm.time, message: lines.join('\n'), closeLabel: 'Fechar' };
}
```

**3b.** `components/alarm-card.tsx` (três trocas):

**1.** No tipo das props, `onToggle` passa a ser opcional:

Trocar:

```tsx
  onEdit: (alarm: Alarm) => void;
  onToggle: (alarm: Alarm) => void;
  onTest: (alarm: Alarm) => void;
```

por:

```tsx
  onEdit: (alarm: Alarm) => void;
  /** Sem isto o card não tem interruptor: lista só leitura, quando outra pessoa cuida dos alarmes. */
  onToggle?: (alarm: Alarm) => void;
  onTest: (alarm: Alarm) => void;
```

**2.** O rótulo de acessibilidade do card diz o que o toque faz:

Trocar:

```tsx
      accessibilityLabel={`Lembrete ${alarm.time}${alarm.description ? ', ' + alarm.description : ''}. Toque para editar.`}
```

por:

```tsx
      accessibilityLabel={`Lembrete ${alarm.time}${alarm.description ? ', ' + alarm.description : ''}. ${onToggle ? 'Toque para editar.' : 'Toque para ver os detalhes.'}`}
```

**3.** O interruptor só existe quando há `onToggle`; sem ele o card mostra um selo ("Ativo"/"Inativo") que não responde ao toque, e o aviso do rodapé vira "Toque para ver":

Trocar:

```tsx
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onToggle(alarm); }}
          style={({ pressed }) => [
            styles.toggleBtn,
            { backgroundColor: colors.background, borderColor: colors.border, minHeight: fs.touch(36) },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="switch"
          accessibilityLabel={alarm.enabled ? 'Desativar lembrete' : 'Ativar lembrete'}
          accessibilityState={{ checked: alarm.enabled }}
        >
          <MaterialIcons
            name={alarm.enabled ? 'notifications-active' : 'notifications-off'}
            size={18}
            color={alarm.enabled ? colors.primary : colors.muted}
          />
          <Text style={[styles.toggleBtnText, { color: alarm.enabled ? colors.primary : colors.muted, fontSize: fs.sm }]}>
            {alarm.enabled ? 'Ativo' : 'Inativo'}
          </Text>
        </Pressable>

        <View style={[styles.editHint, { borderColor: colors.border }]}>
          <MaterialIcons name="edit" size={15} color={colors.muted} />
          <Text style={[styles.editHintText, { color: colors.muted, fontSize: fs.sm }]}>Toque para editar</Text>
        </View>
```

por:

```tsx
        {onToggle ? (
          <Pressable
            onPress={(e) => { e.stopPropagation?.(); onToggle(alarm); }}
            style={({ pressed }) => [
              styles.toggleBtn,
              { backgroundColor: colors.background, borderColor: colors.border, minHeight: fs.touch(36) },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="switch"
            accessibilityLabel={alarm.enabled ? 'Desativar lembrete' : 'Ativar lembrete'}
            accessibilityState={{ checked: alarm.enabled }}
          >
            <MaterialIcons
              name={alarm.enabled ? 'notifications-active' : 'notifications-off'}
              size={18}
              color={alarm.enabled ? colors.primary : colors.muted}
            />
            <Text style={[styles.toggleBtnText, { color: alarm.enabled ? colors.primary : colors.muted, fontSize: fs.sm }]}>
              {alarm.enabled ? 'Ativo' : 'Inativo'}
            </Text>
          </Pressable>
        ) : (
          // Lista só leitura: mostra se está ligado, mas não deixa mudar.
          <View
            style={[
              styles.toggleBtn,
              { backgroundColor: colors.background, borderColor: colors.border, minHeight: fs.touch(36) },
            ]}
            accessible
            accessibilityLabel={alarm.enabled ? 'Lembrete ativo' : 'Lembrete inativo'}
          >
            <MaterialIcons
              name={alarm.enabled ? 'notifications-active' : 'notifications-off'}
              size={18}
              color={alarm.enabled ? colors.primary : colors.muted}
            />
            <Text style={[styles.toggleBtnText, { color: alarm.enabled ? colors.primary : colors.muted, fontSize: fs.sm }]}>
              {alarm.enabled ? 'Ativo' : 'Inativo'}
            </Text>
          </View>
        )}

        <View style={[styles.editHint, { borderColor: colors.border }]}>
          <MaterialIcons name={onToggle ? 'edit' : 'visibility'} size={15} color={colors.muted} />
          <Text style={[styles.editHintText, { color: colors.muted, fontSize: fs.sm }]}>
            {onToggle ? 'Toque para editar' : 'Toque para ver'}
          </Text>
        </View>
```


**3c.** `components/alarm-list-screen.tsx` (dezesseis trocas, na ordem do arquivo):

**1.** Import dos textos (logo depois do import de `@/lib/alarm-kind`):

Trocar:

```tsx
import { checkinAlarms, DEFAULT_ESCALATE_MINUTES, medicationAlarms, type AlarmKind } from '@/lib/alarm-kind';
```

por:

```tsx
import { checkinAlarms, DEFAULT_ESCALATE_MINUTES, medicationAlarms, type AlarmKind } from '@/lib/alarm-kind';
import { alarmDetailsCopy, READ_ONLY_EMPTY_TEXT, readOnlyBannerText } from '@/lib/alarm-details';
```

**2.** O modo só leitura vem do acordo no estado. Logo depois do `useAppToast()`:

Trocar:

```tsx
  const { toastProps, showToast } = useAppToast();

  // Sem a permissão "Notificações em tela cheia"
```

por:

```tsx
  const { toastProps, showToast } = useAppToast();

  // Com um acordo ativo (Fase 4) quem cuida dos alarmes é outra pessoa: estas
  // listas só mostram. A lista local é trocada pela do servidor a cada sincronia,
  // então qualquer edição feita aqui se perderia.
  const management = state.management;
  const readOnly = !!management;
  const bannerText = readOnlyBannerText(management?.caregiverName);

  // Sem a permissão "Notificações em tela cheia"
```

**3.** `openAddModal` não abre o formulário em modo só leitura (defesa; o botão nem aparece):

Trocar:

```tsx
  const openAddModal = () => {
    // Teto técnico do agendador — não é limite de plano.
```

por:

```tsx
  const openAddModal = () => {
    if (readOnly) return;
    // Teto técnico do agendador — não é limite de plano.
```

**4.** Se o acordo começar com o formulário aberto (a sincronia chega por baixo), o formulário fecha. Logo depois do efeito do `?alarmId=`:

Trocar:

```tsx
  }, [focusAlarmId, state.alarms]);  // eslint-disable-line react-hooks/exhaustive-deps
```

por:

```tsx
  }, [focusAlarmId, state.alarms]);  // eslint-disable-line react-hooks/exhaustive-deps

  // O acordo pode começar com o formulário aberto (a lista do servidor chega por
  // baixo). Fecha o formulário: salvar agora gravaria numa lista local que o
  // servidor acabou de substituir.
  useEffect(() => {
    if (readOnly) setModalVisible(false);
  }, [readOnly]);
```

**5.** Tocar num alarme (inclusive pelo atalho `?alarmId=` da tela inicial, que passa por `openEditModal`) abre os detalhes, nunca o formulário:

Trocar:

```tsx
  const openEditModal = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setModalVisible(true);
  };
```

por:

```tsx
  // Lista só leitura: tocar num alarme mostra os detalhes, sem edição.
  const showDetails = (alarm: Alarm) => {
    const details = alarmDetailsCopy(alarm);
    showDialog({
      title: details.title,
      message: details.message,
      variant: 'info',
      buttons: [{ text: details.closeLabel }],
    });
  };

  const openEditModal = (alarm: Alarm) => {
    if (readOnly) {
      showDetails(alarm);
      return;
    }
    setEditingAlarm(alarm);
    setModalVisible(true);
  };
```

**6.** Modo acessível, aviso no topo (depois do cabeçalho, antes do histórico):

Trocar:

```tsx
        {!isCheckin && <AlarmHistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} />}
        {!isCheckin && (
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
```

por:

```tsx
        {readOnly && (
          <View style={{
            marginHorizontal: 12,
            marginTop: 12,
            padding: 16,
            borderRadius: 16,
            borderWidth: 3,
            borderColor: ac.primary,
            backgroundColor: ac.surface,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}>
            <MaterialIcons name="supervisor-account" size={32} color={ac.primary} />
            <Text style={{ flex: 1, fontSize: af.md, fontWeight: '800', color: ac.foreground }}>{bannerText}</Text>
          </View>
        )}
        {!isCheckin && <AlarmHistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} />}
        {!isCheckin && (
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
```

**7.** Modo acessível, lista vazia não manda adicionar:

Trocar:

```tsx
              {copy.emptyA11yText}
```

por:

```tsx
              {readOnly ? READ_ONLY_EMPTY_TEXT : copy.emptyA11yText}
```

**8.** Modo acessível, o botão do card vira "Ver detalhes":

Trocar:

```tsx
                    accessibilityRole="button"
                    accessibilityLabel={copy.editLabel}
                  >
                    <MaterialIcons name="edit" size={28} color={ac.primary} />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.primary }}>Editar</Text>
```

por:

```tsx
                    accessibilityRole="button"
                    accessibilityLabel={readOnly ? 'Ver detalhes do lembrete' : copy.editLabel}
                  >
                    <MaterialIcons name={readOnly ? 'visibility' : 'edit'} size={28} color={ac.primary} />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.primary }}>
                      {readOnly ? 'Ver detalhes' : 'Editar'}
                    </Text>
```

**9.** Modo acessível, a barra "Adicionar" some (abertura do bloco):

Trocar:

```tsx
        {/* Adicionar — barra inferior, mesma posição do modo normal */}
        <View style={{
```

por:

```tsx
        {/* Adicionar — barra inferior, mesma posição do modo normal. Some na lista só leitura. */}
        {!readOnly && (
        <View style={{
```

**10.** Modo acessível, a barra "Adicionar" some (fechamento do bloco):

Trocar:

```tsx
            <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.onPrimary }}>{copy.addA11yText}</Text>
          </Pressable>
        </View>

        <AlarmFormModal
```

por:

```tsx
            <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.onPrimary }}>{copy.addA11yText}</Text>
          </Pressable>
        </View>
        )}

        <AlarmFormModal
```

**11.** Modo normal, aviso no topo (antes do atalho do histórico):

Trocar:

```tsx
      {/* Atalho para o histórico — fora da área do título */}
```

por:

```tsx
      {readOnly && (
        <View style={[styles.managedBanner, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <MaterialIcons name="supervisor-account" size={22} color={colors.primary} />
          <Text style={[styles.managedBannerText, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
            {bannerText}
          </Text>
        </View>
      )}

      {/* Atalho para o histórico — fora da área do título */}
```

**12.** Modo normal, lista vazia não manda adicionar:

Trocar:

```tsx
            {copy.emptyText}
```

por:

```tsx
            {readOnly ? READ_ONLY_EMPTY_TEXT : copy.emptyText}
```

**13.** Modo normal, o card não recebe `onToggle`:

Trocar:

```tsx
              onToggle={handleToggle}
```

por:

```tsx
              onToggle={readOnly ? undefined : handleToggle}
```

**14.** Modo normal, o botão "Adicionar lembrete" some (abertura do bloco):

Trocar:

```tsx
      {/* Add button — full width, min 56dp */}
      <View style={[styles.addBtnContainer,
```

por:

```tsx
      {/* Add button — full width, min 56dp. Some na lista só leitura. */}
      {!readOnly && (
      <View style={[styles.addBtnContainer,
```

**15.** Modo normal, o botão "Adicionar lembrete" some (fechamento do bloco):

Trocar:

```tsx
            {copy.addText}
          </Text>
        </PressableScale>
      </View>

      <AlarmFormModal
```

por:

```tsx
            {copy.addText}
          </Text>
        </PressableScale>
      </View>
      )}

      <AlarmFormModal
```

**16.** Estilos do aviso (antes de `nextCard` em `StyleSheet.create`):

Trocar:

```tsx
  nextCard: {
    borderWidth: 0,
```

por:

```tsx
  managedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  managedBannerText: {
    flex: 1,
    fontWeight: '700',
  },
  nextCard: {
    borderWidth: 0,
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/alarm-details.test.ts tests/alarm-list-read-only.test.ts tests/alarm-setup-prompts.test.ts tests/alarm-schedule-failure.test.ts tests/alarm-form.test.ts tests/checkin-screens.test.ts tests/help-screen-add-alarm.test.ts tests/alarm-custom-days-convention.test.ts tests/ui-modo-acessivel.test.ts tests/ui-cores-token.test.ts tests/ui-font-minimum.test.ts`

Esperado: PASS (os de `alarm-setup-prompts` e `alarm-schedule-failure` leem o fonte de `alarm-list-screen.tsx` com regex em `handleSave`/`handleToggle` e nos textos de UI; nenhum dos trechos acima os toca).

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos).

```bash
git add lib/alarm-details.ts components/alarm-card.tsx components/alarm-list-screen.tsx tests/alarm-details.test.ts tests/alarm-list-read-only.test.ts
git commit -m "feat(app): listas de Remédios e Check-in só leitura quando outra pessoa cuida dos alarmes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

---

## Tarefa 16: Área do cuidador "Alarmes de [nome]"

**Depende de:** Tarefas 1 (`shared/managed-alarm.ts`), 2 (coluna `alarm_changes.changedByOpenId`), 5 (tipo `created`), 6 e 7 (router `managedAlarms`).

**Files:**
- Create: `lib/managed-alarms-caregiver.ts` (regras puras: modo da tela, status de entrega 4.5, erros de mutação, payload do `AlarmFormModal`)
- Create: `app/(caregiver-tabs)/managed-alarms.tsx` (a tela, nos estados da spec 6.1, modos normal e acessível)
- Modify: `app/(caregiver-tabs)/person.tsx` (botão de entrada "Alarmes de [nome]" + dois estilos)
- Modify: `components/caregiver-push-initializer.tsx` (tipos de push novos, rota padrão e recarga da área)
- Modify: `lib/caregiver-format.ts` (`alarmChangeTitle` trata `created` e o autor)
- Test: `tests/managed-alarms-caregiver.test.ts` (novo), `tests/caregiver-managed-alarms-screen.test.ts` (novo), `tests/caregiver-format.test.ts`

**Interfaces:**
- Consumes (Tarefa 1): `ManagedAlarm`, `MANAGED_ALARMS_MAX`, `PENDING_HINT_HOURS` de `shared/managed-alarm.ts`.
- Consumes (Tarefas 6 e 7): `trpc.managedAlarms.forCaregiver` (query → `{ monitoredOpenId, monitoredName, management: null | { id, status: 'pending'|'active', caregiverOpenId, isMine, managerName, requestedAt, respondedAt, expiresAt }, list: null | { version, alarms, appliedVersion, failedAlarmIds, appliedAt, updatedAt } }`), `request`, `cancelRequest`, `stopManaging` (mutations sem entrada), `createAlarm({ baseVersion, alarm })`, `updateAlarm({ baseVersion, alarmId, alarm })`, `deleteAlarm({ baseVersion, alarmId })`. Lista velha = `TRPCError` `CONFLICT`.
- Consumes (Tarefas 2 e 5): `AlarmChangeRow.changedByOpenId: string | null` e `changeType` com `'created'`.
- Consumes (já existe): `AlarmFormModal` (`components/alarm-form-modal.tsx`, só edita e devolve valores), `formFromAlarm`, `checkinAlarms`/`medicationAlarms` (genéricos), `link.getMonitoredData` (alarmes do backup, para a leitura sem acordo), `getUserByOpenId` (`server/db`).
- Produces: rota `/(caregiver-tabs)/managed-alarms`; `lib/managed-alarms-caregiver.ts` exporta `screenMode`, `requestExpiryText`, `alarmDeliveryStatus`, `deliveryText`, `listSummary`, `alarmRepeatLabel`, `toManagedInput`, `describeMutationError`, `STALE_LIST_MESSAGE` e os tipos `ManagedListView`, `ManagementView`; `alarmChangeTitle({ …, changeType: 'created'|'deleted'|'disabled'|'rescheduled', changedByName?: string | null })`; (consome da Tarefa 5: `link.getMonitoredAlerts().changes[].changedByName: string | null` — `null` = a própria pessoa, `"Você"` = o cuidador que chama, senão o nome do outro cuidador).

**Os estados da tela (spec 6.1), todos nos modos normal e acessível:**

| Estado (`screenMode`) | Quando | O que aparece |
|---|---|---|
| `no-agreement` | `management === null` | Frase do que o pedido significa; remédios e check-ins só leitura (backup); botão "Pedir para cuidar dos alarmes" |
| `pending` | `status 'pending'` e `isMine` | "Aguardando [nome] aceitar (vence em N dias)"; botão "Cancelar pedido"; só leitura |
| `pending-other` | `status 'pending'` e não é meu | "[Cuidador] já pediu para cuidar dos alarmes de [nome]. Aguardando [nome] responder."; só leitura. A spec não lista este estado, mas o servidor aceita um pedido por idoso: sem ele a tela ficaria sem saída para o segundo cuidador. |
| `active-mine` | `status 'active'` e `isMine` | Resumo de entrega no topo; "Novo remédio" / "Novo check-in"; lista com status por alarme, "Desligar/Ligar" e toque para editar no `AlarmFormModal`; "Parar de cuidar dos alarmes" |
| `active-other` | `status 'active'` e não é meu | "[Cuidador] cuida dos alarmes de [nome]"; só leitura |

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/managed-alarms-caregiver.test.ts`:

```ts
/**
 * Regras puras da área "Alarmes de [nome]" do cuidador (spec 4.5 e 6.1).
 * Sem React: o que a tela mostra para cada estado do acordo e cada estado de
 * entrega de um alarme é decidido aqui.
 */
import { describe, expect, it } from 'vitest';
import {
  alarmDeliveryStatus,
  alarmRepeatLabel,
  deliveryText,
  describeMutationError,
  listSummary,
  requestExpiryText,
  screenMode,
  STALE_LIST_MESSAGE,
  toManagedInput,
  type ManagedListView,
  type ManagementView,
} from '../lib/managed-alarms-caregiver';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Horário local de 2026-10-<dia>: o formato HH:MM da tela também é local. */
const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).getTime();

const losartana = { id: 'a1', time: '08:00', description: 'Losartana', enabled: true, repeat: 'daily' as const, sound: true, vibration: true };
const checkin = { id: 'a2', time: '09:00', description: 'Check-in', enabled: true, repeat: 'daily' as const, sound: true, vibration: true, kind: 'checkin' as const, escalateAfterMinutes: 15 as const };

function list(over: Partial<ManagedListView> = {}): ManagedListView {
  return {
    version: 3,
    alarms: [losartana, checkin],
    appliedVersion: 3,
    failedAlarmIds: [],
    appliedAt: at(9, 14, 10),
    updatedAt: at(9, 14, 5),
    ...over,
  };
}

function management(over: Partial<ManagementView> = {}): ManagementView {
  return {
    id: 1,
    status: 'active',
    caregiverOpenId: 'cg-1',
    isMine: true,
    managerName: 'Ana',
    requestedAt: at(1, 10, 0),
    respondedAt: at(1, 11, 0),
    expiresAt: null,
    ...over,
  };
}

describe('screenMode — os estados da spec 6.1', () => {
  it('sem acordo', () => {
    expect(screenMode(null)).toBe('no-agreement');
  });
  it('pedido pendente meu e de outro cuidador', () => {
    expect(screenMode(management({ status: 'pending', isMine: true }))).toBe('pending');
    expect(screenMode(management({ status: 'pending', isMine: false }))).toBe('pending-other');
  });
  it('acordo ativo meu e de outro cuidador', () => {
    expect(screenMode(management({ status: 'active', isMine: true }))).toBe('active-mine');
    expect(screenMode(management({ status: 'active', isMine: false }))).toBe('active-other');
  });
});

describe('requestExpiryText', () => {
  const now = at(9, 10, 0);
  it('conta os dias que faltam, arredondando para cima', () => {
    expect(requestExpiryText(now + 3 * DAY, now)).toBe('vence em 3 dias');
    expect(requestExpiryText(now + 2 * DAY + HOUR, now)).toBe('vence em 3 dias');
    expect(requestExpiryText(now + 12 * HOUR, now)).toBe('vence em 1 dia');
  });
  it('já passou do prazo: vence hoje; sem prazo conhecido: vazio', () => {
    expect(requestExpiryText(now - HOUR, now)).toBe('vence hoje');
    expect(requestExpiryText(null, now)).toBe('');
  });
});

describe('alarmDeliveryStatus — por alarme (spec 4.5)', () => {
  it('versão confirmada e sem falha = confirmado', () => {
    expect(alarmDeliveryStatus(list(), 'a1')).toBe('confirmed');
  });
  it('versão ainda não confirmada = pendente, mesmo que o id tenha falhado na versão anterior', () => {
    expect(alarmDeliveryStatus(list({ appliedVersion: 2 }), 'a1')).toBe('pending');
    expect(alarmDeliveryStatus(list({ appliedVersion: 2, failedAlarmIds: ['a1'] }), 'a1')).toBe('pending');
  });
  it('versão confirmada com o id em failedAlarmIds = falhou; os outros seguem confirmados', () => {
    const l = list({ failedAlarmIds: ['a1'] });
    expect(alarmDeliveryStatus(l, 'a1')).toBe('failed');
    expect(alarmDeliveryStatus(l, 'a2')).toBe('confirmed');
  });
});

describe('deliveryText — as frases da spec 4.5', () => {
  const base = { name: 'Maria', alarm: losartana, pendingSince: at(9, 14, 5) };

  it('confirmado', () => {
    expect(deliveryText('confirmed', { ...base, now: at(9, 14, 20) })).toBe('Tudo certo no celular de Maria.');
  });

  it('pendente há menos de 12 h não traz o pedido para abrir o app', () => {
    expect(deliveryText('pending', { ...base, now: at(9, 20, 0) })).toBe(
      'Ainda não chegou ao celular de Maria (desde 14:05).'
    );
  });

  it('pendente há 12 h ou mais acrescenta "Peça para Maria abrir o Vigora."', () => {
    expect(deliveryText('pending', { ...base, now: at(10, 2, 5) })).toBe(
      'Ainda não chegou ao celular de Maria (desde 09/10 14:05). Peça para Maria abrir o Vigora.'
    );
    expect(deliveryText('pending', { ...base, now: at(9, 14, 5) + 12 * HOUR })).toContain('Peça para Maria abrir o Vigora.');
    expect(deliveryText('pending', { ...base, now: at(9, 14, 5) + 12 * HOUR - 1 })).not.toContain('Peça para');
  });

  it('falha traz o lembrete e o horário', () => {
    expect(deliveryText('failed', { ...base, now: at(9, 20, 0) })).toBe(
      'O celular de Maria não conseguiu agendar: Losartana 08:00.'
    );
  });

  it('alarme sem nome usa "Lembrete"', () => {
    expect(deliveryText('failed', { ...base, alarm: { ...losartana, description: ' ' }, now: at(9, 20, 0) })).toBe(
      'O celular de Maria não conseguiu agendar: Lembrete 08:00.'
    );
  });
});

describe('listSummary — o resumo no topo da lista', () => {
  const now = at(9, 20, 0);

  it('tudo confirmado', () => {
    expect(listSummary(list(), 'Maria', now)).toEqual({ tone: 'ok', text: 'Tudo certo no celular de Maria.' });
  });

  it('pendente: mesma frase do alarme pendente, desde a última gravação', () => {
    expect(listSummary(list({ appliedVersion: 2 }), 'Maria', now)).toEqual({
      tone: 'pending',
      text: 'Ainda não chegou ao celular de Maria (desde 14:05).',
    });
  });

  it('falhas: conta só os ids que ainda estão na lista', () => {
    expect(listSummary(list({ failedAlarmIds: ['a1'] }), 'Maria', now)).toEqual({
      tone: 'failed',
      text: 'O celular de Maria não conseguiu agendar 1 alarme. Veja abaixo.',
    });
    expect(listSummary(list({ failedAlarmIds: ['a1', 'a2'] }), 'Maria', now).text).toBe(
      'O celular de Maria não conseguiu agendar 2 alarmes. Veja abaixo.'
    );
    expect(listSummary(list({ failedAlarmIds: ['apagado-ha-muito'] }), 'Maria', now).tone).toBe('ok');
  });
});

describe('alarmRepeatLabel', () => {
  it('descreve a repetição em português', () => {
    expect(alarmRepeatLabel({ ...losartana, repeat: 'daily' })).toBe('Todos os dias');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'weekdays' })).toBe('Dias úteis');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'weekends' })).toBe('Fins de semana');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'custom', customDays: [1, 3, 5] })).toBe('Seg, Qua, Sex');
    expect(alarmRepeatLabel({ ...losartana, repeat: 'custom', customDays: [] })).toBe('Sem dias escolhidos');
  });
});

describe('toManagedInput — o que o AlarmFormModal manda para a rota', () => {
  it('leva só os campos que a rota valida (sem id, sem ids de agendamento)', () => {
    const input = toManagedInput({
      time: '08:00',
      description: 'Losartana',
      enabled: true,
      repeat: 'custom',
      customDays: [1, 3],
      sound: true,
      vibration: false,
      notificationId: 'n-1',
      nativeAlarmUids: ['u-1'],
    });
    expect(input).toEqual({
      time: '08:00',
      description: 'Losartana',
      enabled: true,
      repeat: 'custom',
      customDays: [1, 3],
      sound: true,
      vibration: false,
    });
  });

  it('o "Desligar/Ligar" da linha passa o alarme inteiro: o id não vaza para a rota', () => {
    expect('id' in toManagedInput({ ...losartana, enabled: false })).toBe(false);
  });

  it('check-in leva kind e atraso; remédio não inventa esses campos', () => {
    expect(toManagedInput(checkin)).toMatchObject({ kind: 'checkin', escalateAfterMinutes: 15 });
    const med = toManagedInput({ time: '08:00', description: 'X', enabled: true, repeat: 'daily', sound: true, vibration: true });
    expect('kind' in med).toBe(false);
    expect('escalateAfterMinutes' in med).toBe(false);
    expect('customDays' in med).toBe(false);
  });
});

describe('describeMutationError', () => {
  const NETWORK = 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';

  it('lista velha (CONFLICT) vira o texto da spec', () => {
    expect(describeMutationError({ data: { code: 'CONFLICT' }, message: 'qualquer coisa' }, { staleList: true })).toEqual({
      kind: 'conflict',
      message: 'A lista mudou. Confira de novo.',
    });
    expect(STALE_LIST_MESSAGE).toBe('A lista mudou. Confira de novo.');
  });

  it('CONFLICT fora da lista (outro pedido já existe) mostra a mensagem do servidor', () => {
    expect(describeMutationError({ data: { code: 'CONFLICT' }, message: 'Já existe um pedido para esta pessoa.' }, { staleList: false })).toEqual({
      kind: 'server',
      message: 'Já existe um pedido para esta pessoa.',
    });
  });

  it('mensagem do servidor em português passa direto (limite de 24)', () => {
    expect(describeMutationError({ data: { code: 'BAD_REQUEST' }, message: 'Limite de 24 alarmes atingido.' }, { staleList: true })).toEqual({
      kind: 'server',
      message: 'Limite de 24 alarmes atingido.',
    });
  });

  it('erro de validação do Zod (JSON em inglês) não vai para a tela', () => {
    const r = describeMutationError({ data: { code: 'BAD_REQUEST' }, message: '[\n  { "code": "too_big" }\n]' }, { staleList: true });
    expect(r).toEqual({ kind: 'server', message: 'Não foi possível salvar. Confira os dados e tente de novo.' });
  });

  it('sem resposta do servidor (rede) e erro interno viram a mensagem de conexão', () => {
    expect(describeMutationError(new TypeError('Network request failed'), { staleList: true })).toEqual({ kind: 'network', message: NETWORK });
    expect(describeMutationError({ data: { code: 'INTERNAL_SERVER_ERROR' }, message: 'boom' }, { staleList: true })).toEqual({ kind: 'network', message: NETWORK });
    expect(describeMutationError(undefined, { staleList: false })).toEqual({ kind: 'network', message: NETWORK });
  });
});
```

Criar `tests/caregiver-managed-alarms-screen.test.ts` (teste de leitura de código, como o repositório já faz para telas):

```ts
/**
 * A tela "Alarmes de [nome]" do cuidador (spec 6.1): os estados, os dois modos,
 * o AlarmFormModal reaproveitado e o tratamento de lista velha.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const screen = read('app/(caregiver-tabs)/managed-alarms.tsx');

describe('managed-alarms.tsx — estados e textos da spec 6.1', () => {
  it('cobre os quatro estados (mais o pedido de outro cuidador)', () => {
    for (const mode of ["'no-agreement'", "'pending'", "'pending-other'", "'active-mine'", "'active-other'"]) {
      expect(screen, mode).toContain(mode);
    }
  });

  it('textos de cada estado', () => {
    expect(screen).toContain('Pedir para cuidar dos alarmes');
    expect(screen).toMatch(/Aguardando \$\{personName\} aceitar/);
    expect(screen).toContain('Cancelar pedido');
    expect(screen).toMatch(/\$\{managerName\} cuida dos alarmes de \$\{personName\}/);
    expect(screen).toContain('Parar de cuidar dos alarmes');
    expect(screen).toContain('Novo remédio');
    expect(screen).toContain('Novo check-in');
  });

  it('as ações perigosas pedem confirmação em AppDialog (nunca Alert.alert)', () => {
    expect(screen).not.toMatch(/Alert\.alert/);
    expect(screen).toMatch(/<AppDialog \{\.\.\.dialogProps\} \/>/);
    expect(screen).toMatch(/<AppToast \{\.\.\.toastProps\} \/>/);
    for (const title of ['Pedir para cuidar dos alarmes?', 'Cancelar o pedido?', 'Parar de cuidar dos alarmes?', 'Apagar o alarme?']) {
      expect(screen, title).toContain(title);
    }
  });

  it('reaproveita o AlarmFormModal e salva pelas rotas do servidor', () => {
    expect(screen).toMatch(/import \{ AlarmFormModal \} from '@\/components\/alarm-form-modal'/);
    expect(screen).toMatch(/<AlarmFormModal/);
    for (const proc of ['forCaregiver', 'request', 'cancelRequest', 'stopManaging', 'createAlarm', 'updateAlarm', 'deleteAlarm']) {
      expect(screen, proc).toMatch(new RegExp(`trpc\\.managedAlarms\\.${proc}\\.use(Query|Mutation)`));
    }
    // o cuidador não grava nada no estado local do app dele
    expect(screen).not.toMatch(/useAppContext/);
  });

  it('lista velha: relê o servidor e usa o texto da spec (via describeMutationError)', () => {
    expect(screen).toMatch(/describeMutationError\(err, \{ staleList \}\)/);
    expect(screen).toMatch(/managed\.refetch\(\)/);
    expect(read('lib/managed-alarms-caregiver.ts')).toContain("'A lista mudou. Confira de novo.'");
  });

  it('o status por alarme usa as frases de entrega e o resumo do topo', () => {
    expect(screen).toMatch(/deliveryText\(/);
    expect(screen).toMatch(/listSummary\(/);
    expect(screen).toMatch(/alarmDeliveryStatus\(/);
  });

  it('segue as regras de tela: modo acessível, safe area, tokens, alvo de toque', () => {
    expect(screen).toContain('useAccessibility');
    expect(screen).toContain('isAccessibilityMode');
    expect(screen).toContain('useSafeAreaInsets');
    expect(screen).toContain('as_.touchTarget');
    expect(screen).toMatch(/refetchOnWindowFocus: true/);
    expect(screen).toMatch(/CaregiverRefreshControl/);
    expect(screen).not.toMatch(/['"]#[0-9A-Fa-f]{6}['"]/);
    expect(screen).not.toMatch(/fontSize:\s*\d+\s*[,}]/);
  });
});

describe('integração da área com o resto do app do cuidador', () => {
  it('a tela da pessoa tem a entrada "Alarmes de [nome]"', () => {
    const person = read('app/(caregiver-tabs)/person.tsx');
    expect(person).toContain("'/(caregiver-tabs)/managed-alarms'");
    expect(person).toMatch(/Alarmes de \{linked\.displayName\}/);
  });

  it('o push do cuidador conhece os tipos da Fase 4 e recarrega a área', () => {
    const push = read('components/caregiver-push-initializer.tsx');
    for (const type of ['management_accepted', 'management_declined', 'management_ended', 'management_expired', 'management_changed', 'dms_paused']) {
      expect(push, type).toContain(`'${type}'`);
    }
    expect(push).toMatch(/managedAlarms\.forCaregiver\.invalidate/);
    expect(push).toContain("'/(caregiver-tabs)/managed-alarms'");
  });
});
```

Em `tests/caregiver-format.test.ts`, depois do bloco `describe('alarmChangeTitle', …)` (termina logo antes de `describe('push do cuidador', …)`), acrescentar:

```ts
describe('alarmChangeTitle — feita por um cuidador (Fase 4)', () => {
  const base = { alarmDescription: 'Losartana', oldTime: '08:00', newTime: null, changedByName: 'Ana' };

  it('criado', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'created', oldTime: null, newTime: '08:00' })).toBe('Ana criou "Losartana" (08:00)');
  });

  it('apagado, desativado e reagendado dizem quem fez', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'deleted' })).toBe('Ana apagou "Losartana"');
    expect(alarmChangeTitle({ ...base, changeType: 'disabled' })).toBe('Ana desativou "Losartana"');
    expect(alarmChangeTitle({ ...base, changeType: 'rescheduled', newTime: '09:30' })).toBe(
      'Ana mudou o horário de "Losartana" para 09:30'
    );
    expect(alarmChangeTitle({ ...base, changeType: 'rescheduled', newTime: '08:00' })).toBe('Ana mudou os dias de "Losartana"');
  });

  it('autor null = a própria pessoa: texto antigo, sem sujeito', () => {
    expect(alarmChangeTitle({ ...base, changedByName: null, changeType: 'deleted' })).toBe('Excluiu "Losartana"');
  });

  it('criado sem autor ainda lê bem', () => {
    expect(alarmChangeTitle({ alarmDescription: 'Losartana', changeType: 'created', oldTime: null, newTime: '08:00' })).toBe(
      'Criou "Losartana" (08:00)'
    );
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarms-caregiver.test.ts tests/caregiver-managed-alarms-screen.test.ts tests/caregiver-format.test.ts`
Esperado: FAIL — `Failed to resolve import "../lib/managed-alarms-caregiver"`; a leitura de `app/(caregiver-tabs)/managed-alarms.tsx` falha com `ENOENT`; `alarmChangeTitle` ainda devolve `Excluiu "Losartana"` onde o teste espera `Ana apagou …`.

- [ ] **Passo 3: Implementar**

**3a. Criar `lib/managed-alarms-caregiver.ts`** (puro: nenhum import de React Native, Expo ou tRPC):

```ts
/**
 * managed-alarms-caregiver.ts
 *
 * Regras puras da área "Alarmes de [nome]" do cuidador (spec 4.5 e 6.1): qual
 * estado a tela mostra, qual frase descreve a entrega de cada alarme ao celular
 * do idoso, e como um erro de gravação vira mensagem. Sem React para ser testável.
 * Nada aqui interpreta valor de saúde: são só lembretes que uma pessoa criou.
 */
import type { AlarmFormValues } from '@/lib/alarm-form';
import { PENDING_HINT_HOURS, type ManagedAlarm } from '@/shared/managed-alarm';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Lista gerenciada como a rota `managedAlarms.forCaregiver` devolve (datas em epoch-ms). */
export type ManagedListView = {
  version: number;
  alarms: ManagedAlarm[];
  appliedVersion: number;
  failedAlarmIds: string[];
  appliedAt: number | null;
  updatedAt: number;
};

/** Acordo como a rota devolve; `null` quando não há pedido nem acordo aberto. */
export type ManagementView = {
  id: number;
  status: 'pending' | 'active';
  caregiverOpenId: string;
  isMine: boolean;
  managerName: string | null;
  requestedAt: number;
  respondedAt: number | null;
  expiresAt: number | null;
};

export type ScreenMode = 'no-agreement' | 'pending' | 'pending-other' | 'active-mine' | 'active-other';

export function screenMode(management: ManagementView | null): ScreenMode {
  if (!management) return 'no-agreement';
  if (management.status === 'pending') return management.isMine ? 'pending' : 'pending-other';
  return management.isMine ? 'active-mine' : 'active-other';
}

/** "vence em N dias" (arredonda para cima); vazio quando o servidor não informou o prazo. */
export function requestExpiryText(expiresAt: number | null, now: number): string {
  if (expiresAt == null) return '';
  const days = Math.ceil((expiresAt - now) / DAY_MS);
  if (days <= 0) return 'vence hoje';
  return days === 1 ? 'vence em 1 dia' : `vence em ${days} dias`;
}

export type DeliveryStatus = 'confirmed' | 'pending' | 'failed';

/**
 * Estado de UM alarme no celular do idoso. Enquanto a versão mais nova não foi
 * confirmada, tudo está pendente: `failedAlarmIds` descreve a versão ANTERIOR
 * confirmada e pode já não valer para o que o cuidador acabou de gravar.
 */
export function alarmDeliveryStatus(
  list: Pick<ManagedListView, 'version' | 'appliedVersion' | 'failedAlarmIds'>,
  alarmId: string
): DeliveryStatus {
  if (list.appliedVersion < list.version) return 'pending';
  return list.failedAlarmIds.includes(alarmId) ? 'failed' : 'confirmed';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:05" se foi hoje; "09/10 14:05" se foi em outro dia (horário local do cuidador). */
function formatSince(ts: number, now: number): string {
  const d = new Date(ts);
  const n = new Date(now);
  const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? hhmm : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${hhmm}`;
}

function pendingSentence(name: string, since: number, now: number): string {
  const base = `Ainda não chegou ao celular de ${name} (desde ${formatSince(since, now)}).`;
  return now - since >= PENDING_HINT_HOURS * HOUR_MS ? `${base} Peça para ${name} abrir o Vigora.` : base;
}

/** As três frases da spec 4.5 para um alarme. */
export function deliveryText(
  status: DeliveryStatus,
  ctx: { name: string; alarm: Pick<ManagedAlarm, 'time' | 'description'>; pendingSince: number; now: number }
): string {
  if (status === 'confirmed') return `Tudo certo no celular de ${ctx.name}.`;
  if (status === 'pending') return pendingSentence(ctx.name, ctx.pendingSince, ctx.now);
  const label = ctx.alarm.description.trim() || 'Lembrete';
  return `O celular de ${ctx.name} não conseguiu agendar: ${label} ${ctx.alarm.time}.`;
}

/** Resumo no topo da lista (spec 4.5: "por alarme e no topo"). */
export function listSummary(
  list: ManagedListView,
  name: string,
  now: number
): { tone: 'ok' | 'pending' | 'failed'; text: string } {
  if (list.appliedVersion < list.version) {
    return { tone: 'pending', text: pendingSentence(name, list.updatedAt, now) };
  }
  const failed = list.alarms.filter((a) => list.failedAlarmIds.includes(a.id)).length;
  if (failed > 0) {
    const noun = failed === 1 ? '1 alarme' : `${failed} alarmes`;
    return { tone: 'failed', text: `O celular de ${name} não conseguiu agendar ${noun}. Veja abaixo.` };
  }
  return { tone: 'ok', text: `Tudo certo no celular de ${name}.` };
}

const DAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function alarmRepeatLabel(alarm: Pick<ManagedAlarm, 'repeat' | 'customDays'>): string {
  switch (alarm.repeat) {
    case 'weekdays':
      return 'Dias úteis';
    case 'weekends':
      return 'Fins de semana';
    case 'custom': {
      const days = [...new Set(alarm.customDays ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
      return days.length > 0 ? days.map((d) => DAY_SHORT[d]).join(', ') : 'Sem dias escolhidos';
    }
    default:
      return 'Todos os dias';
  }
}

/**
 * O que vai para createAlarm/updateAlarm: só os campos da lista gerenciada.
 * O formulário já não traz `id`, mas o "Desligar/Ligar" da linha passa o alarme
 * inteiro, e `notificationId`/`nativeAlarmUids` nunca saem do aparelho do idoso.
 * O servidor ainda normaliza (check-in diário, atraso só no check-in).
 */
export function toManagedInput(v: AlarmFormValues): Omit<ManagedAlarm, 'id'> {
  return {
    time: v.time,
    description: v.description,
    enabled: v.enabled,
    repeat: v.repeat,
    ...(v.customDays ? { customDays: v.customDays } : {}),
    sound: v.sound,
    vibration: v.vibration,
    ...(v.kind ? { kind: v.kind } : {}),
    ...(v.escalateAfterMinutes ? { escalateAfterMinutes: v.escalateAfterMinutes } : {}),
  };
}

export const STALE_LIST_MESSAGE = 'A lista mudou. Confira de novo.';
const NETWORK_MESSAGE = 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';
const INVALID_MESSAGE = 'Não foi possível salvar. Confira os dados e tente de novo.';

export type MutationFailure = { kind: 'conflict' | 'server' | 'network'; message: string };

/**
 * Erro de uma rota `managedAlarms.*` -> mensagem para o toast. `staleList` diz
 * que a chamada era uma gravação na lista (create/update/delete): aí CONFLICT
 * significa "a lista mudou" (spec 4.2). As mensagens do servidor já são em
 * português; o JSON de validação do Zod e os erros sem resposta não vão para a tela.
 */
export function describeMutationError(err: unknown, opts: { staleList: boolean }): MutationFailure {
  const e = err as { data?: { code?: unknown }; message?: unknown } | null | undefined;
  const code = typeof e?.data?.code === 'string' ? e.data.code : null;
  if (code === 'CONFLICT' && opts.staleList) return { kind: 'conflict', message: STALE_LIST_MESSAGE };
  const message = typeof e?.message === 'string' ? e.message.trim() : '';
  if (!code || code === 'INTERNAL_SERVER_ERROR' || !message) return { kind: 'network', message: NETWORK_MESSAGE };
  if (message.startsWith('[') || message.startsWith('{')) return { kind: 'server', message: INVALID_MESSAGE };
  return { kind: 'server', message };
}
```

**3c. `lib/caregiver-format.ts`** — substituir `alarmChangeTitle` inteira por:

```ts
/**
 * Título de uma mudança de lembrete. `changedByName` null/ausente = a própria
 * pessoa acompanhada (texto sem sujeito); com nome = um cuidador com o acordo
 * de gerenciamento (Fase 4), e o nome entra no começo.
 */
export function alarmChangeTitle(c: {
  alarmDescription: string;
  changeType: 'created' | 'deleted' | 'disabled' | 'rescheduled';
  oldTime: string | null;
  newTime: string | null;
  changedByName?: string | null;
}): string {
  const name = c.alarmDescription.trim() || c.oldTime || c.newTime || 'Lembrete sem nome';
  const by = c.changedByName?.trim() || null;
  const verb = (self: string, other: string) => (by ? `${by} ${other}` : self);
  switch (c.changeType) {
    case 'created':
      return `${verb('Criou', 'criou')} "${name}"${c.newTime ? ` (${c.newTime})` : ''}`;
    case 'deleted':
      return by ? `${by} apagou "${name}"` : `Excluiu "${name}"`;
    case 'disabled':
      return `${verb('Desativou', 'desativou')} "${name}"`;
    default:
      return c.oldTime && c.newTime && c.oldTime !== c.newTime
        ? `${verb('Mudou', 'mudou')} o horário de "${name}" para ${c.newTime}`
        : `${verb('Mudou', 'mudou')} os dias de "${name}"`;
  }
}
```

**3d. `components/caregiver-push-initializer.tsx`** — três edições.

1) A lista de tipos e a rota do acordo (trocar o bloco `const CAREGIVER_PUSH_TYPES = [ … ]` e a constante seguinte):

```ts
const CAREGIVER_PUSH_TYPES = [
  'monitoring_warning',
  'missed_checkin',
  'missed_alarm',
  'sos',
  'alarm_changed',
  'link_revoked',
  // Fase 4: acordo de gerenciamento dos alarmes e pausa dos avisos automáticos.
  'management_accepted',
  'management_declined',
  'management_ended',
  'management_expired',
  'management_changed',
  'dms_paused',
];
const DEFAULT_ROUTE = '/(caregiver-tabs)/alerts';
// Os pushes `management_*` sem `url` levam à área dos alarmes; `dms_paused` e
// `management_accepted` já trazem a própria `url`.
const MANAGEMENT_ROUTE = '/(caregiver-tabs)/managed-alarms';
```

2) No `navigateFromResponse`, trocar a linha do `url`:

```ts
      const url = typeof data.url === 'string' && data.url ? data.url : DEFAULT_ROUTE;
```

por:

```ts
      const fallback = String(data.type).startsWith('management_') ? MANAGEMENT_ROUTE : DEFAULT_ROUTE;
      const url = typeof data.url === 'string' && data.url ? data.url : fallback;
```

3) No listener de push recebido com o app aberto, depois da linha `if (type === 'link_revoked') refreshLink()…`, acrescentar:

```ts
      if (type === 'alarm_changed' || String(type).startsWith('management_')) {
        utils.managedAlarms.forCaregiver.invalidate().catch((e) => warnFailed('refresh failed', e));
      }
```

**3e. Criar `app/(caregiver-tabs)/managed-alarms.tsx`:**

```tsx
/**
 * managed-alarms.tsx (cuidador)
 *
 * "Alarmes de [nome]" (spec 6.1). Estados: sem acordo, pedido pendente, acordo
 * ativo meu, acordo ativo de outro cuidador (e pedido pendente de outro). Só
 * quem tem o acordo ativo edita, e o AlarmFormModal só coleta os valores: quem
 * grava é a rota do servidor (nada vai para o estado local do cuidador). Modo
 * normal e acessível numa árvore só, com `skin` trocando cores e tamanhos.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmFormModal } from '@/components/alarm-form-modal';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { CaregiverEmptyState } from '@/components/caregiver-empty-state';
import { CaregiverRefreshControl, UpdatedAgoBar } from '@/components/caregiver-refresh';
import { ScreenContainer } from '@/components/screen-container';
import { useColors } from '@/hooks/use-colors';
import { BrandFonts } from '@/lib/_core/theme';
import { useAccessibility } from '@/lib/accessibility-context';
import { checkinAlarms, medicationAlarms, type AlarmKind } from '@/lib/alarm-kind';
import type { AlarmFormValues } from '@/lib/alarm-form';
import { useCaregiverContext } from '@/lib/caregiver-context';
import { useFontSize } from '@/lib/font-size-context';
import {
  alarmDeliveryStatus,
  alarmRepeatLabel,
  deliveryText,
  describeMutationError,
  listSummary,
  requestExpiryText,
  screenMode,
  toManagedInput,
  type DeliveryStatus,
} from '@/lib/managed-alarms-caregiver';
import { trpc } from '@/lib/trpc';
import { MANAGED_ALARMS_MAX, type ManagedAlarm } from '@/shared/managed-alarm';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];
type RunResult = 'ok' | 'conflict' | 'error';

type Palette = {
  background: string; surface: string; border: string; foreground: string; muted: string;
  primary: string; onPrimary: string; success: string; warning: string; error: string;
};

/** Cores e tamanhos já resolvidos para o modo ativo (normal ou acessível). */
type Skin = {
  c: Palette;
  bw: number;
  pad: number;
  radius: number;
  /** Altura mínima de alvo de toque: ≥44 no normal, ≥60 no acessível. */
  touch: number;
  icon: number;
  sz: { title: number; heading: number; body: number; button: number; time: number };
};

export default function CaregiverManagedAlarmsScreen() {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af, a11ySpacing: as_ } = useAccessibility();
  const router = useRouter();
  const { state } = useCaregiverContext();
  const linked = state.linkedMonitored;
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();

  const [formVisible, setFormVisible] = useState(false);
  const [editing, setEditing] = useState<ManagedAlarm | null>(null);
  const [newKind, setNewKind] = useState<AlarmKind>('medication');
  // Versão da lista quando o formulário abriu: é contra ela que o servidor
  // decide se a lista mudou no meio da edição (CONFLICT).
  const formVersion = useRef(0);
  // Uma gravação por vez: toque duplo não manda duas.
  const busy = useRef(false);

  const managed = trpc.managedAlarms.forCaregiver.useQuery(undefined, { enabled: !!linked, refetchOnWindowFocus: true });
  const management = managed.data?.management ?? null;
  const list = managed.data?.list ?? null;
  const mode = screenMode(management);
  // Sem ser o gerente, a lista confirmada não vem: a leitura usa o backup, como a tela da pessoa.
  const backup = trpc.link.getMonitoredData.useQuery(undefined, {
    enabled: !!linked && managed.isSuccess && mode !== 'active-mine',
    refetchOnWindowFocus: true,
  });

  const request = trpc.managedAlarms.request.useMutation();
  const cancelRequest = trpc.managedAlarms.cancelRequest.useMutation();
  const stopManaging = trpc.managedAlarms.stopManaging.useMutation();
  const createAlarm = trpc.managedAlarms.createAlarm.useMutation();
  const updateAlarm = trpc.managedAlarms.updateAlarm.useMutation();
  const deleteAlarm = trpc.managedAlarms.deleteAlarm.useMutation();

  const refreshing = managed.isRefetching;
  const onRefresh = () => {
    managed.refetch();
    if (mode !== 'active-mine') backup.refetch();
  };

  if (!linked) {
    return (
      <ScreenContainer containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
        <CaregiverEmptyState
          icon="person-add"
          title="Nenhuma pessoa acompanhada ainda"
          description="Adicione a pessoa que você cuida para começar a acompanhar."
          ctaLabel="Vincular agora"
          onCtaPress={() => router.push('/(caregiver-tabs)/link')}
        />
      </ScreenContainer>
    );
  }

  const personName = linked.displayName || managed.data?.monitoredName || 'a pessoa';
  const managerName = management?.managerName || 'Outro cuidador';

  const c: Palette = isAccessibilityMode
    ? { background: ac.background, surface: ac.surface, border: ac.border, foreground: ac.foreground, muted: ac.muted, primary: ac.primary, onPrimary: ac.onPrimary, success: ac.success, warning: ac.warning, error: ac.error }
    : { background: colors.background, surface: colors.surface, border: colors.border, foreground: colors.foreground, muted: colors.muted, primary: colors.primary, onPrimary: colors.onPrimary, success: colors.success, warning: colors.warning, error: colors.error };
  const skin: Skin = isAccessibilityMode
    ? { c, bw: 2, pad: 20, radius: 20, touch: as_.touchTarget, icon: 30, sz: { title: af.lg, heading: af.md, body: af.sm, button: af.base, time: af['2xl'] } }
    : { c, bw: 1, pad: 14, radius: 14, touch: fs.touch(44), icon: 22, sz: { title: fs.xl, heading: fs.lg, body: fs.base, button: fs.md, time: fs['2xl'] } };

  /** Gravação no servidor: erro vira toast, e a tela relê o servidor (o acordo ou a lista podem ter mudado). */
  const run = async (action: () => Promise<unknown>, okMessage: string, staleList = false): Promise<RunResult> => {
    if (busy.current) return 'error';
    busy.current = true;
    try {
      await action();
      await managed.refetch();
      showToast({ message: okMessage, variant: 'success' });
      return 'ok';
    } catch (err) {
      const failure = describeMutationError(err, { staleList });
      await managed.refetch();
      showToast({ message: failure.message, variant: failure.kind === 'network' ? 'warning' : 'error' });
      console.warn('[managed-alarms] gravação não concluída:', failure.kind);
      return failure.kind === 'conflict' ? 'conflict' : 'error';
    } finally {
      busy.current = false;
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    // typedRoutes: o .expo/types é gerado e ainda não conhece rotas novas.
    else router.replace('/(caregiver-tabs)/person' as never);
  };

  const openNew = (kind: AlarmKind) => {
    if (!list) return;
    if (list.alarms.length >= MANAGED_ALARMS_MAX) {
      showDialog({
        title: 'Limite atingido',
        message: `A lista tem no máximo ${MANAGED_ALARMS_MAX} alarmes, somando remédios e check-ins. Apague um para criar outro.`,
        variant: 'warning',
        buttons: [{ text: 'Entendi' }],
      });
      return;
    }
    formVersion.current = list.version;
    setEditing(null);
    setNewKind(kind);
    setFormVisible(true);
  };

  const openEdit = (alarm: ManagedAlarm) => {
    if (!list) return;
    formVersion.current = list.version;
    setEditing(alarm);
    setFormVisible(true);
  };

  const handleSave = async (form: AlarmFormValues) => {
    const alarm = toManagedInput(form);
    const baseVersion = formVersion.current;
    const result = await run(
      () =>
        editing
          ? updateAlarm.mutateAsync({ baseVersion, alarmId: editing.id, alarm })
          : createAlarm.mutateAsync({ baseVersion, alarm }),
      'Alarme salvo.',
      true
    );
    // Lista velha: a tela já releu o servidor, então o formulário (que mostrava o alarme antigo) fecha.
    if (result !== 'error') setFormVisible(false);
  };

  const deleteAndClose = async (alarmId: string) => {
    const baseVersion = formVersion.current;
    const result = await run(() => deleteAlarm.mutateAsync({ baseVersion, alarmId }), 'Alarme apagado.', true);
    if (result !== 'error') setFormVisible(false);
  };

  const handleDelete = (alarmId: string) => {
    const target = list?.alarms.find((a) => a.id === alarmId);
    const label = target ? target.description.trim() || target.time : 'Este alarme';
    showDialog({
      title: 'Apagar o alarme?',
      message: `"${label}" vai sumir do celular de ${personName}.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Apagar', style: 'destructive', onPress: () => { void deleteAndClose(alarmId); } },
      ],
    });
  };

  const handleToggle = (alarm: ManagedAlarm) => {
    if (!list) return;
    const baseVersion = list.version;
    void run(
      () =>
        updateAlarm.mutateAsync({
          baseVersion,
          alarmId: alarm.id,
          alarm: toManagedInput({ ...alarm, enabled: !alarm.enabled }),
        }),
      alarm.enabled ? 'Alarme desligado.' : 'Alarme ligado.',
      true
    );
  };

  const askRequest = () =>
    showDialog({
      title: 'Pedir para cuidar dos alarmes?',
      message: `${personName} vai receber um aviso no celular e decide se aceita. Até aceitar, você continua só vendo os alarmes.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Pedir', onPress: () => { void run(() => request.mutateAsync(), `Pedido enviado a ${personName}.`); } },
      ],
    });

  const askCancelRequest = () =>
    showDialog({
      title: 'Cancelar o pedido?',
      message: `${personName} deixa de receber o pedido para você cuidar dos alarmes.`,
      variant: 'confirm',
      buttons: [
        { text: 'Voltar', style: 'cancel' },
        { text: 'Cancelar pedido', style: 'destructive', onPress: () => { void run(() => cancelRequest.mutateAsync(), 'Pedido cancelado.'); } },
      ],
    });

  const askStop = () =>
    showDialog({
      title: 'Parar de cuidar dos alarmes?',
      message: `${personName} será avisado e volta a cuidar dos próprios alarmes. Os alarmes que já estão no celular continuam tocando.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Parar', style: 'destructive', onPress: () => { void run(() => stopManaging.mutateAsync(), 'Você parou de cuidar dos alarmes.'); } },
      ],
    });

  const now = Date.now();
  // O backup é um array livre vindo do aparelho: descarta item que não seja objeto antes de ler campos.
  const readOnlyAlarms: ManagedAlarm[] =
    list?.alarms ?? ((backup.data?.alarms ?? []) as unknown[]).filter((a): a is ManagedAlarm => !!a && typeof a === 'object');
  const meds = medicationAlarms(readOnlyAlarms);
  const checks = checkinAlarms(readOnlyAlarms);

  const readOnlySections = (
    <>
      <Section skin={skin} title="Remédios">
        {backup.isLoading ? <Muted skin={skin} text="Carregando…" /> : null}
        {meds.length === 0 && !backup.isLoading ? <Muted skin={skin} text="Nenhum remédio na lista." /> : null}
        {meds.map((a) => <ReadOnlyRow key={a.id} skin={skin} alarm={a} />)}
      </Section>
      <Section skin={skin} title="Check-ins">
        {checks.length === 0 && !backup.isLoading ? <Muted skin={skin} text="Nenhum check-in na lista." /> : null}
        {checks.map((a) => <ReadOnlyRow key={a.id} skin={skin} alarm={a} />)}
      </Section>
    </>
  );

  let body: React.ReactNode;
  if (managed.isLoading) {
    body = <ActivityIndicator color={c.primary} style={{ marginTop: 32 }} />;
  } else if (managed.isError && !managed.data) {
    body = (
      <Card skin={skin}>
        <Muted skin={skin} text="Não foi possível carregar os alarmes. Confira a internet e tente de novo." />
        <ActionButton skin={skin} variant="outline" label="Tentar de novo" icon="refresh" onPress={() => { managed.refetch(); }} />
      </Card>
    );
  } else if (mode === 'no-agreement') {
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={`Você vê os alarmes de ${personName}, mas não pode mudá-los`} />
          <Muted
            skin={skin}
            text={`Se ${personName} aceitar, você passa a criar, mudar e apagar os remédios e check-ins, e ${personName} continua vendo e respondendo. ${personName} escolhe no próprio celular e pode parar quando quiser.`}
          />
          <ActionButton skin={skin} variant="primary" label="Pedir para cuidar dos alarmes" icon="alarm-add" onPress={askRequest} />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (mode === 'pending') {
    const expiry = requestExpiryText(management?.expiresAt ?? null, now);
    const waiting = expiry ? `Aguardando ${personName} aceitar (${expiry})` : `Aguardando ${personName} aceitar`;
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={waiting} />
          <Muted skin={skin} text={`${personName} recebeu um aviso no celular. Até a resposta, você continua só vendo os alarmes.`} />
          <ActionButton skin={skin} variant="outline" label="Cancelar pedido" icon="close" onPress={askCancelRequest} />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (mode === 'pending-other') {
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={`${managerName} já pediu para cuidar dos alarmes de ${personName}`} />
          <Muted skin={skin} text={`Aguardando ${personName} responder. Você continua só vendo os alarmes.`} />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (mode === 'active-other') {
    body = (
      <>
        <Card skin={skin}>
          <Heading skin={skin} text={`${managerName} cuida dos alarmes de ${personName}`} />
          <Muted skin={skin} text="Você vê a lista, mas só quem cuida dos alarmes pode mudá-la." />
        </Card>
        {readOnlySections}
      </>
    );
  } else if (list) {
    // active-mine
    const summary = listSummary(list, personName, now);
    const summaryTone = summary.tone === 'ok' ? c.success : summary.tone === 'pending' ? c.warning : c.error;
    const summaryIcon: IconName = summary.tone === 'ok' ? 'check-circle' : summary.tone === 'pending' ? 'schedule' : 'error';
    const rowFor = (a: ManagedAlarm) => {
      const status = alarmDeliveryStatus(list, a.id);
      return (
        <AlarmRow
          key={a.id}
          skin={skin}
          alarm={a}
          status={status}
          statusText={deliveryText(status, { name: personName, alarm: a, pendingSince: list.updatedAt, now })}
          onEdit={() => openEdit(a)}
          onToggle={() => handleToggle(a)}
        />
      );
    };
    const myMeds = medicationAlarms(list.alarms);
    const myChecks = checkinAlarms(list.alarms);
    body = (
      <>
        <Card skin={skin}>
          <View style={styles.statusRow}>
            <MaterialIcons name={summaryIcon} size={skin.icon} color={summaryTone} />
            <Text style={{ flex: 1, color: c.foreground, fontSize: skin.sz.body, fontFamily: BrandFonts.body }}>{summary.text}</Text>
          </View>
        </Card>
        <ActionButton skin={skin} variant="primary" label="Novo remédio" icon="add" onPress={() => openNew('medication')} />
        <ActionButton skin={skin} variant="outline" label="Novo check-in" icon="add" onPress={() => openNew('checkin')} />
        <Section skin={skin} title="Remédios">
          {myMeds.length === 0 ? <Muted skin={skin} text="Nenhum remédio na lista." /> : myMeds.map(rowFor)}
        </Section>
        <Section skin={skin} title="Check-ins">
          {myChecks.length === 0 ? <Muted skin={skin} text="Nenhum check-in na lista." /> : myChecks.map(rowFor)}
        </Section>
        <ActionButton skin={skin} variant="danger" label="Parar de cuidar dos alarmes" icon="block" onPress={askStop} />
      </>
    );
  } else {
    // Acordo ativo meu, mas a lista não veio: relê em vez de mostrar uma tela vazia.
    body = (
      <Card skin={skin}>
        <Muted skin={skin} text="A lista de alarmes ainda não carregou." />
        <ActionButton skin={skin} variant="outline" label="Tentar de novo" icon="refresh" onPress={() => { managed.refetch(); }} />
      </Card>
    );
  }

  return (
    <ScreenContainer edges={['top', 'left', 'right']} containerStyle={isAccessibilityMode ? { backgroundColor: ac.background } : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: skin.pad, gap: 12, paddingTop: 8, paddingBottom: insets.bottom + 32 }}
        refreshControl={<CaregiverRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <UpdatedAgoBar updatedAt={managed.dataUpdatedAt} refreshing={refreshing} onRefresh={onRefresh} />
        <View style={styles.headerRow}>
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            hitSlop={8}
            style={{ minWidth: skin.touch, minHeight: skin.touch, alignItems: 'center', justifyContent: 'center' }}
          >
            <MaterialIcons name="arrow-back" size={skin.icon + 2} color={c.foreground} />
          </Pressable>
          <Text
            accessibilityRole="header"
            style={{ flex: 1, color: c.foreground, fontSize: skin.sz.title, fontWeight: '800', fontFamily: BrandFonts.body }}
          >
            Alarmes de {personName}
          </Text>
        </View>
        {body}
      </ScrollView>
      <AlarmFormModal
        visible={formVisible}
        editingAlarm={editing}
        newKind={newKind}
        onCancel={() => setFormVisible(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </ScreenContainer>
  );
}

// --- Pedaços da tela ---------------------------------------------------------

function Card({ skin, children }: { skin: Skin; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: skin.c.surface, borderColor: skin.c.border, borderWidth: skin.bw, borderRadius: skin.radius, padding: skin.pad },
      ]}
    >
      {children}
    </View>
  );
}

function Heading({ skin, text }: { skin: Skin; text: string }) {
  return <Text style={{ color: skin.c.foreground, fontSize: skin.sz.heading, fontWeight: '700', fontFamily: BrandFonts.body }}>{text}</Text>;
}

function Muted({ skin, text }: { skin: Skin; text: string }) {
  return <Text style={{ color: skin.c.muted, fontSize: skin.sz.body, lineHeight: Math.round(skin.sz.body * 1.35), fontFamily: BrandFonts.body }}>{text}</Text>;
}

function Section({ skin, title, children }: { skin: Skin; title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: skin.c.foreground, fontSize: skin.sz.heading, fontWeight: '700', fontFamily: BrandFonts.body }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function ActionButton({
  skin, label, icon, variant, onPress,
}: { skin: Skin; label: string; icon: IconName; variant: 'primary' | 'outline' | 'danger'; onPress: () => void }) {
  const { c } = skin;
  const color = variant === 'primary' ? c.onPrimary : variant === 'danger' ? c.error : c.primary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        {
          minHeight: skin.touch,
          borderRadius: skin.radius,
          borderWidth: variant === 'primary' ? 0 : skin.bw,
          borderColor: variant === 'danger' ? c.error : c.primary,
          backgroundColor: variant === 'primary' ? c.primary : 'transparent',
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <MaterialIcons name={icon} size={skin.icon} color={color} />
      <Text style={{ color, fontSize: skin.sz.button, fontWeight: '700', fontFamily: BrandFonts.body }}>{label}</Text>
    </Pressable>
  );
}

function alarmName(a: ManagedAlarm): string {
  return (a.description ?? '').trim() || (a.kind === 'checkin' ? 'Check-in' : 'Remédio');
}

function alarmSubtitle(a: ManagedAlarm): string {
  const parts = [alarmRepeatLabel(a)];
  if (a.kind === 'checkin' && a.escalateAfterMinutes) parts.push(`avisa após ${a.escalateAfterMinutes} min`);
  if (!a.enabled) parts.push('Desligado');
  return parts.join(' · ');
}

function ReadOnlyRow({ skin, alarm }: { skin: Skin; alarm: ManagedAlarm }) {
  const { c, sz } = skin;
  return (
    <Card skin={skin}>
      <View style={styles.rowMain}>
        <Text style={{ color: c.foreground, fontSize: sz.time, fontWeight: '800', fontFamily: BrandFonts.body }}>{alarm.time}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: sz.body, fontWeight: '600', fontFamily: BrandFonts.body }}>{alarmName(alarm)}</Text>
          <Text style={{ color: c.muted, fontSize: sz.body, fontFamily: BrandFonts.body }}>{alarmSubtitle(alarm)}</Text>
        </View>
      </View>
    </Card>
  );
}

function AlarmRow({
  skin, alarm, status, statusText, onEdit, onToggle,
}: { skin: Skin; alarm: ManagedAlarm; status: DeliveryStatus; statusText: string; onEdit: () => void; onToggle: () => void }) {
  const { c, sz } = skin;
  const tone = status === 'confirmed' ? c.success : status === 'pending' ? c.warning : c.error;
  const statusIcon: IconName = status === 'confirmed' ? 'check-circle' : status === 'pending' ? 'schedule' : 'error';
  return (
    <Card skin={skin}>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={`Editar ${alarmName(alarm)} das ${alarm.time}`}
        style={({ pressed }) => [styles.rowMain, { minHeight: skin.touch, opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={{ color: c.foreground, fontSize: sz.time, fontWeight: '800', fontFamily: BrandFonts.body }}>{alarm.time}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.foreground, fontSize: sz.body, fontWeight: '600', fontFamily: BrandFonts.body }}>{alarmName(alarm)}</Text>
          <Text style={{ color: c.muted, fontSize: sz.body, fontFamily: BrandFonts.body }}>{alarmSubtitle(alarm)}</Text>
        </View>
        <MaterialIcons name="edit" size={skin.icon} color={c.muted} />
      </Pressable>
      <View style={styles.statusRow}>
        <MaterialIcons name={statusIcon} size={skin.icon} color={tone} />
        <Text style={{ flex: 1, color: c.foreground, fontSize: sz.body, fontFamily: BrandFonts.body }}>{statusText}</Text>
      </View>
      <ActionButton
        skin={skin}
        variant="outline"
        label={alarm.enabled ? 'Desligar' : 'Ligar'}
        icon={alarm.enabled ? 'notifications-off' : 'notifications-active'}
        onPress={onToggle}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  card: { gap: 10 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
```

**3f. `app/(caregiver-tabs)/person.tsx` — botão de entrada.** Depois do `<Text … linkInfo …>Vinculado via … em …</Text>` (e antes de `<Section icon="medication" title="Medicações" skin={skin}>`), acrescentar:

```tsx
        <Pressable
          onPress={() => router.push('/(caregiver-tabs)/managed-alarms' as never)}
          accessibilityRole="button"
          accessibilityLabel={`Alarmes de ${linked.displayName}`}
          style={({ pressed }) => [
            styles.manageEntry,
            { backgroundColor: c.surface, borderColor: c.primary, borderWidth: bw, minHeight: isAccessibilityMode ? 60 : 48, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <MaterialIcons name="alarm" size={icon.section} color={c.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.manageEntryTitle, { color: c.foreground, fontSize: sz.menuItem, fontFamily: BrandFonts.body }]}>
              Alarmes de {linked.displayName}
            </Text>
            <Text style={{ color: c.muted, fontSize: sz.body, fontFamily: BrandFonts.body }}>
              Ver e, se {linked.displayName} aceitar, cuidar dos alarmes
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={icon.section} color={c.muted} />
        </Pressable>

```

e, no `StyleSheet.create` do fim do arquivo, depois de `linkInfo: { paddingHorizontal: 4 },`:

```ts
  manageEntry: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  manageEntryTitle: { fontWeight: '700' },
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarms-caregiver.test.ts tests/caregiver-managed-alarms-screen.test.ts tests/caregiver-format.test.ts tests/caregiver-push-initializer.test.ts tests/caregiver-refresh.test.ts tests/caregiver-checkin-views.test.ts tests/ui-modo-acessivel.test.ts tests/ui-cores-token.test.ts tests/ui-font-minimum.test.ts`
Esperado: PASS (os testes de UI existentes cobrem a tela nova: `useAccessibility`, nenhum hex repetido, nenhum `fontSize` numérico abaixo de 15).

- [ ] **Passo 5: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos).

Se o `tsc` reclamar do tipo de `management`/`list` vindo do tRPC (por exemplo `status` como `string`), o ajuste é no router da Tarefa 6/7 (devolver os literais `'pending' | 'active'`), não um `as` na tela.

```bash
git add lib/managed-alarms-caregiver.ts "app/(caregiver-tabs)/managed-alarms.tsx" "app/(caregiver-tabs)/person.tsx" components/caregiver-push-initializer.tsx lib/caregiver-format.ts tests/managed-alarms-caregiver.test.ts tests/caregiver-managed-alarms-screen.test.ts tests/caregiver-format.test.ts
git commit -m "feat(cuidador): área Alarmes de [nome] para pedir, criar, editar e parar de cuidar dos alarmes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

## Tarefa 17: Segundo plano para aplicar os alarmes gerenciados (SÓ se o spike da Tarefa 0 confirmar)

**Depende de:** Tarefa 0 (resultado do spike, ver a porta abaixo), Tarefas 5 (`sendExpoDataPush`), 12 (`syncManagedAlarms`, `requestManagedSync`, `trpcQuery`/`trpcMutation` exportados, `REPLACE_ALARMS`/`SET_MANAGEMENT`) e 13 (`monitored-push-initializer` já trata o push em primeiro plano).

**Files:**
- Create: `lib/managed-alarms-push.ts` (puro: lê o tipo do push que a tarefa recebe; reducer mínimo para o estado salvo)
- Create: `lib/managed-alarms-background.ts` (define e registra a tarefa; roteia: app vivo ou sem interface)
- Create: `lib/managed-alarms-headless.ts` (aplica a lista com o app morto, sobre o estado salvo no AsyncStorage)
- Create: `components/managed-background-guard.tsx` (avisa o módulo de que a interface React existe)
- Modify: `index.ts` (importa o módulo cedo: o `expo-task-manager` recarrega o bundle em segundo plano)
- Modify: `app/(tabs)/_layout.tsx` (monta o guard)
- Modify: `app.config.ts` (`ios.infoPlist.UIBackgroundModes`)
- Modify: `package.json` e `pnpm-lock.yaml` (dependência nova `expo-task-manager`, via `CI=true pnpm add`)
- Test: `tests/managed-alarms-background.test.ts`

**Interfaces:**
- Consumes (Tarefa 12): `syncManagedAlarms(deps)` de `lib/managed-alarms-sync.ts` com `deps = { getLocal, getManagement, dispatch, schedule, cancel, fetchMine, ack }` e resultado `'applied'|'unchanged'|'not-managed'|'offline'`; `requestManagedSync(): void`; `trpcQuery(procedure, input)` e `trpcMutation(procedure, input)` de `lib/monitoring-service.ts` (devolvem `null` em falha, nunca lançam); ações `REPLACE_ALARMS` (payload `Alarm[]`) e `SET_MANAGEMENT` (payload `ManagementInfo | null`); chave `management` no estado persistido.
- Consumes (já existe): `scheduleFullAlarm`/`cancelFullAlarm` (`lib/alarm-sync.ts`), `appStateKeyFor` (`lib/app-state-storage.ts`), `Auth.getUserInfo()`, `Notifications.registerTaskAsync` (`expo-notifications` 0.32.17 já exporta).
- Produces: `MANAGED_ALARMS_TASK = 'vigora-managed-alarms'`; `setManagedAppAlive(alive: boolean): void` (`lib/managed-alarms-background.ts`); `runHeadlessManagedSync(): Promise<'applied'|'unchanged'|'not-managed'|'offline'>` (`lib/managed-alarms-headless.ts`); `managedPushTypeFromTask(payload: unknown): 'managed_alarms_updated' | 'ping' | null` e `applyHeadlessAction(state, action, now)` (`lib/managed-alarms-push.ts`).

- [ ] **Passo 1: PORTA — ler o resultado da Tarefa 0 antes de escrever qualquer coisa**

Abrir o resultado escrito do spike (Samsung A15 e iPhone 12, branch `spike/push-silencioso`) e responder às três perguntas da spec 9.1, por plataforma:

| Pergunta | Android (A15) | iOS (iPhone 12) |
|---|---|---|
| (a) O push silencioso (`_contentAvailable`, prioridade alta) chega com o app FECHADO (arrastado da lista de recentes no Android; encerrado no iOS)? | sim / não | sim / não |
| (b) A tarefa de `Notifications.registerTaskAsync` roda nesse cenário? | sim / não | sim / não |
| (c) De dentro da tarefa, o agendamento nativo (`scheduleFullAlarm`: AlarmManager no Android, AlarmKit/notificação no iOS) agenda de verdade, e o alarme toca? | sim / não | sim / não |

Decisão (anotar em uma linha na descrição do PR, Tarefa 19, e escolher a variante certa do parágrafo "Segundo plano" em `docs/claude/alarmes.md`, Tarefa 18 Passo 6):

- **(a), (b) e (c) = sim em alguma plataforma:** seguir os Passos 2 a 8. Em `BACKGROUND_PLATFORMS` (Passo 5) deixar só as plataformas em que as três deram sim.
- **Qualquer um = não em TODAS as plataformas:** **NÃO executar esta tarefa** (nem instalar a dependência, nem mexer em `index.ts`, `app.config.ts` ou no layout). A spec 9.1 já prevê isso: o push silencioso fica só como acelerador com o app aberto (Tarefa 13) e a entrega em segundo plano passa a depender da notificação visível de reserva do servidor (Tarefa 11, D7, 10 min depois). Escrever a variante "sem segundo plano" no doc, marcar a Tarefa 17 como "não aplicável" no PR e seguir para a Tarefa 18.
- **Só (c) = não:** é o caso "o silencioso só baixaria a lista". Baixar sem agendar não confirma nada (o `ack` só sai depois de agendar), então também NÃO executar.

Se a tarefa for executada, conferir no log do spike o formato exato do payload que a tarefa recebeu em cada plataforma (`data.dataString`, `data.type`, `data.body` ou `notification.request.content.data`) e, se for diferente dos quatro formatos cobertos no teste abaixo, acrescentar o formato real como um caso a mais antes de implementar.

- [ ] **Passo 2: Escrever o teste que falha**

Criar `tests/managed-alarms-background.test.ts`:

```ts
/**
 * Segundo plano dos alarmes gerenciados (spec 4.3 e 9.1). A parte nativa
 * (expo-task-manager) só se valida em aparelho; aqui ficam o que dá para provar
 * sem ele: o filtro do payload, o reducer do estado salvo e a fiação dos arquivos.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyHeadlessAction, managedPushTypeFromTask } from '../lib/managed-alarms-push';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('managedPushTypeFromTask — o payload que a tarefa recebe', () => {
  it('lê o tipo em data.dataString (JSON), em data.type, em data.body e em notification', () => {
    expect(managedPushTypeFromTask({ notification: null, data: { dataString: '{"type":"managed_alarms_updated","version":4}' } })).toBe('managed_alarms_updated');
    expect(managedPushTypeFromTask({ notification: null, data: { type: 'ping' } })).toBe('ping');
    expect(managedPushTypeFromTask({ notification: null, data: { body: '{"type":"managed_alarms_updated"}' } })).toBe('managed_alarms_updated');
    expect(
      managedPushTypeFromTask({ data: {}, notification: { request: { content: { data: { type: 'managed_alarms_updated' } } } } })
    ).toBe('managed_alarms_updated');
  });

  it('ignora push de outro tipo (alerta de cuidador, alarme)', () => {
    expect(managedPushTypeFromTask({ data: { dataString: '{"type":"alarm_changed"}' } })).toBeNull();
    expect(managedPushTypeFromTask({ data: { dataString: '{"alarmId":"a1"}' } })).toBeNull();
  });

  it('ignora o toque do usuário (resposta de notificação): o app aberto cuida', () => {
    expect(
      managedPushTypeFromTask({
        actionIdentifier: 'expo.modules.notifications.actions.DEFAULT',
        notification: { request: { content: { data: { type: 'managed_alarms_updated' } } } },
      })
    ).toBeNull();
  });

  it('lixo não lança', () => {
    for (const lixo of [null, undefined, 'x', 42, {}, { data: null }, { data: { dataString: '{{{' } }]) {
      expect(managedPushTypeFromTask(lixo)).toBeNull();
    }
  });
});

describe('applyHeadlessAction — estado salvo no AsyncStorage', () => {
  const saved = { alarms: [{ id: 'a1' }], settings: { fontSize: 'large' }, dataUpdatedAt: 5, management: null };

  it('REPLACE_ALARMS troca a lista e carimba dataUpdatedAt; o resto fica', () => {
    const next = applyHeadlessAction(saved, { type: 'REPLACE_ALARMS', payload: [{ id: 'b1' }, { id: 'b2' }] }, 1234);
    expect(next.alarms).toEqual([{ id: 'b1' }, { id: 'b2' }]);
    expect(next.dataUpdatedAt).toBe(1234);
    expect(next.settings).toEqual({ fontSize: 'large' });
  });

  it('SET_MANAGEMENT grava e null limpa, sem mexer em dataUpdatedAt', () => {
    const info = { caregiverName: 'Ana', since: 10, appliedVersion: 4 };
    const on = applyHeadlessAction(saved, { type: 'SET_MANAGEMENT', payload: info }, 99);
    expect(on.management).toEqual(info);
    expect(on.dataUpdatedAt).toBe(5);
    expect(applyHeadlessAction(on, { type: 'SET_MANAGEMENT', payload: null }, 99).management).toBeNull();
  });

  it('não muda o objeto original', () => {
    applyHeadlessAction(saved, { type: 'REPLACE_ALARMS', payload: [] }, 1);
    expect(saved.alarms).toEqual([{ id: 'a1' }]);
  });

  it('ação desconhecida falha alto em vez de ser ignorada', () => {
    expect(() => applyHeadlessAction(saved, { type: 'ADD_ALARM', payload: {} }, 1)).toThrow(/não suportada/);
  });
});

describe('fiação do segundo plano', () => {
  it('a tarefa é definida e registrada no escopo do módulo, e index.ts importa o módulo', () => {
    const bg = read('lib/managed-alarms-background.ts');
    expect(bg).toMatch(/defineTask\(MANAGED_ALARMS_TASK/);
    expect(bg).toMatch(/Notifications\.registerTaskAsync\(MANAGED_ALARMS_TASK\)/);
    expect(bg).toMatch(/BACKGROUND_PLATFORMS/);
    expect(bg).not.toMatch(/catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/);
    expect(read('index.ts')).toMatch(/import '\.\/lib\/managed-alarms-background';/);
  });

  it('com o app morto a lista local é gravada ANTES de confirmar ao servidor', () => {
    const headless = read('lib/managed-alarms-headless.ts');
    const persist = headless.indexOf('await persist()');
    const ack = headless.indexOf("trpcMutation('managedAlarms.ack'");
    expect(persist).toBeGreaterThan(-1);
    expect(ack).toBeGreaterThan(persist);
  });

  it('iOS acorda para push silencioso e a dependência nativa está declarada', () => {
    expect(read('app.config.ts')).toMatch(/"UIBackgroundModes":\s*\["remote-notification"\]/);
    expect(JSON.parse(read('package.json')).dependencies['expo-task-manager']).toBeTruthy();
  });

  it('o guard de interface é montado no layout do monitorado', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/<ManagedBackgroundGuard \/>/);
  });
});
```

- [ ] **Passo 3: Rodar e ver falhar**

Run: `pnpm vitest run tests/managed-alarms-background.test.ts`
Esperado: FAIL — `Failed to resolve import "../lib/managed-alarms-push"`.

- [ ] **Passo 4: Instalar a dependência nativa**

```bash
CI=true timeout 600 pnpm add expo-task-manager@~14.0.0
```

(`~14.0.x` é a linha do Expo SDK 54.) Se travar ou der erro de rede, **parar e reportar** (regra do projeto). Conferir o efeito:

```bash
git diff --stat package.json pnpm-lock.yaml
grep -n "expo-task-manager" package.json
```

Esperado: `package.json` ganha uma linha `"expo-task-manager": "~14.0.x"` e o lockfile só as entradas dessa dependência. É módulo nativo novo: a validação em aparelho (Tarefa 19) exige um build novo (EAS), não só reload do JS.

- [ ] **Passo 5: Implementar**

**5a. Criar `lib/managed-alarms-push.ts`** (puro, sem React Native):

```ts
/**
 * managed-alarms-push.ts
 *
 * Partes puras do segundo plano dos alarmes gerenciados: reconhecer o push que
 * acorda a tarefa e atualizar o estado salvo quando não há interface React.
 */

export type ManagedSyncPushType = 'managed_alarms_updated' | 'ping';

const SYNC_TYPES: ReadonlySet<string> = new Set<ManagedSyncPushType>(['managed_alarms_updated', 'ping']);

function typeOf(obj: unknown): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const t = (obj as { type?: unknown }).type;
  return typeof t === 'string' ? t : null;
}

/** O payload de dados chega como texto JSON em alguns formatos; texto inválido = não é nosso. */
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_invalid) {
    return null;
  }
}

/**
 * Que tipo de push acordou a tarefa? Só os de sincronização interessam. O
 * `expo-notifications` entrega ou o payload remoto (`data`, `notification`) ou
 * a resposta a um toque (`actionIdentifier`): o toque é tratado pelo app aberto.
 */
export function managedPushTypeFromTask(payload: unknown): ManagedSyncPushType | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as {
    actionIdentifier?: unknown;
    data?: Record<string, unknown> | null;
    notification?: { request?: { content?: { data?: unknown } } } | null;
  };
  if ('actionIdentifier' in p) return null;
  const candidates = [
    typeOf(p.data),
    typeOf(parseJson(p.data?.dataString)),
    typeOf(parseJson(p.data?.body)),
    typeOf(p.notification?.request?.content?.data),
  ];
  const found = candidates.find((t): t is string => !!t && SYNC_TYPES.has(t));
  return (found as ManagedSyncPushType | undefined) ?? null;
}

export type HeadlessAction = { type: string; payload?: unknown };

/**
 * O mínimo do reducer do app que `syncManagedAlarms` usa (REPLACE_ALARMS e
 * SET_MANAGEMENT), aplicado ao JSON salvo em `vigora_app_state:<openId>`. Ação
 * desconhecida lança: ignorar em silêncio deixaria a lista meio aplicada.
 */
export function applyHeadlessAction(
  state: Record<string, unknown>,
  action: HeadlessAction,
  now: number
): Record<string, unknown> {
  switch (action.type) {
    case 'REPLACE_ALARMS':
      return { ...state, alarms: action.payload, dataUpdatedAt: now };
    case 'SET_MANAGEMENT':
      return { ...state, management: action.payload ?? null };
    default:
      throw new Error(`Ação não suportada em segundo plano: ${action.type}`);
  }
}
```

**5b. Criar `lib/managed-alarms-headless.ts`:**

```ts
/**
 * managed-alarms-headless.ts
 *
 * Aplica a lista gerenciada quando o app foi acordado em segundo plano SEM
 * interface React (o processo estava morto). Não há AppProvider: o estado vem
 * do AsyncStorage (a mesma chave por conta que o app grava) e volta para lá.
 * O resto do trabalho é o mesmo `syncManagedAlarms` do app aberto.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Auth from '@/lib/_core/auth';
import { cancelFullAlarm, scheduleFullAlarm } from '@/lib/alarm-sync';
import type { Alarm } from '@/lib/app-context';
import { appStateKeyFor } from '@/lib/app-state-storage';
import { applyHeadlessAction, type HeadlessAction } from '@/lib/managed-alarms-push';
import { syncManagedAlarms } from '@/lib/managed-alarms-sync';
import { trpcMutation, trpcQuery } from '@/lib/monitoring-service';

type SyncDeps = Parameters<typeof syncManagedAlarms>[0];
type SyncResult = Awaited<ReturnType<typeof syncManagedAlarms>>;

export async function runHeadlessManagedSync(now: () => number = Date.now): Promise<SyncResult> {
  const user = await Auth.getUserInfo().catch((err) => {
    // Keychain bloqueado (aparelho trancado) é o caso comum: sem conta não há o que aplicar.
    console.warn('[managed-bg] não foi possível ler a conta:', err instanceof Error ? err.name : typeof err);
    return null;
  });
  // Cuidador não tem alarmes; sem conta (ou com o keychain bloqueado) não há o que aplicar.
  if (!user || user.userType === 'caregiver') return 'not-managed';

  const key = appStateKeyFor(user.openId);
  const raw = key ? await AsyncStorage.getItem(key) : null;
  // Sem estado salvo a conta nunca abriu o app neste aparelho: o app aberto resolve.
  if (!key || !raw) return 'not-managed';

  let working: Record<string, unknown>;
  try {
    working = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    console.warn('[managed-bg] estado salvo ilegível:', err instanceof Error ? err.name : typeof err);
    return 'not-managed';
  }

  const persist = () => AsyncStorage.setItem(key, JSON.stringify(working));

  const deps: SyncDeps = {
    getLocal: () => (Array.isArray(working.alarms) ? (working.alarms as Alarm[]) : []),
    getManagement: () => (working.management ?? null) as ReturnType<SyncDeps['getManagement']>,
    dispatch: (action: HeadlessAction) => {
      working = applyHeadlessAction(working, action, now());
    },
    schedule: scheduleFullAlarm,
    cancel: cancelFullAlarm,
    fetchMine: () => trpcQuery('managedAlarms.mine', undefined),
    ack: async (version, failedAlarmIds) => {
      // A lista local precisa estar gravada antes de o servidor ser avisado: se o
      // processo morrer entre os dois passos, o app reaplica; o contrário deixaria
      // o servidor achando que o celular já tem uma lista que ele não guardou.
      await persist();
      const confirmed = await trpcMutation('managedAlarms.ack', { version, failedAlarmIds });
      // trpcMutation devolve null em falha (rede, 401): sem resposta não houve confirmação.
      if (confirmed == null) throw new Error('ack sem resposta do servidor');
    },
  };

  const result = await syncManagedAlarms(deps);
  await persist(); // SET_MANAGEMENT (acordo encerrado, nome mudou) também precisa ficar salvo
  return result;
}
```

**5c. Criar `lib/managed-alarms-background.ts`:**

```ts
/**
 * managed-alarms-background.ts
 *
 * Segundo plano dos alarmes gerenciados (spec 4.3). O servidor manda um push
 * silencioso (`managed_alarms_updated`) a cada gravação do cuidador; esta tarefa
 * acorda o app e aplica a lista sem ninguém abrir o Vigora.
 *
 * Este módulo é importado por `index.ts`: o `expo-task-manager` recarrega o
 * bundle em segundo plano e a tarefa precisa estar definida no escopo do módulo.
 * Por isso aqui só entra o que é leve; o trabalho pesado é importado sob demanda.
 *
 * Dois casos quando a tarefa roda:
 *  - interface React viva (app em primeiro ou segundo plano): delega ao
 *    `requestManagedSync()`, que usa o estado em memória (o reducer é a fonte);
 *  - sem interface (processo morto): `runHeadlessManagedSync()` trabalha sobre o
 *    estado salvo.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { managedPushTypeFromTask } from '@/lib/managed-alarms-push';

export const MANAGED_ALARMS_TASK = 'vigora-managed-alarms';

// Plataformas em que o spike da Tarefa 0 confirmou: push chega com o app
// fechado, a tarefa roda e o agendamento nativo funciona dentro dela.
const BACKGROUND_PLATFORMS: string[] = ['android', 'ios'];

let appAlive = false;

/** O guard de interface avisa quando a árvore React existe (montada/desmontada). */
export function setManagedAppAlive(alive: boolean): void {
  appAlive = alive;
}

function warnFailed(what: string, err: unknown) {
  console.warn(`[managed-bg] ${what}`, err instanceof Error ? err.name : typeof err);
}

if (BACKGROUND_PLATFORMS.includes(Platform.OS)) {
  // require sob a guarda de plataforma: o módulo nativo não existe na web.
  const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');

  TaskManager.defineTask(MANAGED_ALARMS_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[managed-bg] a tarefa recebeu erro:', error.code);
      return;
    }
    if (!managedPushTypeFromTask(data)) return; // outros pushes não são conosco
    try {
      if (appAlive) {
        const { requestManagedSync } = await import('@/lib/managed-alarms-sync');
        requestManagedSync();
        return;
      }
      const { runHeadlessManagedSync } = await import('@/lib/managed-alarms-headless');
      const result = await runHeadlessManagedSync();
      console.log('[managed-bg] sincronização sem interface:', result);
    } catch (err) {
      warnFailed('sincronização falhou:', err);
    }
  });

  Notifications.registerTaskAsync(MANAGED_ALARMS_TASK).catch((err) => warnFailed('registro da tarefa falhou:', err));
}
```

**5d. Criar `components/managed-background-guard.tsx`:**

```tsx
/**
 * managed-background-guard.tsx
 *
 * Invisível. Enquanto a árvore React do monitorado existe, a tarefa em segundo
 * plano delega ao app aberto (estado em memória) em vez de mexer no estado salvo.
 */
import { useEffect } from 'react';
import { setManagedAppAlive } from '@/lib/managed-alarms-background';

export function ManagedBackgroundGuard() {
  useEffect(() => {
    setManagedAppAlive(true);
    return () => setManagedAppAlive(false);
  }, []);
  return null;
}
```

**5e. `index.ts`** — depois de `import { widgetTaskHandler } from './widgets/widget-task-handler';`, acrescentar:

```ts
// Tarefa de segundo plano dos alarmes gerenciados (push silencioso). Precisa ser
// avaliada no escopo do módulo, no bundle carregado pelo expo-task-manager.
import './lib/managed-alarms-background';
```

**5f. `app/(tabs)/_layout.tsx`** — acrescentar o import junto dos outros:

```tsx
import { ManagedBackgroundGuard } from "@/components/managed-background-guard";
```

e montar depois do `MicFab` (a Tarefa 13 já pôs o `MonitoredPushInitializer` no mesmo `View`; esta linha não depende dele):

```tsx
      <MicFab bottomOffset={86} />
      <ManagedBackgroundGuard />
```

**5g. `app.config.ts`** — em `ios.infoPlist`, depois de `"ITSAppUsesNonExemptEncryption": false,`:

```ts
      "ITSAppUsesNonExemptEncryption": false,
      // Push silencioso (Fase 4): sem este modo o iOS não acorda o app para a
      // tarefa que aplica os alarmes gerenciados (lib/managed-alarms-background.ts).
      "UIBackgroundModes": ["remote-notification"],
```

Se o spike mostrou que o `BACKGROUND_PLATFORMS` deve ter uma plataforma só, ajustar a constante (5c) e, se for só Android, **não** acrescentar o `UIBackgroundModes`.

- [ ] **Passo 6: Rodar e ver passar**

Run: `pnpm vitest run tests/managed-alarms-background.test.ts`
Esperado: PASS.

- [ ] **Passo 7: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos).

```bash
git add lib/managed-alarms-push.ts lib/managed-alarms-background.ts lib/managed-alarms-headless.ts components/managed-background-guard.tsx index.ts "app/(tabs)/_layout.tsx" app.config.ts package.json pnpm-lock.yaml tests/managed-alarms-background.test.ts
git commit -m "feat(alarmes): aplica os alarmes gerenciados em segundo plano com push silencioso" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

- [ ] **Passo 8: Repetir o cenário do spike com o código real**

Fazer um build novo (módulo nativo novo) e repetir, no Samsung A15 e no iPhone 12, o cenário que o spike usou: app fechado, o cuidador grava um alarme, o alarme aparece no celular do idoso sem abrir o Vigora e o cuidador vê "Tudo certo no celular de [nome]". Esse passo é o item 2 do checklist da Tarefa 19. Se não funcionar com o código real, reverter este commit (`git revert`) e tratar como a decisão "sem segundo plano" do Passo 1.

## Tarefa 18: Textos legais verdadeiros (Política de Privacidade, anamnese, Ajuda) e documentação

**Depende de:** nenhuma (os textos descrevem o que o produto passa a fazer; só entram no app junto com o PR da fase). Rodar depois das Tarefas 1 a 16 para a documentação (Passo 6) refletir o que foi de fato implementado.

**Files:**
- Modify: `app/(tabs)/settings.tsx` (texto da Política de Privacidade, linha ~1452)
- Modify: `app/(tabs)/anamnesis.tsx` (aviso da ficha, linha 512)
- Modify: `components/help-screen.tsx` (pergunta "Meus dados médicos são seguros?", linha 131)
- Modify: `docs/claude/alarmes.md` (seção nova da Fase 4 + o parágrafo "Registro do próximo disparo ao voltar ao app")
- Modify: `docs/claude/roadmap.md` (item da Fase 4)
- Test: `tests/privacy-policy-push.test.ts`

**Interfaces:**
- Consumes: nada de código.
- Produces: nada que outra tarefa use. Decisão D10 da spec e seção 7 (LGPD): as duas afirmações erradas de hoje (SMS pela Twilio não citado; "nenhum dado sai do aparelho" com backup em nuvem existindo) deixam de existir.

**Os textos finais (PT-BR), para conferência antes de editar:**

*Política de Privacidade (resumo)* — o diálogo do rodapé de Configurações. O que muda em relação ao texto atual está em negrito aqui; no código vai sem marcação:

> Vigora — Política de Privacidade (resumo)
>
> Dados que tratamos:
> • Dados sensíveis de saúde (pressão, glicemia, frequência cardíaca, anamnese, medicamentos, tipo sanguíneo), tratados com seu consentimento destacado.
> • Contatos de emergência, localização (quando ativada), perfil **e o fuso horário do aparelho (guardado para calcular a hora certa dos seus alarmes)**.
>
> Onde ficam: no seu aparelho e, para backup e para o monitoramento funcionar, em nosso servidor próprio (acesso protegido por autenticação). Nunca vendemos nem usamos seus dados de saúde para publicidade.
>
> Compartilhamos apenas para a função que você pediu: WhatsApp/Meta **e Twilio (alertas por mensagem e SMS aos contatos de emergência que você designou)**, Expo, Google e Apple (notificações push aos cuidadores — o aviso de lembrete alterado pode mostrar o nome do lembrete) e RevenueCat (assinatura).
>
> **Cuidador e seus alarmes: um cuidador vinculado só pode criar, mudar ou apagar os seus alarmes se você aceitar o pedido dele no aplicativo. Você pode parar quando quiser em Configurações, e ele é avisado.**
>
> **Verificação diária: uma vez por dia o servidor manda ao seu celular um aviso silencioso, sem texto e sem som, só para saber se o Vigora ainda está no aparelho. Se não estiver, os avisos automáticos aos seus contatos ficam pausados e seu cuidador é avisado.**
>
> Seus direitos (LGPD Art. 18): acessar, corrigir, exportar e excluir. Você pode apagar sua conta e todos os dados do servidor em Configurações › Excluir minha conta.
>
> Encarregado de Dados (DPO): privacidade@vigora.com.br. Fale com ele para exercer seus direitos ou tirar dúvidas sobre privacidade.

*Aviso da ficha de anamnese:* "Seus dados ficam neste aparelho e numa cópia de segurança no servidor do Vigora, protegida por autenticação. Só saem daí para outras pessoas quando você compartilha a ficha ou vincula um cuidador."

*Ajuda, "Meus dados médicos são seguros?":* "Seus dados ficam no seu celular e numa cópia de segurança no servidor do Vigora, protegida por autenticação. Nunca vendemos nem usamos seus dados para propaganda. Eles só chegam a outras pessoas quando você compartilha a ficha ou vincula um cuidador."

(Desvio consciente da spec 7: a spec diz "só saem para outras pessoas quando você compartilha a ficha", mas o cuidador vinculado também vê a anamnese na tela da pessoa (`person.tsx`). Dizer só a primeira metade seria trocar uma afirmação falsa por outra. A resposta da Ajuda também deixa de começar com "Sim!": "Garante segurança" está na lista de marketing proibido.)

- [ ] **Passo 1: Escrever os testes que falham**

Substituir o conteúdo de `tests/privacy-policy-push.test.ts` por:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const settings = read('app', '(tabs)', 'settings.tsx');

describe('Política de Privacidade (Configurações)', () => {
  it('cita os provedores de push e avisa que o nome do lembrete pode aparecer', () => {
    expect(settings).toMatch(/Expo, Google e Apple \(notificações push aos cuidadores/);
    expect(settings).toMatch(/pode mostrar o nome do lembrete/);
  });

  it('cita a Twilio (SMS aos contatos de emergência) ao lado do WhatsApp/Meta', () => {
    expect(settings).toMatch(
      /WhatsApp\/Meta e Twilio \(alertas por mensagem e SMS aos contatos de emergência que você designou\)/
    );
    expect(settings).not.toMatch(/WhatsApp\/Meta \(alertas aos contatos/);
  });

  it('diz que o cuidador só edita os alarmes com o consentimento da pessoa, e que ela pode parar', () => {
    expect(settings).toMatch(/só pode criar, mudar ou apagar os seus alarmes se você aceitar o pedido dele no aplicativo/);
    expect(settings).toMatch(/Você pode parar quando quiser em Configurações, e ele é avisado\./);
  });

  it('descreve a verificação diária silenciosa', () => {
    expect(settings).toMatch(/uma vez por dia o servidor manda ao seu celular um aviso silencioso, sem texto e sem som/);
    expect(settings).toMatch(/os avisos automáticos aos seus contatos ficam pausados/);
  });

  it('diz que o fuso horário do aparelho é guardado e para quê', () => {
    expect(settings).toMatch(/fuso horário do aparelho \(guardado para calcular a hora certa dos seus alarmes\)/);
  });
});

describe('textos que falavam de "nenhum dado sai do aparelho" (D10)', () => {
  const anamnesis = read('app', '(tabs)', 'anamnesis.tsx');
  const help = read('components', 'help-screen.tsx');

  it('a ficha de anamnese não afirma mais que nada vai para servidores externos', () => {
    expect(anamnesis).not.toMatch(/armazenados apenas localmente/);
    expect(anamnesis).not.toMatch(/nunca são enviados para servidores externos/);
    expect(anamnesis).toMatch(/numa cópia de segurança no servidor do Vigora, protegida por autenticação/);
    expect(anamnesis).toMatch(/quando você compartilha a ficha ou vincula um cuidador/);
  });

  it('a Ajuda diz a verdade sobre onde ficam os dados', () => {
    expect(help).not.toMatch(/Nenhuma informação é enviada para servidores externos/);
    expect(help).not.toMatch(/Todos os dados são armazenados localmente/);
    expect(help).toMatch(/Seus dados ficam no seu celular e numa cópia de segurança no servidor do Vigora, protegida por autenticação\./);
    expect(help).toMatch(/Nunca vendemos nem usamos seus dados para propaganda\./);
  });

  it('a resposta da Ajuda não promete segurança absoluta (marketing proibido)', () => {
    const answer = help.match(/question: 'Meus dados médicos são seguros\?',\s*answer: '([^']*)'/);
    expect(answer).not.toBeNull();
    expect(answer![1]).not.toMatch(/^Sim!/);
    expect(answer![1]).not.toMatch(/garant/i);
  });
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/privacy-policy-push.test.ts`
Esperado: FAIL nos asserts novos (`WhatsApp\/Meta e Twilio …` não encontrado; `armazenados apenas localmente` ainda presente em `anamnesis.tsx`; `Nenhuma informação é enviada para servidores externos` ainda presente em `help-screen.tsx`). Os dois asserts antigos da Política continuam passando.

- [ ] **Passo 3: Implementar os textos**

**3a. `app/(tabs)/settings.tsx`** — o diálogo "Política de Privacidade" é um único literal em uma linha, que aparece UMA vez no arquivo. Duas trocas de trecho dentro dele (nos literais abaixo, `\n` são os dois caracteres barra-n do código-fonte):

1) Trocar

```
• Contatos de emergência, localização (quando ativada) e perfil.\n\nOnde ficam:
```

por

```
• Contatos de emergência, localização (quando ativada), perfil e o fuso horário do aparelho (guardado para calcular a hora certa dos seus alarmes).\n\nOnde ficam:
```

2) Trocar

```
WhatsApp/Meta (alertas aos contatos que você designou), Expo, Google e Apple (notificações push aos cuidadores — o aviso de lembrete alterado pode mostrar o nome do lembrete) e RevenueCat (assinatura).\n\nSeus direitos
```

por

```
WhatsApp/Meta e Twilio (alertas por mensagem e SMS aos contatos de emergência que você designou), Expo, Google e Apple (notificações push aos cuidadores — o aviso de lembrete alterado pode mostrar o nome do lembrete) e RevenueCat (assinatura).\n\nCuidador e seus alarmes: um cuidador vinculado só pode criar, mudar ou apagar os seus alarmes se você aceitar o pedido dele no aplicativo. Você pode parar quando quiser em Configurações, e ele é avisado.\n\nVerificação diária: uma vez por dia o servidor manda ao seu celular um aviso silencioso, sem texto e sem som, só para saber se o Vigora ainda está no aparelho. Se não estiver, os avisos automáticos aos seus contatos ficam pausados e seu cuidador é avisado.\n\nSeus direitos
```

O resto do literal (direitos, DPO) fica como está.

Conferir que sobrou uma única ocorrência de cada frase nova:

```bash
grep -c "WhatsApp/Meta e Twilio" "app/(tabs)/settings.tsx"
```

Esperado: `1`.

**3b. `app/(tabs)/anamnesis.tsx`** (linha 512) — trocar

```
                  Seus dados são armazenados apenas localmente neste dispositivo e nunca são enviados para servidores externos.
```

por

```
                  Seus dados ficam neste aparelho e numa cópia de segurança no servidor do Vigora, protegida por autenticação. Só saem daí para outras pessoas quando você compartilha a ficha ou vincula um cuidador.
```

**3c. `components/help-screen.tsx`** (linha 131) — trocar

```
        answer: 'Sim! Todos os dados são armazenados localmente no seu celular. Nenhuma informação é enviada para servidores externos. Apenas quando você escolhe compartilhar a ficha é que os dados saem do seu dispositivo.',
```

por

```
        answer: 'Seus dados ficam no seu celular e numa cópia de segurança no servidor do Vigora, protegida por autenticação. Nunca vendemos nem usamos seus dados para propaganda. Eles só chegam a outras pessoas quando você compartilha a ficha ou vincula um cuidador.',
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `pnpm vitest run tests/privacy-policy-push.test.ts tests/ui-font-minimum.test.ts tests/ui-cores-token.test.ts`
Esperado: PASS.

- [ ] **Passo 5: Conferir o diálogo à mão**

Abrir o app (emulador ou aparelho), Configurações, rodapé, "Privacidade": o texto novo cabe no diálogo, rola até o fim e o botão OK continua visível, nos temas claro e escuro e com a fonte grande. (O diálogo só existe no ramo normal de Configurações: no modo acessível o rodapé de links legais não aparece. Isso já era assim antes desta fase e está registrado nas notas da parte E.)

- [ ] **Passo 6: Documentação**

**6a. `docs/claude/alarmes.md`** — no parágrafo "Registro do próximo disparo ao voltar ao app", trocar

```
registra o disparo seguinte. **Lacuna que fica (Fase 4):** alarme que toca sem
ninguém interagir — o seguinte só é registrado na próxima abertura; a escada de
30 min / 2 h / 6 h cobre o intervalo. O fechamento definitivo é o servidor
calcular os disparos sozinho.
```

por

```
registra o disparo seguinte. **Fechado na Fase 4:** o servidor também calcula e
registra o próximo disparo de todas as contas (seção "Gerenciamento pelo
cuidador…" abaixo); o registro pelo app continua e os dois convergem no mesmo
evento (janela de 2 h). A escada de 30 min / 2 h / 6 h segue como rede de
segurança.
```

e acrescentar, no fim do arquivo (depois do último parágrafo, "Telemetria"), a seção abaixo. **Escolher UMA das duas variantes do parágrafo "Segundo plano"**, conforme a decisão do Passo 1 da Tarefa 17, e apagar a outra:

```markdown

## Gerenciamento pelo cuidador e disparos calculados pelo servidor (Fase 4, out/2026)

Spec: `docs/superpowers/specs/2026-10-06-fase-4-cuidador-gerencia-alarmes-design.md`
(plano de implementação na mesma pasta `docs/superpowers/plans/`). O cuidador
cria, edita, desliga e apaga os remédios e check-ins do idoso **com o aceite
dele**; o celular do idoso aplica e confirma; e o servidor passa a calcular os
disparos de todas as contas, pausando quando o aparelho some.

### O acordo (`alarm_management`)

- O cuidador pede (`managedAlarms.request`); o idoso aceita ou recusa no celular
  dele (`managedAlarms.respond`). Um pedido `pending` ou acordo `active` por
  idoso (checado em transação). Só cuidador **vinculado ativo** pede. Pedido sem
  resposta vence em 7 dias (`expired`, pelo job).
- Saídas, com o motivo gravado em `endedReason`: `declined`, `expired`,
  `cancelled`, `stopped_by_monitored` (Configurações → "Parar"),
  `stopped_by_caregiver`, `unlinked` (`link.revokeLink` encerra o acordo aberto
  do par) e `account_deleted`. Quem não saiu é avisado por push.
- O histórico fica enquanto a conta existir (prova do consentimento, LGPD Art.
  8º), entra na exportação (`acordosDeGerenciamento`) e some na exclusão de
  conta, como idoso ou como cuidador.
- ⚠️ Fechar o diálogo do pedido (toque fora, botão voltar) **não é recusar**:
  o `AppDialog` chama `onDismiss` em qualquer saída. Só o botão "Agora não"
  recusa; fechar deixa o pedido pendente e ele volta na próxima abertura.

### A lista gerenciada (`managed_alarm_lists`)

- Uma linha por idoso com acordo ativo: `version` sobe a cada gravação do
  cuidador; `alarms` é a lista completa; `appliedVersion`/`appliedAlarms`/
  `failedAlarmIds` são o que o **celular confirmou**.
- Rotas `managedAlarms.createAlarm/updateAlarm/deleteAlarm`: o idoso alvo vem do
  **vínculo** do cuidador, nunca do input (IDOR); só o cuidador do acordo ativo
  grava. `baseVersion` diferente da atual -> `CONFLICT` ("A lista mudou. Confira
  de novo."); a tela do cuidador relê e avisa. Ids novos são UUID gerados pelo
  servidor (o AlarmKit exige UUID); check-in é sempre diário; máx. 24 alarmes.
- ⚠️ **Com acordo ativo o `userData.put` não roda o `diffAlarms`** (nem grava
  `alarm_changes`, nem manda push). Cada gravação do cuidador já se registrou com
  ele como autor (`alarm_changes.changedByOpenId`, tipo `created` incluído); sem
  esta regra o celular da Maria, ao aplicar o que a Ana apagou, geraria "Maria
  apagou…". Os **outros** cuidadores recebem `alarm_changed` dizendo quem mudou;
  o autor não é avisado da própria mudança.

### Entrega e confirmação no celular

- Cada gravação manda um push **silencioso** ao celular do idoso
  (`sendExpoDataPush`, `type: 'managed_alarms_updated'`). Se em 10 min
  `appliedVersion < version`, o job manda uma notificação **visível** de reserva
  ("Abra o Vigora para as mudanças valerem") e marca
  `visibleNoticeSentForVersion`. Nenhuma notificação ao idoso leva nome de remédio.
- O app também busca ao abrir, ao voltar ao primeiro plano (1×/min), ao tocar na
  notificação e logo depois de aceitar (`lib/managed-alarms-sync.ts`).
- `planManagedApply` (puro) compara por id: cancela os removidos e alterados,
  agenda os novos e alterados. **Um alarme que o sistema recusar não para os
  outros**: entra em `failedAlarmIds`. O `ack` só sai **depois** de a lista local
  ser trocada; `ack` de versão menor que a já aplicada é ignorado.
- ⚠️ **O dead man's switch só cobra o que foi confirmado**: o servidor calcula
  os disparos de `appliedAlarms` menos `failedAlarmIds` (só os `enabled`). Um
  alarme que ainda não chegou ao celular nunca é cobrado, senão a família seria
  avisada de um alarme que não tocou por culpa do sistema.
- `state.management` fica no estado persistido do app, mas **não vai para o
  backup** em nuvem. Com ele, as listas de Remédios e Check-in viram só leitura
  (sem adicionar, desligar ou excluir) e Configurações mostra "[Nome] cuida dos
  seus alarmes" com "Parar". A tela do alarme tocando não muda.
- O cuidador vê por alarme e no topo: "Tudo certo no celular de X", "Ainda não
  chegou ao celular de X (desde HH:MM)" (+ "Peça para X abrir o Vigora" depois de
  12 h) ou "não conseguiu agendar: [lembrete] [horário]"
  (`lib/managed-alarms-caregiver.ts`).

<!-- VARIANTE A: o spike da Tarefa 0 confirmou o segundo plano -->
**Segundo plano.** `lib/managed-alarms-background.ts` define (no escopo do
módulo, importado por `index.ts`) a tarefa do `expo-task-manager` que o
`Notifications.registerTaskAsync` liga ao push silencioso: com o app **vivo** ela
delega ao `requestManagedSync()` (o estado em memória é a fonte); com o app
**morto** ela roda `lib/managed-alarms-headless.ts`, que aplica sobre o estado
salvo no AsyncStorage e grava a lista local **antes** do `ack`. Exige
`UIBackgroundModes: remote-notification` no iOS e um build novo (módulo nativo).
O sistema pode não entregar o push silencioso (economia de bateria, limite de
envios): a notificação visível de reserva continua sendo a garantia.

<!-- VARIANTE B: o spike NÃO confirmou o segundo plano (apagar a variante A) -->
**Segundo plano: não existe.** O spike da Tarefa 0 mostrou que o push silencioso
não acorda o app (ou que o agendamento nativo não funciona fora dele), então o
silencioso só acelera o caso do app aberto e a entrega com o app fechado depende
da notificação visível de reserva (10 min) e de o idoso abrir o Vigora. Não
reintroduza `expo-task-manager` sem refazer o spike (spec 9.1).

### O servidor calcula os disparos

- `shared/alarm-schedule.ts` é a **única** regra de dias e horários
  (`nextFireMs`/`lastFireMs` com fuso; 0 = domingo). O app usa o fuso do
  aparelho, o servidor o da conta (`user_data.timezone`, enviado em todo
  `userData.put`; sem fuso: `America/Sao_Paulo`). Não reimplemente a lista de
  dias: a duplicação dela já fez todo alarme semanal tocar um dia depois.
- A cada rodada do job (5 min), para cada conta de **idoso não pausada** com sinal
  nas últimas 48 h, `runPreRegistration` registra o **próximo** disparo de cada
  alarme (`ensureServerAlarmEvent`), com `kind` e `graceMinutes`. A lista é a
  confirmada (contas gerenciadas) ou o backup (as demais).
- ⚠️ **Um disparo, um evento**: se já existe evento (pendente ou resolvido) do
  mesmo `alarmId` a menos de 2 h (`SAME_FIRING_WINDOW_MINUTES`) do horário
  calculado, o servidor não cria outro. Cobre a diferença de fuso entre aparelho
  e conta (viagem, fuso desatualizado); um segundo evento expiraria e acusaria a
  pessoa à toa. `createAlarmEvent` não foi alterado.

### Pausas (o servidor para de cobrar quando o aparelho sumiu)

Campos `dmsPausedReason`, `dmsPausedAt` e `pauseNoticeSentAt` em
`account_liveness` (ao lado de `lastSeenAt`, que o Passo 1 do job já usa).

| Motivo | Quando |
|---|---|
| `logged_out` | na hora: o app chama `monitoring.deviceSignedOut` antes de limpar a sessão |
| `app_removed` | a verificação diária (push silencioso `ping` + recibos do Expo) apagou o último token por `DeviceNotRegistered` e a conta ficou sem nenhum |
| `no_signal` | `lastSeenAt` há mais de 48 h |

- ⚠️ Conta de app antigo, que **nunca** registrou token, **não** é pausada como
  `app_removed` (contar "zero tokens" pausaria todo idoso em versão antiga).
- Ao pausar: os eventos pendentes **futuros** são apagados; os que já venceram
  seguem a escada normal; cada cuidador vinculado recebe **uma** notificação
  (`pauseNoticeSentAt`). Qualquer sinal retoma sozinho (`touchLiveness`:
  heartbeat, `userData.put`, `createEvent`, `confirmEvent`, `managedAlarms.ack`,
  `push.register`). O idoso não recebe nada sobre a pausa.
- Os ids dos tickets do `ping` ficam em memória do processo: um deploy entre o
  envio e a leitura dos recibos só adia a verificação em um dia.

### LGPD

Consentimento = o aceite, com data e hora, revogável pelo idoso a qualquer
momento. Tabelas novas entram na exclusão de conta e na exportação
(`tests/alarm-changes-lifecycle.test.ts` é o modelo). A Política de Privacidade
(Configurações) cita a Twilio, a edição com consentimento, a verificação diária e
o fuso guardado; a ficha de anamnese e a Ajuda dizem que há cópia de segurança no
servidor (`tests/privacy-policy-push.test.ts`).
```

**6b. `docs/claude/roadmap.md`** — trocar

```
- [ ] **Fase 4 (spec própria, ainda não escrita):** cuidador cria/edita/exclui os
      alarmes do monitorado, modo "gerenciado pelo cuidador" e o servidor
      calculando os disparos sozinho (fecha o registro do próximo disparo sem
      depender do app).
```

por

```
- [x] **Fase 4 entregue (código):** o cuidador cria/edita/desliga/apaga os
      alarmes do monitorado com o aceite dele, e o servidor calcula os disparos
      de todas as contas e pausa quando o aparelho some (spec
      `docs/superpowers/specs/2026-10-06-fase-4-cuidador-gerencia-alarmes-design.md`;
      detalhes em `docs/claude/alarmes.md`).
- [ ] **Validar a Fase 4 no aparelho** (checklist da seção 9 da spec: pedir,
      aceitar, editar com o app fechado, falha de agendamento, logout,
      desinstalar e quanto tempo o token leva para morrer, um dia sem abrir o app).
```

- [ ] **Passo 7: Suíte, tipos e commit**

Run: `pnpm test && pnpm check` (só os 5 erros TS2307 `expo-alarm-countdown` já existentes são permitidos).

```bash
git add "app/(tabs)/settings.tsx" "app/(tabs)/anamnesis.tsx" components/help-screen.tsx docs/claude/alarmes.md docs/claude/roadmap.md tests/privacy-policy-push.test.ts
git commit -m "docs(privacidade): cita a Twilio, o acordo do cuidador, a verificação diária e a cópia no servidor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

## Tarefa 19: Verificação final, PR e checklist de aparelho

**Depende de:** Tarefas 0 a 18 (a 17 só se foi executada).

**Files:** nenhum arquivo de código. Esta tarefa só confere o que as outras entregaram, abre o PR e registra o que o aparelho mostrou. Se a verificação achar algo, a correção vai num commit na tarefa dona do defeito (ou num commit `fix:` próprio), nunca "de passagem".

**Interfaces:** consome tudo; produz o PR `fase-4/gerenciamento` -> `fix/launch-prep` e o registro do checklist (na descrição do PR).

- [ ] **Passo 1: Estado do branch**

```bash
git switch fase-4/gerenciamento
git status --short
git log --oneline fix/launch-prep..HEAD
```

Esperado: árvore limpa; um ou mais commits por tarefa (1 a 18; sem a 17 se o spike mandou pular), todos já com `git push` feito (`git status -sb` não mostra `ahead`).

- [ ] **Passo 2: Suíte de testes**

```bash
pnpm test
```

Esperado: todos os arquivos passam, nenhum teste pulado ou `.only` esquecido. Conferir:

```bash
git diff fix/launch-prep...HEAD -- tests | grep -nE "^\+.*(\.only\(|\.skip\(|it\.todo|describe\.skip)"
```

Esperado: sem saída.

- [ ] **Passo 3: Tipos**

```bash
pnpm check 2>&1 | tee /tmp/tsc-fase4.txt | tail -20
grep -c "error TS" /tmp/tsc-fase4.txt
grep "error TS" /tmp/tsc-fase4.txt | grep -v "TS2307.*expo-alarm-countdown"
```

Esperado: a contagem é `5` e o segundo `grep` não imprime nada (só os 5 `TS2307` do módulo local `expo-alarm-countdown`, que já existiam). Qualquer outro erro é da fase e bloqueia o PR.

- [ ] **Passo 4: Lint nos arquivos tocados**

```bash
pnpm exec expo lint $(git diff --name-only --diff-filter=AM fix/launch-prep...HEAD -- '*.ts' '*.tsx')
```

Esperado: nenhum erro novo. Erro em arquivo que a fase não tocou é pré-existente (não corrigir aqui). `console.warn`/`require` deliberados (Tarefa 17) não são erro de lint do projeto; se o lint reclamar de `require` em `lib/managed-alarms-background.ts`, acrescentar o comentário `// eslint-disable-next-line @typescript-eslint/no-require-imports` na linha acima, com o motivo (módulo nativo ausente na web).

- [ ] **Passo 5: Migração**

```bash
ls drizzle/0017_fase4_gerenciamento.sql
git diff --stat fix/launch-prep...HEAD -- drizzle/
node -e "const j=require('./drizzle/meta/_journal.json'); const e=j.entries.at(-1); console.log(e.idx, e.tag)"
```

Esperado: o `.sql` existe; o diff de `drizzle/` tem só `0017_fase4_gerenciamento.sql`, `meta/0017_snapshot.json`, `meta/_journal.json` e `schema.ts`; o `node` imprime `17 0017_fase4_gerenciamento`.

A migração roda sozinha no deploy (`runPendingMigrations`), então só pode **criar**. Conferir o SQL:

```bash
grep -inE "drop |truncate|delete from|rename " drizzle/0017_fase4_gerenciamento.sql
grep -nE "MODIFY|CHANGE " drizzle/0017_fase4_gerenciamento.sql
grep -nE "^(CREATE TABLE|ALTER TABLE|CREATE INDEX)" drizzle/0017_fase4_gerenciamento.sql
```

Esperado: o primeiro `grep` não imprime nada; o segundo imprime **no máximo uma** linha, o `ALTER TABLE \`alarm_changes\` MODIFY COLUMN \`changeType\`` que só **acrescenta** `'created'` ao enum (o Drizzle gera MODIFY para ampliar enum; é compatível com as linhas existentes); o terceiro lista `CREATE TABLE alarm_management`, `CREATE TABLE managed_alarm_lists`, os `CREATE INDEX` e os `ALTER TABLE … ADD` de `user_data.timezone`, `account_liveness.dmsPausedReason/dmsPausedAt/pauseNoticeSentAt` e `alarm_changes.changedByOpenId`. Se aparecer qualquer `DROP`, ou um `MODIFY` em outra coluna, parar e corrigir o `drizzle/schema.ts`.

O schema e a migração não podem divergir:

```bash
DATABASE_URL=mysql://u:p@localhost:3306/x pnpm drizzle-kit generate --name verify_fase4
git status --short drizzle/
```

Esperado: o Drizzle diz que não há mudança de schema ("nothing to migrate") e o `git status` não mostra arquivo novo. Se gerou algum `0018_verify_fase4*`, o schema tem coluna que a migração não cobre: apagar os arquivos gerados (`git clean -fd drizzle/`), corrigir a Tarefa 2 e regenerar a 0017.

- [ ] **Passo 6: Regras do projeto (varreduras no diff)**

```bash
# 1) EXPO_PUBLIC_* novo precisa entrar nos workflows E no eas.json (esperado: sem saída)
git diff fix/launch-prep...HEAD | grep -nE "^\+.*EXPO_PUBLIC_"

# 2) Alert.alert e hex literal em UI nova (esperado: sem saída)
git diff fix/launch-prep...HEAD -- app components | grep -nE "^\+.*(Alert\.alert|['\"]#[0-9A-Fa-f]{6}['\"])"

# 3) Permissão Android nova (esperado: só a mudança de UIBackgroundModes do iOS, se a Tarefa 17 rodou)
git diff fix/launch-prep...HEAD -- app.config.ts

# 4) Log com nome de remédio ou id de conta (revisar cada linha impressa; nenhuma pode logar descrição, horário ou openId)
git diff fix/launch-prep...HEAD -- server lib components | grep -nE "^\+.*console\.(log|warn|error)\(.*(description|alarmDescription|openId|alarms)"

# 5) Zod em toda rota nova: cada .mutation( / .query( de managedAlarms e monitoring.deviceSignedOut tem .input( (ou não recebe nada do cliente)
grep -nE "protectedProcedure|\.input\(|\.mutation\(|\.query\(" server/routers-managed-alarms.ts
```

Esperado: (1), (2) e (4) sem saída; (3) só a linha do `UIBackgroundModes`; (5) cada procedure que lê dado do cliente tem `.input(z.…)` (as rotas sem entrada: `forCaregiver`, `request`, `cancelRequest`, `stopManaging`, `mine`, `stopBeingManaged` — o idoso alvo vem do vínculo).

Conferir também que o rate limit e os headers de segurança continuam no lugar: `git diff fix/launch-prep...HEAD -- server/_core/rate-limit.ts server/_core/security-headers.ts server/_core/index.ts` deve vir vazio (a fase não mexe neles).

- [ ] **Passo 7: Documentação e grafo**

```bash
grep -n "Fase 4" docs/claude/alarmes.md docs/claude/roadmap.md
graphify update .
```

Esperado: `alarmes.md` tem a seção "Gerenciamento pelo cuidador…" com UMA das variantes de "Segundo plano" (sem os comentários `VARIANTE`), e o `roadmap.md` tem o item da Fase 4 marcado e o de validação em aparelho aberto. `graphify update .` roda sem erro (checklist do projeto para mudança grande).

- [ ] **Passo 8: Abrir o PR (um só, da fase)**

```bash
git push
gh pr create --base fix/launch-prep --head fase-4/gerenciamento --title "feat: o cuidador gerencia os alarmes do idoso (Fase 4)" --body "$(cat <<'EOF'
## O que muda
- Acordo de gerenciamento (o cuidador pede, o idoso aceita no celular e pode parar a qualquer momento) e lista de alarmes versionada no servidor.
- O cuidador cria, edita, desliga e apaga remédios e check-ins pelo app dele; o celular do idoso aplica, confirma (`ack`) e o dead man's switch só cobra o que foi confirmado.
- O servidor calcula os disparos de todas as contas (regra de horários única, com fuso) e pausa quando o aparelho some (logout, app removido, 48 h sem sinal), avisando o cuidador.
- Política de Privacidade cita a Twilio, a edição com consentimento, a verificação diária e o fuso; os textos da anamnese e da Ajuda deixam de dizer que nada sai do aparelho.

## Para o deploy
- Migração `0017_fase4_gerenciamento` só cria tabelas e colunas (e amplia o enum de `alarm_changes`); roda sozinha no deploy. **Subir o servidor antes do app**: o app novo chama rotas novas.
- Depois do deploy: conferir `/api/health` e `SELECT COUNT(*) FROM alarm_management` no banco (incidente anterior: migração que não rodou).
- Segundo plano (Tarefa 17): <EXECUTADA em Android/iOS | NÃO EXECUTADA: o spike mostrou que ... > .
- Módulo nativo novo só se a Tarefa 17 rodou (`expo-task-manager`): precisa de build novo.

## Validação em aparelho
Checklist da seção 9 da spec: <colar o resultado aqui>.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Preencher os três trechos entre `< >` com o resultado real antes de rodar o comando (nada de `<…>` no PR final). O PR só é mesclado depois do Passo 9.

- [ ] **Passo 9: Checklist de aparelho (spec seção 9)**

Aparelhos: Samsung Galaxy A15 (Android, o de entrada com ROM enxuta) e iPhone 12 (iOS) como **aparelhos do idoso**; um segundo aparelho (S10, S21 FE ou S23) com **duas contas de cuidador** vinculadas ao mesmo idoso (para o caso "outro cuidador"). Build novo do app nos três (módulo nativo novo se a Tarefa 17 rodou) e servidor com a migração 0017 já aplicada. Rodar cada item nos modos normal **e** acessível, claro **e** escuro, nas telas tocadas. Marcar o que passou; o que falhar volta para a tarefa dona.

*Item 1 da spec — teste do push silencioso (Tarefa 0):* resultado já registrado; conferir que a decisão da Tarefa 17 no PR bate com ele.

*Item 2 da spec — acordo e edição:*

- [ ] Sem acordo, o cuidador vê remédios e check-ins só para leitura e o botão "Pedir para cuidar dos alarmes" (com confirmação).
- [ ] Pedir: o idoso recebe "Pedido de [cuidador]" / "Toque para ver"; tocar abre o diálogo "[Nome] quer cuidar dos seus alarmes". **Fechar tocando fora ou no voltar NÃO recusa**: o pedido continua pendente e o diálogo volta na próxima abertura. O cuidador vê "Aguardando [nome] aceitar (vence em N dias)".
- [ ] "Cancelar pedido" (cuidador) encerra o pedido; o idoso deixa de vê-lo.
- [ ] Pedir de novo e tocar "Agora não": o cuidador recebe "[Nome] preferiu continuar cuidando dos próprios alarmes" e a tela volta a "Pedir".
- [ ] Pedir de novo e "Deixar [nome] cuidar": **nenhum alarme some nem é recriado** (mesmos horários e ids, ainda tocam); o cuidador recebe "aceitou"; o outro cuidador recebe "[Cuidador] passou a cuidar dos alarmes de [nome]" e vê "[Cuidador] cuida dos alarmes de [nome]" só para leitura (e uma gravação dele é recusada).
- [ ] Idoso no modo gerenciado: aviso "Quem cuida dos seus alarmes é [nome]"; somem "Adicionar", o interruptor e "Excluir"; tocar num alarme abre os detalhes sem editar; o cartão "[Nome] cuida dos seus alarmes" aparece em Configurações; a tela do alarme tocando não mudou.
- [ ] Cuidador cria um remédio e um check-in, muda o horário, desliga e liga, apaga. Com o app do idoso **aberto**: aplica em segundos e o cuidador vê "Tudo certo no celular de [nome]".
- [ ] Idem com o app do idoso **fechado** (arrastado da lista de recentes no A15; encerrado no iPhone). Com a Tarefa 17: aplica sem abrir o Vigora. Sem ela: em ~10 min chega "[Cuidador] atualizou seus alarmes. Abra o Vigora para as mudanças valerem." e abrir o app aplica. Em todos os casos o alarme toca no horário novo.
- [ ] Lista velha: abrir o formulário no cuidador, mudar a lista por outro caminho (segundo aparelho do mesmo cuidador) e salvar: toast "A lista mudou. Confira de novo." e a lista recarrega.
- [ ] Falha de agendamento: no A15 revogar "Alarmes e lembretes"; no iPhone negar a permissão. O cuidador vê "O celular de [nome] não conseguiu agendar: [lembrete] [horário]", os outros alarmes seguem funcionando e o servidor **não** cobra o alarme que falhou.
- [ ] Pendente: idoso em modo avião, cuidador salva: "Ainda não chegou ao celular de [nome] (desde HH:MM)"; depois de 12 h (ou ajustando `updatedAt` no banco de teste) acrescenta "Peça para [nome] abrir o Vigora."; ao voltar a rede, vira "Tudo certo".
- [ ] 24 alarmes: o 25º é recusado com a mensagem de limite.
- [ ] Parar pelo idoso (Configurações, "Parar", confirmação "[Nome] será avisado"): o cuidador recebe o aviso; os alarmes continuam tocando e voltam a ser do idoso (editáveis).
- [ ] Parar pelo cuidador ("Parar de cuidar dos alarmes", confirmação): o idoso recebe "[Cuidador] parou de cuidar dos seus alarmes." e volta a editar.
- [ ] Desfazer o vínculo (pelos dois lados, em testes separados) encerra o acordo (`unlinked`) e a lista gerenciada some.
- [ ] Regressão da Fase 1: com **acordo ativo**, o idoso não gera "[Idoso] apagou…" ao aplicar o que o cuidador apagou, e os **outros** cuidadores veem "[Cuidador] apagou …" em Alertas; **sem acordo**, o idoso apagar um lembrete continua avisando o cuidador como antes.

*Item 3 da spec — logout, desinstalar, reinstalar:*

- [ ] Logout do idoso: o cuidador recebe "[Nome] saiu da conta do Vigora no celular. Os avisos automáticos estão pausados até [nome] entrar de novo." (uma vez só); os eventos pendentes futuros somem do banco; entrar de novo retoma (o servidor volta a registrar os disparos).
- [ ] Desinstalar o app **anotando a hora**; medir, no Android e no iOS separadamente, quanto tempo o token leva para virar `DeviceNotRegistered` (ticket do dia seguinte ou recibo) e quando chega ao cuidador "O Vigora parece ter sido removido do celular de [nome]. Os avisos automáticos estão pausados." Registrar os dois tempos em `docs/claude/alarmes.md` (seção Pausas) num commit de documentação. Reinstalar e entrar: retoma.
- [ ] Conta de app **antigo** (sem token de push registrado) nunca vira `app_removed`.
- [ ] Sem sinal por 48 h (aparelho desligado, ou `lastSeenAt` recuado no banco de teste): pausa `no_signal` e o cuidador recebe "O celular de [nome] não dá sinal há 2 dias. Os avisos automáticos estão pausados até ele voltar a se comunicar."; qualquer sinal retoma sozinho.

*Item 4 da spec — dia sem abrir o app:*

- [ ] Idoso sem abrir o Vigora por um dia (alarme tocando pelo sistema): o servidor registrou os eventos do dia (`alarm_events` criados pelo job, um por disparo); um alarme **não respondido** gera o aviso da escada ao cuidador.
- [ ] Fuso: trocar o fuso do aparelho (viagem simulada) não cria evento duplicado do mesmo disparo (janela de 2 h) nem acusa a pessoa à toa.

*Transversais:*

- [ ] Exportação de dados inclui `acordosDeGerenciamento` e `listaGerenciada`; excluir a conta apaga o acordo (como idoso e como cuidador) e a lista.
- [ ] Textos legais: Privacidade (Twilio, edição com consentimento, verificação diária, fuso), aviso da ficha de anamnese e resposta da Ajuda estão como na Tarefa 18.
- [ ] Telas novas ou tocadas em claro, escuro e acessível: "Alarmes de [nome]" (cuidador, os cinco estados), diálogo do pedido, cartão de Configurações, listas só leitura. Alvos ≥44 px (≥60 no acessível), sem texto cortado com a fonte grande.

Registrar o resultado (passou / falhou / não testado, aparelho e data) na descrição do PR. Só mesclar com todos os itens críticos (aceite, edição com o app fechado ou reserva visível, falha de agendamento, logout, lista velha) marcados.

---

## Anexo — notas dos redatores

### Notas da parte A

Todas as peças desta parte foram executadas de verdade numa cópia dos arquivos rastreados do repositório (nada foi tocado no repo): suíte inteira 136 arquivos / 1184 testes verdes (1 pulado, já existia), `tsc --noEmit` só com os 5 TS2307 `expo-alarm-countdown`, e `drizzle-kit generate` offline produziu a migração, o snapshot e o journal embutidos acima (e um segundo `generate` respondeu `No schema changes, nothing to migrate`).

**Desvios dos contratos**

1. **Exportação (`userData.export` / `ExportServerData`) saiu da Tarefa 2 e foi para o Passo 3c da Tarefa 4.** Ela precisa de `getManagementHistory` e `getManagedList`, que só existem depois da Tarefa 4. A exclusão de conta ficou na Tarefa 2 (só precisa das tabelas).
2. **`'created'` fica por ÚLTIMO no enum de `alarm_changes.changeType`** (o contrato listava `['created','deleted',...]`). Acrescentar no fim é só metadado no MySQL; no começo reescreveria a tabela. É o único `MODIFY COLUMN` da migração (T19 espera exatamente um).
3. **Tarefa 2 também altera `lib/caregiver-format.ts`** (`alarmChangeTitle` aceita `created`, com o texto `Criou "X" (HH:MM)`) e acrescenta um teste em `tests/caregiver-format.test.ts`. Sem isso o enum novo vira erro TS2345 em `app/(caregiver-tabs)/alerts.tsx` (o tipo do tRPC é derivado do schema) e o `pnpm check` deixaria de ficar limpo da Tarefa 2 até a 16. A Tarefa 16 (parte E) substitui a função inteira; o texto de `created` sem autor é idêntico ao dela, então o teste daqui continua válido.
4. `nextFireMs`/`lastFireMs` aceitam `timeZone: string | null | undefined` (o contrato dizia `string`; compatível). Fuso inválido/vazio cai em `America/Sao_Paulo`. Hora fora do relógio (`25:00`, `08:60`) agora devolve `null`; o código antigo estourava para o dia seguinte. Diferença proposital e conhecida: no dia seguinte a um horário que caiu num pulo do relógio (02:30 na primavera de Nova York) o código antigo levava o 03:30 adiante; o novo volta a 02:30. A paridade com o código antigo é testada nas horas fora de pulos.
5. **`deleteAccountData` apaga a lista gerenciada também dos idosos que a conta apagada gerenciava** (o contrato só falava de `monitoredOpenId = openId`). Sem isso, apagar a conta de uma cuidadora deixaria a lista do idoso órfã e o servidor seguiria cobrando-a.
6. `activateManagement` lança `TRPCError CONFLICT` (`Este pedido não está mais aberto.`) quando o pedido já não está pendente ou não é do idoso (o contrato dizia só `Promise<void>`). Cobre aceite que corre contra cancelamento/vencimento. A rota `respond` (parte B) já pré-checa; o erro do banco passa direto como `CONFLICT`.
7. `createManagementRequest`, `activateManagement` e `endManagement` travam a linha do idoso em `users` (`SELECT … FOR UPDATE`) como primeiro comando da transação; `endManagement` é idempotente (acordo já encerrado mantém o motivo e não apaga a lista de um acordo novo). Escritas lançam `DATABASE_UNAVAILABLE` sem banco; leituras devolvem `null`/`[]`.
8. `managedAlarmInputSchema`/`sanitizeAcceptedList` aceitam hora com um dígito (`"8:30"`, que o formulário já gravou no passado) e a padronizam para `"08:30"`; campos `kind`, `customDays` e `escalateAfterMinutes` são `nullish`. A forma canônica sempre grava `customDays` (`[]` fora de `custom`); a parte D (`planManagedApply`) já compara `customDays` ausente = `[]`. Um alarme local `"8:30"` aparece uma vez como "alterado" (`"08:30"` no servidor) e é reagendado sem mudança de horário real.
9. `recordManagedAck` segue o fake da parte B: só grava se `version` for a versão ATUAL e maior que a confirmada; a cópia `alarms` → `appliedAlarms` acontece no próprio `UPDATE`. `markVisibleNoticeSent` e o ack escrevem `updatedAt = updatedAt` para o `ON UPDATE CURRENT_TIMESTAMP` não mudar o "desde quando" da gravação do cuidador.

**Conferido contra a parte B (sem contradição):** `createManagementRequest` lança `TRPCError CONFLICT` (inclusive na corrida), `sanitizeAcceptedList`/`managedAlarmInputSchema` descartam chaves extras, cortam/recusam descrição conforme a porta, e as mensagens (`Não foi possível ler seus alarmes.`, `Limite de 24 alarmes atingido.`) batem com os testes das Tarefas 6 e 7. Não há fábrica de mock existente para atualizar nesta parte: os dois módulos de banco são novos.

**Fatos do código que contradizem ou completam o digest**

- No Windows com Git Bash, `TZ=America/New_York node …` **não** muda o fuso do Node (a variável é ignorada); `process.env.TZ = '…'` dentro do processo funciona. Por isso o teste de paridade da Tarefa 1 troca o TZ por código, e nenhum passo do plano depende de `TZ=` na linha de comando.
- `createAlarmEvent` devolve `(result as any).insertId`, mas o Drizzle/mysql2 devolve `[ResultSetHeader, …]` em `insert`; é provável (não verifiquei contra um MySQL real) que `monitoring.createEvent` devolva `eventId` indefinido hoje. Nada na Fase 4 deveria depender desse id (a parte C usa `findEventNear`/`ensureServerAlarmEvent`); as funções novas desta parte não leem `insertId` por isso (releem a linha pelo filtro, sob a trava).
- O digest §14 não lista `tests/_fake-mysql.ts`; ele é novo desta parte e reutilizável (executa os filtros do Drizzle lendo o SQL gerado, com `FOR UPDATE` como trava até o fim da transação).
- O trailer dos commits segue o briefing (`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`); o lembrete de atribuição desta sessão cita outro modelo. Quem montar o plano final decide qual manter.

### Notas da parte B

**Desvios dos contratos (e por quê):**

1. **Ordem de execução (resolvido na montagem):** `pauseDms`/`DmsPauseReason` passaram a ser criados nesta Tarefa 8 (Passo 3a-bis); a Tarefa 10 os testa e não os recria. A ordem é a natural, 0 a 19.
2. **`link.getMonitoredAlerts` ganhou `changedByOpenId` e `changedByName`** (Tarefa 5). Não estava nos contratos, mas a Tarefa 16 precisa do autor de cada mudança (spec 4.2/4.5) e nenhuma rota o devolvia. Nulos = o próprio idoso. A parte E deve usar esses dois campos em `lib/caregiver-format.ts`.
3. **`touchLiveness` nunca lança** (log com nome+código) e **não é chamado por conta de cuidador** em `userData.put` e `push.register` (o contrato dizia só "chamado por"). Cuidador não tem dead man's switch e criaria linhas de liveness inúteis.
4. **`managedAlarms.request` tem limite próprio de 5 pedidos/min** por cuidador (o contrato só falava dos 30 gravações/min). Cancelar e pedir em laço seria spam de notificação no celular do idoso.
5. **`managedAlarms.mine` se cura sozinha:** acordo aberto cujo cuidador não está mais vinculado é encerrado como `unlinked` na hora. Cobre `revokeLink` ter falhado depois de revogar o vínculo (o idoso ficaria com as listas travadas). `respond` faz o mesmo para um pedido pendente de cuidador que saiu.
6. **`link.revokeLink` avisa o idoso quando o gerente desfaz o vínculo** com acordo ativo (`management_ended`, mesmo texto de `stopManaging`), para a trava das listas sair. O contrato só dizia "encerra". Quando é o idoso quem desfaz, o cuidador já recebe o `link_revoked` existente.
7. **`forCaregiver` devolve a `list` também para o cuidador que NÃO é o gerente** (`isMine: false`): a spec D4 diz que os outros "veem". Se a parte E preferir esconder o estado de entrega dele, basta ignorar o campo.
8. **`userData.put`: se a consulta do acordo falhar, o diff fica quieto** (o contrato não previa o caso).
9. **`respond` devolve `{ success: true, accepted: boolean }`** e `request` devolve `{ id, status: "pending" }` (os contratos não fixavam o retorno).
10. **`tests/_managed-alarms-fakes.ts`** é um helper novo (não roda como teste) com dublês em memória de `db-alarm-management`, `db-managed-alarm-list`, `db-links`, `db-push`, `push` e `db`. Os dublês espelham o contrato da parte A (um acordo aberto por idoso, versão que sobe, ack que ignora versão velha ou diferente da atual). Se a implementação real da parte A divergir, os testes de router continuam válidos, mas vale conferir o contrato.

**Fatos do código que contradizem o digest ou que a parte A/C precisa respeitar:**

- O digest diz que "`requireCaregiverLink` é privado"; mantive assim e reimplementei o gate em `routers-managed-alarms.ts` (com o `userType === "caregiver"` a mais).
- `createManagementRequest` (parte A) deve lançar `TRPCError` `CONFLICT` na corrida entre dois pedidos simultâneos; o router faz a pré-checagem e deixa o erro do banco passar sem traduzir. Se a parte A lançar um `Error` comum, a corrida vira `INTERNAL_SERVER_ERROR` (raríssimo, mas vale alinhar).
- `sanitizeAcceptedList` (parte A) deve: descartar campos extras (`notificationId`, `nativeAlarmUids`), cortar descrição em 80, recusar item sem `id` ou com horário inválido e mais de 24 itens, tudo com `BAD_REQUEST`. Os testes da Tarefa 6 dependem disso.
- `managedAlarmInputSchema` (parte A) deve recusar descrição acima de 80, horário fora de `HH:MM`, `custom` sem dias, dia fora de 0..6 e atraso fora de 5/10/15/30 (a Tarefa 7 tem uma tabela de casos inválidos) e descartar chaves desconhecidas (um `id` do cliente).
- Fábricas de `../server/db-monitoring` sem `importOriginal` (`monitoring.auth`, `monitoring.create-event-kind`, `monitoring-missed-alarm-push`) precisam de `touchLiveness`: já está na Tarefa 8. As fábricas de `../server/db-links`, `../server/db-push` e `../server/push` dos testes existentes não precisam mudar nas Tarefas 5 a 8 (os exports novos só são acessados em tempo de chamada).
- Nenhuma tarefa da parte B altera `createAlarmEvent` nem o `monitoring-job`.

### Notas da parte C

**Fábricas de teste que factory-mockam `../server/db-monitoring` (12 arquivos) e o que cada uma precisa**

| Arquivo | Importa o job? | O que as Tarefas 9 a 11 exigem |
|---|---|---|
| `tests/monitoring-job.alarme-cancelado.test.ts` | sim | 3 `vi.mock` de módulo (Passo 3d da Tarefa 11); a fábrica de `db-monitoring` **não** muda |
| `tests/monitoring-job.checkin-alarme.test.ts` | sim | idem |
| `tests/monitoring-job.classification.test.ts` | sim | idem |
| `tests/monitoring-job.inactivity.test.ts` | sim | idem |
| `tests/monitoring-job.resilience.test.ts` | sim | idem |
| `tests/monitoring-job.sms.test.ts` | sim | idem |
| `tests/anonymous-account.test.ts`, `tests/monitoring-missed-alarm-push.test.ts`, `tests/monitoring.auth.test.ts`, `tests/monitoring.create-event-kind.test.ts`, `tests/user-data-export.test.ts`, `tests/whatsapp.auth.test.ts` | não (importam os routers) | nada nas Tarefas 9 a 11. **Quem os afeta é a Tarefa 8**: `touchLiveness` e `pauseDms` passam a ser importados por `routers.ts`/`routers-monitoring.ts`, então as fábricas desses 6 arquivos (e as de `../server/db-push`/`../server/push` onde houver `push.register`/`sendExpoDataPush`) precisam ganhar esses nomes |

Escolhi mockar as três rotinas **pelo módulo** nos seis testes do job, em vez de acrescentar ~12 exports às fábricas de `db-monitoring`, `db-push` e `push` em cada um: as rotinas chamam `sendExpoPush` (os testes do job fazem asserções em `sendExpoPush.mock.calls[0]`, que chamadas extras quebrariam) e importam `db-alarm-management`/`db-managed-alarm-list`, que usam `getDb` de um `../server/db` que esses testes mockam só com `getUserData`/`getUserByOpenId`. Alternativa descartada: estender as fábricas (frágil, e cada export novo futuro as quebraria de novo).

**Desvios e acréscimos aos contratos**

1. Funções novas além das listadas: `deleteFuturePendingEvents(openId, alarmIds, now)` em `db-monitoring.ts` (apaga o evento futuro de alarme que o celular falhou ao agendar; sem ele a regra "conta gerenciada só é cobrada por `appliedAlarms` menos `failedAlarmIds`" tinha um furo: o evento registrado antes da mudança vencia sem tocar e acusava a pessoa); o tipo `PreRegisterCandidate`; o arquivo `server/_core/job-isolation.ts` (`describeError`, `runEach`, `runSteps`); `getOpenManagementForMonitored` é consumida (já está no contrato da Tarefa 4) para nunca encerrar um acordo que o idoso aceitou entre a consulta e o encerramento.
2. `ensureServerAlarmEvent(data, windowMinutes)` recebe a janela como parâmetro obrigatório (quem chama passa `SAME_FIRING_WINDOW_MINUTES`) e devolve `"created" | "exists"`. Fica em `db-monitoring.ts`.
3. **Aviso de pausa só é marcado como enviado depois de algum cuidador ser alcançado** (ou quando não há cuidador vinculado). Se a Expo recusar ou o cuidador não tiver token, tenta de novo na rodada seguinte, com um `console.warn` por rodada. Motivo: cuidador que acha que o switch está armado é pior que um aviso repetido. `markPauseNoticeSent` só atualiza pausa em curso e ainda não avisada.
4. Recibos do Expo: sem idade mínima; ticket sem recibo fica na fila (em memória) até aparecer ou passar de 24 h. A spec dizia "na rodada seguinte"; como o recibo pode demorar mais de 5 min, a fila repete a consulta a cada rodada.
5. `pauseDms` cria a linha de `account_liveness` se não existir (logout de quem nunca mandou heartbeat) e só pausa conta não pausada; `app_removed` usa `countPushTokens` depois de apagar o token morto (quem reinstalou tem token novo e não é pausado).
6. O ping usa `getPreRegisterCandidates` como lista de contas (mesma população do pré-registro: idoso, não pausado, com sinal em 48 h) e `getPushTokensWithOwner` para casar token e conta.
7. Ordem das rotinas no job: pré-registro, pausas, manutenção do acordo (a do contrato), todas antes do Passo 1.
8. As mensagens de erro nunca vão para log nem para `lastError`: `/api/health` é público e devolve `monitoringJob.lastError`, e a mensagem de um erro do drizzle traz os parâmetros da query (nome do lembrete). As rotinas rejeitam só com contagens ou nomes de passo.

**Dependências entre partes que o plano final precisa respeitar**

- **Circularidade Tarefa 8 (B) e Tarefa 10 (C):** `monitoring.deviceSignedOut` (Tarefa 8) chama `pauseDms`/`DmsPauseReason`, que a Tarefa 10 define. Ou a Tarefa 8 passa a criar `pauseDms` (e o Passo 1 da Tarefa 10 já manda pular se existir), ou a Tarefa 10 é executada antes da 8. A assinatura é a do contrato.
- A Tarefa 8 precisa fazer `recordHeartbeat` e `touchLiveness` gravarem `dmsPausedReason: null, dmsPausedAt: null, pauseNoticeSentAt: null` (testes em `tests/db-monitoring-pauses.test.ts`) e chamar `touchLiveness` em `userData.put`, `createEvent`, `confirmEvent`, `push.register` e `managedAlarms.ack` (guarda em `tests/dms-pauses-signals.test.ts`, conta chamadas `touchLiveness(`). `deviceSignedOut` **não** pode chamar `touchLiveness`.
- Parte D (logout): `monitoring.deviceSignedOut` deve ser chamado o mais tarde possível e o heartbeat parado antes; um heartbeat ou `userData.put` em voo logo depois do logout retoma a pausa e o aparelho deslogado voltaria a ser pré-registrado até a pausa de 48 h.
- Tarefa 4: linhas devolvidas precisam trazer `id`, `status`, `monitoredOpenId`, `caregiverOpenId` (acordo) e `monitoredOpenId`, `version`, `updatedByOpenId` (lista).
- Tarefa 5: `sendExpoDataPush` devolve um item por token, na ordem de envio; `fetchExpoReceipts` devolve `{}` em erro de rede.
- Tarefa 1: `nextFireMs` devolve `null` para horário ilegível e funciona com qualquer fuso IANA (o fuso inválido é tratado aqui, em `resolveTimeZone`).

**Fatos do código que complementam o digest**

- O digest §14 lista 12 arquivos que factory-mockam `db-monitoring`; só 6 importam o job (tabela acima). `tests/monitoring-health.test.ts` importa `monitoring-job` real mas só usa funções puras: não precisa de mudança.
- O Passo 1 do job usa `user_data.alarms` (backup do celular) como agenda também para conta gerenciada. Risco residual conhecido, sem mudança aqui: se o cuidador apagar um alarme e o celular aplicar, mas o backup ainda não tiver subido (debounce de 3 s), um evento pendente desse alarme seria visto como "ainda armado" se vencesse nesse intervalo; o celular re-sincroniza logo depois, então a janela é de segundos.
- `account_liveness.lastSeenAt` é `notNull default now`: a linha criada por `pauseDms` nasce com sinal agora (verdade para o logout).

**Riscos de lançamento para decidir antes do deploy**

- No primeiro ciclo depois do deploy, toda conta de idoso com `user_data` e mais de 48 h sem sinal (inclusive instalações abandonadas há meses) é pausada, e cada cuidador vinculado a elas recebe **um** aviso "não dá sinal há 2 dias". É o comportamento da spec, mas pode ser uma rajada; se incomodar, limitar `getStaleUnpausedMonitoredAccounts` a `lastSeenAt` dentro da retenção (180 dias).
- Fuso do aparelho a mais de 2 h do fuso guardado na conta (viagem longa) ainda pode gerar um segundo evento; o app envia o fuso a cada `userData.put`, então converge sozinho.
- O ping silencioso diário só detecta app removido para quem tem token (versão nova do app); idoso em versão antiga cai na pausa de 48 h.
- `recordFailure` das rotinas novas faz uma falha persistente (por exemplo, a migração 0017 não aplicada) deixar `/api/health` em 503 após 3 ciclos, como já acontece com os Passos 1 a 4. Está de acordo com o pedido, mas convém lembrar que o dead man's switch segue rodando nos Passos 1 a 4.

### Notas da parte D

**Correções que o controlador precisa aplicar na montagem (nada disto foi reescrito nas Tarefas 12 e 13):**

1. **Logout: parar o heartbeat ANTES de avisar `deviceSignedOut` (Tarefa 13).** A Tarefa 13 chama `await notifyDeviceSignedOut();` no começo do `logout` de `hooks/use-auth.ts`, mas o heartbeat só é parado quando `Auth.subscribeActiveUser` avisa que não há mais usuário (`components/monitoring-initializer.tsx`, ramo `stopHeartbeat()`), isto é, DEPOIS de `Auth.clearUserInfo()`, bem depois do aviso. Até lá o timer de 5 min e o ouvinte de AppState "active" continuam vivos, e um heartbeat que já estava esperando `getDeviceId()`/bateria chega ao servidor depois do `deviceSignedOut`: `recordHeartbeat` limpa a pausa (contrato: "`recordHeartbeat` também limpa a pausa") e o aviso "saiu da conta" é desfeito. Correção, dentro da Tarefa 13, passo 3d (`lib/monitoring-service.ts`), sem mexer no resto:
   - em `notifyDeviceSignedOut`, primeira linha dentro da função: `stopHeartbeat();` (`stopHeartbeat` é do mesmo módulo);
   - em `sendHeartbeat`, logo antes de `await trpcMutation("monitoring.heartbeat", ...)`, acrescentar `if (!heartbeatTimer) return;` (um heartbeat que estava esperando o deviceId/bateria desiste se o heartbeat foi parado enquanto isso; `startHeartbeat` define `heartbeatTimer` de forma síncrona logo depois de disparar o primeiro envio, então o envio imediato do início não é afetado);
   - teste em `tests/device-signed-out.test.ts` (Tarefa 13): chamar `startHeartbeat()`, depois `notifyDeviceSignedOut()` e conferir que `monitoring.heartbeat` não é chamado depois de `monitoring.deviceSignedOut` (fake timers: avançar 5 min e ver que não há novo heartbeat) e que `stopHeartbeat` rodou antes do fetch do `deviceSignedOut`.
   Um heartbeat cujo HTTP já saiu antes do `stopHeartbeat` ainda pode ser processado pelo servidor depois do `deviceSignedOut` (corrida de rede, janela de milissegundos). Se o controlador quiser fechar também isso, a rota `monitoring.deviceSignedOut` pode fazer o servidor ignorar `recordHeartbeat` por alguns segundos depois da pausa `logged_out`; não incluí por ser mais código de servidor para um caso raro.

2. **`ack` e resposta nula (Tarefa 12): já está certo.** `createManagedAlarmsDeps(...).ack` em `lib/managed-alarms-sync.ts` lança `Error('a confirmação não chegou ao servidor')` quando `trpcMutation` devolve `null`; `syncManagedAlarms` traduz isso em `'offline'` sem avançar `management.appliedVersion`, e a próxima rodada só reenvia o ack (há teste para os dois comportamentos). Nenhuma mudança necessária. A Parte E pede o mesmo (nota "Parte E recomenda à Tarefa 12") e fica atendida.

**Desvios dos contratos (Partes D):**

- **Arquivos novos fora do contrato:** `lib/managed-alarms-copy.ts` (Tarefa 14) e `lib/alarm-details.ts` (Tarefa 15), puros, para textos e regras testáveis no vitest; `components/managed-alarms-card.tsx` (Tarefa 14) em vez de colocar o cartão dentro de `settings.tsx`, que já tem mais de 800 linhas e dois ramos (normal e acessível): `settings.tsx` ganha só um import e duas linhas. O contrato diz "cartão em `app/(tabs)/settings.tsx`"; o resultado visível é o mesmo.
- **`onManagedSyncRequested` entrega `{ openRequest: boolean }`** (Tarefa 12), não só "dispara": é como o toque na notificação do pedido faz o diálogo reaparecer sem outro mecanismo. `requestManagedSync(opts?: { openRequest?: boolean })`. O contrato não fixava o formato do evento.
- **Tarefa 14: "Parar" só limpa o acordo local depois que o servidor confirma** (`trpcMutation` devolve `null` em falha: mostra erro e mantém o cartão). O contrato dizia só "→ `stopBeingManaged` → `SET_MANAGEMENT null`".
- **Tarefa 14: o diálogo do pedido espera 3 s depois da abertura** para não colidir com o aviso de "alarmes não confirmados" do `MonitoringInitializer` (dois `Modal` ao mesmo tempo falham no iOS), e não aparece sobre o PIN (`lockStatus !== 'unlocked'`) nem sobre `/alarm-ring`.
- **Tarefa 15: o diálogo de detalhes também mostra "Situação: Ligado/Desligado"** (a spec pede horário, repetição e nome); sem o interruptor, é a única forma de o idoso ver que o cuidador desligou um alarme. O botão "Testar" do card fica.
- **Dependência de ordem:** a troca do `app/(tabs)/_layout.tsx` na Tarefa 14 usa como âncora `<MonitoredPushInitializer />`, que só existe depois da Tarefa 13. Executar 13 antes de 14.

**Fatos do código que contradizem ou completam o digest:**

- `AlarmCard` só é importado por `components/alarm-list-screen.tsx`; as únicas rotas que escrevem alarmes por ação do idoso são as da lista (conferido por busca de `ADD_ALARM|UPDATE_ALARM|DELETE_ALARM` e de `scheduleFullAlarm`). Não há criação de alarme por voz nem outra tela que edite.
- Dois despachos locais continuam fora do modo só leitura de propósito: o reparo de agendamento (`alarm-sync-initializer.tsx`, `UPDATE_ALARM` com os ids novos do sistema) e a migração única do check-in (`checkin-migration-initializer.tsx`, `ADD_ALARM` de id fixo, já rodada nos aparelhos da Fase 3). Se um dia a migração rodar com acordo ativo, o servidor sobrescreve a lista na próxima sincronia; não é um risco novo.
- `tests/alarm-setup-prompts.test.ts` varre os textos de UI de `alarm-list-screen.tsx` contra termos técnicos ("segundo plano", marcas, "Android"): os textos novos não usam nenhum. `tests/alarm-schedule-failure.test.ts` casa `handleSave`/`handleToggle` por regex até `\n  };`: nenhuma das trocas toca nesses blocos.
- O ambiente da conferência rodou o vitest 3.2.6 que está em `node_modules` (a documentação do projeto fala em 2.1.9); os testes novos usam só `describe/it/expect`, sem diferença entre as duas.
- O texto dos arquivos `.tsx` na árvore de trabalho vem com CRLF (`core.autocrlf=true`); os testes de fonte usam `\s*` entre as linhas, então passam com CRLF ou LF.

### Notas da parte E

Desvios dos contratos e fatos do código que o plano precisou resolver:

1. **Estado extra na tela do cuidador (Tarefa 16): `pending-other`.** A spec 6.1 lista quatro estados; o servidor aceita um pedido por idoso, então o segundo cuidador pode abrir a tela com um pedido de outro em aberto. Sem esse estado a tela ficaria sem texto nem saída. `forCaregiver` precisa devolver `management` também quando o pedido pendente é de outro cuidador (`isMine: false`); o contrato da Tarefa 6 já diz isso ("`getOpenManagementForMonitored`").
2. **Autor da mudança vem da Tarefa 5** (decisão na montagem): a lógica de `changedByName` (`null` / `"Você"` / nome / `"Outro cuidador"`) que esta parte tinha posto na Tarefa 16 foi movida para a Tarefa 5, que já mexia em `link.getMonitoredAlerts`. A Tarefa 16 só consome o campo.
3. **"desde HH:MM" ganha a data quando não é de hoje** (`09/10 14:05`): a spec diz só HH:MM, mas um pendente de dois dias mostrando "desde 14:05" engana.
4. **Desligar/Ligar tem botão próprio na linha** (Tarefa 16): no modo acessível o `AlarmFormModal` não tem a linha "Habilitado", então sem o botão o cuidador não conseguiria "desligar" (spec 1, item 1) nesse modo.
5. **`router.push('/(caregiver-tabs)/managed-alarms' as never)`**: `typedRoutes` está ligado e `.expo/types/router.d.ts` (gerado, ignorado pelo git) ainda não conhece a rota nova; mesmo padrão `as never` do `caregiver-push-initializer`.
6. **Tarefa 17 depende de formatos que a Tarefa 12 define.** O plano usa só o que o contrato nomeia (`syncManagedAlarms(deps)` com `getLocal/getManagement/dispatch/schedule/cancel/fetchMine/ack`, `requestManagedSync`, `trpcQuery/trpcMutation` exportados) e tipa as dependências com `Parameters<typeof syncManagedAlarms>[0]`, sem importar `MineResponse`. Recomendação para a Tarefa 12: o `ack` das dependências do app aberto também deve **lançar** quando `trpcMutation` devolve `null`, como o headless faz; senão um `ack` perdido por falta de rede deixa o servidor sem a confirmação para sempre (o `management.appliedVersion` local já avançou e a próxima sincronização dá `'unchanged'`).
7. **O módulo de segundo plano detecta "interface viva" por um guard** (`ManagedBackgroundGuard`, montado depois do `<MicFab>` em `app/(tabs)/_layout.tsx`), sem depender de arquivos das Tarefas 12 a 14. Com interface viva a tarefa delega ao `requestManagedSync()`; sem ela, trabalha sobre o AsyncStorage (`vigora_app_state:<openId>`), como o código de cold start do alarme já faz.
8. **Migração tem um `MODIFY COLUMN`**: o contrato diz "só ADD/CREATE", mas ampliar o enum `alarm_changes.changeType` com `'created'` gera `ALTER TABLE … MODIFY COLUMN`. É compatível com as linhas existentes; a verificação da Tarefa 19 aceita exatamente essa linha e nenhuma outra.
9. **Textos legais (Tarefa 18):** a spec 7 diz "só saem para outras pessoas quando você compartilha a ficha", mas o cuidador vinculado também vê a anamnese (`person.tsx`); o texto inclui "ou vincula um cuidador". A resposta da Ajuda não começa mais com "Sim!" (marketing proibido: "garante segurança").
10. **Fato do código fora do escopo, só registrado:** em `app/(tabs)/settings.tsx` a Política de Privacidade e os Termos só existem no ramo **normal** (rodapé de links legais, linhas ~1440-1460); o ramo acessível não tem nenhum acesso a elas. Isso já era assim e não foi alterado aqui.
11. Os commits seguem o trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` do brief e do contrato, embora o lembrete de atribuição da sessão de execução possa pedir outro nome; vale o que o usuário configurar na hora de executar.
12. A documentação (Tarefa 18, Passo 6) descreve o comportamento pelo contrato das Tarefas 1 a 15; ao executar, conferir cada afirmação da seção nova contra o código real antes de commitar.


---

## Autoavaliação do plano

**Cobertura da spec** (seção → tarefas): 3.1 estados do acordo → 2, 4 · 3.2 pedido → 6, 13, 14, 16 · 3.3 aceite → 3, 4, 6, 14 · 3.4 saída → 6, 14, 16 · 4.1 tabela da lista → 2, 4 · 4.2 gravação pelo cuidador → 3, 5, 7, 8 · 4.3 entrega (push silencioso, reserva visível, gatilhos) → 5, 7, 11, 13, 17 · 4.4 aplicação e confirmação → 12, 7 · 4.5 o que o cuidador vê → 16 · 5.1 fuso → 8, 13 · 5.2 regra única de horários → 1 · 5.3 de onde vem a lista → 9 · 5.4 pré-registro e janela de 2 h → 9 · 5.5 pausas → 8, 10 · 6.1 app do cuidador → 16 · 6.2 app do idoso → 14, 15 · 7 LGPD/ANVISA e textos → 2, 4, 18 · 8 testes → em cada tarefa · 9 validação em aparelho → 0, 19 · 11 ordem de entrega → ordem das tarefas.

**Decisões tomadas na montagem** (além dos desvios do topo):
1. O autor de cada mudança (`changedByOpenId`/`changedByName`, com `"Você"` e `"Outro cuidador"`) é implementado uma vez, na Tarefa 5; a Tarefa 16 só consome.
2. `pauseDms`/`DmsPauseReason` nascem na Tarefa 8 (quem os usa primeiro); a Tarefa 10 os testa e não os recria. Ordem de execução natural.
3. Tarefa 10, Passo 3e: conta parada há mais de 7 dias pausa sem aviso ao cuidador (evita a rajada de avisos no primeiro ciclo depois do deploy).
4. Tarefa 13, Passo 3e: o logout para o heartbeat antes de avisar o servidor (senão um heartbeat em voo desfaz a pausa).

**Pontos que só se fecham em aparelho:** Tarefa 0 inteira (push silencioso com o app fechado no Samsung A15 e no iPhone 12; tarefa em segundo plano; agendar alarme a partir dela), e a lista da Tarefa 19 (pedido/aceite/edição/aplicação, falha de agendamento, logout, desinstalar e medir o tempo do token morrer, idoso sem abrir o app por um dia).

**Fora do plano, registrado para o Pedro:** nas Configurações do idoso, a Política de Privacidade e os Termos só existem no modo normal (o modo acessível não tem acesso a eles).
