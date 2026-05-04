// IMPORTANT: @expo/metro-runtime MUST be the first import for Fast Refresh on web
import '@expo/metro-runtime';

import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
// Registra o componente principal do app (expo-router)
renderRootComponent(App);
