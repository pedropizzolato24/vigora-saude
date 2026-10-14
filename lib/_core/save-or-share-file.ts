/**
 * save-or-share-file.ts
 *
 * Entrega de um arquivo ao usuário, de duas formas:
 *   - Baixar: abre o seletor de pastas do sistema e grava o arquivo nela.
 *   - Compartilhar: a folha de compartilhar do sistema (WhatsApp, e-mail, Drive).
 *
 * Capacidade do aparelho pode não existir (sem app de arquivos, sem
 * compartilhamento): nada é engolido — o motivo real volta no resultado.
 *
 * ⚠️ O Android 11+ não deixa escolher a RAIZ da pasta Downloads pelo seletor;
 * o usuário escolhe "Documentos" ou uma subpasta. Por isso "Compartilhar" é
 * sempre o caminho garantido.
 */
import { Directory, File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export interface PreparedFile {
  /** file:// do arquivo já gerado (cache do app). */
  uri: string;
  fileName: string;
  mimeType: string;
  /** Uniform Type Identifier (iOS): 'public.json', 'com.adobe.pdf'. */
  uti: string;
  dialogTitle: string;
}

export type SaveResult =
  | { status: 'saved'; folderName: string; fileName: string }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

export type ShareResult =
  | { status: 'shared' }
  | { status: 'unavailable' }
  | { status: 'failed'; reason: string };

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * O seletor de pastas rejeita a promessa quando o usuário cancela, e a mensagem
 * não é documentada. Casa "cancel"/"dismiss" no texto (Passo de validação em
 * aparelho registra o texto real em Samsung e Motorola).
 */
export function isPickerCancel(error: unknown): boolean {
  return error instanceof Error && /cancel|dismiss/i.test(error.message);
}

/** Último trecho legível de uma URI de pasta ("…/tree/primary%3ADocuments" -> "Documents"). */
export function folderLabel(uri: string): string {
  let decoded = uri;
  try {
    decoded = decodeURIComponent(uri);
  } catch (error) {
    // URI com % solto: usa como veio.
    console.warn('[Exportar] URI de pasta não decodificável, usando como veio:', error);
  }
  return decoded.split(/[/:]/).filter(Boolean).pop() ?? 'a pasta escolhida';
}

export async function saveFileToFolder(file: PreparedFile): Promise<SaveResult> {
  let directory: Awaited<ReturnType<typeof Directory.pickDirectoryAsync>> | undefined;
  try {
    directory = await Directory.pickDirectoryAsync();
  } catch (error) {
    if (isPickerCancel(error)) return { status: 'cancelled' };
    console.warn('[Exportar] seletor de pastas falhou:', error);
    return { status: 'failed', reason: reasonOf(error) };
  }
  if (!directory) return { status: 'cancelled' };

  try {
    const bytes = await new File(file.uri).bytes();
    directory.createFile(file.fileName, file.mimeType).write(bytes);
    return { status: 'saved', folderName: folderLabel(directory.uri), fileName: file.fileName };
  } catch (error) {
    console.warn('[Exportar] não foi possível gravar na pasta escolhida:', error);
    return { status: 'failed', reason: reasonOf(error) };
  }
}

export async function shareFile(file: PreparedFile): Promise<ShareResult> {
  try {
    if (!(await Sharing.isAvailableAsync())) return { status: 'unavailable' };
    await Sharing.shareAsync(file.uri, {
      mimeType: file.mimeType,
      dialogTitle: file.dialogTitle,
      UTI: file.uti,
    });
    return { status: 'shared' };
  } catch (error) {
    console.warn('[Exportar] compartilhamento falhou:', error);
    return { status: 'failed', reason: reasonOf(error) };
  }
}
