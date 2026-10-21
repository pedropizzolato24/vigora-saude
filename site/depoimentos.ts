/**
 * Depoimentos exibidos na página inicial do site.
 *
 * Para adicionar um: inclua um objeto na lista abaixo, com `texto` e `nome`
 * (e, se quiser, `detalhe`, como idade ou cidade). A seção aparece sozinha
 * assim que a lista deixa de estar vazia; com a lista vazia ela não é
 * renderizada. Nunca invente um depoimento: só publique falas reais, com
 * autorização de quem as disse.
 */
export interface Depoimento {
  texto: string;
  nome: string;
  detalhe?: string;
}

export const DEPOIMENTOS: Depoimento[] = [];
