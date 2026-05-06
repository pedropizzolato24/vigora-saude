// IMPORTANT: @expo/metro-runtime MUST be the first import for Fast Refresh on web
import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';

// Global JS error handler - catches uncaught errors outside React tree
const originalHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error('[GlobalErrorHandler] Uncaught error (isFatal=' + isFatal + '):', error?.message, error?.stack);
  originalHandler(error, isFatal);
});

// Registra o componente principal do app (expo-router)
renderRootComponent(App);

// react-native-android-widget: registerWidgetTaskHandler desabilitado para diagnóstico
