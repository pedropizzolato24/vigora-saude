import { describe, expect, it } from "vitest";
import plugin from "@/plugins/with-browser-queries.js";

/**
 * Android 11+ só deixa o app enxergar apps declarados em <queries>. Sem a
 * consulta de navegador, tanto o Custom Tab quanto o Linking.openURL não acham
 * navegador nenhum e o login Google nem abre (Samsung A15).
 */
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

const browserQueries = (manifest: any) =>
  (manifest.manifest.queries ?? []).filter((query: any) =>
    query.intent?.some((intent: any) =>
      intent.data?.some((data: any) => data.$?.["android:scheme"] === "https")
    )
  );

describe("plugin with-browser-queries", () => {
  it("declara a consulta de navegador (VIEW + BROWSABLE + https)", async () => {
    const result = await applyManifestMod({ manifest: {} });
    const [query] = browserQueries(result);

    expect(query.intent[0].action[0].$["android:name"]).toBe(
      "android.intent.action.VIEW"
    );
    expect(query.intent[0].category[0].$["android:name"]).toBe(
      "android.intent.category.BROWSABLE"
    );
    expect(query.intent[0].data[0].$["android:scheme"]).toBe("https");
  });

  it("preserva <queries> de outros módulos (ex.: CustomTabsService)", async () => {
    const customTabsQuery = {
      intent: [
        {
          action: [
            { $: { "android:name": "android.support.customtabs.action.CustomTabsService" } },
          ],
        },
      ],
    };
    const result = await applyManifestMod({ manifest: { queries: [customTabsQuery] } });

    expect(result.manifest.queries).toContain(customTabsQuery);
    expect(browserQueries(result)).toHaveLength(1);
  });

  it("é idempotente — o prebuild roda sobre o manifesto já gerado", async () => {
    const once = await applyManifestMod({ manifest: {} });
    const twice = await applyManifestMod(once);

    expect(browserQueries(twice)).toHaveLength(1);
  });
});
