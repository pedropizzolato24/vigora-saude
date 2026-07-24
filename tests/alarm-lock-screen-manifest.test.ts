import { describe, expect, it } from "vitest";
import { AndroidConfig } from "@expo/config-plugins";
import plugin from "@/modules/expo-alarm-countdown/app.plugin.js";

/**
 * O full-screen intent do alarme aponta para a MainActivity. Sem turnScreenOn
 * a activity é lançada mas a tela não acende — o idoso só veria algo ao
 * apertar o botão de energia.
 *
 * showWhenLocked (desenhar por cima da lock screen) NÃO é fixado aqui de
 * propósito — vira runtime-only (enterAlarmLockScreenMode/
 * exitAlarmLockScreenMode em app/alarm-ring.tsx), senão o app inteiro
 * ignoraria a lock screen do sistema em qualquer abertura com o aparelho
 * bloqueado, não só durante o alarme.
 */
function manifestWithMainActivity() {
  return {
    manifest: {
      application: [
        {
          $: { "android:name": ".MainApplication" },
          activity: [
            {
              $: { "android:name": ".MainActivity" },
              "intent-filter": [
                {
                  action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
                  category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
                },
              ],
            },
          ],
        },
      ],
    },
  } as any;
}

/** Roda só o mod de AndroidManifest do plugin sobre um manifesto de fixture. */
async function applyManifestMod(androidManifest: any) {
  const config: any = (plugin as any)({ name: "Vigora", slug: "vigora-saude" }, {});
  const result = await config.mods.android.manifest({
    modResults: androidManifest,
    modRequest: {},
    name: "Vigora",
    slug: "vigora-saude",
  });
  return result.modResults;
}

describe("plugin expo-alarm-countdown — alarme na tela de bloqueio", () => {
  it("marca a MainActivity com turnScreenOn, mas NÃO com showWhenLocked", async () => {
    const result = await applyManifestMod(manifestWithMainActivity());
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(result);

    expect(activity.$["android:turnScreenOn"]).toBe("true");
    expect(activity.$["android:showWhenLocked"]).toBeUndefined();
  });

  it("é idempotente — aplicar duas vezes não duplica nem altera o valor", async () => {
    const once = await applyManifestMod(manifestWithMainActivity());
    const twice = await applyManifestMod(once);
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(twice);

    expect(activity.$["android:turnScreenOn"]).toBe("true");
    expect(activity.$["android:showWhenLocked"]).toBeUndefined();
  });
});

/** MainActivity.kt como o prebuild do Expo 54 a gera (trecho relevante). */
const MAIN_ACTIVITY_KT = `package com.vigora.saude
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }

  override fun getMainComponentName(): String = "main"
}
`;

/** Roda só o mod de MainActivity do plugin sobre um fonte de fixture. */
async function applyMainActivityMod(contents: string, language = "kt") {
  const config: any = (plugin as any)({ name: "Vigora", slug: "vigora-saude" }, {});
  const result = await config.mods.android.mainActivity({
    modResults: { contents, language },
    modRequest: {},
    name: "Vigora",
    slug: "vigora-saude",
  });
  return result.modResults.contents as string;
}

describe("plugin expo-alarm-countdown — showWhenLocked no lançamento da activity", () => {
  it("aplica o flag antes de super.onCreate, e só para o launch do alarme", async () => {
    const src = await applyMainActivityMod(MAIN_ACTIVITY_KT);

    // O flag tem de valer na criação da janela: a chamada precisa vir ANTES
    // de super.onCreate, senão o Android já decidiu esconder atrás do keyguard.
    const callIndex = src.indexOf("applyAlarmLockScreenFlag(intent)\n");
    const superIndex = src.indexOf("super.onCreate(null)");
    expect(callIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(superIndex);

    // Escopado ao alarme — sem isso o app inteiro passaria por cima da lock screen.
    expect(src).toContain('contains("alarm-ring")');
    expect(src).toContain("setShowWhenLocked(true)");
    // Relaunch com o processo vivo (singleTask) não passa por onCreate.
    expect(src).toContain("override fun onNewIntent(intent: Intent)");
    expect(src).toContain("import android.content.Intent");
  });

  it("é idempotente — não injeta duas vezes", async () => {
    const once = await applyMainActivityMod(MAIN_ACTIVITY_KT);
    const twice = await applyMainActivityMod(once);

    expect(twice).toBe(once);
    expect(twice.split("private fun applyAlarmLockScreenFlag").length - 1).toBe(1);
  });

  it("falha o build se o template do prebuild mudar (em vez de quebrar calado)", async () => {
    await expect(
      applyMainActivityMod("class MainActivity : ReactActivity() {\n}\n")
    ).rejects.toThrow(/import android\.os\.Build/);
  });

  it("falha se a MainActivity não for Kotlin", async () => {
    await expect(applyMainActivityMod(MAIN_ACTIVITY_KT, "java")).rejects.toThrow(
      /esperado Kotlin/
    );
  });
});
