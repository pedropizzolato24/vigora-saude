// IMPORTANT: @expo/metro-runtime MUST be the first import for Fast Refresh on web
import '@expo/metro-runtime';

// Diagnóstico do boot (item 2 do feedback 27/07). Primeiro import após o
// metro-runtime: ancora o "+0ms" no começo real da execução do bundle.
import { perfMark } from './lib/_core/perf';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import { widgetTaskHandler } from './widgets/widget-task-handler';

perfMark('bundle avaliado, montando root');

// Registra o componente principal do app (expo-router)
renderRootComponent(App);

// Registra o handler de widgets Android
// Será chamado pelo sistema Android quando widgets forem adicionados/atualizados/clicados
registerWidgetTaskHandler(widgetTaskHandler);
