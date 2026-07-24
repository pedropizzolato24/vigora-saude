import { describe, expect, it } from "vitest";
import { AndroidConfig } from "@expo/config-plugins";
import plugin from "@/modules/expo-alarm-countdown/app.plugin.js";

/**
 * O full-screen intent do alarme aponta para a MainActivity. Sem showWhenLocked
 * o keyguard cobre a activity e o idoso vê só a notificação — bug relatado no
 * S23 mesmo com a permissão USE_FULL_SCREEN_INTENT concedida.
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
  it("marca a MainActivity com showWhenLocked e turnScreenOn", async () => {
    const result = await applyManifestMod(manifestWithMainActivity());
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(result);

    expect(activity.$["android:showWhenLocked"]).toBe("true");
    expect(activity.$["android:turnScreenOn"]).toBe("true");
  });

  it("é idempotente — aplicar duas vezes não duplica nem altera o valor", async () => {
    const once = await applyManifestMod(manifestWithMainActivity());
    const twice = await applyManifestMod(once);
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(twice);

    expect(activity.$["android:showWhenLocked"]).toBe("true");
    expect(activity.$["android:turnScreenOn"]).toBe("true");
  });
});
