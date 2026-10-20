import type { FC } from "react";
import { Dialog, Badge, Button } from "@sos-sales/ui";
import {inspectTemplateLayout,isRecipientNameVariable} from "@sos-sales/contracts";
import type { MessageTemplateSummary } from "../../services/api-client";
import {templateStatus,templateCategory} from "./template-presentation";
import { renderWhatsappMarkdown } from "../cockpit/utils/whatsappMarkdown";

interface TemplateDetailDialogProps {
  template: MessageTemplateSummary | null;
  onClose: () => void;
}

export const TemplateDetailDialog: FC<TemplateDetailDialogProps> = ({ template, onClose }) => {
  if (!template) return null;
  const state=templateStatus(template);
  const layout=inspectTemplateLayout(template);

  return (
    <Dialog
      isOpen={Boolean(template)}
      onClose={onClose}
      title={`Modelo: ${template.name}`}
      description={`Categoria: ${templateCategory(template.category)} • Idioma: ${template.language}`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", gap: "8px",flexWrap:"wrap", alignItems: "center",overflowWrap:"anywhere" }}>
          <Badge variant={state.variant}>{state.label}</Badge>
          {template.metaTemplateId && (
            <span style={{ fontSize: "var(--font-size-xs)", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              ID: {template.metaTemplateId}
            </span>
          )}
        </div>

        {template.metaVerifiedAt&&Number.isFinite(Date.parse(template.metaVerifiedAt))&&<p style={{fontSize:12}}>Última verificação: {new Date(template.metaVerifiedAt).toLocaleString("pt-BR")}. A disponibilidade para envio também depende do canal escolhido.</p>}
        <div
          style={{
            overflowWrap:"anywhere",
            backgroundColor: "var(--bg-canvas)",
            padding: "16px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              padding: "14px 16px",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-sm)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            {["IMAGE","VIDEO","DOCUMENT"].includes(layout.headerFormat)&&<p>Cabeçalho de {layout.headerFormat==="IMAGE"?"imagem":layout.headerFormat==="VIDEO"?"vídeo":"documento"}: a mídia será informada na preparação.</p>}
            {layout.headerText && (
              <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                {layout.headerText}
              </div>
            )}
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
              {renderWhatsappMarkdown(template.bodyText)}
            </div>
            {template.footerText && (
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)" }}>
                {template.footerText}
              </div>
            )}
            {layout.buttons.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px", borderTop: "1px solid var(--border-subtle)", paddingTop: "8px" }}>
                {layout.buttons.map((btn, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      textAlign: "center",
                      color: "var(--color-operational)",
                      fontWeight: 600,
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    {btn.type==="URL"?"Link":btn.type==="PHONE_NUMBER"?"Telefone":btn.type==="QUICK_REPLY"?"Resposta rápida":`Botão ${btn.type}`}: {btn.text}
                    {btn.url&&<div style={{fontWeight:400,overflowWrap:"anywhere"}}>{btn.url}</div>}
                    {btn.phone_number&&<div style={{fontWeight:400}}>{btn.phone_number}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {layout.fields.length>0&&<section aria-label="Preenchimento do modelo" style={{fontSize:12}}>
          <h3>Como os campos serão preenchidos</h3>
          <ul>{layout.fields.map(field=><li key={field.key}>{field.label}: {isRecipientNameVariable(field.key)?"primeiro nome do contato, automático; sem nome cadastrado, usa cliente":field.required?"preenchimento obrigatório na preparação":"preenchimento opcional na preparação"}.</li>)}</ul>
          <p>Confira todos os valores na prévia e no teste antes de liberar a campanha.</p>
        </section>}
        {layout.unsupported.map(reason=><p role="alert" key={reason}>{reason} A preparação deste formato ainda não está disponível.</p>)}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
