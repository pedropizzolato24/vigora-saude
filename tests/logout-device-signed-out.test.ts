import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "..", "hooks", "use-auth.ts"), "utf8");
const logout = src.slice(src.indexOf("const logout = useCallback"), src.indexOf("const isAuthenticated"));

describe("logout do idoso", () => {
  it("o aviso de saída é a ÚLTIMA chamada de aparelho ao servidor, antes de a sessão cair", () => {
    // Qualquer sinal do aparelho depois do aviso retoma a pausa no servidor
    // (touchLiveness): por isso vem depois do desregistro do token e antes do
    // Api.logout (na web o cookie some ali, e a rota exige auth).
    const avisa = logout.indexOf("await notifyDeviceSignedOut();");
    const desregistra = logout.indexOf("await unregisterDevicePushToken();");
    const encerra = logout.indexOf("await Api.logout();");
    const apagaSessao = logout.indexOf("await Auth.removeSessionToken();");
    expect(desregistra).toBeGreaterThan(-1);
    expect(avisa).toBeGreaterThan(desregistra);
    expect(avisa).toBeLessThan(encerra);
    expect(encerra).toBeLessThan(apagaSessao);
  });

  it("nada que sinaliza vida (push.register, userData.put, heartbeat) vem depois do aviso", () => {
    const depoisDoAviso = logout.slice(logout.indexOf("await notifyDeviceSignedOut();"));
    expect(depoisDoAviso).not.toMatch(/pushCloudData|push\.register|userData\.put|heartbeat/i);
  });

  it("trava o backup antes de desregistrar o token e só solta depois de descartar a conta", () => {
    // O userData.put debounced (3 s) conta como sinal de vida e desfaria a pausa.
    const trava = logout.indexOf("setCloudPushBlocked(true);");
    const desregistra = logout.indexOf("await unregisterDevicePushToken();");
    const avisa = logout.indexOf("await notifyDeviceSignedOut();");
    const limpaConta = logout.indexOf("await Auth.clearUserInfo();");
    const solta = logout.indexOf("setCloudPushBlocked(false);");
    expect(trava).toBeGreaterThan(-1);
    expect(trava).toBeLessThan(desregistra);
    expect(trava).toBeLessThan(avisa);
    expect(solta).toBeGreaterThan(limpaConta);
    // Solto num finally: falha ao limpar a sessão não pode deixar o backup travado.
    expect(logout.slice(limpaConta, solta)).toMatch(/finally \{/);
  });

  it("importa o helper do serviço de monitoramento", () => {
    expect(src).toMatch(/import \{ notifyDeviceSignedOut \} from "@\/lib\/monitoring-service";/);
  });
});
