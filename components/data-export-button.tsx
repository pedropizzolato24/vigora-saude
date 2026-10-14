/**
 * DataExportButton
 *
 * "Meus dados" — exportação de dados do titular (LGPD Art. 18, V). Busca o que
 * o servidor guarda, junta com o que está no aparelho e gera um JSON; a entrega
 * (Baixar numa pasta ou Compartilhar) é do ExportFileButtons.
 *
 * Fallback deliberado: se o servidor não responder (offline, 503, timeout), o
 * arquivo é gerado assim mesmo com os dados locais e marcado com
 * `servidor_incluido: false` + aviso. O usuário nunca sai de mãos vazias.
 */
import React from 'react';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { ExportFileButtons } from '@/components/export-file-buttons';
import { useAppContext } from '@/lib/app-context';
import {
  buildExportPayload,
  exportFileName,
  type ExportLocalData,
  type ExportServerData,
} from '@/lib/_core/data-export';
import { trpc } from '@/lib/trpc';

export function DataExportButton() {
  const { state } = useAppContext();
  const utils = trpc.useUtils();

  const prepare = async () => {
    const local: ExportLocalData = {
      alarmes: state.alarms,
      contatosDeEmergencia: state.emergencyContacts,
      anamnese: state.anamnesis,
      metricasDeSaude: state.healthMetrics,
      configuracoes: state.settings,
      perfil: state.profile,
    };

    let server: ExportServerData | null = null;
    let serverUnavailable = false;
    try {
      server = (await utils.userData.export.fetch()) as ExportServerData;
    } catch (error) {
      // Fallback: segue com os dados locais e marca a ausência no arquivo.
      // Motivo real no log — nunca engolir em silêncio.
      serverUnavailable = true;
      console.warn('[DataExport] servidor indisponível:', error);
    }

    const payload = buildExportPayload({
      local,
      server,
      serverUnavailable,
      appVersion: Application.nativeApplicationVersion ?? 'desconhecida',
    });

    const fileName = exportFileName();
    const file = new File(Paths.cache, fileName);
    file.write(JSON.stringify(payload, null, 2));

    return {
      uri: file.uri,
      fileName,
      mimeType: 'application/json',
      uti: 'public.json',
      dialogTitle: 'Meus dados',
      warning: serverUnavailable
        ? 'Arquivo gerado só com os dados do aparelho — sem conexão com o servidor.'
        : undefined,
    };
  };

  return (
    <ExportFileButtons
      label="Meus dados (arquivo técnico)"
      hint="Para guardar ou levar a outro serviço."
      prepare={prepare}
    />
  );
}
