import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateCnpjDigits, formatCnpj } from "../routes/enrichment.routes";

describe("Fiscal Enrichment Engine (BrasilAPI CNPJ & CEP)", () => {
  describe("validateCnpjDigits", () => {
    it("validates valid CNPJs correctly", () => {
      // Banco do Brasil: 00.000.000/0001-91
      expect(validateCnpjDigits("00000000000191")).toBe(true);
      expect(validateCnpjDigits("00.000.000/0001-91")).toBe(true);
      // Petrobras: 33.000.167/0001-01
      expect(validateCnpjDigits("33000167000101")).toBe(true);
    });

    it("rejects invalid length or repeated digits", () => {
      expect(validateCnpjDigits("00000000000000")).toBe(false);
      expect(validateCnpjDigits("11111111111111")).toBe(false);
      expect(validateCnpjDigits("123456")).toBe(false);
      expect(validateCnpjDigits("123456789012345")).toBe(false);
    });

    it("rejects corrupt verification digits", () => {
      // 00.000.000/0001-92 (bad last digit)
      expect(validateCnpjDigits("00000000000192")).toBe(false);
      // 33.000.167/0001-00 (bad last digit)
      expect(validateCnpjDigits("33000167000100")).toBe(false);
    });
  });

  describe("formatCnpj", () => {
    it("formats 14 raw digits into standard brazilian mask", () => {
      expect(formatCnpj("00000000000191")).toBe("00.000.000/0001-91");
      expect(formatCnpj("33000167000101")).toBe("33.000.167/0001-01");
    });
  });
});
