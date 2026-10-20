// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { TemplateLibrarySection } from "../pages/templates/TemplateLibrarySection";
import { apiClient } from "../services/api-client";
import { CANONICAL_TEMPLATE_LIBRARY } from "@sos-sales/contracts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let el: HTMLDivElement;

const workspaceId = "11111111-1111-1111-1111-111111111111";
const token = "mock-jwt-token";

beforeEach(() => {
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});

afterEach(async () => {
  await act(async () => root.unmount());
  el.remove();
  vi.restoreAllMocks();
});

it("renders canonical templates and allows filtering by niche and category", async () => {
  await act(async () => {
    root.render(
      <TemplateLibrarySection
        workspaceId={workspaceId}
        token={token}
        onImportSuccess={vi.fn()}
      />
    );
  });

  expect(el.textContent).toContain("Biblioteca Canônica Soberana");
  expect(el.textContent).toContain(`${CANONICAL_TEMPLATE_LIBRARY.length} modelos prontos`);

  // Verify first template title exists
  const firstTitle = CANONICAL_TEMPLATE_LIBRARY[0]!.title;
  expect(el.textContent).toContain(firstTitle);

  // Click on "Saúde & Clínicas" filter button
  const saudeBtn = Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Saúde & Clínicas")
  );
  expect(saudeBtn).toBeDefined();
  await act(async () => {
    saudeBtn?.click();
  });

  // Verify health template appears
  expect(el.textContent).toContain("Confirmação de consulta médica agendada");
});

it("opens WhatsApp preview modal and imports template into workspace with 1-click", async () => {
  const onImportSuccess = vi.fn();
  const mockCreated = {
    id: "tpl-123",
    workspaceId,
    name: "pix_pendente_pedido_v1",
    category: "UTILITY" as const,
    language: "pt_BR",
    headerText: "Pagamento Pendente",
    bodyText: "Olá!",
    footerText: null,
    buttons: [],
    variables: [],
    status: "PENDING" as const,
    metaTemplateId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const importSpy = vi
    .spyOn(apiClient, "importTemplateFromLibrary")
    .mockResolvedValueOnce({
      template: mockCreated,
      message: "Modelo importado com sucesso!",
    });

  await act(async () => {
    root.render(
      <TemplateLibrarySection
        workspaceId={workspaceId}
        token={token}
        onImportSuccess={onImportSuccess}
      />
    );
  });

  // Click on "Importar (1-Clique)" of the first card
  const importBtn = Array.from(el.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Importar (1-Clique)")
  );
  expect(importBtn).toBeDefined();

  await act(async () => {
    importBtn?.click();
  });

  expect(importSpy).toHaveBeenCalledWith(
    workspaceId,
    CANONICAL_TEMPLATE_LIBRARY[0]!.id,
    { token }
  );
  expect(onImportSuccess).toHaveBeenCalledWith(mockCreated);
  expect(el.textContent).toContain("importado com sucesso!");
});
