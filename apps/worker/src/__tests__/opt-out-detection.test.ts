import { describe, it, expect } from "vitest";
import { isOptOutMessage } from "../processors/inbox-processor";

describe("Anti-Ban Compliance: isOptOutMessage()", () => {
  it("should detect exact single-word opt-out triggers in Portuguese and English", () => {
    expect(isOptOutMessage("pare")).toBe(true);
    expect(isOptOutMessage("PARE")).toBe(true);
    expect(isOptOutMessage("parar")).toBe(true);
    expect(isOptOutMessage("PARAR")).toBe(true);
    expect(isOptOutMessage("sair")).toBe(true);
    expect(isOptOutMessage("SAIR")).toBe(true);
    expect(isOptOutMessage("stop")).toBe(true);
    expect(isOptOutMessage("STOP")).toBe(true);
    expect(isOptOutMessage("cancelar")).toBe(true);
    expect(isOptOutMessage("cancela")).toBe(true);
    expect(isOptOutMessage("fim")).toBe(true);
    expect(isOptOutMessage("remover")).toBe(true);
    expect(isOptOutMessage("remova")).toBe(true);
  });

  it("should detect diacritics and composite opt-out phrases", () => {
    expect(isOptOutMessage("Não quero mais")).toBe(true);
    expect(isOptOutMessage("nao quero mais")).toBe(true);
    expect(isOptOutMessage("NÃO QUERO MAIS")).toBe(true);
    expect(isOptOutMessage("descadastrar")).toBe(true);
    expect(isOptOutMessage("descadastre-me")).toBe(true);
    expect(isOptOutMessage("descadastre me")).toBe(true);
    expect(isOptOutMessage("desinscrever")).toBe(true);
    expect(isOptOutMessage("desinscreva-me")).toBe(true);
  });

  it("should detect opt-out keywords embedded with punctuation or in sentence beginnings/ends", () => {
    expect(isOptOutMessage("Por favor, pare!")).toBe(true);
    expect(isOptOutMessage("Por favor pare")).toBe(true);
    expect(isOptOutMessage("pare por favor")).toBe(true);
    expect(isOptOutMessage("SAIR.")).toBe(true);
    expect(isOptOutMessage("Stop, please.")).toBe(true);
    expect(isOptOutMessage("nao quero mais receber mensagens")).toBe(true);
    expect(isOptOutMessage("favor cancelar meu cadastro")).toBe(true);
  });

  it("should NOT trigger false positives for legitimate commercial conversations", () => {
    expect(isOptOutMessage("Olá, gostaria de saber mais sobre o sistema")).toBe(false);
    expect(isOptOutMessage("Quero comprar o plano anual")).toBe(false);
    expect(isOptOutMessage("Qual o preço do serviço?")).toBe(false);
    expect(isOptOutMessage("Vocês atendem em Chapecó?")).toBe(false);
    expect(isOptOutMessage("Vou sair para o almoço e já retorno")).toBe(false); // mid-sentence "sair" as verb in general talk
    expect(isOptOutMessage("Tenho interesse na mentoria")).toBe(false);
    expect(isOptOutMessage("Pode me mandar a proposta")).toBe(false);
    expect(isOptOutMessage("")).toBe(false);
    expect(isOptOutMessage(null)).toBe(false);
    expect(isOptOutMessage(undefined)).toBe(false);
  });
});
