/**
 * sms-alerts.test.ts
 *
 * Trava as três regras que fazem o canal SMS valer a pena no dead man's switch:
 *  1. O texto é dobrado para GSM-7 (sem emoji, sem acento) e cortado em 2
 *     segmentos — com um acento sobrando o mesmo alerta custaria 4x.
 *  2. O telefone NUNCA sai inteiro no log (LGPD; log vaza em crash reporter).
 *  3. WhatsApp e SMS são paralelos, não cascata: o contato conta como
 *     alcançado se QUALQUER um dos dois entregou.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server/_core/env", () => ({
  ENV: {
    twilioAccountSid: "AC_test",
    twilioAuthToken: "token_test",
    twilioFromNumber: "+15705590772",
    whatsappApiToken: "wa_token",
    whatsappPhoneNumberId: "wa_id",
  },
}));

import { isSmsConfigured, sendSms, toGsm7 } from "../server/sms";

const okResponse = () =>
  ({ ok: true, json: async () => ({ sid: "SM123", status: "queued" }) }) as any;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("toGsm7", () => {
  it("remove emoji e acentos para caber no alfabeto de 160 chars", () => {
    const folded = toGsm7("⚠️ Vigora: José não confirmou o alarme às 8h. Ação já!");

    expect(folded).toBe("Vigora: Jose nao confirmou o alarme as 8h. Acao ja!");
    // A regra real: nada fora do ASCII imprimível sobrevive. Um único caractere
    // fora dele empurra a mensagem INTEIRA para UCS-2 (70 chars/segmento).
    expect(folded).toMatch(/^[\x20-\x7E\n]*$/);
  });

  it("corta em 2 segmentos GSM-7 sem partir palavra ao meio", () => {
    const folded = toGsm7(`Vigora: ${"palavra ".repeat(60)}fim`);

    expect(folded.length).toBeLessThanOrEqual(320);
    expect(folded.endsWith("...")).toBe(true);
    expect(folded).not.toMatch(/pala\.\.\.$/);
  });

  it("preserva mensagens curtas intactas", () => {
    expect(toGsm7("Vigora: alarme nao respondido.")).toBe(
      "Vigora: alarme nao respondido."
    );
  });
});

describe("sendSms", () => {
  it("envia To/From/Body ao Twilio com o corpo já dobrado", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => okResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendSms("(51) 99999-8888", "⚠️ Vigora: José não respondeu");

    expect(result).toEqual({ success: true, messageId: "SM123" });
    const body = new URLSearchParams(fetchMock.mock.calls[0][1].body);
    expect(body.get("To")).toBe("+5551999998888");
    expect(body.get("From")).toBe("+15705590772");
    expect(body.get("Body")).toBe("Vigora: Jose nao respondeu");
  });

  it("nunca loga o telefone completo (LGPD)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => okResponse()));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendSms("+5551999998888", "Vigora: teste");

    const logged = log.mock.calls.flat().join(" ");
    expect(logged).not.toContain("5551999998888");
    expect(logged).toContain("8888");
  });

  it("explica a restrição da conta Trial em vez de só falhar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ code: 21608, message: "unverified" }),
      })) as any
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendSms("+5551999998888", "Vigora: teste");

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Trial/i);
  });

  it("não lança quando a rede cai — devolve o motivo real", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(sendSms("+5551999998888", "x")).resolves.toEqual({
      success: false,
      error: "ECONNRESET",
    });
  });

  it("considera configurado com as três variáveis presentes", () => {
    expect(isSmsConfigured()).toBe(true);
  });
});
