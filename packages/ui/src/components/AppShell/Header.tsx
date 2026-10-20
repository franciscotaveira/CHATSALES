import { useState, useRef, useEffect, useId, type KeyboardEvent, type FC, type ReactNode } from "react";
import { Building2, ChevronDown, Check, Menu, Search, LogOut, Plus } from "lucide-react";
import type { WorkspaceItem } from "./AppShell.types";

interface HeaderProps {
  workspaces?: WorkspaceItem[];
  activeWorkspace?: WorkspaceItem | null;
  onWorkspaceSelect?: (workspace: WorkspaceItem) => void;
  isLoadingWorkspaces?: boolean;
  onCreateWorkspaceClick?: () => void;
  userEmail?: string;
  userRole?: string;
  onLogout?: () => void;
  systemStatus?: {
    label: string;
    shortLabel?: string;
    tooltip?: string;
    variant: "action" | "operational" | "warning" | "danger" | "neutral";
  };
  onOpenMobileMenu?: () => void;
  actions?: ReactNode;
  isMobile?: boolean;
  onSearchClick?: () => void;
}

export const Header: FC<HeaderProps> = ({
  workspaces = [],
  activeWorkspace,
  onWorkspaceSelect,
  isLoadingWorkspaces = false,
  onCreateWorkspaceClick,
  userEmail,
  userRole,
  onLogout,
  systemStatus,
  onOpenMobileMenu,
  actions,
  isMobile = false,
  onSearchClick,
}) => {
  const [isWorkspaceDropdownOpen, setIsWorkspaceDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const workspaceTrigger=useRef<HTMLButtonElement>(null),userTrigger=useRef<HTMLButtonElement>(null);
  const workspaceMenuId=useId(),userMenuId=useId();
  const openEdge=useRef<"first"|"last"|"selected">("selected");
  const menuKeys=(event:KeyboardEvent<HTMLDivElement>,kind:"workspace"|"user")=>{
    const opened=kind==="workspace"?isWorkspaceDropdownOpen:isUserMenuOpen;
    const root=kind==="workspace"?workspaceRef.current:userMenuRef.current;
    const trigger=kind==="workspace"?workspaceTrigger.current:userTrigger.current;
    if(event.key==="Escape"&&opened){event.preventDefault();event.stopPropagation();if(kind==="workspace")setIsWorkspaceDropdownOpen(false);else setIsUserMenuOpen(false);trigger?.focus();return;}
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key))return;
    if(!opened){if(event.key!=="ArrowDown"&&event.key!=="ArrowUp")return;event.preventDefault();openEdge.current=event.key==="ArrowUp"?"last":"first";if(kind==="workspace"){setIsUserMenuOpen(false);setIsWorkspaceDropdownOpen(true);}else{setIsWorkspaceDropdownOpen(false);setIsUserMenuOpen(true);}return;}
    const entries=Array.from(root?.querySelectorAll<HTMLButtonElement>(kind==="workspace"?'[role="option"], [data-workspace-create]':'[role="menuitem"]')||[]).filter(item=>!item.disabled);
    if(!entries.length)return;event.preventDefault();const current=entries.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==="Home"?0:event.key==="End"?entries.length-1:event.key==="ArrowDown"?(current+1)%entries.length:(current<=0?entries.length:current)-1;entries[next]?.focus();
  };
  useEffect(()=>{
    if(!isWorkspaceDropdownOpen)return;
    const items=Array.from(workspaceRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"], [data-workspace-create]')||[]).filter(item=>!item.disabled);
    const selected=items.find(item=>item.getAttribute("aria-selected")==="true");
    (openEdge.current==="last"?items.at(-1):openEdge.current==="selected"?selected||items[0]:items[0])?.focus();openEdge.current="selected";
  },[isWorkspaceDropdownOpen]);
  useEffect(()=>{if(isUserMenuOpen){const items=Array.from(userMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')||[]);(openEdge.current==="last"?items.at(-1):items[0])?.focus();openEdge.current="selected";}},[isUserMenuOpen]);


  const isMobileView = isMobile || Boolean(onOpenMobileMenu);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (workspaceRef.current && !workspaceRef.current.contains(e.target as Node)) {
        setIsWorkspaceDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Compute initials for Avatar
  const getInitials = () => {
    if (!userEmail) return "U";
    const namePart = userEmail.split("@")[0] || "U";
    const clean = namePart.replace(/[^a-zA-Z]/g, "").toUpperCase();
    return clean.slice(0, 2) || "U";
  };

  // Status dot color mapping
  const statusDotColor =
    systemStatus?.variant === "action"
      ? "var(--color-action, #008069)"
      : systemStatus?.variant === "danger"
      ? "var(--color-danger, #DC2626)"
      : systemStatus?.variant === "warning"
      ? "var(--color-warning, #D97706)"
      : "var(--color-operational, #2563EB)";

  const roleNames:Record<string,string>={owner:"Proprietário",admin:"Administrador",manager:"Gestor",operator:"Atendente",analyst:"Analista",integration_service:"Integração",support_auditor:"Auditoria"};
  const roleLabel=(role?:string)=>role&&Object.hasOwn(roleNames,role)?roleNames[role]:"Não confirmado";
  const formattedRole=isLoadingWorkspaces?"Em conferência":!activeWorkspace?"Sem empresa selecionada":roleLabel(userRole);
  useEffect(()=>{
    const focused=document.activeElement;
    if(isWorkspaceDropdownOpen&&focused&&workspaceRef.current?.contains(focused))workspaceTrigger.current?.focus();
    else if(isUserMenuOpen&&focused&&userMenuRef.current?.contains(focused))userTrigger.current?.focus();
    setIsWorkspaceDropdownOpen(false);setIsUserMenuOpen(false);
  },[activeWorkspace?.id,userRole,isLoadingWorkspaces,userEmail]);

  return (
    <header
      className="sos-app-header"
      style={{
        height: "var(--topbar-h, 56px)",
        backgroundColor: "rgba(255, 255, 255, 0.90)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--border-default, #CBD5E1)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: isMobileView ? "0 12px" : "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 15,
        fontFamily: "var(--font-sans, sans-serif)",
        width: "100%",
        boxSizing: "border-box",
        gap: "12px",
      }}
    >
      {/* 1. Left Region: Mobile Trigger + Workspace Selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          minWidth: 0,
          flexShrink: 1,
          flex: isMobileView ? 1 : undefined,
        }}
      >
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu de navegação"
            className="sos-mobile-menu-btn"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-primary, #0F172A)",
              padding: "4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-sm, 6px)",
              width: "var(--control-h-sm, 32px)",
              height: "var(--control-h-sm, 32px)",
              flexShrink: 0,
            }}
          >
            <Menu size={20} />
          </button>
        )}

        {/* Workspace Selector Dropdown (sm: 32px) */}
        <div ref={workspaceRef} onKeyDown={event=>menuKeys(event,"workspace")} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setIsWorkspaceDropdownOpen(false);}} style={{ position: "relative", minWidth: 0 }}>
          <button
            type="button"
            ref={workspaceTrigger}
            onClick={() => {setIsUserMenuOpen(false);setIsWorkspaceDropdownOpen(prev=>!prev);}}
            aria-expanded={isWorkspaceDropdownOpen}
            aria-haspopup="listbox"
            aria-controls={isWorkspaceDropdownOpen?workspaceMenuId:undefined}
            className="sos-workspace-trigger"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 10px",
              height: "var(--control-h-sm, 32px)",
              borderRadius: "var(--radius-md, 8px)",
              border: "1px solid var(--border-default, #E2E8F0)",
              backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
              color: "var(--text-primary, #0F172A)",
              fontSize: "var(--font-size-sm, 0.875rem)",
              fontWeight: 500,
              cursor: "pointer",
              transition: "border-color var(--transition-fast, 150ms ease)",
              maxWidth: isMobileView ? "160px" : "220px",
              width: isMobileView ? "100%" : undefined,
              boxSizing: "border-box",
            }}
          >
            <Building2 size={15} color="var(--color-action, #008069)" style={{ flexShrink: 0 }} />
            <span
              style={{
                maxWidth: isMobileView ? "90px" : "150px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "var(--font-size-sm, 0.875rem)",
              }}
            >
              {isLoadingWorkspaces
                ? "Conferindo empresa..."
                : activeWorkspace?.name || "Selecionar Negócio"}
            </span>
            <ChevronDown size={14} color="var(--text-muted, #64748B)" style={{ flexShrink: 0 }} />
          </button>

          {isWorkspaceDropdownOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                width: "min(260px, calc(100vw - 32px))",
                maxHeight:"min(70vh, 420px)",
                overflowY:"auto",
                backgroundColor: "var(--bg-surface, #FFFFFF)",
                border: "1px solid var(--border-default, #E2E8F0)",
                borderRadius: "var(--radius-md, 8px)",
                boxShadow: "var(--shadow-md)",
                padding: "4px",
                zIndex: 50,
              }}
            >
              <div role="listbox" id={workspaceMenuId} aria-label="Empresas disponíveis">
              <div
                style={{
                  padding: "6px 8px",
                  fontSize: "var(--font-size-xs, 0.75rem)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  color: "var(--text-muted, #64748B)",
                  letterSpacing: "0.04em",
                }}
              >
                Negócios Ativos
              </div>

              {workspaces.length === 0 ? (
                <div
                  style={{
                    padding: "8px",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    color: "var(--text-muted, #64748B)",
                  }}
                >
                  Nenhuma empresa vinculada.
                </div>
              ) : (
                workspaces.map((ws) => {
                  const isSelected = activeWorkspace?.id === ws.id;

                  return (
                    <button
                      key={ws.id}
                      role="option"
                      tabIndex={isSelected?0:-1}
                      aria-selected={isSelected}
                      aria-label={`${ws.name} — ${roleLabel(ws.role)}`}
                      onClick={() => {
                        setIsWorkspaceDropdownOpen(false);
                        workspaceTrigger.current?.focus();
                        if (!isSelected && onWorkspaceSelect) onWorkspaceSelect(ws);
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 10px",
                        minHeight: 48,
                        borderRadius: "var(--radius-sm, 6px)",
                        border: "none",
                        backgroundColor: isSelected
                          ? "var(--color-action-subtle, #E6F4F1)"
                          : "transparent",
                        color: isSelected
                          ? "var(--color-action, #008069)"
                          : "var(--text-primary, #0F172A)",
                        fontSize: "var(--font-size-sm, 0.875rem)",
                        fontWeight: isSelected ? 600 : 400,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{minWidth:0,display:"grid",gap:2}}>
                        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ws.name}</span>
                        <span style={{fontSize:"var(--font-size-xs,0.75rem)",color:"var(--text-muted, #64748B)"}}>{roleLabel(ws.role)}</span>
                      </span>
                      {isSelected && (
                        <Check size={14} color="var(--color-action, #008069)" />
                      )}
                    </button>
                  );
                })
              )}

              </div>
              {onCreateWorkspaceClick && (
                <div style={{ borderTop: "1px solid var(--border-default, #E2E8F0)", marginTop: "4px", paddingTop: "4px" }}>
                  <button
                    type="button"
                    data-workspace-create
                    onClick={() => {
                      setIsWorkspaceDropdownOpen(false);
                      workspaceTrigger.current?.focus();
                      onCreateWorkspaceClick();
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 10px",
                      borderRadius: "var(--radius-sm, 6px)",
                      border: "none",
                      backgroundColor: "transparent",
                      color: "var(--color-action, #008069)",
                      fontSize: "var(--font-size-sm, 0.875rem)",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background-color 150ms ease",
                      boxSizing: "border-box",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--color-action-subtle, #E6F4F1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                  >
                    <Plus size={15} style={{ flexShrink: 0 }} />
                    <span>Criar Nova Empresa</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Center Region: Global Search (Desktop/Tablet) */}
      {!isMobileView && (
        <div
          role="button"
          tabIndex={0}
          className="sos-search-trigger"
          onClick={onSearchClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSearchClick?.();
            }
          }}
          style={{
            flex: 1,
            maxWidth: "380px",
            display: "flex",
            alignItems: "center",
            padding: "0 10px",
            height: "var(--control-h-sm, 32px)",
            borderRadius: "var(--radius-md, 8px)",
            backgroundColor: "var(--bg-canvas, #F8FAFC)",
            border: "1px solid var(--border-default, #E2E8F0)",
            color: "var(--text-muted, #64748B)",
            fontSize: "var(--font-size-sm, 0.875rem)",
            gap: "8px",
            cursor: "pointer",
          }}
          title="Buscar ações, páginas e empresas (⌘K)"
        >
          <Search size={14} />
          <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            Buscar ações e páginas...
          </span>
          <kbd
            style={{
              fontSize: "0.6875rem",
              padding: "1px 5px",
              borderRadius: "var(--radius-sm, 4px)",
              backgroundColor: "var(--bg-surface, #FFFFFF)",
              border: "1px solid var(--border-default, #E2E8F0)",
              color: "var(--text-muted, #64748B)",
              fontWeight: 600,
            }}
          >
            ⌘K
          </kbd>
        </div>
      )}

      {/* 3. Right Region: Status Indicator + Actions + User Avatar Menu */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: isMobileView ? "8px" : "12px",
          flexShrink: 0,
        }}
      >
        {isMobileView && onSearchClick && (
          <button
            type="button"
            onClick={onSearchClick}
            aria-label="Buscar ações e páginas"
            style={{
              border: "none",
              background: "none",
              padding: "6px",
              cursor: "pointer",
              color: "var(--text-secondary, #475569)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--radius-md, 8px)",
            }}
            title="Busca global (⌘K)"
          >
            <Search size={18} />
          </button>
        )}

        {actions}

        {/* System Connection Dot with xs text */}
        {systemStatus && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 8px",
              borderRadius: "var(--radius-full, 9999px)",
              backgroundColor: "var(--bg-surface-elevated, #F1F5F9)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              color: "var(--text-secondary, #475569)",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
            title={systemStatus.tooltip || systemStatus.label}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: statusDotColor,
                display: "inline-block",
              }}
              aria-hidden="true"
            />
            <span>{isMobileView && systemStatus.shortLabel ? systemStatus.shortLabel : systemStatus.label}</span>
          </div>
        )}

        {/* User Profile Avatar with dropdown menu */}
        <div ref={userMenuRef} onKeyDown={event=>menuKeys(event,"user")} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setIsUserMenuOpen(false);}} style={{ position: "relative" }}>
          <button
            type="button"
            ref={userTrigger}
            onClick={() => {setIsWorkspaceDropdownOpen(false);setIsUserMenuOpen(prev=>!prev);}}
            aria-expanded={isUserMenuOpen}
            aria-label="Menu do Usuário"
            aria-haspopup="menu"
            aria-controls={isUserMenuOpen?userMenuId:undefined}
            className="sos-user-avatar-btn"
            style={{
              width: "var(--control-h-sm, 32px)",
              height: "var(--control-h-sm, 32px)",
              borderRadius: "50%",
              backgroundColor: "var(--color-action-subtle, #E6F4F1)",
              border: "1px solid var(--color-action-border, #80C0B4)",
              color: "var(--color-action, #008069)",
              fontSize: "var(--font-size-xs, 0.75rem)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {getInitials()}
          </button>

          {isUserMenuOpen && (
            <div
              role="menu"
              id={userMenuId}
              aria-label="Opções do Usuário"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                width: "220px",
                backgroundColor: "var(--bg-surface, #FFFFFF)",
                border: "1px solid var(--border-default, #E2E8F0)",
                borderRadius: "var(--radius-md, 8px)",
                boxShadow: "var(--shadow-md)",
                padding: "6px",
                zIndex: 50,
              }}
            >
              {/* User Profile Info */}
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-default, #E2E8F0)" }}>
                <div
                  style={{
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    fontWeight: 500,
                    color: "var(--text-primary, #0F172A)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {userEmail || "Operador"}
                </div>
                <div
                  style={{
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    color: "var(--text-muted, #64748B)",
                    marginTop: "2px",
                  }}
                >
                  Papel nesta empresa: <strong style={{ color: "var(--text-primary, #0F172A)" }}>{formattedRole}</strong>
                </div>
              </div>

              {/* Sair action */}
              {onLogout && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onLogout();
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 10px",
                    marginTop: "4px",
                    borderRadius: "var(--radius-sm, 6px)",
                    border: "none",
                    background: "none",
                    color: "var(--color-danger, #DC2626)",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <LogOut size={14} />
                  <span>Sair da Conta</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
