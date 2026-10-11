import { useState, useEffect, type FC } from "react";
import { Dialog, Button, Input } from "@sos-sales/ui";
import { STAGES, getCustomStages, saveCustomStages, type CustomStagesMap } from "./stages";
import { Sliders, RotateCcw, Check } from "lucide-react";

interface CustomizeStagesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  onSaved: () => void;
}

export const CustomizeStagesDialog: FC<CustomizeStagesDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  onSaved,
}) => {
  const [stageLabels, setStageLabels] = useState<CustomStagesMap>({});
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStageLabels(getCustomStages(workspaceId));
      setIsSavedNotice(false);
    }
  }, [isOpen, workspaceId]);

  const handleSave = () => {
    saveCustomStages(workspaceId, stageLabels);
    setIsSavedNotice(true);
    onSaved();
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const handleReset = () => {
    setStageLabels({});
    saveCustomStages(workspaceId, {});
    onSaved();
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Personalizar Nomes das Etapas do Funil"
      description="Adapte os nomes das colunas do Kanban ao vocabulário do seu negócio (ex: agendamento de serviços, vendas B2B ou procedimentos)."
      maxWidth="540px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "8px 0" }}>
        <div
          style={{
            padding: "10px 14px",
            backgroundColor: "var(--color-ai-subtle, #f0fdf4)",
            border: "1px solid var(--color-ai-border, #bbf7d0)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--font-size-xs)",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Sliders size={16} color="var(--color-action)" style={{ flexShrink: 0 }} />
          <span>
            Os rótulos alterados serão exibidos em todo o Kanban e no Cockpit de atendimento deste workspace.
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {STAGES.map((stage) => {
            const currentVal = stageLabels[stage.id] ?? "";
            return (
              <div
                key={stage.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "140px 1fr",
                  gap: "10px",
                  alignItems: "center",
                }}
              >
                <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>
                  Etapa Padrão: <em>{stage.label}</em>
                </div>
                <Input
                  placeholder={`Personalizar "${stage.label}"...`}
                  value={currentVal}
                  onChange={(e) =>
                    setStageLabels((prev) => ({
                      ...prev,
                      [stage.id]: e.target.value.trim() ? e.target.value : undefined,
                    }))
                  }
                />
              </div>
            );
          })}
        </div>

        {isSavedNotice && (
          <div
            style={{
              padding: "8px 12px",
              backgroundColor: "rgba(16, 185, 129, 0.12)",
              color: "#10b981",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <Check size={14} /> Etapas atualizadas com sucesso!
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
          <Button size="sm" variant="ghost" prefixIcon={<RotateCcw size={13} />} onClick={handleReset}>
            Restaurar Padrões
          </Button>

          <div style={{ display: "flex", gap: "8px" }}>
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" prefixIcon={<Check size={14} />} onClick={handleSave}>
              Salvar Alterações
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
