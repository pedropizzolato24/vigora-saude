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
