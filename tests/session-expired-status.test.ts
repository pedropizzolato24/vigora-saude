/**
 * session-expired-status.test.ts
 *
 * A política "este status HTTP significa sessão expirada -> deslogar" é usada em
 * três lugares (lib/trpc.ts, lib/monitoring-service.ts, lib/session-refresh.ts).
 * Ela precisa deslogar em 401 e NÃO deslogar em 403: neste servidor uma sessão
 * inválida sempre vira 401, enquanto 403 significa "autenticado, porém proibido
 * desta ação" (posse de dispositivo por outro usuário ao TROCAR DE CONTA no mesmo
 * aparelho, rota de admin). Tratar 403 como sessão expirada causava loop de login.
 */
import { describe, expect, it } from "vitest";
import { isSessionExpiredStatus } from "../lib/_core/session-status";

describe("isSessionExpiredStatus", () => {
  it("401 desloga (sessão inválida/expirada/usuário deletado)", () => {
    expect(isSessionExpiredStatus(401)).toBe(true);
  });

  it("403 NÃO desloga (device de outro usuário ao trocar de conta / admin)", () => {
    expect(isSessionExpiredStatus(403)).toBe(false);
  });

  it("respostas de sucesso e outros erros não deslogam", () => {
    for (const status of [200, 204, 400, 404, 412, 429, 500, 503]) {
      expect(isSessionExpiredStatus(status)).toBe(false);
    }
  });
});
