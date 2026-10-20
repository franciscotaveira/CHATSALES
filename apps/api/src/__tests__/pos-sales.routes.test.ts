import { describe, it, expect } from "vitest";
import { posSaleBodySchema } from "../routes/pos-sales.routes";

describe("POS Counter Sales Validation Suite", () => {
  it("validates a complete counter sale with CPF and items", () => {
    const payload = {
      customer: {
        name: "Carlos Eduardo da Silva",
        phoneE164: "+5549999112233",
        documentType: "CPF" as const,
        documentNumber: "12345678909",
        email: "carlos@gmail.com",
      },
      sale: {
        title: "Venda Presencial - Óculos de Sol",
        items: [
          {
            title: "Óculos RayBan Polarizado",
            unitPriceCents: 45000,
            quantity: 1,
          },
        ],
        totalCents: 45000,
        paymentMethod: "pix" as const,
      },
      fiscal: {
        emitNfe: true,
      },
      postSale: {
        sendUtilityWhatsapp: true,
        bonusPercent: 10,
        bonusCoupon: "VIP10",
      },
    };

    const parsed = posSaleBodySchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it("validates a counter sale with CNPJ and address", () => {
    const payload = {
      customer: {
        name: "Chapecó Películas LTDA",
        phoneE164: "+5549988447562",
        documentType: "CNPJ" as const,
        documentNumber: "12.345.678/0001-90",
        companyName: "Chapecó Películas Automotivas LTDA",
        address: {
          zipCode: "89801000",
          street: "Av. Getúlio Vargas",
          number: "1200",
          neighborhood: "Centro",
          city: "Chapecó",
          state: "SC",
        },
      },
      sale: {
        title: "Aplicação Película Térmica Cerâmica",
        items: [
          {
            title: "Película Parabrisa Nano Cerâmica G20",
            unitPriceCents: 85000,
            quantity: 1,
          },
        ],
        totalCents: 85000,
        paymentMethod: "credito" as const,
      },
      fiscal: {
        emitNfe: true,
        naturezaOperacao: "Prestação de serviço automotivo",
      },
      postSale: {
        sendUtilityWhatsapp: true,
        bonusPercent: 15,
        bonusCoupon: "PELICULAVIP",
        followUpFlow: "agendamento" as const,
      },
    };

    const parsed = posSaleBodySchema.safeParse(payload);
    expect(parsed.success).toBe(true);
  });

  it("rejects payload without items", () => {
    const payload = {
      customer: {
        name: "Maria Santos",
        phoneE164: "+5549999887766",
        documentType: "CPF" as const,
        documentNumber: "00011122233",
      },
      sale: {
        title: "Venda Vazia",
        items: [],
        totalCents: 1000,
      },
    };

    const parsed = posSaleBodySchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid E.164 phone numbers", () => {
    const payload = {
      customer: {
        name: "João Silva",
        phoneE164: "49999887766", // missing +
        documentType: "CPF" as const,
        documentNumber: "00011122233",
      },
      sale: {
        title: "Venda Teste",
        items: [{ title: "Item 1", unitPriceCents: 100, quantity: 1 }],
        totalCents: 100,
      },
    };

    const parsed = posSaleBodySchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });
});
