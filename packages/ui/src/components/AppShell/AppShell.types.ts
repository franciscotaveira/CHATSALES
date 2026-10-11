import type { ReactNode } from "react";

export interface NavItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

export interface WorkspaceItem {
  id: string;
  name: string;
  role?: string;
}

export interface AppShellProps {
  // Navigation
  navItems: NavItem[];
  activeNavId: string;
  onNavSelect: (id: string) => void;

  // Workspace
  workspaces?: WorkspaceItem[];
  activeWorkspace?: WorkspaceItem | null;
  onWorkspaceSelect?: (workspace: WorkspaceItem) => void;
  isLoadingWorkspaces?: boolean;

  // User & Status
  userEmail?: string;
  userRole?: string;
  onLogout?: () => void;
  systemStatus?: {
    label: string;
    shortLabel?: string;
    tooltip?: string;
    variant: "action" | "operational" | "warning" | "danger" | "neutral";
  };

  // Content
  children: ReactNode;
  headerActions?: ReactNode;
  noPadding?: boolean;
  hideMobileNav?: boolean;
  onSearchClick?: () => void;

  // Sidebar collapsible state
  sidebarCollapsed?: boolean;
  onSidebarCollapseToggle?: () => void;
}
