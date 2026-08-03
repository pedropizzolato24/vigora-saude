const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

/**
 * Torna os navegadores do aparelho visíveis para o app (Android 11+).
 *
 * A partir do Android 11 o app só enxerga os apps instalados que ele declara em
 * <queries> (package visibility). O expo-web-browser declara apenas a consulta
 * do CustomTabsService — ou seja, só navegadores que expõem Custom Tabs ficam
 * visíveis. Em aparelhos com Chrome desativado ou ROM enxuta isso dá zero
 * resultados e o login Google morre antes de abrir, nas DUAS pontas:
 *
 *   - Custom Tab  → "No matching browser activity found" (canResolveIntent)
 *   - Linking     → "No Activity found to handle Intent { act=VIEW dat=https }"
 *
 * (Reproduzido num Samsung A15; S10 / S21 FE / S23 funcionam por terem Chrome
 * ativo.) Declarando a consulta genérica de navegador, qualquer app capaz de
 * abrir https passa a ser visível — com ou sem suporte a Custom Tabs.
 */
const BROWSER_QUERY = {
  intent: [
    {
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
      data: [{ $: { 'android:scheme': 'https' } }],
    },
  ],
};

const withBrowserQueries = (config) => {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest.queries = manifest.queries ?? [];

    // O prebuild roda sobre o manifesto já gerado — não duplicar a consulta.
    const alreadyDeclared = manifest.queries.some((query) =>
      query.intent?.some((intent) =>
        intent.data?.some((data) => data.$?.['android:scheme'] === 'https')
      )
    );
    if (!alreadyDeclared) {
      manifest.queries.push(BROWSER_QUERY);
    }

    return mod;
  });
};

module.exports = createRunOncePlugin(
  withBrowserQueries,
  'vigora-browser-queries',
  '1.0.0'
);
