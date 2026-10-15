/**
 * Listas de Remédios e Check-in com um acordo ativo (spec 6.2): só leitura, nos
 * dois modos. As telas não são importáveis no vitest (React Native), então o
 * teste trava no fonte onde mora cada regra.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const list = read("components/alarm-list-screen.tsx");
const card = read("components/alarm-card.tsx");

describe("AlarmListScreen só leitura", () => {
  it("o modo vem do acordo guardado no estado", () => {
    expect(list).toMatch(/const management = state\.management;/);
    expect(list).toMatch(/const readOnly = !!management;/);
  });

  it("o aviso 'Quem cuida dos seus alarmes é ...' aparece nos dois modos", () => {
    expect(list).toMatch(/const bannerText = readOnlyBannerText\(management\?\.caregiverName\);/);
    expect((list.match(/\{bannerText\}/g) ?? []).length).toBe(2);
    expect(list).toMatch(/\{readOnly && \(\s*<View style=\{\{[^}]*marginHorizontal: 12/); // acessível
    expect(list).toMatch(/\{readOnly && \(\s*<View style=\{\[styles\.managedBanner/); // normal
  });

  it("'Adicionar' some nos dois modos e a função também não abre o formulário", () => {
    expect(list).toMatch(/\{!readOnly && \(\s*<View style=\{\{\s*paddingHorizontal: 16,/); // acessível
    expect(list).toMatch(/\{!readOnly && \(\s*<View style=\{\[styles\.addBtnContainer/); // normal
    expect(list).toMatch(/const openAddModal = \(\) => \{\s*if \(readOnly\) return;/);
  });

  it("o interruptor some: o card normal não recebe onToggle", () => {
    expect(list).toMatch(/onToggle=\{readOnly \? undefined : handleToggle\}/);
  });

  it("tocar num alarme abre os detalhes, nunca o formulário (isso cobre o atalho ?alarmId=)", () => {
    expect(list).toMatch(
      /const openEditModal = \(alarm: Alarm\) => \{\s*if \(readOnly\) \{\s*showDetails\(alarm\);\s*return;\s*\}\s*setEditingAlarm\(alarm\);/
    );
    expect(list).toMatch(/const details = alarmDetailsCopy\(alarm\);/);
    expect(list).toMatch(/buttons: \[\{ text: details\.closeLabel \}\]/);
  });

  it("o botão do card acessível vira 'Ver detalhes'", () => {
    expect(list).toMatch(/\{readOnly \? 'Ver detalhes' : 'Editar'\}/);
  });

  it("o formulário que estava aberto fecha quando o acordo começa (excluir só existe lá dentro)", () => {
    expect(list).toMatch(/useEffect\(\(\) => \{\s*if \(readOnly\) setModalVisible\(false\);\s*\}, \[readOnly\]\);/);
  });

  it("a lista vazia não pede para adicionar", () => {
    expect((list.match(/readOnly \? READ_ONLY_EMPTY_TEXT/g) ?? []).length).toBe(2);
  });

  it("sem cor fixa e sem Alert.alert", () => {
    expect(list).not.toMatch(/Alert\.alert/);
    expect(list).not.toMatch(/#[0-9A-Fa-f]{6}\b/);
  });
});

describe("AlarmCard com onToggle opcional", () => {
  it("o tipo aceita ficar sem onToggle", () => {
    expect(card).toMatch(/onToggle\?: \(alarm: Alarm\) => void;/);
  });

  it("o interruptor só existe quando há onToggle; sem ele é só um selo", () => {
    expect(card).toMatch(/\{onToggle \? \(\s*<Pressable/);
    expect((card.match(/onToggle\(alarm\)/g) ?? []).length).toBe(1);
    expect(card).toMatch(/accessibilityLabel=\{alarm\.enabled \? 'Lembrete ativo' : 'Lembrete inativo'\}/);
  });

  it("o texto de ajuda muda para 'Toque para ver'", () => {
    expect(card).toMatch(/\{onToggle \? 'Toque para editar' : 'Toque para ver'\}/);
  });
});
