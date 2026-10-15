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

  it("com o app aberto, pede a lista gerenciada a cada 5 minutos (push silencioso não chega ao JS)", () => {
    const init = read("components/monitoring-initializer.tsx");
    const i = init.indexOf("MANAGED_POLL_INTERVAL_MS);");
    expect(i).toBeGreaterThan(-1);
    expect(init).toMatch(/const MANAGED_POLL_INTERVAL_MS = 5 \* 60 \* 1000;/);
    const efeito = init.slice(init.lastIndexOf("useEffect(", i), init.indexOf("}, []);", i));
    expect(efeito).toMatch(/setInterval\(/);
    expect(efeito).toMatch(/!initializedRef\.current \|\| AppState\.currentState !== "active"\) return;/);
    expect(efeito).toMatch(/requestManagedSync\(\);/);
    expect(efeito).toMatch(/clearInterval\(/);
  });

  it("não sincroniza enquanto o estado salvo carrega, e sincroniza quando isLoading vira false", () => {
    const init = read("components/monitoring-initializer.tsx");
    const corpo = init.slice(init.indexOf("const runManagedSync"), init.indexOf("}, [dispatch]);"));
    expect(corpo).toMatch(/stateRef\.current\.isLoading\) return;/);
    expect(init).toMatch(/state\.isLoading \|\| !initializedRef\.current[\s\S]*void runManagedSync\(\);[\s\S]*\[state\.isLoading, runManagedSync\]/);
  });

  it("a rodada confere a conta ativa (openId capturado no início)", () => {
    const init = read("components/monitoring-initializer.tsx");
    expect(init).toMatch(/const openId = user\.openId;/);
    expect(init).toMatch(/isCurrentAccount: async \(\) => \(await Auth\.getUserInfo\(\)\)\?\.openId === openId/);
  });

  it("conta de cuidador nunca chama managedAlarms.mine (a rota responde FORBIDDEN)", () => {
    const init = read("components/monitoring-initializer.tsx");
    expect(init).toMatch(/userType === ["']caregiver["']/);
  });
});
