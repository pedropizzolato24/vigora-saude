/**
 * components/form-keyboard-view.tsx
 *
 * KeyboardAvoidingView com behavior="padding" nos DOIS sistemas.
 *
 * Com edge-to-edge ativo (Expo 54 / RN 0.81, app.config.ts edgeToEdgeEnabled),
 * o Android usa setDecorFitsSystemWindows(false) e o adjustResize do
 * windowSoftInputMode deixa de redimensionar a janela — inclusive dentro de
 * Modals. O próprio KAV precisa aplicar o padding também no Android
 * (behavior=undefined no Android é um no-op).
 *
 * Use este wrapper em todos os formulários em vez de KeyboardAvoidingView.
 */
import { KeyboardAvoidingView, type KeyboardAvoidingViewProps } from "react-native";

export function FormKeyboardView(props: KeyboardAvoidingViewProps) {
  return <KeyboardAvoidingView behavior="padding" {...props} />;
}
