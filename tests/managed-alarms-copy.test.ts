/**
 * Textos do pedido de gerenciamento (spec 3.2 e 3.4, palavra por palavra) e as
 * regras puras de quando mostrar o diálogo e o que enviar ao aceitar.
 */
import { describe, expect, it } from "vitest";
import {
  acceptedToastText,
  alarmsForAccept,
  caregiverLabel,
  caregiverMid,
  managementCardCopy,
  pickRequestToShow,
  requestDialogCopy,
  stopDialogCopy,
  STOPPED_TOAST_TEXT,
} from "../lib/managed-alarms-copy";
import type { Alarm } from "../lib/app-context";

describe("diálogo do pedido (spec 3.2)", () => {
  it("usa os textos da spec", () => {
    const c = requestDialogCopy("Ana");
    expect(c.title).toBe("Ana quer cuidar dos seus alarmes");
    expect(c.message).toBe(
      "Ana vai poder criar, mudar e apagar os seus remédios e check-ins. Você vai continuar vendo e respondendo, mas não vai conseguir apagar nem desligar. Você pode parar quando quiser em Configurações."
    );
    expect(c.acceptLabel).toBe("Deixar Ana cuidar");
    expect(c.declineLabel).toBe("Agora não");
  });

  it("sem nome, cai em 'Seu cuidador' no começo da frase e 'seu cuidador' no meio", () => {
    for (const vazio of ["", "   ", null, undefined]) {
      expect(caregiverLabel(vazio)).toBe("Seu cuidador");
      expect(caregiverMid(vazio)).toBe("seu cuidador");
      expect(requestDialogCopy(vazio).acceptLabel).toBe("Deixar seu cuidador cuidar");
      expect(requestDialogCopy(vazio).title).toBe("Seu cuidador quer cuidar dos seus alarmes");
    }
    expect(caregiverMid("Ana")).toBe("Ana");
  });
});

describe("parar o gerenciamento (spec 3.4) e cartão de Configurações", () => {
  it("confirma antes de parar e avisa que o cuidador será avisado", () => {
    const c = stopDialogCopy("Ana");
    expect(c.title).toBe("Parar?");
    expect(c.message).toBe("Ana será avisado. Você volta a cuidar dos seus alarmes.");
    expect(c.cancelLabel).toBe("Cancelar");
    expect(c.confirmLabel).toBe("Parar");
  });

  it("o cartão tem o título da spec e o botão Parar", () => {
    const c = managementCardCopy("Ana");
    expect(c.title).toBe("Ana cuida dos seus alarmes");
    expect(c.stopLabel).toBe("Parar");
    expect(c.subtitle).toContain("Você continua vendo e respondendo");
  });

  it("toasts de confirmação", () => {
    expect(acceptedToastText("Ana")).toBe("Ana agora cuida dos seus alarmes.");
    expect(STOPPED_TOAST_TEXT).toBe("Pronto. Você voltou a cuidar dos seus alarmes.");
  });
});

describe("alarmsForAccept: o que vai ao servidor no aceite", () => {
  const alarm = (over: Partial<Alarm> = {}): Alarm => ({
    id: "a1",
    time: "08:00",
    description: "Losartana",
    enabled: true,
    repeat: "daily",
    sound: true,
    vibration: true,
    notificationId: "n1",
    nativeAlarmUids: ["vigora_a1"],
    ...over,
  });

  it("tira notificationId e nativeAlarmUids e mantém o resto, inclusive check-in", () => {
    const checkin = alarm({ id: "c1", kind: "checkin", escalateAfterMinutes: 15, time: "09:00" });
    const lista = alarmsForAccept([alarm(), checkin]);
    expect(lista).toHaveLength(2);
    for (const a of lista) {
      expect("notificationId" in a).toBe(false);
      expect("nativeAlarmUids" in a).toBe(false);
    }
    expect(lista[1]).toMatchObject({ id: "c1", kind: "checkin", escalateAfterMinutes: 15 });
  });

  it("lista vazia continua vazia (aceitar sem nenhum alarme é válido)", () => {
    expect(alarmsForAccept([])).toEqual([]);
  });
});

describe("pickRequestToShow: quando o diálogo aparece", () => {
  const pend = { id: 7 };

  it("pedido pendente e livre: mostra", () => {
    expect(pickRequestToShow({ pending: pend, shownIds: new Set(), blocked: false })).toBe(7);
  });

  it("sem pedido: não mostra", () => {
    expect(pickRequestToShow({ pending: null, shownIds: new Set(), blocked: false })).toBeNull();
  });

  it("já mostrado nesta abertura (idoso fechou tocando fora): não mostra de novo", () => {
    expect(pickRequestToShow({ pending: pend, shownIds: new Set([7]), blocked: false })).toBeNull();
  });

  it("outro pedido (id diferente) volta a aparecer", () => {
    expect(pickRequestToShow({ pending: { id: 8 }, shownIds: new Set([7]), blocked: false })).toBe(8);
  });

  it("bloqueio de PIN ou tela do alarme: não mostra", () => {
    expect(pickRequestToShow({ pending: pend, shownIds: new Set(), blocked: true })).toBeNull();
  });
});
