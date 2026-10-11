import type { JourneyStage } from "../../services/api-client";

export const STAGES: ReadonlyArray<{ id: JourneyStage; label: string }> = [
  { id: "lead", label: "Lead" },
  { id: "qualified", label: "Qualificado" },
  { id: "proposal", label: "Proposta" },
  { id: "scheduled", label: "Agendado" },
  { id: "won", label: "Ganho" },
  { id: "lost", label: "Perdido" },
];

export type CustomStagesMap = Partial<Record<JourneyStage, string>>;

export function getCustomStages(workspaceId?: string): CustomStagesMap {
  if (!workspaceId || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`sos_custom_stages_${workspaceId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCustomStages(workspaceId: string, map: CustomStagesMap): void {
  if (!workspaceId || typeof window === "undefined") return;
  try {
    localStorage.setItem(`sos_custom_stages_${workspaceId}`, JSON.stringify(map));
  } catch {
    // Non-fatal
  }
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatCents = (cents: number): string => brl.format(cents / 100);

export function getStageLabel(stageId: string, customMap?: CustomStagesMap): string {
  if (customMap && customMap[stageId as JourneyStage]) {
    return customMap[stageId as JourneyStage]!;
  }
  const defaultStage = STAGES.find((s) => s.id === stageId);
  return defaultStage ? defaultStage.label : stageId;
}

