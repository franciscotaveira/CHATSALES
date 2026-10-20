import { type FC, useState, useEffect, useRef } from "react";
import { userFacingError } from "../../../utils/user-facing-error";
import { Button } from "@sos-sales/ui";

interface NotesProps {
  initialNotes?: string;
  onSaveNotes?: (notes: string) => Promise<void> | void;
  isSaving?: boolean;
}

export const Notes: FC<NotesProps> = ({
  initialNotes = "",
  onSaveNotes,
  isSaving = false,
}) => {
  const [notes, setNotes] = useState(initialNotes);
  const [baseNotes, setBaseNotes] = useState(initialNotes);
  const hasChanged = notes !== baseNotes;
  const hasRemoteChange = initialNotes !== baseNotes;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveLock = useRef(false);
  const acceptedSource = useRef(initialNotes);
  useEffect(() => {
    if (notes === baseNotes && initialNotes !== baseNotes && initialNotes !== acceptedSource.current && !saveLock.current) {
      acceptedSource.current = initialNotes;
      setNotes(initialNotes);
      setBaseNotes(initialNotes);
      setError(null);
    }
  }, [initialNotes, notes, baseNotes, saving]);

  const handleChange = (val: string) => {
    setError(null);
    setNotes(val);

  };

  const handleSave = async () => {
    if (!onSaveNotes || saveLock.current || saving || isSaving || hasRemoteChange || !hasChanged) return;
    saveLock.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSaveNotes(notes);
      acceptedSource.current = initialNotes;
      setBaseNotes(notes);
    } catch (err: unknown) {
      setError(userFacingError(err, "Não foi possível salvar a anotação. Tente novamente."));
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <textarea
        aria-label="Notas comerciais"
        maxLength={2000}
        disabled={!onSaveNotes || isSaving || saving}
        value={notes}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Adicione anotações sobre este lead ou negociação..."
        rows={3}
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: "var(--font-size-sm, 0.875rem)",
          lineHeight: "1.4",
          color: "var(--text-primary)",
          backgroundColor: "var(--bg-canvas)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md, 8px)",
          boxSizing: "border-box",
          resize: "vertical",
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      {hasRemoteChange && hasChanged && (
        <div role="status" style={{ fontSize: 13 }}>
          <p>A nota salva mudou enquanto você editava. Seu rascunho foi preservado. Compare antes de salvar.</p>
          <details><summary>Ver nota recebida</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{initialNotes || "Nota vazia"}</p></details>
          <Button size="xs" variant="secondary" onClick={() => { setNotes(initialNotes); setBaseNotes(initialNotes); setError(null); }}>Carregar nota recebida</Button>
          <Button size="xs" variant="secondary" onClick={() => { setBaseNotes(initialNotes); setError(null); }}>Manter meu rascunho para salvar</Button>
        </div>
      )}
      {error && <div role="alert" style={{ color: "var(--color-danger)", fontSize: 13 }}>{error}</div>}
      {hasChanged && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            size="xs"
            variant="secondary"
            onClick={handleSave}
            disabled={!onSaveNotes || isSaving || saving || hasRemoteChange}
          >
            {isSaving || saving ? "Salvando anotação..." : "Salvar Anotação"}
          </Button>
        </div>
      )}
    </div>
  );
};
