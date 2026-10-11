import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { CommandPalette } from "../components/CommandPalette/CommandPalette";
import type { CommandItem } from "../components/CommandPalette/CommandPalette.types";

describe("CommandPalette Component", () => {
  const mockItems: CommandItem[] = [
    {
      id: "nav-cockpit",
      title: "Cockpit Geral",
      subtitle: "Atendimento e chats em tempo real",
      category: "navigation",
      shortcut: "⌘1",
      onSelect: vi.fn(),
    },
    {
      id: "nav-contacts",
      title: "Contatos & Leads",
      subtitle: "Base unificada de contatos",
      category: "navigation",
      onSelect: vi.fn(),
    },
    {
      id: "action-new-contact",
      title: "Novo Contato",
      subtitle: "Cadastrar lead manualmente",
      category: "actions",
      onSelect: vi.fn(),
    },
    {
      id: "ws-mct",
      title: "MCT Sovereign HQ",
      subtitle: "Workspace principal",
      category: "workspaces",
      onSelect: vi.fn(),
    },
  ];

  it("should not render when isOpen is false", () => {
    const html = renderToString(
      <CommandPalette isOpen={false} onClose={vi.fn()} items={mockItems} />
    );
    expect(html).toBe("");
  });

  it("should render search input and categorized items when isOpen is true", () => {
    const html = renderToString(
      <CommandPalette isOpen={true} onClose={vi.fn()} items={mockItems} activeWorkspaceName="MCT Sovereign" />
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Navegação Rápida");
    expect(html).toContain("Ações do Sistema");
    expect(html).toContain("Workspaces");
    expect(html).toContain("Cockpit Geral");
    expect(html).toContain("Contatos &amp; Leads");
    expect(html).toContain("MCT Sovereign");
    expect(html).toContain("ESC");
  });
});
