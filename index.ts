// IMPORTANT: @expo/metro-runtime MUST be the first import for Fast Refresh on web
import '@expo/metro-runtime';

// Diagnóstico do boot (item 2 do feedback 27/07). Primeiro import após o
// metro-runtime: ancora o "+0ms" no começo real da execução do bundle.
import { perfMark } from './lib/_core/perf';

import * as SplashScreen from 'expo-splash-screen';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

// O splash nativo some assim que a Activity desenha o primeiro frame. No toque
// da notificação do alarme isso é cedo DEMAIS: o AlarmService já mantém o
// processo vivo, então o Android trata como warm start e a janela aparece
// quase na hora — mas o React Native ainda leva 2-3s para inicializar num
// aparelho antigo (S10). Nesse intervalo o que se vê é o windowBackground do
// AppTheme, preto no modo escuro. Seguramos o splash até a raiz renderizar
// (o hideAsync fica em app/_layout.tsx).
SplashScreen.preventAutoHideAsync().catch(() => {});

// Rede de segurança OBRIGATÓRIA: se a árvore de providers lançar durante o
// render, o useEffect que esconde o splash nunca roda e o app ficaria preso
// nele para sempre — num app de alarme isso é pior que a tela preta. Não
// remova este timeout sem remover o preventAutoHideAsync acima.
setTimeout(() => {
  SplashScreen.hideAsync().catch(() => {});
}, 8000);

import { widgetTaskHandler } from './widgets/widget-task-handler';

perfMark('bundle avaliado, montando root');

// Registra o componente principal do app (expo-router)
renderRootComponent(App);

// Registra o handler de widgets Android
// Será chamado pelo sistema Android quando widgets forem adicionados/atualizados/clicados
registerWidgetTaskHandler(widgetTaskHandler);
