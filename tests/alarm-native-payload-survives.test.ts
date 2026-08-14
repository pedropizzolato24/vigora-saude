/**
 * alarm-native-payload-survives.test.ts
 *
 * `scheduleAlarm` do expo-alarm-module NÃO repassa o objeto que recebe: ele
 * monta um `new Alarm(params)` cujo construtor copia uma LISTA FIXA de campos.
 * Qualquer chave fora dessa lista é descartada em silêncio, antes da ponte —
 * o Java nunca vê, e nada falha.
 *
 * Foi assim que `sound: false` sumiu: os 6 call sites mandavam a flag, o
 * parser Java lia `hasKey("sound")` e recebia sempre false, então todo alarme
 * tocava. Dois commits (cac0dce, 494dd8a) miraram longe por causa disso.
 *
 * Este teste trava a CLASSE do erro, não o caso: todo campo que
 * native-alarm-manager manda tem que existir no construtor do modelo. Um campo
 * novo que a lib não conheça quebra aqui, e não no aparelho do idoso.
 *
 * Lê o `src/` porque é o que o Metro empacota (campo "react-native" do
 * package.json aponta para src/index), não o lib/commonjs.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const modeloPath = join(
  raiz,
  "node_modules/expo-alarm-module/src/models/Alarm.tsx"
);
const managerPath = join(raiz, "lib/native-alarm-manager.ts");

/** Campos que o construtor do modelo de fato copia (`this.x = getParam(...)`). */
function camposAceitosPeloModelo(fonte: string): Set<string> {
  const campos = new Set<string>();
  for (const m of fonte.matchAll(
    /this\.(\w+)\s*=\s*getParam\(\s*params\s*,\s*['"](\w+)['"]/g
  )) {
    campos.add(m[2]);
  }
  return campos;
}

/** Campos que enviamos em cada objeto passado a scheduleAlarmNative({...}). */
function camposEnviadosPeloApp(fonte: string): Set<string> {
  const campos = new Set<string>();
  for (const chamada of fonte.matchAll(
    /scheduleAlarmNative\(\{([\s\S]*?)\}\)/g
  )) {
    for (const linha of chamada[1].split("\n")) {
      const m = linha.match(/^\s*(\w+)\s*[:,]/);
      if (m) campos.add(m[1]);
    }
  }
  return campos;
}

describe("payload do alarme nativo", () => {
  it("o modelo da lib está onde esperamos (senão o teste vira decorativo)", () => {
    expect(
      existsSync(modeloPath),
      `não achei ${modeloPath} — rode pnpm install`
    ).toBe(true);
  });

  it("todo campo enviado sobrevive ao construtor da lib", () => {
    const aceitos = camposAceitosPeloModelo(readFileSync(modeloPath, "utf8"));
    const enviados = camposEnviadosPeloApp(readFileSync(managerPath, "utf8"));

    expect(enviados.size, "não extraí nenhum campo enviado").toBeGreaterThan(5);
    expect(aceitos.size, "não extraí nenhum campo do modelo").toBeGreaterThan(5);

    const descartados = [...enviados].filter((c) => !aceitos.has(c));
    expect(
      descartados,
      `estes campos são descartados em silêncio pelo construtor Alarm da lib ` +
        `e nunca chegam ao nativo: ${descartados.join(", ")}`
    ).toEqual([]);
  });

  it("sound especificamente sobrevive — é o que silencia o alarme", () => {
    const aceitos = camposAceitosPeloModelo(readFileSync(modeloPath, "utf8"));
    expect(aceitos.has("sound")).toBe(true);
  });
});

describe("patch da lib", () => {
  const patch = readFileSync(
    join(raiz, "patches/expo-alarm-module.patch"),
    "utf8"
  );
  const adicionadas = patch
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .join("\n");

  // O patch precisa cobrir as 3 cópias do modelo: src/ é o que o Metro
  // empacota, mas lib/commonjs e lib/module são o "main"/"module" do
  // package.json e podem ser resolvidos por outras ferramentas.
  it("o patch adiciona sound nas três cópias do modelo", () => {
    // Duas formas: o src/ e o lib/module usam `getParam(...)` direto; o
    // lib/commonjs sai do Babel como `(0, _utils.getParam)(...)`.
    const ocorrencias = adicionadas.match(
      /this\.sound\s*=[^;\n]*['"]sound['"]/g
    );
    expect(ocorrencias?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
