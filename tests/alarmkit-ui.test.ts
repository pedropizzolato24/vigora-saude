/**
 * No iOS 26+ o alarme já tocou e já foi desligado na tela do sistema quando a
 * alarm-ring monta. Ela não pode: tocar som por cima, vibrar, rodar countdown,
 * nem escalar — o alarme FOI atendido.
 *
 * O que decide isso é a PROCEDÊNCIA do disparo (`fromAlarmKit=1` na rota), não
 * a capacidade do aparelho: num 26+ existem rotas vivas para esta tela que NÃO
 * vêm do AlarmKit (botão "Testar", notificação legada de build anterior), e
 * nelas desligar o countdown desarmaria o dead man's switch de um alarme real.
 *
 * E settings.alarmVolume deixa de valer: o AlarmKit usa o volume de alarme do
 * celular. Um controle que não faz nada é pior que controle nenhum.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const raiz = join(__dirname, "..");
const alarmRing = readFileSync(join(raiz, "app/alarm-ring.tsx"), "utf8");
const settings = readFileSync(join(raiz, "app/(tabs)/settings.tsx"), "utf8");
const layout = readFileSync(join(raiz, "app/_layout.tsx"), "utf8");

/** Só o ramo `isAccessibilityMode` da alarm-ring. */
const ramoAcessivel = (() => {
  const i = alarmRing.indexOf("if (isAccessibilityMode) {");
  const j = alarmRing.indexOf("// --- Normal Mode", i);
  expect(i, "não achei o ramo acessível").toBeGreaterThan(-1);
  expect(j, "não achei o fim do ramo acessível").toBeGreaterThan(i);
  return alarmRing.slice(i, j);
})();

describe("alarm-ring no iOS 26+", () => {
  it("deriva o estado da PROCEDÊNCIA do disparo, não da capacidade do aparelho", () => {
    // `isAlarmKitAvailable()` responde "este iPhone tem AlarmKit" — verdadeiro
    // também no botão "Testar" e na notificação legada, onde o alarme NÃO foi
    // atendido e o countdown precisa rodar.
    expect(alarmRing).toMatch(/const vindoDoAlarmKit\s*=\s*fromAlarmKit === '1';/);
    // Sem o import a capacidade não tem como voltar a decidir. (O nome ainda
    // aparece num comentário, explicando por que NÃO é ele — por isso a
    // asserção mira o import, não a prosa.)
    expect(alarmRing).not.toMatch(/^import .*isAlarmKitAvailable/m);
  });

  it("lê fromAlarmKit dos parâmetros da rota", () => {
    const params = alarmRing.match(/useLocalSearchParams<\{[^}]*\}>\(\)/);
    expect(params, "não achei useLocalSearchParams").not.toBeNull();
    expect(params![0]).toMatch(/fromAlarmKit\?: string/);
  });

  it("o countdown é guardado por essa flag", () => {
    // O countdown é o que escala para a família. Rodá-lo depois de o idoso ter
    // desligado o alarme escalaria um alarme ATENDIDO. A guarda tem que estar
    // antes de qualquer initTimer/setInterval do disparo.
    const efeito = alarmRing.match(/initTimer[\s\S]{0,400}/);
    expect(efeito, "não achei o início do timer").not.toBeNull();
    expect(alarmRing).toMatch(/if \(vindoDoAlarmKit\) return;/);
  });

  it("não toca som por cima — o alarme do sistema já tocou e já parou", () => {
    // São DOIS caminhos independentes que precisam desistir: o do countdown e
    // o que retoma o som ao fim da fala. Uma guarda só passaria este teste com
    // o som ainda subindo por cima de um alarme que já acabou.
    const guardas = alarmRing.match(/if \(vindoDoAlarmKit\) return;/g) ?? [];
    expect(
      guardas.length,
      "esperava ao menos duas guardas: countdown e som",
    ).toBeGreaterThanOrEqual(2);
  });

  it("a subida do som no mount também desiste", () => {
    // Esta guarda é condição, não `return`: som, vibração e FALA dividem o
    // mesmo efeito e a voz continua nos dois caminhos. Sem este expect ela
    // poderia sumir sem nada reclamar.
    expect(alarmRing).toMatch(/Platform\.OS === 'ios' && soundOn && !vindoDoAlarmKit/);
  });

  it("não vibra depois de o alarme já ter sido respondido", () => {
    // vibrate(..., true) repete até Vibration.cancel(): sem a guarda o celular
    // vibra sem parar depois de o idoso ter desligado o alarme.
    expect(alarmRing).toMatch(/if \(vibrationOk && !vindoDoAlarmKit\)/);
  });

  it("não oferece soneca — ela seria uma armadilha no iPhone", () => {
    // snoozeNativeAlarm é no-op fora do Android, mas handleSnooze registra o
    // evento pendente: nada voltaria a tocar e a família seria avisada em 5min
    // sobre quem acabou de responder. Escondido nos DOIS modos.
    const guardas = alarmRing.match(/\{!isExpired && !vindoDoAlarmKit && \(/g) ?? [];
    expect(guardas.length, "esperava a guarda nos dois modos").toBe(2);
  });

  it("a voz não manda procurar um botão que não está na tela", () => {
    // A fala é a única coisa que sobrevive no caminho do AlarmKit, e lá o botão
    // se chama "Confirmado" — não existe nenhum "Desligar Alarme".
    expect(alarmRing).toMatch(/buildSpeechText\(\s*alarm\?\.description,\s*alarm\?\.time,\s*vindoDoAlarmKit,?\s*\)/);
    expect(alarmRing).toMatch(/vindoDoAlarmKit\s*\?\s*'Você já desligou o alarme[^']*'/);
    expect(alarmRing).toMatch(/:\s*'Toque em Desligar Alarme[^']*'/);
  });

  it("o ramo acessível usa a paleta acessível, não a do tema normal", () => {
    // ac.success (#0A6B39) é desenhado para o fundo creme. colors.success no
    // tema escuro + modo acessível cai para ~2,4:1 — reprova AA.
    expect(ramoAcessivel).toMatch(/ac\.success/);
    expect(ramoAcessivel).not.toMatch(/colors\.success/);
    expect(ramoAcessivel).not.toMatch(/colors\.onSuccess/);
  });
});

describe("navegação depois do dismiss do AlarmKit", () => {
  it("abre a tela do alarme carregando a procedência", () => {
    // Sem esta navegação a promessa da spec não acontece: o "Desligar" abriria
    // o app na última tela usada, sem falar qual remédio é.
    expect(layout).toMatch(
      /router\.push\(`\/alarm-ring\?alarmId=\$\{encodeURIComponent\(alarmId\)\}&fromAlarmKit=1`\)/,
    );
  });

  it("os DOIS drenos navegam — o do boot e o do retorno ao primeiro plano", () => {
    // O app pode ter SUBIDO pelo dismiss (boot) ou estar apenas suspenso em
    // memória (AppState). Só um dos dois deixaria metade dos casos sem tela.
    expect(layout).toMatch(/if \(confirmado\) aoDrenarDismiss\(confirmado\);/);
    expect(layout).toMatch(
      /watchAlarmKitDismissals\(loadCurrentAppStateRaw, aoDrenarDismiss\)/,
    );
  });

  it("não assina o store de rota na raiz do app", () => {
    // `usePathname()` na RAIZ (useSyncExternalStore) faria o RootLayout, que
    // hoje renderiza uma vez, renderizar a cada troca de rota — inclusive troca
    // de aba. O `content` é inline sem useMemo, então isso arrasta a cadeia de
    // providers, e o AppContext publica `value` literal novo a cada render:
    // invalida o contexto para os 28 arquivos com useAppContext(). Caro no
    // Samsung A / Moto G do nosso público.
    //
    // Chegou a existir aqui, como guarda anti-empilhamento, e é redundante: o
    // dreno duplo já é impossível porque takeDismissal() consome o payload na
    // leitura. (O nome sobrevive num comentário explicando isso — por isso a
    // asserção mira o import.)
    expect(layout).not.toMatch(/^import .*usePathname/m);
  });
});

describe("slider de volume", () => {
  it("é escondido quando o volume é do sistema", () => {
    // Aqui a pergunta certa É a capacidade do aparelho: o volume do alarme vem
    // do celular em todo 26+, tenha ou não disparo em curso.
    expect(settings).toMatch(/isAlarmKitAvailable/);
  });

  it("explica ao usuário em vez de sumir sem contexto", () => {
    expect(settings).toMatch(/volume do alarme do celular/i);
  });
});
