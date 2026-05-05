// IMPORTANT: @expo/metro-runtime MUST be the first import for Fast Refresh on web
import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './widgets/widget-task-handler';

// Global JS error handler - catches uncaught errors outside React tree
// (Complements ErrorBoundary which only catches errors inside React render)
const originalHandler = ErrorUtils.getGlobalHandler();
ErrorUtils.setGlobalHandler((error, isFatal) => {
  console.error('[GlobalErrorHandler] Uncaught error (isFatal=' + isFatal + '):', error?.message, error?.stack);
  originalHandler(error, isFatal);
});

// Registra o componente principal do app (expo-router)
renderRootComponent(App);

// Registra o handler de widgets Android
// Será chamado pelo sistema Android quando widgets forem adicionados/atualizados/clicados
registerWidgetTaskHandler(widgetTaskHandler);
