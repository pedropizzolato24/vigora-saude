# AlarmKit no iOS 26+ — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No iOS 26+, o alarme de medicação passa a ser um alarme do sistema (AlarmKit) que toca em loop e toma a tela, em vez de uma notificação que soa uma vez e vira banner.

**Architecture:** Um único ponto de decisão em `scheduleFullAlarm`. iOS 26+ com AlarmKit disponível usa a lib; todo o resto (iOS <26, iOS 26 sem AlarmKit, Android) segue exatamente como está hoje. Uma ponte (`lib/_core/ios-alarm-kit-bridge.ts`) isola o `require` da lib, espelhando o `native-alarm-bridge.ts` que já existe para o Android — é o que torna o agendamento testável no vitest.

**Tech Stack:** Expo SDK 54 · React Native 0.81.5 · `expo-alarm-kit@0.1.11` (patched) · AlarmKit (iOS 26) · Vitest 2.1.9

**Spec:** `docs/superpowers/specs/2026-08-19-alarmkit-ios-design.md`

## Global Constraints

- **Branch:** `feat/alarmkit-ios`, criada a partir de `fix/launch-prep`. Nunca commitar em `spike/alarmkit` (é descartável) nem incluir `app/alarmkit-spike.tsx`.
- **Deployment target do app:** iOS **15.1** (default do SDK 54). Nunca declarar `deploymentTarget` iOS no `app.config.ts`.
- **App Group:** `group.com.vigora.saude.alarms` (já provisionado no portal da Apple na Fase 0).
- **Som do alarme:** `alarm.mp3` — **com extensão**. `'alarm'` sem extensão falhou na medição.
- **Sem soneca nativa:** `doSnoozeIntent` e `launchAppOnSnooze` ficam `false`/ausentes; nenhum `snoozeButtonLabel`. Ver `docs/claude/alarmes.md`.
- **`launchAppOnDismiss: true`** sempre — é o caminho de confirmação do dead man's switch.
- **IDs:** `alarm.id` já é `Crypto.randomUUID()` (RFC 4122 v4), que é o que o Swift exige. Ids fora desse formato devem falhar **alto**, nunca em silêncio.
- **Textos de UI:** português do Brasil, linguagem para 60+, sem jargão técnico ("celular", não "dispositivo"/"iOS").
- **Antes de todo commit:** `npx tsc --noEmit` limpo e `npx vitest run` verde.
- **Cada `git checkout` entre branches exige `pnpm install`** — elas têm `patchedDependencies` diferentes.

---

### Task 1: Binário instalável abaixo do iOS 26 (portão)

Nada do resto se sustenta sem isto. As 9 declarações de topo da lib são `@available(iOS 26.0, *)`, incluindo a classe do módulo, e o `ExpoModulesProvider.swift` gerado pelo Expo referencia as classes sem guarda. A Fase 0 não pegou esse risco porque rodou com o alvo em 26.1.

**Files:**
- Create: `patches/expo-alarm-kit.patch` (portado da `spike/alarmkit` + linha nova do podspec)
- Modify: `package.json` (dependência + `patchedDependencies`)
- Modify: `app.config.ts` (entitlements, infoPlist, sounds — **sem** `deploymentTarget`)
- Test: `tests/alarmkit-build-config.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: dependência `expo-alarm-kit` instalável e app com alvo 15.1. As tasks seguintes assumem que `require('expo-alarm-kit')` resolve no bundle iOS.

- [ ] **Step 1: Criar a branch a partir da produção**

```bash
git checkout fix/launch-prep && git pull
git checkout -b feat/alarmkit-ios
pnpm install
```

- [ ] **Step 2: Escrever o teste de configuração que falha**

Guarda a regressão mais cara: alguém subir o alvo para 26.1 de novo e cortar todo iPhone antigo, em silêncio.

```ts
// tests/alarmkit-build-config.test.ts
/**
 * O AlarmKit exige iOS 26, mas o APP não pode exigir. O podspec da lib pina
 * 26.1 e o CocoaPods propaga isso para o alvo do app: com esse alvo, quem tem
 * iPhone abaixo de 26 simplesmente para de receber atualização, sem erro
 * nenhum. Foi assim que a Fase 0 rodou, de propósito e marcada como
 * descartável.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const appConfig = readFileSync(join(raiz, "app.config.ts"), "utf8");
const patch = readFileSync(join(raiz, "patches/expo-alarm-kit.patch"), "utf8");

describe("configuração de build do AlarmKit", () => {
  it("o app NÃO declara deploymentTarget iOS", () => {
    const bloco = appConfig.match(/ios:\s*\{[^}]*deploymentTarget/s);
    expect(bloco, "deploymentTarget iOS voltou ao app.config").toBeNull();
  });

  it("o patch baixa o platform do podspec para 15.1", () => {
    const adicionadas = patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .join("\n");
    expect(adicionadas).toMatch(/:ios\s*=>\s*'15\.1'/);
  });

  it("declara o App Group — sem ele o intent de dismiss não registra nada", () => {
    expect(appConfig).toMatch(
      /com\.apple\.security\.application-groups/
    );
    expect(appConfig).toMatch(/group\.com\.vigora\.saude\.alarms/);
  });

  it("empacota alarm.mp3 — sem extensão o som falhou na medição", () => {
    expect(appConfig).toMatch(/alarm\.mp3/);
  });
});
```

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run tests/alarmkit-build-config.test.ts`
Expected: FAIL — `patches/expo-alarm-kit.patch` não existe nesta branch.

- [ ] **Step 4: Trazer a dependência e a config da spike**

```bash
git checkout spike/alarmkit -- patches/expo-alarm-kit.patch
```

Em `package.json`, adicionar em `dependencies`:

```json
"expo-alarm-kit": "^0.1.11",
```

e em `pnpm.patchedDependencies`:

```json
"expo-alarm-kit": "patches/expo-alarm-kit.patch",
```

Em `app.config.ts`, dentro de `ios.entitlements`:

```ts
"com.apple.security.application-groups": ["group.com.vigora.saude.alarms"],
```

Dentro de `ios.infoPlist`:

```ts
NSAlarmKitUsageDescription:
  "O Vigora usa alarmes do celular para o lembrete de remédio tocar na hora certa, mesmo no silencioso.",
```

No plugin `expo-notifications`, acrescentar o som ao array existente:

```ts
"sounds": ["./assets/alarm_notification.wav", "./assets/alarm.mp3"],
```

**NÃO** adicionar bloco `ios: { deploymentTarget: ... }` em `expo-build-properties`.

- [ ] **Step 5: Baixar o platform do podspec dentro do patch**

`pnpm patch` extrai o pacote **pristine** — reaplique o patch atual ANTES de editar, senão a correção do `stopButton` some.

```bash
pnpm patch expo-alarm-kit
# saída: <DIR>
cd <DIR> && patch -p1 --forward < C:/Users/55519/vigora-saude/patches/expo-alarm-kit.patch
```

Editar `ios/ExpoAlarmKit.podspec`:

```ruby
  s.platforms      = {
    :ios => '15.1',
  }
```

```bash
cd C:/Users/55519/vigora-saude
pnpm patch-commit '<DIR>'
grep -c "timerStopButton" patches/expo-alarm-kit.patch   # deve ser > 0
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `npx vitest run tests/alarmkit-build-config.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml patches/expo-alarm-kit.patch app.config.ts tests/alarmkit-build-config.test.ts
git commit -m "feat(ios): expo-alarm-kit com alvo do app em 15.1

O podspec da lib pina iOS 26.1 e o CocoaPods propaga isso para o alvo do app —
com 26.1 quem tem iPhone antigo para de receber atualização, em silêncio. O
Swift da lib já é todo @available(iOS 26.0), então baixar o platform é o que
permite compilar em 15.1 e deixar o AlarmKit atrás da guarda de runtime."
```

- [ ] **Step 8: PORTÃO — build real e instalação abaixo do iOS 26**

```bash
eas build -p ios --profile production --submit
```

Critério de aprovação, nesta ordem:
1. O build **compila**. Se falhar com `only available in iOS 26.0 or newer` apontando para `ExpoModulesProvider.swift`, ir ao Step 9.
2. O TestFlight oferece a versão num iPhone com **iOS abaixo de 26**.
3. O app abre e cria um alarme normalmente nesse aparelho (fallback intacto).

**Só siga para a Task 2 com os três confirmados.**

- [ ] **Step 9: (Só se o Step 8 falhar na compilação) mover as guardas para dentro**

O erro esperado é o provider referenciar `ExpoAlarmKitModule.self` sem guarda. A correção é tirar `@available` da **declaração da classe** e aplicá-la aos corpos dos métodos, para a classe existir em 15.1 e só o miolo exigir 26:

```swift
// ANTES
@available(iOS 26.0, *)
public class ExpoAlarmKitModule: Module {

// DEPOIS
public class ExpoAlarmKitModule: Module {
    // ... cada Function que toca AlarmKit:
    //   guard #available(iOS 26.0, *) else { return false }
```

Refazer o ciclo `pnpm patch` do Step 5 e voltar ao Step 8. Registrar no commit o erro exato que motivou a mudança.

---

### Task 2: Ponte e fachada do AlarmKit

**Files:**
- Create: `lib/_core/ios-alarm-kit-bridge.ts`
- Create: `lib/ios-alarm-kit.ts`
- Test: `tests/ios-alarm-kit.test.ts`

**Interfaces:**
- Consumes: `weeklyJsDays`, `firingJsDays` de `lib/alarm-fire-times.ts`; tipo `Alarm` de `lib/app-context`.
- Produces:
  - `isAlarmKitAvailable(): boolean`
  - `alarmKitWeekdays(alarm: Alarm): number[]` — 1=Dom..7=Sáb
  - `scheduleAlarmKitAlarm(alarm: Alarm): Promise<void>` — lança em falha
  - `cancelAlarmKitAlarm(alarmId: string): Promise<void>`
  - `takeDismissal(): { alarmId: string; payload: string | null } | null`
  - `requestAlarmKitAuthorization(): Promise<'authorized'|'denied'|'notDetermined'>`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/ios-alarm-kit.test.ts
/**
 * A lib só é carregável no iOS 26+, então o require fica isolado na ponte e o
 * teste mocka a PONTE — mesmo motivo documentado em native-alarm-bridge.ts.
 *
 * Dois pontos que o Swift falha em SILÊNCIO e que por isso viram exceção aqui:
 * id que não é UUID (guard let uuid = UUID(uuidString:) → return false) e
 * agendamento recusado (Promise<boolean> false).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ponte = {
  configure: vi.fn(() => true),
  requestAuthorization: vi.fn(async () => "authorized" as const),
  scheduleRepeatingAlarm: vi.fn(async () => true),
  cancelAlarm: vi.fn(async () => true),
  getAllAlarms: vi.fn(() => [] as string[]),
  getLaunchPayload: vi.fn(() => null as { alarmId: string; payload: string | null } | null),
};
let pontePresente = true;

vi.mock("../lib/_core/ios-alarm-kit-bridge", () => ({
  get alarmKit() {
    return pontePresente ? ponte : null;
  },
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import {
  isAlarmKitAvailable,
  alarmKitWeekdays,
  scheduleAlarmKitAlarm,
  cancelAlarmKitAlarm,
} from "../lib/ios-alarm-kit";
import type { Alarm } from "../lib/app-context";

const alarme = (over: Partial<Alarm> = {}): Alarm =>
  ({
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    time: "08:30",
    description: "Remédio da pressão",
    repeat: "daily",
    enabled: true,
    sound: true,
    vibration: true,
    ...over,
  }) as Alarm;

beforeEach(() => {
  pontePresente = true;
  vi.clearAllMocks();
  ponte.scheduleRepeatingAlarm.mockResolvedValue(true);
});

describe("disponibilidade", () => {
  it("disponível quando a ponte carregou", () => {
    expect(isAlarmKitAvailable()).toBe(true);
  });

  it("indisponível quando a ponte é null — cai no fallback, não fica sem alarme", () => {
    pontePresente = false;
    expect(isAlarmKitAvailable()).toBe(false);
  });
});

describe("dias da semana — 1=Dom..7=Sáb", () => {
  it("diário vira os 7 dias", () => {
    expect(alarmKitWeekdays(alarme({ repeat: "daily" }))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("dias úteis: seg-sex (JS 1..5) vira 2..6", () => {
    expect(alarmKitWeekdays(alarme({ repeat: "weekdays" }))).toEqual([2, 3, 4, 5, 6]);
  });

  it("fim de semana: dom+sáb (JS 0,6) vira 1 e 7", () => {
    expect(alarmKitWeekdays(alarme({ repeat: "weekends" }))).toEqual([1, 7]);
  });

  it("personalizado respeita a convenção 0=Dom da UI", () => {
    expect(
      alarmKitWeekdays(alarme({ repeat: "custom", customDays: [0, 3] }))
    ).toEqual([1, 4]);
  });
});

describe("agendamento", () => {
  it("manda hora, minuto e dias, com launchAppOnDismiss", async () => {
    await scheduleAlarmKitAlarm(alarme({ time: "08:30" }));
    const o = ponte.scheduleRepeatingAlarm.mock.calls[0][0];
    expect(o.hour).toBe(8);
    expect(o.minute).toBe(30);
    expect(o.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(o.launchAppOnDismiss).toBe(true);
  });

  it("NUNCA liga soneca nativa — ela reagenda sem o JS saber", async () => {
    await scheduleAlarmKitAlarm(alarme());
    const o = ponte.scheduleRepeatingAlarm.mock.calls[0][0];
    expect(o.doSnoozeIntent).toBeFalsy();
    expect(o.launchAppOnSnooze).toBeFalsy();
    expect(o.snoozeButtonLabel).toBeUndefined();
  });

  it("som do alarme vai COM extensão", async () => {
    await scheduleAlarmKitAlarm(alarme({ sound: true }));
    expect(ponte.scheduleRepeatingAlarm.mock.calls[0][0].soundName).toBe("alarm.mp3");
  });

  it("sem som não manda soundName", async () => {
    await scheduleAlarmKitAlarm(alarme({ sound: false }));
    expect(ponte.scheduleRepeatingAlarm.mock.calls[0][0].soundName).toBeUndefined();
  });

  it("id que não é UUID lança — o Swift recusaria em silêncio", async () => {
    await expect(scheduleAlarmKitAlarm(alarme({ id: "abc123" }))).rejects.toThrow(/UUID/);
  });

  it("recusa do nativo (false) vira exceção", async () => {
    ponte.scheduleRepeatingAlarm.mockResolvedValue(false);
    await expect(scheduleAlarmKitAlarm(alarme())).rejects.toThrow();
  });

  it("cancelar repassa o id", async () => {
    await cancelAlarmKitAlarm("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(ponte.cancelAlarm).toHaveBeenCalledWith("3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/ios-alarm-kit.test.ts`
Expected: FAIL — `Cannot find module '../lib/ios-alarm-kit'`.

- [ ] **Step 3: Escrever a ponte**

```ts
// lib/_core/ios-alarm-kit-bridge.ts
/**
 * Única fronteira com o expo-alarm-kit. Mesmo papel — e mesmos dois motivos —
 * do native-alarm-bridge.ts do Android:
 *
 * 1. A lib só é carregável no iOS 26+; abaixo disso o módulo nativo não
 *    registra, daí o require preguiçoso dentro de try/catch.
 * 2. O `require` não é interceptável em teste (vi.mock só age sobre imports
 *    ESM). Com ele isolado aqui, o teste mocka ESTE módulo e exercita o
 *    agendamento de ponta a ponta.
 */
import { Platform } from 'react-native';

export interface AlarmKitBridge {
  configure(appGroupIdentifier: string): boolean;
  requestAuthorization(): Promise<'authorized' | 'denied' | 'notDetermined'>;
  scheduleRepeatingAlarm(options: {
    id: string;
    hour: number;
    minute: number;
    weekdays: number[];
    title: string;
    soundName?: string;
    launchAppOnDismiss?: boolean;
    dismissPayload?: string;
    stopButtonLabel?: string;
    tintColor?: string;
  }): Promise<boolean>;
  cancelAlarm(id: string): Promise<boolean>;
  getAllAlarms(): string[];
  getLaunchPayload(): { alarmId: string; payload: string | null } | null;
}

export let alarmKit: AlarmKitBridge | null = null;

if (Platform.OS === 'ios') {
  try {
    alarmKit = require('expo-alarm-kit') as AlarmKitBridge;
  } catch (e) {
    // Esperado em iOS < 26: o módulo nativo não registra. Logamos o motivo
    // real em vez de engolir — se sumir num aparelho 26+, queremos ver.
    console.warn('[AlarmKit] indisponível:', e);
  }
}
```

- [ ] **Step 4: Escrever a fachada**

```ts
// lib/ios-alarm-kit.ts
/**
 * AlarmKit (iOS 26+) como alarme real. Ver
 * docs/superpowers/specs/2026-08-19-alarmkit-ios-design.md
 *
 * Duas recusas silenciosas do lado Swift viram exceção aqui, porque um alarme
 * de remédio que não foi agendado não pode passar por agendado:
 *   - id fora do formato UUID → `guard let uuid = UUID(uuidString:)` → false
 *   - agendamento recusado → Promise<boolean> false
 */
import { alarmKit } from './_core/ios-alarm-kit-bridge';
import { firingJsDays } from './alarm-fire-times';
import type { Alarm } from './app-context';

export const APP_GROUP = 'group.com.vigora.saude.alarms';

/** RFC 4122 — o mesmo formato que Crypto.randomUUID() (generateId) produz. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAlarmKitAvailable(): boolean {
  return alarmKit !== null;
}

/**
 * Dias no formato do AlarmKit (1=Dom..7=Sáb), a partir da fonte única da
 * convenção (firingJsDays, 0=Dom..6=Sáb). Não reimplemente a lista aqui: ela
 * já divergiu uma vez em três cópias e todo alarme semanal tocava um dia
 * depois (ver 6aa5b0f).
 */
export function alarmKitWeekdays(alarm: Alarm): number[] {
  const dias = firingJsDays(alarm);
  if (dias === 'every') return [1, 2, 3, 4, 5, 6, 7];
  return dias.map((d) => d + 1);
}

export async function requestAlarmKitAuthorization() {
  if (!alarmKit) return 'denied' as const;
  return alarmKit.requestAuthorization();
}

export async function scheduleAlarmKitAlarm(alarm: Alarm): Promise<void> {
  if (!alarmKit) throw new Error('AlarmKit indisponível neste aparelho');

  if (!UUID_RE.test(alarm.id)) {
    throw new Error(
      `Alarme ${alarm.id}: id não é UUID e o AlarmKit recusaria em silêncio`,
    );
  }

  const [hour, minute] = alarm.time.split(':').map(Number);
  const weekdays = alarmKitWeekdays(alarm);
  if (weekdays.length === 0) {
    throw new Error(`Alarme ${alarm.id}: nenhum dia da semana para agendar`);
  }

  const options = {
    id: alarm.id,
    hour,
    minute,
    weekdays,
    title: alarm.description || 'Hora do remédio',
    launchAppOnDismiss: true,
    dismissPayload: alarm.id,
    stopButtonLabel: 'Desligar',
    tintColor: '#0033CC',
    // soundName com extensão: 'alarm' sem extensão não tocou na medição da
    // Fase 0. Ausente = som padrão do sistema, que também toca em loop.
    ...(alarm.sound !== false ? { soundName: 'alarm.mp3' } : {}),
  };

  const ok = await alarmKit.scheduleRepeatingAlarm(options);
  if (!ok) {
    throw new Error(`Alarme ${alarm.id}: o AlarmKit recusou o agendamento`);
  }
}

export async function cancelAlarmKitAlarm(alarmId: string): Promise<void> {
  if (!alarmKit) return;
  await alarmKit.cancelAlarm(alarmId);
}

/** Dismiss que abriu o app, se houver. Consome (só vale uma vez). */
export function takeDismissal(): { alarmId: string; payload: string | null } | null {
  if (!alarmKit) return null;
  return alarmKit.getLaunchPayload();
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/ios-alarm-kit.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add lib/_core/ios-alarm-kit-bridge.ts lib/ios-alarm-kit.ts tests/ios-alarm-kit.test.ts
git commit -m "feat(ios): ponte e fachada do AlarmKit

Ponte isola o require (mesmo motivo do native-alarm-bridge: vi.mock não
intercepta require). Fachada traduz nosso Alarm para o AlarmKit e transforma
em exceção as duas recusas que o Swift faz em silêncio — id não-UUID e
agendamento negado. Dias vêm de firingJsDays, a fonte única; reimplementar a
lista foi o que fez todo alarme semanal tocar um dia depois."
```

---

### Task 3: Escolha de caminho e migração em `alarm-sync`

**Files:**
- Modify: `lib/alarm-sync.ts`
- Test: `tests/alarm-sync-alarmkit.test.ts`

**Interfaces:**
- Consumes: `isAlarmKitAvailable`, `scheduleAlarmKitAlarm`, `cancelAlarmKitAlarm` da Task 2; `cancelScheduledAlarmNotifications` de `lib/notifications-utils.ts`.
- Produces: `scheduleFullAlarm` e `cancelFullAlarm` cientes do AlarmKit. Nenhuma assinatura nova.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/alarm-sync-alarmkit.test.ts
/**
 * Os dois caminhos do iOS nunca podem coexistir para o mesmo alarme: seriam
 * dois disparos para o mesmo remédio. A migração é feita no agendamento —
 * quem entra cancela o outro.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let alarmKitDisponivel = true;
const agendarAlarmKit = vi.fn(async () => {});
const cancelarAlarmKit = vi.fn(async () => {});
const agendarNotificacao = vi.fn(async () => "notif-1" as string | null);
const cancelarNotificacoes = vi.fn(async () => 0);

vi.mock("../lib/ios-alarm-kit", () => ({
  isAlarmKitAvailable: () => alarmKitDisponivel,
  scheduleAlarmKitAlarm: (...a: unknown[]) => agendarAlarmKit(...(a as [])),
  cancelAlarmKitAlarm: (...a: unknown[]) => cancelarAlarmKit(...(a as [])),
}));

vi.mock("../lib/notifications-utils", () => ({
  scheduleAlarmNotification: (...a: unknown[]) => agendarNotificacao(...(a as [])),
  cancelScheduledAlarmNotifications: (...a: unknown[]) => cancelarNotificacoes(...(a as [])),
}));

vi.mock("../lib/native-alarm-manager", () => ({
  isNativeAlarmAvailable: false,
  scheduleNativeAlarm: vi.fn(async () => []),
  cancelNativeAlarm: vi.fn(async () => {}),
  cancelAllNativeAlarms: vi.fn(async () => {}),
}));

vi.mock("expo-notifications", () => ({
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelAllScheduledNotificationsAsync: vi.fn(async () => {}),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

vi.mock("@/lib/_core/auth", () => ({
  getUserInfo: vi.fn(async () => ({ openId: "u1" })),
  getSessionToken: vi.fn(async () => "t"),
}));

import { scheduleFullAlarm, cancelFullAlarm } from "../lib/alarm-sync";
import type { Alarm } from "../lib/app-context";

const alarme = (): Alarm =>
  ({
    id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    time: "08:00",
    description: "Remédio",
    repeat: "daily",
    enabled: true,
    sound: true,
    vibration: true,
  }) as Alarm;

beforeEach(() => {
  alarmKitDisponivel = true;
  vi.clearAllMocks();
  agendarNotificacao.mockResolvedValue("notif-1");
});

describe("iOS com AlarmKit disponível", () => {
  it("agenda pelo AlarmKit e não pela notificação", async () => {
    await scheduleFullAlarm(alarme());
    expect(agendarAlarmKit).toHaveBeenCalled();
    expect(agendarNotificacao).not.toHaveBeenCalled();
  });

  it("cancela as notificações do alarme — senão ele toca duas vezes", async () => {
    await scheduleFullAlarm(alarme());
    expect(cancelarNotificacoes).toHaveBeenCalledWith(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    );
  });
});

describe("iOS sem AlarmKit (abaixo de 26, ou indisponível)", () => {
  it("usa a notificação, como hoje", async () => {
    alarmKitDisponivel = false;
    const r = await scheduleFullAlarm(alarme());
    expect(agendarNotificacao).toHaveBeenCalled();
    expect(agendarAlarmKit).not.toHaveBeenCalled();
    expect(r.notificationId).toBe("notif-1");
  });

  it("cancela um alarme do AlarmKit que tenha sobrado", async () => {
    alarmKitDisponivel = false;
    await scheduleFullAlarm(alarme());
    expect(cancelarAlarmKit).toHaveBeenCalledWith(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
    );
  });
});

describe("cancelamento", () => {
  it("derruba os dois caminhos, não importa qual estava ativo", async () => {
    await cancelFullAlarm(alarme());
    expect(cancelarAlarmKit).toHaveBeenCalled();
    expect(cancelarNotificacoes).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/alarm-sync-alarmkit.test.ts`
Expected: FAIL — `scheduleFullAlarm` ainda não conhece o AlarmKit; `agendarAlarmKit` não é chamado.

- [ ] **Step 3: Implementar a escolha de caminho**

Em `lib/alarm-sync.ts`, acrescentar aos imports:

```ts
import {
  isAlarmKitAvailable,
  scheduleAlarmKitAlarm,
  cancelAlarmKitAlarm,
} from './ios-alarm-kit';
```

Substituir o bloco iOS de `scheduleFullAlarm` (hoje "2. iOS/Web fallback") por:

```ts
  // 2. iOS 26+: AlarmKit é o alarme de verdade — toca em loop e toma a tela,
  // em vez de uma notificação que soa uma vez e vira banner.
  if (isAlarmKitAvailable()) {
    await scheduleAlarmKitAlarm(alarm);
    // Migração: quem vinha do caminho antigo tem notificações agendadas para
    // este alarme. Sem cancelar, o remédio toca duas vezes.
    await cancelScheduledAlarmNotifications(alarm.id);
    updated.notificationId = undefined;
    return updated;
  }

  // 3. iOS <26 / AlarmKit indisponível: notificação com Critical Alerts.
  // Se havia alarme do AlarmKit (aparelho que perdeu a capacidade), sai antes.
  await cancelAlarmKitAlarm(alarm.id);
  const notificationId = await scheduleAlarmNotification(alarm);
```

Em `cancelFullAlarm`, antes do cancelamento das notificações:

```ts
  // Os dois caminhos, sempre: o alarme pode ter sido agendado por um deles e
  // cancelado depois de o aparelho mudar de capacidade.
  await cancelAlarmKitAlarm(alarm.id);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/alarm-sync-alarmkit.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS em tudo.

- [ ] **Step 5: Commit**

```bash
git add lib/alarm-sync.ts tests/alarm-sync-alarmkit.test.ts
git commit -m "feat(ios): AlarmKit vira o caminho de agendamento no iOS 26+

Escolha por capacidade (isAlarmKitAvailable), não por versão declarada: um
aparelho 26.x sem AlarmKit cai no fallback em vez de ficar sem alarme.

Migração nos dois sentidos no próprio agendamento — quem entra cancela o
outro caminho. Sem isso o remédio tocaria duas vezes em quem atualizar."
```

---

### Task 4: Permissão e confirmação pelo dismiss

**Files:**
- Modify: `app/_layout.tsx` (pedir permissão + drenar o dismiss no boot)
- Modify: `lib/monitoring-service.ts` (nada novo; só é consumido)
- Test: `tests/alarmkit-dismissal-confirm.test.ts`

**Interfaces:**
- Consumes: `takeDismissal`, `requestAlarmKitAuthorization` da Task 2; `enqueueConfirmation` de `lib/pending-confirmations.ts`; `flushPendingConfirmations` de `lib/monitoring-service.ts`.
- Produces: `confirmAlarmKitDismissal(): Promise<string | null>` em `lib/ios-alarm-kit.ts` — devolve o `alarmId` confirmado, ou `null`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/alarmkit-dismissal-confirm.test.ts
/**
 * O "Desligar" do AlarmKit É a confirmação. Se ela não chegar ao servidor, o
 * monitoring-job escala um alarme que o idoso ATENDEU e a família recebe
 * mensagem à toa.
 *
 * Princípio inegociável: nunca sintetizar um "responded" que não foi
 * observado. Num dead man's switch o falso "respondeu" esconde remédio
 * realmente perdido — é pior que incomodar a família.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let payload: { alarmId: string; payload: string | null } | null = null;
const enfileirar = vi.fn(async () => {});

vi.mock("../lib/_core/ios-alarm-kit-bridge", () => ({
  get alarmKit() {
    return {
      getLaunchPayload: () => payload,
      configure: () => true,
      requestAuthorization: async () => "authorized",
      scheduleRepeatingAlarm: async () => true,
      cancelAlarm: async () => true,
      getAllAlarms: () => [],
    };
  },
}));

vi.mock("../lib/pending-confirmations", () => ({
  enqueueConfirmation: (...a: unknown[]) => enfileirar(...(a as [])),
}));

vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));

import { confirmAlarmKitDismissal } from "../lib/ios-alarm-kit";

beforeEach(() => {
  payload = null;
  vi.clearAllMocks();
});

describe("confirmação pelo dismiss", () => {
  it("enfileira 'responded' quando o app abriu por um dismiss", async () => {
    payload = { alarmId: "a1", payload: "a1" };

    const id = await confirmAlarmKitDismissal();

    expect(id).toBe("a1");
    expect(enfileirar).toHaveBeenCalledWith(
      expect.objectContaining({ alarmId: "a1", status: "responded" })
    );
  });

  it("sem dismiss não inventa confirmação nenhuma", async () => {
    payload = null;

    const id = await confirmAlarmKitDismissal();

    expect(id).toBeNull();
    expect(enfileirar).not.toHaveBeenCalled();
  });

  it("payload sem alarmId não vira confirmação", async () => {
    payload = { alarmId: "", payload: null };

    expect(await confirmAlarmKitDismissal()).toBeNull();
    expect(enfileirar).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/alarmkit-dismissal-confirm.test.ts`
Expected: FAIL — `confirmAlarmKitDismissal is not a function`.

- [ ] **Step 3: Implementar em `lib/ios-alarm-kit.ts`**

```ts
import { enqueueConfirmation } from './pending-confirmations';

/**
 * Confirma ao servidor o alarme que o idoso desligou na tela do AlarmKit.
 *
 * Enfileira em vez de mandar direto: o app pode ter aberto sem rede (o alarme
 * da madrugada é o caso típico), e a fila já reenvia no bootstrap autenticado
 * do MonitoringInitializer. Devolve o alarmId confirmado, ou null.
 *
 * Só age sobre evidência: sem payload de dismiss, não confirma nada. Inferir
 * "respondeu" pela ausência esconderia um remédio de fato perdido.
 */
export async function confirmAlarmKitDismissal(): Promise<string | null> {
  const dismissal = takeDismissal();
  if (!dismissal?.alarmId) return null;

  await enqueueConfirmation({
    alarmId: dismissal.alarmId,
    scheduledAtIso: new Date().toISOString(),
    status: 'responded',
  });
  return dismissal.alarmId;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/alarmkit-dismissal-confirm.test.ts`
Expected: PASS.

- [ ] **Step 5: Ligar no boot do app**

Em `app/_layout.tsx`, no efeito de inicialização que já chama `setupNotificationChannels()`:

```ts
import { alarmKit } from '@/lib/_core/ios-alarm-kit-bridge';
import {
  APP_GROUP,
  isAlarmKitAvailable,
  requestAlarmKitAuthorization,
  confirmAlarmKitDismissal,
} from '@/lib/ios-alarm-kit';
import { flushPendingConfirmations } from '@/lib/monitoring-service';
```

```ts
      // AlarmKit: configure() PRECISA vir antes de qualquer outra chamada —
      // sem o App Group o intent de dismiss não registra nada (medido na
      // Fase 0: configure devolve false e o dismiss se perde).
      if (isAlarmKitAvailable()) {
        alarmKit?.configure(APP_GROUP);
        await requestAlarmKitAuthorization();

        // O app pode ter sido aberto pelo "Desligar" do alarme. Confirmar
        // aqui, no boot, é o caminho normal do dead man's switch.
        const confirmado = await confirmAlarmKitDismissal();
        if (confirmado) {
          await flushPendingConfirmations().catch(() => {});
        }
      }
```

- [ ] **Step 6: Rodar a suíte inteira e o tsc**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde, tsc limpo.

- [ ] **Step 7: Commit**

```bash
git add lib/ios-alarm-kit.ts app/_layout.tsx tests/alarmkit-dismissal-confirm.test.ts
git commit -m "feat(ios): o 'Desligar' do AlarmKit confirma o alarme ao servidor

Enfileira em vez de mandar direto — o alarme da madrugada abre o app sem rede
com frequência, e a fila de confirmações pendentes já reenvia no bootstrap.

Nunca sintetiza um 'responded' sem payload de dismiss. Num dead man's switch o
falso 'respondeu' esconde um remédio realmente perdido, o que é pior que
incomodar a família à toa."
```

---

### Task 5: Tela pós-dismiss e slider de volume

**Files:**
- Modify: `app/alarm-ring.tsx`
- Modify: `app/settings.tsx` (esconder o slider no iOS 26+)
- Test: `tests/alarmkit-ui.test.ts`

**Interfaces:**
- Consumes: `isAlarmKitAvailable` da Task 2.
- Produces: nada consumido por outras tasks.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// tests/alarmkit-ui.test.ts
/**
 * No iOS 26+ o alarme já tocou e já foi desligado na tela do sistema quando a
 * alarm-ring monta. Ela não pode: tocar som por cima, rodar countdown, nem
 * escalar — o alarme FOI atendido.
 *
 * E settings.alarmVolume deixa de valer: o AlarmKit usa o volume de alarme do
 * celular. Um controle que não faz nada é pior que controle nenhum.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const alarmRing = readFileSync(join(raiz, "app/alarm-ring.tsx"), "utf8");
const settings = readFileSync(join(raiz, "app/settings.tsx"), "utf8");

describe("alarm-ring no iOS 26+", () => {
  it("deriva o estado a partir da disponibilidade do AlarmKit", () => {
    expect(alarmRing).toMatch(/const vindoDoAlarmKit\s*=/);
  });

  it("o countdown é guardado por essa flag", () => {
    // O countdown é o que escala para a família. Rodá-lo depois de o idoso ter
    // desligado o alarme escalaria um alarme ATENDIDO. A guarda tem que estar
    // antes de qualquer initTimer/setInterval do disparo.
    const efeito = alarmRing.match(/initTimer[\s\S]{0,400}/);
    expect(efeito, "não achei o início do timer").not.toBeNull();
    expect(alarmRing).toMatch(/if \(vindoDoAlarmKit\) return;/);
  });

  it("não toca som por cima — o alarme do sistema já tocou e já parou", () => {
    const trechoSom = alarmRing.match(/vindoDoAlarmKit[\s\S]{0,600}/);
    expect(trechoSom).not.toBeNull();
  });
});

describe("slider de volume", () => {
  it("é escondido quando o volume é do sistema", () => {
    expect(settings).toMatch(/isAlarmKitAvailable/);
  });

  it("explica ao usuário em vez de sumir sem contexto", () => {
    expect(settings).toMatch(/volume do alarme do celular/i);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/alarmkit-ui.test.ts`
Expected: FAIL — nenhum dos dois arquivos menciona `isAlarmKitAvailable`.

- [ ] **Step 3: Ajustar a `alarm-ring`**

Adicionar o import e, no efeito que inicia o timer/som, desistir quando o disparo veio do AlarmKit:

```ts
import { isAlarmKitAvailable } from '@/lib/ios-alarm-kit';
```

```ts
  // iOS 26+: quando esta tela monta, o alarme JÁ tocou em tela cheia e o idoso
  // JÁ apertou "Desligar" — foi isso que abriu o app. Não há o que tocar nem o
  // que contar: rodar o countdown aqui escalaria para a família um alarme que
  // foi atendido. A tela vira confirmação: fala o remédio e mostra "Confirmado".
  const vindoDoAlarmKit = Platform.OS === 'ios' && isAlarmKitAvailable();
```

No efeito que inicia o timer do disparo, sair antes de qualquer coisa:

```ts
  useEffect(() => {
    if (vindoDoAlarmKit) return;
    // ... corpo atual do initTimer/countdown, sem alteração
  }, [/* deps atuais */]);
```

No efeito que sobe o som (o caminho `expo-audio`, só iOS), a mesma guarda:

```ts
  useEffect(() => {
    if (vindoDoAlarmKit) return;
    // ... corpo atual que toca alarm.mp3 em loop
  }, [/* deps atuais */]);
```

E na renderização dos botões, trocar a ação principal quando o alarme já foi atendido:

```tsx
{vindoDoAlarmKit ? (
  <>
    <Text style={styles.confirmado}>Confirmado</Text>
    <PressableScale onPress={handleSnooze} accessibilityLabel="Adiar 5 minutos">
      <Text>Adiar 5 min</Text>
    </PressableScale>
  </>
) : (
  /* bloco atual: "Desligar alarme" + countdown, sem alteração */
)}
```

A voz continua rodando nos dois casos — é ela que diz qual remédio é, e no caminho do AlarmKit é a primeira vez que o idoso ouve isso.

- [ ] **Step 4: Esconder o slider em `app/settings.tsx`**

```ts
import { isAlarmKitAvailable } from '@/lib/ios-alarm-kit';
```

Envolver o bloco do slider de volume:

```tsx
{isAlarmKitAvailable() ? (
  <Text style={/* estilo de texto auxiliar já usado na tela */}>
    Neste celular, o alarme toca no volume do alarme do celular. Ajuste pelos
    botões de volume enquanto o alarme estiver tocando.
  </Text>
) : (
  /* bloco atual do slider, sem alteração */
)}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run && npx tsc --noEmit`
Expected: tudo verde, tsc limpo.

- [ ] **Step 6: Commit**

```bash
git add app/alarm-ring.tsx app/settings.tsx tests/alarmkit-ui.test.ts
git commit -m "feat(ios): tela de confirmação pós-dismiss e volume do sistema

No iOS 26+ a alarm-ring monta DEPOIS de o idoso ter desligado o alarme na tela
do sistema — foi isso que abriu o app. Ela não toca som nem roda countdown:
contar aqui escalaria para a família um alarme que foi atendido.

O slider de volume some nesses aparelhos, com uma linha explicando que o
volume é o do celular. Controle que não faz nada é pior que controle nenhum."
```

---

## Validação final no aparelho

Nenhuma destas se prova no vitest. Roteiro, na ordem:

- [ ] iPhone **abaixo do iOS 26**: app instala, cria alarme, alarme toca — fallback intacto.
- [ ] iPhone **26+**: alarme toca em **loop**, em tela cheia, com o silencioso ligado.
- [ ] "Desligar" → app abre, fala o remédio, mostra "Confirmado"; o alarme aparece como respondido no histórico.
- [ ] Alarme de **dias úteis** dispara no segundo dia sem ninguém reabrir o app.
- [ ] Aparelho que já tinha alarmes agendados pelo caminho antigo: atualiza, e o alarme toca **uma vez** só.
- [ ] Configurações no 26+: o slider de volume não aparece; a explicação aparece.
- [ ] Desligar o alarme e **não** abrir o app por 10 min: a família NÃO recebe alerta (a confirmação chegou pelo `launchAppOnDismiss`).

## Riscos conhecidos

1. **Task 1 é portão de verdade.** Se as guardas precisarem ir para dentro da classe (Step 9), o patch cresce e passa a ser reaplicado à mão a cada atualização da lib. Se ficar grande demais, reabrir a decisão de módulo próprio — está registrada na spec.
2. **Reconciliação depende de `getLaunchPayload`**, que só devolve o dismiss que **abriu** o app. Se o intent falhar (1 em 9 na Fase 0), não há leitura durável do que ficou para trás. A spec marca isso como a verificar; se a lib não expuser, avaliar ler o `UserDefaults` do App Group direto.
3. **`alarm.vibration` não tem equivalente no AlarmKit.** No iOS 26+ a vibração passa a ser a do sistema. Confirmar no aparelho e, se a chave virar mentira, escondê-la como o slider de volume.
