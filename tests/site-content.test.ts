/**
 * site-content.test.ts
 *
 * Conteúdo do site lido do disco: disclaimer exato, título aprovado, termos
 * proibidos (CLAUDE.md › Marketing), formulário da lista de espera e os
 * marcadores que o servidor substitui.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { WAITLIST_REASONS } from "../server/db-waitlist";

const SITE_DIR = path.resolve("site");
const DISCLAIMER =
  "Vigora é um aplicativo informativo para monitoramento de saúde e não substitui o diagnóstico, tratamento ou acompanhamento profissional médico. Em caso de emergência médica, ligue 192 (SAMU) ou 193 (Bombeiros). Alertas automáticos podem falhar; não confie exclusivamente neste aplicativo em situações de risco.";

const index = fs.readFileSync(path.join(SITE_DIR, "index.html"), "utf8");
const privacidade = fs.readFileSync(path.join(SITE_DIR, "privacidade.html"), "utf8");
const termos = fs.readFileSync(path.join(SITE_DIR, "termos.html"), "utf8");
const allPages = fs
  .readdirSync(SITE_DIR)
  .filter((f) => f.endsWith(".html"))
  .map((f) => fs.readFileSync(path.join(SITE_DIR, f), "utf8"));

const textoSemTags = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("site — página inicial", () => {
  it("tem o disclaimer exato", () => expect(index).toContain(DISCLAIMER));

  it("tem o título aprovado", () => {
    const h1 = index.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect(textoSemTags(h1![1])).toBe("Uma mensagem, na hora em que ela importa.");
  });

  it("tem o balão da abertura com o horário em Space Mono", () => {
    expect(index).toContain("A Lúcia não respondeu ao alarme das 8h00.");
    expect(index).toMatch(/class="[^"]*mono[^"]*"[^>]*>08:07</);
    expect(index).toContain(
      "Quando o alarme toca e ninguém responde, o Vigora avisa vocês pelo WhatsApp, por SMS e no app."
    );
  });

  it("tem as seções na ordem aprovada, com os depoimentos antes da lista", () => {
    const marcos = [
      'id="o-que-deu-errado"',
      'id="como-funciona"',
      'id="o-que-mais"',
      'id="do-lado-dele"',
      'id="o-que-nao-faz"',
      "<!--depoimentos-->",
      'id="lista"',
      'id="perguntas"',
    ];
    const posicoes = marcos.map((m) => index.indexOf(m));
    for (const p of posicoes) expect(p).toBeGreaterThan(-1);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
  });

  it("como funciona é uma lista ordenada de 3 passos", () => {
    const secao = index.slice(index.indexOf('id="como-funciona"'), index.indexOf('id="o-que-mais"'));
    const ol = secao.match(/<ol[\s\S]*?<\/ol>/);
    expect(ol).not.toBeNull();
    expect(ol![0].match(/<li\b/g)).toHaveLength(3);
  });

  it("a linha do tempo fala só do lembrete de remédio e da localização, sem prometer demais", () => {
    const como = index.slice(index.indexOf('id="como-funciona"'), index.indexOf('id="o-que-mais"'));
    expect(como).not.toContain("Está tudo bem");
    expect(como).not.toContain("adivinhar");
    expect(como).toContain("última localização registrada");
    const texto = textoSemTags(index);
    expect(texto).not.toContain("receita");
    expect(texto).not.toMatch(/precisa aceitar antes de receber qualquer/);
    expect(texto).not.toMatch(/ninguém recebe um falso/);
    expect(texto).toContain("só recebe aviso automático quem concordou em receber");
    expect(texto).toContain("Usamos só para entender o que traz as pessoas ao Vigora.");
  });

  it("os dois formulários têm nomes distintos e dizem o que é obrigatório", () => {
    expect(index).toMatch(/<form[^>]*aria-label="Lista de espera, formulário rápido"/);
    expect(index).toMatch(/<form[^>]*aria-labelledby="t-lista"/);
    expect((index.match(/\(obrigatório\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(index).toMatch(/href="\/privacidade" target="_blank" rel="noopener"[^>]*>Política de Privacidade<span class="so-leitor"> \(abre em nova aba\)<\/span>/);
  });

  it("no DOM, o texto da abertura vem antes do balão", () => {
    expect(index.indexOf("<h1")).toBeLessThan(index.indexOf('class="balao-wrap"'));
  });

  it("não promete aviso imediato", () => {
    expect(textoSemTags(index)).not.toMatch(/imediat|na hora certa/i);
  });

  it("nenhuma página tem preço, 'Pro' ou termo proibido", () => {
    for (const html of allPages) {
      expect(html).not.toMatch(/R\$|\bPro\b|previne|prevenir|garante|controla a press|substitui consulta/i);
      for (const m of html.matchAll(/diagnostic/gi)) {
        expect(html.slice(Math.max(0, m.index! - 40), m.index)).toMatch(/não|nem/i);
      }
    }
  });

  it("o formulário posta em /lista com os cinco motivos e o aceite obrigatório", () => {
    for (const r of WAITLIST_REASONS) expect(index).toContain(`value="${r}"`);
    expect(index).toMatch(/name="aceite"[^>]*required/);
    const forms = index.match(/<form\b[^>]*>/g) ?? [];
    expect(forms).toHaveLength(2);
    for (const f of forms) {
      expect(f).toContain('method="post"');
      expect(f).toContain('action="/lista"');
    }
    expect(index.match(/name="aceite" value="sim" required/g)).toHaveLength(2);
    // Texto aprovado do aceite, sem o aviso de nova aba (só para leitor de tela).
    expect(textoSemTags(index.replace(/<span class="so-leitor">[^<]*<\/span>/g, ""))).toContain(
      "Li a Política de Privacidade e quero ser avisado por e-mail do lançamento do Vigora."
    );
    expect(index).toContain('href="/privacidade"');
  });

  it("menciona o teste de 14 dias na lista de espera", () => {
    const lista = index.slice(index.indexOf('id="lista"'), index.indexOf('id="perguntas"'));
    expect(lista).toContain("No lançamento, você terá 14 dias para testar com tudo liberado.");
  });

  it("perguntas usam <details> nativo e cobrem as mínimas do spec", () => {
    const faq = index.slice(index.indexOf('id="perguntas"'));
    expect((faq.match(/<details\b/g) ?? []).length).toBeGreaterThanOrEqual(5);
    for (const q of ["sem bateria", "SAMU", "não quiser usar", "Onde ficam os dados", "Quanto vai custar"]) {
      expect(faq).toContain(q);
    }
  });

  it("tem os dois marcadores do servidor", () => {
    expect(index).toContain("<!--depoimentos-->");
    expect(index).toContain("<!--erro-lista-->");
    const lista = index.slice(index.indexOf('id="lista"'), index.indexOf('id="perguntas"'));
    expect(lista).toContain("<!--erro-lista-->");
  });

  it("layout: main recebe foco do link de pular; obrigado lembra da caixa de spam", () => {
    const layout = fs.readFileSync(path.join(SITE_DIR, "_layout.html"), "utf8");
    expect(layout).toContain('<main id="conteudo" tabindex="-1">');
    const obrigado = fs.readFileSync(path.join(SITE_DIR, "obrigado.html"), "utf8");
    expect(obrigado).toContain("Pronto! Se este e-mail ainda não estava na lista, você vai receber a confirmação em instantes.");
    expect(obrigado).toContain("Confira também a caixa de spam.");
  });

  it("CSS: rodapé legível, marcador do FAQ mudo, botão visível em alto contraste, autofill legível", () => {
    const css = fs.readFileSync(path.join(SITE_DIR, "assets", "site.css"), "utf8");
    expect(css).toMatch(/\.rodape \{[^}]*font-size: 1\.125rem/);
    expect(css).toMatch(/\.aviso-legal \{[^}]*color: var\(--foreground\)/);
    expect(css).toContain('content: "+" / "";');
    expect(css).toContain('content: "\\2212" / "";');
    expect(css).toMatch(/\.btn \{[^}]*border: 2px solid transparent/);
    expect(css).toContain(".abertura .campo:-webkit-autofill");
    expect(css).toMatch(/\.balao-hora \{[^}]*font-size: 1\.125rem/);
  });

  it("não usa script nem style inline (CSP do site)", () => {
    for (const html of allPages) {
      expect(html).not.toMatch(/<script\b|\sstyle="|\son[a-z]+="/i);
    }
  });
});

describe("site — textos legais", () => {
  const RASCUNHO = "Rascunho — em revisão jurídica. Não publicar antes da revisão.";

  it("Política identifica controlador, DPO, Resend e a lista de espera", () => {
    for (const s of [
      "Pedro Frey Pizzolato",
      "Novo Hamburgo",
      "vigora@vigorasaude.com",
      "privacidade@vigorasaude.com",
      "Resend",
      "lista de espera",
      "TROCAR pela razão social",
      "Versão 2026-10-20",
    ]) {
      expect(privacidade).toContain(s);
    }
  });

  it("Termos têm foro, teste de 14 dias, disclaimer e suporte", () => {
    for (const s of ["Novo Hamburgo", "14 dias", DISCLAIMER, "suporte@vigorasaude.com", "Versão 2026-10-20"]) {
      expect(termos).toContain(s);
    }
  });

  it("as duas páginas abrem com o aviso de rascunho, antes da primeira seção", () => {
    for (const html of [privacidade, termos]) {
      const aviso = html.indexOf(RASCUNHO);
      expect(aviso).toBeGreaterThan(-1);
      expect(aviso).toBeLessThan(html.indexOf("<h2"));
    }
  });

  it("um h1 só, e todo link do sumário aponta para uma seção que existe", () => {
    for (const html of [privacidade, termos]) {
      expect(html.match(/<h1\b/g)).toHaveLength(1);
      const ancoras = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
      expect(ancoras.length).toBeGreaterThanOrEqual(5);
      for (const a of ancoras) expect(html).toContain(`id="${a}"`);
    }
  });
});
