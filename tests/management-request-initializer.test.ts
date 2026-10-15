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
