/**
 * alarm-setup-prompts.test.ts
 *
 * Dois pedidos do Pedro em 14/08/2026, depois de testar no aparelho:
 *
 * 1. O aviso de "tela cheia" só aparecia DEPOIS de o idoso já ter respondido
 *    um alarme — tarde demais, porque é justamente esse alarme que não abriu
 *    na tela toda. Os três avisos disputavam uma vaga única por sessão
 *    (AppDialog é um só) e o de bateria sempre ganhava. O momento certo é a
 *    criação do alarme: é aí que a permissão passa a valer.
 *
 * 2. O texto era técnico demais para 60+: "Android", "Samsung", "segundo
 *    plano", "Autostart". O público não sabe o que é nada disso — e não
 *    precisa saber. Só "celular", e os passos numerados.
 *
 * Os nomes de tela do sistema ("Cuidado do dispositivo", "Notificações em
 * tela cheia") ficam: são o rótulo que o idoso precisa achar no aparelho.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { oemBatteryHint } from "@/lib/_core/oem-battery-hint";

const raiz = join(__dirname, "..");
const alarmsSrc = readFileSync(join(raiz, "app/(tabs)/alarms.tsx"), "utf8");
const hintSrc = readFileSync(
  join(raiz, "lib/_core/oem-battery-hint.ts"),
  "utf8"
);

/** Só as strings de UI (entre aspas) — comentários de código podem citar tudo. */
function textosDeUI(fonte: string): string {
  const semComentarios = fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const titulos = [...semComentarios.matchAll(/title:\s*'([^']*)'/g)].map(
    (m) => m[1]
  );
  const mensagens = [
    ...semComentarios.matchAll(/message:\s*\n?\s*'([\s\S]*?)'(?=,\s*\n)/g),
  ].map((m) => m[1]);
  return [...titulos, ...mensagens].join("\n");
}

describe("aviso de tela cheia — na criação, não depois do alarme tocar", () => {
  it("não é disparado por efeito de montagem da aba", () => {
    // Pega cada useEffect(...) e confere que nenhum consulta a permissão.
    const efeitos = [...alarmsSrc.matchAll(/useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[/g)];
    const emEfeito = efeitos.filter((e) =>
      e[1].includes("canUseFullScreenIntent")
    );
    expect(
      emEfeito.length,
      "o aviso voltou para o mount — vai aparecer tarde de novo"
    ).toBe(0);
  });

  it("é disparado ao salvar um alarme novo", () => {
    const handleSave = alarmsSrc.match(
      /const handleSave = async \(\) => \{([\s\S]*?)\n  \};/
    );
    expect(handleSave, "não achei handleSave").not.toBeNull();
    expect(handleSave![1]).toMatch(/promptFullScreenIfNeeded\(\)/);
  });
});

describe("linguagem dos avisos — público 60+", () => {
  const proibidos = [
    "Android",
    "Samsung",
    "Xiaomi",
    "Redmi",
    "iOS",
    "iPhone",
    "Autostart",
    "segundo plano",
  ];

  it("nenhum texto de UI cita plataforma, fabricante ou jargão", () => {
    const textos = textosDeUI(alarmsSrc);
    expect(textos.length, "não extraí nenhum texto de UI").toBeGreaterThan(100);
    const achados = proibidos.filter((p) =>
      new RegExp(p, "i").test(textos)
    );
    expect(achados, `termos técnicos nos avisos: ${achados.join(", ")}`).toEqual(
      []
    );
  });

  it("o passo extra por fabricante fala 'celular', não a marca", () => {
    for (const marca of ["samsung", "xiaomi", "redmi", "poco"]) {
      const hint = oemBatteryHint(marca);
      expect(hint, `${marca} deveria ter passo extra`).not.toBeNull();
      for (const p of proibidos) {
        expect(
          new RegExp(p, "i").test(hint!),
          `hint de ${marca} cita "${p}"`
        ).toBe(false);
      }
      expect(hint!).toMatch(/celular/i);
    }
  });

  it("aparelho stock continua sem passo extra", () => {
    expect(oemBatteryHint("motorola")).toBeNull();
    expect(oemBatteryHint("")).toBeNull();
  });

  it("mantém os rótulos que o idoso precisa achar no aparelho", () => {
    expect(oemBatteryHint("samsung")).toMatch(/Cuidado do dispositivo/);
    expect(textosDeUI(alarmsSrc)).toMatch(/Notificações em tela cheia/);
  });

  it("os avisos ensinam por passos numerados, não em texto corrido", () => {
    const textos = textosDeUI(alarmsSrc);
    for (const marcador of ["1.", "2."]) {
      expect(
        textos.includes(marcador),
        `nenhum passo "${marcador}" nos avisos`
      ).toBe(true);
    }
  });
});
