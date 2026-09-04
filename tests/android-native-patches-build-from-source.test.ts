/**
 * android-native-patches-build-from-source.test.ts
 *
 * Pacotes oficiais do Expo (expo-speech, expo-audio, ...) publicam um AAR
 * pré-compilado no Maven. Por padrão o Gradle do Android usa esse AAR em vez
 * de compilar o código-fonte de node_modules/ — inclusive quando esse código
 * foi alterado por um `pnpm patch`. O patch fica no disco, os testes de JS que
 * leem o `.patch` passam, o `pnpm install` roda sem erro, e nenhum build
 * falha: o comportamento nativo simplesmente continua sendo o do pacote
 * publicado, silenciosamente.
 *
 * Foi o que aconteceu com expo-speech: três rodadas de fix (roteamento de
 * stream, volume, e por fim tocar a fala nós mesmos) nunca chegaram ao
 * aparelho — o log confirma: build 30466892114 não tem UMA linha sequer de
 * "Task :expo-speech:...", enquanto expo-alarm-module (nunca publica AAR,
 * sempre compila) tem 39. `buildFromSource` no package.json é o que faz o
 * Gradle compilar o node_modules/ patchado em vez do AAR — sem isso, todo
 * patch em um pacote oficial do Expo é código morto.
 */
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("patches em pacotes oficiais do Expo entram no build Android", () => {
  const buildFromSource = (packageJson as any).expo?.autolinking?.buildFromSource ?? [];
  const patched = Object.keys((packageJson as any).pnpm?.patchedDependencies ?? {});

  it("todo pacote com AAR publicado (nome sem link:/^) que tem patch também tem buildFromSource", () => {
    // expo-alarm-module é `link:` — pacote local, sem AAR, sempre compila.
    // expo-alarm-kit é lib de terceiro (github.com/nickdeupree) com
    // `platforms: ["apple"]` no expo-module.config.json: não tem código Android
    // nem AAR no Maven, então buildFromSource não teria o que compilar.
    // Só pacotes oficiais do Expo (publicados no Maven) precisam do flag.
    const semAarNoMaven = ["expo-alarm-module", "expo-alarm-kit"];
    const officialExpoPackages = patched.filter((name) => name.startsWith("expo-") && !semAarNoMaven.includes(name));
    for (const name of officialExpoPackages) {
      expect(buildFromSource, `${name} está patchado mas falta em expo.autolinking.buildFromSource`).toContain(name);
    }
  });
});
