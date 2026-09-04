/**
 * anamnesis-pdf-escaping.test.ts
 *
 * Auditoria set/2026, V-03: lib/pdf-utils-v2.ts concatenava os oito campos de
 * texto livre da anamnese direto no HTML que o expo-print renderiza (no Android,
 * um WebView de impressão) e que depois é compartilhado como PDF — sem nenhum
 * escape. O módulo irmão (health-report-generator.ts) já tinha corrigido essa
 * mesma classe de bug e exporta o `esc` usado aqui.
 *
 * O documento vai para um profissional de saúde: injeção de HTML permite ocultar
 * campos, sobrepor valores e forjar texto na ficha médica.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-print", () => ({ printToFileAsync: vi.fn() }));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(), shareAsync: vi.fn() }));

import { generateAnamnesisPDF } from "../lib/pdf-utils-v2";
import type { AnamnesesData } from "../lib/app-context";

const XSS = '<script>alert(1)</script>';

function anamnese(over: Partial<AnamnesesData> = {}): AnamnesesData {
  return {
    fullName: "Maria",
    birthDate: "1950-04-12",
    gender: "F",
    allergies: "",
    medications: "",
    diseases: "",
    susNumber: "",
    healthPlanProvider: "",
    healthPlanNumber: "",
    ...over,
  } as AnamnesesData;
}

// Os oito campos de texto livre que entram no HTML.
const CAMPOS: (keyof AnamnesesData)[] = [
  "fullName",
  "allergies",
  "medications",
  "diseases",
  "susNumber",
  "healthPlanProvider",
  "healthPlanNumber",
];

describe("generateAnamnesisPDF", () => {
  it.each(CAMPOS)("escapa HTML vindo do campo %s", (campo) => {
    const html = generateAnamnesisPDF(anamnese({ [campo]: XSS }));

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapa a data de nascimento (passa por formatDate)", () => {
    const html = generateAnamnesisPDF(
      anamnese({ birthDate: '1950-04-<img src=x onerror=alert(1)>' })
    );

    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("escapa aspas, para que o valor não escape de um atributo", () => {
    const html = generateAnamnesisPDF(
      anamnese({ allergies: '" onmouseover="alert(1)' })
    );

    expect(html).not.toContain('" onmouseover="');
    expect(html).toContain("&quot;");
  });

  it("preserva o conteúdo legítimo, sem alterar o texto do paciente", () => {
    const html = generateAnamnesisPDF(
      anamnese({ fullName: "Maria de Souza", medications: "Losartana 50mg" })
    );

    expect(html).toContain("Maria de Souza");
    expect(html).toContain("Losartana 50mg");
  });

  it("mantém o texto padrão quando o campo está vazio", () => {
    const html = generateAnamnesisPDF(anamnese());

    expect(html).toContain("Nenhuma informada");
    expect(html).toContain("Não informado");
  });
});
