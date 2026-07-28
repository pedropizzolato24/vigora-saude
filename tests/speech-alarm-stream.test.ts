/**
 * speech-alarm-stream.test.ts
 *
 * A voz do alarme (TTS) tem que sair no stream de ALARME — se sair no de
 * mídia, o idoso que deixou a mídia baixa não ouve o alarme falar.
 *
 * O caminho para isso é `setLegacyStreamType`, NÃO `setUsage(USAGE_ALARM)`:
 * com as attributes "modernas" a voz ficou completamente MUDA no S10
 * (28/07) — os engines reais (Samsung SMT, Google TTS) roteiam pelo stream
 * legado. É um detalhe que parece intercambiável e não é; trocar de volta
 * mata a voz de novo, e nenhum teste de JS pegaria isso.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const patchesDir = join(__dirname, "..", "patches");
const speech = readFileSync(join(patchesDir, "expo-speech.patch"), "utf8");

/** Só as linhas ADICIONADAS pelo patch (o que de fato vai para o build). */
const added = speech
  .split("\n")
  .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
  .map((l) => l.slice(1))
  .join("\n");

/** Sem comentários: eles citam a alternativa errada para explicar por quê. */
const addedCode = added
  .split("\n")
  .filter((l) => !l.trim().startsWith("//"))
  .join("\n");

describe("voz do alarme — roteamento e volume", () => {
  it("usa setLegacyStreamType(STREAM_ALARM)", () => {
    expect(added).toMatch(/setLegacyStreamType\(AudioManager\.STREAM_ALARM\)/);
  });

  it("não volta para setUsage(USAGE_ALARM), que deixou a voz muda", () => {
    expect(addedCode).not.toMatch(/setUsage\(.*USAGE_ALARM\)/);
  });

  it("repassa o volume das configurações ao engine", () => {
    expect(added).toMatch(/KEY_PARAM_VOLUME, volume/);
    // O Record do Android não tinha o campo — sem ele, options.volume some.
    expect(added).toMatch(/@Field val volume: Float\?/);
  });
});

describe("higiene dos patches", () => {
  it("nenhum patch carrega o diretório .gradle da máquina de quem gerou", () => {
    for (const file of readdirSync(patchesDir)) {
      const content = readFileSync(join(patchesDir, file), "utf8");
      // `pnpm patch` varre o diretório inteiro: um build acidental dentro dele
      // empacota locks e hashes binários locais no patch (23KB de lixo no
      // expo-speech). Além do ruído, é estado de build de outra máquina.
      expect(content, `${file} contém android/.gradle`).not.toMatch(/android\/\.gradle\//);
    }
  });
});
