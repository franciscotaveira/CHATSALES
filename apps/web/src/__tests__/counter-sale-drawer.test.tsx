// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { CounterSaleDrawer } from "../pages/cockpit/drawers/CounterSaleDrawer";
import { apiClient } from "../services/api-client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root, container: HTMLDivElement;
const closeMock = vi.fn();
const saleCreatedMock = vi.fn();

const button = (name: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(name))!;

async function setInputValue(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  closeMock.mockReset();
  saleCreatedMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it("renders CounterSaleDrawer with title and form sections when open", async () => {
  await act(async () =>
    root.render(
      <CounterSaleDrawer
        isOpen={true}
        onClose={closeMock}
        workspaceId="ws-123"
        token="test-token"
        onSaleCreated={saleCreatedMock}
      />
    )
  );

  expect(document.body.textContent).toContain("Nova Venda Balcão / POS");
  expect(document.body.textContent).toContain("Identificação do Cliente & Fiscal");
  expect(document.body.textContent).toContain("Produtos / Serviços Vendidos");
  expect(document.body.textContent).toContain("Pós-Venda Inteligente & Disparo Fiscal");
});

it("switches document type between CPF and CNPJ", async () => {
  await act(async () =>
    root.render(
      <CounterSaleDrawer
        isOpen={true}
        onClose={closeMock}
        workspaceId="ws-123"
        token="test-token"
        onSaleCreated={saleCreatedMock}
      />
    )
  );

  expect(document.body.textContent).toContain("CPF do Cliente");

  // Click on Pessoa Jurídica (CNPJ)
  const cnpjBtn = Array.from(document.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("CNPJ")
  );
  expect(cnpjBtn).toBeDefined();

  await act(async () => {
    cnpjBtn?.click();
  });

  expect(document.body.textContent).toContain("CNPJ da Empresa");
});

it("calculates total from items dynamically and handles submission", async () => {
  const mockResult = {
    success: true,
    contactId: "ct-123",
    proposalId: "prop-456",
    threadId: "th-789",
    totalCents: 15000,
    fiscalStatus: "solicitada" as const,
    whatsappDispatched: true,
    postSalePrompt: "Olá, obrigado pela sua compra! Deseja sua Nota Fiscal aqui?",
  };

  const createSaleSpy = vi.spyOn(apiClient, "createPosSale").mockResolvedValue(mockResult);

  await act(async () =>
    root.render(
      <CounterSaleDrawer
        isOpen={true}
        onClose={closeMock}
        workspaceId="ws-123"
        token="test-token"
        onSaleCreated={saleCreatedMock}
      />
    )
  );

  const inputs = document.querySelectorAll<HTMLInputElement>("input");

  // Input 0: Document (CPF)
  await setInputValue(inputs[0]!, "12345678901");
  // Input 1: Name
  await setInputValue(inputs[1]!, "Cliente Balcão");
  // Input 2: WhatsApp
  await setInputValue(inputs[2]!, "49999998888");

  // Line item title & price
  // Find item title input
  const titleInput = Array.from(inputs).find((i) => i.placeholder.includes("Película"));
  expect(titleInput).toBeDefined();
  await setInputValue(titleInput!, "Película Solar G5");

  // Find item price input
  const priceInput = Array.from(inputs).find((i) => i.placeholder === "0,00");
  expect(priceInput).toBeDefined();
  await setInputValue(priceInput!, "150,00");

  expect(document.body.textContent).toContain("150,00");

  // Submit button
  const submitBtn = button("Fechar Venda");
  expect(submitBtn).toBeDefined();
  expect(submitBtn.disabled).toBe(false);

  await act(async () => {
    submitBtn.click();
  });

  expect(createSaleSpy).toHaveBeenCalledOnce();
  expect(createSaleSpy).toHaveBeenCalledWith(
    "ws-123",
    expect.objectContaining({
      customer: expect.objectContaining({
        name: "Cliente Balcão",
        phoneE164: "+5549999998888",
        documentType: "CPF",
      }),
      sale: expect.objectContaining({
        totalCents: 15000,
        items: [
          expect.objectContaining({
            title: "Película Solar G5",
            unitPriceCents: 15000,
            quantity: 1,
          }),
        ],
      }),
      fiscal: expect.objectContaining({
        emitNfe: true,
      }),
      postSale: expect.objectContaining({
        sendUtilityWhatsapp: true,
      }),
    }),
    { token: "test-token" }
  );

  expect(saleCreatedMock).toHaveBeenCalledWith(mockResult);
  expect(document.body.textContent).toContain("Venda Registrada com Sucesso!");
  expect(document.body.textContent).toContain("Pronta para Emissão");
  expect(document.body.textContent).toContain("Notificação Enfileirada");
});
