/**
 * SOS Sales V3 — Main Application Shell (MCT OS v2.0)
 * Integrates @sos-sales/ui primitives, useSession with session-generation guards,
 * verified Fastify connectivity polling, and dedicated navigation views.
 * Truth in Data: Zero fictitious fallbacks, laboratory controls quarantined to DEV.
 */

import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense, type FC } from "react";
import { AppShell, CommandPalette, EmptyState, LoadingState, Button, type CommandItem } from "@sos-sales/ui";
import {pushAppHistory,installAppHistory} from "./utils/app-history";
import {requestNavigation,collectNavigationReviews} from "./utils/request-navigation";
import {userFacingError} from "./utils/user-facing-error";
import {canAccessPage} from "./utils/navigation-access";
import {canUseCommand,canCreateCompany} from "./utils/command-access";
import { useSession } from "./hooks/useSession";
import { useConnectivity } from "./hooks/useConnectivity";
import { apiClient } from "./services/api-client";
import { DevLabToolbar } from "./components/DevLabToolbar";
const CockpitPage=lazy(()=>import("./pages/CockpitPage").then(module=>({default:module.CockpitPage})));
const ContactsPage=lazy(()=>import("./pages/ContactsPage").then(module=>({default:module.ContactsPage})));
const CampaignsPage=lazy(()=>import("./pages/CampaignsPage").then(module=>({default:module.CampaignsPage})));
const TemplatesPage=lazy(()=>import("./pages/TemplatesPage").then(module=>({default:module.TemplatesPage})));
const ProductsPage=lazy(()=>import("./pages/ProductsPage").then(module=>({default:module.ProductsPage})));
const SettingsPage=lazy(()=>import("./pages/SettingsPage").then(module=>({default:module.SettingsPage})));
const CatalogPage=lazy(()=>import("./pages/CatalogPage").then(module=>({default:module.CatalogPage})));
const OpportunitiesPage=lazy(()=>import("./pages/opportunities/OpportunitiesPage").then(module=>({default:module.OpportunitiesPage})));
const PublicLegalPage=lazy(()=>import("./pages/PublicLegalPage").then(module=>({default:module.PublicLegalPage})));
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CreateWorkspaceModal } from "./components/CreateWorkspaceModal";
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
const LoginPage=lazy(()=>import("./pages/LoginPage").then(module=>({default:module.LoginPage})));

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
  const [broadcastIntentScope,setBroadcastIntentScope]=useState<string|null>(null);
  const [productIntentScope,setProductIntentScope]=useState<string|null>(null);
  const [broadcastRequest,setBroadcastRequest]=useState(0);
  const [productRequest,setProductRequest]=useState(0);
  const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] = useState<boolean>(false);
  const [editorReset,setEditorReset]=useState(0);
  const creationTransition=useRef<symbol|null>(null);
  const creationActor=useRef<{token:string;userId:string}|null>(null);

  // Global ⌘K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if(e.isComposing||e.repeat||e.defaultPrevented)return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNavigate = useCallback((id: string, onEntered?:()=>void) => {
    const targetPath = id === "cockpit" ? "/" : `/${id}`;
    const navigate=()=>{
      const entered=()=>{setActiveNavId(id);setActiveView("cockpit");onEntered?.();};
      if(window.location.pathname!==targetPath)pushAppHistory(targetPath,window,entered);
      else entered();
    };
    if(window.location.pathname===targetPath&&!onEntered)navigate();else requestNavigation(navigate);
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
    return installAppHistory(handleLocationChange);
  }, [isLab]);

  // Real-time Fastify /ready health polling
  const connectivity = useConnectivity();

  // Tenant & Session Hook with atomic switching, session generation & AbortController
  const session = useSession(token);
  const companyCreationAllowed=!session.isLoadingMe&&!session.error&&canCreateCompany(session.workspaces||[],session.user?.activeRole);
  const commandRole=session.isLoadingMe||session.isLoadingWorkspace||session.error?undefined:session.activeWorkspace?.role;
  const commandScope=useRef("");
  commandScope.current=`${session.activeWorkspace?.id??""}:${commandRole??""}:${token??""}:${companyCreationAllowed}`;
  const previousCommandScope=useRef(commandScope.current),commandEpoch=useRef(0);
  if(previousCommandScope.current!==commandScope.current){previousCommandScope.current=commandScope.current;commandEpoch.current++;}
  const commandAuthority=useRef({role:commandRole,canCreate:companyCreationAllowed});
  commandAuthority.current={role:commandRole,canCreate:companyCreationAllowed};
  useEffect(()=>{setIsCommandPaletteOpen(false);setBroadcastRequest(0);setProductRequest(0);setBroadcastIntentScope(null);setProductIntentScope(null);},[session.activeWorkspace?.id,session.activeWorkspace?.role,token,companyCreationAllowed]);


  const handleTokenChange = useCallback((newToken: string | null) => {
    creationActor.current=null;creationTransition.current=null;setIsCreateWorkspaceOpen(false);
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

  const latestSession=useRef(session);latestSession.current=session;
  const workspaceSwitch=useRef<{id:string;key:symbol}|null>(null);
  const workspaceSwitchLive=useRef(true);
  const [workspaceSwitchError,setWorkspaceSwitchError]=useState<{scope:string;message:string}|null>(null);
  useEffect(()=>{workspaceSwitchLive.current=true;return()=>{workspaceSwitchLive.current=false;};},[]);
  useEffect(()=>{workspaceSwitch.current=null;setWorkspaceSwitchError(null);},[token]);
  const handleWorkspaceSelect=useCallback((id:string)=>{
    const current=latestSession.current;
    if(current.isLoadingMe||!current.workspaces?.some(workspace=>workspace.id===id)||workspaceSwitch.current?.id===id)return;
    if(current.activeWorkspace?.id===id&&!workspaceSwitch.current)return;
    const observedScope=commandScope.current,observedEpoch=commandEpoch.current;
    requestNavigation(()=>{
      const latest=latestSession.current;
      if(!workspaceSwitchLive.current||commandScope.current!==observedScope||commandEpoch.current!==observedEpoch||latest.isLoadingMe||!latest.workspaces?.some(workspace=>workspace.id===id)||workspaceSwitch.current?.id===id)return;
      creationActor.current=null;creationTransition.current=null;setIsCreateWorkspaceOpen(false);
      const request={id,key:Symbol()};workspaceSwitch.current=request;setWorkspaceSwitchError(null);
      const origin=latest.activeWorkspace?.id,sessionToken=latest.token;
      void (async()=>{
        try{await latest.selectWorkspace(id);}
        catch(error){const now=latestSession.current;if(workspaceSwitchLive.current&&workspaceSwitch.current===request&&now.token===sessionToken&&[origin,id].includes(now.activeWorkspace?.id))setWorkspaceSwitchError({scope:commandScope.current,message:userFacingError(error,"Não foi possível trocar de empresa. Confira a empresa selecionada antes de tentar novamente.")});}
        finally{if(workspaceSwitch.current===request)workspaceSwitch.current=null;}
      })();
    });
  },[]);

  const voluntaryLogout=useRef(false);
  useEffect(()=>{voluntaryLogout.current=false;},[token]);
  const handleRequestLogout=useCallback(()=>{
    if(voluntaryLogout.current)return;
    const observedScope=commandScope.current,observedEpoch=commandEpoch.current;
    requestNavigation(()=>{
      if(!workspaceSwitchLive.current||voluntaryLogout.current||commandScope.current!==observedScope||commandEpoch.current!==observedEpoch)return;
      voluntaryLogout.current=true;
      latestSession.current.logout();handleTokenChange(null);
    });
  },[handleTokenChange]);

  const closeCreation=()=>{creationActor.current=null;setIsCreateWorkspaceOpen(false);};
  useEffect(()=>{creationActor.current=null;setIsCreateWorkspaceOpen(false);},[token,session.user?.id,activeNavId]);
  useEffect(()=>{if(!creationTransition.current){creationActor.current=null;setIsCreateWorkspaceOpen(false);}},[session.activeWorkspace?.id]);
  useEffect(()=>{
    if(session.error?.type==="auth"||(!session.isLoadingMe&&!session.isLoadingWorkspace&&!session.error&&!canCreateCompany(session.workspaces||[],session.user?.activeRole))){creationActor.current=null;setIsCreateWorkspaceOpen(false);}
  },[session.isLoadingMe,session.isLoadingWorkspace,session.error,session.workspaces,session.user?.activeRole]);
  const handleRequestCreateWorkspace=useCallback(()=>{
    if(!commandAuthority.current.canCreate)return;
    const observedScope=commandScope.current,observedEpoch=commandEpoch.current,reviews=collectNavigationReviews();
    requestNavigation(()=>{
      const current=latestSession.current;
      if(!workspaceSwitchLive.current||commandScope.current!==observedScope||commandEpoch.current!==observedEpoch||!commandAuthority.current.canCreate||!current.token||!current.user?.id)return;
      creationActor.current={token:current.token,userId:current.user?.id};
      if(reviews.length)setEditorReset(value=>value+1);
      setIsCreateWorkspaceOpen(true);
    },reviews);
  },[]);
  const enterCreatedWorkspace=async(id:string)=>{
    const actor=creationActor.current;
    const valid=()=>workspaceSwitchLive.current&&creationActor.current===actor&&actor?.token===latestSession.current.token&&actor?.userId===latestSession.current.user?.id;
    if(!actor||!valid())throw new Error("Sua sessão mudou. Confira a empresa criada antes de entrar.");
    const request=Symbol();creationTransition.current=request;
    try{
      const current=await apiClient.getMe({token:actor.token});
      if(!valid())return;
      if(current.user.id!==actor.userId)throw new Error("Sua identidade não foi confirmada. Atualize a sessão antes de entrar na empresa criada.");
      if(!current.workspaces.some(workspace=>workspace.id===id))throw new Error("A empresa já foi criada, mas seu acesso a ela não foi confirmado. Confira os acessos ou entre com a conta do proprietário.");
      await latestSession.current.refreshSession();
      if(!valid())return;
      await latestSession.current.selectWorkspace(id,{throwOnError:true});
    }finally{if(creationTransition.current===request)creationTransition.current=null;}
  };

  const normalApiBase=useRef(apiClient.getBaseUrl());
  const handleSimulateOffline = useCallback(() => {
    normalApiBase.current=apiClient.getBaseUrl();
    apiClient.setBaseUrl("http://localhost:9999"); // Intentionally invalid port
    setIsOfflineSimulated(true);
    session.refreshWorkspace();
    connectivity.checkNow();
  }, [session, connectivity]);

  const handleResetOffline = useCallback(() => {
    apiClient.setBaseUrl(normalApiBase.current);
    setIsOfflineSimulated(false);
    session.refreshWorkspace();
    connectivity.checkNow();
  }, [session, connectivity]);

  const navItems = [
    {
      id: "cockpit",
      label: "Cockpit Geral",
      mobileLabel: "Chat",
      icon: <MessageSquare size={18} />,
    },
    {
      id: "contacts",
      label: "Contatos & Leads",
      mobileLabel: "Contatos",
      icon: <Users size={18} />,
    },
    {
      id: "oportunidades",
      label: "Oportunidades",
      mobileLabel: "Funil",
      icon: <TrendingUp size={18} />,
    },
    {
      id: "modelos",
      label: "Modelos WABA",
      mobileLabel: "Modelos",
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
        keywords: ["chat", "conversas", "inbox", "mensagens", "atendimento", "waha", "waba"],
        onSelect: () => handleNavigate("cockpit"),
      },
      {
        id: "nav-contacts",
        title: "Contatos & Leads",
        subtitle: "Cadastros de clientes e preferências de mensagens comerciais",
        category: "navigation",
        icon: <Users size={16} />,
        keywords: ["leads", "clientes", "telefones", "optout", "opt-out"],
        onSelect: () => handleNavigate("contacts"),
      },
      {
        id: "nav-oportunidades",
        title: "Pipeline de Oportunidades",
        subtitle: "Funil de vendas, estágios e negociações",
        category: "navigation",
        icon: <TrendingUp size={16} />,
        keywords: ["funil", "pipeline", "negocios", "vendas", "leads"],
        onSelect: () => handleNavigate("oportunidades"),
      },
      {
        id: "nav-modelos",
        title: "Modelos WABA",
        subtitle: "Rascunhos de mensagem e consulta de aprovação na Meta",
        category: "navigation",
        icon: <FileText size={16} />,
        keywords: ["templates", "meta", "whatsapp oficial", "hsm", "mensagens"],
        onSelect: () => handleNavigate("modelos"),
      },
      {
        id: "nav-produtos",
        title: "Catálogo de Produtos",
        subtitle: "Produtos e serviços para propostas e cobranças Pix",
        category: "navigation",
        icon: <Package size={16} />,
        keywords: ["precos", "ofertas", "servicos", "catalogo", "pix"],
        onSelect: () => handleNavigate("produtos"),
      },
      {
        id: "nav-conversoes",
        title: "Conversões",
        subtitle: "Eventos comerciais e seus resultados de envio",
        category: "navigation",
        icon: <Send size={16} />,
        keywords: ["conversoes", "eventos", "meta", "capi"],
        onSelect: () => handleNavigate("conversoes"),
      },
      {
        id: "nav-settings",
        title: "Configurações & Instâncias",
        subtitle: "Instâncias WhatsApp, membros da equipe e chaves de API",
        category: "navigation",
        icon: <Settings size={16} />,
        keywords: ["ajustes", "conexoes", "qrcode", "api", "tokens", "equipe"],
        onSelect: () => handleNavigate("settings"),
      },
    ];

    const actionCommands: CommandItem[] = [
      {
        id: "act-new-broadcast",
        title: "Nova Campanha de Transmissão",
        subtitle: "Preparar público e mensagem para revisão antes do envio",
        category: "actions",
        icon: <PlusCircle size={16} />,
        onSelect: () => handleNavigate("modelos",()=>{setBroadcastIntentScope(`${session.activeWorkspace?.id}:${token}:${session.activeWorkspace?.role}`);setBroadcastRequest(v=>v+1);}),
      },
      {
        id: "act-new-product",
        title: "Cadastrar Novo Produto",
        subtitle: "Cadastrar preço, descrição e disponibilidade do item",
        category: "actions",
        icon: <PlusCircle size={16} />,
        onSelect: () => handleNavigate("produtos",()=>{setProductIntentScope(`${session.activeWorkspace?.id}:${token}:${session.activeWorkspace?.role}`);setProductRequest(v=>v+1);}),
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
        id: "act-create-workspace",
        title: "Criar Nova Empresa / Negócio",
        subtitle: "Cadastrar uma empresa; convites e acessos são etapas separadas",
        category: "actions",
        icon: <Building2 size={16} />,
        onSelect: handleRequestCreateWorkspace,
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
        onSelect: handleRequestLogout,
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
        onSelect: () => handleWorkspaceSelect(ws.id),
      };
    });

    const observedScope=commandScope.current,observedEpoch=commandEpoch.current;
    return [...navCommands,...actionCommands,...workspaceCommands]
      .filter(item=>canUseCommand(item.id,commandRole,companyCreationAllowed))
      .map(item=>({...item,onSelect:()=>{
        if(commandScope.current!==observedScope||commandEpoch.current!==observedEpoch||!canUseCommand(item.id,commandAuthority.current.role,commandAuthority.current.canCreate))return;
        item.onSelect();
      }}));
  }, [session, connectivity, handleNavigate, handleTokenChange,handleWorkspaceSelect,handleRequestLogout,handleRequestCreateWorkspace,companyCreationAllowed,commandRole]);

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
      !isOfflineSimulated && connectivity.status === "connected" && connectivity.dbLatencyMs !== null && connectivity.dbLatencyMs !== undefined
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

  // Public Legal Routes (Always accessible without authentication for Meta App Review and compliance)
  const currentPath = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "";
  if (currentPath === "/privacidade" || currentPath === "/privacy") {
    return <ErrorBoundary><Suspense fallback={<LoadingState variant="spinner" text="Carregando página…"/>}><PublicLegalPage type="privacy" /></Suspense></ErrorBoundary>;
  }
  if (currentPath === "/termos" || currentPath === "/terms") {
    return <ErrorBoundary><Suspense fallback={<LoadingState variant="spinner" text="Carregando página…"/>}><PublicLegalPage type="terms" /></Suspense></ErrorBoundary>;
  }

  // If unauthenticated or token expired, show Sovereign Login Portal
  if (!token || session.error?.type === "auth") {
    return (
      <ErrorBoundary fallbackTitle="Falha de Autenticação">
        <Suspense fallback={<LoadingState variant="spinner" text="Carregando acesso…"/>}>
        <LoginPage
          onLoginSuccess={handleTokenChange}
          initialError={session.error?.type === "auth" ? session.error.detail : null}
        />
        </Suspense>
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
            onToggleView={(view)=>{if(view!==activeView)requestNavigation(()=>setActiveView(view));}}
            onRefresh={() => {
              session.refreshSession();
              connectivity.checkNow();
            }}
          />
        )}

        {/* Main Responsive Sovereign Shell */}
        <AppShell
          navItems={navItems.filter(item=>canAccessPage(commandRole,item.id))}
          activeNavId={activeNavId}
          onNavSelect={handleNavigate}
          onSearchClick={() => setIsCommandPaletteOpen(true)}
          workspaces={session.workspaces}
          activeWorkspace={session.activeWorkspace}
          onWorkspaceSelect={(ws) => handleWorkspaceSelect(ws.id)}
          isLoadingWorkspaces={session.isLoadingMe||session.isLoadingWorkspace}
          onCreateWorkspaceClick={companyCreationAllowed?handleRequestCreateWorkspace:undefined}
          userEmail={session.user?.email || undefined}
          userRole={commandRole}
          onLogout={handleRequestLogout}
          systemStatus={systemStatus}
          noPadding={activeNavId === "cockpit"}
        >
          {workspaceSwitchError?.scope===commandScope.current&&<p role="alert" style={{margin:12}}>{workspaceSwitchError.message}</p>}
          <ErrorBoundary key={`${activeNavId}:${session.activeWorkspace?.id}:${session.activeWorkspace?.role}:${token}:${editorReset}`} fallbackTitle="Falha no Módulo Ativo">
            <Suspense fallback={<LoadingState variant="spinner" text="Carregando página…"/>}>
            {isLab && activeView === "catalog" ? (
              <CatalogPage onClose={() => requestNavigation(()=>setActiveView("cockpit"))} />
            ) : activeNavId!=="settings"&&(session.isLoadingMe||session.isLoadingWorkspace) ? (
              <LoadingState variant="spinner" text="Conferindo seu acesso à empresa…"/>
            ) : activeNavId!=="settings"&&session.error ? (
              <EmptyState title="Não foi possível confirmar seu acesso" description="Tente atualizar a sessão. Seus dados salvos não foram apagados." action={<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Button onClick={()=>void session.refreshSession()}>Tentar novamente</Button><Button variant="secondary" onClick={()=>handleNavigate("settings")}>Abrir configurações</Button></div>}/>
            ) : activeNavId!=="settings"&&!session.activeWorkspace ? (
              <EmptyState title="Selecione uma empresa" description="Escolha uma empresa no seletor para abrir esta página." action={<Button onClick={()=>handleNavigate("settings")}>Abrir configurações</Button>}/>
            ) : !canAccessPage(session.activeWorkspace?.role,activeNavId) ? (
              <EmptyState title="Seu perfil não tem acesso a esta página" description="O acesso depende do seu perfil na empresa selecionada. Se precisar, fale com o responsável." action={<Button onClick={()=>handleNavigate("settings")}>Abrir configurações</Button>}/>
            ) : activeNavId === "contacts" ? (
              <ContactsPage session={session} />
            ) : activeNavId === "oportunidades" ? (
              <OpportunitiesPage session={session} />
            ) : activeNavId === "modelos" ? (
              <TemplatesPage session={session} broadcastRequest={broadcastRequest} broadcastRequestScope={broadcastIntentScope??undefined} />
            ) : activeNavId === "produtos" ? (
              <ProductsPage session={session} createRequest={productRequest} createRequestScope={productIntentScope??undefined} />
            ) : activeNavId === "conversoes" || activeNavId === "campaigns" ? (
              <CampaignsPage session={session} />
            ) : activeNavId === "settings" ? (
              <SettingsPage session={session.error||session.isLoadingMe||session.isLoadingWorkspace?{...session,activeWorkspace:null}:session} />
            ) : (
              <CockpitPage session={session} />
            )}
            </Suspense>
          </ErrorBoundary>
        </AppShell>

        {/* Global Command Palette (⌘K) Modal */}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          items={commandItems}
          activeWorkspaceName={session.activeWorkspace?.name}
        />

        {/* Create Workspace Modal */}
        <CreateWorkspaceModal
          isOpen={isCreateWorkspaceOpen}
          accessPending={session.isLoadingMe||session.isLoadingWorkspace||Boolean(session.error)}
          onClose={closeCreation}
          onCreated={enterCreatedWorkspace}
        />
      </div>
    </ErrorBoundary>
  );
};
