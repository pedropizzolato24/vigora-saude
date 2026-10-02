# Feedback do Beta (Fases 1 a 3) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os quatro furos silenciosos do dead man's switch achados no teste beta (Fase 1), entregar os ajustes pedidos pelo testador (Fase 2) e transformar o check-in em um tipo de alarme com atraso de aviso configurável (Fase 3).

**Architecture:** Mudanças cirúrgicas no que existe. Servidor: detecção de mudança de alarme dentro de `userData.put` (função pura + tabela `alarm_changes`), colunas `kind`/`graceMinutes` em `alarm_events`, prazo por evento no `monitoring-job`. Cliente: o check-in passa a ser um `Alarm` com `kind: 'checkin'` agendado pelo mesmo caminho dos remédios (módulo nativo no Android, AlarmKit no iOS 26+, notificação crítica no iOS anterior); o formulário de alarme vira um componente único reaproveitado por remédios e check-in.

**Tech Stack:** React Native 0.81 + Expo 54 + Expo Router 6, tRPC 11 + Zod, Drizzle + MySQL, Vitest 2.1 (`pnpm test`), pnpm 9.12, `expo-alarm-module` patchado via `pnpm patch`.

**Spec:** `docs/superpowers/specs/2026-10-02-feedback-beta-fases-1-3-design.md` (a Fase 4 tem spec própria e fica fora deste plano).

## Global Constraints

- Texto de UI sempre em português do Brasil.
- Cores só por token (`useColors()` / `ac.*` no modo acessível); nenhum hex novo. Touch target ≥44px (≥60px no modo acessível). `AppDialog`/`AppToast`, nunca `Alert.alert()`. Toda tela mexida funciona nos modos normal e acessível, claro e escuro.
- Imports absolutos via `@/`; arquivos kebab-case; nenhum `any` novo; `pnpm check` (tsc) sem erro novo (o erro pré-existente em `lib/storageProxy.ts` é permitido).
- Toda rota tRPC nova ou alterada valida entrada com Zod. Nenhuma permissão Android nova. Rate limiting existente não é desligado.
- Nenhum dado de saúde em log. O push `alarm_changed` leva o nome do lembrete (D8, decisão do Pedro); nenhum outro push novo leva nome de remédio.
- Nada interpreta ou classifica métrica de saúde. O botão do SAMU só abre o discador (`tel:192`) depois de confirmação; o app nunca liga sozinho.
- Alarme sem `kind` é medicação (compatibilidade com tudo que já está gravado no aparelho e no servidor).
- `Alarm` continua com no máximo 24 itens somando remédios e check-ins (`MAX_ALARMS`).
- Commits em português, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; `git push` logo depois de cada commit (regra do projeto).
- Antes de qualquer `pnpm patch`: `pnpm patch` extrai o pacote original — reaplicar o patch atual antes de editar (passo explícito na Tarefa 3).
- A reprodução do "continua tocando" (Tarefa 4) vem antes de qualquer correção para esse sintoma; nenhuma correção é escrita sem reprodução.

### Procedimento de entrega (vale para toda tarefa)

```bash
git switch fix/launch-prep && git pull --ff-only
git switch -c beta/NN-slug            # NN e slug estão no cabeçalho de cada tarefa
# ... passos da tarefa ...
pnpm test && pnpm check               # os dois verdes antes do commit
git add <arquivos listados na tarefa>
git commit -m "<mensagem da tarefa>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin beta/NN-slug
gh pr create --base fix/launch-prep --title "<mensagem da tarefa>" --body "<resumo>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

Tarefas que dependem de outra só começam depois do merge da anterior em `fix/launch-prep`.

### Mapa tarefa → entrega da spec

| Tarefas | Entrega da spec (seção 8) | Assunto |
|---|---|---|
| 1 | 1 | Registro do check-in do dia seguinte |
| 2 | 2 | Registro do próximo disparo ao voltar ao app |
| 3, 4 | 3, 4 | Swipe na notificação; investigação do "continua tocando" |
| 5, 6, 7, 8 | 5 | Mudanças de alarme: detecção, tabela, API, app do cuidador, desvínculo |
| 9 | 6 | SOS honesto |
| 10, 11 | 7 | Soneca, idioma, interruptores do cuidador (rótulos do cuidador estão na 8) |
| 12, 13, 14 | 8 | Telefone do plano, convite por WhatsApp, Baixar/Compartilhar |
| 15 | 9 | Atualização no app do cuidador |
| 16, 17 | 10 | Histórico; formulário de lembrete em lista |
| 18, 19, 20 | 11 | Check-in: modelo e migração, servidor, tela do alarme |
| 21, 22 | 12 | Check-in: telas do monitorado e do cuidador |
| 23 | — | Verificação final e documentação |

## Review Focus

Entradas e condições que a spec deixa implícitas e que mais provavelmente quebram para quem usa o app. Cada uma tem um teste na tarefa dona (indicada).

1. **Lista de alarmes malformada no backup** (item `null`, sem `id`, `id` duplicado, `time` ausente, lista que não é array): `userData.put` não pode falhar nem gerar aviso falso. → Tarefa 5 (testes de `diffAlarms`) e Tarefa 6 (put com lista anterior ilegível).
2. **Primeiro `put` de uma conta e `put` repetido com a mesma lista**: nenhuma linha em `alarm_changes` e nenhum push. → Tarefas 5 e 6.
3. **`DISMISS_ACTION` velho chegando depois que o app já desligou o alarme** (nenhum alarme ativo): a notificação não pode voltar nem o som recomeçar. → Tarefa 3 (ramo "sem alarme ativo" do receiver).
4. **Aparelho sem seletor de pastas, ou usuário cancela o "Baixar"**: cancelar não mostra erro; falha de gravação mostra o motivo real e leva ao "Compartilhar". → Tarefa 14.
5. **Alarme gravado antes da Fase 3 (sem `kind`) e check-in antigo ligado**: o alarme antigo continua remédio em toda tela; a migração do check-in roda uma vez só, mesmo com duas aberturas simultâneas do app, e não cria nada se o check-in estava desligado. → Tarefa 18.

Além destas, a Tarefa 7 tem teste de que `revokeLink` com `otherOpenId` de quem não é cuidador vinculado não manda push (o campo vem do cliente).

---

## Tarefa 0: Linha de base (sem commit)

- [ ] **Passo 1: Instalar e medir**

```bash
git switch fix/launch-prep && git pull --ff-only
pnpm install --frozen-lockfile
pnpm test 2>&1 | tail -15
pnpm check 2>&1 | tail -15
```

Anote: número de testes passando (a memória do projeto registra ~725 na última medição) e a lista de erros de `tsc` que já existem. Toda tarefa abaixo exige "mesmos números ou mais testes, mesmos erros ou menos".

- [ ] **Passo 2: Conferir o pnpm**

```bash
pnpm -v
```

Esperado: `9.12.0`. Se vier outra versão, `corepack enable && corepack prepare pnpm@9.12.0 --activate` antes da Tarefa 3 (o `pnpm patch` muda de comportamento entre versões).

---

## Tarefa 1: Check-in do dia seguinte é registrado no servidor

**Branch:** `beta/01-checkin-amanha` · **Mensagem:** `fix(checkin): registra no servidor o prazo do dia seguinte depois de responder`

**Files:**
- Modify: `lib/checkin-service.ts` (função `createNextCheckinEvent`, linhas ~256-279; nova função pura `pickServerDeadline`)
- Modify: `tests/checkin-service.test.ts` (import da linha 33 e novos `describe` no fim do arquivo)

**Interfaces:**
- Produces: `pickServerDeadline(checkinTime: string, windowMinutes: number, respondedToday: boolean, now?: Date): Date` exportada de `@/lib/checkin-service`.
- Consumes: `computeTimeoutDate`, `computeNextTimeoutDate`, `RESPONDED_DATE_KEY`, `localDateKey` (já no mesmo arquivo).

Causa: `createNextCheckinEvent` usa `computeTimeoutDate(agora)`. Antes do prazo de hoje isso devolve o prazo de **hoje**, que já existe no servidor; o de amanhã nunca é criado e um check-in perdido amanhã não avisa ninguém.

- [ ] **Passo 1: Escrever os testes que falham**

Em `tests/checkin-service.test.ts`, trocar a linha 33:

```ts
import { computeTimeoutDate, computeNextTimeoutDate, formatCountdown, scheduleCheckin } from '../lib/checkin-service';
```

por:

```ts
import {
  computeTimeoutDate,
  computeNextTimeoutDate,
  createNextCheckinEvent,
  formatCountdown,
  pickServerDeadline,
  scheduleCheckin,
} from '../lib/checkin-service';
import { createPendingAlarmEvent } from '../lib/monitoring-service';
```

E acrescentar ao fim do arquivo:

```ts
describe('pickServerDeadline', () => {
  it('antes de responder, o prazo é o de HOJE', () => {
    const when = pickServerDeadline('09:00', 30, false, new Date('2026-05-25T09:05:00'));
    expect(when.getDate()).toBe(25);
    expect(when.getHours()).toBe(9);
    expect(when.getMinutes()).toBe(30);
  });

  it('depois de responder, o prazo é o de AMANHÃ', () => {
    // Bug: continuava no prazo de hoje (09:30), que já estava registrado.
    const when = pickServerDeadline('09:00', 30, true, new Date('2026-05-25T09:05:00'));
    expect(when.getDate()).toBe(26);
    expect(when.getHours()).toBe(9);
    expect(when.getMinutes()).toBe(30);
  });
});

describe('createNextCheckinEvent — registra o prazo do dia certo no servidor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Prazo que foi enviado ao servidor na única chamada esperada. */
  function registeredDeadline(): Date {
    const calls = vi.mocked(createPendingAlarmEvent).mock.calls;
    expect(calls).toHaveLength(1);
    return calls[0][1];
  }

  function respondedOn(dateKey: string | null) {
    (AsyncStorage.getItem as any).mockImplementation(async (key: string) =>
      key === 'vigora_checkin_responded_date' ? dateKey : null
    );
  }

  it('check-in de hoje já respondido: registra o prazo de amanhã', async () => {
    vi.setSystemTime(new Date('2026-05-25T09:05:00'));
    respondedOn('2026-05-25');

    await createNextCheckinEvent('09:00', 30);

    const when = registeredDeadline();
    expect(when.getDate()).toBe(26);
    expect(when.getHours()).toBe(9);
    expect(when.getMinutes()).toBe(30);
  });

  it('check-in de hoje ainda aberto: registra o prazo de hoje', async () => {
    vi.setSystemTime(new Date('2026-05-25T09:05:00'));
    respondedOn(null);

    await createNextCheckinEvent('09:00', 30);

    expect(registeredDeadline().getDate()).toBe(25);
  });

  it('resposta de ontem não conta para hoje', async () => {
    vi.setSystemTime(new Date('2026-05-25T09:05:00'));
    respondedOn('2026-05-24');

    await createNextCheckinEvent('09:00', 30);

    expect(registeredDeadline().getDate()).toBe(25);
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/checkin-service.test.ts
```

Esperado: FAIL (`pickServerDeadline is not a function` e o caso "já respondido" registrando o dia 25).

- [ ] **Passo 3: Implementar**

Em `lib/checkin-service.ts`, logo depois de `computeNextTimeoutDate` (termina na linha 93), acrescentar:

```ts
/**
 * Prazo que o SERVIDOR deve esperar para o check-in: o de hoje enquanto o de
 * hoje está em aberto; o de amanhã depois que hoje foi respondido ou perdido.
 * Registrar sempre o de hoje (o que `computeTimeoutDate` devolve antes do
 * prazo) deixava o dia seguinte sem evento — e um check-in perdido amanhã não
 * avisava ninguém.
 */
export function pickServerDeadline(
  checkinTime: string,
  windowMinutes: number,
  respondedToday: boolean,
  now: Date = new Date()
): Date {
  return respondedToday
    ? computeNextTimeoutDate(checkinTime, windowMinutes, now)
    : computeTimeoutDate(checkinTime, windowMinutes, now);
}
```

E em `createNextCheckinEvent`, trocar:

```ts
    const scheduledAt = computeTimeoutDate(checkinTime, windowMinutes);
```

por:

```ts
    const respondedDate = await AsyncStorage.getItem(RESPONDED_DATE_KEY);
    const scheduledAt = pickServerDeadline(
      checkinTime,
      windowMinutes,
      respondedDate === localDateKey()
    );
```

- [ ] **Passo 4: Ver passar**

```bash
pnpm vitest run tests/checkin-service.test.ts tests/checkin-dedup.test.ts tests/checkin-state.test.ts
```

Esperado: PASS (os testes antigos continuam verdes).

- [ ] **Passo 5: Entregar** — seguir o "Procedimento de entrega" com os arquivos `lib/checkin-service.ts` e `tests/checkin-service.test.ts`.

---

## Tarefa 2: Voltar ao app registra o próximo disparo de cada alarme

**Branch:** `beta/02-resync-foreground` · **Mensagem:** `fix(monitoring): registra o próximo disparo dos alarmes ao voltar ao app`

**Files:**
- Create: `lib/resync-throttle.ts`
- Modify: `components/monitoring-initializer.tsx` (import da linha 24; `lastResyncRef`; bootstrap; novo efeito depois da linha 214)
- Test: `tests/resync-throttle.test.ts`

**Interfaces:**
- Produces: `shouldResync(lastSyncMs: number | null, nowMs: number, minGapMs?: number): boolean` e `RESYNC_MIN_GAP_MS = 60_000` em `@/lib/resync-throttle`.

Causa: o bootstrap do `MonitoringInitializer` só roda em cold start/login e a lista só re-sincroniza quando um alarme é editado. Quem não fecha o app de verdade nunca registra o disparo seguinte e o servidor não cobra o alarme de amanhã. Toda resposta ao alarme (tela cheia, toque na notificação, botão "Dispensar") traz o app ao primeiro plano, então registrar a cada `AppState → active` fecha o caso comum.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/resync-throttle.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESYNC_MIN_GAP_MS, shouldResync } from '../lib/resync-throttle';

describe('shouldResync', () => {
  const NOW = 1_800_000_000_000;

  it('sempre sincroniza na primeira vez', () => {
    expect(shouldResync(null, NOW)).toBe(true);
  });

  it('bloqueia dentro do intervalo mínimo', () => {
    expect(shouldResync(NOW - RESYNC_MIN_GAP_MS + 1, NOW)).toBe(false);
  });

  it('libera no limite exato', () => {
    expect(shouldResync(NOW - RESYNC_MIN_GAP_MS, NOW)).toBe(true);
  });

  it('libera se o relógio voltou para trás (não trava por horas)', () => {
    expect(shouldResync(NOW + 3_600_000, NOW)).toBe(true);
  });
});

describe('MonitoringInitializer — voltar ao app re-registra os disparos', () => {
  const src = readFileSync(
    join(__dirname, '..', 'components', 'monitoring-initializer.tsx'),
    'utf8'
  );

  it('escuta o AppState e passa pelo limitador', () => {
    expect(src).toMatch(/AppState\.addEventListener\("change"/);
    expect(src).toMatch(/shouldResync\(lastResyncRef\.current, now\)/);
  });

  it('só re-sincroniza com o monitoramento já inicializado', () => {
    expect(src).toMatch(/next !== "active" \|\| !initializedRef\.current/);
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/resync-throttle.test.ts
```

Esperado: FAIL (módulo `../lib/resync-throttle` não existe).

- [ ] **Passo 3: Criar o limitador**

Criar `lib/resync-throttle.ts`:

```ts
/**
 * resync-throttle.ts
 *
 * Intervalo mínimo entre dois re-registros dos disparos de alarme no servidor.
 * Voltar ao app dispara um por transição de AppState; o limitador evita uma
 * rajada de chamadas (até 24 por vez) quando o idoso alterna entre apps.
 */
export const RESYNC_MIN_GAP_MS = 60_000;

export function shouldResync(
  lastSyncMs: number | null,
  nowMs: number,
  minGapMs: number = RESYNC_MIN_GAP_MS
): boolean {
  if (lastSyncMs === null) return true;
  // Relógio do aparelho voltou para trás: sem isto o limitador bloquearia até
  // o relógio alcançar o valor antigo.
  if (nowMs < lastSyncMs) return true;
  return nowMs - lastSyncMs >= minGapMs;
}
```

- [ ] **Passo 4: Ligar no `MonitoringInitializer`**

Em `components/monitoring-initializer.tsx`:

1. Linha 24: `import { Platform } from "react-native";` → `import { AppState, Platform } from "react-native";`
2. Depois da linha 25 (`import { AppDialog, useAppDialog } ...`) acrescentar: `import { shouldResync } from "@/lib/resync-throttle";`
3. Depois de `const lastAlarmHashRef = useRef<string>("");` acrescentar: `  const lastResyncRef = useRef<number | null>(null);`
4. No bootstrap, trocar:

```ts
        // Sync current alarms
        await syncAlarmsToServer(s.alarms);
```

por:

```ts
        // Sync current alarms
        lastResyncRef.current = Date.now();
        await syncAlarmsToServer(s.alarms);
```

5. Depois do efeito "Sync alarms whenever the alarm list changes" (termina em `}, [state.alarms]);`) acrescentar:

```tsx
  // Voltar ao app re-registra o PRÓXIMO disparo de cada alarme. O bootstrap só
  // roda em cold start/login e a lista só re-sincroniza quando um alarme é
  // editado: sem isto, quem não fecha o app de verdade nunca registra o disparo
  // seguinte e o servidor não cobra o alarme de amanhã (feedback do beta,
  // out/2026). Responder ao alarme sempre traz o app ao primeiro plano, então
  // isto cobre o caso comum. Fica de fora (Fase 4): o alarme que toca sem
  // ninguém interagir — o seguinte só é registrado na próxima abertura, e a
  // escada de 30 min / 2 h / 6 h cobre o intervalo.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active" || !initializedRef.current) return;
      const now = Date.now();
      if (!shouldResync(lastResyncRef.current, now)) return;
      lastResyncRef.current = now;
      syncAlarmsToServer(stateRef.current.alarms).catch(console.warn);
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Passo 5: Ver passar**

```bash
pnpm vitest run tests/resync-throttle.test.ts && pnpm check
```

Esperado: PASS e `tsc` sem erro novo.

- [ ] **Passo 6: Entregar** — arquivos: `lib/resync-throttle.ts`, `components/monitoring-initializer.tsx`, `tests/resync-throttle.test.ts`.

---

## Tarefa 3: Swipe na notificação do alarme faz a notificação voltar (Android 14+)

**Branch:** `beta/03-swipe-reposta` · **Mensagem:** `fix(alarm): swipe na notificação do alarme reposta a notificação em vez de parar o alarme`

**Files:**
- Modify: `patches/expo-alarm-module.patch` (regenerado por `pnpm patch-commit`)
- Modify: `pnpm-lock.yaml` (hash do patch, atualizado pelo `patch-commit`)
- Create: `tests/android-alarm-swipe-reposts.test.ts`
- Modify: `docs/claude/alarmes.md` (parágrafo "Vão conhecido — o swipe", linhas ~537-541)

Causa: o Android 14 deixa dispensar por swipe uma notificação com `setOngoing(true)`. O swipe dispara o `deleteIntent` (`DISMISS_ACTION`), que hoje chama `Manager.stop()` em Java: som e vibração param, o JS não fica sabendo, o evento continua pendente e o servidor avisa a família 5–10 min depois.

Correção (D1): no receiver, o `DISMISS_ACTION` passa a **repostar a mesma notificação** (id 1, o mesmo do `startForeground`) enquanto houver alarme ativo. Som e vibração continuam. Só o botão "Dispensar" (deep link que abre o app e confirma) ou abrir o app desligam o alarme. Sem alarme ativo (um `DISMISS_ACTION` velho chegando depois do dismiss pelo app), o comportamento é o antigo: nada volta a tocar.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/android-alarm-swipe-reposts.test.ts`:

```ts
/**
 * android-alarm-swipe-reposts.test.ts
 *
 * Android 14+ deixa dispensar por swipe uma notificação com setOngoing(true).
 * O swipe dispara o deleteIntent (DISMISS_ACTION). Antes, o receiver chamava
 * Manager.stop em Java: o alarme parava sem o JS saber, o evento ficava
 * pendente e o servidor avisava a família de um alarme que ninguém respondeu.
 *
 * Agora o swipe reposta a notificação e o alarme segue tocando — só o botão
 * "Dispensar" (deep link) ou abrir o app o desligam. Sem alarme ativo, nada é
 * repostado (um DISMISS_ACTION velho não ressuscita notificação nenhuma).
 *
 * O lado nativo é verificado no patch (teste de runtime não alcança Java) — mesma
 * técnica de android-alarm-dismiss-confirms.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const patch = readFileSync(
  join(__dirname, "..", "patches", "expo-alarm-module.patch"),
  "utf8"
);

const MANAGER = "android/src/main/java/com/expoalarmmodule/Manager.java";
const RECEIVER =
  "android/src/main/java/com/expoalarmmodule/receivers/NotificationActionReceiver.java";

/** Texto de um arquivo DEPOIS do patch: contexto + linhas adicionadas dos hunks dele. */
function afterPatch(filePath: string): string {
  const section = patch
    .split(/^diff --git /m)
    .slice(1)
    .find((s) => s.startsWith(`a/${filePath} `));
  if (!section) return "";
  return section
    .split("\n")
    .filter(
      (l) =>
        !l.startsWith("-") &&
        !l.startsWith("@@") &&
        !l.startsWith("index ") &&
        !l.startsWith("a/")
    )
    .map((l) => l.slice(1))
    .join("\n");
}

describe("swipe na notificação do alarme (Android 14+)", () => {
  it("o Manager expõe o repost e usa o mesmo id do foreground service", () => {
    const manager = afterPatch(MANAGER);
    expect(manager).toMatch(
      /public static boolean repostActiveAlarmNotification\(Context context\)/
    );
    // O AlarmService chama startForeground(1, ...): notify com o MESMO id
    // atualiza a notificação do serviço em vez de criar uma segunda.
    expect(manager).toMatch(/manager\.notify\(1, notification\)/);
  });

  it("sem alarme ativo não reposta nada", () => {
    // Um DISMISS_ACTION velho (chegando depois do dismiss pelo app) não pode
    // fazer a notificação voltar.
    const manager = afterPatch(MANAGER);
    expect(manager).toMatch(/if \(activeAlarmUid == null\) return false;/);
  });

  it("o DISMISS_ACTION reposta em vez de parar o alarme", () => {
    const receiver = afterPatch(RECEIVER);
    const dismissCase = receiver.match(/case "DISMISS_ACTION":([\s\S]*?)break;/);
    expect(dismissCase).not.toBeNull();
    const body = dismissCase![1];
    expect(body).toMatch(/if \(!Manager\.repostActiveAlarmNotification\(context\)\) \{/);
    // Manager.stop só no ramo SEM alarme ativo — depois da tentativa de repost.
    expect(body.indexOf("repostActiveAlarmNotification")).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("repostActiveAlarmNotification")).toBeLessThan(
      body.indexOf("Manager.stop(context)")
    );
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/android-alarm-swipe-reposts.test.ts
```

Esperado: FAIL (o patch não contém `repostActiveAlarmNotification` nem o hunk do receiver).

- [ ] **Passo 3: Extrair o pacote para edição e reaplicar o patch atual**

```bash
PATCH_DIR="/c/Users/55519/AppData/Local/Temp/claude/d--Pedro-vigora-saude/ec1f1b39-dcb1-4b8e-92e3-8bfc1557991d/scratchpad/alarm-patch"
rm -rf "$PATCH_DIR"
pnpm patch expo-alarm-module --edit-dir "$PATCH_DIR"
# O pacote extraído é o ORIGINAL. Se ainda não tem o nosso patch, aplicar:
grep -c cancelPreviousDates "$PATCH_DIR/android/src/main/java/com/expoalarmmodule/Manager.java" || true
```

Se o `grep -c` imprimir `0`, reaplicar o patch atual:

```bash
(cd "$PATCH_DIR" && git apply --whitespace=nowarn /d/Pedro/vigora-saude/patches/expo-alarm-module.patch)
grep -c cancelPreviousDates "$PATCH_DIR/android/src/main/java/com/expoalarmmodule/Manager.java"
```

Esperado: número ≥ 1.

- [ ] **Passo 4: Acrescentar o repost ao `Manager.java`**

Ler `$PATCH_DIR/android/src/main/java/com/expoalarmmodule/Manager.java`. Trocar:

```java
    static String getActiveAlarm() {
        return activeAlarmUid;
    }
```

por:

```java
    static String getActiveAlarm() {
        return activeAlarmUid;
    }

    /**
     * Swipe na notificação do alarme. O Android 14+ deixa dispensar uma
     * notificação mesmo com setOngoing(true); o swipe dispara o deleteIntent
     * (DISMISS_ACTION), que antes parava o alarme em Java sem o JS saber — o
     * evento ficava pendente e o servidor avisava a família de um alarme que
     * ninguém respondeu. Agora o alarme CONTINUA tocando e só a notificação
     * volta, com o botão "Dispensar" e o full-screen intent. Quem desliga é o
     * "Dispensar" (deep link, confirma no servidor) ou abrir o app.
     *
     * Usa o mesmo id do startForeground do AlarmService (1): notify com o mesmo
     * id atualiza a notificação do serviço em vez de criar uma segunda.
     * Devolve false quando não há alarme ativo (nada a repostar).
     */
    public static boolean repostActiveAlarmNotification(Context context) {
        if (activeAlarmUid == null) return false;
        Alarm alarm = Storage.getAlarm(context, activeAlarmUid);
        android.app.Notification notification = Helper.getAlarmNotification(context, alarm, 1);
        android.app.NotificationManager manager =
            (android.app.NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        manager.notify(1, notification);
        Log.d(TAG, "Swipe: notificação do alarme " + activeAlarmUid + " repostada");
        return true;
    }
```

- [ ] **Passo 5: Trocar o ramo do `DISMISS_ACTION` no receiver**

Ler `$PATCH_DIR/android/src/main/java/com/expoalarmmodule/receivers/NotificationActionReceiver.java`. Trocar:

```java
            case "DISMISS_ACTION":
                Log.d(TAG, "Received DISMISS action for Alarm: " + alarmUid);
                Manager.stop(context);
                this.removeNotification(context, notificationId);
                break;
```

por:

```java
            case "DISMISS_ACTION":
                Log.d(TAG, "Received DISMISS action for Alarm: " + alarmUid);
                // Só o swipe chega aqui (os botões usam deep link). Com o alarme
                // ativo, o swipe não o desliga: a notificação volta e o som
                // continua. Sem alarme ativo (DISMISS_ACTION velho, depois do
                // dismiss pelo app) mantém o comportamento antigo.
                if (!Manager.repostActiveAlarmNotification(context)) {
                    Manager.stop(context);
                    this.removeNotification(context, notificationId);
                }
                break;
```

- [ ] **Passo 6: Gerar o patch**

```bash
pnpm patch-commit "$PATCH_DIR"
git diff --stat patches/ pnpm-lock.yaml package.json
```

Esperado: `patches/expo-alarm-module.patch` alterado (hunk novo do receiver e do Manager) e `pnpm-lock.yaml` com o hash novo.

- [ ] **Passo 7: Ver passar**

```bash
pnpm vitest run tests/android-alarm-swipe-reposts.test.ts tests/android-alarm-dismiss-confirms.test.ts tests/alarm-ghost-pendingintents.test.ts tests/android-alarm-vibration-native.test.ts tests/android-alarm-sound-flag.test.ts tests/android-native-patches-build-from-source.test.ts
```

Esperado: PASS em todos.

- [ ] **Passo 8: Atualizar `docs/claude/alarmes.md`**

Trocar o parágrafo que começa com `⚠️ **Vão conhecido — o swipe.**` (até `Pendente.`) por:

```markdown
⚠️ **O swipe.** O `setDeleteIntent` continua no `DISMISS_ACTION` (broadcast): um
`PendingIntent` de Activity disparado por swipe não tem a isenção de
background-activity-launch e poderia não abrir nada. No Android 14+ o swipe
dispensa a notificação do foreground service mesmo com `setOngoing(true)` (a
mudança de comportamento só poupa tela bloqueada e "Limpar tudo"). Por isso o
receiver **não para o alarme** no swipe: `Manager.repostActiveAlarmNotification`
reposta a mesma notificação (id 1, o do `startForeground`) enquanto houver alarme
ativo, e o som continua. Só "Dispensar" (deep link) ou abrir o app desligam.
Sem alarme ativo o ramo antigo roda (um `DISMISS_ACTION` velho não ressuscita
nada). Não volte a contar o swipe como resposta: é o gesto de quem quer se livrar
do lembrete, e contá-lo esconderia justamente o remédio pulado.
```

- [ ] **Passo 9: Suíte completa**

```bash
pnpm test && pnpm check
```

Esperado: verde.

- [ ] **Passo 10: Validar em aparelho (obrigatório antes do PR)**

Um Android 14+ primeiro (S21 FE ou S23), conforme a regra "1 aparelho por hipótese". Gerar o APK de teste do jeito habitual (ver `docs/BUILD_GUIDE.md`), instalar e:

```bash
adb logcat -c
adb logcat -v time -s AlarmService:V AlarmManager:V AlarmNotificationActionReceiver:V
```

1. Criar um alarme para daqui a 2 minutos, deixar o celular **desbloqueado**.
2. Quando tocar, arrastar a notificação para o lado 5 vezes seguidas.
3. Esperado: a cada swipe aparece `Received DISMISS action` e `Swipe: notificação do alarme ... repostada`; a notificação volta; o som e a vibração não param.
4. Tocar em "Dispensar" na notificação: o app abre na `alarm-ring` e o alarme para.
5. Conferir no histórico (Remédios → Ver histórico) que o evento está "Respondido".
6. Repetir com o celular **bloqueado** (o swipe nem deveria ser possível).

Só depois rodar nos demais aparelhos. Registrar o resultado no corpo do PR.

- [ ] **Passo 11: Entregar** — arquivos: `patches/expo-alarm-module.patch`, `pnpm-lock.yaml`, `tests/android-alarm-swipe-reposts.test.ts`, `docs/claude/alarmes.md`.

---

## Tarefa 4: Reproduzir o "continua tocando e o app não abre a tela do alarme" (sem código)

**Branch:** `beta/04-investigacao-swipe` · **Mensagem:** `docs(alarm): achados da reprodução do alarme que continua tocando`

**Files:**
- Modify: `docs/claude/alarmes.md` (nova seção "Swipe: achados do aparelho")

O relato do testador é de que, depois de dispensar a notificação, o alarme "continuou tocando" e, ao abrir o app, a tela do alarme não apareceu. O código sozinho não explica isso no Android puro. **Nenhuma correção é escrita antes da reprodução.** Esta tarefa produz achados, não código.

- [ ] **Passo 1: Obter com o testador (via Pedro)**

Modelo do aparelho, versão do Android, data do APK instalado. Para o APK:

```bash
adb shell getprop ro.product.model
adb shell getprop ro.build.version.release
adb shell dumpsys package com.vigora.saude | grep -E "versionName|lastUpdateTime"
```

Se o APK for anterior a 02/09/2026 (commit `fb7f379`), o botão "Dispensar" da notificação também tinha o defeito de parar sem confirmar; instalar o APK da Tarefa 3 antes de continuar.

- [ ] **Passo 2: Reproduzir cada gesto, um por vez, no aparelho dele (ou no mais parecido)**

```bash
adb logcat -c
adb logcat -v time -s AlarmService:V AlarmManager:V AlarmSound:V AlarmNotificationActionReceiver:V ReactNativeJS:V > swipe-<gesto>.log
```

Para cada gesto (alarme para daqui a 2 min, celular desbloqueado, app fechado): (a) arrastar a notificação para o lado; (b) arrastar para cima no banner; (c) meio-arrasto da Samsung (revela o ícone de soneca/engrenagem); (d) "Limpar tudo"; (e) abrir o app pelo ícone com o alarme tocando.

- [ ] **Passo 3: Preencher a tabela de achados**

| Gesto | Log `Received DISMISS action`? | Log `repostada`? | Som continuou? | Abrir o app levou à `alarm-ring`? | Log `[RootLayout] Native alarm active` ou `[AlarmHandler] App foregrounded with active alarm`? |
|---|---|---|---|---|---|
| (a) arrastar de lado | | | | | |
| (b) arrastar para cima | | | | | |
| (c) meio-arrasto Samsung | | | | | |
| (d) Limpar tudo | | | | | |
| (e) abrir pelo ícone | | | | | |

- [ ] **Passo 4: Decidir pela tabela**

| O que a tabela mostra | Conclusão | Próximo passo |
|---|---|---|
| (b) esconde a notificação, som continua, sem `DISMISS_ACTION` | Esperado do Android (o banner só some da gaveta) | Nada a corrigir; explicar ao testador. Abrir o app deve levar à tela do alarme |
| (c) esconde sem `DISMISS_ACTION` | O gesto da Samsung não dispara o `deleteIntent` | Nova tarefa: republicar a notificação periodicamente enquanto o alarme toca (a spec precisa ser atualizada antes) |
| Abrir o app **não** leva à `alarm-ring` e os logs `[RootLayout]`/`[AlarmHandler]` não aparecem | Bug na detecção de alarme ativo (`getAlarmState` nulo, guarda `onAlarmScreen`/`navigatedAlarms`, ou `PermissionsGate` cobrindo a tela) | Nova tarefa com `superpowers:systematic-debugging`, partindo dos logs capturados |
| Tudo funciona depois da Tarefa 3 | O relato era o defeito corrigido na Tarefa 3 | Registrar e fechar |

- [ ] **Passo 5: Registrar**

Acrescentar a `docs/claude/alarmes.md`, depois do parágrafo "O swipe.", uma seção `### Swipe: achados do aparelho (out/2026)` com: modelo/Android/APK, a tabela preenchida e a conclusão. Salvar um resumo na memória do projeto (`beta-feedback-padrasto-out2026.md`).

- [ ] **Passo 6: Entregar** — arquivo: `docs/claude/alarmes.md`. Se a conclusão exigir código, abrir a tarefa nova e **não** misturar neste PR.

---

## Tarefa 5: Detectar mudança de alarme (função pura)

**Branch:** `beta/05-alarm-diff` · **Mensagem:** `feat(monitoring): compara a lista de alarmes antes e depois do backup`

**Files:**
- Create: `server/_core/alarm-diff.ts`
- Test: `tests/alarm-diff.test.ts`

**Interfaces:**
- Produces (todas exportadas de `server/_core/alarm-diff.ts`):
  - `type AlarmChangeType = "deleted" | "disabled" | "rescheduled"`
  - `interface AlarmChange { alarmId: string; alarmDescription: string; changeType: AlarmChangeType; oldTime: string | null; newTime: string | null }`
  - `diffAlarms(previous: unknown, next: unknown): AlarmChange[]`
  - `buildAlarmChangePush(personName: string, changes: AlarmChange[]): { title: string; body: string } | null`
  - `pickPersonName(anamnesis: unknown, accountName: string | null | undefined): string`

Regras da spec (3.4): comparar por `id`; `deleted` = sumiu; `disabled` = `enabled` passou de verdadeiro para falso; `rescheduled` = `time`, `repeat` ou `customDays` mudou com o alarme ligado. Criação e reativação não geram registro. Sem lista anterior válida não há base de comparação (conta nova, formato antigo): nada é gerado. Um alarme gera no máximo uma mudança, com precedência `deleted` > `disabled` > `rescheduled`.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/alarm-diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildAlarmChangePush,
  diffAlarms,
  pickPersonName,
  type AlarmChange,
} from "../server/_core/alarm-diff";

const losartana = { id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" };
const metformina = { id: "a2", time: "20:00", description: "Metformina", enabled: true, repeat: "daily" };

describe("diffAlarms", () => {
  it("lista igual não gera mudança", () => {
    expect(diffAlarms([losartana, metformina], [metformina, losartana])).toEqual([]);
  });

  it("alarme que sumiu da lista é 'deleted'", () => {
    expect(diffAlarms([losartana, metformina], [metformina])).toEqual([
      { alarmId: "a1", alarmDescription: "Losartana", changeType: "deleted", oldTime: "08:00", newTime: null },
    ]);
  });

  it("alarme desativado é 'disabled'", () => {
    const result = diffAlarms([losartana], [{ ...losartana, enabled: false }]);
    expect(result).toEqual([
      { alarmId: "a1", alarmDescription: "Losartana", changeType: "disabled", oldTime: "08:00", newTime: "08:00" },
    ]);
  });

  it("mudar o horário é 'rescheduled' com os dois horários", () => {
    const result = diffAlarms([losartana], [{ ...losartana, time: "09:30" }]);
    expect(result).toEqual([
      { alarmId: "a1", alarmDescription: "Losartana", changeType: "rescheduled", oldTime: "08:00", newTime: "09:30" },
    ]);
  });

  it("mudar só os dias é 'rescheduled' com o mesmo horário", () => {
    const before = { ...losartana, repeat: "custom", customDays: [1, 3] };
    const after = { ...losartana, repeat: "custom", customDays: [1, 3, 5] };
    const [change] = diffAlarms([before], [after]);
    expect(change.changeType).toBe("rescheduled");
    expect(change.oldTime).toBe(change.newTime);
  });

  it("a ordem dos dias personalizados não conta como mudança", () => {
    const before = { ...losartana, repeat: "custom", customDays: [1, 3] };
    const after = { ...losartana, repeat: "custom", customDays: [3, 1] };
    expect(diffAlarms([before], [after])).toEqual([]);
  });

  it("criar e reativar não geram registro", () => {
    expect(diffAlarms([losartana], [losartana, metformina])).toEqual([]);
    expect(diffAlarms([{ ...losartana, enabled: false }], [losartana])).toEqual([]);
  });

  it("alarme desligado antes e depois não gera registro, mesmo mudando o horário", () => {
    const before = { ...losartana, enabled: false };
    const after = { ...losartana, enabled: false, time: "09:00" };
    expect(diffAlarms([before], [after])).toEqual([]);
  });

  it("apagar um alarme que já estava desativado também é registrado", () => {
    const [change] = diffAlarms([{ ...losartana, enabled: false }], []);
    expect(change.changeType).toBe("deleted");
  });

  it("sem lista anterior válida não há base de comparação", () => {
    for (const previous of [undefined, null, "lixo", {}, 42]) {
      expect(diffAlarms(previous, [losartana])).toEqual([]);
    }
  });

  it("lista nova ilegível não gera mudança", () => {
    expect(diffAlarms([losartana], "lixo")).toEqual([]);
    expect(diffAlarms([losartana], undefined)).toEqual([]);
  });

  it("itens ilegíveis são ignorados e id repetido vale o primeiro", () => {
    const previous = [null, 42, {}, { id: "" }, losartana, { ...losartana, description: "Outro" }];
    const result = diffAlarms(previous, []);
    expect(result).toHaveLength(1);
    expect(result[0].alarmDescription).toBe("Losartana");
  });

  it("alarme sem 'enabled' (formato antigo) conta como ligado", () => {
    const legacy = { id: "a1", time: "08:00", description: "Losartana" };
    const [change] = diffAlarms([legacy], [{ ...legacy, enabled: false }]);
    expect(change.changeType).toBe("disabled");
  });
});

describe("buildAlarmChangePush", () => {
  const change = (over: Partial<AlarmChange>): AlarmChange => ({
    alarmId: "a1",
    alarmDescription: "Losartana",
    changeType: "deleted",
    oldTime: "08:00",
    newTime: null,
    ...over,
  });

  it("sem mudanças não há push", () => {
    expect(buildAlarmChangePush("Maria", [])).toBeNull();
  });

  it("uma exclusão leva o nome do lembrete", () => {
    expect(buildAlarmChangePush("Maria", [change({})])).toEqual({
      title: "Lembrete alterado — Vigora",
      body: 'Maria excluiu o lembrete "Losartana".',
    });
  });

  it("uma desativação", () => {
    const push = buildAlarmChangePush("Maria", [change({ changeType: "disabled", newTime: "08:00" })]);
    expect(push?.body).toBe('Maria desativou o lembrete "Losartana".');
  });

  it("mudança de horário leva o horário novo", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ changeType: "rescheduled", oldTime: "08:00", newTime: "09:30" }),
    ]);
    expect(push?.body).toBe('Maria mudou o horário de "Losartana" para 09:30.');
  });

  it("mudança só de dias não afirma horário", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ changeType: "rescheduled", oldTime: "08:00", newTime: "08:00" }),
    ]);
    expect(push?.body).toBe('Maria mudou os dias do lembrete "Losartana".');
  });

  it("várias mudanças mostram dois nomes e a contagem do resto", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ alarmId: "a1", alarmDescription: "Losartana" }),
      change({ alarmId: "a2", alarmDescription: "Metformina" }),
      change({ alarmId: "a3", alarmDescription: "Vitamina D" }),
    ]);
    expect(push).toEqual({
      title: "Lembretes alterados — Vigora",
      body: 'Maria alterou 3 lembretes: "Losartana", "Metformina" e mais 1.',
    });
  });

  it("duas mudanças não têm 'e mais'", () => {
    const push = buildAlarmChangePush("Maria", [
      change({ alarmId: "a1", alarmDescription: "Losartana" }),
      change({ alarmId: "a2", alarmDescription: "Metformina" }),
    ]);
    expect(push?.body).toBe('Maria alterou 2 lembretes: "Losartana", "Metformina".');
  });

  it("nome muito longo é cortado em 40 caracteres", () => {
    const push = buildAlarmChangePush("Maria", [change({ alarmDescription: "x".repeat(80) })]);
    expect(push?.body).toBe(`Maria excluiu o lembrete "${"x".repeat(39)}…".`);
  });

  it("lembrete sem nome usa o horário", () => {
    const push = buildAlarmChangePush("Maria", [change({ alarmDescription: "" })]);
    expect(push?.body).toBe('Maria excluiu o lembrete "08:00".');
  });
});

describe("pickPersonName", () => {
  it("prefere o nome da anamnese", () => {
    expect(pickPersonName({ fullName: " Maria Souza " }, "Conta")).toBe("Maria Souza");
  });
  it("cai para o nome da conta e depois para o genérico", () => {
    expect(pickPersonName(null, "Conta")).toBe("Conta");
    expect(pickPersonName({ fullName: "  " }, null)).toBe("A pessoa que você acompanha");
    expect(pickPersonName("lixo", undefined)).toBe("A pessoa que você acompanha");
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/alarm-diff.test.ts
```

Esperado: FAIL (módulo `../server/_core/alarm-diff` não existe).

- [ ] **Passo 3: Implementar**

Criar `server/_core/alarm-diff.ts`:

```ts
/**
 * alarm-diff.ts
 *
 * Compara a lista de alarmes que a conta tinha no servidor com a que acabou de
 * chegar no backup (`userData.put`) e diz o que o usuário tirou do ar. Função
 * pura: sem banco e sem push — quem grava e avisa é `server/alarm-changes.ts`.
 *
 * Por quê: desativar ou apagar um alarme faz o monitoring-job apagar o evento
 * pendente em silêncio (`isAlarmStillArmed`) — o comportamento certo para não
 * gerar alerta falso, mas que deixava o cuidador sem rastro nenhum.
 *
 * A lista vem de um blob opaco do cliente (`z.array(z.unknown())`), então nada
 * aqui pode assumir formato: item ilegível é ignorado, nunca lança.
 */

export type AlarmChangeType = "deleted" | "disabled" | "rescheduled";

export interface AlarmChange {
  alarmId: string;
  alarmDescription: string;
  changeType: AlarmChangeType;
  oldTime: string | null;
  newTime: string | null;
}

interface AlarmLike {
  id: string;
  time?: unknown;
  description?: unknown;
  enabled?: unknown;
  repeat?: unknown;
  customDays?: unknown;
}

function isAlarmLike(value: unknown): value is AlarmLike {
  if (!value || typeof value !== "object") return false;
  const id = (value as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0;
}

/** Lista -> mapa por id. Item ilegível é ignorado; id repetido vale o primeiro. */
function indexById(list: unknown): Map<string, AlarmLike> | null {
  if (!Array.isArray(list)) return null;
  const byId = new Map<string, AlarmLike>();
  for (const item of list) {
    if (isAlarmLike(item) && !byId.has(item.id)) byId.set(item.id, item);
  }
  return byId;
}

/** `enabled` ausente = formato antigo, conta como ligado (mesma regra do monitoring-job). */
const isEnabled = (a: AlarmLike): boolean => a.enabled !== false;

function timeOf(a: AlarmLike): string | null {
  return typeof a.time === "string" && /^\d{1,2}:\d{2}$/.test(a.time) ? a.time : null;
}

function nameOf(a: AlarmLike): string {
  return typeof a.description === "string" ? a.description.trim().slice(0, 255) : "";
}

function daysKey(a: AlarmLike): string {
  if (!Array.isArray(a.customDays)) return "";
  return a.customDays
    .filter((d): d is number => typeof d === "number")
    .sort((x, y) => x - y)
    .join(",");
}

/** Só `custom` usa `customDays`; nos demais ele pode estar velho e não conta. */
function scheduleKey(a: AlarmLike): string {
  const repeat = typeof a.repeat === "string" ? a.repeat : "";
  return `${repeat}|${repeat === "custom" ? daysKey(a) : ""}`;
}

export function diffAlarms(previous: unknown, next: unknown): AlarmChange[] {
  const before = indexById(previous);
  const after = indexById(next);
  // Sem lista anterior válida (conta nova, formato antigo) ou lista nova
  // ilegível não há base de comparação: melhor calar do que acusar.
  if (!before || !after) return [];

  const changes: AlarmChange[] = [];
  for (const [id, old] of before) {
    const now = after.get(id);
    if (!now) {
      changes.push({
        alarmId: id,
        alarmDescription: nameOf(old),
        changeType: "deleted",
        oldTime: timeOf(old),
        newTime: null,
      });
      continue;
    }
    if (isEnabled(old) && !isEnabled(now)) {
      changes.push({
        alarmId: id,
        alarmDescription: nameOf(now) || nameOf(old),
        changeType: "disabled",
        oldTime: timeOf(old),
        newTime: timeOf(now),
      });
      continue;
    }
    // Desligado antes e depois: não tocava e não toca — mudar o horário dele
    // não muda nada para o cuidador.
    if (!isEnabled(now)) continue;
    if (timeOf(old) !== timeOf(now) || scheduleKey(old) !== scheduleKey(now)) {
      changes.push({
        alarmId: id,
        alarmDescription: nameOf(now) || nameOf(old),
        changeType: "rescheduled",
        oldTime: timeOf(old),
        newTime: timeOf(now),
      });
    }
  }
  return changes;
}

const MAX_NAME = 40;

function shortName(c: AlarmChange): string {
  const raw = c.alarmDescription.trim() || c.oldTime || c.newTime || "sem nome";
  return raw.length > MAX_NAME ? `${raw.slice(0, MAX_NAME - 1)}…` : raw;
}

/**
 * Texto do push ao cuidador. Leva o nome do lembrete (decisão D8 do Pedro): o
 * nome é texto livre e passa por Expo/Google/Apple — a Política de Privacidade
 * cita esses provedores (Tarefa 8).
 */
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

/** Nome da pessoa monitorada para os textos dos pushes: anamnese > conta > genérico. */
export function pickPersonName(
  anamnesis: unknown,
  accountName: string | null | undefined
): string {
  const fullName =
    anamnesis && typeof anamnesis === "object"
      ? (anamnesis as { fullName?: unknown }).fullName
      : undefined;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();
  if (accountName && accountName.trim()) return accountName.trim();
  return "A pessoa que você acompanha";
}
```

- [ ] **Passo 4: Ver passar**

```bash
pnpm vitest run tests/alarm-diff.test.ts && pnpm check
```

Esperado: PASS e `tsc` limpo.

- [ ] **Passo 5: Entregar** — arquivos: `server/_core/alarm-diff.ts`, `tests/alarm-diff.test.ts`.

---

## Tarefa 6: Gravar e avisar mudanças de alarme no backup (servidor)

**Branch:** `beta/06-alarm-changes-servidor` · **Mensagem:** `feat(monitoring): grava mudanças de alarme e avisa o cuidador no userData.put`
**Depende de:** Tarefa 5.

**Files:**
- Modify: `drizzle/schema.ts` (nova tabela depois de `InsertAlarmEvent`, ~linha 170)
- Create: `drizzle/0015_alarm_changes.sql` e arquivos `drizzle/meta/*` (gerados)
- Create: `server/db-alarm-changes.ts`
- Create: `server/alarm-changes.ts`
- Modify: `server/routers.ts` (import da linha 15-18; `userData.put` ~linhas 276-300; `userData.export` ~315-357)
- Modify: `server/db-account.ts` (import e transação)
- Modify: `server/db-monitoring.ts` (`purgeStaleData`)
- Modify: `server/monitoring-job.ts` (log do expurgo, ~linha 770)
- Modify: `lib/_core/data-export.ts` (`ExportServerData`)
- Test: `tests/user-data-put-alarm-changes.test.ts`, `tests/alarm-changes-lifecycle.test.ts`; modificar `tests/user-data-export.test.ts` e o fixture de `tests/data-export.test.ts`

**Interfaces:**
- Consumes: `diffAlarms`, `buildAlarmChangePush`, `pickPersonName`, `AlarmChange` (Tarefa 5); `getActiveCaregiversForMonitored` (`server/db-links`), `getPushTokensForOpenIds` (`server/db-push`), `sendExpoPush` (`server/push`).
- Produces: tabela `alarmChanges` e tipo `InsertAlarmChange` (`drizzle/schema.ts`); `insertAlarmChanges(rows: InsertAlarmChange[]): Promise<void>` e `getRecentAlarmChanges(openId: string, limit?: number)` (`server/db-alarm-changes.ts`); `recordAndNotifyAlarmChanges(args: { openId: string; previousAlarms: unknown; nextAlarms: unknown; personName: string }): Promise<void>` (`server/alarm-changes.ts`).

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/user-data-put-alarm-changes.test.ts`:

```ts
/**
 * Mudança de alarme no backup (userData.put): grava a mudança e avisa o
 * cuidador. Antes, excluir ou desativar um alarme fazia o monitoring-job apagar
 * o evento pendente em silêncio — o cuidador nunca ficava sabendo.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

let storedAlarms: unknown = undefined;
let hasStoredRow = true;

vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserData: vi.fn(async () => (hasStoredRow ? { alarms: storedAlarms } : undefined)),
    upsertUserData: vi.fn(async () => undefined),
  };
});
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

import { appRouter } from "../server/routers";
import * as db from "../server/db";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbLinks from "../server/db-links";
import * as push from "../server/push";

const losartana = { id: "a1", time: "08:00", description: "Losartana", enabled: true, repeat: "daily" };
const metformina = { id: "a2", time: "20:00", description: "Metformina", enabled: true, repeat: "daily" };

function makeUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: "Conta Maria",
    email: "maria@example.com",
    phone: null,
    userType: "monitored",
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

function put(openId: string, alarms: unknown[]) {
  const caller = appRouter.createCaller(makeCtx(makeUser(openId)));
  return caller.userData.put({
    alarms,
    anamnesis: { fullName: "Vó Maria" },
    dataUpdatedAt: Date.now(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  storedAlarms = undefined;
  hasStoredRow = true;
});

describe("userData.put — mudanças de alarme", () => {
  it("excluir um alarme grava a mudança e avisa o cuidador com o nome do lembrete", async () => {
    storedAlarms = [losartana, metformina];

    await put("maria-1", [metformina]);

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledWith([
      expect.objectContaining({
        openId: "maria-1",
        alarmId: "a1",
        alarmDescription: "Losartana",
        changeType: "deleted",
      }),
    ]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [tokens, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(tokens).toEqual(["ExpoTok[cg-1]"]);
    expect(message.body).toBe('Vó Maria excluiu o lembrete "Losartana".');
    expect(message.data).toMatchObject({ type: "alarm_changed" });
  });

  it("o mesmo backup repetido não grava nem avisa nada", async () => {
    storedAlarms = [losartana, metformina];

    await put("maria-2", [metformina, losartana]);

    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("primeiro backup da conta (sem linha anterior) não gera mudança", async () => {
    hasStoredRow = false;

    await put("maria-3", [losartana]);

    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
  });

  it("lista anterior ilegível não derruba o backup nem gera aviso", async () => {
    for (const lixo of ["lixo", [null, 42, {}, { id: "" }], { alarms: 1 }]) {
      storedAlarms = lixo;
      await expect(put("maria-4", [losartana])).resolves.toEqual({ success: true });
    }
    expect(dbChanges.insertAlarmChanges).not.toHaveBeenCalled();
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("falha ao gravar a mudança não derruba o backup", async () => {
    storedAlarms = [losartana];
    vi.mocked(dbChanges.insertAlarmChanges).mockRejectedValueOnce(new Error("DB fora do ar"));

    await expect(put("maria-5", [])).resolves.toEqual({ success: true });
    expect(db.upsertUserData).toHaveBeenCalledTimes(1);
  });

  it("sem cuidador vinculado grava a mudança e não manda push", async () => {
    storedAlarms = [losartana];
    vi.mocked(dbLinks.getActiveCaregiversForMonitored).mockResolvedValueOnce([]);

    await put("maria-6", []);

    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(1);
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("limita o push a 5 por minuto, mas grava todas as mudanças", async () => {
    for (let i = 0; i < 6; i++) {
      storedAlarms = [{ ...losartana, id: `x${i}` }];
      await put("maria-7", []);
    }
    expect(dbChanges.insertAlarmChanges).toHaveBeenCalledTimes(6);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(5);
  });
});
```

Criar `tests/alarm-changes-lifecycle.test.ts`:

```ts
/**
 * Tabela nova precisa entrar nos três ciclos de vida: exclusão de conta
 * (LGPD Art. 18, VI), exportação (Art. 18, V) e retenção (minimização).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("alarm_changes — ciclo de vida do dado", () => {
  it("a exclusão de conta apaga as mudanças de alarme", () => {
    expect(read("server/db-account.ts")).toMatch(
      /tx\.delete\(alarmChanges\)\.where\(eq\(alarmChanges\.openId, openId\)\)/
    );
  });

  it("a exportação inclui as mudanças de alarme", () => {
    const routers = read("server/routers.ts");
    expect(routers).toMatch(/getRecentAlarmChanges\(openId, LIMITE_EXPORTACAO\)/);
    expect(routers).toMatch(/historicoDeAlteracoesDeAlarmes/);
    expect(read("lib/_core/data-export.ts")).toMatch(/historicoDeAlteracoesDeAlarmes: unknown\[\]/);
  });

  it("a retenção expurga as mudanças de alarme", () => {
    expect(read("server/db-monitoring.ts")).toMatch(/db\.delete\(alarmChanges\)/);
  });
});
```

Em `tests/user-data-export.test.ts`, depois do `vi.mock("../server/db-links", ...)` (termina na linha 31), acrescentar:

```ts
vi.mock("../server/db-alarm-changes", () => ({
  getRecentAlarmChanges: vi.fn(async () => [{ id: 1, alarmId: "a1", changeType: "deleted" }]),
  insertAlarmChanges: vi.fn(),
}));
```

e, no teste "devolve todas as seções para o usuário autenticado", depois de `expect(result.dadosDaConta).toBeTruthy();`, acrescentar:

```ts
    expect(result.historicoDeAlteracoesDeAlarmes).toHaveLength(1);
```

Em `tests/data-export.test.ts`, localizar o fixture de `ExportServerData`:

```bash
grep -n "cuidadoresVinculados" tests/data-export.test.ts
```

e acrescentar `historicoDeAlteracoesDeAlarmes: [],` ao lado de cada `cuidadoresVinculados` do fixture.

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/user-data-put-alarm-changes.test.ts tests/alarm-changes-lifecycle.test.ts tests/user-data-export.test.ts
```

Esperado: FAIL (`../server/db-alarm-changes` não existe; guardas de texto sem match).

- [ ] **Passo 3: Tabela e migração**

Em `drizzle/schema.ts`, depois de `export type InsertAlarmEvent = typeof alarmEvents.$inferInsert;`, acrescentar:

```ts
// -----------------------------------------------------------------------------
// Alarm Changes - o que o usuário tirou do ar (excluiu, desativou, remarcou)
// -----------------------------------------------------------------------------

/**
 * Registro de mudanças de alarme detectadas no backup (`userData.put`). Existe
 * porque desativar ou apagar um alarme faz o monitoring-job apagar o evento
 * pendente em silêncio — sem esta tabela o cuidador não tem rastro nenhum.
 * Guarda um derivado do que já está em `user_data.alarms` (mesma base legal).
 * Entra na exclusão de conta, na exportação e na retenção de 180 dias.
 */
export const alarmChanges = mysqlTable(
  "alarm_changes",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull(),
    alarmId: varchar("alarmId", { length: 64 }).notNull(),
    alarmDescription: varchar("alarmDescription", { length: 255 }).notNull().default(""),
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

Gerar a migração (não conecta ao banco; só precisa da variável para o config):

```bash
DATABASE_URL="mysql://u:p@localhost:3306/vigora" pnpm exec drizzle-kit generate --name alarm_changes
ls drizzle | tail -4
grep -n "alarm_changes" drizzle/0015_alarm_changes.sql
```

Esperado: `drizzle/0015_alarm_changes.sql` com `CREATE TABLE \`alarm_changes\`` e o índice `alarm_changes_openid_idx`; novos arquivos em `drizzle/meta/`. A migração roda no boot do servidor (corrigido em `0b4f13f`).

- [ ] **Passo 4: Helpers de banco**

Criar `server/db-alarm-changes.ts`:

```ts
/**
 * db-alarm-changes.ts
 *
 * Persistência do registro de mudanças de alarme (ver `alarmChanges` em
 * drizzle/schema.ts e `server/_core/alarm-diff.ts`).
 */
import { desc, eq } from "drizzle-orm";
import { alarmChanges, type InsertAlarmChange } from "../drizzle/schema";
import { getDb } from "./db";

export async function insertAlarmChanges(rows: InsertAlarmChange[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db.insert(alarmChanges).values(rows);
}

/** Mudanças da conta, MAIS RECENTES PRIMEIRO. */
export async function getRecentAlarmChanges(openId: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(alarmChanges)
    .where(eq(alarmChanges.openId, openId))
    .orderBy(desc(alarmChanges.createdAt), desc(alarmChanges.id))
    .limit(limit);
}
```

- [ ] **Passo 5: Orquestrador (grava e avisa, nunca derruba o backup)**

Criar `server/alarm-changes.ts`:

```ts
/**
 * alarm-changes.ts
 *
 * Depois que o backup é gravado: compara a lista anterior com a nova, registra
 * o que o usuário tirou do ar e avisa os cuidadores vinculados.
 *
 * Best-effort de ponta a ponta: o backup do usuário já foi gravado e NÃO pode
 * falhar por causa de um registro ou de um push.
 */
import { buildAlarmChangePush, diffAlarms, type AlarmChange } from "./_core/alarm-diff";
import { insertAlarmChanges } from "./db-alarm-changes";
import { getActiveCaregiversForMonitored } from "./db-links";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";

/**
 * Máx. 5 pushes de mudança por minuto por conta: um cliente com defeito (ou
 * mal-intencionado) alternando alarmes não pode virar spam no cuidador. Só o
 * PUSH é limitado — a mudança é sempre gravada.
 */
const PUSH_WINDOW_MS = 60_000;
const PUSH_LIMIT = 5;
const pushLog = new Map<string, number[]>();

function isPushRateLimited(openId: string): boolean {
  const now = Date.now();
  const recent = (pushLog.get(openId) ?? []).filter((ts) => now - ts < PUSH_WINDOW_MS);
  if (recent.length >= PUSH_LIMIT) {
    pushLog.set(openId, recent);
    return true;
  }
  recent.push(now);
  pushLog.set(openId, recent);
  return false;
}

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
  const tokens = await getPushTokensForOpenIds(caregivers.map((c) => c.caregiverOpenId));
  if (tokens.length === 0) {
    // Mesmo aviso dos outros pushes ao cuidador: sem token o alerta some em
    // silêncio. Sem openId no log (LGPD).
    console.warn(
      `[AlarmChanges] ${caregivers.length} cuidador(es) vinculado(s), 0 push tokens — push NÃO enviado.`
    );
    return;
  }
  await sendExpoPush(
    tokens.map((t) => t.token),
    { ...message, data: { type: "alarm_changed", url: "/(caregiver-tabs)/alerts" } }
  );
}

export async function recordAndNotifyAlarmChanges(args: {
  openId: string;
  previousAlarms: unknown;
  nextAlarms: unknown;
  personName: string;
}): Promise<void> {
  const changes = diffAlarms(args.previousAlarms, args.nextAlarms);
  if (changes.length === 0) return;

  try {
    await insertAlarmChanges(changes.map((c) => ({ openId: args.openId, ...c })));
  } catch (err) {
    console.warn("[AlarmChanges] falha ao registrar mudanças de alarme:", err);
  }

  try {
    await pushToCaregivers(args.openId, args.personName, changes);
  } catch (err) {
    console.warn("[AlarmChanges] falha ao avisar o cuidador:", err);
  }
}
```

- [ ] **Passo 6: Ligar no `userData.put` e na exportação**

Em `server/routers.ts`:

1. Depois da linha 18 (`import { getActiveCaregiversForMonitored } from "./db-links";`) acrescentar:

```ts
import { recordAndNotifyAlarmChanges } from "./alarm-changes";
import { pickPersonName } from "./_core/alarm-diff";
import { getRecentAlarmChanges } from "./db-alarm-changes";
```

2. Trocar o corpo da mutation `put` (de `.mutation(async ({ ctx, input }) => {` até `return { success: true } as const;` do `put`) por:

```ts
      .mutation(async ({ ctx, input }) => {
        const openId = ctx.user.openId;
        // Lista anterior lida ANTES do upsert: é a única base de comparação das
        // mudanças de alarme. Falha ao ler não pode impedir o backup.
        let previousAlarms: unknown = undefined;
        try {
          previousAlarms = (await getUserData(openId))?.alarms;
        } catch (err) {
          console.warn("[UserData] não foi possível ler a lista anterior de alarmes:", err);
        }
        const nextAlarms = input.alarms ?? [];

        await upsertUserData({
          openId,
          anamnesis: (input.anamnesis ?? null) as Record<string, unknown> | null,
          emergencyContacts: input.emergencyContacts ?? [],
          alarms: nextAlarms,
          settings: (input.settings ?? null) as Record<string, unknown> | null,
          healthMetrics: input.healthMetrics ?? [],
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
      }),
```

3. Na rota `export`, trocar a desestruturação e o `Promise.all`:

```ts
      const [user, data, historicoDeAlarmes, alertasEnviados, sinalDeVida, cuidadores] =
        await Promise.all([
          getUserByOpenId(openId),
          getUserData(openId),
          getAlarmEventHistory(openId, LIMITE_EXPORTACAO),
          getWarningHistory(openId, LIMITE_EXPORTACAO),
          getAccountLiveness(openId),
          getActiveCaregiversForMonitored(openId),
        ]);
```

por:

```ts
      const [
        user,
        data,
        historicoDeAlarmes,
        alertasEnviados,
        sinalDeVida,
        cuidadores,
        alteracoesDeAlarmes,
      ] = await Promise.all([
        getUserByOpenId(openId),
        getUserData(openId),
        getAlarmEventHistory(openId, LIMITE_EXPORTACAO),
        getWarningHistory(openId, LIMITE_EXPORTACAO),
        getAccountLiveness(openId),
        getActiveCaregiversForMonitored(openId),
        getRecentAlarmChanges(openId, LIMITE_EXPORTACAO),
      ]);
```

e, no objeto retornado, depois de `historicoDeAlarmes,` acrescentar `historicoDeAlteracoesDeAlarmes: alteracoesDeAlarmes,`.

Em `lib/_core/data-export.ts`, na interface `ExportServerData`, depois de `historicoDeAlarmes: unknown[];` acrescentar `historicoDeAlteracoesDeAlarmes: unknown[];`.

- [ ] **Passo 7: Exclusão de conta e retenção**

Em `server/db-account.ts`: acrescentar `alarmChanges,` à lista de imports de `../drizzle/schema` (depois de `accountLiveness,`) e, na transação, depois de `await tx.delete(alarmEvents).where(eq(alarmEvents.openId, openId));`:

```ts
    await tx.delete(alarmChanges).where(eq(alarmChanges.openId, openId));
```

Em `server/db-monitoring.ts`: acrescentar `alarmChanges,` ao import de `../drizzle/schema`; no tipo de retorno de `purgeStaleData` acrescentar `alarmChanges: number;`; depois da linha `const ev = await db.delete(alarmEvents)...` acrescentar:

```ts
  const ac = await db.delete(alarmChanges).where(lt(alarmChanges.createdAt, eventsCutoff));
```

e no objeto retornado `alarmChanges: affected(ac),`.

Em `server/monitoring-job.ts`, no log do expurgo (~linha 770), trocar `${r.alarmEvents} alarm events, ${r.warningLog} warnings,` por `${r.alarmEvents} alarm events, ${r.alarmChanges ?? 0} alarm changes, ${r.warningLog} warnings,`.

- [ ] **Passo 8: Ver passar**

```bash
pnpm vitest run tests/user-data-put-alarm-changes.test.ts tests/alarm-changes-lifecycle.test.ts tests/user-data-export.test.ts tests/data-export.test.ts tests/alarm-diff.test.ts
pnpm test && pnpm check
```

Esperado: tudo verde.

- [ ] **Passo 9: Entregar** — arquivos: `drizzle/schema.ts`, `drizzle/0015_alarm_changes.sql`, `drizzle/meta/*`, `server/db-alarm-changes.ts`, `server/alarm-changes.ts`, `server/routers.ts`, `server/db-account.ts`, `server/db-monitoring.ts`, `server/monitoring-job.ts`, `lib/_core/data-export.ts`, os testes novos e os dois modificados.

---

## Tarefa 7: API do cuidador devolve as mudanças; desvínculo avisa o cuidador

**Branch:** `beta/07-api-cuidador` · **Mensagem:** `feat(link): alertas do cuidador incluem mudanças de alarme e o desvínculo é avisado`
**Depende de:** Tarefa 6.

**Files:**
- Modify: `server/routers-links.ts` (imports; `getMonitoredAlerts` ~294-317; `revokeLink` ~443-452; função auxiliar nova)
- Test: `tests/link.alerts-and-revoke.test.ts`

**Interfaces:**
- Consumes: `getRecentAlarmChanges` (Tarefa 6), `pickPersonName` (Tarefa 5), `getPushTokensForOpenIds`, `sendExpoPush`.
- Produces: `link.getMonitoredAlerts` passa a devolver `changes: { id: number; alarmId: string; alarmDescription: string; changeType: "deleted" | "disabled" | "rescheduled"; oldTime: string | null; newTime: string | null; createdAt: number }[]`; push `link_revoked` com `data.url = "/(caregiver-tabs)/link"`.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/link.alerts-and-revoke.test.ts`:

```ts
/**
 * - getMonitoredAlerts devolve as mudanças de alarme do monitorado VINCULADO
 *   (a conta vem do vínculo, nunca de input).
 * - Quando o monitorado encerra o vínculo, o cuidador é avisado. `otherOpenId`
 *   vem do cliente: só avisa quem de fato estava vinculado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => [{ caregiverOpenId: "cg-1" }]),
  createInvite: vi.fn(),
  consumeInviteByCode: vi.fn(),
  getActiveLinkForCaregiver: vi.fn(async () => ({ monitoredOpenId: "vovo" })),
  getInviteByCode: vi.fn(),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  revokeLink: vi.fn(async () => undefined),
  upsertActiveLink: vi.fn(),
}));
vi.mock("../server/db-alarm-changes", () => ({
  insertAlarmChanges: vi.fn(),
  getRecentAlarmChanges: vi.fn(async () => [
    {
      id: 7,
      alarmId: "a1",
      alarmDescription: "Losartana",
      changeType: "deleted",
      oldTime: "08:00",
      newTime: null,
      createdAt: new Date("2026-10-02T17:32:00Z"),
    },
  ]),
}));
vi.mock("../server/db-push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db-push")>()),
  getPushTokensForOpenIds: vi.fn(async () => [{ token: "ExpoTok[cg-1]" }]),
}));
vi.mock("../server/push", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/push")>()),
  sendExpoPush: vi.fn(async () => 1),
}));
vi.mock("../server/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../server/db")>()),
  getUserByOpenId: vi.fn(async () => ({ name: "Conta Vovó", openId: "vovo" })),
  getUserData: vi.fn(async () => ({ anamnesis: { fullName: "Vovó Dona" } })),
}));

import { appRouter } from "../server/routers";
import * as dbLinks from "../server/db-links";
import * as dbChanges from "../server/db-alarm-changes";
import * as dbPush from "../server/db-push";
import * as push from "../server/push";

function makeUser(openId: string, userType: "monitored" | "caregiver"): User {
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

function makeCtx(user: User): TrpcContext {
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("link.getMonitoredAlerts — mudanças de alarme", () => {
  it("devolve as mudanças do monitorado vinculado, com createdAt em epoch-ms", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("cg-1", "caregiver")));
    const result = await caller.link.getMonitoredAlerts();

    expect(dbChanges.getRecentAlarmChanges).toHaveBeenCalledWith("vovo", 20);
    expect(result.changes).toEqual([
      {
        id: 7,
        alarmId: "a1",
        alarmDescription: "Losartana",
        changeType: "deleted",
        oldTime: "08:00",
        newTime: null,
        createdAt: new Date("2026-10-02T17:32:00Z").getTime(),
      },
    ]);
  });

  it("sem vínculo ativo é proibido", async () => {
    vi.mocked(dbLinks.getActiveLinkForCaregiver).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx(makeUser("cg-2", "caregiver")));
    await expect(caller.link.getMonitoredAlerts()).rejects.toThrow(/vinculado/i);
  });
});

describe("link.revokeLink — aviso ao cuidador", () => {
  it("monitorado encerra o vínculo: o cuidador vinculado recebe 'link_revoked'", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo", "monitored")));
    await caller.link.revokeLink({ otherOpenId: "cg-1" });

    expect(dbLinks.revokeLink).toHaveBeenCalledWith("cg-1", "vovo");
    expect(dbPush.getPushTokensForOpenIds).toHaveBeenCalledWith(["cg-1"]);
    expect(push.sendExpoPush).toHaveBeenCalledTimes(1);
    const [tokens, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(tokens).toEqual(["ExpoTok[cg-1]"]);
    expect(message.body).toBe("Vovó Dona encerrou o acompanhamento.");
    expect(message.data).toMatchObject({ type: "link_revoked", url: "/(caregiver-tabs)/link" });
  });

  it("otherOpenId de quem NÃO é cuidador vinculado não recebe push", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo", "monitored")));
    await caller.link.revokeLink({ otherOpenId: "estranho" });

    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("cuidador desvincula: ninguém é avisado", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("cg-1", "caregiver")));
    await caller.link.revokeLink({ otherOpenId: "vovo" });

    expect(dbLinks.revokeLink).toHaveBeenCalledWith("cg-1", "vovo");
    expect(push.sendExpoPush).not.toHaveBeenCalled();
  });

  it("falha no push não impede o desvínculo", async () => {
    vi.mocked(push.sendExpoPush).mockRejectedValueOnce(new Error("Expo fora do ar"));
    const caller = appRouter.createCaller(makeCtx(makeUser("vovo", "monitored")));
    await expect(caller.link.revokeLink({ otherOpenId: "cg-1" })).resolves.toEqual({ success: true });
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/link.alerts-and-revoke.test.ts
```

Esperado: FAIL (`result.changes` indefinido; nenhum push no desvínculo).

- [ ] **Passo 3: Implementar**

Em `server/routers-links.ts`:

1. Depois de `import { getAccountLiveness } from "./db-monitoring";` acrescentar:

```ts
import { getRecentAlarmChanges } from "./db-alarm-changes";
import { getPushTokensForOpenIds } from "./db-push";
import { sendExpoPush } from "./push";
import { pickPersonName } from "./_core/alarm-diff";
```

2. Depois de `requireCaregiverLink` (termina antes de `export const linkRouter`), acrescentar:

```ts
/**
 * Avisa o cuidador de que o monitorado encerrou o vínculo. Best-effort: o
 * desvínculo (direito do titular, LGPD Art. 18) já foi feito e não pode falhar
 * por causa do push.
 */
async function notifyLinkRevoked(caregiverOpenId: string, monitoredOpenId: string): Promise<void> {
  try {
    const tokens = await getPushTokensForOpenIds([caregiverOpenId]);
    if (tokens.length === 0) return;
    const [data, user] = await Promise.all([
      getUserData(monitoredOpenId),
      getUserByOpenId(monitoredOpenId),
    ]);
    await sendExpoPush(
      tokens.map((t) => t.token),
      {
        title: "Acompanhamento encerrado — Vigora",
        body: `${pickPersonName(data?.anamnesis, user?.name)} encerrou o acompanhamento.`,
        data: { type: "link_revoked", url: "/(caregiver-tabs)/link" },
      }
    );
  } catch (err) {
    console.warn("[Links] push de desvínculo falhou:", err);
  }
}
```

3. Em `getMonitoredAlerts`, trocar o `Promise.all` e o retorno:

```ts
    const [events, warnings, changes] = await Promise.all([
      getRecentMissedEventsForAccount(link.monitoredOpenId, 30),
      getRecentWarningsForAccount(link.monitoredOpenId, 20),
      getRecentAlarmChanges(link.monitoredOpenId, 20),
    ]);
```

e, no objeto retornado, depois de `warnings: warnings.map(...),` acrescentar:

```ts
      changes: changes.map((c) => ({
        id: c.id,
        alarmId: c.alarmId,
        alarmDescription: c.alarmDescription,
        changeType: c.changeType,
        oldTime: c.oldTime,
        newTime: c.newTime,
        createdAt: c.createdAt.getTime(),
      })),
```

4. Trocar a mutation `revokeLink`:

```ts
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.userType === "monitored") {
        // otherOpenId vem do cliente: só avisa quem de fato estava vinculado.
        const wasLinked = (await getActiveCaregiversForMonitored(ctx.user.openId)).some(
          (c) => c.caregiverOpenId === input.otherOpenId
        );
        await revokeLinkRow(input.otherOpenId, ctx.user.openId);
        if (wasLinked) await notifyLinkRevoked(input.otherOpenId, ctx.user.openId);
      } else {
        await revokeLinkRow(ctx.user.openId, input.otherOpenId);
      }
      return { success: true } as const;
    }),
```

- [ ] **Passo 4: Ver passar**

```bash
pnpm vitest run tests/link.alerts-and-revoke.test.ts tests/links.test.ts tests/link.getMyCaregivers.test.ts
pnpm test && pnpm check
```

Esperado: tudo verde.

- [ ] **Passo 5: Entregar** — arquivos: `server/routers-links.ts`, `tests/link.alerts-and-revoke.test.ts`.

---

## Tarefa 8: App do cuidador mostra as mudanças e rótulos honestos

**Branch:** `beta/08-cuidador-alertas` · **Mensagem:** `feat(cuidador): alertas mostram mudanças de lembrete e rótulos sem afirmar o que não se sabe`
**Depende de:** Tarefa 7.

**Files:**
- Modify: `lib/caregiver-format.ts` (funções puras novas no fim)
- Modify: `app/(caregiver-tabs)/alerts.tsx` (imports linha 14; `items` linhas 56-76)
- Modify: `components/caregiver-push-initializer.tsx` (linha 20)
- Modify: `server/monitoring-job.ts` (push do Passo 4 para `not_sent`, ~linhas 709-716)
- Modify: `tests/monitoring-job.classification.test.ts` (teste "'not_sent' → ...", ~linhas 150-166)
- Modify: `app/(tabs)/settings.tsx` (texto da Política de Privacidade, linha ~1629)
- Test: `tests/caregiver-format.test.ts`, `tests/privacy-policy-push.test.ts`

**Interfaces:**
- Produces: `LEGACY_CHECKIN_ALARM_ID`, `alertEventTitle(e: { alarmId: string; status: string; kind?: string | null }): string`, `alarmChangeTitle(c: { alarmDescription: string; changeType: "deleted" | "disabled" | "rescheduled"; oldTime: string | null; newTime: string | null }): string` em `@/lib/caregiver-format`.

Regra da spec (4.9): check-in perdido aparece como "Check-in não respondido"; `not_sent` vira "sem confirmação do aparelho" — o servidor não sabe se o alarme tocou, então o texto não afirma que o celular está desligado.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/caregiver-format.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alarmChangeTitle, alertEventTitle } from '../lib/caregiver-format';

describe('alertEventTitle', () => {
  it('alarme de remédio não respondido', () => {
    expect(alertEventTitle({ alarmId: 'a1', status: 'missed' })).toBe('Alarme não respondido');
  });

  it('not_sent não afirma que o celular está desligado', () => {
    const title = alertEventTitle({ alarmId: 'a1', status: 'not_sent' });
    expect(title).toBe('Alarme sem confirmação do aparelho');
    expect(title).not.toMatch(/desligado|offline/i);
  });

  it('check-in antigo (id fixo) aparece como check-in', () => {
    expect(alertEventTitle({ alarmId: 'checkin-daily', status: 'missed' })).toBe('Check-in não respondido');
  });

  it('check-in novo (kind) aparece como check-in', () => {
    expect(alertEventTitle({ alarmId: 'x', status: 'not_sent', kind: 'checkin' })).toBe(
      'Check-in sem confirmação do aparelho'
    );
  });
});

describe('alarmChangeTitle', () => {
  const base = { alarmDescription: 'Losartana', oldTime: '08:00', newTime: null };

  it('excluído', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'deleted' })).toBe('Excluiu "Losartana"');
  });

  it('desativado', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'disabled' })).toBe('Desativou "Losartana"');
  });

  it('horário mudou', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'rescheduled', newTime: '09:30' })).toBe(
      'Mudou o horário de "Losartana" para 09:30'
    );
  });

  it('só os dias mudaram', () => {
    expect(alarmChangeTitle({ ...base, changeType: 'rescheduled', newTime: '08:00' })).toBe(
      'Mudou os dias de "Losartana"'
    );
  });

  it('sem nome usa o horário', () => {
    expect(alarmChangeTitle({ ...base, alarmDescription: ' ', changeType: 'deleted' })).toBe('Excluiu "08:00"');
  });
});

describe('push do cuidador', () => {
  it('toque nos pushes novos navega (alarm_changed e link_revoked)', () => {
    const src = readFileSync(
      join(__dirname, '..', 'components', 'caregiver-push-initializer.tsx'),
      'utf8'
    );
    expect(src).toMatch(/'alarm_changed'/);
    expect(src).toMatch(/'link_revoked'/);
  });
});
```

Criar `tests/privacy-policy-push.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('a Política de Privacidade cita os provedores de push e avisa que o nome do lembrete pode aparecer', () => {
  const settings = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'settings.tsx'), 'utf8');
  expect(settings).toMatch(/Expo, Google e Apple \(notificações push aos cuidadores/);
  expect(settings).toMatch(/pode mostrar o nome do lembrete/);
});
```

Em `tests/monitoring-job.classification.test.ts`, trocar o teste `'not_sent' → 'não entregue / pode estar desligado' no push e no WhatsApp` por:

```ts
  it("'not_sent' → push 'sem confirmação' (não afirma nada) e WhatsApp 'não entregue'", async () => {
    vi.mocked(db.getMissedMedicationEvents).mockResolvedValue([
      { ...pendingEvent, status: "not_sent" },
    ]);

    await runMonitoringJob();

    const pushCall = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(pushCall[1].title).toContain("Alarme sem confirmação");
    expect(pushCall[1].body).toContain("Não houve confirmação");
    expect(pushCall[1].body).not.toContain("desligado");
    expect(pushCall[1].body).not.toContain("não respondeu");

    const waMessage = vi.mocked(whatsapp.sendWhatsAppMessage).mock.calls[0][1];
    expect(waMessage).toContain("ALARME NÃO ENTREGUE");
    expect(waMessage).toContain("não pôde ser entregue");

    expect(db.markEventWarningSent).toHaveBeenCalledWith(11);
  });
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/caregiver-format.test.ts tests/privacy-policy-push.test.ts tests/monitoring-job.classification.test.ts
```

Esperado: FAIL.

- [ ] **Passo 3: Funções puras**

Acrescentar ao fim de `lib/caregiver-format.ts`:

```ts
/** Id fixo do check-in antigo (sistema paralelo anterior à Fase 3). */
export const LEGACY_CHECKIN_ALARM_ID = 'checkin-daily';

/**
 * Título de um alerta de evento perdido. `not_sent` NÃO afirma que o celular
 * está desligado: o servidor só sabe que não houve sinal de vida do app depois
 * do horário — não sabe se o alarme tocou.
 */
export function alertEventTitle(e: { alarmId: string; status: string; kind?: string | null }): string {
  const checkin = e.kind === 'checkin' || e.alarmId === LEGACY_CHECKIN_ALARM_ID;
  const subject = checkin ? 'Check-in' : 'Alarme';
  return e.status === 'missed'
    ? `${subject} não respondido`
    : `${subject} sem confirmação do aparelho`;
}

/** Título de uma mudança de lembrete feita pela pessoa acompanhada. */
export function alarmChangeTitle(c: {
  alarmDescription: string;
  changeType: 'deleted' | 'disabled' | 'rescheduled';
  oldTime: string | null;
  newTime: string | null;
}): string {
  const name = c.alarmDescription.trim() || c.oldTime || c.newTime || 'Lembrete sem nome';
  switch (c.changeType) {
    case 'deleted':
      return `Excluiu "${name}"`;
    case 'disabled':
      return `Desativou "${name}"`;
    default:
      return c.oldTime && c.newTime && c.oldTime !== c.newTime
        ? `Mudou o horário de "${name}" para ${c.newTime}`
        : `Mudou os dias de "${name}"`;
  }
}
```

- [ ] **Passo 4: Tela de alertas**

Em `app/(caregiver-tabs)/alerts.tsx`:

1. Linha 14: `import { relativeTime } from '@/lib/caregiver-format';` → `import { alarmChangeTitle, alertEventTitle, relativeTime } from '@/lib/caregiver-format';`
2. Depois de `const warnings = alerts.data?.warnings ?? [];` acrescentar `  const changes = alerts.data?.changes ?? [];`
3. Trocar a linha do `title` dos eventos:

```tsx
      title: e.status === 'missed' ? 'Alarme não respondido' : 'Alarme não enviado (offline)',
```

por:

```tsx
      title: alertEventTitle(e),
```

4. Depois do bloco `...warnings.map((w) => ({ ... })),` (antes do `].sort(...)`) acrescentar:

```tsx
    ...changes.map((c) => ({
      id: `change-${c.id}`,
      severity: 'warning' as const,
      icon: 'edit' as AlertItem['icon'],
      title: alarmChangeTitle(c),
      subtitle: relativeTime(c.createdAt),
      ts: c.createdAt,
    })),
```

- [ ] **Passo 5: Tipos de push, copy do servidor e Política de Privacidade**

`components/caregiver-push-initializer.tsx` linha 20:

```ts
const CAREGIVER_PUSH_TYPES = ['monitoring_warning', 'missed_checkin', 'missed_alarm', 'sos'];
```

→

```ts
const CAREGIVER_PUSH_TYPES = [
  'monitoring_warning',
  'missed_checkin',
  'missed_alarm',
  'sos',
  'alarm_changed',
  'link_revoked',
];
```

`server/monitoring-job.ts` (Passo 4), trocar:

```ts
        notSent ? "⚠️ Alarme não entregue — Vigora" : "⚠️ Alarme não respondido — Vigora",
        notSent
          ? `O celular de ${name} pode estar desligado ou sem conexão — o alarme das ${scheduledStr} não foi entregue. Toque para ver os detalhes.`
          : `${name} não respondeu ao alarme das ${scheduledStr}. Toque para ver os detalhes.`,
```

por:

```ts
        notSent ? "⚠️ Alarme sem confirmação — Vigora" : "⚠️ Alarme não respondido — Vigora",
        notSent
          ? `Não houve confirmação do aparelho de ${name} para o alarme das ${scheduledStr}. Toque para ver os detalhes.`
          : `${name} não respondeu ao alarme das ${scheduledStr}. Toque para ver os detalhes.`,
```

(O WhatsApp/SMS aos contatos continua "não pôde ser entregue — o celular pode estar desligado": ali o "pode" já não afirma.)

`app/(tabs)/settings.tsx` (linha ~1629, dentro do `message` da Política): trocar `Expo (notificações aos cuidadores)` por `Expo, Google e Apple (notificações push aos cuidadores — o aviso de lembrete alterado pode mostrar o nome do lembrete)`.

- [ ] **Passo 6: Ver passar**

```bash
pnpm vitest run tests/caregiver-format.test.ts tests/privacy-policy-push.test.ts tests/monitoring-job.classification.test.ts
pnpm test && pnpm check
```

Esperado: verde.

- [ ] **Passo 7: Conferir no aparelho (cuidador)** — duas contas vinculadas: a pessoa acompanhada exclui um lembrete; o cuidador recebe o push com o nome e, ao tocar, abre em Alertas com a linha "Excluiu ...". Conferir claro, escuro e modo acessível.

- [ ] **Passo 8: Entregar** — arquivos: `lib/caregiver-format.ts`, `app/(caregiver-tabs)/alerts.tsx`, `components/caregiver-push-initializer.tsx`, `server/monitoring-job.ts`, `app/(tabs)/settings.tsx`, `tests/caregiver-format.test.ts`, `tests/privacy-policy-push.test.ts`, `tests/monitoring-job.classification.test.ts`.

---

## Tarefa 9: SOS honesto

**Branch:** `beta/09-sos-honesto` · **Mensagem:** `fix(sos): botão que abre o discador com 192, voz sem prometer ligação e status real dos contatos`

**Files:**
- Create: `lib/sos-status.ts`
- Modify: `components/sos-countdown-dialog.tsx` (linha 176 e import)
- Modify: `components/sos-active-screen.tsx`
- Modify: `app/(tabs)/index.tsx` (import linha 29; estado; `activateSOS`; as duas instâncias de `<SOSActiveScreen>`)
- Test: `tests/sos-status.test.ts`

**Interfaces:**
- Produces (em `@/lib/sos-status`): `SOS_CALL_NUMBER = '192'`; `SOS_SPOKEN_CONFIRMATION: string`; `type SosContactStatus = 'sending' | 'sent' | 'partial' | 'failed' | 'no_whatsapp'`; `sosContactStatus(contact: EmergencyContact, whatsappContactCount: number, result: EscalationResult | null): SosContactStatus`; `sosSummary(whatsappContactCount: number, result: EscalationResult | null): string | null`; `emptyEscalation(contactCount: number): EscalationResult`.
- `SOSActiveScreen` ganha a prop `escalation: EscalationResult | null`.

Observação sobre a spec (3.5): o resultado de `escalateSOSToContacts` é **agregado** (contagens), não por contato. Por isso o estado por contato é `sent` quando todos os contatos com WhatsApp foram alcançados, `failed` quando nenhum, e `partial` no meio — com a linha de resumo "N de M contato(s) avisado(s)". Mostrar "enviado" para um contato específico sem saber seria repetir a mentira que esta tarefa remove.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/sos-status.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SOS_CALL_NUMBER,
  SOS_SPOKEN_CONFIRMATION,
  emptyEscalation,
  sosContactStatus,
  sosSummary,
} from '../lib/sos-status';
import type { EmergencyContact } from '../lib/app-context';
import type { EscalationResult } from '../lib/alarm-escalation';

const contact = (over: Partial<EmergencyContact> = {}): EmergencyContact => ({
  id: 'c1',
  name: 'Ana',
  phone: '11999990000',
  relation: 'Filha',
  whatsapp: true,
  ...over,
});

const result = (totalSent: number): EscalationResult => ({
  method: totalSent > 0 ? 'server_api' : 'none',
  deepLinkSent: 0,
  deepLinkFailed: 0,
  serverApiSent: totalSent,
  serverApiFailed: 0,
  totalSent,
  totalFailed: 0,
});

describe('sosContactStatus', () => {
  it('contato sem WhatsApp nunca é avisado', () => {
    expect(sosContactStatus(contact({ whatsapp: false }), 2, result(2))).toBe('no_whatsapp');
    expect(sosContactStatus(contact({ whatsapp: false }), 2, null)).toBe('no_whatsapp');
  });

  it('enquanto o envio não terminou, está enviando', () => {
    expect(sosContactStatus(contact(), 2, null)).toBe('sending');
  });

  it('todos alcançados: enviado', () => {
    expect(sosContactStatus(contact(), 2, result(2))).toBe('sent');
  });

  it('ninguém alcançado: falhou', () => {
    expect(sosContactStatus(contact(), 2, result(0))).toBe('failed');
  });

  it('só alguns alcançados: parcial (o resultado não diz quais)', () => {
    expect(sosContactStatus(contact(), 3, result(1))).toBe('partial');
  });
});

describe('sosSummary', () => {
  it('sem contato com WhatsApp não há resumo', () => {
    expect(sosSummary(0, null)).toBeNull();
  });
  it('enviando e concluído', () => {
    expect(sosSummary(3, null)).toBe('Enviando os avisos…');
    expect(sosSummary(3, result(2))).toBe('2 de 3 contato(s) avisado(s)');
  });
  it('nunca passa de 100% (deep link + servidor podem somar além)', () => {
    expect(sosSummary(2, result(5))).toBe('2 de 2 contato(s) avisado(s)');
  });
});

describe('emptyEscalation', () => {
  it('é um resultado de falha total', () => {
    const r = emptyEscalation(3);
    expect(r.totalSent).toBe(0);
    expect(r.totalFailed).toBe(3);
    expect(r.method).toBe('none');
  });
});

describe('SOS não promete o que não faz', () => {
  it('a voz não diz que está ligando para o SAMU', () => {
    expect(SOS_SPOKEN_CONFIRMATION).not.toMatch(/ligando/i);
    expect(SOS_SPOKEN_CONFIRMATION).toMatch(/toque no botão vermelho/i);
  });

  it('o diálogo de contagem fala o texto honesto', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'sos-countdown-dialog.tsx'), 'utf8');
    expect(src).toMatch(/Speech\.speak\(SOS_SPOKEN_CONFIRMATION/);
    expect(src).not.toMatch(/ligando para o SAMU/);
  });

  it('a tela do SOS abre o discador com o 192 e não simula status por timer', () => {
    const src = readFileSync(join(__dirname, '..', 'components', 'sos-active-screen.tsx'), 'utf8');
    expect(src).toMatch(/Linking\.openURL\(`tel:\$\{SOS_CALL_NUMBER\}`\)/);
    expect(src).not.toMatch(/1200 \+ i \* 600/);
    expect(SOS_CALL_NUMBER).toBe('192');
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/sos-status.test.ts
```

Esperado: FAIL (`../lib/sos-status` não existe).

- [ ] **Passo 3: Módulo de status**

Criar `lib/sos-status.ts`:

```ts
/**
 * sos-status.ts
 *
 * Regras puras da tela do SOS: estado dos contatos a partir do resultado REAL
 * da escalação, e os textos que não podem prometer o que o app não faz.
 *
 * O resultado de `escalateSOSToContacts` é agregado (contagens): não diz qual
 * contato foi alcançado. Por isso há o estado `partial` — dizer "enviado" para
 * um contato específico sem saber seria repetir a mentira que a tela tinha
 * (status simulado por timer).
 */
import type { EmergencyContact } from '@/lib/app-context';
import type { EscalationResult } from '@/lib/alarm-escalation';

export const SOS_CALL_NUMBER = '192';

/**
 * A voz do SOS. O app NÃO liga para o SAMU: quem liga é o usuário, tocando no
 * botão (o app nunca se integra ao 192 — linha vermelha da ANVISA).
 */
export const SOS_SPOKEN_CONFIRMATION =
  'Avisando suas pessoas. Para chamar o SAMU, toque no botão vermelho.';

export type SosContactStatus = 'sending' | 'sent' | 'partial' | 'failed' | 'no_whatsapp';

export function sosContactStatus(
  contact: EmergencyContact,
  whatsappContactCount: number,
  result: EscalationResult | null
): SosContactStatus {
  if (!contact.whatsapp) return 'no_whatsapp';
  if (result === null) return 'sending';
  if (result.totalSent <= 0) return 'failed';
  if (result.totalSent >= whatsappContactCount) return 'sent';
  return 'partial';
}

export function sosSummary(
  whatsappContactCount: number,
  result: EscalationResult | null
): string | null {
  if (whatsappContactCount === 0) return null;
  if (result === null) return 'Enviando os avisos…';
  const reached = Math.min(result.totalSent, whatsappContactCount);
  return `${reached} de ${whatsappContactCount} contato(s) avisado(s)`;
}

/** Resultado de falha total, para quando a escalação lança. */
export function emptyEscalation(contactCount: number): EscalationResult {
  return {
    method: 'none',
    deepLinkSent: 0,
    deepLinkFailed: 0,
    serverApiSent: 0,
    serverApiFailed: 0,
    totalSent: 0,
    totalFailed: contactCount,
  };
}
```

- [ ] **Passo 4: Voz do diálogo de contagem**

Em `components/sos-countdown-dialog.tsx`, adicionar ao bloco de imports `import { SOS_SPOKEN_CONFIRMATION } from '@/lib/sos-status';` e trocar:

```ts
          Speech.speak('Avisando suas pessoas e ligando para o SAMU', { language: 'pt-BR' });
```

por:

```ts
          Speech.speak(SOS_SPOKEN_CONFIRMATION, { language: 'pt-BR' });
```

- [ ] **Passo 5: Tela do SOS**

Em `components/sos-active-screen.tsx`:

1. Depois de `import { useFontSize } from '@/lib/font-size-context';` acrescentar:

```ts
import * as Linking from 'expo-linking';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import type { EscalationResult } from '@/lib/alarm-escalation';
import { SOS_CALL_NUMBER, sosContactStatus, sosSummary } from '@/lib/sos-status';
```

2. Na interface `SOSActiveScreenProps`, depois de `activatedAt: number | null; // Unix ms when SOS was activated` acrescentar:

```ts
  /** Resultado real do envio aos contatos; null enquanto não terminou. */
  escalation: EscalationResult | null;
```

3. Remover da constante `INSTRUCTIONS` o primeiro item (o `{ icon: 'phone' ... title: 'Ligue para o SAMU' ... }`): o botão novo o substitui.

4. Na assinatura do componente, trocar `  activatedAt,\n  onDeactivate,\n}: SOSActiveScreenProps) {` por `  activatedAt,\n  escalation,\n  onDeactivate,\n}: SOSActiveScreenProps) {`.

5. Remover o estado simulado: apagar o comentário e a linha `const [contactStatus, setContactStatus] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({});`, a linha `setContactStatus({});` do ramo `!visible`, e o bloco inteiro "Simulate contact notification status" (de `const initialStatus` até `statusTimers.forEach(clearTimeout);` no `return` do efeito). O efeito termina com `return () => { pulse.stop(); clearInterval(timer); };` e as dependências ficam `[visible, activatedAt]`.

6. Depois de `const insets = useSafeAreaInsets();` acrescentar:

```ts
  const { dialogProps, showDialog } = useAppDialog();
  const whatsappCount = contacts.filter((c) => c.whatsapp).length;
  const summary = sosSummary(whatsappCount, escalation);

  /** Quem liga é o usuário: o app só abre o discador depois da confirmação. */
  const confirmCallSamu = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    showDialog({
      title: 'Ligar para o SAMU?',
      message: `Você será redirecionado para ligar para ${SOS_CALL_NUMBER}.`,
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: `Ligar ${SOS_CALL_NUMBER}`,
          onPress: async () => {
            // Não usar canOpenURL: no Android 11+ retorna false para tel: sem
            // <queries> no manifest (package visibility), mesmo com discador.
            try {
              await Linking.openURL(`tel:${SOS_CALL_NUMBER}`);
            } catch (error) {
              console.warn('[SOS] não foi possível abrir o discador:', error);
              showDialog({
                title: 'Erro',
                message: `Não foi possível abrir o discador. Ligue manualmente para ${SOS_CALL_NUMBER}.`,
                variant: 'error',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };
```

7. No cartão "Contatos notificados": depois do `<Text ...>Contatos notificados</Text>` acrescentar o resumo:

```tsx
              {summary && (
                <Text style={[styles.contactRelation, { color: colors.muted, fontSize: fs.scaled(13) }]}>
                  {summary}
                </Text>
              )}
```

e trocar, no `contacts.map`, a linha `const status = contactStatus[contact.id] ?? 'sending';` por `const status = sosContactStatus(contact, whatsappCount, escalation);`. Dentro de `<View style={styles.contactText}>`, depois do `<Text ...>{contact.relation} · {contact.phone}</Text>`, acrescentar:

```tsx
                        {status === 'no_whatsapp' && (
                          <Text style={[styles.contactRelation, { color: colors.warning, fontSize: fs.scaled(12) }]}>
                            Sem WhatsApp — não será avisado
                          </Text>
                        )}
```

e, em `<View style={styles.statusBadge}>`, trocar os três ícones por:

```tsx
                      {status === 'sending' && (
                        <MaterialIcons name="schedule" size={20} color={colors.warning} />
                      )}
                      {status === 'sent' && (
                        <MaterialIcons name="check-circle" size={20} color={colors.success} />
                      )}
                      {status === 'partial' && (
                        <MaterialIcons name="help-outline" size={20} color={colors.warning} />
                      )}
                      {status === 'failed' && (
                        <MaterialIcons name="error" size={20} color={colors.error} />
                      )}
                      {status === 'no_whatsapp' && (
                        <MaterialIcons name="block" size={20} color={colors.muted} />
                      )}
```

8. Antes do `<Text ...>O QUE FAZER AGORA</Text>` (o `sectionTitle`), inserir o botão:

```tsx
          <Pressable
            onPress={confirmCallSamu}
            accessibilityRole="button"
            accessibilityLabel={`Ligar para o SAMU, número ${SOS_CALL_NUMBER}`}
            style={({ pressed }) => [
              styles.callSamuButton,
              { backgroundColor: colors.emergency, minHeight: fs.touch(64) },
              pressed && { opacity: 0.85 },
            ]}
          >
            <MaterialIcons name="phone" size={28} color={colors.onEmergency} />
            <Text style={[styles.callSamuText, { color: colors.onEmergency, fontSize: fs.scaled(18) }]}>
              Ligar para o SAMU ({SOS_CALL_NUMBER})
            </Text>
          </Pressable>
```

9. Antes de `</Animated.View>` (depois do bloco `{/* -- Deactivate button -- */}` ... `</View>`), acrescentar `        <AppDialog {...dialogProps} />`.

10. No `StyleSheet.create`, acrescentar:

```ts
  callSamuButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 20,
  },
  callSamuText: {
    fontWeight: '800',
  },
```

- [ ] **Passo 6: Ligar no `index.tsx`**

Em `app/(tabs)/index.tsx`:

1. Linha 29: `import { escalateSOSToContacts } from '@/lib/alarm-escalation';` → `import { escalateSOSToContacts, type EscalationResult } from '@/lib/alarm-escalation';` e depois dela acrescentar `import { emptyEscalation } from '@/lib/sos-status';`
2. Depois de `const [sosActivatedAt, setSosActivatedAt] = React.useState<number | null>(null);` acrescentar:

```ts
  const [sosEscalation, setSosEscalation] = React.useState<EscalationResult | null>(null);
```

3. No início de `activateSOS`, depois de `dispatch({ type: 'TRIGGER_SOS' });` acrescentar `    setSosEscalation(null);` e trocar:

```ts
    escalateSOSToContacts(state.emergencyContacts, state.profile.name).catch((err) =>
      console.error('[SOS] Escalation failed:', err)
    );
```

por:

```ts
    escalateSOSToContacts(state.emergencyContacts, state.profile.name)
      .then(setSosEscalation)
      .catch((err) => {
        console.error('[SOS] Escalation failed:', err);
        setSosEscalation(emptyEscalation(state.emergencyContacts.length));
      });
```

4. Nas **duas** instâncias de `<SOSActiveScreen ... activatedAt={sosActivatedAt}` (modo acessível e normal), acrescentar a prop `escalation={sosEscalation}` logo depois de `activatedAt={sosActivatedAt}`.

- [ ] **Passo 7: Ver passar**

```bash
pnpm vitest run tests/sos-status.test.ts tests/ui-modo-acessivel.test.ts tests/ui-cores-token.test.ts tests/ui-font-minimum.test.ts
pnpm test && pnpm check
```

Esperado: verde. (Se `ui-cores-token` apontar cor fixa, usar o token equivalente; as cores `#...` que já existem no arquivo são pré-existentes e não entram.)

- [ ] **Passo 8: Conferir no aparelho** — acionar o SOS (contagem de 3 s): a voz diz "Avisando suas pessoas. Para chamar o SAMU, toque no botão vermelho"; na tela, "Ligar para o SAMU (192)" pede confirmação e abre o discador com 192 (nada liga sozinho); contato sem WhatsApp aparece "Sem WhatsApp — não será avisado"; com o servidor fora do ar o resumo mostra "0 de N contato(s) avisado(s)" e o ícone de erro. Claro, escuro e modo acessível.

- [ ] **Passo 9: Entregar** — arquivos: `lib/sos-status.ts`, `components/sos-countdown-dialog.tsx`, `components/sos-active-screen.tsx`, `app/(tabs)/index.tsx`, `tests/sos-status.test.ts`.

---

# FASE 2 — Ajustes pedidos no teste

## Tarefa 10: Remover a soneca

**Branch:** `beta/10-sem-soneca` · **Mensagem:** `feat(alarme): remove a soneca do alarme`

**Files:**
- Modify: `lib/native-alarm-manager.ts` (três `showSnooze: true`; função `snoozeNativeAlarm` inteira, linhas ~166-197)
- Modify: `app/alarm-ring.tsx`
- Modify: `app/+native-intent.ts`
- Modify: `docs/claude/alarmes.md`
- Modify: `tests/alarmkit-ui.test.ts`, `tests/native-intent-redirect.test.ts`
- Test: `tests/alarm-snooze-removed.test.ts`

Mantém: o sufixo `_snooze` nas expressões regulares de uid (`+native-intent.ts`, `alarm-notification-handler.tsx`, `_layout.tsx`): um alarme de soneca já armado no aparelho na hora da atualização ainda precisa abrir a tela certa.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/alarm-snooze-removed.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('soneca removida (feedback do beta, out/2026)', () => {
  it('nenhum agendamento nativo oferece soneca', () => {
    const manager = read('lib/native-alarm-manager.ts');
    expect(manager).not.toMatch(/showSnooze: true/);
    expect(manager).not.toMatch(/export async function snoozeNativeAlarm/);
  });

  it('a alarm-ring não tem soneca em nenhum modo', () => {
    expect(read('app/alarm-ring.tsx')).not.toMatch(/snooze|soneca/i);
  });

  it('o sufixo _snooze continua reconhecido (alarme de soneca já armado no aparelho)', () => {
    expect(read('app/+native-intent.ts')).toMatch(/_snooze/);
    expect(read('components/alarm-notification-handler.tsx')).toMatch(/_snooze/);
  });
});
```

Em `tests/alarmkit-ui.test.ts`, trocar o teste inteiro `it("não oferece soneca — ela seria uma armadilha no iPhone", ...)` (o que conta `guardas`) por:

```ts
  it("não oferece soneca — nem no iPhone nem no Android", () => {
    // A soneca saiu do app (feedback do beta, out/2026). No iPhone ela já era
    // uma armadilha: snoozeNativeAlarm era no-op fora do Android e a família
    // seria avisada em 5 min sobre quem acabou de responder.
    expect(alarmRing).not.toMatch(/snooze|soneca/i);
  });
```

Em `tests/native-intent-redirect.test.ts`, trocar os dois testes `repassa snooze=1 do botão Soneca da notificação` e `não inventa snooze quando o parâmetro não veio` por:

```ts
  it('ignora snooze=1 de uma notificação antiga (a soneca saiu do app)', () => {
    expect(
      redirectSystemPath({ path: 'vigora://alarm-ring?uid=vigora_abc123&snooze=1', initial: true })
    ).toBe('/alarm-ring?alarmId=abc123');
  });
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/alarm-snooze-removed.test.ts tests/alarmkit-ui.test.ts tests/native-intent-redirect.test.ts
```

Esperado: FAIL.

- [ ] **Passo 3: `lib/native-alarm-manager.ts`**

1. Trocar `showSnooze: true,` por `showSnooze: false,` nos três agendamentos de `scheduleNativeAlarm` (linhas ~102, ~127, ~148). Manter `snoozeInterval: 0,` e `snoozeText: 'Soneca',` (testes de som/vibração contam essas linhas como proxy de "um agendamento").
2. Apagar a função `snoozeNativeAlarm` e o comentário dela: do `/**` que começa com `Re-agenda um disparo ÚNICO (soneca) em \`fireAt\`` até o `}` que fecha `snoozeNativeAlarm` (linhas ~166-197). Conferir antes de apagar:

```bash
sed -n '166p;173p;197p' lib/native-alarm-manager.ts
```

Esperado: `/**`, `export async function snoozeNativeAlarm(alarm: Alarm, fireAt: Date): Promise<void> {` e `}`.

- [ ] **Passo 4: `app/alarm-ring.tsx`**

Remover, nesta ordem (os números são do arquivo atual; confira pela âncora):

1. No import de `@/lib/native-alarm-manager` (linhas ~44-49): apagar a linha `  snoozeNativeAlarm,`.
2. Linha ~57: `import { confirmAlarmResponded, confirmAlarmMissed, createPendingAlarmEvent } from '@/lib/monitoring-service';` → `import { confirmAlarmResponded, confirmAlarmMissed } from '@/lib/monitoring-service';`
3. Linha ~61: apagar `const SNOOZE_MINUTES = 5;`.
4. Linha ~103: trocar a desestruturação por:

```ts
  const { alarmId, expiresAt: expiresAtParam, dismiss: dismissParam, fromAlarmKit } = useLocalSearchParams<{ alarmId: string; expiresAt?: string; dismiss?: string; fromAlarmKit?: string }>();
```

5. Apagar o bloco de `// Soneca: conta como respondido AGORA ...` até o fim do efeito `}, [snoozeParam, alarm, handleSnooze]);` (linhas ~504-546: `handleSnooze`, `autoSnoozedRef` e o `useEffect` do `&snooze=1`). Âncoras: primeira linha `  // Soneca: conta como respondido AGORA (idoso interagiu = vivo), mas re-arma um`; última `  }, [snoozeParam, alarm, handleSnooze]);`.
6. No comentário do `handleDismiss` (linhas ~499-501) apagar a frase `handleSnooze já dependia de \`alarm\` — por isso só o dismiss falhava.` (a referência deixa de existir) — trocar por `A soneca que também dependia de \`alarm\` foi removida.`? **Não**: apagar a frase inteira, sem substituir.
7. No modo acessível: trocar o comentário e o botão da soneca. Do comentário `{/* Snooze + Dismiss buttons — a soneca some no caminho do AlarmKit: ... */}` até o `)}` que fecha o `{!isExpired && !vindoDoAlarmKit && ( <Pressable ... Soneca ... </Pressable> )}` (linhas ~707-727) deixar apenas:

```tsx
        {/* Dispensar */}
        <View style={[styles.bottomSection, { gap: 14 }]}>
```

(o `<Pressable ... styles.dismissButton ...>` que vem depois permanece intacto).
8. No modo normal: trocar o comentário `{/* Snooze + Dismiss buttons — ver a nota do modo acessível: sem soneca no caminho do AlarmKit. */}` e o bloco `{!isExpired && !vindoDoAlarmKit && ( <Pressable ... Soneca ... </Pressable> )}` (linhas ~848-860) por:

```tsx
      {/* Dispensar */}
      <View style={[styles.bottomSection, { gap: 12 }]}>
```

9. Em `StyleSheet.create`, apagar os estilos `snoozeButton` e `snoozeText` (últimos do arquivo, linhas ~1028-1045).
10. Conferir que não sobrou nada:

```bash
grep -n -i "snooze\|soneca" app/alarm-ring.tsx
```

Esperado: nenhuma linha.

- [ ] **Passo 5: `app/+native-intent.ts`**

Trocar o comentário:

```ts
    // Os botões "Soneca" e "Dispensar" usam o mesmo deep link com &snooze=1 /
    // &dismiss=1 — repassados para a tela executar a ação e confirmá-la no
    // servidor (as actions nativas resolviam só em Java, sem confirmar nada).
```

por:

```ts
    // O botão "Dispensar" usa o mesmo deep link com &dismiss=1 — repassado para
    // a tela executar a ação e confirmá-la no servidor (a action nativa
    // resolvia só em Java, sem confirmar nada). A soneca saiu do app (out/2026):
    // um &snooze=1 de notificação antiga é ignorado.
```

apagar a linha `const snooze = /(?:^|&)snooze=1(?:&|$)/.test(query) ? '&snooze=1' : '';` e trocar o `return` por:

```ts
        return `/alarm-ring?alarmId=${encodeURIComponent(alarmId)}${dismiss}`;
```

- [ ] **Passo 6: `docs/claude/alarmes.md`**

Trocar a linha `## Botões da notificação = deep link, nunca as actions nativas` por:

```markdown
## Botões da notificação = deep link, nunca as actions nativas

> A **soneca foi removida** em out/2026 (pedido do beta): só sobra "Dispensar".
> O texto abaixo guarda o motivo histórico; ignore as menções a `&snooze=1`.
```

- [ ] **Passo 7: Ver passar**

```bash
pnpm vitest run tests/alarm-snooze-removed.test.ts tests/alarmkit-ui.test.ts tests/native-intent-redirect.test.ts tests/android-alarm-sound-flag.test.ts tests/android-alarm-vibration-native.test.ts tests/android-alarm-dismiss-confirms.test.ts
pnpm test && pnpm check
```

Esperado: verde.

- [ ] **Passo 8: Conferir no aparelho** — alarme tocando: a tela cheia só tem "Desligar Alarme" (e "Ouvir em Voz Alta"); a notificação só tem "Dispensar". Modos normal e acessível.

- [ ] **Passo 9: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 11: Remover "Idioma" e os interruptores sem efeito do cuidador

**Branch:** `beta/11-sem-idioma-sem-interruptores` · **Mensagem:** `feat(config): remove a opção Idioma e os interruptores de notificação do cuidador que não faziam nada`

**Files:**
- Modify: `app/(tabs)/settings.tsx` (seção Idioma, linhas ~1530-1561; estilos `languageOption`/`languageLabel`/`flagEmoji` se ficarem sem uso)
- Modify: `lib/app-context.tsx` (linhas 65 e 157)
- Modify: `lib/caregiver-state.ts`, `lib/caregiver-context.tsx`, `app/(caregiver-tabs)/settings.tsx`
- Modify: `tests/caregiver-state.test.ts`
- Test: `tests/config-removidas.test.ts`

Por quê: "Idioma" só gravava uma preferência (não há i18n); os três interruptores do cuidador ("Medicação perdida", "SOS acionado", "Dead man's switch") só gravavam no celular e nunca mudaram nenhum push — e, se passassem a funcionar, o cuidador poderia silenciar o SOS do idoso.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/config-removidas.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Idioma removido (não havia tradução por trás)', () => {
  it('a tela de configurações não oferece idioma', () => {
    expect(read('app/(tabs)/settings.tsx')).not.toMatch(/title="Idioma"/);
  });
  it('o estado não guarda mais a preferência', () => {
    const ctx = read('lib/app-context.tsx');
    expect(ctx).not.toMatch(/language: 'pt' \| 'en'/);
    expect(ctx).not.toMatch(/language: 'pt',/);
  });
});

describe('Interruptores de notificação do cuidador removidos', () => {
  it('a tela do cuidador não tem os três interruptores', () => {
    const src = read('app/(caregiver-tabs)/settings.tsx');
    expect(src).not.toMatch(/Medicação perdida|SOS acionado|Dead man's switch/);
    expect(src).not.toMatch(/updateNotificationPrefs/);
  });
  it('o estado do cuidador não guarda mais preferências', () => {
    expect(read('lib/caregiver-state.ts')).not.toMatch(/notificationPrefs|UPDATE_PREFS/);
    expect(read('lib/caregiver-context.tsx')).not.toMatch(/notificationPrefs|updateNotificationPrefs/);
  });
});
```

Em `tests/caregiver-state.test.ts`, apagar os dois testes `UPDATE_PREFS merges partial preferences` e `DEFAULT_CAREGIVER_STATE has all notification prefs on` e acrescentar no lugar:

```ts
  it('DEFAULT_CAREGIVER_STATE começa sem vínculo', () => {
    expect(DEFAULT_CAREGIVER_STATE).toEqual({ linkedMonitored: null });
  });
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/config-removidas.test.ts tests/caregiver-state.test.ts
```

Esperado: FAIL.

- [ ] **Passo 3: Idioma**

1. `app/(tabs)/settings.tsx`: apagar o bloco `{/* ═══ SECTION 4: Idioma ═══ */}` até o `</CollapsibleSection>` dele (linhas ~1530-1561).
2. Verificar estilos órfãos e apagar os que só o bloco usava:

```bash
grep -n "flagEmoji\|languageOption\|languageLabel" "app/(tabs)/settings.tsx"
```

Se, depois do passo 1, `languageOption`, `languageLabel` e `flagEmoji` aparecerem só na definição de `StyleSheet.create`, apagar as três entradas.
3. `lib/app-context.tsx`: apagar `  language: 'pt' | 'en';` (linha 65) e `    language: 'pt',` (linha 157).

- [ ] **Passo 4: Preferências do cuidador**

`lib/caregiver-state.ts`: apagar `export interface CaregiverNotificationPrefs {...}`; em `CaregiverState` apagar `notificationPrefs: CaregiverNotificationPrefs;`; em `DEFAULT_CAREGIVER_STATE` apagar o objeto `notificationPrefs`; do tipo `CaregiverAction` apagar `| { type: 'UPDATE_PREFS'; payload: Partial<CaregiverNotificationPrefs> }`; do `caregiverReducer` apagar o `case 'UPDATE_PREFS': {...}`. Resultado:

```ts
export interface CaregiverState {
  linkedMonitored: LinkedMonitored | null;
}

export const DEFAULT_CAREGIVER_STATE: CaregiverState = {
  linkedMonitored: null,
};
```

`lib/caregiver-context.tsx`:
- no comentário do topo, apagar ` notificationPrefs remain\n * local-only.` (a frase termina em `local-only.`);
- apagar `  type CaregiverNotificationPrefs,` do import;
- apagar `  updateNotificationPrefs: (partial: Partial<CaregiverNotificationPrefs>) => void;` da interface;
- na hidratação, trocar

```ts
          next = {
            linkedMonitored: parsed.linkedMonitored ?? null,
            notificationPrefs: {
              ...DEFAULT_CAREGIVER_STATE.notificationPrefs,
              ...(parsed.notificationPrefs ?? {}),
            },
          };
```

por

```ts
          next = { linkedMonitored: parsed.linkedMonitored ?? null };
```

- apagar o `useCallback` `updateNotificationPrefs` e tirar `updateNotificationPrefs,` do `value` do provider.

`app/(caregiver-tabs)/settings.tsx`:
- linha 41: `const { state, clearLinkedMonitored, updateNotificationPrefs } = useCaregiverContext();` → `const { state, clearLinkedMonitored } = useCaregiverContext();`
- apagar os três `<ToggleRow ... />` da seção "Notificações" e trocar a nota "As notificações começarão a chegar quando a sincronização estiver ativa." por:

```tsx
          <Text style={[styles.note, { color: c.muted, fontSize: sz.note, fontFamily: BrandFonts.body }]}>
            Os avisos de alarme perdido, SOS e mudanças de lembrete só chegam se o celular tiver liberado as notificações ao Vigora.
          </Text>
```

(o `ToggleRow` continua sendo usado em outras seções do arquivo — não apagar o componente; o comentário sobre permissões e o botão "Permissões do celular" ficam.)

- [ ] **Passo 5: Ver passar**

```bash
pnpm vitest run tests/config-removidas.test.ts tests/caregiver-state.test.ts
pnpm test && pnpm check
```

Esperado: verde (o `tsc` acusa qualquer uso esquecido de `language` ou `notificationPrefs`).

- [ ] **Passo 6: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 12: Telefone de emergência do plano de saúde

**Branch:** `beta/12-telefone-plano` · **Mensagem:** `feat(ambulancia): telefone de emergência do plano de saúde em vez do número da carteirinha`

**Files:**
- Create: `lib/health-plan-phone.ts`
- Modify: `lib/app-context.tsx` (interface `AnamnesesData`, linha ~51)
- Modify: `app/(tabs)/anamnesis.tsx` (import linha 15; `EMPTY_FORM`; estado `wizardStep`; campo no passo 3; campo no modo acessível)
- Modify: `app/(tabs)/ambulance.tsx`
- Test: `tests/health-plan-phone.test.ts`

**Interfaces:**
- Produces: `PLAN_PHONE_MIN = 8`, `PLAN_PHONE_MAX = 13`, `sanitizePlanPhone(input: string): string`, `isValidPlanPhone(digits: string | undefined | null): boolean` em `@/lib/health-plan-phone`; campo opcional `healthPlanPhone?: string` em `AnamnesesData`.

Hoje a tela Ambulância disca o "Número do plano" da Anamnese — que é o número da **carteirinha**.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/health-plan-phone.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidPlanPhone, sanitizePlanPhone } from '../lib/health-plan-phone';

describe('sanitizePlanPhone', () => {
  it('mantém só dígitos e corta em 13', () => {
    expect(sanitizePlanPhone('0800 123-4567')).toBe('08001234567');
    expect(sanitizePlanPhone('+55 (11) 91234-5678 99')).toBe('5511912345678');
  });
});

describe('isValidPlanPhone', () => {
  it('aceita de 8 a 13 dígitos', () => {
    expect(isValidPlanPhone('40041234')).toBe(true);
    expect(isValidPlanPhone('08001234567')).toBe(true);
    expect(isValidPlanPhone('5511912345678')).toBe(true);
  });
  it('recusa curto, longo, vazio e não numérico', () => {
    expect(isValidPlanPhone('1234567')).toBe(false);
    expect(isValidPlanPhone('12345678901234')).toBe(false);
    expect(isValidPlanPhone('')).toBe(false);
    expect(isValidPlanPhone(undefined)).toBe(false);
    expect(isValidPlanPhone('0800-123')).toBe(false);
  });
});

describe('tela Ambulância', () => {
  const src = readFileSync(join(__dirname, '..', 'app', '(tabs)', 'ambulance.tsx'), 'utf8');
  it('disca o telefone do plano, nunca o número da carteirinha', () => {
    expect(src).toMatch(/healthPlanPhone/);
    expect(src).not.toMatch(/phone: anamnesis\?\.healthPlanNumber/);
    expect(src).not.toMatch(/phone: anamnesis\?\.healthPlanNumber \|\| ''/);
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/health-plan-phone.test.ts
```

Esperado: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar o módulo e o tipo**

Criar `lib/health-plan-phone.ts`:

```ts
/**
 * health-plan-phone.ts
 *
 * Telefone de emergência do plano de saúde (o que a tela Ambulância disca).
 * Era o "Número do plano" — o número da CARTEIRINHA — o que o app tentava
 * discar. Só dígitos, de 8 (4004-xxxx) a 13 (+55 DDD 9xxxx-xxxx).
 */
export const PLAN_PHONE_MIN = 8;
export const PLAN_PHONE_MAX = 13;

export function sanitizePlanPhone(input: string): string {
  return input.replace(/\D/g, '').slice(0, PLAN_PHONE_MAX);
}

export function isValidPlanPhone(digits: string | undefined | null): boolean {
  return (
    !!digits &&
    /^\d+$/.test(digits) &&
    digits.length >= PLAN_PHONE_MIN &&
    digits.length <= PLAN_PHONE_MAX
  );
}
```

Em `lib/app-context.tsx`, na interface `AnamnesesData`, depois de `healthPlanProvider: string;` acrescentar:

```ts
  /** Telefone de emergência do plano (só dígitos). Opcional: fichas antigas não têm. */
  healthPlanPhone?: string;
```

- [ ] **Passo 4: Formulário da anamnese**

Em `app/(tabs)/anamnesis.tsx`:

1. Linha 15: `import { useRouter } from 'expo-router';` → `import { useLocalSearchParams, useRouter } from 'expo-router';` e, entre os imports de `@/lib`, acrescentar `import { sanitizePlanPhone } from '@/lib/health-plan-phone';`
2. `EMPTY_FORM`: depois de `healthPlanProvider: '',` acrescentar `  healthPlanPhone: '',`.
3. Abrir direto no passo do plano quando vier `?step=plan` (a tela Ambulância usa isso): trocar `const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);` por:

```ts
  const { step: stepParam } = useLocalSearchParams<{ step?: string }>();
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(stepParam === 'plan' ? 3 : 1);
```

4. No passo 3 (modo normal), depois do `formGroup` do "Número do plano" (termina com `accessibilityLabel="Número da carteirinha do plano"` ... `</View>`) e antes de `{/* Exportar PDF — liberado para todos */}`, acrescentar:

```tsx
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>
                  Telefone de emergência do plano
                </Text>
                <TextInput
                  value={form.healthPlanPhone ?? ''}
                  onChangeText={(v) => updateField('healthPlanPhone', sanitizePlanPhone(v))}
                  placeholder="Ex: 0800 123 4567"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base, minHeight: fs.touch(48) }]}
                  returnKeyType="done"
                  maxLength={13}
                  accessibilityLabel="Telefone de emergência do plano de saúde"
                />
                <Text style={{ color: colors.muted, fontSize: fs.sm }}>
                  É o número que o app disca na tela Ambulância (não é o da carteirinha).
                </Text>
              </View>
```

5. Modo acessível: em `a11yFields`, depois do item `Doenças crônicas`, acrescentar:

```ts
      { label: 'Telefone de emergência do plano', key: 'healthPlanPhone', placeholder: 'Ex: 0800 123 4567', keyboard: 'phone-pad', format: sanitizePlanPhone },
```

- [ ] **Passo 5: Tela Ambulância**

Em `app/(tabs)/ambulance.tsx`:

1. Adicionar `import { isValidPlanPhone } from '@/lib/health-plan-phone';`.
2. Trocar

```ts
  const isHealthPlanConfigured = !!(anamnesis?.healthPlanProvider && anamnesis?.healthPlanNumber);
```

por

```ts
  const planPhone = anamnesis?.healthPlanPhone ?? '';
  const isHealthPlanConfigured = isValidPlanPhone(planPhone);
```

3. Na opção `plan`:

```ts
      description: anamnesis?.healthPlanProvider
        ? `${anamnesis.healthPlanProvider} - ${anamnesis.healthPlanNumber || 'Número não informado'}`
        : 'Cadastre seu plano na ficha de anamnese',
      phone: anamnesis?.healthPlanNumber || '',
```

→

```ts
      description: isHealthPlanConfigured
        ? `${anamnesis?.healthPlanProvider ? `${anamnesis.healthPlanProvider} - ` : ''}${planPhone}`
        : 'Cadastre o telefone de emergência do seu plano',
      phone: planPhone,
```

4. Diálogo "Plano de Saúde não configurado": mensagem `Você ainda não cadastrou o telefone de emergência do seu plano de saúde. Deseja cadastrar agora?` e o botão:

```tsx
          {
            text: 'Configurar Agora',
            // Sem ficha, começa do passo 1 (nome e nascimento são obrigatórios);
            // com ficha, abre direto o passo do plano.
            onPress: () => router.push((anamnesis ? '/(tabs)/anamnesis?step=plan' : '/(tabs)/anamnesis') as never),
          },
```

5. Modo acessível: trocar `const a11yOptions = [ ... ];` por (a opção do plano só aparece com telefone válido):

```tsx
    const a11yOptions = [
      { label: 'SAMU (SUS)', phone: '192', icon: 'local-hospital' as const, color: ac.emergency, borderColor: ac.emergency },
      ...(isHealthPlanConfigured
        ? [{ label: 'Plano de Saúde', phone: planPhone, icon: 'medical-services' as const, color: ac.primary, borderColor: ac.primary }]
        : []),
      { label: 'Bombeiros', phone: '193', icon: 'warning' as const, color: colors.accent, borderColor: colors.accent },
    ];
```

- [ ] **Passo 6: Ver passar**

```bash
pnpm vitest run tests/health-plan-phone.test.ts tests/ui-modo-acessivel.test.ts
pnpm test && pnpm check
```

- [ ] **Passo 7: Conferir no aparelho** — sem telefone: "Plano de Saúde" mostra o diálogo e abre direto o passo do plano; com telefone: confirma e abre o discador. No modo acessível a opção só aparece com telefone cadastrado (campo novo no formulário acessível).

- [ ] **Passo 8: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 13: Enviar o código de convite pelo WhatsApp

**Branch:** `beta/13-convite-whatsapp` · **Mensagem:** `feat(convite): botão para enviar o código do cuidador pelo compartilhamento do celular`

**Files:**
- Create: `lib/invite-share.ts`
- Modify: `app/(tabs)/invite-caregiver.tsx` (import linha 15; função `formatCode` linhas 27-30; botão no cartão do código)
- Test: `tests/invite-share.test.ts`

**Interfaces:**
- Produces: `formatInviteCode(code: string): string` e `buildInviteShareText(code: string, secondsLeft: number): string` em `@/lib/invite-share`.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/invite-share.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildInviteShareText, formatInviteCode } from '../lib/invite-share';

describe('formatInviteCode', () => {
  it('põe o hífen no meio de 6 caracteres', () => {
    expect(formatInviteCode('ABCDEF')).toBe('ABC-DEF');
  });
  it('deixa qualquer outro tamanho como veio', () => {
    expect(formatInviteCode('ABC')).toBe('ABC');
  });
});

describe('buildInviteShareText', () => {
  it('leva o código formatado e o tempo que ainda resta', () => {
    expect(buildInviteShareText('ABCDEF', 600)).toBe(
      'Meu código do Vigora é ABC-DEF. Ele vale por mais 10 minutos. Abra o app Vigora, entre como cuidador e digite o código.'
    );
  });
  it('arredonda para cima e usa o singular', () => {
    expect(buildInviteShareText('ABCDEF', 61)).toContain('por mais 2 minutos');
    expect(buildInviteShareText('ABCDEF', 30)).toContain('por mais 1 minuto.');
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/invite-share.test.ts
```

- [ ] **Passo 3: Implementar**

Criar `lib/invite-share.ts`:

```ts
/**
 * invite-share.ts
 *
 * Texto do convite de cuidador para o compartilhamento do celular (WhatsApp,
 * SMS, e-mail). O código vale 10 minutos desde que foi gerado: o texto diz
 * quanto AINDA resta, não um prazo fixo que já pode ter passado.
 */

/** "ABCDEF" -> "ABC-DEF". */
export function formatInviteCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export function buildInviteShareText(code: string, secondsLeft: number): string {
  const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
  const unit = minutes === 1 ? 'minuto' : 'minutos';
  return (
    `Meu código do Vigora é ${formatInviteCode(code)}. ` +
    `Ele vale por mais ${minutes} ${unit}. ` +
    'Abra o app Vigora, entre como cuidador e digite o código.'
  );
}
```

Em `app/(tabs)/invite-caregiver.tsx`:

1. Linha 15: acrescentar `Share` ao import de `react-native`: `import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';`
2. Acrescentar `import { buildInviteShareText, formatInviteCode } from '@/lib/invite-share';`
3. Apagar a função local `formatCode` (linhas 27-30, com o comentário) e trocar os dois usos `formatCode(code)` por `formatInviteCode(code)`.
4. Depois de `const generate = useCallback(...)`, acrescentar:

```tsx
  const shareCode = useCallback(async () => {
    if (!code) return;
    try {
      await Share.share({ message: buildInviteShareText(code, secondsLeft) });
    } catch (error) {
      console.warn('[Convite] não foi possível abrir o compartilhamento:', error);
      showToast({ message: 'Não foi possível abrir o compartilhamento neste aparelho.', variant: 'error' });
    }
  }, [code, secondsLeft, showToast]);
```

5. No cartão do código, dentro do ramo não expirado, depois do `<Text style={[styles.countdown ...]}>Expira em ...</Text>` (e dentro do mesmo fragmento `<>...</>`), acrescentar:

```tsx
                  <Pressable
                    onPress={shareCode}
                    accessibilityRole="button"
                    accessibilityLabel="Enviar o código de convite pelo WhatsApp ou outro aplicativo"
                    style={({ pressed }) => [
                      styles.primaryBtn,
                      { backgroundColor: colors.primarySurface, minHeight: minTouch, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <MaterialIcons name="share" size={isAccessibilityMode ? 28 : 20} color={colors.onPrimary} />
                    <Text style={[styles.primaryBtnText, { color: colors.onPrimary, fontSize: sz(16) }]}>Enviar código</Text>
                  </Pressable>
```

(`styles.primaryBtn` já centraliza o conteúdo; se o ícone ficar sem espaçamento, acrescentar `flexDirection: 'row', gap: 8` ao estilo `primaryBtn`.)

- [ ] **Passo 4: Ver passar**

```bash
pnpm vitest run tests/invite-share.test.ts
pnpm test && pnpm check
```

- [ ] **Passo 5: Conferir no aparelho** — gerar código → "Enviar código" abre a folha de compartilhar com o texto; escolher WhatsApp. Modos normal/acessível, claro/escuro.

- [ ] **Passo 6: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 14: "Baixar" e "Compartilhar" nas exportações

**Branch:** `beta/14-baixar-compartilhar` · **Mensagem:** `feat(exportacao): botões Baixar e Compartilhar para dados, relatório de saúde e ficha`

**Files:**
- Create: `lib/_core/save-or-share-file.ts`
- Create: `components/export-file-buttons.tsx`
- Create: `lib/health-report-file.ts`
- Create: `components/health-report-export.tsx`
- Modify: `components/data-export-button.tsx` (reescrita — fica menor)
- Modify: `components/health-report-button.tsx` (passos 1-2 do `handleGenerateReport`)
- Modify: `lib/pdf-utils-v2.ts` (`exportAnamnesisToPDF` vira `createAnamnesisPdf`)
- Modify: `app/(tabs)/anamnesis.tsx` (botão "Exportar PDF" dos dois modos; `handleExport`)
- Modify: `app/(tabs)/settings.tsx` (seção "Dados e Armazenamento": linhas ~750 e ~1593)
- Test: `tests/save-or-share-file.test.ts`, `tests/export-buttons-wiring.test.ts`

**Interfaces:**
- Produces (em `@/lib/_core/save-or-share-file`):
  - `interface PreparedFile { uri: string; fileName: string; mimeType: string; uti: string; dialogTitle: string }`
  - `type SaveResult = { status: 'saved'; folderName: string; fileName: string } | { status: 'cancelled' } | { status: 'failed'; reason: string }`
  - `type ShareResult = { status: 'shared' } | { status: 'unavailable' } | { status: 'failed'; reason: string }`
  - `isPickerCancel(error: unknown): boolean`, `folderLabel(uri: string): string`
  - `saveFileToFolder(file: PreparedFile): Promise<SaveResult>`, `shareFile(file: PreparedFile): Promise<ShareResult>`
- Produces: `ExportFileButtons` (props `{ label: string; prepare: () => Promise<PreparedFile & { warning?: string }> }`); `createHealthReportPdf(data): Promise<{ uri: string; html: string }>`; `createAnamnesisPdf(anamnesis): Promise<string>`.

Risco conhecido (Review Focus 4): o Android 11+ **não deixa escolher a raiz da pasta Downloads** pelo seletor de pastas; o usuário escolhe "Documentos" ou uma subpasta. Por isso o texto do botão explica "escolha uma pasta" e o "Compartilhar" continua sendo o caminho que sempre funciona. A mensagem real do cancelamento do seletor não está documentada: `isPickerCancel` casa `cancel`/`dismiss` no texto do erro e o Passo 8 registra o texto real em Samsung e Motorola.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/save-or-share-file.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const write = vi.fn();
const createFile = vi.fn(() => ({ write }));
const pickDirectoryAsync = vi.fn();
const bytes = vi.fn(async () => new Uint8Array([1, 2, 3]));

vi.mock('expo-file-system', () => ({
  Directory: { pickDirectoryAsync: (...a: unknown[]) => pickDirectoryAsync(...a) },
  // `function` (não arrow): o código faz `new File(uri)` e arrow não é construtor.
  File: vi.fn(function () {
    return { bytes };
  }),
}));

const isAvailableAsync = vi.fn();
const shareAsync = vi.fn();
vi.mock('expo-sharing', () => ({
  isAvailableAsync: () => isAvailableAsync(),
  shareAsync: (...a: unknown[]) => shareAsync(...a),
}));

import {
  folderLabel,
  isPickerCancel,
  saveFileToFolder,
  shareFile,
  type PreparedFile,
} from '../lib/_core/save-or-share-file';

const file: PreparedFile = {
  uri: 'file:///cache/vigora-meus-dados-2026-10-02.json',
  fileName: 'vigora-meus-dados-2026-10-02.json',
  mimeType: 'application/json',
  uti: 'public.json',
  dialogTitle: 'Meus dados',
};

beforeEach(() => {
  vi.clearAllMocks();
  createFile.mockImplementation(() => ({ write }));
});

describe('isPickerCancel', () => {
  it('reconhece o cancelamento pelo texto do erro', () => {
    expect(isPickerCancel(new Error('User cancelled the operation'))).toBe(true);
    expect(isPickerCancel(new Error('Picker was canceled'))).toBe(true);
    expect(isPickerCancel(new Error('document picker dismissed'))).toBe(true);
  });
  it('não confunde falha real com cancelamento', () => {
    expect(isPickerCancel(new Error('EACCES: permission denied'))).toBe(false);
    expect(isPickerCancel('qualquer coisa')).toBe(false);
  });
});

describe('folderLabel', () => {
  it('pega o último trecho legível de uma URI de pasta do Android', () => {
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3ADocuments')).toBe('Documents');
  });
  it('pega o nome de uma pasta file://', () => {
    expect(folderLabel('file:///storage/emulated/0/Download/')).toBe('Download');
  });
});

describe('saveFileToFolder', () => {
  it('grava o arquivo na pasta escolhida', async () => {
    pickDirectoryAsync.mockResolvedValue({
      uri: 'content://x/tree/primary%3ADocuments',
      createFile,
    });

    const result = await saveFileToFolder(file);

    expect(createFile).toHaveBeenCalledWith(file.fileName, file.mimeType);
    expect(write).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(result).toEqual({ status: 'saved', folderName: 'Documents', fileName: file.fileName });
  });

  it('cancelar o seletor não é erro', async () => {
    pickDirectoryAsync.mockRejectedValue(new Error('User cancelled'));
    expect(await saveFileToFolder(file)).toEqual({ status: 'cancelled' });
    expect(createFile).not.toHaveBeenCalled();
  });

  it('seletor que não devolve pasta também conta como cancelado', async () => {
    pickDirectoryAsync.mockResolvedValue(undefined);
    expect(await saveFileToFolder(file)).toEqual({ status: 'cancelled' });
  });

  it('falha ao escolher a pasta mostra o motivo real', async () => {
    pickDirectoryAsync.mockRejectedValue(new Error('Nenhum app de arquivos'));
    expect(await saveFileToFolder(file)).toEqual({ status: 'failed', reason: 'Nenhum app de arquivos' });
  });

  it('falha ao gravar (sem permissão na pasta) mostra o motivo real', async () => {
    pickDirectoryAsync.mockResolvedValue({ uri: 'content://x/tree/primary%3ADownload', createFile });
    createFile.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    expect(await saveFileToFolder(file)).toEqual({ status: 'failed', reason: 'Permission denied' });
  });
});

describe('shareFile', () => {
  it('abre a folha de compartilhar', async () => {
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockResolvedValue(undefined);
    expect(await shareFile(file)).toEqual({ status: 'shared' });
    expect(shareAsync).toHaveBeenCalledWith(file.uri, {
      mimeType: file.mimeType,
      dialogTitle: file.dialogTitle,
      UTI: file.uti,
    });
  });
  it('sem compartilhamento no aparelho', async () => {
    isAvailableAsync.mockResolvedValue(false);
    expect(await shareFile(file)).toEqual({ status: 'unavailable' });
    expect(shareAsync).not.toHaveBeenCalled();
  });
  it('falha ao compartilhar mostra o motivo real', async () => {
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockRejectedValue(new Error('Activity not found'));
    expect(await shareFile(file)).toEqual({ status: 'failed', reason: 'Activity not found' });
  });
});
```

Criar `tests/export-buttons-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('as três exportações têm Baixar e Compartilhar', () => {
  it('dados em JSON', () => {
    expect(read('components/data-export-button.tsx')).toMatch(/<ExportFileButtons/);
  });
  it('relatório de saúde na seção Dados e Armazenamento (nos dois modos)', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect((settings.match(/<HealthReportExport \/>/g) ?? []).length).toBe(2);
    expect(read('components/health-report-export.tsx')).toMatch(/<ExportFileButtons/);
  });
  it('ficha de anamnese', () => {
    const anamnesis = read('app/(tabs)/anamnesis.tsx');
    expect((anamnesis.match(/<ExportFileButtons/g) ?? []).length).toBe(2);
    expect(anamnesis).not.toMatch(/exportAnamnesisToPDF/);
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/save-or-share-file.test.ts tests/export-buttons-wiring.test.ts
```

Esperado: FAIL.

- [ ] **Passo 3: Helpers de salvar e compartilhar**

Criar `lib/_core/save-or-share-file.ts`:

```ts
/**
 * save-or-share-file.ts
 *
 * Entrega de um arquivo ao usuário, de duas formas:
 *   - Baixar: abre o seletor de pastas do sistema e grava o arquivo nela.
 *   - Compartilhar: a folha de compartilhar do sistema (WhatsApp, e-mail, Drive).
 *
 * Capacidade do aparelho pode não existir (sem app de arquivos, sem
 * compartilhamento): nada é engolido — o motivo real volta no resultado.
 *
 * ⚠️ O Android 11+ não deixa escolher a RAIZ da pasta Downloads pelo seletor;
 * o usuário escolhe "Documentos" ou uma subpasta. Por isso "Compartilhar" é
 * sempre o caminho garantido.
 */
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface PreparedFile {
  /** file:// do arquivo já gerado (cache do app). */
  uri: string;
  fileName: string;
  mimeType: string;
  /** Uniform Type Identifier (iOS): 'public.json', 'com.adobe.pdf'. */
  uti: string;
  dialogTitle: string;
}

export type SaveResult =
  | { status: 'saved'; folderName: string; fileName: string }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

export type ShareResult =
  | { status: 'shared' }
  | { status: 'unavailable' }
  | { status: 'failed'; reason: string };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * O seletor de pastas rejeita a promessa quando o usuário cancela, e a mensagem
 * não é documentada. Casa "cancel"/"dismiss" no texto (Passo de validação em
 * aparelho registra o texto real em Samsung e Motorola).
 */
export function isPickerCancel(error: unknown): boolean {
  return error instanceof Error && /cancel|dismiss/i.test(error.message);
}

/** Último trecho legível de uma URI de pasta ("…/tree/primary%3ADocuments" -> "Documents"). */
export function folderLabel(uri: string): string {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch {
    // URI com % solto: usa como veio.
  }
  return decoded.split(/[/:]/).filter(Boolean).pop() ?? 'a pasta escolhida';
}

export async function saveFileToFolder(file: PreparedFile): Promise<SaveResult> {
  let directory: Directory | undefined;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isPickerCancel(error)) return { status: 'cancelled' };
    console.warn('[Exportar] seletor de pastas falhou:', error);
    return { status: 'failed', reason: reasonOf(error) };
  }
  if (!directory) return { status: 'cancelled' };

  try {
    const bytes = await new File(file.uri).bytes();
    directory.createFile(file.fileName, file.mimeType).write(bytes);
    return { status: 'saved', folderName: folderLabel(directory.uri), fileName: file.fileName };
  } catch (error) {
    console.warn('[Exportar] não foi possível gravar na pasta escolhida:', error);
    return { status: 'failed', reason: reasonOf(error) };
  }
}

export async function shareFile(file: PreparedFile): Promise<ShareResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { status: 'unavailable' };
    await Sharing.shareAsync(file.uri, {
      mimeType: file.mimeType,
      dialogTitle: file.dialogTitle,
      UTI: file.uti,
    });
    return { status: 'shared' };
  } catch (error) {
    console.warn('[Exportar] compartilhamento falhou:', error);
    return { status: 'failed', reason: reasonOf(error) };
  }
}
```

- [ ] **Passo 4: Componente dos dois botões**

Criar `components/export-file-buttons.tsx`:

```tsx
/**
 * ExportFileButtons
 *
 * Dois botões para entregar um arquivo: "Baixar" (escolhe uma pasta e salva) e
 * "Compartilhar" (WhatsApp, e-mail, Drive...). O arquivo só é gerado quando o
 * usuário toca. Erros nunca são engolidos: o motivo real aparece num diálogo.
 *
 * O aviso (AppToast) fica num Modal: estes botões vivem dentro do ScrollView de
 * Configurações, e o `position: absolute` do toast ficaria relativo ao conteúdo
 * que rola (ver data-export-button, que originou o padrão).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { useFontSize } from '@/lib/font-size-context';
import {
  saveFileToFolder,
  shareFile,
  type PreparedFile,
} from '@/lib/_core/save-or-share-file';

type Prepared = PreparedFile & { warning?: string };

interface ExportFileButtonsProps {
  /** Texto que descreve o arquivo ("Meus dados (arquivo técnico)"). */
  label: string;
  /** Linha de ajuda abaixo do título. */
  hint?: string;
  /** Gera o arquivo no cache. Lança em caso de falha. */
  prepare: () => Promise<Prepared>;
}

type Mode = 'save' | 'share';

export function ExportFileButtons({ label, hint, prepare }: ExportFileButtonsProps) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const [busy, setBusy] = useState<Mode | null>(null);

  const run = async (mode: Mode) => {
    if (busy) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(mode);
    try {
      let file: Prepared;
      try {
        file = await prepare();
      } catch (error) {
        console.error('[Exportar] falha ao gerar o arquivo:', error);
        showDialog({
          title: 'Não foi possível gerar o arquivo',
          message: 'Houve um erro ao gerar o arquivo. Tente novamente em instantes.',
          variant: 'error',
          buttons: [{ text: 'OK' }],
        });
        return;
      }

      if (mode === 'save') {
        const result = await saveFileToFolder(file);
        if (result.status === 'saved') {
          showToast({ message: `Salvo em ${result.folderName}: ${result.fileName}`, variant: 'success' });
        } else if (result.status === 'failed') {
          showDialog({
            title: 'Não foi possível baixar',
            message: `${result.reason}\n\nTente o botão "Compartilhar" e escolha onde guardar o arquivo.`,
            variant: 'error',
            buttons: [{ text: 'OK' }],
          });
          return;
        }
      } else {
        const result = await shareFile(file);
        if (result.status === 'unavailable') {
          showDialog({
            title: 'Compartilhamento indisponível',
            message: 'Este celular não oferece a opção de compartilhar. Use o botão "Baixar".',
            variant: 'error',
            buttons: [{ text: 'OK' }],
          });
          return;
        }
        if (result.status === 'failed') {
          showDialog({
            title: 'Não foi possível compartilhar',
            message: `${result.reason}\n\nTente o botão "Baixar".`,
            variant: 'error',
            buttons: [{ text: 'OK' }],
          });
          return;
        }
      }

      if (file.warning) showToast({ message: file.warning, variant: 'warning' });
    } finally {
      setBusy(null);
    }
  };

  const c = isAccessibilityMode
    ? { border: ac.primary, text: ac.primary, surface: ac.surface, muted: ac.muted, title: ac.foreground }
    : { border: colors.primary, text: colors.primary, surface: colors.surface, muted: colors.muted, title: colors.foreground };

  const button = (mode: Mode, icon: 'download' | 'share', text: string, a11yLabel: string) => (
    <Pressable
      onPress={() => run(mode)}
      disabled={busy !== null}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      style={({ pressed }) => ({
        flex: isAccessibilityMode ? undefined : 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isAccessibilityMode ? 14 : 8,
        minHeight: isAccessibilityMode ? 64 : fs.touch(52),
        borderRadius: isAccessibilityMode ? 20 : 12,
        borderWidth: isAccessibilityMode ? 3 : 2,
        borderColor: c.border,
        backgroundColor: c.surface,
        paddingHorizontal: 12,
        opacity: busy !== null ? 0.6 : pressed ? 0.8 : 1,
      })}
    >
      {busy === mode ? (
        <ActivityIndicator size="small" color={c.text} />
      ) : (
        <MaterialIcons name={icon} size={isAccessibilityMode ? 32 : 22} color={c.text} />
      )}
      <Text style={{ fontSize: isAccessibilityMode ? af.xl : fs.scaled(16), fontWeight: '800', color: c.text }}>
        {busy === mode ? 'Preparando...' : text}
      </Text>
    </Pressable>
  );

  return (
    <>
      <View style={{ gap: 8, marginTop: isAccessibilityMode ? 0 : 12 }}>
        <Text style={{ fontSize: isAccessibilityMode ? af.lg : fs.scaled(16), fontWeight: '700', color: c.title }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ fontSize: isAccessibilityMode ? af.sm : fs.sm, color: c.muted }}>{hint}</Text>
        ) : null}
        <View style={{ flexDirection: isAccessibilityMode ? 'column' : 'row', gap: 12 }}>
          {button('save', 'download', 'Baixar', `Baixar ${label} no celular`)}
          {button('share', 'share', 'Compartilhar', `Compartilhar ${label}`)}
        </View>
        <Text style={{ fontSize: isAccessibilityMode ? af.xs : fs.xs, color: c.muted }}>
          Baixar: o celular vai pedir para você escolher uma pasta. Compartilhar: envie por WhatsApp, e-mail ou salve no Drive.
        </Text>
      </View>
      <AppDialog {...dialogProps} />
      <Modal
        visible={toastProps.visible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => toastProps.onHide?.()}
      >
        <AppToast {...toastProps} />
      </Modal>
    </>
  );
}
```

- [ ] **Passo 5: Dados em JSON**

Substituir o conteúdo de `components/data-export-button.tsx` por:

```tsx
/**
 * DataExportButton
 *
 * "Meus dados" — exportação de dados do titular (LGPD Art. 18, V). Busca o que
 * o servidor guarda, junta com o que está no aparelho e gera um JSON; a entrega
 * (Baixar numa pasta ou Compartilhar) é do ExportFileButtons.
 *
 * Fallback deliberado: se o servidor não responder (offline, 503, timeout), o
 * arquivo é gerado assim mesmo com os dados locais e marcado com
 * `servidor_incluido: false` + aviso. O usuário nunca sai de mãos vazias.
 */
import React from 'react';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { ExportFileButtons } from '@/components/export-file-buttons';
import { useAppContext } from '@/lib/app-context';
import {
  buildExportPayload,
  exportFileName,
  type ExportLocalData,
  type ExportServerData,
} from '@/lib/_core/data-export';
import { trpc } from '@/lib/trpc';

export function DataExportButton() {
  const { state } = useAppContext();
  const utils = trpc.useUtils();

  const prepare = async () => {
    const local: ExportLocalData = {
      alarmes: state.alarms,
      contatosDeEmergencia: state.emergencyContacts,
      anamnese: state.anamnesis,
      metricasDeSaude: state.healthMetrics,
      configuracoes: state.settings,
      perfil: state.profile,
    };

    let server: ExportServerData | null = null;
    let serverUnavailable = false;
    try {
      server = (await utils.userData.export.fetch()) as ExportServerData;
    } catch (error) {
      // Fallback: segue com os dados locais e marca a ausência no arquivo.
      // Motivo real no log — nunca engolir em silêncio.
      serverUnavailable = true;
      console.warn('[DataExport] servidor indisponível:', error);
    }

    const payload = buildExportPayload({
      local,
      server,
      serverUnavailable,
      appVersion: Application.nativeApplicationVersion ?? 'desconhecida',
    });

    const fileName = exportFileName();
    const file = new File(Paths.cache, fileName);
    file.write(JSON.stringify(payload, null, 2));

    return {
      uri: file.uri,
      fileName,
      mimeType: 'application/json',
      uti: 'public.json',
      dialogTitle: 'Meus dados',
      warning: serverUnavailable
        ? 'Arquivo gerado só com os dados do aparelho — sem conexão com o servidor.'
        : undefined,
    };
  };

  return (
    <ExportFileButtons
      label="Meus dados (arquivo técnico)"
      hint="Para guardar ou levar a outro serviço."
      prepare={prepare}
    />
  );
}
```

- [ ] **Passo 6: Relatório de saúde (PDF)**

Criar `lib/health-report-file.ts`:

```ts
import * as Print from 'expo-print';
import type { Alarm, HealthMetric, UserProfile } from '@/lib/app-context';
import { buildReportHtml } from '@/lib/health-report-generator';

/** Gera o PDF do relatório de saúde no cache do app. `html` volta para o fallback de impressão da web. */
export async function createHealthReportPdf(data: {
  profile: UserProfile;
  healthMetrics: HealthMetric[];
  alarms: Alarm[];
}): Promise<{ uri: string; html: string }> {
  const html = buildReportHtml({ ...data, generatedAt: Date.now() });
  const { uri } = await Print.printToFileAsync({
    html,
    width: 612, // US Letter width em pontos (72 PPI)
    height: 792, // US Letter height em pontos
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  return { uri, html };
}
```

Em `components/health-report-button.tsx`, trocar os passos 1 e 2 do `handleGenerateReport` (de `// 1. Gera HTML do relatório` até o `});` do `Print.printToFileAsync`) por:

```tsx
      // 1-2. Gera o HTML e converte para PDF
      const { uri, html } = await createHealthReportPdf({
        profile: state.profile,
        healthMetrics: state.healthMetrics,
        alarms: state.alarms,
      });
```

e ajustar os imports: apagar `import { buildReportHtml } from '@/lib/health-report-generator';`, acrescentar `import { createHealthReportPdf } from '@/lib/health-report-file';` (o `import * as Print` continua: o fallback da web usa `Print.printAsync`).

Criar `components/health-report-export.tsx`:

```tsx
/**
 * HealthReportExport — o relatório de saúde em PDF com Baixar e Compartilhar,
 * para a seção "Dados e Armazenamento". (O botão rápido da aba Saúde,
 * HealthReportButton, continua só compartilhando.)
 */
import React from 'react';
import { ExportFileButtons } from '@/components/export-file-buttons';
import { useAppContext } from '@/lib/app-context';
import { createHealthReportPdf } from '@/lib/health-report-file';

function reportFileName(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `vigora-relatorio-saude-${yyyy}-${mm}-${dd}.pdf`;
}

export function HealthReportExport() {
  const { state } = useAppContext();

  const prepare = async () => {
    const { uri } = await createHealthReportPdf({
      profile: state.profile,
      healthMetrics: state.healthMetrics,
      alarms: state.alarms,
    });
    return {
      uri,
      fileName: reportFileName(),
      mimeType: 'application/pdf',
      uti: 'com.adobe.pdf',
      dialogTitle: 'Relatório de saúde',
    };
  };

  return (
    <ExportFileButtons
      label="Relatório de saúde (PDF)"
      hint="Suas medições e lembretes, para mostrar ao médico."
      prepare={prepare}
    />
  );
}
```

Em `app/(tabs)/settings.tsx`: acrescentar `import { HealthReportExport } from '@/components/health-report-export';` e inserir `<HealthReportExport />` imediatamente **antes** de cada `<DataExportButton />` (modo acessível, linha ~750; modo normal, linha ~1593).

- [ ] **Passo 7: Ficha de anamnese (PDF)**

Em `lib/pdf-utils-v2.ts`, trocar a função `exportAnamnesisToPDF` inteira (e o `import * as Sharing from 'expo-sharing';` da linha 2, que só ela usava) por:

```ts
/** Gera o PDF da ficha no cache do app e devolve o file:// dele. */
export async function createAnamnesisPdf(anamnesis: AnamnesesData): Promise<string> {
  const { uri } = await Print.printToFileAsync({
    html: generateAnamnesisPDF(anamnesis),
    base64: false,
  });
  return uri;
}
```

Em `app/(tabs)/anamnesis.tsx`:

1. Trocar `import { exportAnamnesisToPDF } from '@/lib/pdf-utils-v2';` por `import { createAnamnesisPdf } from '@/lib/pdf-utils-v2';` e acrescentar `import { ExportFileButtons } from '@/components/export-file-buttons';`.
2. Trocar a função `handleExport` (e o comentário "Exportação em PDF liberada para todos...") por:

```ts
  // Exportação em PDF liberada para todos — a experiência completa não é
  // restringida por plano. Baixar/Compartilhar ficam no ExportFileButtons.
  const prepareExport = async () => ({
    uri: await createAnamnesisPdf(form),
    fileName: 'vigora-historico-medico.pdf',
    mimeType: 'application/pdf',
    uti: 'com.adobe.pdf',
    dialogTitle: 'Histórico médico',
  });
```

3. No modo acessível, trocar o `<Pressable onPress={handleExport} ...>Exportar PDF</Pressable>` (bloco "Exportar PDF — liberado para todos", linhas ~217-226) por:

```tsx
          <ExportFileButtons label="Histórico médico (PDF)" prepare={prepareExport} />
```

4. No passo 3 do modo normal, trocar o `<Pressable onPress={handleExport} style={... styles.exportBtn ...}>...Exportar ficha em PDF...</Pressable>` por:

```tsx
              <ExportFileButtons label="Ficha em PDF" prepare={prepareExport} />
```

5. Se `styles.exportBtn` e `styles.exportBtnText` ficarem sem uso, apagá-los:

```bash
grep -n "exportBtn" "app/(tabs)/anamnesis.tsx"
```

- [ ] **Passo 8: Ver passar**

```bash
pnpm vitest run tests/save-or-share-file.test.ts tests/export-buttons-wiring.test.ts tests/data-export.test.ts tests/anamnesis-pdf-escaping.test.ts tests/pdf-escape.test.ts
pnpm test && pnpm check
```

Esperado: verde.

- [ ] **Passo 9: Validar o "Baixar" em aparelho (Samsung e Motorola, antes do PR)**

Em cada aparelho: Configurações → Dados e Armazenamento → "Baixar" nos três arquivos.
1. Tentar escolher a pasta **Downloads**. Anotar: o seletor deixa selecionar a raiz? O arquivo aparece no app Arquivos?
2. Escolher **Documentos**. O arquivo aparece?
3. **Cancelar** o seletor: não pode aparecer erro. Anotar o texto exato do erro no log (`adb logcat | grep Exportar`) e, se não casar `cancel|dismiss`, ajustar `isPickerCancel` e o teste.
4. "Compartilhar" → WhatsApp/Drive funcionam.
5. Repetir no modo acessível.

Registrar os resultados na descrição do PR. Se o Android bloquear Downloads, o texto de ajuda já diz "escolha uma pasta"; nesse caso acrescentar à linha de ajuda do componente: `No Android, escolha "Documentos" (a pasta Downloads não aceita arquivos de apps).`

- [ ] **Passo 10: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 15: App do cuidador atualiza sozinho e permite atualizar

**Branch:** `beta/15-cuidador-atualizar` · **Mensagem:** `feat(cuidador): atualiza ao voltar ao app, puxar para atualizar e mostra há quanto tempo foi atualizado`

**Files:**
- Create: `lib/query-focus.ts`
- Create: `components/caregiver-refresh.tsx`
- Modify: `app/_layout.tsx` (import; efeito depois de `const [trpcClient] = ...`)
- Modify: `app/(caregiver-tabs)/index.tsx`, `person.tsx`, `alerts.tsx`
- Modify: `components/caregiver-push-initializer.tsx`
- Test: `tests/caregiver-refresh.test.ts`

**Interfaces:**
- Produces: `installQueryFocusManager(): void` (`@/lib/query-focus`); `CaregiverRefreshControl({ refreshing, onRefresh })` e `UpdatedAgoBar({ updatedAt, refreshing, onRefresh })` (`@/components/caregiver-refresh`).

Causa: as consultas usam `refetchOnWindowFocus: false` e não há `focusManager`; as abas ficam montadas depois da primeira visita; um push recebido só navega ao toque. Os dados só atualizam com o processo reiniciado.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/caregiver-refresh.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setEventListener = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  focusManager: { setEventListener: (...a: unknown[]) => setEventListener(...a) },
}));

const remove = vi.fn();
const addEventListener = vi.fn((_event: string, _handler: (state: string) => void) => ({ remove }));
vi.mock('react-native', () => ({
  AppState: { addEventListener: (...a: unknown[]) => addEventListener(...a) },
}));

import { installQueryFocusManager } from '../lib/query-focus';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('installQueryFocusManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('instala uma vez só e trata "app ativo" como foco', () => {
    installQueryFocusManager();
    installQueryFocusManager();
    expect(setEventListener).toHaveBeenCalledTimes(1);

    // O React Query chama o "setup" com o handleFocus dele.
    const setup = setEventListener.mock.calls[0][0] as (
      handleFocus: (focused: boolean) => void
    ) => () => void;
    const handleFocus = vi.fn();
    const cleanup = setup(handleFocus);

    const onChange = addEventListener.mock.calls[0][1] as (state: string) => void;
    onChange('active');
    onChange('background');
    expect(handleFocus.mock.calls).toEqual([[true], [false]]);

    cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('telas do cuidador', () => {
  it('as consultas recarregam ao voltar ao app', () => {
    for (const file of ['index.tsx', 'person.tsx', 'alerts.tsx']) {
      const src = read(`app/(caregiver-tabs)/${file}`);
      expect(src, file).toMatch(/refetchOnWindowFocus: true/);
    }
  });

  it('as telas têm puxar para atualizar e a linha "Atualizado"', () => {
    for (const file of ['index.tsx', 'person.tsx', 'alerts.tsx']) {
      const src = read(`app/(caregiver-tabs)/${file}`);
      expect(src, file).toMatch(/CaregiverRefreshControl/);
      expect(src, file).toMatch(/<UpdatedAgoBar/);
    }
  });

  it('o layout raiz instala o focusManager', () => {
    expect(read('app/_layout.tsx')).toMatch(/installQueryFocusManager\(\)/);
  });

  it('push recebido com o app aberto recarrega os dados', () => {
    const src = read('components/caregiver-push-initializer.tsx');
    expect(src).toMatch(/addNotificationReceivedListener/);
    expect(src).toMatch(/getMonitoredAlerts\.invalidate/);
    expect(src).toMatch(/getMonitoredData\.invalidate/);
  });
});
```

(O segundo teste de `installQueryFocusManager` só confirma que um listener foi registrado; a ligação com `AppState` é conferida na validação em aparelho.)

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/caregiver-refresh.test.ts
```

Esperado: FAIL (módulo não existe).

- [ ] **Passo 3: Focus manager**

Criar `lib/query-focus.ts`:

```ts
/**
 * query-focus.ts
 *
 * No React Native não existe "foco da janela": sem isto o React Query nunca
 * considera que o usuário voltou à tela, e `refetchOnWindowFocus` não faz nada.
 * Aqui "app voltou ao primeiro plano" vira foco.
 */
import { focusManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

let installed = false;

export function installQueryFocusManager(): void {
  if (installed) return;
  installed = true;
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
    return () => sub.remove();
  });
}
```

Em `app/_layout.tsx`: acrescentar `import { installQueryFocusManager } from '@/lib/query-focus';` junto dos imports de `@/lib` e, logo depois de `const [trpcClient] = useState(() => createTRPCClient());`, acrescentar:

```tsx
  // "App voltou ao primeiro plano" = foco para o React Query (telas do cuidador
  // recarregam ao voltar ao app).
  useEffect(() => {
    installQueryFocusManager();
  }, []);
```

- [ ] **Passo 4: Componentes de atualizar**

Criar `components/caregiver-refresh.tsx`:

```tsx
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, View } from 'react-native';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { BrandFonts } from '@/lib/_core/theme';
import { relativeTime } from '@/lib/caregiver-format';
import { useFontSize } from '@/lib/font-size-context';

/** Puxar para atualizar. */
export function CaregiverRefreshControl({
  refreshing,
  onRefresh,
}: {
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const colors = useColors();
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />;
}

/** "Atualizado há 3 min" + botão de atualizar (mesmo gesto do botão da tela do monitorado). */
export function UpdatedAgoBar({
  updatedAt,
  refreshing,
  onRefresh,
}: {
  /** `dataUpdatedAt` da consulta (epoch-ms); 0 enquanto nunca carregou. */
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  // Re-renderiza a cada 30 s para o "há X min" não ficar parado.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const muted = isAccessibilityMode ? ac.muted : colors.muted;
  const primary = isAccessibilityMode ? ac.primary : colors.primary;
  const label = updatedAt > 0 ? `Atualizado ${relativeTime(updatedAt)}` : 'Atualizando…';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text style={{ color: muted, fontSize: isAccessibilityMode ? af.sm : fs.sm, fontFamily: BrandFonts.body }}>
        {label}
      </Text>
      <Pressable
        onPress={onRefresh}
        disabled={refreshing}
        accessibilityRole="button"
        accessibilityLabel="Atualizar agora"
        hitSlop={8}
        style={({ pressed }) => ({
          minWidth: isAccessibilityMode ? 60 : 44,
          minHeight: isAccessibilityMode ? 60 : 44,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed || refreshing ? 0.6 : 1,
        })}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color={primary} />
        ) : (
          <MaterialIcons name="refresh" size={isAccessibilityMode ? 32 : 24} color={primary} />
        )}
      </Pressable>
    </View>
  );
}
```

- [ ] **Passo 5: Ligar nas três telas**

Em cada tela: importar `import { CaregiverRefreshControl, UpdatedAgoBar } from '@/components/caregiver-refresh';`.

**`app/(caregiver-tabs)/index.tsx`:**
1. As duas consultas (linhas 41 e 45) ganham `refetchOnWindowFocus: true`:

```tsx
  const monitored = trpc.link.getMonitoredData.useQuery(undefined, { enabled: !!linked, refetchOnWindowFocus: true });
```
```tsx
  const alerts = trpc.link.getMonitoredAlerts.useQuery(undefined, { enabled: !!linked, refetchOnWindowFocus: true });
```

2. Logo depois da linha da consulta `alerts` (antes de qualquer `return` antecipado), acrescentar:

```tsx
  const refreshing = monitored.isRefetching || alerts.isRefetching;
  const onRefresh = () => {
    monitored.refetch();
    alerts.refetch();
  };
```

3. Nos dois `<ScrollView ...>` (modo acessível, linha ~113, e normal, linha ~173) acrescentar a prop `refreshControl={<CaregiverRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}` e, como **primeiro filho** de cada um, `<UpdatedAgoBar updatedAt={monitored.dataUpdatedAt} refreshing={refreshing} onRefresh={onRefresh} />`.

**`app/(caregiver-tabs)/person.tsx`:**
1. Linha 57: `{ enabled: !!linked }` → `{ enabled: !!linked, refetchOnWindowFocus: true }`.
2. Logo depois dessa linha acrescentar:

```tsx
  const refreshing = monitored.isRefetching;
  const onRefresh = () => {
    monitored.refetch();
  };
```

3. No `<ScrollView contentContainerStyle={[styles.content, ...]}>` (linha ~133) acrescentar `refreshControl={<CaregiverRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}` e, como primeiro filho, `<UpdatedAgoBar updatedAt={monitored.dataUpdatedAt} refreshing={refreshing} onRefresh={onRefresh} />`.

**`app/(caregiver-tabs)/alerts.tsx`:**
1. Linha 40: `{ enabled: !!linked }` → `{ enabled: !!linked, refetchOnWindowFocus: true }`.
2. Logo depois acrescentar:

```tsx
  const refreshing = alerts.isRefetching;
  const onRefresh = () => {
    alerts.refetch();
  };
```

3. Nos dois `<ScrollView ...>` (acessível: `<ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>`; normal: `<ScrollView contentContainerStyle={styles.body}>`) acrescentar `refreshControl={<CaregiverRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}` e, como primeiro filho, `<UpdatedAgoBar updatedAt={alerts.dataUpdatedAt} refreshing={refreshing} onRefresh={onRefresh} />`.

- [ ] **Passo 6: Push recebido recarrega**

Em `components/caregiver-push-initializer.tsx`:

1. Acrescentar `import { useCaregiverContext } from '@/lib/caregiver-context';`.
2. Dentro do componente, depois de `const register = trpc.push.register.useMutation();`:

```tsx
  const utils = trpc.useUtils();
  const { refreshLink } = useCaregiverContext();
```

3. Depois do efeito "Tap-to-navigate", antes do `return null;`, acrescentar:

```tsx
  // Push recebido com o app aberto: recarrega os dados (o toque só navega).
  // Desvínculo também relê o vínculo, para a tela não continuar mostrando quem
  // já encerrou o acompanhamento.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type;
      if (!CAREGIVER_PUSH_TYPES.includes(type as string)) return;
      utils.link.getMonitoredAlerts.invalidate().catch(() => {});
      utils.link.getMonitoredData.invalidate().catch(() => {});
      if (type === 'link_revoked') refreshLink().catch(() => {});
    });
    return () => sub.remove();
  }, [utils, refreshLink]);
```

- [ ] **Passo 7: Ver passar**

```bash
pnpm vitest run tests/caregiver-refresh.test.ts tests/caregiver-tabs-guard.test.ts
pnpm test && pnpm check
```

- [ ] **Passo 8: Conferir em dois aparelhos (monitorado + cuidador vinculados)** — o monitorado cria um lembrete; o cuidador (com o app em segundo plano) volta ao app: a lista atualiza sem fechar; puxar para atualizar funciona; a linha "Atualizado há X min" anda; "Atualizar agora" tem rótulo para o leitor de tela; claro/escuro/acessível.

- [ ] **Passo 9: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 16: Histórico de alarmes: excluídos, agendados e erro

**Branch:** `beta/16-historico` · **Mensagem:** `fix(historico): marca lembretes excluídos, esconde agendados de lembretes removidos e mostra erro ao carregar`
**Depende de:** Tarefa 8 (`LEGACY_CHECKIN_ALARM_ID`).

**Files:**
- Create: `lib/alarm-history.ts`
- Modify: `components/alarm-history-sheet.tsx`
- Modify: `app/(tabs)/alarms.tsx` (modo acessível: botão "Histórico" e a folha)
- Test: `tests/alarm-history.test.ts`

**Interfaces:**
- Produces (em `@/lib/alarm-history`): `visibleHistoryEvents<T>(events: T[], alarms: { id: string; enabled: boolean }[], now?: number): T[]`, `eventDisplayName(e, alarms): string`, `isAlarmGone(e, alarms): boolean`, onde `T`/`e` têm `{ alarmId: string; alarmDescription: string; status: string; scheduledAt: string; kind?: string | null }`.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/alarm-history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { eventDisplayName, isAlarmGone, visibleHistoryEvents } from '../lib/alarm-history';

const NOW = new Date('2026-10-02T12:00:00Z').getTime();
const FUTURE = '2026-10-03T08:00:00.000Z';
const PAST = '2026-10-01T08:00:00.000Z';

const ev = (over: Record<string, unknown> = {}) => ({
  alarmId: 'a1',
  alarmDescription: 'Losartana',
  status: 'responded',
  scheduledAt: PAST,
  ...over,
});

describe('visibleHistoryEvents', () => {
  const alarms = [{ id: 'a1', enabled: true }];

  it('mantém o passado de um alarme excluído (é o registro do que aconteceu)', () => {
    const events = [ev({ alarmId: 'gone', status: 'missed' })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toHaveLength(1);
  });

  it('esconde o "Agendado" de um alarme excluído', () => {
    const events = [ev({ alarmId: 'gone', status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toEqual([]);
  });

  it('esconde o "Agendado" de um alarme desativado', () => {
    const events = [ev({ status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, [{ id: 'a1', enabled: false }], NOW)).toEqual([]);
  });

  it('mantém o "Agendado" de um alarme ligado', () => {
    const events = [ev({ status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toHaveLength(1);
  });

  it('o check-in antigo (id fixo) nunca some por não estar na lista', () => {
    const events = [ev({ alarmId: 'checkin-daily', status: 'pending', scheduledAt: FUTURE })];
    expect(visibleHistoryEvents(events, alarms, NOW)).toHaveLength(1);
  });
});

describe('isAlarmGone / eventDisplayName', () => {
  const alarms = [{ id: 'a1', enabled: true }];

  it('alarme na lista não está excluído', () => {
    expect(isAlarmGone(ev(), alarms)).toBe(false);
    expect(eventDisplayName(ev(), alarms)).toBe('Losartana');
  });

  it('alarme fora da lista leva "(excluído)"', () => {
    expect(isAlarmGone(ev({ alarmId: 'gone' }), alarms)).toBe(true);
    expect(eventDisplayName(ev({ alarmId: 'gone' }), alarms)).toBe('Losartana (excluído)');
  });

  it('check-in antigo nunca é "excluído" e tem nome próprio', () => {
    const e = ev({ alarmId: 'checkin-daily', alarmDescription: '' });
    expect(isAlarmGone(e, alarms)).toBe(false);
    expect(eventDisplayName(e, alarms)).toBe('Check-in');
  });

  it('sem descrição, remédio excluído usa o nome genérico', () => {
    expect(eventDisplayName(ev({ alarmId: 'gone', alarmDescription: '' }), alarms)).toBe(
      'Alarme de Medicamento (excluído)'
    );
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/alarm-history.test.ts
```

- [ ] **Passo 3: Implementar**

Criar `lib/alarm-history.ts`:

```ts
/**
 * alarm-history.ts
 *
 * Regras de exibição do histórico de alarmes. O histórico vem do servidor e
 * guarda o nome do alarme no evento: excluir um alarme no app não mexe nos
 * eventos já registrados. Aqui o passado é mantido (é o registro do que
 * aconteceu) e marcado "(excluído)"; o disparo FUTURO agendado de um alarme
 * excluído ou desativado some — ele não vai acontecer.
 */
import { LEGACY_CHECKIN_ALARM_ID } from '@/lib/caregiver-format';

export interface HistoryEventLike {
  alarmId: string;
  alarmDescription: string;
  status: string;
  scheduledAt: string;
  kind?: string | null;
}

interface AlarmRef {
  id: string;
  enabled: boolean;
}

const isCheckin = (e: { alarmId: string; kind?: string | null }): boolean =>
  e.kind === 'checkin' || e.alarmId === LEGACY_CHECKIN_ALARM_ID;

/** O check-in antigo nunca esteve na lista de alarmes: "ausente" não prova exclusão. */
export function isAlarmGone(e: HistoryEventLike, alarms: AlarmRef[]): boolean {
  if (e.alarmId === LEGACY_CHECKIN_ALARM_ID) return false;
  return !alarms.some((a) => a.id === e.alarmId);
}

export function visibleHistoryEvents<T extends HistoryEventLike>(
  events: T[],
  alarms: AlarmRef[],
  now: number = Date.now()
): T[] {
  return events.filter((e) => {
    const scheduled = e.status === 'pending' && new Date(e.scheduledAt).getTime() > now;
    if (!scheduled) return true;
    if (e.alarmId === LEGACY_CHECKIN_ALARM_ID) return true;
    const alarm = alarms.find((a) => a.id === e.alarmId);
    return !!alarm && alarm.enabled;
  });
}

export function eventDisplayName(e: HistoryEventLike, alarms: AlarmRef[]): string {
  const base = e.alarmDescription || (isCheckin(e) ? 'Check-in' : 'Alarme de Medicamento');
  return isAlarmGone(e, alarms) ? `${base} (excluído)` : base;
}
```

Em `components/alarm-history-sheet.tsx`:

1. Imports: `import { useAppContext } from '@/lib/app-context';` e `import { eventDisplayName, visibleHistoryEvents } from '@/lib/alarm-history';`
2. Interface `AlarmEvent`: acrescentar `kind?: string | null;`.
3. No componente, depois de `const insets = useSafeAreaInsets();` acrescentar `const { state } = useAppContext();` e, depois de `const [refreshing, setRefreshing] = useState(false);`:

```tsx
  const [loadError, setLoadError] = useState(false);
```

4. Em `loadData`, no início do `try` acrescentar `setLoadError(false);` e, no `catch`, depois do `console.warn`, `setLoadError(true);`.
5. Trocar as linhas de contagem por (usando só os eventos visíveis):

```tsx
  const visibleEvents = visibleHistoryEvents(events, state.alarms);
  const respondedCount = visibleEvents.filter((e) => e.status === 'responded').length;
  const missedCount = visibleEvents.filter((e) => e.status === 'missed').length;
  const notSentCount = visibleEvents.filter((e) => e.status === 'not_sent').length;
```

6. Em `Eventos ({events.length})` usar `visibleEvents.length`; em `events.length === 0 ? (` e `events.map((event) => {` usar `visibleEvents`; e trocar o nome exibido `{event.alarmDescription || 'Alarme de Medicamento'}` por `{eventDisplayName(event, state.alarms)}`.
7. Estado de erro: logo depois do `{loading ? (...) : (` do conteúdo, antes do `<ScrollView`, tratar o erro. Trocar a estrutura `{loading ? ( A ) : ( <ScrollView ...> ... </ScrollView> )}` por `{loading ? ( A ) : loadError ? ( B ) : ( <ScrollView ...> ... </ScrollView> )}` com `B` =

```tsx
          <View style={styles.loadingContainer}>
            <MaterialIcons name="cloud-off" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted, fontSize: fs.scaled(14), lineHeight: fs.scaled(20) }]}>
              Não foi possível carregar o histórico.{'\n'}Confira a internet e tente de novo.
            </Text>
            <Pressable
              onPress={() => loadData()}
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar o histórico de novo"
              style={({ pressed }) => [
                styles.closeFooterBtn,
                { borderColor: colors.primary, backgroundColor: colors.surface, minHeight: fs.touch(54), paddingHorizontal: 24, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.closeFooterText, { color: colors.primary, fontSize: fs.md }]}>Tentar de novo</Text>
            </Pressable>
          </View>
```

Em `app/(tabs)/alarms.tsx`, **modo acessível**: logo depois do `<View ...>` do cabeçalho (o bloco com `Remédios` e `{state.alarms.length} lembrete(s) configurado(s)`, termina antes de `{sortedAlarms.length === 0 ? (`), acrescentar:

```tsx
        <AlarmHistorySheet visible={historyVisible} onClose={() => setHistoryVisible(false)} />
        <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
          <Pressable
            onPress={() => setHistoryVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Histórico de alarmes"
            style={({ pressed }) => [{
              minHeight: as_.touchTarget,
              borderRadius: 16,
              borderWidth: 3,
              borderColor: ac.primary,
              backgroundColor: ac.surface,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              opacity: pressed ? 0.85 : 1,
            }]}
          >
            <MaterialIcons name="history" size={30} color={ac.primary} />
            <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.primary }}>Ver histórico</Text>
          </Pressable>
        </View>
```

- [ ] **Passo 4: Ver passar**

```bash
pnpm vitest run tests/alarm-history.test.ts
pnpm test && pnpm check
```

- [ ] **Passo 5: Conferir no aparelho** — excluir um lembrete que já tem eventos: o histórico mantém os eventos passados com "(excluído)" e some com o "Agendado" dele. Sem internet, o histórico mostra o erro com "Tentar de novo". "Ver histórico" aparece também no modo acessível.

- [ ] **Passo 6: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 17: Formulário de lembrete em lista única

**Branch:** `beta/17-formulario-lista` · **Mensagem:** `feat(lembretes): formulário em lista única, componente reutilizável, com Som e Vibração no modo acessível`
**Depende de:** Tarefa 16 (as duas mexem em `alarms.tsx`).

**Files:**
- Create: `lib/alarm-form.ts`
- Create: `components/alarm-form-modal.tsx`
- Modify: `app/(tabs)/alarms.tsx`
- Test: `tests/alarm-form.test.ts`

**Interfaces:**
- Produces (em `@/lib/alarm-form`): `type AlarmFormValues = Omit<Alarm, 'id'>`, `EMPTY_ALARM_FORM: AlarmFormValues`, `REPEAT_OPTIONS`, `formFromAlarm(alarm: Alarm | null): AlarmFormValues`, `isFormSaveDisabled(form: AlarmFormValues): boolean`.
- Produces: `AlarmFormModal({ visible, editingAlarm, onCancel, onSave, onDelete })` em `@/components/alarm-form-modal` com `onSave: (form: AlarmFormValues) => void` e `onDelete: (alarmId: string) => void`.

O assistente de dois passos some. A ordem do formulário (spec 4.8): Nome → Que horas tomar → Repetição → Som → Vibração → Habilitado → "Excluir lembrete" (só na edição) e, fixa embaixo, a barra Cancelar / Salvar. O modo acessível mantém o formulário próprio (horário com setas, repetição diário/dias úteis) e ganha os interruptores Som e Vibração. A Fase 3 reaproveita este componente para o check-in.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/alarm-form.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_ALARM_FORM,
  formFromAlarm,
  isFormSaveDisabled,
  REPEAT_OPTIONS,
} from '../lib/alarm-form';
import type { Alarm } from '../lib/app-context';

const alarm: Alarm = {
  id: 'a1',
  time: '09:30',
  description: 'Losartana',
  enabled: false,
  repeat: 'custom',
  customDays: [1, 3],
  sound: false,
  vibration: true,
  notificationId: 'n1',
  nativeAlarmUids: ['vigora_a1_wd1'],
};

describe('formFromAlarm', () => {
  it('sem alarme devolve o formulário em branco', () => {
    expect(formFromAlarm(null)).toEqual(EMPTY_ALARM_FORM);
    expect(EMPTY_ALARM_FORM).toMatchObject({ time: '08:00', repeat: 'daily', sound: true, vibration: true, enabled: true });
  });

  it('copia só os campos editáveis (ids de agendamento são recalculados no salvar)', () => {
    const form = formFromAlarm(alarm);
    expect(form).toEqual({
      time: '09:30',
      description: 'Losartana',
      enabled: false,
      repeat: 'custom',
      customDays: [1, 3],
      sound: false,
      vibration: true,
    });
    expect(form).not.toHaveProperty('notificationId');
    expect(form).not.toHaveProperty('nativeAlarmUids');
  });
});

describe('isFormSaveDisabled', () => {
  it('personalizado sem nenhum dia não salva', () => {
    expect(isFormSaveDisabled({ ...EMPTY_ALARM_FORM, repeat: 'custom', customDays: [] })).toBe(true);
    expect(isFormSaveDisabled({ ...EMPTY_ALARM_FORM, repeat: 'custom', customDays: undefined })).toBe(true);
  });
  it('personalizado com dia, ou outra repetição, salva', () => {
    expect(isFormSaveDisabled({ ...EMPTY_ALARM_FORM, repeat: 'custom', customDays: [2] })).toBe(false);
    expect(isFormSaveDisabled(EMPTY_ALARM_FORM)).toBe(false);
  });
});

describe('REPEAT_OPTIONS', () => {
  it('tem as quatro repetições na ordem da tela', () => {
    expect(REPEAT_OPTIONS.map((o) => o.value)).toEqual(['daily', 'weekdays', 'weekends', 'custom']);
  });
});

describe('telas', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('a lista de lembretes usa o componente e não tem mais o assistente', () => {
    const alarms = read('app/(tabs)/alarms.tsx');
    expect(alarms).toMatch(/<AlarmFormModal/);
    expect(alarms).not.toMatch(/WizardStep|wizardStep/);
  });

  it('o formulário normal é uma tela única, na ordem da spec', () => {
    const modal = read('components/alarm-form-modal.tsx');
    expect(modal).not.toMatch(/WizardStep/);
    const order = ['Nome do lembrete', 'Que horas tomar?', 'Repetição', 'Som', 'Vibração', 'Habilitado', 'Excluir lembrete'];
    // Só o ramo normal (o acessível vem antes no arquivo e tem outros textos).
    const normal = modal.slice(modal.indexOf('MODO NORMAL'));
    const positions = order.map((label) => normal.indexOf(label));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('o modo acessível ganha Som e Vibração', () => {
    const modal = read('components/alarm-form-modal.tsx');
    expect(modal).toMatch(/Ativar som no modo acessível|accessibilityLabel=\{`Ativar \$\{/);
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/alarm-form.test.ts
```

- [ ] **Passo 3: Módulo puro**

Criar `lib/alarm-form.ts`:

```ts
/**
 * alarm-form.ts
 *
 * Valores e regras puras do formulário de lembrete (criar/editar). A tela é o
 * AlarmFormModal; aqui fica o que é testável sem React.
 */
import type { Alarm } from '@/lib/app-context';

export type AlarmFormValues = Omit<Alarm, 'id'>;

export const REPEAT_OPTIONS: { value: Alarm['repeat']; label: string }[] = [
  { value: 'daily', label: 'Diário' },
  { value: 'weekdays', label: 'Dias úteis' },
  { value: 'weekends', label: 'Fins de semana' },
  { value: 'custom', label: 'Personalizado' },
];

export const EMPTY_ALARM_FORM: AlarmFormValues = {
  time: '08:00',
  description: '',
  enabled: true,
  repeat: 'daily',
  customDays: [],
  sound: true,
  vibration: true,
};

/**
 * Só os campos editáveis. `notificationId`/`nativeAlarmUids` ficam de fora de
 * propósito: `scheduleFullAlarm` os recalcula ao salvar.
 */
export function formFromAlarm(alarm: Alarm | null): AlarmFormValues {
  if (!alarm) return EMPTY_ALARM_FORM;
  return {
    time: alarm.time,
    description: alarm.description,
    enabled: alarm.enabled,
    repeat: alarm.repeat,
    customDays: alarm.customDays,
    sound: alarm.sound,
    vibration: alarm.vibration,
  };
}

/** "Personalizado" sem nenhum dia não tem quando tocar. */
export function isFormSaveDisabled(form: AlarmFormValues): boolean {
  return form.repeat === 'custom' && (form.customDays ?? []).length === 0;
}
```

- [ ] **Passo 4: O componente**

Criar `components/alarm-form-modal.tsx` (os manipuladores de horário e o JSX do modo acessível vêm de `app/(tabs)/alarms.tsx`, linhas 140-194 e 491-708; o modo normal é novo):

```tsx
/**
 * AlarmFormModal
 *
 * Formulário de lembrete (criar/editar) em tela única.
 *   Modo normal:    Nome → Que horas tomar? → Repetição → Som → Vibração →
 *                   Habilitado → Excluir (só na edição); Cancelar/Salvar fixos.
 *   Modo acessível: formulário próprio — horário com setas, repetição diário/
 *                   dias úteis, Som e Vibração em linhas grandes.
 *
 * Quem agenda e grava é o pai (onSave/onDelete): este componente só edita.
 */
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormKeyboardView } from '@/components/form-keyboard-view';
import { WheelPicker, wheelColumnMetrics } from '@/components/wheel-picker';
import { useColors } from '@/hooks/use-colors';
import { useAccessibility } from '@/lib/accessibility-context';
import { useFontSize } from '@/lib/font-size-context';
import { BrandFonts } from '@/lib/_core/theme';
import type { Alarm } from '@/lib/app-context';
import {
  formFromAlarm,
  isFormSaveDisabled,
  REPEAT_OPTIONS,
  type AlarmFormValues,
} from '@/lib/alarm-form';

const WEEKDAYS = [
  { day: 0, label: 'D', full: 'Dom' },
  { day: 1, label: 'S', full: 'Seg' },
  { day: 2, label: 'T', full: 'Ter' },
  { day: 3, label: 'Q', full: 'Qua' },
  { day: 4, label: 'Q', full: 'Qui' },
  { day: 5, label: 'S', full: 'Sex' },
  { day: 6, label: 'S', full: 'Sáb' },
];

const TIME_QUICK_PICKS = ['08:00', '12:00', '20:00'];

interface AlarmFormModalProps {
  visible: boolean;
  /** Alarme em edição; null = novo. */
  editingAlarm: Alarm | null;
  onCancel: () => void;
  onSave: (form: AlarmFormValues) => void;
  onDelete: (alarmId: string) => void;
}

export function AlarmFormModal({ visible, editingAlarm, onCancel, onSave, onDelete }: AlarmFormModalProps) {
  const colors = useColors();
  const fs = useFontSize();
  const insets = useSafeAreaInsets();
  const { isAccessibilityMode, a11yFontSize: af, a11yColors: ac, a11ySpacing: as_ } = useAccessibility();
  const minuteInputRef = useRef<TextInput>(null);
  const [form, setForm] = useState<AlarmFormValues>(() => formFromAlarm(editingAlarm));

  // Cada abertura recomeça do alarme em edição (ou do formulário em branco).
  useEffect(() => {
    if (visible) setForm(formFromAlarm(editingAlarm));
  }, [visible, editingAlarm]);

  const [timeHour, timeMinute] = form.time.split(':');
  const saveDisabled = isFormSaveDisabled(form);
  const colonMetrics = wheelColumnMetrics(isAccessibilityMode, as_.touchTarget);
  const title = editingAlarm ? 'Editar Lembrete' : 'Novo Lembrete';

  // --- Horário digitado (modo acessível) -----------------------------------
  const handleHourChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    const hNum = parseInt(digits, 10);
    // Auto-jump to minute field when 2 digits entered or hour > 2
    if (digits.length === 2 || (digits.length === 1 && hNum > 2)) {
      const clampedH = isNaN(hNum) ? '00' : String(Math.min(hNum, 23)).padStart(2, '0');
      setForm((f) => ({ ...f, time: `${clampedH}:${f.time.split(':')[1] || '00'}` }));
      if (digits.length === 2) minuteInputRef.current?.focus();
    } else {
      setForm((f) => ({ ...f, time: `${digits}:${f.time.split(':')[1] || '00'}` }));
    }
  };

  const handleMinuteChange = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 2);
    const mNum = parseInt(digits, 10);
    const clampedM = digits.length === 2 ? String(Math.min(mNum, 59)).padStart(2, '0') : digits;
    const currentHour = form.time.split(':')[0] || '00';
    setForm((f) => ({ ...f, time: `${currentHour}:${clampedM}` }));
  };

  const handleHourBlur = () => {
    const h = parseInt(timeHour, 10);
    const clamped = isNaN(h) ? '00' : String(Math.min(h, 23)).padStart(2, '0');
    setForm((f) => ({ ...f, time: `${clamped}:${f.time.split(':')[1] || '00'}` }));
  };

  const handleMinuteBlur = () => {
    const m = parseInt(timeMinute, 10);
    const clamped = isNaN(m) ? '00' : String(Math.min(m, 59)).padStart(2, '0');
    setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${clamped}` }));
  };

  const incrementHour = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const h = parseInt(timeHour, 10);
    const base = isNaN(h) ? 0 : h;
    const next = (base + delta + 24) % 24;
    setForm((f) => ({ ...f, time: `${String(next).padStart(2, '0')}:${f.time.split(':')[1] || '00'}` }));
  };

  const incrementMinute = (delta: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const m = parseInt(timeMinute, 10);
    const base = isNaN(m) ? 0 : m;
    const next = (base + delta + 60) % 60;
    setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${String(next).padStart(2, '0')}` }));
  };

  const toggleDay = (day: number, selected: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm((f) => {
      const days = f.customDays ?? [];
      return { ...f, customDays: selected ? days.filter((d) => d !== day) : [...days, day].sort() };
    });
  };

  // ==========================================================================
  // MODO ACESSÍVEL
  // ==========================================================================
  if (isAccessibilityMode) {
    const timeBox = {
      width: 90,
      height: 90,
      textAlign: 'center' as const,
      fontSize: af['3xl'],
      fontWeight: '900' as const,
      color: ac.foreground,
      backgroundColor: ac.surface,
      borderRadius: 16,
      borderWidth: 3,
      borderColor: ac.primary,
    };
    const arrow = { backgroundColor: ac.surface, borderRadius: 16, padding: 12, borderWidth: 2, borderColor: ac.border };

    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
        <View style={{ flex: 1, backgroundColor: ac.background }}>
          {/* Título apenas — Cancelar/Salvar ficam na barra inferior */}
          <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 16, paddingBottom: 16, borderBottomWidth: 2, borderBottomColor: ac.border, alignItems: 'center', backgroundColor: ac.bar }}>
            <Text style={{ fontSize: af.xl, fontWeight: '900', color: ac.foreground }}>{title}</Text>
          </View>
          <FormKeyboardView style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 28 }} keyboardShouldPersistTaps="handled">
              {/* Time */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Horário</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => incrementHour(1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Aumentar hora">
                      <MaterialIcons name="keyboard-arrow-up" size={36} color={ac.primary} />
                    </Pressable>
                    <TextInput
                      value={timeHour}
                      onChangeText={handleHourChange}
                      onBlur={handleHourBlur}
                      placeholder="08"
                      placeholderTextColor={ac.muted}
                      keyboardType="number-pad"
                      style={timeBox}
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Pressable onPress={() => incrementHour(-1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Diminuir hora">
                      <MaterialIcons name="keyboard-arrow-down" size={36} color={ac.primary} />
                    </Pressable>
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>hora</Text>
                  </View>
                  <Text style={{ fontSize: af['4xl'], fontWeight: '900', color: ac.foreground, marginBottom: 32 }}>:</Text>
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => incrementMinute(1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Aumentar minuto">
                      <MaterialIcons name="keyboard-arrow-up" size={36} color={ac.primary} />
                    </Pressable>
                    <TextInput
                      ref={minuteInputRef}
                      value={timeMinute}
                      onChangeText={handleMinuteChange}
                      onBlur={handleMinuteBlur}
                      placeholder="00"
                      placeholderTextColor={ac.muted}
                      keyboardType="number-pad"
                      style={timeBox}
                      maxLength={2}
                      selectTextOnFocus
                    />
                    <Pressable onPress={() => incrementMinute(-1)} style={({ pressed }) => [arrow, { opacity: pressed ? 0.6 : 1 }]} accessibilityRole="button" accessibilityLabel="Diminuir minuto">
                      <MaterialIcons name="keyboard-arrow-down" size={36} color={ac.primary} />
                    </Pressable>
                    <Text style={{ fontSize: af.sm, color: ac.muted, fontWeight: '600' }}>min</Text>
                  </View>
                </View>
              </View>

              {/* Description */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Nome do Lembrete</Text>
                <TextInput
                  value={form.description}
                  onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                  placeholder="Ex: Tomar remédio para pressão"
                  placeholderTextColor={ac.muted}
                  style={{ backgroundColor: ac.surface, color: ac.foreground, borderColor: ac.border, borderWidth: 2, borderRadius: 16, padding: 18, fontSize: af.md, fontWeight: '500' }}
                  returnKeyType="done"
                  maxLength={80}
                />
              </View>

              {/* Repeat - simplified to just daily/weekdays */}
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Repetição</Text>
                {[{ value: 'daily' as const, label: 'Todos os dias' }, { value: 'weekdays' as const, label: 'Dias úteis (Seg-Sex)' }].map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, repeat: opt.value }))}
                    style={[{
                      paddingVertical: as_.buttonPadding,
                      paddingHorizontal: 20,
                      borderRadius: 16,
                      borderWidth: 3,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 14,
                      backgroundColor: form.repeat === opt.value ? ac.primary : ac.surface,
                      borderColor: form.repeat === opt.value ? ac.primary : ac.border,
                    }]}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: form.repeat === opt.value }}
                  >
                    <MaterialIcons
                      name={form.repeat === opt.value ? 'radio-button-on' : 'radio-button-off'}
                      size={28}
                      color={form.repeat === opt.value ? ac.onPrimary : ac.muted}
                    />
                    <Text style={{ fontSize: af.md, fontWeight: '700', color: form.repeat === opt.value ? ac.onPrimary : ac.foreground }}>
                      {opt.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Som e Vibração — linhas grandes */}
              <View style={{ gap: 12 }}>
                {([
                  { key: 'sound' as const, label: 'Som', icon: 'volume-up' as const },
                  { key: 'vibration' as const, label: 'Vibração', icon: 'vibration' as const },
                ]).map((row) => (
                  <View
                    key={row.key}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, minHeight: as_.touchTarget, paddingHorizontal: 20, borderRadius: 16, borderWidth: 3, borderColor: ac.border, backgroundColor: ac.surface }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
                      <MaterialIcons name={row.icon} size={30} color={ac.primary} />
                      <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.foreground }}>{row.label}</Text>
                    </View>
                    <Switch
                      value={form[row.key]}
                      onValueChange={(v) => setForm((f) => ({ ...f, [row.key]: v }))}
                      trackColor={{ false: ac.border, true: ac.primary }}
                      thumbColor="#FFFFFF"
                      accessibilityLabel={`Ativar ${row.label.toLowerCase()} no modo acessível`}
                    />
                  </View>
                ))}
              </View>

              {/* Delete button in edit mode */}
              {editingAlarm && (
                <Pressable
                  onPress={() => onDelete(editingAlarm.id)}
                  style={({ pressed }) => [{
                    paddingVertical: as_.buttonPadding,
                    paddingHorizontal: 20,
                    borderRadius: 16,
                    borderWidth: 3,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    backgroundColor: pressed ? ac.error + '20' : ac.background,
                    borderColor: ac.emergency,
                    marginTop: 8,
                  }]}
                  accessibilityRole="button"
                  accessibilityLabel="Excluir este lembrete"
                >
                  <MaterialIcons name="delete" size={28} color={ac.emergency} />
                  <Text style={{ fontSize: af.md, fontWeight: '700', color: ac.emergency }}>Excluir Lembrete</Text>
                </Pressable>
              )}
            </ScrollView>

            {/* Barra inferior de ações: Cancelar + Salvar */}
            <View style={{ flexDirection: 'row', gap: 12, padding: 20, paddingBottom: Math.max(insets.bottom, 20), borderTopWidth: 2, borderTopColor: ac.border, backgroundColor: ac.bar }}>
              <Pressable
                onPress={onCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancelar"
                style={({ pressed }) => [{ flex: 1, minHeight: 64, borderRadius: 16, borderWidth: 3, borderColor: ac.muted, backgroundColor: ac.surface, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.foreground }}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => onSave(form)}
                disabled={saveDisabled}
                accessibilityRole="button"
                accessibilityLabel="Salvar lembrete"
                style={({ pressed }) => [{ flex: 1.5, minHeight: 64, borderRadius: 16, backgroundColor: ac.success, alignItems: 'center', justifyContent: 'center', opacity: saveDisabled ? 0.5 : pressed ? 0.85 : 1 }]}
              >
                <Text style={{ fontSize: af.md, fontWeight: '800', color: ac.onPrimary }}>Salvar</Text>
              </Pressable>
            </View>
          </FormKeyboardView>
        </View>
      </Modal>
    );
  }

  // ==========================================================================
  // MODO NORMAL — tela única
  // ==========================================================================
  const toggleRow = (
    key: 'sound' | 'vibration' | 'enabled',
    icon: React.ComponentProps<typeof MaterialIcons>['name'],
    label: string,
    a11yLabel: string
  ) => (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLeft}>
        <MaterialIcons name={icon} size={20} color={colors.muted} />
        <Text style={[styles.toggleLabel, { color: colors.foreground, fontSize: fs.base }]}>{label}</Text>
      </View>
      <Switch
        value={form[key]}
        onValueChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#FFFFFF"
        accessibilityLabel={a11yLabel}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={[styles.modal, { backgroundColor: colors.background }]}>
        {/* Título apenas — Cancelar/Salvar ficam na barra inferior */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border, backgroundColor: colors.bar, paddingTop: insets.top + 16 }]}>
          <Text style={[styles.modalTitle, { color: colors.foreground, fontSize: fs.xl, fontFamily: BrandFonts.body }]}>{title}</Text>
        </View>

        <FormKeyboardView style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Nome */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Nome do lembrete</Text>
              <TextInput
                value={form.description}
                onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
                placeholder="Ex: Tomar remédio para pressão"
                placeholderTextColor={colors.muted}
                style={[styles.textInput, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, fontSize: fs.base }]}
                returnKeyType="done"
                maxLength={80}
              />
            </View>

            {/* Que horas tomar? */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Que horas tomar?</Text>
              <View style={styles.timePicker}>
                <WheelPicker
                  count={24}
                  value={parseInt(timeHour, 10) || 0}
                  onChange={(h) => setForm((f) => ({ ...f, time: `${String(h).padStart(2, '0')}:${f.time.split(':')[1] || '00'}` }))}
                  label="hora"
                />
                <View style={{ marginTop: colonMetrics.wheelTop, height: colonMetrics.wheelHeight, justifyContent: 'center' }}>
                  <Text style={[styles.timeColon, { color: colors.foreground, fontSize: fs.scaled(40) }]}>:</Text>
                </View>
                <WheelPicker
                  count={60}
                  value={parseInt(timeMinute, 10) || 0}
                  onChange={(m) => setForm((f) => ({ ...f, time: `${f.time.split(':')[0] || '00'}:${String(m).padStart(2, '0')}` }))}
                  label="min"
                />
              </View>
              <View style={styles.quickPicks}>
                <Text style={[styles.quickPickLabel, { color: colors.muted, fontSize: fs.sm }]}>Sugestões</Text>
                <View style={styles.quickPickRow}>
                  {TIME_QUICK_PICKS.map((t) => {
                    const selected = form.time === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setForm((f) => ({ ...f, time: t }))}
                        style={[styles.quickPickChip, { backgroundColor: selected ? colors.primarySurface : colors.surface, borderColor: selected ? colors.primary : colors.border, minHeight: fs.touch(44) }]}
                        accessibilityRole="button"
                        accessibilityLabel={`Horário ${t}`}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.quickPickChipText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm, fontFamily: BrandFonts.monoRegular }]}>{t}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Repetição */}
            <View style={styles.formGroup}>
              <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Repetição</Text>
              <View style={styles.repeatOptions}>
                {REPEAT_OPTIONS.map((opt) => (
                  <Pressable
                    key={opt.value}
                    onPress={() => setForm((f) => ({ ...f, repeat: opt.value }))}
                    style={[styles.repeatOption, { backgroundColor: form.repeat === opt.value ? colors.primarySurface : colors.surface, borderColor: form.repeat === opt.value ? colors.primary : colors.border, minHeight: fs.touch(44) }]}
                    accessibilityRole="radio"
                    accessibilityLabel={opt.label}
                    accessibilityState={{ selected: form.repeat === opt.value }}
                  >
                    <Text style={[styles.repeatOptionText, { color: form.repeat === opt.value ? colors.onPrimary : colors.foreground, fontSize: fs.sm }]}>{opt.label}</Text>
                  </Pressable>
                ))}
              </View>

              {form.repeat === 'custom' && (
                <View style={[styles.weekdaySelector, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text style={[styles.weekdayTitle, { color: colors.muted, fontSize: fs.xs }]}>Dias da semana</Text>
                  <View style={styles.weekdayRow}>
                    {WEEKDAYS.map(({ day, label, full }) => {
                      const selected = (form.customDays ?? []).includes(day);
                      return (
                        <Pressable
                          key={day}
                          onPress={() => toggleDay(day, selected)}
                          style={[styles.weekdayBtn, { backgroundColor: selected ? colors.primarySurface : colors.background, borderColor: selected ? colors.primary : colors.border, minHeight: fs.touch(52) }]}
                          accessibilityRole="checkbox"
                          accessibilityLabel={full}
                          accessibilityState={{ checked: selected }}
                        >
                          <Text style={[styles.weekdayBtnText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm }]}>{label}</Text>
                          <Text style={[styles.weekdayBtnFull, { color: selected ? colors.onPrimary + 'CC' : colors.muted, fontSize: fs.xs }]}>{full}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {(form.customDays ?? []).length === 0 && (
                    <Text style={[styles.weekdayHint, { color: colors.error, fontSize: fs.sm }]}>Selecione pelo menos um dia</Text>
                  )}
                </View>
              )}
            </View>

            {/* Som · Vibração · Habilitado */}
            <View style={[styles.togglesSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {toggleRow('sound', 'volume-up', 'Som', 'Ativar som')}
              <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
              {toggleRow('vibration', 'vibration', 'Vibração', 'Ativar vibração')}
              <View style={[styles.toggleDivider, { backgroundColor: colors.border }]} />
              {toggleRow('enabled', 'check-circle', 'Habilitado', 'Habilitar lembrete')}
            </View>

            {/* Excluir — só na edição */}
            {editingAlarm && (
              <Pressable
                onPress={() => onDelete(editingAlarm.id)}
                style={({ pressed }) => [styles.deleteAlarmBtn, { borderColor: colors.error, backgroundColor: pressed ? colors.errorLight : colors.background, minHeight: fs.touch(52) }]}
                accessibilityRole="button"
                accessibilityLabel="Excluir este lembrete"
              >
                <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                <Text style={[styles.deleteAlarmBtnText, { color: colors.error, fontSize: fs.base }]}>Excluir lembrete</Text>
              </Pressable>
            )}
          </ScrollView>

          {/* Barra inferior: Cancelar + Salvar */}
          <View style={[styles.actionBar, { borderTopColor: colors.border, backgroundColor: colors.bar, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              style={({ pressed }) => [styles.actionBtn, { flex: 1, borderWidth: 2, borderColor: colors.muted, backgroundColor: colors.surface, minHeight: fs.touch(54), opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.actionBtnText, { color: colors.foreground, fontSize: fs.md }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(form)}
              disabled={saveDisabled}
              accessibilityRole="button"
              accessibilityLabel={editingAlarm ? 'Salvar lembrete' : 'Criar lembrete'}
              style={({ pressed }) => [styles.actionBtn, { flex: 1.5, backgroundColor: colors.primarySurface, minHeight: fs.touch(54), opacity: saveDisabled ? 0.5 : pressed ? 0.85 : 1 }]}
            >
              <Text style={[styles.actionBtnText, { color: colors.onPrimary, fontSize: fs.md }]}>{editingAlarm ? 'Salvar' : 'Criar lembrete'}</Text>
            </Pressable>
          </View>
        </FormKeyboardView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modal: { flex: 1 },
  modalHeader: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalTitle: { fontWeight: '600' },
  content: { padding: 20, gap: 24, paddingBottom: 24 },
  formGroup: { gap: 8 },
  formLabel: { fontWeight: '600' },
  textInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  repeatOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  repeatOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  repeatOptionText: { fontWeight: '500' },
  togglesSection: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggleLabel: { fontWeight: '500' },
  toggleDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  timePicker: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 12 },
  timeColon: { fontWeight: '800', paddingHorizontal: 4 },
  quickPicks: { gap: 8 },
  quickPickLabel: { fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  quickPickRow: { flexDirection: 'row', gap: 10 },
  quickPickChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  quickPickChipText: { fontWeight: '700' },
  weekdaySelector: { marginTop: 12, borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  weekdayTitle: { fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  weekdayRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  weekdayBtn: { flex: 1, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 1 },
  weekdayBtnText: { fontWeight: '700' },
  weekdayBtnFull: { fontWeight: '500' },
  weekdayHint: { marginTop: 4, textAlign: 'center' },
  deleteAlarmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderRadius: 14, marginTop: 8 },
  deleteAlarmBtnText: { fontWeight: '600' },
  actionBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  actionBtn: { borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  actionBtnText: { fontWeight: '800' },
});
```

- [ ] **Passo 5: Reduzir `app/(tabs)/alarms.tsx`**

Todas as alterações abaixo são neste arquivo. Fazer **de baixo para cima** para os números de linha acima continuarem valendo; conferir cada âncora antes de apagar (`sed -n 'Np' ...`).

1. **Estilos:** trocar tudo de `const styles = StyleSheet.create({` até o fim do arquivo por:

```ts
const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 2,
  },
  historyLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  historyLinkText: {
    fontWeight: '600',
  },
  nextCard: {
    borderWidth: 0,
    borderLeftWidth: 6,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 4,
  },
  nextCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextCardLabel: {
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  nextCardTime: {
    fontWeight: '700',
    letterSpacing: 1,
  },
  nextCardDesc: {
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtext: {
    textAlign: 'center',
  },
  addBtnContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
  },
  addBtnText: {
    fontWeight: '700',
  },
});
```

2. **Modal normal:** apagar o bloco `{/* Wizard Modal */}` até o `</Modal>` dele (linhas ~819-1091; âncoras: `      {/* Wizard Modal */}` e `      </Modal>`) e colocar no lugar:

```tsx
      <AlarmFormModal
        visible={modalVisible}
        editingAlarm={editingAlarm}
        onCancel={() => setModalVisible(false)}
        onSave={handleSave}
        onDelete={handleDelete}
      />
```

3. **Modal acessível:** apagar o bloco `{/* Simplified Modal for Accessibility Mode */}` até o `</Modal>` dele (linhas ~491-708) e colocar no lugar o mesmo `<AlarmFormModal ... />` (com a mesma indentação do contexto, 8 espaços).
4. **Estado e funções (linhas ~96-254):**
   - apagar `const [form, setForm] = useState<Omit<Alarm, 'id'>>(EMPTY_FORM);`, `const [wizardStep, setWizardStep] = useState<1 | 2>(1);` e `const minuteInputRef = useRef<TextInput>(null);`;
   - apagar de `// Derived hour/minute from form.time for the split picker` até o fim de `incrementMinute` (linhas ~140-194: `timeHour`/`timeMinute`, `colonMetrics`, `handleHourChange`, `handleMinuteChange`, `handleHourBlur`, `handleMinuteBlur`, `incrementHour`, `incrementMinute`);
   - trocar `openAddModal` e `openEditModal` por:

```tsx
  const openAddModal = () => {
    // Teto técnico do agendador — não é limite de plano.
    if (state.alarms.length >= MAX_ALARMS) {
      showDialog({ title: 'Limite atingido', message: `Você pode ter no máximo ${MAX_ALARMS} alarmes.`, variant: 'warning', buttons: [{ text: 'OK' }] });
      return;
    }
    setEditingAlarm(null);
    setModalVisible(true);
  };
```

```tsx
  const openEditModal = (alarm: Alarm) => {
    setEditingAlarm(alarm);
    setModalVisible(true);
  };
```

   - em `handleSave`, trocar a assinatura `const handleSave = async () => {` por `const handleSave = async (form: AlarmFormValues) => {` (o corpo continua igual: usa `form.time`, `form.repeat`, `form.description`).
5. **Constantes e imports:**
   - apagar `REPEAT_OPTIONS`, `EMPTY_FORM`, `WEEKDAYS` e `TIME_QUICK_PICKS` do topo (linhas ~43-70) — `hoursUntilLabel` fica;
   - imports: apagar `Modal`, `ScrollView`, `Switch`, `TextInput` da lista de `react-native` (confirmar com `grep` que `ScrollView`/`TextInput`/`Modal`/`Switch` não aparecem mais no arquivo), `useRef` do import do React, `FormKeyboardView`, `WheelPicker, wheelColumnMetrics` e `WizardStep`;
   - acrescentar:

```tsx
import { AlarmFormModal } from '@/components/alarm-form-modal';
import { REPEAT_OPTIONS, type AlarmFormValues } from '@/lib/alarm-form';
```

6. Conferir que não sobrou nada órfão:

```bash
pnpm check
grep -n "wizardStep\|WizardStep\|minuteInputRef\|EMPTY_FORM\|WEEKDAYS\|TIME_QUICK_PICKS" "app/(tabs)/alarms.tsx"
```

Esperado: `tsc` limpo e `grep` sem saída.

- [ ] **Passo 6: Ver passar**

```bash
pnpm vitest run tests/alarm-form.test.ts tests/ui-modo-acessivel.test.ts tests/ui-font-minimum.test.ts tests/ui-cores-token.test.ts
pnpm test && pnpm check
```

- [ ] **Passo 7: Conferir no aparelho** — normal: criar e editar um lembrete numa tela só, na ordem da spec; "Excluir lembrete" só na edição; "Personalizado" sem dia desabilita o Salvar; teclado não cobre a barra inferior. Acessível: horário com setas, Som e Vibração funcionam e são gravados. Claro e escuro. Exemplo de regressão: editar o horário e confirmar que o alarme toca na hora nova (a lógica de agendamento não mudou).

- [ ] **Passo 8: Entregar** — arquivos: `lib/alarm-form.ts`, `components/alarm-form-modal.tsx`, `app/(tabs)/alarms.tsx`, `tests/alarm-form.test.ts`.

---

# FASE 3 — Check-in como tipo de alarme

Decisões que esta fase fixa (a spec deixou em aberto; o Pedro pode trocar na revisão):

| Decisão | Valor | Onde |
|---|---|---|
| Atraso de aviso padrão de um check-in **novo** | 15 min | `NEW_CHECKIN_ESCALATE_MINUTES` (Tarefa 18) |
| Atraso do check-in **migrado** do sistema antigo | 30 min (o comportamento que o usuário já tinha) | `MIGRATED_CHECKIN_ESCALATE_MINUTES` (Tarefa 18) |
| Campos `checkin*` de `settings` | **ficam no tipo, marcados `@deprecated`**, até a migração ter rodado em todos os aparelhos. A spec (5.4) mandava removê-los junto; remover agora quebraria a migração de quem ainda não abriu o app depois da atualização | Tarefa 21 |
| Evento antigo `checkin-daily` pendente depois da migração | o `monitoring-job` apaga quando a conta já tem um alarme `kind: 'checkin'` na agenda (senão escalaria "check-in perdido" de um check-in que já virou alarme) | Tarefa 19 |

---

## Tarefa 18: Modelo do check-in e migração do sistema antigo (cliente)

**Branch:** `beta/18-checkin-modelo` · **Mensagem:** `feat(checkin): check-in vira um tipo de alarme (modelo, textos e migração do sistema antigo)`
**Depende de:** Tarefa 17 (o formulário) para a Tarefa 21; esta tarefa só depende da 16.

**Files:**
- Create: `lib/alarm-kind.ts`
- Create: `lib/checkin-migration.ts`
- Create: `components/checkin-migration-initializer.tsx`
- Modify: `lib/app-context.tsx` (interface `Alarm`; `getNextAlarm`; comentário `@deprecated` nos campos `checkin*` de `AppSettings`)
- Modify: `app/_layout.tsx` (import e montagem ao lado do `CheckinInitializer`)
- Modify (consumidores de "remédios", para o check-in não aparecer neles): `components/custom-tab-bar.tsx`, `app/(tabs)/alarms.tsx`, `components/health-report-button.tsx`, `components/health-report-export.tsx`, `app/(caregiver-tabs)/index.tsx`, `app/(caregiver-tabs)/person.tsx`
- Test: `tests/alarm-kind.test.ts`, `tests/checkin-migration.test.ts`

**Interfaces:**
- Produces (todos em `@/lib/alarm-kind`):
  - `type AlarmKind = 'medication' | 'checkin'`; `CHECKIN_ESCALATE_OPTIONS = [5, 10, 15, 30] as const`; `type EscalateMinutes`; `DEFAULT_ESCALATE_MINUTES = 5`, `NEW_CHECKIN_ESCALATE_MINUTES = 15`, `MIGRATED_CHECKIN_ESCALATE_MINUTES = 30`
  - `isCheckinAlarm(a: { kind?: string | null }): boolean`, `medicationAlarms<T>(alarms: T[]): T[]`, `checkinAlarms<T>(alarms: T[]): T[]`
  - `normalizeEscalateMinutes(v: unknown): EscalateMinutes`, `escalateSeconds(alarm: { escalateAfterMinutes?: unknown }): number`
  - `serverEventExtras(alarm): { kind?: 'checkin'; graceMinutes?: number }`
  - `alarmTexts(alarm: { kind?: string | null; description?: string; time: string }): AlarmTexts` com `{ nativeTitle, nativeBody, dismissText, notificationTitle, notificationBody, alarmKitTitle, stopButtonLabel }`
  - `ringCopy(isCheckin: boolean)` com `{ topLabel, fallbackName, countdownLabel, countdownHint, escalatedText, dismissLabel, dismissA11y }`; `buildCheckinSpeechText(time: string | undefined, fromAlarmKit: boolean): string`
- Produces (em `@/lib/checkin-migration`): `buildMigratedCheckin(settings, alarms, id): Alarm | null`, `migrateLegacyCheckin(state, deps): Promise<'skipped' | 'nothing' | 'migrated' | 'failed'>`.
- `Alarm` ganha `kind?: 'medication' | 'checkin'` e `escalateAfterMinutes?: 5 | 10 | 15 | 30`.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/alarm-kind.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  alarmTexts,
  buildCheckinSpeechText,
  checkinAlarms,
  escalateSeconds,
  isCheckinAlarm,
  medicationAlarms,
  normalizeEscalateMinutes,
  ringCopy,
  serverEventExtras,
} from '../lib/alarm-kind';

describe('kind', () => {
  const med = { id: 'm1' };
  const medExplicit = { id: 'm2', kind: 'medication' as const };
  const checkin = { id: 'c1', kind: 'checkin' as const };

  it('alarme sem kind (gravado antes da Fase 3) é remédio', () => {
    expect(isCheckinAlarm(med)).toBe(false);
    expect(medicationAlarms([med, medExplicit, checkin])).toEqual([med, medExplicit]);
    expect(checkinAlarms([med, medExplicit, checkin])).toEqual([checkin]);
  });
});

describe('atraso de aviso', () => {
  it('só aceita 5, 10, 15 ou 30; o resto vira 5', () => {
    expect(normalizeEscalateMinutes(15)).toBe(15);
    expect(normalizeEscalateMinutes(7)).toBe(5);
    expect(normalizeEscalateMinutes(undefined)).toBe(5);
    expect(normalizeEscalateMinutes('30')).toBe(5);
  });
  it('escalateSeconds converte para segundos do countdown', () => {
    expect(escalateSeconds({ escalateAfterMinutes: 10 })).toBe(600);
    expect(escalateSeconds({})).toBe(300);
  });
});

describe('serverEventExtras', () => {
  it('remédio não manda nada extra (servidor assume remédio e 5 min)', () => {
    expect(serverEventExtras({})).toEqual({});
    expect(serverEventExtras({ kind: 'medication', escalateAfterMinutes: 30 })).toEqual({});
  });
  it('check-in manda kind e o atraso', () => {
    expect(serverEventExtras({ kind: 'checkin', escalateAfterMinutes: 10 })).toEqual({
      kind: 'checkin',
      graceMinutes: 10,
    });
    expect(serverEventExtras({ kind: 'checkin' })).toEqual({ kind: 'checkin', graceMinutes: 5 });
  });
});

describe('alarmTexts', () => {
  it('remédio mantém EXATAMENTE os textos de hoje', () => {
    const t = alarmTexts({ description: 'Losartana', time: '08:00' });
    expect(t).toEqual({
      nativeTitle: '⏰ Vigora - Alarme de Medicamento',
      nativeBody: 'Losartana - Toque para confirmar que tomou o medicamento',
      dismissText: 'Dispensar',
      notificationTitle: '⏰ Losartana',
      notificationBody: 'Hora do alarme: 08:00 - Losartana',
      alarmKitTitle: 'Losartana',
      stopButtonLabel: 'Desligar',
    });
  });

  it('remédio sem nome', () => {
    const t = alarmTexts({ time: '08:00' });
    expect(t.nativeBody).toBe('Toque aqui para confirmar que tomou o medicamento');
    expect(t.notificationTitle).toBe('⏰ Alarme');
    expect(t.notificationBody).toBe('Hora do alarme: 08:00');
    expect(t.alarmKitTitle).toBe('Hora do remédio');
  });

  it('check-in pergunta se está tudo bem e o botão é "Estou bem"', () => {
    const t = alarmTexts({ kind: 'checkin', description: 'Check-in', time: '09:00' });
    expect(t.nativeTitle).toBe('💚 Vigora - Check-in');
    expect(t.nativeBody).toBe('Está tudo bem? Toque aqui para confirmar.');
    expect(t.dismissText).toBe('Estou bem');
    expect(t.stopButtonLabel).toBe('Estou bem');
    expect(t.notificationTitle).toBe('💚 Check-in: está tudo bem?');
    expect(t.notificationBody).toBe('Hora do seu check-in: 09:00. Toque para confirmar que está tudo bem.');
    expect(t.alarmKitTitle).toBe('Check-in: está tudo bem?');
  });
});

describe('ringCopy', () => {
  it('remédio mantém os textos de hoje', () => {
    expect(ringCopy(false)).toEqual({
      topLabel: 'ALARME',
      fallbackName: 'Alarme',
      countdownLabel: 'Mensagem de emergência em',
      countdownHint: 'Toque em "Desligar" para cancelar o envio',
      escalatedText: 'Mensagem de emergência enviada para seus contatos',
      dismissLabel: 'Desligar Alarme',
      dismissA11y: 'Desligar alarme',
    });
  });
  it('check-in', () => {
    const c = ringCopy(true);
    expect(c.topLabel).toBe('CHECK-IN');
    expect(c.fallbackName).toBe('Está tudo bem?');
    expect(c.dismissLabel).toBe('Estou bem');
    expect(c.countdownHint).toContain('Estou bem');
  });
});

describe('buildCheckinSpeechText', () => {
  it('pede para tocar em "Estou bem"', () => {
    const text = buildCheckinSpeechText('09:00', false);
    expect(text).toContain('Hora do seu check-in');
    expect(text).toContain('Toque em Estou bem');
  });
  it('no AlarmKit o botão já foi apertado', () => {
    const text = buildCheckinSpeechText('09:00', true);
    expect(text).not.toContain('Toque em Estou bem');
    expect(text).toContain('Que bom que você está bem');
  });
});
```

Criar `tests/checkin-migration.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMigratedCheckin, migrateLegacyCheckin, type MigrationDeps } from '../lib/checkin-migration';
import type { Alarm } from '../lib/app-context';

const medication: Alarm = {
  id: 'm1', time: '08:00', description: 'Losartana', enabled: true,
  repeat: 'daily', customDays: [], sound: true, vibration: true,
};

function deps(over: Partial<MigrationDeps> = {}): MigrationDeps & Record<string, ReturnType<typeof vi.fn>> {
  return {
    isDone: vi.fn(async () => false),
    markDone: vi.fn(async () => undefined),
    scheduleAlarm: vi.fn(async (a: Alarm) => ({ ...a, nativeAlarmUids: ['u'] })),
    addAlarm: vi.fn(),
    disableLegacy: vi.fn(),
    newId: vi.fn(() => 'new-id'),
    ...over,
  } as never;
}

const enabled = { checkinEnabled: true, checkinTime: '09:30' };

describe('buildMigratedCheckin', () => {
  it('cria um alarme diário de check-in no horário antigo, com aviso em 30 min', () => {
    expect(buildMigratedCheckin(enabled, [medication], 'abc')).toEqual({
      id: 'abc', time: '09:30', description: 'Check-in', enabled: true,
      repeat: 'daily', customDays: [], sound: true, vibration: true,
      kind: 'checkin', escalateAfterMinutes: 30,
    });
  });
  it('check-in desligado não cria nada', () => {
    expect(buildMigratedCheckin({ checkinEnabled: false, checkinTime: '09:30' }, [], 'abc')).toBeNull();
  });
  it('já existe um check-in: não duplica', () => {
    const existing = { ...medication, id: 'c1', kind: 'checkin' as const };
    expect(buildMigratedCheckin(enabled, [existing], 'abc')).toBeNull();
  });
  it('horário inválido não cria nada; hora de um dígito é completada', () => {
    expect(buildMigratedCheckin({ checkinEnabled: true, checkinTime: 'lixo' }, [], 'abc')).toBeNull();
    expect(buildMigratedCheckin({ checkinEnabled: true, checkinTime: '9:05' }, [], 'abc')?.time).toBe('09:05');
  });
});

describe('migrateLegacyCheckin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('check-in ligado: cria, agenda, desarma o sistema antigo e marca como feito', async () => {
    const d = deps();
    const outcome = await migrateLegacyCheckin({ alarms: [medication], settings: enabled }, d);

    expect(outcome).toBe('migrated');
    expect(d.scheduleAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm.mock.calls[0][0]).toMatchObject({ kind: 'checkin', time: '09:30', nativeAlarmUids: ['u'] });
    expect(d.disableLegacy).toHaveBeenCalledTimes(1);
    expect(d.markDone).toHaveBeenCalledTimes(1);
  });

  it('check-in desligado: nada a criar, mas marca como feito', async () => {
    const d = deps();
    const outcome = await migrateLegacyCheckin(
      { alarms: [], settings: { checkinEnabled: false, checkinTime: '09:00' } },
      d
    );
    expect(outcome).toBe('nothing');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
    expect(d.markDone).toHaveBeenCalledTimes(1);
  });

  it('já migrado (interrompido no meio): não duplica, desarma o antigo e marca', async () => {
    const d = deps();
    const existing = { ...medication, id: 'c1', kind: 'checkin' as const };
    const outcome = await migrateLegacyCheckin({ alarms: [existing], settings: enabled }, d);
    expect(outcome).toBe('nothing');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).toHaveBeenCalledTimes(1);
    expect(d.markDone).toHaveBeenCalledTimes(1);
  });

  it('já feito antes: não faz nada', async () => {
    const d = deps({ isDone: vi.fn(async () => true) });
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('skipped');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.markDone).not.toHaveBeenCalled();
  });

  it('duas chamadas ao mesmo tempo criam UM alarme só', async () => {
    const d = deps();
    const state = { alarms: [medication], settings: enabled };
    const [a, b] = await Promise.all([migrateLegacyCheckin(state, d), migrateLegacyCheckin(state, d)]);
    expect(a).toBe('migrated');
    expect(b).toBe('migrated');
    expect(d.scheduleAlarm).toHaveBeenCalledTimes(1);
    expect(d.addAlarm).toHaveBeenCalledTimes(1);
  });

  it('falha ao agendar: o sistema antigo continua valendo e tenta de novo na próxima abertura', async () => {
    const d = deps({ scheduleAlarm: vi.fn(async () => { throw new Error('sistema recusou'); }) });
    expect(await migrateLegacyCheckin({ alarms: [], settings: enabled }, d)).toBe('failed');
    expect(d.addAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
    expect(d.markDone).not.toHaveBeenCalled();
  });

  it('sem espaço (24 alarmes): não migra e o sistema antigo continua valendo', async () => {
    const d = deps();
    const full = Array.from({ length: 24 }, (_, i) => ({ ...medication, id: `m${i}` }));
    expect(await migrateLegacyCheckin({ alarms: full, settings: enabled }, d)).toBe('failed');
    expect(d.scheduleAlarm).not.toHaveBeenCalled();
    expect(d.disableLegacy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/alarm-kind.test.ts tests/checkin-migration.test.ts
```

Esperado: FAIL (módulos não existem).

- [ ] **Passo 3: `lib/alarm-kind.ts`**

```ts
/**
 * alarm-kind.ts
 *
 * O check-in "Está tudo bem?" é um alarme como os de remédio (mesmo agendador,
 * mesma tela de alarme, mesmo caminho de escalação), distinguido por `kind`.
 * Alarme SEM `kind` é remédio: tudo que já está gravado no aparelho e no
 * servidor antes da Fase 3 continua valendo.
 *
 * Aqui ficam as regras puras: filtros por tipo, o atraso de aviso e os textos
 * que mudam de um tipo para o outro. Os textos de REMÉDIO são exatamente os que
 * já existiam (testes travam isso).
 */

export type AlarmKind = 'medication' | 'checkin';

export const CHECKIN_ESCALATE_OPTIONS = [5, 10, 15, 30] as const;
export type EscalateMinutes = (typeof CHECKIN_ESCALATE_OPTIONS)[number];

/** Quando o campo está ausente ou inválido. */
export const DEFAULT_ESCALATE_MINUTES: EscalateMinutes = 5;
/** Padrão de um check-in NOVO criado pelo usuário. */
export const NEW_CHECKIN_ESCALATE_MINUTES: EscalateMinutes = 15;
/** Check-in migrado do sistema antigo: a janela de 30 min que o usuário já tinha. */
export const MIGRATED_CHECKIN_ESCALATE_MINUTES: EscalateMinutes = 30;

type KindLike = { kind?: string | null };

export const isCheckinAlarm = (a: KindLike): boolean => a.kind === 'checkin';
export const medicationAlarms = <T extends KindLike>(alarms: T[]): T[] =>
  alarms.filter((a) => !isCheckinAlarm(a));
export const checkinAlarms = <T extends KindLike>(alarms: T[]): T[] =>
  alarms.filter(isCheckinAlarm);

export function normalizeEscalateMinutes(value: unknown): EscalateMinutes {
  return (CHECKIN_ESCALATE_OPTIONS as readonly unknown[]).includes(value)
    ? (value as EscalateMinutes)
    : DEFAULT_ESCALATE_MINUTES;
}

/** Segundos da contagem da alarm-ring para um check-in (remédio usa `settings.timerDuration`). */
export function escalateSeconds(alarm: { escalateAfterMinutes?: unknown }): number {
  return normalizeEscalateMinutes(alarm.escalateAfterMinutes) * 60;
}

/** Campos extras do evento pré-registrado no servidor (`monitoring.createEvent`). */
export function serverEventExtras(
  alarm: KindLike & { escalateAfterMinutes?: unknown }
): { kind?: 'checkin'; graceMinutes?: number } {
  return isCheckinAlarm(alarm)
    ? { kind: 'checkin', graceMinutes: normalizeEscalateMinutes(alarm.escalateAfterMinutes) }
    : {};
}

export interface AlarmTexts {
  /** Android: título da notificação do serviço nativo. */
  nativeTitle: string;
  nativeBody: string;
  /** Android: texto do botão "Dispensar" da notificação. */
  dismissText: string;
  /** iOS < 26 / web: notificação do expo-notifications. */
  notificationTitle: string;
  notificationBody: string;
  /** iOS 26+: título do alarme do AlarmKit. */
  alarmKitTitle: string;
  /** iOS 26+: rótulo do botão de parar do AlarmKit (é a confirmação). */
  stopButtonLabel: string;
}

export function alarmTexts(alarm: {
  kind?: string | null;
  description?: string;
  time: string;
}): AlarmTexts {
  if (isCheckinAlarm(alarm)) {
    return {
      nativeTitle: '💚 Vigora - Check-in',
      nativeBody: 'Está tudo bem? Toque aqui para confirmar.',
      dismissText: 'Estou bem',
      notificationTitle: '💚 Check-in: está tudo bem?',
      notificationBody: `Hora do seu check-in: ${alarm.time}. Toque para confirmar que está tudo bem.`,
      alarmKitTitle: 'Check-in: está tudo bem?',
      stopButtonLabel: 'Estou bem',
    };
  }
  const description = alarm.description;
  return {
    nativeTitle: '⏰ Vigora - Alarme de Medicamento',
    nativeBody: description
      ? `${description} - Toque para confirmar que tomou o medicamento`
      : 'Toque aqui para confirmar que tomou o medicamento',
    dismissText: 'Dispensar',
    notificationTitle: `⏰ ${description || 'Alarme'}`,
    notificationBody: description
      ? `Hora do alarme: ${alarm.time} - ${description}`
      : `Hora do alarme: ${alarm.time}`,
    alarmKitTitle: description || 'Hora do remédio',
    stopButtonLabel: 'Desligar',
  };
}

const MEDICATION_RING_COPY = {
  topLabel: 'ALARME',
  fallbackName: 'Alarme',
  countdownLabel: 'Mensagem de emergência em',
  countdownHint: 'Toque em "Desligar" para cancelar o envio',
  escalatedText: 'Mensagem de emergência enviada para seus contatos',
  dismissLabel: 'Desligar Alarme',
  dismissA11y: 'Desligar alarme',
} as const;

const CHECKIN_RING_COPY = {
  topLabel: 'CHECK-IN',
  fallbackName: 'Está tudo bem?',
  countdownLabel: 'Aviso aos seus contatos em',
  countdownHint: 'Toque em "Estou bem" para cancelar o aviso',
  escalatedText: 'Seus contatos foram avisados',
  dismissLabel: 'Estou bem',
  dismissA11y: 'Estou bem, desligar o alarme',
} as const;

/** Textos da tela de alarme (alarm-ring) por tipo. */
export function ringCopy(isCheckin: boolean) {
  return isCheckin ? CHECKIN_RING_COPY : MEDICATION_RING_COPY;
}

/** Fala do check-in (o texto de remédio continua em alarm-ring.tsx). */
export function buildCheckinSpeechText(time: string | undefined, fromAlarmKit: boolean): string {
  const parts = ['Atenção! Hora do seu check-in.'];
  if (time) parts.push(`Horário: ${time.replace(':', ' horas e ')} minutos.`);
  parts.push(
    fromAlarmKit
      ? 'Que bom que você está bem.'
      : 'Toque em Estou bem para confirmar que está tudo bem.'
  );
  return parts.join(' ');
}
```

- [ ] **Passo 4: Campos no `Alarm`, `getNextAlarm`, depreciação**

Em `lib/app-context.tsx`:

1. Na interface `Alarm`, depois de `nativeAlarmUids?: string[]; // Native AlarmManager UIDs (Android only)` acrescentar:

```ts
  /** 'checkin' = "Está tudo bem?"; ausente = remédio (alarmes gravados antes da Fase 3). */
  kind?: 'medication' | 'checkin';
  /** Check-in: minutos até avisar contatos e cuidadores se ninguém responder. */
  escalateAfterMinutes?: 5 | 10 | 15 | 30;
```

2. Em `getNextAlarm`, trocar `const enabled = alarms.filter((a) => a.enabled);` por `const enabled = alarms.filter((a) => a.enabled && a.kind !== 'checkin');` (o card "Próximo remédio" não mostra check-in).
3. Nos três campos `checkin*` de `AppSettings`, trocar os comentários por `/** @deprecated Fase 3: o check-in virou um alarme (kind 'checkin'). Fica só para a migração (lib/checkin-migration.ts) ler o que o usuário tinha. */` (um comentário por campo, mantendo `checkinEnabled`, `checkinTime`, `checkinWindowMinutes`).

- [ ] **Passo 5: `lib/checkin-migration.ts`**

```ts
/**
 * checkin-migration.ts
 *
 * Migra o check-in diário antigo (notificações `checkin_prompt`/`checkin_timeout`
 * + `settings.checkin*`) para um alarme `kind: 'checkin'`, uma vez por conta.
 *
 * Regras:
 *  - Só migra quem tinha o check-in LIGADO; desligado vira "nada a fazer".
 *  - Idempotente: se já existe um check-in na lista (migração interrompida),
 *    não cria outro — só desarma o sistema antigo e marca como feito.
 *  - Falhou agendar (ou sem espaço nos 24 alarmes): o sistema antigo CONTINUA
 *    valendo e a próxima abertura tenta de novo. Ficar sem check-in é pior do
 *    que ter dois por um dia.
 *  - Duas chamadas ao mesmo tempo (duas aberturas do app, remontagem do
 *    componente) compartilham a mesma execução: um alarme só.
 */
import type { Alarm } from '@/lib/app-context';
import { MAX_ALARMS } from '@/components/pro-limits';
import { MIGRATED_CHECKIN_ESCALATE_MINUTES, checkinAlarms } from '@/lib/alarm-kind';

export interface LegacyCheckinSettings {
  checkinEnabled?: boolean;
  checkinTime?: string;
}

export interface MigrationDeps {
  isDone(): Promise<boolean>;
  markDone(): Promise<void>;
  scheduleAlarm(alarm: Alarm): Promise<Alarm>;
  addAlarm(alarm: Alarm): void;
  /** Desliga `settings.checkinEnabled`: o CheckinInitializer antigo se desarma sozinho. */
  disableLegacy(): void;
  newId(): string;
}

export type MigrationOutcome = 'skipped' | 'nothing' | 'migrated' | 'failed';

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function buildMigratedCheckin(
  settings: LegacyCheckinSettings,
  alarms: Alarm[],
  id: string
): Alarm | null {
  if (!settings.checkinEnabled) return null;
  if (checkinAlarms(alarms).length > 0) return null;
  const time = settings.checkinTime ?? '';
  if (!TIME_RE.test(time)) return null;
  return {
    id,
    time: time.padStart(5, '0'),
    description: 'Check-in',
    enabled: true,
    repeat: 'daily',
    customDays: [],
    sound: true,
    vibration: true,
    kind: 'checkin',
    escalateAfterMinutes: MIGRATED_CHECKIN_ESCALATE_MINUTES,
  };
}

let inFlight: Promise<MigrationOutcome> | null = null;

export function migrateLegacyCheckin(
  state: { alarms: Alarm[]; settings: LegacyCheckinSettings },
  deps: MigrationDeps
): Promise<MigrationOutcome> {
  if (inFlight) return inFlight;
  inFlight = run(state, deps).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(
  state: { alarms: Alarm[]; settings: LegacyCheckinSettings },
  deps: MigrationDeps
): Promise<MigrationOutcome> {
  if (await deps.isDone()) return 'skipped';

  const alarm = buildMigratedCheckin(state.settings, state.alarms, deps.newId());
  if (alarm) {
    if (state.alarms.length >= MAX_ALARMS) {
      console.warn('[CheckinMigration] 24 alarmes já cadastrados — o check-in antigo continua valendo.');
      return 'failed';
    }
    try {
      deps.addAlarm(await deps.scheduleAlarm(alarm));
    } catch (error) {
      console.error('[CheckinMigration] não foi possível agendar o check-in migrado:', error);
      return 'failed';
    }
  }
  if (state.settings.checkinEnabled) deps.disableLegacy();
  await deps.markDone();
  return alarm ? 'migrated' : 'nothing';
}
```

- [ ] **Passo 6: Componente que roda a migração**

Criar `components/checkin-migration-initializer.tsx`:

```tsx
/**
 * CheckinMigrationInitializer
 *
 * Roda a migração do check-in antigo para alarme uma vez por conta (monitorado),
 * depois que o estado local carregou. Ver lib/checkin-migration.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect } from 'react';
import * as Auth from '@/lib/_core/auth';
import { scheduleFullAlarm } from '@/lib/alarm-sync';
import { generateId, useAppContext } from '@/lib/app-context';
import { migrateLegacyCheckin } from '@/lib/checkin-migration';

const DONE_KEY_PREFIX = 'vigora_checkin_migrated_v1:';

export function CheckinMigrationInitializer() {
  const { state, dispatch } = useAppContext();

  useEffect(() => {
    if (state.isLoading) return;
    (async () => {
      const user = await Auth.getUserInfo();
      // Cuidador não tem alarmes; sem login não há conta cujo estado migrar.
      if (!user?.openId || user.userType !== 'monitored') return;
      const doneKey = `${DONE_KEY_PREFIX}${user.openId}`;
      await migrateLegacyCheckin(
        { alarms: state.alarms, settings: state.settings },
        {
          isDone: async () => (await AsyncStorage.getItem(doneKey)) === '1',
          markDone: () => AsyncStorage.setItem(doneKey, '1'),
          scheduleAlarm: scheduleFullAlarm,
          addAlarm: (alarm) => dispatch({ type: 'ADD_ALARM', payload: alarm }),
          disableLegacy: () => dispatch({ type: 'UPDATE_SETTINGS', payload: { checkinEnabled: false } }),
          newId: generateId,
        }
      );
    })().catch((error) => console.warn('[CheckinMigration] falhou:', error));
    // Só quando o estado termina de carregar (inclusive na troca de conta).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isLoading]);

  return null;
}
```

Em `app/_layout.tsx`: acrescentar `import { CheckinMigrationInitializer } from '@/components/checkin-migration-initializer';` ao lado do import do `CheckinInitializer` (linha 39) e `<CheckinMigrationInitializer />` logo depois de `<CheckinInitializer />` (linha ~385).

- [ ] **Passo 7: Check-in não aparece como remédio**

Aplicar `medicationAlarms` (de `@/lib/alarm-kind`) nos consumidores de "remédios":

| Arquivo | Trocar | Por |
|---|---|---|
| `components/custom-tab-bar.tsx:32` | `state.alarms.filter((a) => a.enabled).length` | `medicationAlarms(state.alarms).filter((a) => a.enabled).length` |
| `app/(tabs)/alarms.tsx` | `const sortedAlarms = [...state.alarms].sort(` | `const sortedAlarms = [...medicationAlarms(state.alarms)].sort(` |
| `app/(tabs)/alarms.tsx` (modo acessível) | `{state.alarms.length} lembrete(s) configurado(s)` | `{sortedAlarms.length} lembrete(s) configurado(s)` |
| `components/health-report-button.tsx` | `alarms: state.alarms,` | `alarms: medicationAlarms(state.alarms),` |
| `components/health-report-export.tsx` | `alarms: state.alarms,` | `alarms: medicationAlarms(state.alarms),` |
| `app/(caregiver-tabs)/index.tsx:51` | `const alarms = (data?.alarms ?? []) as Alarm[];` | `const alarms = medicationAlarms((data?.alarms ?? []) as Alarm[]);` |
| `app/(caregiver-tabs)/person.tsx:88` | `((data?.alarms ?? []) as Alarm[]).filter((a) => a.enabled)` | `medicationAlarms((data?.alarms ?? []) as Alarm[]).filter((a) => a.enabled)` |

Cada arquivo ganha `import { medicationAlarms } from '@/lib/alarm-kind';`. Fica de fora de propósito: `data-export-button` (a exportação leva tudo), `alarm-sync-initializer` e `alarm-notification-handler` (o check-in toca como qualquer alarme) e o contador "x/24" das Configurações (soma total).

- [ ] **Passo 8: Ver passar**

```bash
pnpm vitest run tests/alarm-kind.test.ts tests/checkin-migration.test.ts
pnpm test && pnpm check
```

Esperado: verde.

- [ ] **Passo 9: Conferir no aparelho** — com check-in antigo ligado (build anterior → atualização): na primeira abertura aparece um alarme de check-in diário no mesmo horário; o sistema antigo se desarma (as notificações `checkin_prompt`/`checkin_timeout` somem em `adb shell dumpsys notification`) e o check-in toca **uma vez só** no horário (já como alarme). Ele ainda não aparece na lista de Remédios (a tela de Check-in chega na Tarefa 21).

- [ ] **Passo 10: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 19: Servidor: tipo do evento e prazo por evento

**Branch:** `beta/19-checkin-servidor` · **Mensagem:** `feat(monitoring): eventos com tipo e atraso de aviso por evento; check-in migrado não escala o evento antigo`
**Depende de:** Tarefa 6 (a migração `0015` já existe).

**Files:**
- Modify: `drizzle/schema.ts` (`alarmEvents`)
- Create: `drizzle/0016_alarm_events_kind_grace.sql` e `drizzle/meta/*` (gerados)
- Create: `server/_core/event-kind.ts`
- Modify: `server/db-monitoring.ts` (`createAlarmEvent`, `updateAlarmEventStatusByAlarmId`, `getMissedCheckinEvents`, `getMissedMedicationEvents`)
- Modify: `server/routers-monitoring.ts` (`createEvent`; `pushMissedAlarmToCaregivers`; `confirmEvent`)
- Modify: `server/monitoring-job.ts` (Passo 1, Passos 3 e 4)
- Modify: `server/routers-links.ts` (`getMonitoredAlerts`: eventos devolvem `kind`)
- Test: `tests/event-kind.test.ts`, `tests/monitoring-job.checkin-alarme.test.ts`, `tests/monitoring.create-event-kind.test.ts`

**Interfaces:**
- Produces (em `server/_core/event-kind.ts`): `LEGACY_CHECKIN_ALARM_ID = "checkin-daily"`, `DEFAULT_GRACE_MINUTES = 5`, `isCheckinEvent(e: { alarmId: string; kind?: string | null }): boolean`, `eventGraceMinutes(e: { graceMinutes?: number | null }, fallback?: number): number`, `isEventExpired(e: { scheduledAt: Date; graceMinutes?: number | null }, nowMs: number, fallback?: number): boolean`, `agendaHasCheckinAlarm(alarms: unknown): boolean`.
- `monitoring.createEvent` aceita `kind?: "medication" | "checkin" | null` e `graceMinutes?: 5 | 10 | 15 | 30 | null`.
- `getMissedCheckinEvents(lookbackHours)` e `getMissedMedicationEvents(lookbackHours)` perdem o primeiro parâmetro (o id fixo); a regra "é check-in" agora é `kind = 'checkin' OU alarmId = 'checkin-daily'`.
- `updateAlarmEventStatusByAlarmId` devolve `{ id, timezone, kind }`.

Prazo do evento = `scheduledAt + (graceMinutes ?? 5)`. No check-in, `scheduledAt` passa a ser a hora em que ele **toca** (o prazo do sistema antigo era hora + janela).

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/event-kind.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  agendaHasCheckinAlarm,
  eventGraceMinutes,
  isCheckinEvent,
  isEventExpired,
} from "../server/_core/event-kind";

describe("isCheckinEvent", () => {
  it("kind 'checkin' ou o id fixo do sistema antigo", () => {
    expect(isCheckinEvent({ alarmId: "x", kind: "checkin" })).toBe(true);
    expect(isCheckinEvent({ alarmId: "checkin-daily" })).toBe(true);
    expect(isCheckinEvent({ alarmId: "x", kind: "medication" })).toBe(false);
    expect(isCheckinEvent({ alarmId: "x", kind: null })).toBe(false);
  });
});

describe("eventGraceMinutes / isEventExpired", () => {
  const T0 = new Date("2026-10-02T12:00:00Z");
  const at = (min: number) => T0.getTime() + min * 60_000;

  it("sem graceMinutes vale o padrão de 5 min", () => {
    expect(eventGraceMinutes({})).toBe(5);
    expect(eventGraceMinutes({ graceMinutes: null })).toBe(5);
    expect(eventGraceMinutes({ graceMinutes: 0 })).toBe(5);
    expect(eventGraceMinutes({ graceMinutes: -3 })).toBe(5);
  });

  it("cada evento tem o seu prazo", () => {
    expect(isEventExpired({ scheduledAt: T0 }, at(4))).toBe(false);
    expect(isEventExpired({ scheduledAt: T0 }, at(5))).toBe(true);
    expect(isEventExpired({ scheduledAt: T0, graceMinutes: 15 }, at(10))).toBe(false);
    expect(isEventExpired({ scheduledAt: T0, graceMinutes: 15 }, at(15))).toBe(true);
  });
});

describe("agendaHasCheckinAlarm", () => {
  it("só com alarme kind 'checkin' na lista", () => {
    expect(agendaHasCheckinAlarm([{ id: "a", kind: "checkin" }])).toBe(true);
    expect(agendaHasCheckinAlarm([{ id: "a" }, { id: "b", kind: "medication" }])).toBe(false);
    expect(agendaHasCheckinAlarm([])).toBe(false);
  });
  it("agenda ilegível não prova nada", () => {
    expect(agendaHasCheckinAlarm(undefined)).toBe(false);
    expect(agendaHasCheckinAlarm("lixo")).toBe(false);
    expect(agendaHasCheckinAlarm([null, 42])).toBe(false);
  });
});
```

Criar `tests/monitoring-job.checkin-alarme.test.ts` (mesmos mocks do `monitoring-job.alarme-cancelado.test.ts`):

```ts
/**
 * Fase 3: o check-in é um alarme com prazo PRÓPRIO por evento (graceMinutes) e
 * o evento do sistema antigo ('checkin-daily') não escala depois da migração.
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
  purgeStaleData: vi.fn(async () => ({ alarmEvents: 0, alarmChanges: 0, warningLog: 0, locationsCleared: 0 })),
}));
vi.mock("../server/db", () => ({
  getUserData: vi.fn(async () => undefined),
  getUserByOpenId: vi.fn(async () => undefined),
}));
vi.mock("../server/whatsapp", () => ({
  isWhatsAppApiConfigured: vi.fn(() => true),
  sendWhatsAppMessage: vi.fn(async () => ({ success: true })),
}));
vi.mock("../server/db-links", () => ({ getActiveCaregiversForMonitored: vi.fn(async () => []) }));
vi.mock("../server/db-push", () => ({ getPushTokensForOpenIds: vi.fn(async () => []) }));
vi.mock("../server/push", () => ({ sendExpoPush: vi.fn(async () => 1) }));

import { runMonitoringJob } from "../server/monitoring-job";
import * as db from "../server/db-monitoring";
import * as accountDb from "../server/db";

const minAgo = (m: number) => new Date(Date.now() - m * 60_000);

function event(over: Record<string, unknown> = {}) {
  const scheduledAt = (over.scheduledAt as Date) ?? minAgo(20);
  return {
    id: 21,
    openId: "user-1",
    alarmId: "11111111-1111-4111-8111-111111111111",
    alarmDescription: "Check-in",
    kind: "checkin",
    graceMinutes: null,
    scheduledAt,
    status: "pending",
    warningSent: false,
    resolvedAt: null,
    createdAt: scheduledAt,
    ...over,
  } as never;
}

const vivo = (scheduledAt: Date) =>
  ({ openId: "user-1", lastSeenAt: new Date(scheduledAt.getTime() + 60_000), lastLocation: null, lastLocationAt: null, lastDeviceId: "d", appVersion: null }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(accountDb.getUserData).mockResolvedValue({
    openId: "user-1",
    alarms: [{ id: "11111111-1111-4111-8111-111111111111", enabled: true, kind: "checkin" }],
  } as never);
});

describe("Passo 1 — prazo por evento", () => {
  it("graceMinutes 15: com 10 min ainda não venceu", async () => {
    const e = event({ graceMinutes: 15, scheduledAt: minAgo(10) });
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([e]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(10)));

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
    expect(db.deleteAlarmEvent).not.toHaveBeenCalled();
  });

  it("graceMinutes 15: com 16 min venceu e vira 'missed' (conta viva)", async () => {
    const e = event({ graceMinutes: 15, scheduledAt: minAgo(16) });
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([e]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(16)));

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(21, "missed");
  });

  it("sem graceMinutes (remédio) vence aos 5 min como sempre", async () => {
    const e = event({ kind: null, graceMinutes: null, scheduledAt: minAgo(6) });
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([e]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(6)));

    await runMonitoringJob();

    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(21, "missed");
  });
});

describe("Passo 1 — check-in como alarme passa pela checagem de agenda", () => {
  it("check-in desativado na agenda: evento apagado, não escala", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue({
      openId: "user-1",
      alarms: [{ id: "11111111-1111-4111-8111-111111111111", enabled: false, kind: "checkin" }],
    } as never);
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([event()]);

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).toHaveBeenCalledWith(21);
    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
  });
});

describe("Passo 1 — evento do check-in antigo depois da migração", () => {
  const legacy = () => event({ alarmId: "checkin-daily", kind: null });

  it("conta já tem alarme de check-in: o evento antigo é apagado", async () => {
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([legacy()]);

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).toHaveBeenCalledWith(21);
    expect(db.updateAlarmEventStatus).not.toHaveBeenCalled();
  });

  it("conta ainda no sistema antigo (sem alarme de check-in): escala como antes", async () => {
    vi.mocked(accountDb.getUserData).mockResolvedValue({ openId: "user-1", alarms: [] } as never);
    vi.mocked(db.getExpiredPendingEvents).mockResolvedValue([legacy()]);
    vi.mocked(db.getAccountLiveness).mockResolvedValue(vivo(minAgo(20)));

    await runMonitoringJob();

    expect(db.deleteAlarmEvent).not.toHaveBeenCalled();
    expect(db.updateAlarmEventStatus).toHaveBeenCalledWith(21, "missed");
  });
});
```

Criar `tests/monitoring.create-event-kind.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

let transitionResult: { id: number; timezone?: string | null; kind?: string | null } | null = { id: 1 };

vi.mock("../server/db-monitoring", () => ({
  recordHeartbeat: vi.fn(async () => undefined),
  getAccountLiveness: vi.fn(async () => null),
  createAlarmEvent: vi.fn(async () => 1),
  updateAlarmEventStatusByAlarmId: vi.fn(async () => transitionResult),
  getAlarmEventHistory: vi.fn(async () => []),
  getWarningHistory: vi.fn(async () => []),
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

import { appRouter } from "../server/routers";
import * as dbMon from "../server/db-monitoring";
import * as push from "../server/push";

function makeCaller() {
  const user = {
    id: 1, openId: "vovo", name: "Vô", email: "v@x.com", phone: null, userType: "monitored",
    birthDate: null, bloodType: null, loginMethod: "google", role: "user",
    createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
  } as User;
  const ctx: TrpcContext = {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

const scheduledAt = new Date().toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  transitionResult = { id: 1 };
});

describe("monitoring.createEvent — kind e graceMinutes", () => {
  it("repassa kind e graceMinutes ao banco", async () => {
    await makeCaller().monitoring.createEvent({
      alarmId: "a1", alarmDescription: "Check-in", scheduledAt, kind: "checkin", graceMinutes: 15,
    });
    expect(dbMon.createAlarmEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "checkin", graceMinutes: 15 })
    );
  });

  it("clientes antigos (sem os campos) continuam funcionando", async () => {
    await makeCaller().monitoring.createEvent({ alarmId: "a1", alarmDescription: "x", scheduledAt });
    expect(dbMon.createAlarmEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: null, graceMinutes: null })
    );
  });

  it("recusa atraso fora de 5, 10, 15 e 30 e tipo desconhecido", async () => {
    const caller = makeCaller();
    await expect(
      caller.monitoring.createEvent({ alarmId: "a", alarmDescription: "x", scheduledAt, graceMinutes: 7 as never })
    ).rejects.toThrow();
    await expect(
      caller.monitoring.createEvent({ alarmId: "a", alarmDescription: "x", scheduledAt, kind: "outro" as never })
    ).rejects.toThrow();
  });
});

describe("confirmEvent — push por tipo do evento", () => {
  it("check-in novo (kind) perdido => 'missed_checkin', mesmo com id de alarme comum", async () => {
    transitionResult = { id: 1, kind: "checkin" };
    await makeCaller().monitoring.confirmEvent({ alarmId: "uuid-qualquer", scheduledAt, status: "missed" });
    const [, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(message.data).toMatchObject({ type: "missed_checkin" });
    expect(message.title).toMatch(/Check-in/i);
  });

  it("remédio perdido continua 'missed_alarm'", async () => {
    transitionResult = { id: 1, kind: null };
    await makeCaller().monitoring.confirmEvent({ alarmId: "uuid-qualquer", scheduledAt, status: "missed" });
    const [, message] = vi.mocked(push.sendExpoPush).mock.calls[0];
    expect(message.data).toMatchObject({ type: "missed_alarm" });
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/event-kind.test.ts tests/monitoring-job.checkin-alarme.test.ts tests/monitoring.create-event-kind.test.ts
```

- [ ] **Passo 3: Colunas e migração**

Em `drizzle/schema.ts`, na tabela `alarmEvents`, depois de `timezone: varchar("timezone", { length: 64 }),` e seu comentário, acrescentar:

```ts
    /**
     * Tipo do evento: 'checkin' ("Está tudo bem?") ou nulo = remédio. Nulo nas
     * linhas anteriores à coluna; o check-in ANTIGO é reconhecido pelo
     * alarmId 'checkin-daily'.
     */
    kind: varchar("kind", { length: 16 }),
    /**
     * Minutos até o evento vencer sem resposta (5, 10, 15 ou 30). Nulo = 5 (o
     * grace padrão do monitoring-job). O check-in define o seu.
     */
    graceMinutes: int("graceMinutes"),
```

```bash
DATABASE_URL="mysql://u:p@localhost:3306/vigora" pnpm exec drizzle-kit generate --name alarm_events_kind_grace
grep -n "kind\|graceMinutes" drizzle/0016_alarm_events_kind_grace.sql
```

Esperado: dois `ALTER TABLE \`alarm_events\` ADD ...` (colunas nulas, sem default → seguras para linhas existentes).

- [ ] **Passo 4: Regras puras**

Criar `server/_core/event-kind.ts`:

```ts
/**
 * event-kind.ts
 *
 * Regras puras sobre o tipo e o prazo de um evento de alarme.
 *
 * O check-in virou um alarme (Fase 3): seu evento tem `kind = 'checkin'` e o
 * prazo PRÓPRIO `graceMinutes`. O check-in ANTIGO usava o alarmId fixo
 * 'checkin-daily' e o prazo já embutido em scheduledAt.
 */

export const LEGACY_CHECKIN_ALARM_ID = "checkin-daily";
export const DEFAULT_GRACE_MINUTES = 5;

export function isCheckinEvent(e: { alarmId: string; kind?: string | null }): boolean {
  return e.kind === "checkin" || e.alarmId === LEGACY_CHECKIN_ALARM_ID;
}

export function eventGraceMinutes(
  e: { graceMinutes?: number | null },
  fallback: number = DEFAULT_GRACE_MINUTES
): number {
  return typeof e.graceMinutes === "number" && Number.isFinite(e.graceMinutes) && e.graceMinutes > 0
    ? e.graceMinutes
    : fallback;
}

/** O evento já passou do prazo de resposta (scheduledAt + grace do evento)? */
export function isEventExpired(
  e: { scheduledAt: Date; graceMinutes?: number | null },
  nowMs: number,
  fallback: number = DEFAULT_GRACE_MINUTES
): boolean {
  return nowMs >= e.scheduledAt.getTime() + eventGraceMinutes(e, fallback) * 60_000;
}

/**
 * A agenda da conta já tem um alarme de check-in? Prova positiva de que o
 * check-in migrou para o sistema novo (o evento 'checkin-daily' pendente do
 * sistema antigo não é mais esperado).
 */
export function agendaHasCheckinAlarm(alarms: unknown): boolean {
  return (
    Array.isArray(alarms) &&
    alarms.some((a) => !!a && typeof a === "object" && (a as { kind?: unknown }).kind === "checkin")
  );
}
```

- [ ] **Passo 5: Banco**

Em `server/db-monitoring.ts`:

1. Imports: `import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, min, ne, or } from "drizzle-orm";` e `import { LEGACY_CHECKIN_ALARM_ID } from "./_core/event-kind";`
2. `createAlarmEvent`, no `.set({...})` do reaproveitamento do pendente futuro, acrescentar depois de `timezone: data.timezone ?? null,`:

```ts
          kind: data.kind ?? null,
          graceMinutes: data.graceMinutes ?? null,
```

3. `updateAlarmEventStatusByAlarmId`: o tipo de retorno `Promise<{ id: number; timezone: string | null } | null>` vira `Promise<{ id: number; timezone: string | null; kind: string | null } | null>` e a última linha `return affected > 0 ? { id: target.id, timezone: target.timezone } : null;` vira `return affected > 0 ? { id: target.id, timezone: target.timezone, kind: target.kind ?? null } : null;`.
4. Trocar as duas funções de seleção por:

```ts
/**
 * Check-ins perdidos (status = 'missed' | 'not_sent') que ainda não tiveram
 * aviso do servidor (warningSent = false). "É check-in" = kind 'checkin' (novo)
 * OU o alarmId fixo do sistema antigo. Evita escalar todo remédio perdido pela
 * cascata do Passo 3. lookbackHours limita até onde buscar.
 */
export async function getMissedCheckinEvents(lookbackHours: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        or(eq(alarmEvents.kind, "checkin"), eq(alarmEvents.alarmId, LEGACY_CHECKIN_ALARM_ID)),
        inArray(alarmEvents.status, ["missed", "not_sent"]),
        eq(alarmEvents.warningSent, false),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    );
}

/**
 * Eventos de alarme de MEDICAÇÃO (tudo que não é check-in) que expiraram sem
 * resposta — "missed" ou "not_sent" — e ainda não foram escalados pelo servidor
 * (warningSent=false). Backstop do dead man's switch para quando a escalação no
 * cliente não completou. (Ver o texto completo da versão anterior desta função
 * sobre missed × not_sent e a escada do Passo 2.)
 */
export async function getMissedMedicationEvents(lookbackHours: number) {
  const db = await getDb();
  if (!db) return [];
  const cutoff = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
  return db
    .select()
    .from(alarmEvents)
    .where(
      and(
        ne(alarmEvents.alarmId, LEGACY_CHECKIN_ALARM_ID),
        or(isNull(alarmEvents.kind), ne(alarmEvents.kind, "checkin")),
        inArray(alarmEvents.status, ["missed", "not_sent"]),
        eq(alarmEvents.warningSent, false),
        gte(alarmEvents.scheduledAt, cutoff)
      )
    );
}
```

(Ao colar, manter o comentário original longo de `getMissedMedicationEvents` em vez do resumo acima.)

- [ ] **Passo 6: Rotas de monitoramento**

Em `server/routers-monitoring.ts`:

1. Import: `import { isCheckinEvent } from "./_core/event-kind";` e apagar a constante local `CHECKIN_ALARM_ID` (e o comentário "Mesmo id usado pelo check-in diário...") se ficar sem uso depois do passo 2.
2. `pushMissedAlarmToCaregivers`: acrescentar o parâmetro `kind: string | null` depois de `timezone` e trocar `alarmId === CHECKIN_ALARM_ID` por `isCheckinEvent({ alarmId, kind })`.
3. `confirmEvent`: na chamada, depois de `transitioned.timezone` acrescentar `transitioned.kind ?? null`.
4. `createEvent`: no `z.object`, depois de `timezone: z.string().max(64).nullish(),` acrescentar:

```ts
        // Tipo e prazo do evento (check-in como alarme). Opcionais: clientes
        // antigos não mandam e valem remédio com 5 min.
        kind: z.enum(["medication", "checkin"]).nullish(),
        graceMinutes: z
          .union([z.literal(5), z.literal(10), z.literal(15), z.literal(30)])
          .nullish(),
```

e, no `createAlarmEvent({...})`, depois de `timezone: input.timezone ?? null,`:

```ts
        kind: input.kind === "checkin" ? "checkin" : null,
        graceMinutes: input.graceMinutes ?? null,
```

Em `server/routers-links.ts`, no mapeamento de `events` de `getMonitoredAlerts`, depois de `alarmDescription: e.alarmDescription,` acrescentar `kind: e.kind ?? null,`.

- [ ] **Passo 7: `monitoring-job`**

Em `server/monitoring-job.ts`:

1. Imports: `import { agendaHasCheckinAlarm, isEventExpired } from "./_core/event-kind";`
2. Passo 1: trocar

```ts
    const expiredEvents = await getExpiredPendingEvents(GRACE_PERIOD_MINUTES);
    console.log(`[Monitor] Found ${expiredEvents.length} expired pending events`);
```

por

```ts
    // O corte do banco usa o grace padrão (5 min); cada evento pode ter o seu
    // (check-in: 5, 10, 15 ou 30 min) — o prazo exato é conferido aqui.
    const expiredEvents = (await getExpiredPendingEvents(GRACE_PERIOD_MINUTES)).filter((e) =>
      isEventExpired(e, Date.now(), GRACE_PERIOD_MINUTES)
    );
    console.log(`[Monitor] Found ${expiredEvents.length} expired pending events`);
```

3. Ainda no Passo 1, logo depois do bloco `if (event.alarmId !== CHECKIN_ALARM_ID && !isAlarmStillArmed(...)) {...}` acrescentar:

```ts
        // Evento do check-in ANTIGO ('checkin-daily') de uma conta que já migrou
        // para o check-in como alarme: não é mais esperado. Sem isto ele
        // escalaria "check-in perdido" de um check-in que já virou alarme.
        if (
          event.alarmId === CHECKIN_ALARM_ID &&
          agendaHasCheckinAlarm(await getAgenda(event.openId))
        ) {
          await deleteAlarmEvent(event.id);
          console.log(
            `[Monitor] Event ${event.id} (check-in antigo) -> apagado (conta já migrou para o check-in como alarme)`
          );
          continue;
        }
```

4. Passo 3: `getMissedCheckinEvents("checkin-daily", EVENT_LOOKBACK_HOURS)` → `getMissedCheckinEvents(EVENT_LOOKBACK_HOURS)`. Passo 4: `getMissedMedicationEvents("checkin-daily", EVENT_LOOKBACK_HOURS)` → `getMissedMedicationEvents(EVENT_LOOKBACK_HOURS)`.
5. Verificar chamadas esquecidas: `grep -rn "getMissedCheckinEvents\|getMissedMedicationEvents" server tests` (os testes só usam `toHaveBeenCalled()`).

- [ ] **Passo 8: Ver passar**

```bash
pnpm vitest run tests/event-kind.test.ts tests/monitoring-job.checkin-alarme.test.ts tests/monitoring.create-event-kind.test.ts tests/monitoring-job.alarme-cancelado.test.ts tests/monitoring-job.classification.test.ts tests/monitoring-job.resilience.test.ts tests/monitoring-job.inactivity.test.ts tests/monitoring-job.sms.test.ts tests/monitoring-missed-alarm-push.test.ts tests/create-alarm-event-dedup.test.ts
pnpm test && pnpm check
```

Esperado: verde.

- [ ] **Passo 9: Entregar** — arquivos: os listados no cabeçalho. Antes do deploy: a migração `0016` roda no boot do servidor; conferir `/api/health` depois (UptimeRobot já observa).

---

## Tarefa 20: O check-in toca, fala e escala como alarme (cliente)

**Branch:** `beta/20-checkin-toca` · **Mensagem:** `feat(checkin): o check-in toca como alarme, pergunta se está tudo bem e escala no atraso configurado`
**Depende de:** Tarefas 18 e 19.

**Files:**
- Modify: `lib/native-alarm-manager.ts` (textos e botão por tipo, três agendamentos)
- Modify: `lib/notifications-utils.ts` (conteúdo da notificação do iOS < 26)
- Modify: `lib/ios-alarm-kit.ts` (título e rótulo do botão)
- Modify: `lib/monitoring-service.ts` (`createPendingAlarmEvent`; `checkOfflineAlarms`)
- Modify: `components/alarm-notification-handler.tsx` (duração do countdown)
- Modify: `app/alarm-ring.tsx` (variante check-in)
- Test: `tests/checkin-alarm-wiring.test.ts`

**Interfaces:**
- Consumes: `alarmTexts`, `ringCopy`, `buildCheckinSpeechText`, `escalateSeconds`, `isCheckinAlarm`, `serverEventExtras`, `medicationAlarms` (Tarefa 18).

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/checkin-alarm-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('o check-in toca como alarme', () => {
  it('Android: título, corpo e botão vêm de alarmTexts (nada fixo de remédio)', () => {
    const src = read('lib/native-alarm-manager.ts');
    expect(src).toMatch(/alarmTexts\(alarm\)/);
    expect(src).not.toMatch(/dismissText: 'Dispensar'/);
    expect(src).not.toMatch(/Alarme de Medicamento'/);
  });

  it('iOS < 26: a notificação usa alarmTexts', () => {
    const src = read('lib/notifications-utils.ts');
    expect(src).toMatch(/alarmTexts\(alarm\)/);
  });

  it('iOS 26+: título e botão do AlarmKit vêm de alarmTexts', () => {
    const src = read('lib/ios-alarm-kit.ts');
    expect(src).toMatch(/texts\.alarmKitTitle/);
    expect(src).toMatch(/texts\.stopButtonLabel/);
  });

  it('o evento pré-registrado leva o tipo e o atraso', () => {
    expect(read('lib/monitoring-service.ts')).toMatch(/\.\.\.serverEventExtras\(alarm\)/);
  });

  it('a contagem usa o atraso do check-in e não o timerDuration', () => {
    const handler = read('components/alarm-notification-handler.tsx');
    expect(handler).toMatch(/isCheckinAlarm\(alarmData\)\s*\?\s*escalateSeconds\(alarmData\)/);
    const ring = read('app/alarm-ring.tsx');
    expect(ring).toMatch(/escalateSeconds\(alarm\)/);
  });

  it('a tela do alarme tem a variante de check-in', () => {
    const ring = read('app/alarm-ring.tsx');
    expect(ring).toMatch(/const isCheckin = !!alarm && isCheckinAlarm\(alarm\);/);
    expect(ring).toMatch(/ringCopy\(isCheckin\)/);
    expect(ring).toMatch(/buildCheckinSpeechText\(/);
    expect(ring).not.toMatch(/Mensagem de emergência em'/);
  });

  it('o aviso de "alarmes não confirmados" ignora check-in', () => {
    expect(read('lib/monitoring-service.ts')).toMatch(/e\.kind === 'checkin'/);
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/checkin-alarm-wiring.test.ts
```

- [ ] **Passo 3: Android — textos por tipo**

Em `lib/native-alarm-manager.ts`:

1. Acrescentar `import { alarmTexts } from '@/lib/alarm-kind';`
2. Em `scheduleNativeAlarm`, trocar o bloco de `title`/`body` (da linha `// Passo 1.2: usar texto estático ...` até o `: 'Toque aqui para confirmar que tomou o medicamento';`) por:

```ts
    // Passo 1.2: texto estático descritivo na notificação nativa (por tipo:
    // remédio ou check-in). NÃO usar countdown dinâmico aqui - é impossível sem
    // Foreground Service. O countdown é exibido apenas quando o app está em
    // foreground (alarm-ring screen).
    const texts = alarmTexts(alarm);
    const title = texts.nativeTitle;
    const body = texts.nativeBody;
```

3. Nos três `scheduleAlarmNative({...})`, trocar `dismissText: 'Dispensar',` por `dismissText: texts.dismissText,`. (`snoozeText: 'Soneca',` e `showSnooze: false` ficam.)

- [ ] **Passo 4: iOS**

Em `lib/notifications-utils.ts`, no `content` de `scheduleAlarmNotification` (e acrescentando `import { alarmTexts } from '@/lib/alarm-kind';`), trocar:

```ts
      title: `⏰ ${alarm.description || 'Alarme'}`,
      body: alarm.description
        ? `Hora do alarme: ${alarm.time} - ${alarm.description}`
        : `Hora do alarme: ${alarm.time}`,
```

por (declarando `const texts = alarmTexts(alarm);` antes de `const content`):

```ts
      title: texts.notificationTitle,
      body: texts.notificationBody,
```

Em `lib/ios-alarm-kit.ts` (importando `alarmTexts`), antes de `const options = {` acrescentar `const texts = alarmTexts(alarm);` e trocar `title: alarm.description || 'Hora do remédio',` por `title: texts.alarmKitTitle,` e `stopButtonLabel: 'Desligar',` por `stopButtonLabel: texts.stopButtonLabel,`.

- [ ] **Passo 5: Servidor recebe tipo e atraso; aviso de "não confirmados"**

Em `lib/monitoring-service.ts`:

1. `import { serverEventExtras } from "@/lib/alarm-kind";`
2. Em `createPendingAlarmEvent`, no objeto da mutation, depois de `timezone: deviceTimezone(),` acrescentar `    ...serverEventExtras(alarm),`.
3. Em `checkOfflineAlarms`, na função `isRelevant`, trocar `if (e.alarmId === CHECKIN_ALARM_ID) return false;` por `if (e.alarmId === CHECKIN_ALARM_ID || e.kind === 'checkin') return false;` e ajustar o comentário "ignora o check-in diário ('checkin-daily')" para "ignora o check-in (antigo 'checkin-daily' ou kind 'checkin')".

- [ ] **Passo 6: Duração da contagem**

Em `components/alarm-notification-handler.tsx` (importando `{ escalateSeconds, isCheckinAlarm } from '@/lib/alarm-kind'`), em `handleAlarmFired` trocar:

```ts
    const timerDuration = await readTimerDurationFromStorage();
```

por:

```ts
    // Check-in: o atraso configurado no próprio alarme; remédio: a preferência
    // global (timerDuration), lida do storage para não depender do state.
    const timerDuration = isCheckinAlarm(alarmData)
      ? escalateSeconds(alarmData)
      : await readTimerDurationFromStorage();
```

- [ ] **Passo 7: `alarm-ring` — variante check-in**

Em `app/alarm-ring.tsx` (acrescentando `import { buildCheckinSpeechText, escalateSeconds, isCheckinAlarm, medicationAlarms, ringCopy } from '@/lib/alarm-kind';`):

1. Depois de `const alarm = state.alarms.find((a) => a.id === alarmId);` (linha ~108) acrescentar:

```ts
  // Check-in ("Está tudo bem?"): mesma tela, outros textos e outro prazo.
  const isCheckin = !!alarm && isCheckinAlarm(alarm);
  const copy = ringCopy(isCheckin);
  const ringName = isCheckin ? copy.fallbackName : alarm?.description || copy.fallbackName;
```

2. Trocar `const configuredDuration: number = state.settings.timerDuration ?? 30;` por:

```ts
  const configuredDuration: number = isCheckin && alarm
    ? escalateSeconds(alarm)
    : state.settings.timerDuration ?? 30;
```

3. Fala: em `speakAlarm`, trocar `const text = buildSpeechText(alarm?.description, alarm?.time, vindoDoAlarmKit);` por:

```ts
    const text = isCheckin
      ? buildCheckinSpeechText(alarm?.time, vindoDoAlarmKit)
      : buildSpeechText(alarm?.description, alarm?.time, vindoDoAlarmKit);
```

4. `initTimer` (cold start): depois do `try { ... } catch {}` que lê o storage e antes de `const fireMs = alarmForAnchor ? ...`, acrescentar:

```ts
        if (alarmForAnchor && isCheckinAlarm(alarmForAnchor)) {
          duration = escalateSeconds(alarmForAnchor);
        }
```

5. `handleDismiss`: trocar `updateAlarmWidgetOnDismiss(state.alarms)` por `updateAlarmWidgetOnDismiss(medicationAlarms(state.alarms))` e, na saída, trocar `router.replace(postAlarmRoute as never);` por:

```ts
    // Depois do check-in, volta ao Início (e não à lista de remédios).
    router.replace((isCheckin && postAlarmRoute === '/(tabs)/alarms' ? '/(tabs)' : postAlarmRoute) as never);
```

e acrescentar `isCheckin` às dependências do `useCallback` de `handleDismiss`.
6. Textos, **nos dois modos** (cada trecho abaixo aparece igual no modo acessível e no normal; usar `replace_all` quando o texto for idêntico):

| Trocar | Por |
|---|---|
| `{alarm?.description \|\| 'Alarme'}` (os dois) | `{ringName}` |
| `{isUrgent ? '⚠️ Mensagem de emergência em' : 'Mensagem de emergência em'}` (os dois) | ``{isUrgent ? `⚠️ ${copy.countdownLabel}` : copy.countdownLabel}`` |
| `Toque em "Desligar" para cancelar o envio` (os dois) | `{copy.countdownHint}` — atenção: no JSX o texto está solto dentro de `<Text>`; trocar o texto por `{copy.countdownHint}` |
| `Mensagem de emergência enviada para seus contatos` (os dois) | `{copy.escalatedText}` (mesma observação) |
| `{vindoDoAlarmKit ? 'Confirmado' : 'Desligar Alarme'}` (os dois) | `{vindoDoAlarmKit ? 'Confirmado' : copy.dismissLabel}` |
| `accessibilityLabel={vindoDoAlarmKit ? 'Confirmado, fechar' : 'Desligar alarme'}` (os dois) | `accessibilityLabel={vindoDoAlarmKit ? 'Confirmado, fechar' : copy.dismissA11y}` |
| rótulo `ALARME` do modo acessível (`<Text ...letterSpacing: 3 }]}>` + `ALARME`) | `{copy.topLabel}` |
| `<Text style={styles.alarmLabel}>ALARME</Text>` (modo normal) | `<Text style={styles.alarmLabel}>{copy.topLabel}</Text>` |

Conferir depois:

```bash
grep -n "Mensagem de emergência\|'Desligar Alarme'\|>ALARME<\|description || 'Alarme'" app/alarm-ring.tsx
```

Esperado: nenhuma linha (as únicas ocorrências de texto de remédio ficam em `lib/alarm-kind.ts` e em `buildSpeechText`).

- [ ] **Passo 8: Ver passar**

```bash
pnpm vitest run tests/checkin-alarm-wiring.test.ts tests/alarmkit-ui.test.ts tests/alarm-ring-a11y-contrast.test.ts tests/ios-alarm-kit.test.ts tests/android-alarm-sound-flag.test.ts tests/android-alarm-vibration-native.test.ts tests/notification-content-no-undefined.test.ts
pnpm test && pnpm check
```

Esperado: verde. Se `alarm-ring-a11y-contrast` acusar `colors.` no ramo acessível, o trecho novo usou token de tema em vez de `ac.*`.

- [ ] **Passo 9: Conferir no aparelho** — o check-in migrado (Tarefa 18) toca com som em loop e tela cheia, a tela diz "Está tudo bem?" com o botão **"Estou bem"**, a fala pede para tocar em "Estou bem", e o aviso aos contatos sai no atraso (30 min no migrado). Android com tela bloqueada e desbloqueada; iOS 26+ (o botão do AlarmKit é "Estou bem") e iOS anterior. Um alarme de **remédio** continua idêntico (textos, "Desligar Alarme", 30 s).

- [ ] **Passo 10: Entregar** — arquivos: os listados no cabeçalho.

---

## Tarefa 21: Telas do check-in e fim do sistema antigo

**Branch:** `beta/21-checkin-telas` · **Mensagem:** `feat(checkin): tela de check-in, tile no Início, e remoção do sistema paralelo`
**Depende de:** Tarefas 17 e 20.

**Files:**
- Modify: `lib/alarm-form.ts`, `components/alarm-form-modal.tsx` (check-in no formulário)
- Modify: `components/alarm-card.tsx` (prop `subtitle`)
- Move: `app/(tabs)/alarms.tsx` → `components/alarm-list-screen.tsx` (parametrizado por tipo)
- Create: `app/(tabs)/alarms.tsx` (fino), `app/(tabs)/checkin.tsx` (fino)
- Modify: `app/(tabs)/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`
- Modify (remoção do sistema antigo): `app/_layout.tsx`, `components/app-lock-gate.tsx`, `lib/app-lock-context.tsx`, `components/update-banner.tsx`, `lib/permissions-check.ts`, `lib/notifications-utils.ts`, `lib/notification-constants.ts`
- Delete: `lib/checkin-service.ts`, `lib/checkin-notification-handler.ts`, `lib/checkin-dedup.ts`, `lib/checkin-defaults.ts`, `components/checkin-initializer.tsx`, `app/checkin-response.tsx`; testes `tests/checkin-service.test.ts`, `tests/checkin-dedup.test.ts`, `tests/checkin-response-a11y.test.ts`, `tests/checkin-state.test.ts`
- Modify: `tests/permissions-check.test.ts`
- Test: `tests/checkin-screens.test.ts`, `tests/checkin-legacy-removed.test.ts`

**Interfaces:**
- Produces: `AlarmListScreen({ kind }: { kind: 'medication' | 'checkin' })` (`@/components/alarm-list-screen`); `emptyFormFor(kind: AlarmKind): AlarmFormValues`; `AlarmFormModal` ganha a prop `newKind?: AlarmKind` (padrão `'medication'`); `AlarmCard` ganha `subtitle?: string`.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `tests/checkin-screens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_ALARM_FORM, emptyFormFor, formFromAlarm } from '../lib/alarm-form';
import type { Alarm } from '../lib/app-context';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('formulário de check-in', () => {
  it('novo check-in: horário 09:00, nome fixo e aviso em 15 min', () => {
    expect(emptyFormFor('checkin')).toMatchObject({
      time: '09:00', description: 'Check-in', kind: 'checkin', escalateAfterMinutes: 15,
      repeat: 'daily', sound: true, vibration: true, enabled: true,
    });
  });
  it('novo remédio continua em branco', () => {
    expect(emptyFormFor('medication')).toEqual(EMPTY_ALARM_FORM);
  });
  it('editar um check-in leva kind e atraso', () => {
    const alarm: Alarm = {
      id: 'c1', time: '09:00', description: 'Check-in', enabled: true, repeat: 'daily',
      customDays: [], sound: true, vibration: true, kind: 'checkin', escalateAfterMinutes: 10,
    };
    expect(formFromAlarm(alarm)).toMatchObject({ kind: 'checkin', escalateAfterMinutes: 10 });
  });
});

describe('telas', () => {
  it('Remédios e Check-in usam a mesma lista, por tipo', () => {
    expect(read('app/(tabs)/alarms.tsx')).toMatch(/<AlarmListScreen kind="medication" \/>/);
    expect(read('app/(tabs)/checkin.tsx')).toMatch(/<AlarmListScreen kind="checkin" \/>/);
  });
  it('a aba Check-in está registrada', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/name="checkin"/);
  });
  it('o Início troca "Avisar família" por "Check-in" (contatos continuam em Tudo)', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).not.toMatch(/title="Avisar família"/);
    expect(home).toMatch(/title="Check-in"/);
    expect(read('app/(tabs)/tudo.tsx')).toMatch(/\/\(tabs\)\/contacts/);
  });
  it('o formulário esconde o nome e mostra o atraso do aviso no check-in', () => {
    const modal = read('components/alarm-form-modal.tsx');
    expect(modal).toMatch(/Avisar meu cuidador depois de/);
    expect(modal).toMatch(/CHECKIN_ESCALATE_OPTIONS/);
  });
  it('as Configurações têm só um atalho para o check-in', () => {
    const settings = read('app/(tabs)/settings.tsx');
    expect(settings).toMatch(/\/\(tabs\)\/checkin/);
    expect(settings).not.toMatch(/scheduleCheckin|cancelCheckin|DateTimePicker/);
  });
});
```

Criar `tests/checkin-legacy-removed.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('o sistema de check-in paralelo saiu', () => {
  it.each([
    'lib/checkin-service.ts',
    'lib/checkin-notification-handler.ts',
    'lib/checkin-dedup.ts',
    'lib/checkin-defaults.ts',
    'components/checkin-initializer.tsx',
    'app/checkin-response.tsx',
  ])('%s foi removido', (file) => {
    expect(existsSync(join(root, file))).toBe(false);
  });

  it('o layout raiz não monta nem roteia o check-in antigo', () => {
    const layout = read('app/_layout.tsx');
    expect(layout).not.toMatch(/CheckinInitializer\b/);
    expect(layout).not.toMatch(/checkin-response|checkin_prompt|checkin_timeout/);
    expect(layout).toMatch(/CheckinMigrationInitializer/);
  });

  it('as rotas intocáveis não citam mais a tela antiga', () => {
    expect(read('components/app-lock-gate.tsx')).not.toMatch(/checkin-response/);
    expect(read('lib/permissions-check.ts')).not.toMatch(/checkin-response/);
    expect(read('components/update-banner.tsx')).not.toMatch(/checkin-response/);
  });

  it('o canal de notificação do check-in antigo é apagado, não recriado', () => {
    const utils = read('lib/notifications-utils.ts');
    expect(utils).toMatch(/deleteNotificationChannelAsync\(CHECKIN_CHANNEL_ID\)/);
    expect(utils).not.toMatch(/setNotificationChannelAsync\(CHECKIN_CHANNEL_ID/);
    expect(utils).not.toMatch(/checkin_prompt/);
  });

  it('a migração continua lendo os campos antigos (ficam no tipo, @deprecated)', () => {
    expect(read('lib/app-context.tsx')).toMatch(/@deprecated Fase 3/);
  });
});
```

Em `tests/permissions-check.test.ts`, apagar a linha `expect(canInterruptRoute("/checkin-response")).toBe(false);` (~linha 178).

Apagar os quatro testes do sistema antigo (`git rm`):

```bash
git rm tests/checkin-service.test.ts tests/checkin-dedup.test.ts tests/checkin-response-a11y.test.ts tests/checkin-state.test.ts
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/checkin-screens.test.ts tests/checkin-legacy-removed.test.ts
```

- [ ] **Passo 3: Formulário e cartão**

Em `lib/alarm-form.ts`:

```ts
import { NEW_CHECKIN_ESCALATE_MINUTES, type AlarmKind } from '@/lib/alarm-kind';
```

trocar `formFromAlarm` e acrescentar `emptyFormFor`:

```ts
/** Formulário em branco para criar um alarme do tipo pedido. */
export function emptyFormFor(kind: AlarmKind): AlarmFormValues {
  if (kind === 'checkin') {
    return {
      ...EMPTY_ALARM_FORM,
      time: '09:00',
      description: 'Check-in',
      kind: 'checkin',
      escalateAfterMinutes: NEW_CHECKIN_ESCALATE_MINUTES,
    };
  }
  return EMPTY_ALARM_FORM;
}

/**
 * Só os campos editáveis. `notificationId`/`nativeAlarmUids` ficam de fora de
 * propósito: `scheduleFullAlarm` os recalcula ao salvar.
 */
export function formFromAlarm(alarm: Alarm | null, newKind: AlarmKind = 'medication'): AlarmFormValues {
  if (!alarm) return emptyFormFor(newKind);
  return {
    time: alarm.time,
    description: alarm.description,
    enabled: alarm.enabled,
    repeat: alarm.repeat,
    customDays: alarm.customDays,
    sound: alarm.sound,
    vibration: alarm.vibration,
    ...(alarm.kind ? { kind: alarm.kind } : {}),
    ...(alarm.escalateAfterMinutes ? { escalateAfterMinutes: alarm.escalateAfterMinutes } : {}),
  };
}
```

(apagar a versão antiga de `formFromAlarm` e o comentário dela.)

Em `components/alarm-form-modal.tsx`:

1. Imports: `import { CHECKIN_ESCALATE_OPTIONS, DEFAULT_ESCALATE_MINUTES, type AlarmKind } from '@/lib/alarm-kind';`
2. Props: acrescentar `/** Tipo do alarme NOVO (ignorado na edição). */ newKind?: AlarmKind;` e desestruturar `newKind = 'medication'`.
3. Trocar `formFromAlarm(editingAlarm)` por `formFromAlarm(editingAlarm, newKind)` no `useState` e no efeito (dependências `[visible, editingAlarm, newKind]`).
4. Depois de `const saveDisabled = ...`, acrescentar:

```tsx
  const isCheckin = form.kind === 'checkin';
  const escalateValue = form.escalateAfterMinutes ?? DEFAULT_ESCALATE_MINUTES;
  const setEscalate = (minutes: (typeof CHECKIN_ESCALATE_OPTIONS)[number]) =>
    setForm((f) => ({ ...f, escalateAfterMinutes: minutes }));
  const nounLower = isCheckin ? 'check-in' : 'lembrete';
```

e trocar a linha de `title` por `const title = editingAlarm ? (isCheckin ? 'Editar Check-in' : 'Editar Lembrete') : (isCheckin ? 'Novo Check-in' : 'Novo Lembrete');`.
5. **Modo acessível:** envolver o bloco `{/* Description */}` (o `<View style={{ gap: 12 }}>` com "Nome do Lembrete") em `{!isCheckin && ( ... )}`; antes do bloco `{/* Som e Vibração — linhas grandes */}` acrescentar:

```tsx
              {isCheckin && (
                <View style={{ gap: 12 }}>
                  <Text style={{ fontSize: af.lg, fontWeight: '800', color: ac.foreground }}>Avisar meu cuidador depois de</Text>
                  {CHECKIN_ESCALATE_OPTIONS.map((minutes) => {
                    const selected = escalateValue === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => setEscalate(minutes)}
                        accessibilityRole="radio"
                        accessibilityLabel={`${minutes} minutos`}
                        accessibilityState={{ selected }}
                        style={{ paddingVertical: as_.buttonPadding, paddingHorizontal: 20, borderRadius: 16, borderWidth: 3, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: selected ? ac.primary : ac.surface, borderColor: selected ? ac.primary : ac.border }}
                      >
                        <MaterialIcons name={selected ? 'radio-button-on' : 'radio-button-off'} size={28} color={selected ? ac.onPrimary : ac.muted} />
                        <Text style={{ fontSize: af.md, fontWeight: '700', color: selected ? ac.onPrimary : ac.foreground }}>{minutes} minutos</Text>
                      </Pressable>
                    );
                  })}
                  <Text style={{ fontSize: af.sm, color: ac.muted }}>Se você não tocar em "Estou bem", seus contatos e cuidadores são avisados depois desse tempo.</Text>
                </View>
              )}
```

6. **Modo normal:** envolver o `formGroup` "Nome do lembrete" em `{!isCheckin && ( ... )}`; trocar o rótulo `Que horas tomar?` por `{isCheckin ? 'Que horas?' : 'Que horas tomar?'}` (o teste de ordem da Tarefa 17 continua procurando as duas formas: manter a string `'Que horas tomar?'` literal no arquivo); depois do `formGroup` de **Repetição** (antes do bloco `{/* Som · Vibração · Habilitado */}`) acrescentar:

```tsx
            {isCheckin && (
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { color: colors.foreground, fontSize: fs.base, fontFamily: BrandFonts.body }]}>Avisar meu cuidador depois de</Text>
                <View style={styles.repeatOptions}>
                  {CHECKIN_ESCALATE_OPTIONS.map((minutes) => {
                    const selected = escalateValue === minutes;
                    return (
                      <Pressable
                        key={minutes}
                        onPress={() => setEscalate(minutes)}
                        style={[styles.repeatOption, { backgroundColor: selected ? colors.primarySurface : colors.surface, borderColor: selected ? colors.primary : colors.border, minHeight: fs.touch(44) }]}
                        accessibilityRole="radio"
                        accessibilityLabel={`${minutes} minutos`}
                        accessibilityState={{ selected }}
                      >
                        <Text style={[styles.repeatOptionText, { color: selected ? colors.onPrimary : colors.foreground, fontSize: fs.sm }]}>{minutes} min</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: colors.muted, fontSize: fs.sm }}>
                  Se você não tocar em "Estou bem", seus contatos e cuidadores são avisados depois desse tempo.
                </Text>
              </View>
            )}
```

7. Rótulos de excluir/habilitar: `Habilitar lembrete` → `` `Habilitar ${nounLower}` `` (a11y label do switch) e `Excluir este lembrete` / `Excluir lembrete` → `` `Excluir este ${nounLower}` `` / `{isCheckin ? 'Excluir check-in' : 'Excluir lembrete'}` (manter a string literal `'Excluir lembrete'` no arquivo).
8. No `onSave` dos dois modos (`onPress={() => onSave(form)}`) enviar o nome fixo do check-in: `onPress={() => onSave(isCheckin ? { ...form, description: 'Check-in' } : form)}`.

Em `components/alarm-card.tsx`: na interface acrescentar `/** Texto no lugar do nome (check-in mostra o atraso do aviso). */ subtitle?: string;`, desestruturar `subtitle` e trocar `{alarm.description || 'Sem descrição'}` por `{subtitle ?? (alarm.description || 'Sem descrição')}`.

- [ ] **Passo 4: Mover a lista para um componente por tipo**

```bash
git mv "app/(tabs)/alarms.tsx" components/alarm-list-screen.tsx
```

Em `components/alarm-list-screen.tsx`:

1. Trocar `export default function AlarmsScreen() {` por `export function AlarmListScreen({ kind }: { kind: AlarmKind }) {` e, logo no começo do corpo, acrescentar:

```tsx
  const isCheckin = kind === 'checkin';
  const copy = LIST_COPY[kind];
```

2. Antes do componente, acrescentar o dicionário e os imports (`import { checkinAlarms, medicationAlarms, type AlarmKind } from '@/lib/alarm-kind';`):

```tsx
const LIST_COPY = {
  medication: {
    title: 'Remédios',
    subtitle: 'Seus lembretes de medicação',
    count: (n: number) => `${n} lembrete(s) configurado(s)`,
    emptyTitle: 'Nenhum lembrete configurado',
    emptyText: 'Adicione seu primeiro lembrete de medicação abaixo.',
    emptyA11yTitle: 'Nenhum lembrete',
    emptyA11yText: 'Toque no botão abaixo para adicionar um lembrete de medicação.',
    addText: 'Adicionar lembrete',
    addA11yText: 'Adicionar Lembrete',
    addLabel: 'Adicionar lembrete de medicação',
    editLabel: 'Editar lembrete',
    noun: 'Alarme',
    deleteTitle: 'Excluir lembrete',
    deleteMessage: 'Excluir este lembrete?',
    created: (time: string) => `Lembrete criado para as ${time}`,
  },
  checkin: {
    title: 'Check-in',
    subtitle: 'Avise que está tudo bem',
    count: (n: number) => `${n} check-in(s) configurado(s)`,
    emptyTitle: 'Nenhum check-in configurado',
    emptyText: 'Adicione um check-in: o celular toca e você toca em "Estou bem". Se não responder, seus contatos e cuidadores são avisados.',
    emptyA11yTitle: 'Nenhum check-in',
    emptyA11yText: 'Toque no botão abaixo para adicionar um check-in.',
    addText: 'Adicionar check-in',
    addA11yText: 'Adicionar Check-in',
    addLabel: 'Adicionar check-in',
    editLabel: 'Editar check-in',
    noun: 'Check-in',
    deleteTitle: 'Excluir check-in',
    deleteMessage: 'Excluir este check-in?',
    created: (time: string) => `Check-in criado para as ${time}`,
  },
} as const;
```

3. Filtro por tipo: trocar `const sortedAlarms = [...medicationAlarms(state.alarms)].sort(` por `const sortedAlarms = [...(isCheckin ? checkinAlarms(state.alarms) : medicationAlarms(state.alarms))].sort(`.
4. Trocar os textos pelos do dicionário (cada "Trocar" aparece uma vez no arquivo, salvo indicação):

| Trocar | Por |
|---|---|
| `Remédios</Text>` (os dois cabeçalhos) | `{copy.title}</Text>` |
| `Seus lembretes de medicação` | `{copy.subtitle}` |
| `{sortedAlarms.length} lembrete(s) configurado(s)` | `{copy.count(sortedAlarms.length)}` |
| `Nenhum lembrete configurado` | `{copy.emptyTitle}` |
| `Adicione seu primeiro lembrete de medicação abaixo.` | `{copy.emptyText}` |
| `Nenhum lembrete` (modo acessível) | `{copy.emptyA11yTitle}` |
| `Toque no botão abaixo para adicionar um lembrete de medicação.` | `{copy.emptyA11yText}` |
| `Adicionar lembrete` (texto do botão normal) | `{copy.addText}` |
| `Adicionar Lembrete` (texto do botão acessível) | `{copy.addA11yText}` |
| `accessibilityLabel="Adicionar lembrete de medicação"` (os dois) | `accessibilityLabel={copy.addLabel}` |
| `accessibilityLabel="Editar lembrete"` | `accessibilityLabel={copy.editLabel}` |
| `` `Alarme ${action}: ${form.time} · ${repeatLabel}${desc}` `` | `` `${copy.noun} ${action}: ${form.time} · ${repeatLabel}${desc}` `` |
| `` Speech.speak(`Lembrete criado para as ${form.time}`, { language: 'pt-BR' }); `` | `Speech.speak(copy.created(form.time), { language: 'pt-BR' });` |
| `title: 'Excluir lembrete',` e `message: 'Excluir este lembrete?',` (em `handleDelete`) | `title: copy.deleteTitle,` e `message: copy.deleteMessage,` |

Cuidado com o gênero: "atualizado/criado" vira "Check-in criado: ..." — `action` continua `'atualizado'`/`'criado'` (concordam com "Check-in" e "Alarme" no masculino).
5. Histórico só no remédio: envolver, no modo normal, `<AlarmHistorySheet .../>` e o `<View>` do botão "Ver histórico" em `{!isCheckin && ( ... )}`; no modo acessível, o mesmo para a folha e o botão acrescentados na Tarefa 16.
6. O modal: `<AlarmFormModal visible=... newKind={kind} ... />` (nos dois lugares).
7. Cartão do check-in mostra o atraso: no `<AlarmCard ...>` (modo normal) acrescentar `subtitle={isCheckin ? `Avisa seus contatos após ${item.escalateAfterMinutes ?? 5} min sem resposta` : undefined}` e, no modo acessível, trocar `{item.description || 'Sem descrição'}` por `{isCheckin ? `Avisa seus contatos após ${item.escalateAfterMinutes ?? 5} min sem resposta` : item.description || 'Sem descrição'}`.
8. O card "Próximo" e a lista já usam `sortedAlarms` (por tipo).

Criar `app/(tabs)/alarms.tsx`:

```tsx
import { AlarmListScreen } from '@/components/alarm-list-screen';

export default function AlarmsScreen() {
  return <AlarmListScreen kind="medication" />;
}
```

Criar `app/(tabs)/checkin.tsx`:

```tsx
import { AlarmListScreen } from '@/components/alarm-list-screen';

export default function CheckinScreen() {
  return <AlarmListScreen kind="checkin" />;
}
```

Em `app/(tabs)/_layout.tsx`, depois de `<Tabs.Screen name="alarms" options={{ title: "Alarmes" }} />` acrescentar `        <Tabs.Screen name="checkin" options={{ title: "Check-in" }} />`.

- [ ] **Passo 5: Início e Configurações**

`app/(tabs)/index.tsx`:
1. Modo normal: trocar o `<BigTile ... title="Avisar família" ... />` por:

```tsx
            <BigTile
              icon="check-circle"
              iconColor={colors.emergency}
              iconBg={colors.emergencyLight}
              title="Check-in"
              subtitle="Estou bem"
              onPress={() => navigate('/(tabs)/checkin')}
            />
```

2. Modo acessível: depois do botão "Registrar Saúde" (o `<Pressable ...>` que termina com `Registrar Saúde</Text></Pressable>`, linhas ~240-257) e antes do `</View>` de "Ações Rápidas", acrescentar:

```tsx
            <Pressable
              onPress={() => navigate('/(tabs)/checkin')}
              accessibilityRole="button"
              accessibilityLabel="Check-in: avisar que está tudo bem"
              style={({ pressed }) => [{
                backgroundColor: colors.emergency,
                borderRadius: 20,
                paddingVertical: as_.buttonPadding,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14,
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <MaterialIcons name="check-circle" size={36} color={colors.onEmergency} />
              <Text style={{ fontFamily: 'PlusJakartaSans', fontSize: af.xl, fontWeight: '800', color: colors.onEmergency }}>
                Check-in
              </Text>
            </Pressable>
```

`app/(tabs)/settings.tsx`:
1. Apagar `import { scheduleCheckin, cancelCheckin } from '@/lib/checkin-service';` (linha 37) e `import DateTimePicker from '@react-native-community/datetimepicker';` (linha 40).
2. Apagar `const [showCheckinTimePicker, setShowCheckinTimePicker] = useState(false);` (linha ~197) e as funções `parseCheckinTime` e `formatCheckinHHMM` (linhas ~202-209).
3. Trocar a seção inteira `{/* ═══ SECTION: Check-in Diário ═══ */}` (linhas ~1100-1249, até o `</CollapsibleSection>` dela; âncoras: `title="Check-in Diário"` e, no fim, o texto `ligue 192 (SAMU).`) por:

```tsx
        {/* ═══ SECTION: Check-in ═══ */}
        <CollapsibleSection
          title="Check-in"
          icon="check-circle"
          iconBg={colors.successLight}
          iconColor={colors.success}
          colors={colors}
          defaultOpen={false}
        >
          <View style={{ padding: 16, gap: 12 }}>
            <Text style={{ color: colors.muted, fontSize: fs.sm, lineHeight: fs.scaled(20) }}>
              O check-in toca como um alarme e pergunta se está tudo bem. Se você não responder, seus contatos e cuidadores são avisados.
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/checkin' as never)}
              accessibilityRole="button"
              accessibilityLabel="Configurar check-in"
              style={({ pressed }) => [{
                backgroundColor: colors.primarySurface,
                borderRadius: 14,
                minHeight: fs.touch(52),
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <Text style={{ color: colors.onPrimary, fontSize: fs.base, fontWeight: '700' }}>Configurar check-in</Text>
            </Pressable>
            <Text style={{ color: colors.muted, fontSize: fs.xs, lineHeight: 18 }}>
              ⚠️ O check-in não substitui serviços de emergência. Em caso de emergência, ligue 192 (SAMU).
            </Text>
          </View>
        </CollapsibleSection>
```

(O `router` já existe em `settings.tsx`; conferir com `grep -n "const router" "app/(tabs)/settings.tsx"`.)

- [ ] **Passo 6: Remover o sistema paralelo**

```bash
git rm lib/checkin-service.ts lib/checkin-notification-handler.ts lib/checkin-dedup.ts lib/checkin-defaults.ts components/checkin-initializer.tsx app/checkin-response.tsx
```

`app/_layout.tsx`:
1. Apagar `import { CheckinInitializer } from '@/components/checkin-initializer';` e `<CheckinInitializer />`.
2. Apagar o `<Stack.Screen name="checkin-response" options={{...}} />` inteiro (linhas ~402-408).
3. No `checkInitialAlarm`, na "Strategy 2", trocar tudo entre `if (response) {` e o `if (alarmId) {` — isto é, `const notifType`, o bloco `checkin_prompt` e o bloco `checkin_timeout` — de forma que sobre:

```ts
        const response = await Notifications.getLastNotificationResponseAsync();
        if (response) {
          const data = response.notification.request.content.data;
          const alarmId = data?.alarmId as string | undefined;

          if (alarmId) {
            const { router } = require('expo-router');
            router.push(`/alarm-ring?alarmId=${alarmId}`);
            Notifications.clearLastNotificationResponseAsync();
          }
        }
```

`components/app-lock-gate.tsx`: no comentário `Isenções críticas: /alarm-ring e /checkin-response NUNCA são cobertas.` trocar por `Isenção crítica: /alarm-ring NUNCA é coberta (o check-in toca por ela).` e `const EXEMPT_PATHS = ['/alarm-ring', '/checkin-response'];` por `const EXEMPT_PATHS = ['/alarm-ring'];`. `lib/app-lock-context.tsx` (comentário da linha 13): trocar "As telas /alarm-ring e /checkin-response nunca são cobertas" por "A tela /alarm-ring nunca é coberta". `components/update-banner.tsx` (lista na linha ~27) e `lib/permissions-check.ts` (`ROTAS_INTOCAVEIS`, linha ~248): apagar a entrada `'/checkin-response',`.

`lib/notifications-utils.ts`:
1. No handler, apagar `const isCheckinPrompt = ...` e o comentário `// checkin_prompt: suppress system banner — in-app Modal handles it instead`, e simplificar o retorno para:

```ts
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldPlaySound: isAlarm && !isCountdownUpdate,
      shouldSetBadge: !isCountdownUpdate,
      shouldShowList: true,
    };
```

2. Trocar o bloco `// Check-in channel — HIGH importance ...` + `await Notifications.setNotificationChannelAsync(CHECKIN_CHANNEL_ID, {...});` por:

```ts
  // O canal do check-in antigo (notificação comum, tocava uma vez) deixou de
  // existir: o check-in agora é um alarme. Apaga o canal de quem já o tinha.
  try {
    await Notifications.deleteNotificationChannelAsync(CHECKIN_CHANNEL_ID);
  } catch {}
```

`lib/notification-constants.ts`: trocar o comentário da constante `CHECKIN_CHANNEL_ID` por `/** Canal do check-in ANTIGO — só existe para ser apagado no boot (notifications-utils). */`.

`lib/app-context.tsx`: nada além do `@deprecated` da Tarefa 18.

- [ ] **Passo 7: Procurar sobras**

```bash
grep -rn "checkin-service\|checkin-defaults\|checkin-notification-handler\|checkin-dedup\|checkin-initializer\|checkin-response\|CheckinInitializer\|scheduleCheckin\|createNextCheckinEvent" app components lib hooks tests --include=*.ts --include=*.tsx
pnpm check
```

Esperado: nenhuma linha no `grep` e `tsc` limpo. Qualquer sobra restante é referência ao sistema antigo: apagar.

- [ ] **Passo 8: Ver passar**

```bash
pnpm vitest run tests/checkin-screens.test.ts tests/checkin-legacy-removed.test.ts tests/alarm-form.test.ts tests/permissions-check.test.ts tests/ui-modo-acessivel.test.ts
pnpm test && pnpm check
```

- [ ] **Passo 9: Conferir no aparelho**
1. Início: o tile "Check-in" (e o botão no modo acessível) abre a tela; "Avisar família" saiu e os contatos continuam em Tudo → Contatos de Emergência.
2. Criar um check-in: o formulário não pede nome, mostra "Avisar meu cuidador depois de" (5/10/15/30), padrão 15; salvar agenda um alarme; "Testar" abre a tela "Está tudo bem?".
3. Várias horas por dia: criar dois check-ins (09:00 e 18:00); ambos tocam; o histórico mostra "Check-in" nos dois.
4. Remédios não lista check-ins; o contador da aba Remédios também não os conta.
5. Configurações → "Check-in" só tem o atalho.
6. Atualização de um aparelho com check-in antigo ligado (Tarefa 18): a migração criou o alarme e o canal antigo foi apagado (`adb shell dumpsys notification | grep vigora-checkin` sem resultado).
7. Normal e acessível, claro e escuro.

- [ ] **Passo 10: Entregar** — arquivos: os listados no cabeçalho (inclui as remoções via `git rm`).

---

## Tarefa 22: App do cuidador separa remédio e check-in

**Branch:** `beta/22-cuidador-checkin` · **Mensagem:** `feat(cuidador): próximo remédio e próximo check-in separados`
**Depende de:** Tarefas 18 e 21.

**Files:**
- Modify: `lib/caregiver-format.ts` (nenhuma função nova: `nextAlarm` já aceita qualquer lista)
- Modify: `app/(caregiver-tabs)/index.tsx`, `app/(caregiver-tabs)/person.tsx`
- Test: `tests/caregiver-checkin-views.test.ts`

(Os rótulos de alerta "Check-in não respondido" já saíram na Tarefa 8; a separação do remédio vem da Tarefa 18.)

- [ ] **Passo 1: Escrever o teste que falha**

Criar `tests/caregiver-checkin-views.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkinAlarms, medicationAlarms } from '../lib/alarm-kind';
import { nextAlarm } from '../lib/caregiver-format';
import type { Alarm } from '../lib/app-context';

const base = { description: '', enabled: true, repeat: 'daily' as const, customDays: [], sound: true, vibration: true };
const alarms: Alarm[] = [
  { ...base, id: 'm1', time: '08:00', description: 'Losartana' },
  { ...base, id: 'c1', time: '09:00', description: 'Check-in', kind: 'checkin', escalateAfterMinutes: 15 },
];
const NOW = new Date('2026-10-02T07:00:00');

describe('próximo remédio × próximo check-in', () => {
  it('cada um olha só a sua lista', () => {
    expect(nextAlarm(medicationAlarms(alarms), NOW)?.id).toBe('m1');
    expect(nextAlarm(checkinAlarms(alarms), NOW)?.id).toBe('c1');
  });
});

describe('telas do cuidador', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('o Início tem o card "Próximo check-in"', () => {
    const src = read('app/(caregiver-tabs)/index.tsx');
    expect(src).toMatch(/Próximo check-in/);
    expect(src).toMatch(/checkinAlarms\(/);
  });
  it('a tela da pessoa lista os check-ins separados das medicações', () => {
    const src = read('app/(caregiver-tabs)/person.tsx');
    expect(src).toMatch(/title="Check-ins"/);
    expect(src).toMatch(/checkinAlarms\(/);
  });
});
```

- [ ] **Passo 2: Ver falhar**

```bash
pnpm vitest run tests/caregiver-checkin-views.test.ts
```

- [ ] **Passo 3: Início do cuidador**

Em `app/(caregiver-tabs)/index.tsx`:

1. `import { checkinAlarms, medicationAlarms } from '@/lib/alarm-kind';` (o `medicationAlarms` já entrou na Tarefa 18; manter um import só).
2. Depois de `const alarms = medicationAlarms((data?.alarms ?? []) as Alarm[]);` acrescentar:

```tsx
  const upcomingCheckin = nextAlarm(checkinAlarms((data?.alarms ?? []) as Alarm[]));
```

e, depois de `nextMedBody`, acrescentar:

```tsx
  const nextCheckinBody = loading
    ? 'Carregando…'
    : upcomingCheckin
    ? `${upcomingCheckin.time}${upcomingCheckin.escalateAfterMinutes ? ` — avisa após ${upcomingCheckin.escalateAfterMinutes} min sem resposta` : ''}`
    : 'Nenhum check-in ativo.';
```

3. Modo acessível: depois de `<A11ySummary icon="medication" title="Próxima medicação" body={nextMedBody} />` acrescentar `          <A11ySummary icon="check-circle" title="Próximo check-in" body={nextCheckinBody} />`.
4. Modo normal: depois do `<StaggeredItem index={0} ...>` do "Próxima medicação", acrescentar um item e **reindexar** os dois seguintes (`index={1}` → `index={2}`, `index={2}` → `index={3}`):

```tsx
        <StaggeredItem index={1} staggerDelay={80}>
          <SummaryCard icon="check-circle" title="Próximo check-in" body={nextCheckinBody} colors={colors} fs={fs} />
        </StaggeredItem>
```

- [ ] **Passo 4: Tela da pessoa**

Em `app/(caregiver-tabs)/person.tsx`, depois de `const enabledAlarms = ...` acrescentar:

```tsx
  const enabledCheckins = checkinAlarms((data?.alarms ?? []) as Alarm[]).filter((a) => a.enabled);
```

(com `import { checkinAlarms, medicationAlarms } from '@/lib/alarm-kind';` num só import) e, depois do `</Section>` de "Medicações", acrescentar:

```tsx
        <Section icon="check-circle" title="Check-ins" skin={skin}>
          {loading ? (
            <Muted skin={skin} text="Carregando…" />
          ) : enabledCheckins.length === 0 ? (
            <Muted skin={skin} text="Nenhum check-in ativo." />
          ) : (
            enabledCheckins.map((a) => (
              <Row
                key={a.id}
                skin={skin}
                left={a.time}
                right={`avisa após ${a.escalateAfterMinutes ?? 5} min`}
              />
            ))
          )}
        </Section>
```

- [ ] **Passo 5: Ver passar**

```bash
pnpm vitest run tests/caregiver-checkin-views.test.ts tests/caregiver-refresh.test.ts
pnpm test && pnpm check
```

- [ ] **Passo 6: Conferir** — duas contas vinculadas: o cuidador vê "Próximo check-in" e a seção "Check-ins" separados das medicações; o alerta de um check-in perdido aparece como "Check-in não respondido". Claro/escuro/acessível.

- [ ] **Passo 7: Entregar** — arquivos: `app/(caregiver-tabs)/index.tsx`, `app/(caregiver-tabs)/person.tsx`, `tests/caregiver-checkin-views.test.ts`.

---

## Tarefa 23: Verificação final e documentação

**Branch:** `beta/23-fechamento` · **Mensagem:** `docs: documenta check-in como alarme, mudanças de alarme e o registro do próximo disparo`

**Files:**
- Modify: `docs/claude/alarmes.md`
- Modify: `docs/claude/roadmap.md`
- Modify: memória do projeto (`beta-feedback-padrasto-out2026.md`)

- [ ] **Passo 1: Suíte e tipos**

```bash
git switch fix/launch-prep && git pull --ff-only
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm lint 2>&1 | tail -20
```

Esperado: testes com mais casos que a linha de base da Tarefa 0 e todos verdes; `tsc` sem erro novo; `lint` sem erro novo.

- [ ] **Passo 2: `docs/claude/alarmes.md`**

Acrescentar, antes de "## Não introduza notificações redundantes", três seções:

```markdown
## Check-in é um alarme (Fase 3, out/2026)

O check-in "Está tudo bem?" deixou de ser um sistema paralelo (notificações
`checkin_prompt`/`checkin_timeout` + `settings.checkin*`) e virou um `Alarm` com
`kind: 'checkin'`. Ele é agendado por `scheduleFullAlarm` (módulo nativo no
Android, AlarmKit no iOS 26+, notificação crítica no iOS anterior), toca na
`alarm-ring` (variante "Está tudo bem?", botão "Estou bem") e escala pelo mesmo
dead man's switch.

- **Sem `kind` = remédio.** Todo alarme gravado antes da Fase 3 continua remédio.
  Os textos que mudam por tipo estão em `lib/alarm-kind.ts` (`alarmTexts`,
  `ringCopy`); os de remédio são exatamente os antigos e há teste que os trava.
- **Atraso do aviso por alarme:** `escalateAfterMinutes` (5, 10, 15 ou 30). No
  cliente é a contagem da `alarm-ring` (`escalateSeconds`); no servidor é
  `alarm_events.graceMinutes` — o prazo do evento é `scheduledAt + graceMinutes`
  (`server/_core/event-kind.ts`). Check-in novo: 15 min; migrado: 30 min.
- **`scheduledAt` do check-in é a hora em que ele TOCA** (o sistema antigo usava
  hora + janela). Não volte a embutir a janela no horário.
- **Migração** (`lib/checkin-migration.ts`, uma vez por conta, só quem tinha o
  check-in ligado): cria o alarme, desarma o sistema antigo e apaga o canal
  `vigora-checkin`. Falhou agendar, ou 24 alarmes? O sistema antigo continua e a
  próxima abertura tenta de novo — ficar sem check-in é pior que ter dois por um
  dia. Os campos `settings.checkin*` ficam no tipo, `@deprecated`, até a migração
  ter rodado em todos os aparelhos.
- O `monitoring-job` apaga o evento pendente `checkin-daily` de uma conta que já
  tem alarme `kind: 'checkin'` na agenda (senão escalaria "check-in perdido" de
  um check-in que já migrou).

## Mudanças de alarme: o cuidador fica sabendo

Excluir ou desativar um alarme faz o `monitoring-job` apagar o evento pendente
em silêncio (`isAlarmStillArmed`) — correto para não gerar alerta falso, mas
deixava o cuidador sem rastro. Agora `userData.put` lê a lista anterior, compara
(`server/_core/alarm-diff.ts`: `deleted`, `disabled`, `rescheduled`), grava em
`alarm_changes` e manda push `alarm_changed` aos cuidadores vinculados
(`server/alarm-changes.ts`).

- Melhor esforço de ponta a ponta: nada disso pode fazer o backup falhar.
- O push **leva o nome do lembrete** (decisão do Pedro): é texto livre e passa por
  Expo/Google/Apple; a Política de Privacidade cita os provedores. Máx. 5 pushes
  por minuto por conta; a mudança é sempre gravada.
- A mudança só chega ao servidor quando o celular envia o backup (3 s depois da
  alteração, com rede).
- `alarm_changes` entra na exclusão de conta, na exportação e na retenção de 180
  dias (há teste de ciclo de vida).
- Desvincular (`link.revokeLink`, pelo monitorado) avisa o cuidador (`link_revoked`).

## Registro do próximo disparo ao voltar ao app

O servidor só cobra um alarme que o app pré-registrou. Antes, isso só acontecia
em cold start, login ou edição do alarme. Agora `MonitoringInitializer` também
re-registra a cada `AppState → active` (no máx. 1×/min, `lib/resync-throttle.ts`).
Responder ao alarme sempre traz o app ao primeiro plano, então cada resposta
registra o disparo seguinte. **Lacuna que fica (Fase 4):** alarme que toca sem
ninguém interagir — o seguinte só é registrado na próxima abertura; a escada de
30 min / 2 h / 6 h cobre o intervalo. O fechamento definitivo é o servidor
calcular os disparos sozinho.
```

- [ ] **Passo 3: `docs/claude/roadmap.md`**

Acrescentar, antes de "## Fora de escopo (pós-lançamento)":

```markdown
## Feedback do beta (out/2026)

Fases 1 a 3 entregues conforme `docs/superpowers/specs/2026-10-02-feedback-beta-fases-1-3-design.md`
(plano: `docs/superpowers/plans/2026-10-02-feedback-beta-fases-1-3.md`).

- [ ] **Fase 4 (spec própria, ainda não escrita):** cuidador cria/edita/exclui os
      alarmes do monitorado, modo "gerenciado pelo cuidador" e o servidor
      calculando os disparos sozinho (fecha o registro do próximo disparo sem
      depender do app).
- [ ] Rodada de teste com o testador original (padrasto do Pedro) e nos 5
      aparelhos do Test Lab, 1 aparelho por hipótese.
```

- [ ] **Passo 4: Memória do projeto**

Atualizar `beta-feedback-padrasto-out2026.md` (memória): fases 1–3 entregues (PRs `beta/01`…`beta/23`), o que ficou aberto (Fase 4; reprodução do "continua tocando" se a Tarefa 4 concluiu que há bug; texto real do cancelamento do seletor de pastas por aparelho) e as decisões D1–D8 como tomadas.

- [ ] **Passo 5: Teste em aparelhos (antes de fechar)** — build de teste; rodar a rodada no Test Lab (um aparelho por hipótese antes dos cinco, conforme a memória do projeto) e com o testador original: swipe 5×, alarme com o app fechado ao longo de 2 dias, check-in perdido no dia seguinte a uma resposta no prazo, exclusão de lembrete com o cuidador vinculado, SOS, exportações.

- [ ] **Passo 6: Entregar** — arquivos: `docs/claude/alarmes.md`, `docs/claude/roadmap.md`.

---

## Autoavaliação do plano

**Cobertura da spec** (seção → tarefa):
3.1 → 1 · 3.2 → 2 · 3.3 → 3 e 4 · 3.4 → 5, 6, 7, 8 · 3.5 → 9 · 4.1 → 10 · 4.2 → 11 · 4.3 → 12 · 4.4 → 13 · 4.5 → 14 · 4.6 → 15 · 4.7 → 16 · 4.8 → 17 · 4.9 → 8 (rótulos, `not_sent`) e 11 (interruptores) · 5.1 → 18 · 5.2 → 20 (tela do alarme, notificação), 21 (telas, Início, Configurações) · 5.3 → 19 · 5.4 → 18 (migração) e 21 (remoção) · 5.5 → 22 · 5.6 → testes de 18, 19, 20 · 7 (segurança/LGPD) → 6 (exclusão, exportação, retenção), 8 (Política de Privacidade), 9 (botão do SAMU) · 8 (ordem) → "Mapa tarefa → entrega".

**Desvios deliberados da spec** (para o Pedro conferir):
1. SOS (Tarefa 9): o estado por contato é derivado de um resultado **agregado**; há o estado "parcial" e uma linha de resumo "N de M contato(s) avisado(s)".
2. Campos `settings.checkin*` (Tarefa 21): ficam no tipo, `@deprecated`, em vez de saírem junto; remover agora quebraria a migração de quem ainda não abriu o app.
3. Check-in novo: atraso padrão de 15 min (a spec não fixou).
4. HealthReportButton da aba Saúde continua só compartilhando; Baixar + Compartilhar ficam em "Dados e Armazenamento" e na ficha de anamnese (Tarefa 14).
5. `not_sent` (Tarefa 8): mudou o texto do push ao **cuidador**; o WhatsApp/SMS aos contatos já dizia "pode estar desligado" e ficou como está.

**Pontos que dependem de validação em aparelho** (não dá para fechar só com teste): swipe no Android 14+ (Tarefa 3), reprodução do "continua tocando" (Tarefa 4), seletor de pastas em Samsung e Motorola (Tarefa 14), migração do check-in numa atualização real (Tarefa 18), check-in tocando em Android e iOS 26+ (Tarefa 20).

**Fora do plano, mas visto durante a leitura do código** (para o Pedro decidir): a Política de Privacidade ainda não cita a Twilio (SMS aos contatos, commit `afef6e0`); o aviso da ficha de anamnese diz que os dados "nunca são enviados para servidores externos", mas existe backup em nuvem.
