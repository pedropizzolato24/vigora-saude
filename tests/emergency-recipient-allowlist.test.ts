/**
 * emergency-recipient-allowlist.test.ts
 *
 * Auditoria set/2026, V-05: `isAllowedRecipient` comparava apenas os 8 dígitos
 * finais do telefone, descartando DDI, DDD e o nono dígito. Um contato salvo em
 * "(11) 9 8888-7777" autorizava envio para "(51) 8888-7777", "(21) 9 8888-7777"
 * e todas as demais variantes — cerca de uma centena de números reais por
 * contato cadastrado, em vez de um.
 *
 * O controle existe para que a rota não tenha "destinos arbitrários": a mensagem
 * sai pelo número do WhatsApp Business do Vigora, e abuso ali é banimento pela
 * Meta — o que derrubaria a escalação de todos os usuários.
 */
import { describe, expect, it } from "vitest";
import { __testing } from "../server/routers";
import type { EmergencyContactRecord } from "../drizzle/schema";

const { isAllowedRecipient } = __testing;

function contato(phone: string): EmergencyContactRecord {
  return { id: "1", name: "Filha", phone, relation: "filha", whatsapp: true };
}

const CADASTRADOS = [contato("(11) 9 8888-7777")];

describe("isAllowedRecipient", () => {
  // --- O que a correção fecha ------------------------------------------------

  it.each([
    ["(51) 8888-7777", "mesmo sufixo, DDD diferente"],
    ["(21) 9 8888-7777", "mesmo sufixo e nono dígito, DDD diferente"],
    ["(11) 8888-7777", "mesmo DDD, sem o nono dígito"],
    ["+1 415 888-7777", "mesmo sufixo, país diferente"],
  ])("recusa %s (%s)", (phone) => {
    expect(isAllowedRecipient({ phone, name: "X" }, CADASTRADOS)).toBe(false);
  });

  // --- O que precisa continuar funcionando -----------------------------------
  // Variações de formato do MESMO número: recusar aqui seria pior que o achado
  // — significaria não conseguir avisar a família numa emergência real.

  it.each([
    "(11) 9 8888-7777",
    "11988887777",
    "5511988887777",
    "+55 11 9 8888-7777",
    "+5511988887777",
    "11 9 8888 7777",
  ])("aceita a variação de formato %s", (phone) => {
    expect(isAllowedRecipient({ phone, name: "X" }, CADASTRADOS)).toBe(true);
  });

  it("aceita quando o contato foi salvo com DDI e o envio vem sem", () => {
    expect(
      isAllowedRecipient(
        { phone: "(11) 9 8888-7777", name: "X" },
        [contato("+55 11 98888-7777")]
      )
    ).toBe(true);
  });

  // --- Bordas ----------------------------------------------------------------

  it("recusa quando não há nenhum contato cadastrado", () => {
    expect(isAllowedRecipient({ phone: "11988887777", name: "X" }, [])).toBe(false);
  });

  it("recusa número curto demais para identificar alguém", () => {
    expect(
      isAllowedRecipient({ phone: "8777", name: "X" }, CADASTRADOS)
    ).toBe(false);
  });

  it("encontra o contato certo no meio de vários", () => {
    const varios = [
      contato("(11) 9 1111-1111"),
      contato("(21) 9 2222-2222"),
      contato("(51) 9 3333-3333"),
    ];
    expect(isAllowedRecipient({ phone: "5521922222222", name: "X" }, varios)).toBe(true);
    expect(isAllowedRecipient({ phone: "5511922222222", name: "X" }, varios)).toBe(false);
  });

  it("compara número estrangeiro pelos dígitos completos, não por sufixo", () => {
    const gringo = [contato("+1 415 555-0123")];
    expect(isAllowedRecipient({ phone: "+14155550123", name: "X" }, gringo)).toBe(true);
    expect(isAllowedRecipient({ phone: "+44 20 555-0123", name: "X" }, gringo)).toBe(false);
  });
});
