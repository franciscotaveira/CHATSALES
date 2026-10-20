import { Button } from "@sos-sales/ui";

export function ContactNoteConflict({ current, loading, disabled=false, onRefresh, onChoose }: {
  current: { value: unknown } | null;
  loading: boolean;
  disabled?: boolean;
  onRefresh: () => void;
  onChoose: (useReceived: boolean) => void;
}) {
  const readable = current && (current.value == null || typeof current.value === "string");
  return <section aria-label="Revisão de conflito da nota" style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8 }}>
    <p role="status">A nota mudou. Sua edição foi preservada. Consulte a nota atual e escolha como continuar antes de salvar.</p>
    <Button size="sm" variant="secondary" disabled={loading||disabled} onClick={onRefresh}>{loading ? "Consultando nota..." : "Consultar nota atual"}</Button>
    {current && <>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{readable ? String(current.value ?? "") || "Nota atual vazia" : "A nota atual tem formato incompatível. Seu conteúdo será preservado até uma substituição explícita."}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Button size="sm" variant="secondary" disabled={loading || disabled || !readable} onClick={() => onChoose(true)}>Usar nota atual</Button>
        <Button size="sm" variant="secondary" disabled={loading||disabled} onClick={() => onChoose(false)}>Manter minha edição da nota</Button>
      </div>
    </>}
    <p style={{ fontSize: 12 }}>Esta comparação trata somente da nota. As outras edições do formulário permanecem.</p>
  </section>;
}
