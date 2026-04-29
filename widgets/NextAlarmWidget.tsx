import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';

interface NextAlarmWidgetProps {
  alarmTime?: string;   // e.g. "08:30" ou "Agora"
  alarmName?: string;   // e.g. "Metformina"
  hasAlarm: boolean;
  isRinging?: boolean;  // true quando o alarme está tocando agora
}

/**
 * Widget de Próximo Alarme - exibe o próximo alarme de medicamento
 * na tela inicial do Android.
 *
 * Estados:
 * - Normal: mostra horário e nome do próximo alarme
 * - Tocando (isRinging=true): destaque vermelho indicando alarme ativo
 * - Sem alarme: mensagem "Nenhum alarme ativo"
 *
 * Layout:
 * ┌---------------------------------┐
 * │  💊  Vigora Saúde               │
 * │  Próximo alarme                 │
 * │  08:30                          │
 * │  Metformina                     │
 * └---------------------------------┘
 */
export function NextAlarmWidget({ alarmTime, alarmName, hasAlarm, isRinging = false }: NextAlarmWidgetProps) {
  const bgColor = isRinging ? '#CC0000' : '#FFFFFF';
  const titleColor = isRinging ? '#FFCCCC' : '#0033CC';
  const labelColor = isRinging ? '#FFAAAA' : '#687076';
  const timeColor = isRinging ? '#FFFFFF' : '#11181C';
  const nameColor = isRinging ? '#FFDDDD' : '#687076';

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        backgroundColor: bgColor,
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
          text={isRinging ? '🔔' : '💊'}
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
            color: titleColor,
          }}
        />
      </FlexWidget>

      {/* Label */}
      <TextWidget
        text={isRinging ? 'Alarme tocando!' : 'Próximo alarme'}
        style={{
          fontSize: 11,
          color: labelColor,
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
              color: timeColor,
              marginBottom: 2,
            }}
          />
          {/* Nome do medicamento */}
          {alarmName ? (
            <TextWidget
              text={alarmName}
              style={{
                fontSize: 13,
                color: nameColor,
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
