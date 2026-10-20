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
const allPages = fs
  .readdirSync(SITE_DIR)
  .filter((f) => f.endsWith(".html"))
  .map((f) => fs.readFileSync(path.join(SITE_DIR, f), "utf8"));

const textoSemTags = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("site — página inicial", () => {
  it("tem o disclaimer exato", () => expect(index).toContain(DISCLAIMER));

  it("tem o título aprovado", () => {
    expect(index).toMatch(/<h1[^>]*>Uma mensagem, na hora em que ela importa\.<\/h1>/);
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
    expect(textoSemTags(index)).toContain(
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

  it("não usa script nem style inline (CSP do site)", () => {
    for (const html of allPages) {
      expect(html).not.toMatch(/<script\b|\sstyle="|\son[a-z]+="/i);
    }
  });
});
