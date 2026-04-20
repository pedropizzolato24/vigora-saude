import React from 'react';
import { FlexWidget, TextWidget, ImageWidget } from 'react-native-android-widget';

interface NextAlarmWidgetProps {
  alarmTime?: string;   // e.g. "08:30"
  alarmName?: string;   // e.g. "Metformina"
  hasAlarm: boolean;
}

/**
 * Widget de Próximo Alarme — exibe o próximo alarme de medicamento
 * na tela inicial do Android.
 *
 * Layout:
 * ┌─────────────────────────────────┐
 * │  💊  Vigora Saúde               │
 * │  Próximo alarme                 │
 * │  08:30                          │
 * │  Metformina                     │
 * └─────────────────────────────────┘
 */
export function NextAlarmWidget({ alarmTime, alarmName, hasAlarm }: NextAlarmWidgetProps) {
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
      }}
      clickAction="OPEN_APP"
    >
      {/* Header: ícone + título */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <TextWidget
          text="💊"
          style={{
            fontSize: 16,
            marginRight: 6,
          }}
        />
        <TextWidget
          text="Vigora Saúde"
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: '#0033CC',
          }}
        />
      </FlexWidget>

      {/* Label */}
      <TextWidget
        text="Próximo alarme"
        style={{
          fontSize: 11,
          color: '#687076',
          marginBottom: 4,
        }}
      />

      {hasAlarm && alarmTime ? (
        <>
          {/* Horário em destaque */}
          <TextWidget
            text={alarmTime}
            style={{
              fontSize: 32,
              fontWeight: 'bold',
              color: '#11181C',
              marginBottom: 2,
            }}
          />
          {/* Nome do medicamento */}
          {alarmName ? (
            <TextWidget
              text={alarmName}
              style={{
                fontSize: 13,
                color: '#687076',
              }}
              maxLines={1}
              truncate="END"
            />
          ) : null}
        </>
      ) : (
        <TextWidget
          text="Nenhum alarme ativo"
          style={{
            fontSize: 14,
            color: '#9BA1A6',
            fontStyle: 'italic',
          }}
        />
      )}
    </FlexWidget>
  );
}
