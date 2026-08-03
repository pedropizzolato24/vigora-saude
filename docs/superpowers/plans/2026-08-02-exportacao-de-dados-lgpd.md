# Exportação de dados (LGPD Art. 18 V) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao usuário um botão "Baixar meus dados" que gera um JSON com tudo que o Vigora guarda sobre ele (aparelho + servidor), e mover "Excluir minha conta" de Configurações para uma "Zona perigosa" no rodapé do Perfil.

**Architecture:** Um endpoint tRPC novo (`userData.export`) devolve o que o servidor guarda, espelhando a lista de tabelas que `server/db-account.ts` apaga. Uma função pura (`lib/_core/data-export.ts`) monta o payload final e marca quando a parte do servidor faltou. Dois componentes de UI (`data-export-button`, `account-danger-zone`) encapsulam diálogo e estado, e a tela de Perfil apenas os invoca.

**Tech Stack:** TypeScript · React Native 0.81 + Expo 54 · Expo Router 6 · tRPC 11 + Zod · Drizzle/MySQL · Vitest 2.1.9 · `expo-file-system` 19 (já instalado como dep direta de `expo`) · `expo-sharing` 14

**Spec:** `docs/superpowers/specs/2026-08-02-exportacao-de-dados-lgpd-design.md`

## Global Constraints

Estas valem para TODA task deste plano:

- Todo texto de UI em **português brasileiro**.
- **Zero hex/RGB hardcoded.** Cores sempre por token: `useColors()` no modo normal, `a11yColors` (via `useAccessibility()`) no modo acessível.
- **Toda tela/componente novo precisa das duas versões**: modo normal e `isAccessibilityMode`.
- Alvo de toque **≥44px no modo normal, ≥60px no acessível**.
- **Nunca `Alert.alert()`** — usar `AppDialog` (via `useAppDialog()`) e `AppToast` (via `useAppToast()`).
- **Nunca logar dado de saúde.** Em `catch`, logar o motivo real (nunca `catch {}` mudo).
- Imports absolutos sempre via alias `@/` — nunca `../../../`.
- **Nenhum `any` novo.** Arquivos em kebab-case.
- Verificação de tipos: `npx tsc --noEmit` (precisa ficar limpo).
- Testes: `npx vitest run` (baseline atual: 330 passando, 1 skip).

---

### Task 1: Função pura que monta o payload

**Files:**
- Create: `lib/_core/data-export.ts`
- Test: `tests/data-export.test.ts`

**Interfaces:**
- Consumes: nada (primeira task).
- Produces:
  - `ExportLocalData`, `ExportServerData`, `ExportPayload` (tipos)
  - `buildExportPayload(input: { local: ExportLocalData; server: ExportServerData | null; serverUnavailable: boolean; appVersion: string; now?: number }): ExportPayload`
  - `AVISO_SERVIDOR_INDISPONIVEL: string`
  - `exportFileName(now?: number): string` → `vigora-meus-dados-AAAA-MM-DD.json`

- [ ] **Step 1: Write the failing test**

Create `tests/data-export.test.ts`:

```ts
/**
 * data-export.test.ts
 *
 * Cobre a montagem do payload de exportação (LGPD Art. 18 V): seções
 * completas quando o servidor responde, marcação explícita + aviso quando
 * não responde, e o nome de arquivo datado.
 */
import { describe, expect, it } from "vitest";
import {
  AVISO_SERVIDOR_INDISPONIVEL,
  buildExportPayload,
  exportFileName,
  type ExportLocalData,
  type ExportServerData,
} from "../lib/_core/data-export";

const LOCAL: ExportLocalData = {
  alarmes: [{ id: "a1", description: "Losartana" }],
  contatosDeEmergencia: [{ id: "c1", name: "Maria" }],
  anamnese: { fullName: "João" },
  metricasDeSaude: [{ type: "bloodPressure", value: "120/80" }],
  configuracoes: { theme: "light" },
  perfil: { photoUri: null },
};

const SERVER: ExportServerData = {
  conta: { nome: "João", email: "joao@example.com", telefone: null },
  dadosDaConta: { dataUpdatedAt: 123 },
  historicoDeAlarmes: [{ id: 1, status: "confirmed" }],
  alertasEnviados: [{ id: 1, contactsReached: 2 }],
  sinalDeVida: { lastHeartbeat: 456 },
  cuidadoresVinculados: [{ caregiverOpenId: "ana" }],
};

const NOW = Date.parse("2026-08-02T15:30:00.000Z");

describe("buildExportPayload", () => {
  it("inclui as seções local e servidor quando o servidor respondeu", () => {
    const payload = buildExportPayload({
      local: LOCAL,
      server: SERVER,
      serverUnavailable: false,
      appVersion: "1.0.0",
      now: NOW,
    });

    expect(payload.servidor_incluido).toBe(true);
    expect(payload.aviso).toBeUndefined();
    expect(payload.app_versao).toBe("1.0.0");
    expect(payload.gerado_em).toBe("2026-08-02T15:30:00.000Z");
    expect(payload.no_aparelho).toEqual(LOCAL);
    expect(payload.no_servidor).toEqual(SERVER);
  });

  it("marca servidor_incluido=false e injeta o aviso quando o servidor falhou", () => {
    const payload = buildExportPayload({
      local: LOCAL,
      server: null,
      serverUnavailable: true,
      appVersion: "1.0.0",
      now: NOW,
    });

    expect(payload.servidor_incluido).toBe(false);
    expect(payload.aviso).toBe(AVISO_SERVIDOR_INDISPONIVEL);
    expect(payload.no_servidor).toBeNull();
    // Os dados locais continuam presentes — o usuário não sai de mãos vazias.
    expect(payload.no_aparelho).toEqual(LOCAL);
  });

  it("trata server=null sem serverUnavailable como servidor sem dados", () => {
    const payload = buildExportPayload({
      local: LOCAL,
      server: null,
      serverUnavailable: false,
      appVersion: "1.0.0",
      now: NOW,
    });

    expect(payload.servidor_incluido).toBe(true);
    expect(payload.aviso).toBeUndefined();
    expect(payload.no_servidor).toBeNull();
  });

  it("gera nome de arquivo datado", () => {
    expect(exportFileName(NOW)).toBe("vigora-meus-dados-2026-08-02.json");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/data-export.test.ts`
Expected: FAIL — `Failed to resolve import "../lib/_core/data-export"`

- [ ] **Step 3: Write minimal implementation**

Create `lib/_core/data-export.ts`:

```ts
/**
 * data-export.ts
 *
 * Monta o payload de exportação de dados do titular (LGPD Art. 18, V —
 * portabilidade). Função pura, sem UI e sem I/O: quem busca os dados é o
 * componente; aqui só se decide o formato.
 *
 * O par export/delete é espelhado: as seções de `ExportServerData` cobrem as
 * mesmas tabelas que `server/db-account.ts` apaga. Tabela nova precisa entrar
 * nos DOIS lugares — senão o app passa a guardar dado que não exporta.
 *
 * As chaves do nível de topo são em português porque o arquivo é lido pelo
 * titular (ou pelo filho adulto), fora do app.
 */

/** O que está no aparelho (recorte do `state` do AppContext). */
export interface ExportLocalData {
  alarmes: unknown[];
  contatosDeEmergencia: unknown[];
  anamnese: unknown;
  metricasDeSaude: unknown[];
  configuracoes: unknown;
  perfil: unknown;
}

/** O que o servidor guarda, conforme devolvido por `userData.export`. */
export interface ExportServerData {
  conta: { nome: string | null; email: string | null; telefone: string | null } | null;
  dadosDaConta: unknown;
  historicoDeAlarmes: unknown[];
  alertasEnviados: unknown[];
  sinalDeVida: unknown;
  cuidadoresVinculados: unknown[];
}

export interface ExportPayload {
  gerado_em: string;
  app_versao: string;
  /** false quando a parte do servidor não pôde ser buscada. */
  servidor_incluido: boolean;
  /** Só presente quando `servidor_incluido` é false. */
  aviso?: string;
  no_aparelho: ExportLocalData;
  no_servidor: ExportServerData | null;
}

export const AVISO_SERVIDOR_INDISPONIVEL =
  'Os dados guardados no servidor NÃO puderam ser incluídos porque não houve ' +
  'conexão no momento em que este arquivo foi gerado. O que está aqui é ' +
  'somente o que estava no seu aparelho. Para receber o arquivo completo, ' +
  'gere novamente com internet ou escreva para privacidade@vigora.com.br.';

export function buildExportPayload(input: {
  local: ExportLocalData;
  server: ExportServerData | null;
  serverUnavailable: boolean;
  appVersion: string;
  now?: number;
}): ExportPayload {
  const { local, server, serverUnavailable, appVersion } = input;
  const now = input.now ?? Date.now();

  return {
    gerado_em: new Date(now).toISOString(),
    app_versao: appVersion,
    servidor_incluido: !serverUnavailable,
    ...(serverUnavailable ? { aviso: AVISO_SERVIDOR_INDISPONIVEL } : {}),
    no_aparelho: local,
    no_servidor: server,
  };
}

/** `vigora-meus-dados-AAAA-MM-DD.json` — data local do aparelho. */
export function exportFileName(now: number = Date.now()): string {
  const d = new Date(now);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `vigora-meus-dados-${yyyy}-${mm}-${dd}.json`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/data-export.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 5: Commit**

```bash
git add lib/_core/data-export.ts tests/data-export.test.ts
git commit -m "feat(lgpd): funcao pura que monta o payload de exportacao de dados"
```

---

### Task 2: Endpoint `userData.export`

**Files:**
- Modify: `server/routers.ts` (imports no topo; novo procedure dentro de `userData: router({...})`, que hoje vai da linha 239 à 280)
- Test: `tests/user-data-export.test.ts`

**Interfaces:**
- Consumes: os tipos de `lib/_core/data-export.ts` como contrato de formato (o servidor devolve exatamente o shape de `ExportServerData`).
- Produces: `appRouter.userData.export` — query autenticada, sem input, retorna `ExportServerData`.

**Helpers de banco que já existem e devem ser reusados (não criar novos):**
- `getUserByOpenId(openId)` e `getUserData(openId)` — de `./db`
- `getAlarmEventHistory(openId, limit)`, `getWarningHistory(openId, limit)`, `getAccountLiveness(openId)` — de `./db-monitoring`
- `getActiveCaregiversForMonitored(monitoredOpenId)` — de `./db-links`

- [ ] **Step 1: Write the failing test**

Create `tests/user-data-export.test.ts`:

```ts
/**
 * user-data-export.test.ts
 *
 * Cobre o endpoint userData.export (LGPD Art. 18, V): gate de autenticação,
 * escopo pelo openId do chamador (nunca por input) e a garantia de que
 * segredos operacionais não vazam no payload.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../server/_core/context";
import type { User } from "../drizzle/schema";

const alarmsByOpenId = new Map<string, unknown[]>();
const warningsByOpenId = new Map<string, unknown[]>();

vi.mock("../server/db-monitoring", () => ({
  getAlarmEventHistory: vi.fn(async (openId: string) => alarmsByOpenId.get(openId) ?? []),
  getWarningHistory: vi.fn(async (openId: string) => warningsByOpenId.get(openId) ?? []),
  getAccountLiveness: vi.fn(async (openId: string) => ({ openId, lastHeartbeat: 111 })),
}));

vi.mock("../server/db-links", () => ({
  getActiveCaregiversForMonitored: vi.fn(async () => []),
  createInvite: vi.fn(),
  consumeInviteByCode: vi.fn(),
  getActiveLinkForCaregiver: vi.fn(),
  getInviteByCode: vi.fn(),
  getRecentMissedEventsForAccount: vi.fn(async () => []),
  getRecentWarningsForAccount: vi.fn(async () => []),
  revokeLink: vi.fn(),
  upsertActiveLink: vi.fn(),
}));

vi.mock("../server/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../server/db")>();
  return {
    ...actual,
    getUserByOpenId: vi.fn(async (openId: string) => ({
      name: "João",
      email: "joao@example.com",
      phone: null,
      openId,
    })),
    getUserData: vi.fn(async () => ({
      anamnesis: { fullName: "João" },
      emergencyContacts: [],
      alarms: [],
      settings: null,
      healthMetrics: [],
      profile: null,
      dataUpdatedAt: 42,
    })),
  };
});

import { appRouter } from "../server/routers";

function makeUser(openId: string): User {
  return {
    id: 1,
    openId,
    name: "Test User",
    email: "test@example.com",
    phone: null,
    userType: null,
    birthDate: null,
    bloodType: null,
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function makeCtx(user: User | null): TrpcContext {
  return {
    user,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {
      clearCookie: () => undefined,
      cookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  alarmsByOpenId.clear();
  warningsByOpenId.clear();
});

describe("userData.export", () => {
  it("rejeita chamador não autenticado", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.userData.export()).rejects.toThrowError(
      /login|UNAUTHED|UNAUTHORIZED/i
    );
  });

  it("devolve todas as seções para o usuário autenticado", async () => {
    alarmsByOpenId.set("maria", [{ id: 1, status: "confirmed" }]);
    warningsByOpenId.set("maria", [{ id: 9, contactsReached: 2 }]);

    const caller = appRouter.createCaller(makeCtx(makeUser("maria")));
    const result = await caller.userData.export();

    expect(result.conta).toEqual({
      nome: "João",
      email: "joao@example.com",
      telefone: null,
    });
    expect(result.historicoDeAlarmes).toHaveLength(1);
    expect(result.alertasEnviados).toHaveLength(1);
    expect(result.sinalDeVida).toBeTruthy();
    expect(result.cuidadoresVinculados).toEqual([]);
    expect(result.dadosDaConta).toBeTruthy();
  });

  it("usa ctx.user.openId como escopo — cada chamador recebe o seu", async () => {
    const { getAlarmEventHistory } = await import("../server/db-monitoring");

    alarmsByOpenId.set("maria", [{ id: 1 }]);

    const maria = appRouter.createCaller(makeCtx(makeUser("maria")));
    const mariaResult = await maria.userData.export();
    expect(mariaResult.historicoDeAlarmes).toHaveLength(1);
    expect(getAlarmEventHistory).toHaveBeenCalledWith("maria", expect.any(Number));

    const bob = appRouter.createCaller(makeCtx(makeUser("bob")));
    const bobResult = await bob.userData.export();
    expect(bobResult.historicoDeAlarmes).toHaveLength(0);
    expect(getAlarmEventHistory).toHaveBeenCalledWith("bob", expect.any(Number));
  });

  it("não vaza segredos operacionais no payload", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser("maria")));
    const result = await caller.userData.export();

    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/authCodes|auth_codes/i);
    expect(serialized).not.toMatch(/pushTokens|push_tokens|ExponentPushToken/i);
    expect(serialized).not.toMatch(/linkInvites|link_invites/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/user-data-export.test.ts`
Expected: FAIL — `caller.userData.export is not a function`

- [ ] **Step 3: Write minimal implementation**

Em `server/routers.ts`, adicione aos imports do topo (junto dos que já existem nas linhas 13-15):

```ts
import { getAccountLiveness, getAlarmEventHistory, getWarningHistory } from "./db-monitoring";
import { getActiveCaregiversForMonitored } from "./db-links";
```

Dentro de `userData: router({ ... })`, logo depois do procedure `put` (que termina na linha 279) e antes do `})` que fecha o `userData` na linha 280, adicione:

```ts
    /**
     * Exportação de dados do titular (LGPD Art. 18, V — portabilidade).
     *
     * Devolve TUDO que o servidor guarda sobre a conta do chamador. As seções
     * espelham as tabelas que `server/db-account.ts` apaga na exclusão de
     * conta — tabela nova precisa entrar nos dois lugares.
     *
     * Fora de propósito, com justificativa: `auth_codes` são segredos de login
     * em trânsito (exportar seria falha de segurança); `push_tokens` são
     * identificadores de aparelho sem valor para o titular; `link_invites` são
     * convites transitórios que expiram sozinhos.
     *
     * Escopo sempre por `ctx.user.openId` — nunca por input do cliente.
     */
    export: protectedProcedure.query(async ({ ctx }) => {
      const openId = ctx.user.openId;

      // Teto alto em vez de paginação: o volume por conta é pequeno (ordem de
      // centenas) e a exportação precisa ser completa para valer como
      // portabilidade.
      const LIMITE_EXPORTACAO = 10_000;

      const [user, data, historicoDeAlarmes, alertasEnviados, sinalDeVida, cuidadores] =
        await Promise.all([
          getUserByOpenId(openId),
          getUserData(openId),
          getAlarmEventHistory(openId, LIMITE_EXPORTACAO),
          getWarningHistory(openId, LIMITE_EXPORTACAO),
          getAccountLiveness(openId),
          getActiveCaregiversForMonitored(openId),
        ]);

      return {
        conta: user
          ? { nome: user.name ?? null, email: user.email ?? null, telefone: user.phone ?? null }
          : null,
        dadosDaConta: data
          ? {
              anamnese: data.anamnesis ?? null,
              contatosDeEmergencia: data.emergencyContacts ?? [],
              alarmes: data.alarms ?? [],
              configuracoes: data.settings ?? null,
              metricasDeSaude: data.healthMetrics ?? [],
              perfil: data.profile ?? null,
              atualizadoEm: data.dataUpdatedAt ?? 0,
            }
          : null,
        historicoDeAlarmes,
        alertasEnviados,
        sinalDeVida: sinalDeVida ?? null,
        cuidadoresVinculados: cuidadores.map((c) => ({
          caregiverOpenId: c.caregiverOpenId,
          relationship: c.relationship,
          vinculadoEm: c.createdAt instanceof Date ? c.createdAt.getTime() : c.createdAt,
        })),
      };
    }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/user-data-export.test.ts`
Expected: PASS — 4 testes

- [ ] **Step 5: Adicionar o comentário-espelho no db-account**

Em `server/db-account.ts`, no bloco de comentário do topo do arquivo (que hoje termina em "...satisfies the post-incident containment requirement too."), acrescente uma linha final antes do `*/`:

```
 *
 * ESPELHO: `userData.export` em server/routers.ts exporta estas mesmas tabelas.
 * Tabela nova precisa entrar nos dois lugares — senão o app guarda dado que
 * não exporta, ou exporta dado que não apaga.
```

- [ ] **Step 6: Verificar tipos e suíte completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc sem saída; suíte com os 4 testes novos somados ao baseline

- [ ] **Step 7: Commit**

```bash
git add server/routers.ts server/db-account.ts tests/user-data-export.test.ts
git commit -m "feat(lgpd): endpoint userData.export com o que o servidor guarda"
```

---

### Task 3: Botão "Baixar meus dados"

**Files:**
- Create: `components/data-export-button.tsx`

**Interfaces:**
- Consumes: `buildExportPayload`, `exportFileName`, `ExportLocalData`, `ExportServerData` de `@/lib/_core/data-export`; `appRouter.userData.export` via `trpc.userData.export`.
- Produces: `<DataExportButton />` — sem props. Lê o estado local do `useAppContext()` por conta própria.

**Nota sobre a API do expo-file-system 19:** a v19 usa classes (`new File(Paths.cache, nome)` + `file.write(texto)` **síncrono**), não a API antiga de `writeAsStringAsync`. A antiga ficou em `expo-file-system/legacy` — **não usar**.

- [ ] **Step 1: Escrever o componente**

Create `components/data-export-button.tsx`:

```tsx
/**
 * DataExportButton
 *
 * "Baixar meus dados" — exportação de dados do titular (LGPD Art. 18, V).
 * Busca o que o servidor guarda, junta com o que está no aparelho, escreve um
 * JSON e abre o compartilhamento nativo.
 *
 * Fallback deliberado: se o servidor não responder (offline, 503, timeout), o
 * arquivo é gerado assim mesmo com os dados locais e marcado com
 * `servidor_incluido: false` + aviso. O usuário nunca sai de mãos vazias.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text } from 'react-native';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { AppToast, useAppToast } from '@/components/app-toast';
import { useAccessibility } from '@/lib/accessibility-context';
import { useAppContext } from '@/lib/app-context';
import {
  buildExportPayload,
  exportFileName,
  type ExportLocalData,
  type ExportServerData,
} from '@/lib/_core/data-export';
import { trpc } from '@/lib/trpc';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/hooks/use-font-size';

export function DataExportButton() {
  const { state } = useAppContext();
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { toastProps, showToast } = useAppToast();
  const [isExporting, setIsExporting] = useState(false);
  const exportQuery = trpc.useUtils().userData.export;

  const handleExport = async () => {
    if (isExporting) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsExporting(true);

    try {
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
        server = (await exportQuery.fetch()) as ExportServerData;
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

      const file = new File(Paths.cache, exportFileName());
      file.write(JSON.stringify(payload, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Baixar meus dados',
          UTI: 'public.json',
        });
      } else {
        showDialog({
          title: 'Compartilhamento indisponível',
          message: 'Não foi possível abrir o compartilhamento neste aparelho.',
          variant: 'error',
          buttons: [{ text: 'OK' }],
        });
        return;
      }

      if (serverUnavailable) {
        showToast({
          message: 'Arquivo gerado só com os dados do aparelho — sem conexão com o servidor.',
          variant: 'warning',
        });
      }
    } catch (error) {
      console.error('[DataExport] falha ao gerar o arquivo:', error);
      showDialog({
        title: 'Não foi possível baixar',
        message:
          'Houve um erro ao gerar o arquivo com os seus dados. Tente novamente em instantes.',
        variant: 'error',
        buttons: [{ text: 'OK' }],
      });
    } finally {
      setIsExporting(false);
    }
  };

  const c = isAccessibilityMode
    ? { border: ac.primary, text: ac.primary, surface: ac.surface }
    : { border: colors.primary, text: colors.primary, surface: colors.surface };

  return (
    <>
      <Pressable
        onPress={handleExport}
        disabled={isExporting}
        accessibilityRole="button"
        accessibilityLabel="Baixar meus dados em arquivo"
        accessibilityHint="Gera um arquivo com todos os seus dados e abre o compartilhamento"
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: isAccessibilityMode ? 14 : 8,
            minHeight: isAccessibilityMode ? 64 : fs.touch(56),
            borderRadius: isAccessibilityMode ? 20 : 12,
            borderWidth: isAccessibilityMode ? 3 : 2,
            borderColor: c.border,
            backgroundColor: c.surface,
            paddingHorizontal: 16,
            opacity: isExporting ? 0.6 : pressed ? 0.8 : 1,
          },
        ]}
      >
        {isExporting ? (
          <ActivityIndicator size="small" color={c.text} />
        ) : (
          <MaterialIcons name="download" size={isAccessibilityMode ? 32 : 22} color={c.text} />
        )}
        <Text
          style={{
            fontSize: isAccessibilityMode ? af.xl : fs.scaled(17),
            fontWeight: '800',
            color: c.text,
          }}
        >
          {isExporting ? 'Preparando...' : 'Baixar meus dados'}
        </Text>
      </Pressable>
      <AppDialog {...dialogProps} />
      <AppToast {...toastProps} />
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída.

`lib/trpc.ts` exporta `trpc = createTRPCReact<AppRouter>()` (@trpc/react-query v11), então
`trpc.useUtils().userData.export.fetch()` é a forma correta de buscar de modo imperativo —
no clique, não em render.

- [ ] **Step 3: Commit**

```bash
git add components/data-export-button.tsx
git commit -m "feat(lgpd): botao 'Baixar meus dados' com fallback local"
```

---

### Task 4: Componente da zona perigosa

**Files:**
- Create: `components/account-danger-zone.tsx`

**Interfaces:**
- Consumes: `useDeleteAccount(clearLocalData?)` de `@/hooks/use-delete-account` — retorna `{ runDeleteAccount(): Promise<void>; isDeleting: boolean }`.
- Produces: `<AccountDangerZone clearLocalData={...} />` — prop opcional `clearLocalData?: () => void | Promise<void>`, repassada ao hook. É prop (e não hardcoded) porque as árvores do monitorado e do cuidador limpam contextos locais diferentes.

O texto do diálogo de confirmação é **cópia literal** do que existe hoje em `app/(tabs)/settings.tsx:401-427` — não reescrever.

- [ ] **Step 1: Escrever o componente**

Create `components/account-danger-zone.tsx`:

```tsx
/**
 * AccountDangerZone
 *
 * Caixa "Zona perigosa" com a exclusão definitiva de conta (LGPD Art. 18, VI).
 * Isolada num bloco delimitado, no rodapé da tela, para separar visualmente o
 * que é irreversível do resto — mesma ideia da danger zone do GitHub.
 *
 * `clearLocalData` é prop porque monitorado e cuidador limpam contextos locais
 * diferentes; o hook já foi desenhado para receber essa função.
 */
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppDialog, useAppDialog } from '@/components/app-dialog';
import { useAccessibility } from '@/lib/accessibility-context';
import { useDeleteAccount } from '@/hooks/use-delete-account';
import { useColors } from '@/hooks/use-colors';
import { useFontSize } from '@/hooks/use-font-size';

interface AccountDangerZoneProps {
  /** Limpeza do estado local da árvore que hospeda o componente. */
  clearLocalData?: () => void | Promise<void>;
}

export function AccountDangerZone({ clearLocalData }: AccountDangerZoneProps) {
  const colors = useColors();
  const fs = useFontSize();
  const { isAccessibilityMode, a11yColors: ac, a11yFontSize: af } = useAccessibility();
  const { dialogProps, showDialog } = useAppDialog();
  const { runDeleteAccount, isDeleting } = useDeleteAccount(clearLocalData);

  const handleDeleteAccount = () => {
    if (isDeleting) return;
    showDialog({
      title: 'Excluir minha conta',
      message:
        'Esta ação é PERMANENTE. Apaga sua conta e todos os seus dados dos nossos servidores — perfil, anamnese, histórico de saúde, contatos, alarmes e vínculos com cuidadores. Não há como desfazer.',
      variant: 'confirm',
      buttons: [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir conta',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
            try {
              await runDeleteAccount();
            } catch (error) {
              console.error('[DangerZone] falha ao excluir conta:', error);
              showDialog({
                title: 'Não foi possível excluir',
                message:
                  'Houve um erro ao excluir sua conta no servidor. Seus dados não foram apagados. Tente novamente em instantes; se persistir, verifique sua conexão.',
                variant: 'error',
                buttons: [{ text: 'OK' }],
              });
            }
          },
        },
      ],
    });
  };

  const c = isAccessibilityMode
    ? { error: ac.error, surface: ac.surface, muted: ac.muted, background: ac.background }
    : { error: colors.error, surface: colors.surface, muted: colors.muted, background: colors.background };

  const titleSize = isAccessibilityMode ? af.lg : fs.scaled(16);
  const bodySize = isAccessibilityMode ? af.sm : fs.scaled(14);
  const buttonSize = isAccessibilityMode ? af.md : fs.scaled(16);

  return (
    <>
      <View
        style={{
          borderWidth: 2,
          borderColor: c.error,
          borderRadius: isAccessibilityMode ? 20 : 12,
          backgroundColor: c.background,
          padding: 16,
          gap: 12,
          marginTop: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MaterialIcons name="warning" size={isAccessibilityMode ? 28 : 20} color={c.error} />
          <Text style={{ fontSize: titleSize, fontWeight: '900', color: c.error }}>
            Zona perigosa
          </Text>
        </View>

        <Text style={{ fontSize: bodySize, color: c.muted }}>
          Excluir a conta apaga permanentemente todos os seus dados dos nossos servidores.
          Não há como desfazer.
        </Text>

        <Pressable
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          accessibilityRole="button"
          accessibilityLabel="Excluir minha conta e todos os dados do servidor"
          style={({ pressed }) => [
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              minHeight: isAccessibilityMode ? 64 : fs.touch(56),
              borderRadius: isAccessibilityMode ? 16 : 12,
              borderWidth: isAccessibilityMode ? 3 : 2,
              borderColor: c.error,
              backgroundColor: c.surface,
              paddingHorizontal: 16,
              opacity: isDeleting ? 0.6 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons name="no-accounts" size={isAccessibilityMode ? 26 : 20} color={c.error} />
          <Text style={{ fontSize: buttonSize, fontWeight: '800', color: c.error }}>
            {isDeleting ? 'Excluindo...' : 'Excluir minha conta'}
          </Text>
        </Pressable>
      </View>
      <AppDialog {...dialogProps} />
    </>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem saída.

- [ ] **Step 3: Commit**

```bash
git add components/account-danger-zone.tsx
git commit -m "feat(ui): componente da zona perigosa com exclusao de conta"
```

---

### Task 5: Ligar no Perfil e remover de Configurações

**Files:**
- Modify: `app/(tabs)/profile.tsx` (dois pontos de inserção: modo acessível após a linha 293; modo normal após a linha 438)
- Modify: `app/(tabs)/settings.tsx` (remover o handler das linhas 397-428, a chamada do hook na linha 192, o import na linha 31, e os dois blocos de UI: 761-790 e ~1615-1640)

**Interfaces:**
- Consumes: `<DataExportButton />` (Task 3) e `<AccountDangerZone clearLocalData={...} />` (Task 4).
- Produces: nada para tasks seguintes.

- [ ] **Step 1: Adicionar os imports no profile.tsx**

Junto dos imports já existentes no topo de `app/(tabs)/profile.tsx`:

```tsx
import { AccountDangerZone } from '@/components/account-danger-zone';
import { DataExportButton } from '@/components/data-export-button';
```

- [ ] **Step 2: Inserir no modo acessível**

Em `app/(tabs)/profile.tsx`, o modo acessível hoje termina com o botão "Sair da Conta" fechando em `</TouchableOpacity>` na linha 293, seguido de `</ScrollView>`. Insira **entre** os dois:

```tsx
          <DataExportButton />
          <AccountDangerZone clearLocalData={() => dispatch({ type: 'CLEAR_ALL_DATA' })} />
```

Ordem final do bloco: Salvar Perfil → Baixar meus dados → Sair da Conta → Zona perigosa.
Portanto o `<DataExportButton />` vai **antes** do bloco de logout (linha 285) e o `<AccountDangerZone />` **depois** do `</TouchableOpacity>` da linha 293.

- [ ] **Step 3: Inserir no modo normal**

Em `app/(tabs)/profile.tsx`, modo normal: o botão "Salvar Perfil" fecha na linha 427 e o de logout vai das linhas 429-438, seguido de `<View style={{ height: 100 }} />` na linha 440.

Insira `<DataExportButton />` entre a linha 427 e o comentário `{/* Logout ... */}` da linha 429, e `<AccountDangerZone />` entre o `</TouchableOpacity>` da linha 438 e o `<View style={{ height: 100 }} />` da linha 440:

```tsx
        <DataExportButton />
```

e depois do logout:

```tsx
        <AccountDangerZone clearLocalData={() => dispatch({ type: 'CLEAR_ALL_DATA' })} />
```

`dispatch` já está disponível no componente (`const { state, dispatch } = useAppContext();`, linha 43).

- [ ] **Step 4: Remover de settings.tsx**

Em `app/(tabs)/settings.tsx`, remova nesta ordem (de baixo para cima, para os números de linha não se deslocarem):

1. O bloco de UI do modo normal (aprox. linhas 1615-1640): o `<Pressable>` com `accessibilityLabel="Excluir minha conta e todos os dados do servidor"` e o texto explicativo que o acompanha.
2. O bloco de UI do modo acessível (linhas 761-790): a `<View>` que abre com o comentário `{/* Excluir minha conta (LGPD Art. 18 VI) — paridade no Modo Acessível */}`.
3. A função `handleDeleteAccount` inteira (linhas 397-428, incluindo o comentário das linhas 397-398).
4. A linha 192: `const { runDeleteAccount, isDeleting } = useDeleteAccount(() => dispatch({ type: 'CLEAR_ALL_DATA' }));`
5. A linha 31: `import { useDeleteAccount } from '@/hooks/use-delete-account';`

- [ ] **Step 5: Limpar imports órfãos criados por ESTA remoção**

Rode `npx tsc --noEmit` e trate apenas os avisos causados pela remoção acima. Verifique especificamente se `Haptics`, `Platform` e `MaterialIcons` ainda são usados em outros pontos de `settings.tsx` antes de remover qualquer import — todos têm outros usos prováveis no arquivo.

**Não remova código morto pré-existente não relacionado** (regra 3 do CLAUDE.md). Se encontrar algum, mencione ao final, não apague.

- [ ] **Step 6: Verificar tipos e suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc sem saída; suíte verde.

- [ ] **Step 7: Verificação manual no aparelho**

Confirme, nos **dois** modos de UI (normal e acessível):
1. Perfil mostra, na ordem: Salvar Perfil → Baixar meus dados → Sair da Conta → caixa Zona perigosa.
2. "Baixar meus dados" gera o JSON e abre a folha de compartilhamento.
3. Com o modo avião ligado, o mesmo botão ainda gera o arquivo, mostra o toast de aviso, e o JSON traz `"servidor_incluido": false` com o campo `aviso`.
4. Configurações não tem mais nenhuma menção a excluir conta.
5. Testar em tema claro **e** escuro.

- [ ] **Step 8: Commit**

```bash
git add app/\(tabs\)/profile.tsx app/\(tabs\)/settings.tsx
git commit -m "feat(perfil): exportacao de dados e zona perigosa saem de configuracoes"
```

---

### Task 6: Paridade no fluxo do cuidador

> **Escopo:** esta task não estava no spec original. Foi acrescentada porque o
> cuidador também é titular de dados (nome, e-mail, vínculos) e o direito de
> portabilidade do Art. 18, V vale igualmente para ele — entregar o export só
> para o monitorado deixaria uma lacuna de conformidade. O fluxo do cuidador
> **não tem tela de Perfil** (só `_layout`, `alerts`, `index`, `link`, `person`,
> `settings`), então lá os dois blocos ficam no rodapé de Configurações mesmo.
> Se preferir adiar, pule esta task — as anteriores funcionam sem ela.

**Files:**
- Modify: `app/(caregiver-tabs)/settings.tsx` (hoje importa `useDeleteAccount` na linha 16 e o chama na linha 43)

**Interfaces:**
- Consumes: `<DataExportButton />` e `<AccountDangerZone clearLocalData={...} />`.

- [ ] **Step 1: Remover a chamada do hook e o handler**

Em `app/(caregiver-tabs)/settings.tsx`, remova:

1. O bloco de UI da exclusão (em volta das linhas 325-340 — o `<Pressable>` com
   `accessibilityLabel="Excluir minha conta e todos os dados do servidor"`).
2. O handler de confirmação que começa perto da linha 125 (`title: 'Excluir minha conta'`).
3. A chamada do hook nas linhas 43-46:

```tsx
  const { runDeleteAccount, isDeleting } = useDeleteAccount(async () => {
    clearLinkedMonitored();
    await AsyncStorage.multiRemove(['vigora_caregiver_state']);
  });
```

4. O import da linha 16: `import { useDeleteAccount } from '@/hooks/use-delete-account';`

- [ ] **Step 2: Adicionar os componentes compartilhados**

Imports:

```tsx
import { AccountDangerZone } from '@/components/account-danger-zone';
import { DataExportButton } from '@/components/data-export-button';
```

No rodapé da tela (mesma posição onde estava o botão removido):

```tsx
        <DataExportButton />
        <AccountDangerZone
          clearLocalData={async () => {
            clearLinkedMonitored();
            await AsyncStorage.multiRemove(['vigora_caregiver_state']);
          }}
        />
```

A função de limpeza é **exatamente** a que estava nas linhas 43-46 — a árvore do cuidador
usa contexto diferente da do monitorado, e é por isso que `clearLocalData` é prop.
`clearLinkedMonitored` vem de `useCaregiverContext()`, já desestruturado na linha 40.

Depois de remover o handler, confira se `AsyncStorage` ainda tem outros usos no arquivo
antes de mexer no import dele — o trecho acima continua usando.

- [ ] **Step 3: Verificar tipos e suíte**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc sem saída; suíte verde.

- [ ] **Step 4: Verificação manual**

Com uma conta de cuidador, nos dois modos de UI: o export gera arquivo com os dados da conta do cuidador (não os da pessoa acompanhada), e a zona perigosa exclui a conta do cuidador.

- [ ] **Step 5: Commit**

```bash
git add app/\(caregiver-tabs\)/settings.tsx
git commit -m "feat(cuidador): paridade de exportacao de dados e zona perigosa"
```

---

## Fechamento

Depois da última task executada:

- [ ] `npx tsc --noEmit` limpo
- [ ] `npx vitest run` verde (baseline 330 + 8 novos)
- [ ] Atualizar `docs/claude/roadmap.md`: marcar os checkboxes do item 5 (arquivo é local, fora do git por escolha do Pedro)
- [ ] `git push`
