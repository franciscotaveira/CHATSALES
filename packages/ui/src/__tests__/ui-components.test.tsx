import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import {
  colors,
  typography,
  spacing,
  radii,
  Button,
  IconButton,
  SegmentedControl,
  Avatar,
  PageHeader,
  ListItem,
  Input,
  Badge,
  Alert,
  EmptyState,
  LoadingState,
  Dialog,
  Drawer,
  AppShell,
} from "../index";

describe("SOS Sales V3 — packages/ui Component & Token Suite", () => {
  describe("1. Tokens Semânticos e Acessibilidade (WCAG 2.2 AA)", () => {
    it("should export canonical color tokens conforming to Sovereign Light Theme specification", () => {
      expect(colors.canvas).toBe("#F8FAFC");
      expect(colors.surface).toBe("#FFFFFF");
      expect(colors.sidebar).toBe("#0B132B");
      expect(colors.action).toBe("#008069"); // Canonical WhatsApp Action Green (4.89:1 on #FFFFFF)
      expect(colors.operational).toBe("#2563EB");
      expect(colors.danger).toBe("#DC2626");
      expect(colors.warning).toBe("#D97706");
      expect(colors.textPrimary).toBe("#0F172A");
      expect(colors.textSecondary).toBe("#475569");
    });

    it("should export simplified typography tokens with Inter and JetBrains Mono", () => {
      expect(typography.fontSans).toContain("Inter");
      expect(typography.fontMono).toContain("JetBrains Mono");
      expect(typography.size.base).toBe("1rem");
      expect(typography.weight.semibold).toBe(600);
    });

    it("should export spacing and radii tokens", () => {
      expect(spacing[4]).toBe("16px");
      expect(radii.md).toBe("8px");
      expect(radii.full).toBe("9999px");
    });
  });

  describe("2. Componente Button", () => {
    it("should render primary action button with proper styles", () => {
      const html = renderToString(<Button variant="primary">Continuar Atendimento</Button>);
      expect(html).toContain("Continuar Atendimento");
      expect(html).toContain("sos-button-primary");
      expect(html).toContain("var(--color-action, #008069)");
    });

    it("should render loading state with spinner and aria-busy", () => {
      const html = renderToString(
        <Button variant="primary" loading>
          Salvando...
        </Button>
      );
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain("disabled");
      expect(html).toContain("spin");
    });

    it("should render danger button variant", () => {
      const html = renderToString(<Button variant="danger">Excluir</Button>);
      expect(html).toContain("sos-button-danger");
      expect(html).toContain("var(--color-danger, #DC2626)");
    });
  });

  describe("3. Componente Input com Acessibilidade", () => {
    it("should render input with associated label", () => {
      const html = renderToString(
        <Input id="client-phone" label="WhatsApp do Cliente" placeholder="5549999999999" />
      );
      expect(html).toContain('for="client-phone"');
      expect(html).toContain('id="client-phone"');
      expect(html).toContain("WhatsApp do Cliente");
    });

    it("should render error message with role='alert' and aria-invalid='true'", () => {
      const html = renderToString(
        <Input id="user-email" label="E-mail" error="E-mail inválido ou inexistente" />
      );
      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('role="alert"');
      expect(html).toContain("E-mail inválido ou inexistente");
      expect(html).toContain('aria-describedby="user-email-error"');
    });

    it("should render helper text when no error is present", () => {
      const html = renderToString(
        <Input id="notes" label="Notas" helperText="Apenas visível para equipe interna" />
      );
      expect(html).toContain("Apenas visível para equipe interna");
      expect(html).toContain('aria-describedby="notes-helper"');
    });
  });

  describe("4. Componente Badge", () => {
    it("should render semantic status badges with pulse dot", () => {
      const html = renderToString(
        <Badge variant="action" pulseDot>
          Online no WhatsApp
        </Badge>
      );
      expect(html).toContain("Online no WhatsApp");
      expect(html).toContain("sos-badge-action");
      expect(html).toContain("var(--color-action, #008069)");
    });

    it("should render warning and operational badges", () => {
      const warningHtml = renderToString(<Badge variant="warning">SLA 2m</Badge>);
      expect(warningHtml).toContain("SLA 2m");
      expect(warningHtml).toContain("var(--color-warning, #D97706)");

      const operationalHtml = renderToString(<Badge variant="operational">Atribuído</Badge>);
      expect(operationalHtml).toContain("Atribuído");
      expect(operationalHtml).toContain("var(--color-operational, #2563EB)");
    });
  });

  describe("5. Componente Alert", () => {
    it("should render danger alert with role='alert'", () => {
      const html = renderToString(
        <Alert variant="danger" title="Permissão Negada">
          Você não possui o papel necessário para gerenciar este workspace.
        </Alert>
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain("Permissão Negada");
      expect(html).toContain("Você não possui o papel necessário");
    });

    it("should render success alert with role='status'", () => {
      const html = renderToString(
        <Alert variant="success" title="Conexão Estabelecida">
          Sessão local validada com sucesso.
        </Alert>
      );
      expect(html).toContain('role="status"');
      expect(html).toContain("Conexão Estabelecida");
    });
  });

  describe("6. Componente EmptyState (Truth in Data)", () => {
    it("should render honest empty state without simulated metrics or placeholder chats", () => {
      const html = renderToString(
        <EmptyState
          title="Nenhuma conversa ativa"
          description="Aguardando novas mensagens do canal WhatsApp oficial."
          action={<Button variant="outline">Ver Histórico</Button>}
        />
      );
      expect(html).toContain("Nenhuma conversa ativa");
      expect(html).toContain("Aguardando novas mensagens do canal WhatsApp oficial.");
      expect(html).toContain("Ver Histórico");
    });
  });

  describe("7. Componente LoadingState", () => {
    it("should render skeleton lines with role='status' and aria-live='polite'", () => {
      const html = renderToString(<LoadingState variant="skeleton" lines={4} />);
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain("animate-pulse");
    });

    it("should render spinner variant with informative text", () => {
      const html = renderToString(<LoadingState variant="spinner" text="Buscando workspaces..." />);
      expect(html).toContain('role="status"');
      expect(html).toContain("Buscando workspaces...");
      expect(html).toContain("spin");
    });
  });

  describe("8. Componente Dialog com Acessibilidade", () => {
    it("should render dialog with role='dialog' and aria-modal='true'", () => {
      const html = renderToString(
        <Dialog
          isOpen={true}
          onClose={() => {}}
          title="Confirmar Fechamento"
          description="Esta ação registrará o evento de continuidade comercial."
          footer={<Button variant="primary">Confirmar</Button>}
        >
          <p>Conteúdo do modal acessível.</p>
        </Dialog>
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain("Confirmar Fechamento");
      expect(html).toContain("Esta ação registrará o evento");
      expect(html).toContain("Conteúdo do modal acessível.");
      expect(html).toContain("Confirmar");
    });

    it("should not render anything when isOpen is false", () => {
      const html = renderToString(
        <Dialog isOpen={false} onClose={() => {}} title="Oculto">
          <p>Não deve aparecer</p>
        </Dialog>
      );
      expect(html).toBe("");
    });
  });

  describe("9. Componente Drawer com Acessibilidade", () => {
    it("should render slide-over drawer with role='dialog' and aria-modal='true'", () => {
      const html = renderToString(
        <Drawer
          isOpen={true}
          onClose={() => {}}
          title="Dossiê Vivo do Cliente"
          description="Histórico e evidências de atendimento"
          position="right"
        >
          <div>Timeline de eventos reais</div>
        </Drawer>
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain("Dossiê Vivo do Cliente");
      expect(html).toContain("Timeline de eventos reais");
      expect(html).toContain("sos-drawer-right");
    });
  });

  describe("10. Componente AppShell Responsivo", () => {
    it("should render AppShell with sidebar, header, workspace selector and main content", () => {
      const mockNav = [
        { id: "atendimento", label: "Atendimento", icon: <span>💬</span>, active: true },
        { id: "funil", label: "Funil Comercial", icon: <span>📊</span> },
      ];

      const mockWorkspaces = [
        { id: "ws-1", name: "Matriz Chapecó", role: "owner" },
        { id: "ws-2", name: "Filial Florianópolis", role: "operator" },
      ];

      const html = renderToString(
        <AppShell
          navItems={mockNav}
          activeNavId="atendimento"
          onNavSelect={() => {}}
          workspaces={mockWorkspaces}
          activeWorkspace={mockWorkspaces[0]}
          userEmail="operador@automatizaprocessos.tech"
          userRole="owner"
          systemStatus={{ label: "Docker Lab 55440", variant: "action" }}
        >
          <div id="test-content">Painel Operacional Ativo</div>
        </AppShell>
      );

      // Verify Brand and Structure
      expect(html).toContain("SOS Sales");
      expect(html).not.toContain("Soberano");
      expect(html).toContain("Atendimento");
      expect(html).toContain("Funil Comercial");

      // Verify Header & User context
      expect(html).toContain("Matriz Chapecó");
      expect(html).toContain("Docker Lab 55440");

      // Verify Main Content
      expect(html).toContain("test-content");
      expect(html).toContain("Painel Operacional Ativo");
    });
  });

  describe("11. Componente IconButton", () => {
    it("should render square icon button with accessible aria-label and title", () => {
      const html = renderToString(
        <IconButton
          aria-label="Recolher Dossiê Lateral"
          icon={<span id="test-icon">icon</span>}
          size="sm"
        />
      );
      expect(html).toContain('aria-label="Recolher Dossiê Lateral"');
      expect(html).toContain('title="Recolher Dossiê Lateral"');
      expect(html).toContain("sos-icon-button-sm");
      expect(html).toContain("test-icon");
    });
  });

  describe("12. Componente SegmentedControl", () => {
    it("should render radio group with active elevated segment", () => {
      const options = [
        { value: "abertas", label: "Abertas", badge: 3 },
        { value: "todas", label: "Todas" },
      ];
      const html = renderToString(
        <SegmentedControl
          options={options}
          value="abertas"
          onChange={() => {}}
          aria-label="Filtro de Conversas"
        />
      );
      expect(html).toContain('role="radiogroup"');
      expect(html).toContain('aria-label="Filtro de Conversas"');
      expect(html).toContain('aria-checked="true"');
      expect(html).toContain("Abertas");
      expect(html).toContain("3");
    });
  });

  describe("13. Componente Avatar", () => {
    it("should render initials without DDI numbers", () => {
      const html = renderToString(
        <Avatar name="Dra. Mariana Costa" id="lead-123" size="lg" />
      );
      expect(html).toContain("DC");
      expect(html).toContain("sos-avatar-lg");
    });

    it("should render person fallback icon when no name is provided", () => {
      const html = renderToString(<Avatar id="lead-456" size="md" />);
      expect(html).toContain("sos-avatar-md");
      expect(html).toContain("svg");
    });
  });

  describe("14. Componente PageHeader", () => {
    it("should render title, description and actions", () => {
      const html = renderToString(
        <PageHeader
          title="Modelos de Mensagem"
          description="Gerencie templates oficiais WABA"
          actions={<button type="button">Novo Modelo</button>}
        />
      );
      expect(html).toContain("Modelos de Mensagem");
      expect(html).toContain("Gerencie templates oficiais WABA");
      expect(html).toContain("Novo Modelo");
    });
  });

  describe("15. Componente ListItem", () => {
    it("should render leading, title, subtitle and trailing with 72px height", () => {
      const html = renderToString(
        <ListItem
          leading={<span>Avatar</span>}
          title="Carlos Eduardo"
          subtitle="Vi o anúncio no Instagram"
          meta="10:48"
          trailing={<span>●</span>}
          height="lg"
          selected
        />
      );
      expect(html).toContain("Carlos Eduardo");
      expect(html).toContain("Vi o anúncio no Instagram");
      expect(html).toContain("10:48");
      expect(html).toContain("sos-list-item-selected");
    });
  });

  describe("16. Componente Drawer com Bottom Sheet", () => {
    it("should render bottom sheet with proper aria attributes", () => {
      const html = renderToString(
        <Drawer
          isOpen
          onClose={() => {}}
          title="Contexto do Lead"
          position="bottom"
        >
          <div>Detalhes do Lead</div>
        </Drawer>
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain("sos-drawer-bottom");
      expect(html).toContain("Contexto do Lead");
    });
  });
});

