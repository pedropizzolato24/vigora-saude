import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

/**
 * Widget SOS — botão de emergência rápida na tela inicial do Android.
 * Ao tocar, abre o app diretamente na aba de emergência via deep link.
 *
 * Layout:
 * ┌──────────────────┐
 * │  🆘              │
 * │  SOS             │
 * │  Emergência      │
 * └──────────────────┘
 */
export function SosWidget() {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#CC0000',
        borderRadius: 16,
        padding: 12,
      }}
      clickAction="OPEN_APP"
    >
      {/* Ícone grande */}
      <TextWidget
        text="🆘"
        style={{
          fontSize: 36,
          textAlign: 'center',
          marginBottom: 6,
        }}
      />

      {/* Texto SOS */}
      <TextWidget
        text="SOS"
        style={{
          fontSize: 22,
          fontWeight: 'bold',
          color: '#FFFFFF',
          textAlign: 'center',
          letterSpacing: 4,
        }}
      />

      {/* Subtítulo */}
      <TextWidget
        text="Emergência"
        style={{
          fontSize: 11,
          color: '#FFCCCC',
          textAlign: 'center',
          marginTop: 2,
        }}
      />
    </FlexWidget>
  );
}
