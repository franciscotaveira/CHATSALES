/**
 * SOS Sales V3 — Main Application Shell (MCT OS v2.0)
 * Integrates @sos-sales/ui primitives, useSession with session-generation guards,
 * verified Fastify connectivity polling, and dedicated navigation views.
 * Truth in Data: Zero fictitious fallbacks, laboratory controls quarantined to DEV.
 */

import { useState, useEffect, useCallback, useMemo, type FC } from "react";
import { AppShell, CommandPalette, type CommandItem } from "@sos-sales/ui";
import { useSession } from "./hooks/useSession";
import { useConnectivity } from "./hooks/useConnectivity";
import { apiClient } from "./services/api-client";
import { DevLabToolbar } from "./components/DevLabToolbar";
import { CockpitPage } from "./pages/CockpitPage";
import { ContactsPage } from "./pages/ContactsPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { TemplatesPage } from "./pages/TemplatesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CatalogPage } from "./pages/CatalogPage";
import { OpportunitiesPage } from "./pages/opportunities/OpportunitiesPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import {
  MessageSquare,
  Users,
  TrendingUp,
  Send,
  Settings,
  FileText,
  Package,
  Building2,
  LogOut,
  RefreshCw,
  PlusCircle,
  Smartphone,
} from "lucide-react";
import { LoginPage } from "./pages/LoginPage";

import { extractHashAccessToken } from "./services/supabase-auth";

declare const __CHAT_SALES_LAB__: boolean;

/** Compile-time build boundary: false removes laboratory branches from production. */
export const LAB_DISTRIBUTION = __CHAT_SALES_LAB__;

const getInitialRoute = (): { navId: string; isCatalog: boolean } => {
  if (typeof window === "undefined") return { navId: "cockpit", isCatalog: false };
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (path === "/dev/ui" || hash === "#catalog" || hash === "#dev/ui") {
    return { navId: "cockpit", isCatalog: true };
  }
  if (path === "/modelos" || hash === "#modelos") {
    return { navId: "modelos", isCatalog: false };
  }
  if (path === "/produtos" || hash === "#produtos") {
    return { navId: "produtos", isCatalog: false };
  }
  if (path === "/conversoes" || path === "/campaigns" || hash === "#conversoes") {
    return { navId: "conversoes", isCatalog: false };
  }
  if (path === "/contacts" || path === "/contatos" || hash === "#contacts") {
    return { navId: "contacts", isCatalog: false };
  }
  if (path === "/oportunidades" || path === "/opportunities" || hash === "#oportunidades" || hash === "#opportunities") {
    return { navId: "oportunidades", isCatalog: false };
  }
  if (path === "/settings" || path === "/configuracoes" || hash === "#settings") {
    return { navId: "settings", isCatalog: false };
  }
  return { navId: "cockpit", isCatalog: false };
};

export const App: FC = () => {
  const isLab = LAB_DISTRIBUTION;

  // Token state: Checked in URL parameters, persistent localStorage, and dev sessionStorage
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;

    // 1. Direct URL token parameter bootstrap (?token=... or ?auth=...)
    // STRICTLY RESTRICTED TO LAB DISTRIBUTION (Commercial build rejects query tokens)
    if (isLab) {
      try {
        const url = new URL(window.location.href);
        const urlToken = url.searchParams.get("token") || url.searchParams.get("auth");
        if (urlToken && urlToken.trim()) {
          const cleanToken = urlToken.trim();
          localStorage.setItem("sos_sales_auth_token", cleanToken);
          url.searchParams.delete("token");
          url.searchParams.delete("auth");
          window.history.replaceState(
            {},
            document.title,
            url.pathname + (url.search ? url.search : "") + url.hash
          );
          return cleanToken;
        }
      } catch {
        // Fallback if URL parsing fails
      }
    } else {
      // In commercial mode, purge any query param token to avoid accidental exposure
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("token") || url.searchParams.has("auth")) {
          url.searchParams.delete("token");
          url.searchParams.delete("auth");
          window.history.replaceState(
            {},
            document.title,
            url.pathname + (url.search ? url.search : "") + url.hash
          );
        }
      } catch {
        // Ignore URL parsing errors
      }
    }

    // 2. Supabase Auth magic link redirect callback (#access_token=...)
    const hashToken = extractHashAccessToken();
    if (hashToken) {
      localStorage.setItem("sos_sales_auth_token", hashToken);
      return hashToken;
    }

    // 3. Persistent localStorage for authenticated operators
    const storedAuthToken = localStorage.getItem("sos_sales_auth_token");
    if (storedAuthToken && storedAuthToken.trim()) {
      return storedAuthToken.trim();
    }

    // 4. Dev Lab fallback (only if already stored in session in lab mode)
    if (isLab) {
      const stored = sessionStorage.getItem("sos_v3_lab_token");
      if (stored) return stored;
    }
    return null;
  });

  const [activeNavId, setActiveNavId] = useState<string>(() => getInitialRoute().navId);
  const [activeView, setActiveView] = useState<"cockpit" | "catalog">(() => {
    const route = getInitialRoute();
    if (isLab && route.isCatalog) {
      return "catalog";
    }
    return "cockpit";
  });
  const [isOfflineSimulated, setIsOfflineSimulated] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  // Global ⌘K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNavigate = useCallback((id: string) => {
    setActiveNavId(id);
    setActiveView("cockpit");
    const targetPath = id === "cockpit" ? "/" : `/${id}`;
    if (typeof window !== "undefined" && window.location.pathname !== targetPath) {
      window.history.pushState({}, "", targetPath);
    }
  }, []);

  // Synchronize URL and hash changes with active views
  useEffect(() => {
    const handleLocationChange = () => {
      const route = getInitialRoute();
      setActiveNavId(route.navId);
      if (isLab && route.isCatalog) {
        setActiveView("catalog");
      } else {
        setActiveView("cockpit");
      }
    };
    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, [isLab]);

  // Real-time Fastify /ready health polling
  const connectivity = useConnectivity();

  // Tenant & Session Hook with atomic switching, session generation & AbortController
  const session = useSession(token);

  const handleTokenChange = useCallback((newToken: string | null) => {
    setToken(newToken);
    if (typeof window !== "undefined") {
      if (newToken) {
        localStorage.setItem("sos_sales_auth_token", newToken);
        sessionStorage.removeItem("sos_v3_explicit_logged_out");
        if (isLab) {
          sessionStorage.setItem("sos_v3_lab_token", newToken);
        }
      } else {
        localStorage.removeItem("sos_sales_auth_token");
        sessionStorage.setItem("sos_v3_explicit_logged_out", "true");
        if (isLab) {
          sessionStorage.removeItem("sos_v3_lab_token");
        }
      }
    }
  }, [isLab]);

  const handleSimulateOffline = useCallback(() => {
    apiClient.setBaseUrl("http://localhost:9999"); // Intentionally invalid port
    setIsOfflineSimulated(true);
    session.refreshWorkspace();
    connectivity.checkNow();
  }, [session, connectivity]);

  const handleResetOffline = useCallback(() => {
    apiClient.setBaseUrl("http://localhost:4400"); // Normal API port
    setIsOfflineSimulated(false);
    session.refreshWorkspace();
    connectivity.checkNow();
  }, [session, connectivity]);

  const navItems = [
    {
      id: "cockpit",
      label: "Cockpit Geral",
      icon: <MessageSquare size={18} />,
    },
    {
      id: "contacts",
      label: "Contatos & Leads",
      icon: <Users size={18} />,
    },
    {
      id: "oportunidades",
      label: "Oportunidades",
      icon: <TrendingUp size={18} />,
    },
    {
      id: "modelos",
      label: "Modelos WABA",
      icon: <FileText size={18} />,
    },
    {
      id: "produtos",
      label: "Produtos",
      icon: <Package size={18} />,
    },
    {
      id: "conversoes",
      label: "Conversões",
      icon: <Send size={18} />,
    },
    {
      id: "settings",
      label: "Configurações",
      icon: <Settings size={18} />,
    },
  ];

  // Dynamic Command Palette items (Navigation, Actions, Workspaces)
  const commandItems = useMemo<CommandItem[]>(() => {
    const navCommands: CommandItem[] = [
      {
        id: "nav-cockpit",
        title: "Cockpit Geral",
        subtitle: "Chats, inbox e atendimento em tempo real",
        category: "navigation",
        icon: <MessageSquare size={16} />,
        shortcut: "⌘1",
        keywords: ["chat", "conversas", "inbox", "mensagens", "atendimento", "waha", "waba"],
        onSelect: () => handleNavigate("cockpit"),
      },
      {
        id: "nav-contacts",
        title: "Contatos & Leads",
        subtitle: "Base unificada de contatos e opt-outs",
        category: "navigation",
        icon: <Users size={16} />,
        shortcut: "⌘2",
        keywords: ["leads", "clientes", "telefones", "optout", "opt-out"],
        onSelect: () => handleNavigate("contacts"),
      },
      {
        id: "nav-oportunidades",
        title: "Pipeline de Oportunidades",
        subtitle: "Funil de vendas, estágios e negociações",
        category: "navigation",
        icon: <TrendingUp size={16} />,
        shortcut: "⌘3",
        keywords: ["funil", "pipeline", "negocios", "vendas", "leads"],
        onSelect: () => handleNavigate("oportunidades"),
      },
      {
        id: "nav-modelos",
        title: "Modelos WABA (HSM)",
        subtitle: "Templates oficiais e aprovações da Meta",
        category: "navigation",
        icon: <FileText size={16} />,
        shortcut: "⌘4",
        keywords: ["templates", "meta", "whatsapp oficial", "hsm", "mensagens"],
        onSelect: () => handleNavigate("modelos"),
      },
      {
        id: "nav-produtos",
        title: "Catálogo de Produtos",
        subtitle: "Gestão de produtos, ofertas e checkout Cakto",
        category: "navigation",
        icon: <Package size={16} />,
        shortcut: "⌘5",
        keywords: ["precos", "ofertas", "planos", "cakto", "pix"],
        onSelect: () => handleNavigate("produtos"),
      },
      {
        id: "nav-conversoes",
        title: "Conversões & Transmissões",
        subtitle: "Campanhas de disparos em massa e métricas",
        category: "navigation",
        icon: <Send size={16} />,
        shortcut: "⌘6",
        keywords: ["disparos", "broadcasts", "campanhas", "massa"],
        onSelect: () => handleNavigate("conversoes"),
      },
      {
        id: "nav-settings",
        title: "Configurações & Instâncias",
        subtitle: "Instâncias WhatsApp, membros da equipe e chaves de API",
        category: "navigation",
        icon: <Settings size={16} />,
        shortcut: "⌘7",
        keywords: ["ajustes", "conexoes", "qrcode", "api", "tokens", "equipe"],
        onSelect: () => handleNavigate("settings"),
      },
    ];

    const actionCommands: CommandItem[] = [
      {
        id: "act-new-broadcast",
        title: "Nova Campanha de Transmissão",
        subtitle: "Iniciar disparo em massa para contatos segmentados",
        category: "actions",
        icon: <PlusCircle size={16} />,
        onSelect: () => handleNavigate("conversoes"),
      },
      {
        id: "act-new-product",
        title: "Cadastrar Novo Produto",
        subtitle: "Adicionar item com link de checkout Cakto",
        category: "actions",
        icon: <PlusCircle size={16} />,
        onSelect: () => handleNavigate("produtos"),
      },
      {
        id: "act-whatsapp-instances",
        title: "Gerenciar Conexões WhatsApp",
        subtitle: "Escanear QR Code Waha ou configurar WABA Meta",
        category: "actions",
        icon: <Smartphone size={16} />,
        onSelect: () => handleNavigate("settings"),
      },
      {
        id: "act-sync-session",
        title: "Sincronizar Sessão e Conectividade",
        subtitle: "Recarregar dados do workspace ativo e testar API",
        category: "actions",
        icon: <RefreshCw size={16} />,
        onSelect: () => {
          session.refreshSession();
          connectivity.checkNow();
        },
      },
      {
        id: "act-logout",
        title: "Encerrar Sessão (Sair)",
        subtitle: `Conectado como ${session.user?.email || "operador"}`,
        category: "actions",
        icon: <LogOut size={16} />,
        onSelect: () => {
          session.logout();
          handleTokenChange(null);
        },
      },
    ];

    const workspaceCommands: CommandItem[] = (session.workspaces || []).map((ws) => {
      const isCurrent = ws.id === session.activeWorkspace?.id;
      return {
        id: `ws-${ws.id}`,
        title: ws.name,
        subtitle: isCurrent ? "Workspace ativo no momento" : "Pressione Enter para alternar para este workspace",
        badge: isCurrent ? "Ativo" : ws.role || "Membro",
        category: "workspaces",
        icon: <Building2 size={16} />,
        onSelect: () => session.selectWorkspace(ws.id),
      };
    });

    return [...navCommands, ...actionCommands, ...workspaceCommands];
  }, [session, connectivity, handleNavigate, handleTokenChange]);

  // Verified system status badge (Truth in Data)
  const systemStatus = {
    label: isOfflineSimulated
      ? "Modo Offline (Simulado)"
      : connectivity.status === "connected"
      ? "Sistema online"
      : connectivity.status === "offline"
      ? "Sistema offline"
      : connectivity.status === "degraded"
      ? "Sistema instável"
      : "Verificando...",
    shortLabel: isOfflineSimulated
      ? "Offline"
      : connectivity.status === "connected"
      ? "Online"
      : connectivity.status === "offline"
      ? "Offline"
      : connectivity.status === "degraded"
      ? "Instável"
      : "...",
    tooltip:
      connectivity.dbLatencyMs !== null && connectivity.dbLatencyMs !== undefined
        ? `Sistema online (latência: ${connectivity.dbLatencyMs}ms)`
        : undefined,
    variant:
      isOfflineSimulated || connectivity.status === "offline"
        ? ("danger" as const)
        : connectivity.status === "degraded"
        ? ("warning" as const)
        : connectivity.status === "connected"
        ? ("action" as const)
        : ("neutral" as const),
  };

  // If unauthenticated or token expired, show Sovereign Login Portal
  if (!token || session.error?.type === "auth") {
    return (
      <ErrorBoundary fallbackTitle="Falha de Autenticação">
        <LoginPage
          onLoginSuccess={handleTokenChange}
          initialError={session.error?.type === "auth" ? session.error.detail : null}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div style={{ height: "100dvh", minHeight: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Dev Lab Toolbar — Floating pill in bottom left */}
        {isLab && (
          <DevLabToolbar
            token={token}
            onTokenChange={handleTokenChange}
            onSimulateOffline={handleSimulateOffline}
            onResetOffline={handleResetOffline}
            isOfflineSimulated={isOfflineSimulated}
            activeView={activeView}
            onToggleView={setActiveView}
            onRefresh={() => {
              session.refreshSession();
              connectivity.checkNow();
            }}
          />
        )}

        {/* Main Responsive Sovereign Shell */}
        <AppShell
          navItems={navItems}
          activeNavId={activeNavId}
          onNavSelect={handleNavigate}
          onSearchClick={() => setIsCommandPaletteOpen(true)}
          workspaces={session.workspaces}
          activeWorkspace={session.activeWorkspace}
          onWorkspaceSelect={(ws) => session.selectWorkspace(ws.id)}
          isLoadingWorkspaces={session.isLoadingMe}
          userEmail={session.user?.email || undefined}
          userRole={session.user?.activeRole || undefined}
          onLogout={() => {
            session.logout();
            handleTokenChange(null);
          }}
          systemStatus={systemStatus}
          noPadding={activeNavId === "cockpit"}
        >
          <ErrorBoundary fallbackTitle="Falha no Módulo Ativo">
            {isLab && activeView === "catalog" ? (
              <CatalogPage onClose={() => setActiveView("cockpit")} />
            ) : activeNavId === "contacts" ? (
              <ContactsPage session={session} />
            ) : activeNavId === "oportunidades" ? (
              <OpportunitiesPage session={session} />
            ) : activeNavId === "modelos" ? (
              <TemplatesPage session={session} />
            ) : activeNavId === "produtos" ? (
              <ProductsPage session={session} />
            ) : activeNavId === "conversoes" || activeNavId === "campaigns" ? (
              <CampaignsPage session={session} />
            ) : activeNavId === "settings" ? (
              <SettingsPage session={session} />
            ) : (
              <CockpitPage session={session} />
            )}
          </ErrorBoundary>
        </AppShell>

        {/* Global Command Palette (⌘K) Modal */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          items={commandItems}
          activeWorkspaceName={session.activeWorkspace?.name}
        />
      </div>
    </ErrorBoundary>
  );
};
