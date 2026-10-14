import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8');
const settings = read('app', '(tabs)', 'settings.tsx');

describe('Política de Privacidade (Configurações)', () => {
  it('cita os provedores de push e avisa que o nome do lembrete pode aparecer', () => {
    expect(settings).toMatch(/Expo, Google e Apple \(notificações push aos cuidadores/);
    expect(settings).toMatch(/pode mostrar o nome do lembrete/);
  });

  it('cita a Twilio (SMS aos contatos de emergência) ao lado do WhatsApp/Meta', () => {
    expect(settings).toMatch(
      /WhatsApp\/Meta e Twilio \(alertas por mensagem e SMS aos contatos de emergência que você designou\)/
    );
    expect(settings).not.toMatch(/WhatsApp\/Meta \(alertas aos contatos/);
  });

  it('diz que o cuidador só edita os alarmes com o consentimento da pessoa, e que ela pode parar', () => {
    expect(settings).toMatch(/só pode criar, mudar ou apagar os seus alarmes se você aceitar o pedido dele no aplicativo/);
    expect(settings).toMatch(/Você pode parar quando quiser em Configurações, e ele é avisado\./);
  });

  it('descreve a verificação diária silenciosa', () => {
    expect(settings).toMatch(/uma vez por dia o servidor manda ao seu celular um aviso silencioso, sem texto e sem som/);
    expect(settings).toMatch(/os avisos automáticos aos seus contatos ficam pausados/);
  });

  it('diz que o fuso horário do aparelho é guardado e para quê', () => {
    expect(settings).toMatch(/fuso horário do aparelho \(guardado para calcular a hora certa dos seus alarmes\)/);
  });
});

describe('textos que falavam de "nenhum dado sai do aparelho" (D10)', () => {
  const anamnesis = read('app', '(tabs)', 'anamnesis.tsx');
  const help = read('components', 'help-screen.tsx');

  it('a ficha de anamnese não afirma mais que nada vai para servidores externos', () => {
    expect(anamnesis).not.toMatch(/armazenados apenas localmente/);
    expect(anamnesis).not.toMatch(/nunca são enviados para servidores externos/);
    expect(anamnesis).toMatch(/numa cópia de segurança no servidor do Vigora, protegida por autenticação/);
    expect(anamnesis).toMatch(/quando você compartilha a ficha ou vincula um cuidador/);
  });

  it('a Ajuda diz a verdade sobre onde ficam os dados', () => {
    expect(help).not.toMatch(/Nenhuma informação é enviada para servidores externos/);
    expect(help).not.toMatch(/Todos os dados são armazenados localmente/);
    expect(help).toMatch(/Seus dados ficam no seu celular e numa cópia de segurança no servidor do Vigora, protegida por autenticação\./);
    expect(help).toMatch(/Nunca vendemos nem usamos seus dados para propaganda\./);
  });

  it('a resposta da Ajuda não promete segurança absoluta (marketing proibido)', () => {
    const answer = help.match(/question: 'Meus dados médicos são seguros\?',\s*answer: '([^']*)'/);
    expect(answer).not.toBeNull();
    expect(answer![1]).not.toMatch(/^Sim!/);
    expect(answer![1]).not.toMatch(/garant/i);
  });
});
