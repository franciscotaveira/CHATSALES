import type { ReactNode } from "react";

export type CommandCategory = "navigation" | "actions" | "workspaces" | "entities";

export interface CommandItem {
  id: string;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  icon?: ReactNode;
  badge?: string;
  shortcut?: string;
  keywords?: string[];
  onSelect: () => void;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: CommandItem[];
  placeholder?: string;
  activeWorkspaceName?: string;
  emptyMessage?: string;
}
