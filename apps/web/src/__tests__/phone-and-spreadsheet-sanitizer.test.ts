import { describe, it, expect } from "vitest";
import {
  sanitizeBrazilianPhoneE164,
  isRecipientNameVariable,
  formatTemplateDisplayTitle,
  getVariableMetadata,
} from "../pages/templates/BroadcastTemplateDialog";

describe("Spreadsheet & Phone Sanitizer Suite (MCT OS v2.0)", () => {
  it("should sanitize valid Brazilian mobile with full DDD", () => {
    const res = sanitizeBrazilianPhoneE164("(49) 99999-8888");
    expect(res).toEqual({ phoneE164: "+5549999998888" });
  });

  it("should sanitize mobile starting with 55", () => {
    const res = sanitizeBrazilianPhoneE164("5549988447562");
    expect(res).toEqual({ phoneE164: "+5549988447562" });
  });

  it("should sanitize mobile starting with leading 0 (trunk code)", () => {
    const res = sanitizeBrazilianPhoneE164("049988447562");
    expect(res).toEqual({ phoneE164: "+5549988447562" });
  });

  it("should append 9 to legacy 8-digit Brazilian mobile", () => {
    const res = sanitizeBrazilianPhoneE164("4988447562");
    expect(res).toEqual({ phoneE164: "+5549988447562" });
  });

  it("should reject Brazilian fixed landlines (starting with 2, 3, 4, 5)", () => {
    const res = sanitizeBrazilianPhoneE164("4933221100");
    expect(res).toHaveProperty("error");
    if ("error" in res) {
      expect(res.error).toBe("Telefone fixo descartado");
    }
  });

  it("should reject numbers without DDD", () => {
    const res = sanitizeBrazilianPhoneE164("999998888");
    expect(res).toHaveProperty("error");
    if ("error" in res) {
      expect(res.error).toContain("DDD ausente");
    }
  });

  it("should reject empty or invalid strings", () => {
    expect(sanitizeBrazilianPhoneE164("")).toHaveProperty("error");
    expect(sanitizeBrazilianPhoneE164("abcdef")).toHaveProperty("error");
  });
});

describe("Broadcast Template Engineering & Cost Optimization Suite (MCT OS v2.0)", () => {
  it("should identify recipient name variables accurately", () => {
    expect(isRecipientNameVariable("1")).toBe(true);
    expect(isRecipientNameVariable("nome")).toBe(true);
    expect(isRecipientNameVariable("cliente_nome")).toBe(true);
    expect(isRecipientNameVariable("primeiro_nome")).toBe(true);
    expect(isRecipientNameVariable("name")).toBe(true);
    expect(isRecipientNameVariable("2")).toBe(false);
    expect(isRecipientNameVariable("procedimento")).toBe(false);
    expect(isRecipientNameVariable("cupom")).toBe(false);
  });

  it("should format template titles without invented prices or provider approval", () => {
    const utilityTitle = formatTemplateDisplayTitle({
      name: "confirmacao_agendamento_v1",
      category: "UTILITY",
      metaTemplateId: "123456",
    });
    expect(utilityTitle).toContain("Confirmacao Agendamento (v1)");
    expect(utilityTitle).toContain("Utilidade — consulte tarifa no provedor");
    expect(utilityTitle).toContain("confira a aprovação");
    expect(utilityTitle).not.toContain("Meta Aprovado");
    expect(utilityTitle).not.toContain("85%");

    const marketingTitle = formatTemplateDisplayTitle({
      name: "oferta_relampago_vip",
      category: "MARKETING",
      metaTemplateId: null,
    });
    expect(marketingTitle).toContain("Oferta Relampago VIP");
    expect(marketingTitle).toContain("Marketing — consulte tarifa no provedor");
    expect(marketingTitle).toContain("Local");
  });

  it("should return human metadata and quick suggestions for variables", () => {
    const nameMeta = getVariableMetadata("1");
    expect(nameMeta.isName).toBe(true);
    expect(nameMeta.label).toBe("Nome do Contato");

    const procedureMeta = getVariableMetadata("2");
    expect(procedureMeta.isName).toBe(false);
    expect(procedureMeta.suggestions.length).toBeGreaterThan(0);
    expect(procedureMeta.suggestions).toContain("Limpeza de Pele");

    const discountMeta = getVariableMetadata("cupom");
    expect(discountMeta.isName).toBe(false);
    expect(discountMeta.suggestions).toContain("15% OFF");
  });
});
