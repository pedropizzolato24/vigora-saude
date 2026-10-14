import { beforeEach, describe, expect, it, vi } from 'vitest';

const write = vi.fn();
const createFile = vi.fn(() => ({ write }));
const pickDirectoryAsync = vi.fn();
const bytes = vi.fn(async () => new Uint8Array([1, 2, 3]));

vi.mock('expo-file-system', () => ({
  Directory: { pickDirectoryAsync: (...a: unknown[]) => pickDirectoryAsync(...a) },
  // `function` (não arrow): o código faz `new File(uri)` e arrow não é construtor.
  File: vi.fn(function () {
    return { bytes };
  }),
}));

const isAvailableAsync = vi.fn();
const shareAsync = vi.fn();
vi.mock('expo-sharing', () => ({
  isAvailableAsync: () => isAvailableAsync(),
  shareAsync: (...a: unknown[]) => shareAsync(...a),
}));

import {
  folderLabel,
  isPickerCancel,
  saveFileToFolder,
  shareFile,
  type PreparedFile,
} from '../lib/_core/save-or-share-file';

const file: PreparedFile = {
  uri: 'file:///cache/vigora-meus-dados-2026-10-02.json',
  fileName: 'vigora-meus-dados-2026-10-02.json',
  mimeType: 'application/json',
  uti: 'public.json',
  dialogTitle: 'Meus dados',
};

beforeEach(() => {
  vi.clearAllMocks();
  createFile.mockImplementation(() => ({ write }));
});

describe('isPickerCancel', () => {
  it('reconhece o cancelamento pelo texto do erro', () => {
    expect(isPickerCancel(new Error('User cancelled the operation'))).toBe(true);
    expect(isPickerCancel(new Error('Picker was canceled'))).toBe(true);
    expect(isPickerCancel(new Error('document picker dismissed'))).toBe(true);
  });
  it('não confunde falha real com cancelamento', () => {
    expect(isPickerCancel(new Error('EACCES: permission denied'))).toBe(false);
    expect(isPickerCancel('qualquer coisa')).toBe(false);
  });
});

describe('folderLabel', () => {
  it('pega o último trecho legível de uma URI de pasta do Android', () => {
    expect(folderLabel('content://com.android.externalstorage.documents/tree/primary%3ADocuments')).toBe('Documents');
  });
  it('pega o nome de uma pasta file://', () => {
    expect(folderLabel('file:///storage/emulated/0/Download/')).toBe('Download');
  });
});

describe('saveFileToFolder', () => {
  it('grava o arquivo na pasta escolhida', async () => {
    pickDirectoryAsync.mockResolvedValue({
      uri: 'content://x/tree/primary%3ADocuments',
      createFile,
    });

    const result = await saveFileToFolder(file);

    expect(createFile).toHaveBeenCalledWith(file.fileName, file.mimeType);
    expect(write).toHaveBeenCalledWith(new Uint8Array([1, 2, 3]));
    expect(result).toEqual({ status: 'saved', folderName: 'Documents', fileName: file.fileName });
  });

  it('cancelar o seletor não é erro', async () => {
    pickDirectoryAsync.mockRejectedValue(new Error('User cancelled'));
    expect(await saveFileToFolder(file)).toEqual({ status: 'cancelled' });
    expect(createFile).not.toHaveBeenCalled();
  });

  it('seletor que não devolve pasta também conta como cancelado', async () => {
    pickDirectoryAsync.mockResolvedValue(undefined);
    expect(await saveFileToFolder(file)).toEqual({ status: 'cancelled' });
  });

  it('falha ao escolher a pasta mostra o motivo real', async () => {
    pickDirectoryAsync.mockRejectedValue(new Error('Nenhum app de arquivos'));
    expect(await saveFileToFolder(file)).toEqual({ status: 'failed', reason: 'Nenhum app de arquivos' });
  });

  it('falha ao gravar (sem permissão na pasta) mostra o motivo real', async () => {
    pickDirectoryAsync.mockResolvedValue({ uri: 'content://x/tree/primary%3ADownload', createFile });
    createFile.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    expect(await saveFileToFolder(file)).toEqual({ status: 'failed', reason: 'Permission denied' });
  });
});

describe('shareFile', () => {
  it('abre a folha de compartilhar', async () => {
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockResolvedValue(undefined);
    expect(await shareFile(file)).toEqual({ status: 'shared' });
    expect(shareAsync).toHaveBeenCalledWith(file.uri, {
      mimeType: file.mimeType,
      dialogTitle: file.dialogTitle,
      UTI: file.uti,
    });
  });
  it('sem compartilhamento no aparelho', async () => {
    isAvailableAsync.mockResolvedValue(false);
    expect(await shareFile(file)).toEqual({ status: 'unavailable' });
    expect(shareAsync).not.toHaveBeenCalled();
  });
  it('falha ao compartilhar mostra o motivo real', async () => {
    isAvailableAsync.mockResolvedValue(true);
    shareAsync.mockRejectedValue(new Error('Activity not found'));
    expect(await shareFile(file)).toEqual({ status: 'failed', reason: 'Activity not found' });
  });
});
