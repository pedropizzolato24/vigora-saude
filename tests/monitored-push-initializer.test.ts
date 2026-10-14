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

  it("registra de novo quando o token do aparelho muda, e solta a assinatura ao desmontar", () => {
    // Sem isto, um token que o FCM/APNs trocou com o app fechado deixa o ping
    // diário do servidor achar DeviceNotRegistered e pausar a conta como "app removido".
    const inicio = src.indexOf("Notifications.addPushTokenListener(");
    expect(inicio).toBeGreaterThan(-1);
    const trecho = src.slice(inicio, src.indexOf("}, []);", inicio));
    expect(trecho).toMatch(/registerPushToken\(\)/);
    expect(trecho).toMatch(/return \(\) => sub\.remove\(\);/);
  });

  it("o listener de troca de token pula a web, como o registro inicial", () => {
    const inicio = src.indexOf("Notifications.addPushTokenListener(");
    const efeito = src.slice(src.lastIndexOf("useEffect(", inicio), inicio);
    expect(efeito).toMatch(/Platform\.OS === 'web'\) return;/);
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
