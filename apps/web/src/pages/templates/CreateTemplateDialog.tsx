import { useState, useEffect, useRef, type FC, type FormEvent } from "react";
import { Button, Input, Dialog, SegmentedControl, useBreakpoint } from "@sos-sales/ui";
import { apiClient, ApiError } from "../../services/api-client";
import { useDiscardChanges, UnsavedChangesNotice } from "../UnsavedChangesNotice";
import { renderWhatsappMarkdown } from "../cockpit/utils/whatsappMarkdown";
import {userFacingError} from "../../utils/user-facing-error";
import { Sparkles } from "lucide-react";

interface CreateTemplateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  token: string;
  onCreated: () => void|Promise<void>;
}
type Suggestion=Awaited<ReturnType<typeof apiClient.generateTemplate>>["generated"];
function readGeneratedSuggestion(response:unknown):Suggestion{
 const object=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
 const text=(value:unknown,max:number,min=0)=>typeof value==="string"&&value.length>=min&&value.length<=max;
 const value=object(response)?response.generated:null;
 if(!object(value)||!text(value.name,100,1)||!/^[a-z0-9_]+$/.test(value.name as string)||!["UTILITY","MARKETING"].includes(value.category as string)||!text(value.bodyText,1024,1)||!text(value.explanation,500,1)||!["headerText","footerText","buttonText"].every(key=>value[key]===null||text(value[key],key==="buttonText"?25:60))||!Array.isArray(value.variableLabels)||value.variableLabels.length>10||!value.variableLabels.every(label=>text(label,60)))throw new Error("A geração retornou uma sugestão incompleta ou incompatível. Seu formulário foi preservado; tente gerar novamente.");
 return value as unknown as Suggestion;
}

export const CreateTemplateDialog: FC<CreateTemplateDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onCreated,
}) => {
  const { isMobile } = useBreakpoint();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<"UTILITY" | "MARKETING">("MARKETING");
  const [formLanguage, setFormLanguage] = useState("pt_BR");
  const [formHeader, setFormHeader] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formFooter, setFormFooter] = useState("");
  const [formButton, setFormButton] = useState("");
  const [aiObjective, setAiObjective] = useState("");
  const [aiAudience, setAiAudience] = useState("Clientes e leads da empresa");
  const [aiTone, setAiTone] = useState<"PROFESSIONAL" | "FRIENDLY" | "DIRECT">("FRIENDLY");
  const [aiStrategy, setAiStrategy] = useState<"UTILITY_TROJAN" | "DIRECT_MARKETING">("DIRECT_MARKETING");
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [variableLabels, setVariableLabels] = useState<string[]>([]);

  const [suggestion,setSuggestion]=useState<Suggestion|null>(null);
  const [previous,setPrevious]=useState<Suggestion|null>(null);
  const [saved,setSaved]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const nameRef=useRef<HTMLInputElement>(null);
  const errorRef=useRef<HTMLDivElement>(null),formRef=useRef<HTMLFormElement>(null),suggestionRef=useRef<HTMLElement>(null),bodyRef=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{if(suggestion)suggestionRef.current?.focus();},[suggestion]);
  useEffect(()=>{if(serverError)errorRef.current?.focus();},[serverError]);
  useEffect(()=>{if(Object.keys(formErrors).length)formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();},[formErrors]);
  const generation=useRef(0),busy=useRef<"generate"|"save"|null>(null),scope=useRef("");
  const scopeKey=`${isOpen}:${workspaceId}:${token}`;scope.current=scopeKey;
  const dirty=isOpen&&!saved&&Boolean(formName||formHeader||formBody||formFooter||formButton||formCategory!=="MARKETING"||formLanguage!=="pt_BR"||aiObjective||aiAudience!=="Clientes e leads da empresa"||aiTone!=="FRIENDLY"||aiStrategy!=="DIRECT_MARKETING"||suggestion||previous||uncertain);
  const closeNow=()=>{generation.current++;busy.current=null;onClose();};
  const discard=useDiscardChanges(dirty,scopeKey,()=>nameRef.current,isOpen,{first:true,beforeProceed:closeNow});
  const locked=isSubmitting||isGenerating||saved||uncertain||discard.isPending;
  useEffect(()=>{generation.current++;busy.current=null;setIsSubmitting(false);setIsGenerating(false);setSaved(false);setUncertain(false);resetForm();setSuggestion(null);setPrevious(null);return()=>{generation.current++;};},[scopeKey]);
  const close=()=>{if(busy.current==="save")return;discard.requestExit(closeNow);};
  const applySuggestion=(next:Suggestion)=>{
    if(locked)return;
    setPrevious({name:formName,category:formCategory,headerText:formHeader,bodyText:formBody,footerText:formFooter,buttonText:formButton,variableLabels,explanation:aiExplanation||""});
    setFormName(next.name);setFormCategory(next.category);setFormHeader(next.headerText||"");setFormBody(next.bodyText);setFormFooter(next.footerText||"");setFormButton(next.buttonText||"");setVariableLabels(next.variableLabels);setAiExplanation(next.explanation);setSuggestion(null);setFormErrors({});setServerError(null);bodyRef.current?.focus();
  };
  const resetForm = () => {
    setFormName("");
    setFormCategory("MARKETING");
    setFormLanguage("pt_BR");
    setFormHeader("");
    setFormBody("");
    setFormFooter("");
    setFormButton("");
    setFormErrors({});
    setServerError(null);
    setAiObjective("");
    setAiAudience("Clientes e leads da empresa");
    setAiTone("FRIENDLY");
    setAiStrategy("DIRECT_MARKETING");
    setAiExplanation(null);
    setVariableLabels([]);
  };

  const handleGenerateWithAi = async () => {
    if(busy.current||saved||uncertain||discard.isPending||!isOpen)return;
    setServerError(null);
    if (aiObjective.trim().length < 10||aiObjective.trim().length>800) {
      setServerError("Explique em uma frase o que a mensagem precisa conseguir.");
      return;
    }
    if(aiAudience.trim().length<2||aiAudience.trim().length>200){setServerError("Informe o público em 2 a 200 caracteres.");return;}
    const request=generation.current,requestedScope=scope.current;const valid=()=>request===generation.current&&requestedScope===scope.current;
    busy.current="generate";setIsGenerating(true);
    try {
      const response = await apiClient.generateTemplate(
        workspaceId,
        {
          objective: aiObjective.trim(),
          audience: aiAudience.trim(),
          tone: aiTone,
          strategy: aiStrategy,
        },
        { token }
      );
      if(valid())setSuggestion(readGeneratedSuggestion(response));
    } catch (err: unknown) {
      if(valid())setServerError(userFacingError(err,"Não foi possível gerar o modelo. O texto do formulário foi preservado."));
    } finally {if(valid()){busy.current=null;setIsGenerating(false);}}
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if(busy.current||saved||uncertain||discard.isPending||suggestion||!isOpen)return;
    setFormErrors({});
    setServerError(null);

    const errors: Record<string, string> = {};
    const cleanName = formName.trim().toLowerCase();
    if (!cleanName) {
      errors.name = "Nome do modelo é obrigatório";
    } else if (!/^[a-z0-9_]+$/.test(cleanName)) {
      errors.name = "Nome deve conter apenas letras minúsculas, números e sublinhados (ex: oferta_v1)";
    } else if (cleanName.length > 100) {
      errors.name = "Nome deve ter no máximo 100 caracteres";
    }

    const cleanBody = formBody.trim();
    if (!cleanBody) {
      errors.bodyText = "Corpo do texto é obrigatório";
    } else if (cleanBody.length > 1024) {
      errors.bodyText = "Corpo do texto deve ter no máximo 1024 caracteres";
    }

    const cleanHeader = formHeader.trim();
    if (cleanHeader.length > 60) {
      errors.headerText = "Cabeçalho deve ter no máximo 60 caracteres";
    }

    const cleanFooter = formFooter.trim();
    if (cleanFooter.length > 60) {
      errors.footerText = "Rodapé deve ter no máximo 60 caracteres";
    }

    const cleanButton = formButton.trim();
    if (cleanButton.length > 25) {
      errors.buttonText = "Texto da resposta rápida deve ter no máximo 25 caracteres";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const request=generation.current,requestedScope=scope.current;const valid=()=>request===generation.current&&requestedScope===scope.current;
    busy.current="save";setIsSubmitting(true);let committed=false;
    try {
      await apiClient.createTemplate(
        workspaceId,
        {
          createOnly:true,
          name: cleanName,
          category: formCategory,
          language: formLanguage.trim() || "pt_BR",
          headerText: cleanHeader || null,
          bodyText: cleanBody,
          footerText: cleanFooter || null,
          buttons: cleanButton ? [{ type: "QUICK_REPLY", text: cleanButton }] : [],
          status: "PENDING",
        },
        { token }
      );

      committed=true;if(!valid())return;setSaved(true);await onCreated();if(valid())onClose();
    } catch (err: unknown) {
      if(valid()){
        if(!committed&&(!(err instanceof ApiError)||err.status>=500||err.status===408))setUncertain(true);
        setServerError(committed?"Rascunho salvo. A lista não foi atualizada; feche e atualize os modelos, sem repetir o cadastro.":userFacingError(err,"Não foi possível confirmar o cadastro. Confira os modelos existentes antes de repetir; seu texto foi preservado."));
      }
    } finally {
      if(valid()){busy.current=null;setIsSubmitting(false);}
    }
  };

  const WABA_PRESETS = [
    {
      id: "trojan-schedule",
      label: "Solicitação de horário (exemplo)",
      name: "solicitacao_horario_v1",
      category: "UTILITY" as const,
      header: "Solicitação de atendimento",
      body: "Olá {{1}}! Recebemos sua solicitação de atendimento para {{2}}. Qual horário você prefere? O agendamento depende de confirmação.",
      footer: "SOS Vendas • Confirmação",
      button: "Informar preferência",
    },
    {
      id: "trojan-loyalty",
      label: "Oferta para clientes (exemplo)",
      name: "oferta_clientes_v1",
      category: "MARKETING" as const,
      header: "Condições para clientes",
      body: "Olá {{1}}, gostaria de conhecer as condições disponíveis para {{2}}? Podemos apresentar os detalhes se houver interesse.",
      footer: "Atendimento ao Cliente",
      button: "Consultar condições",
    },
    {
      id: "trojan-proposal",
      label: "Atualização de proposta (exemplo)",
      name: "atualizacao_proposta_v1",
      category: "UTILITY" as const,
      header: "Atualização de Atendimento",
      body: "Olá {{1}}, há uma atualização sobre a proposta {{2}}. Podemos apresentar os detalhes?",
      footer: "Equipe de Atendimento",
      button: "Ver Proposta",
    },
    {
      id: "pix",
      label: "Cobrança Pix (exemplo)",
      name: "cobranca_pix_instantaneo_v1",
      category: "UTILITY" as const,
      header: "Pagamento do Pedido",
      body: "Olá {{1}}, segue o link/chave Pix no valor de {{2}} referente ao seu pedido {{3}}. A confirmação depende da verificação do recebimento.",
      footer: "SOS Vendas Oficial",
      button: "Consultar pagamento",
    },
    {
      id: "catalog",
      label: "Oferta de catálogo (exemplo)",
      name: "oferta_catalogo_produto_v1",
      category: "MARKETING" as const,
      header: "Conheça o produto",
      body: "Olá {{1}}, conheça o produto {{2}}, com preço informado de {{3}}. Gostaria de consultar condições e disponibilidade?",
      footer: "Consulte condições e disponibilidade",
      button: "Ver Detalhes",
    },
  ];

  const applyPreset = (preset: typeof WABA_PRESETS[0]) => {
    if(locked)return;setSuggestion({name:preset.name,category:preset.category,headerText:preset.header,bodyText:preset.body,footerText:preset.footer,buttonText:preset.button,variableLabels:[],explanation:"Exemplo inicial. Revise todos os fatos e as variáveis antes de usar."});
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={close}
      title="Criar rascunho de mensagem"
      maxWidth="880px"
      description="Escreva ou revise uma sugestão. Salvar cria um rascunho local; não envia à Meta nem aos clientes."
    >
      <form ref={formRef} onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {discard.isPending&&<UnsavedChangesNotice disabled={isSubmitting} onKeep={discard.keepEditing} onDiscard={discard.discard}/>}
        {uncertain&&<p role="alert">Resultado do cadastro incerto. Não repita nesta tentativa. Feche e confira os modelos cadastrados antes de iniciar outro cadastro.</p>}
        <fieldset disabled={locked} style={{border:0,padding:0,margin:0,minWidth:0,display:"flex",flexDirection:"column",gap:16}}>
        {saved&&<p role="status">Rascunho salvo.</p>}
        {suggestion&&<section ref={suggestionRef} tabIndex={-1} aria-label="Sugestão para revisão" style={{padding:16,border:"1px solid var(--border-default)",borderRadius:8,display:"grid",gap:10,overflowWrap:"anywhere"}}><h3>Sugestão para revisão</h3><p>Identificador: {suggestion.name} · Categoria: {suggestion.category}</p>{suggestion.headerText&&<strong>{suggestion.headerText}</strong>}<p style={{whiteSpace:"pre-wrap"}}>{suggestion.bodyText}</p>{suggestion.footerText&&<p>{suggestion.footerText}</p>}{suggestion.buttonText&&<p>Resposta rápida: {suggestion.buttonText}</p>}<p>{suggestion.explanation}</p><p>O formulário abaixo ainda está preservado. Aplicar substitui seus campos; você poderá restaurar a versão anterior.</p><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Button type="button" disabled={locked} onClick={()=>applySuggestion(suggestion)}>Aplicar sugestão ao formulário</Button><Button type="button" variant="secondary" disabled={locked} onClick={()=>setSuggestion(null)}>Descartar sugestão</Button></div></section>}
        {previous&&<div><Button type="button" disabled={locked} variant="secondary" onClick={()=>{const before=previous;applySuggestion(before);setPrevious(null);}}>Restaurar versão anterior</Button></div>}
        {serverError && (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {serverError}
          </div>
        )}

        <div style={{ padding: "14px", backgroundColor: "var(--color-operational-subtle)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-operational)", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, color: "var(--text-primary)" }}>
              <Sparkles size={18} /> Criar com Inteligência Artificial
            </div>
            <span style={{ fontSize: "11px", fontWeight: 600, color: aiStrategy === "UTILITY_TROJAN" ? "#10b981" : "var(--text-muted)" }}>
              {aiStrategy === "UTILITY_TROJAN" ? "Conteúdo transacional — exige contexto real" : "Conteúdo comercial"}
            </span>
          </div>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            Explique o objetivo da mensagem em linguagem simples. A IA prepara um rascunho para sua revisão. A categoria e a aprovação dependem da análise do provedor.
          </span>
          <textarea aria-label="Objetivo da mensagem" maxLength={800} disabled={locked} rows={2} value={aiObjective} onChange={(e) => setAiObjective(e.target.value)} placeholder="Ex.: Quero reativar clientes que pararam de responder sobre o orçamento de procedimentos estéticos." style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-default)", font: "inherit", resize: "vertical" }} />
          
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: "10px" }}>
            <Input disabled={locked} maxLength={200} label="Para quem?" value={aiAudience} onChange={(e) => setAiAudience(e.target.value)} placeholder="Ex.: clientes com orçamento parado" />
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>Tom da mensagem</label>
              {isMobile?<select aria-label="Tom da mensagem" disabled={locked} value={aiTone} onChange={e=>setAiTone(e.target.value as typeof aiTone)} style={{minHeight:40,width:"100%"}}><option value="FRIENDLY">Próximo</option><option value="PROFESSIONAL">Profissional</option><option value="DIRECT">Direto</option></select>:(
              <SegmentedControl aria-label="Tom da mensagem" value={aiTone} onChange={(value) => !locked&&!busy.current&&setAiTone(value as typeof aiTone)} options={[{ value: "FRIENDLY", label: "Próximo" }, { value: "PROFESSIONAL", label: "Profissional" }, { value: "DIRECT", label: "Direto" }]} />
              )}
            </div>
          </div>

          {/* Seletor Estratégico de Redução de Custo */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-primary)" }}>
              Finalidade da mensagem
            </label>
            {isMobile?<select aria-label="Finalidade da mensagem" disabled={locked} value={aiStrategy} onChange={e=>setAiStrategy(e.target.value as typeof aiStrategy)} style={{minHeight:40,width:"100%"}}><option value="UTILITY_TROJAN">Transacional — operação existente</option><option value="DIRECT_MARKETING">Marketing — oferta comercial</option></select>:(
            <SegmentedControl aria-label="Finalidade da mensagem"
              value={aiStrategy}
              onChange={(value) => !locked&&!busy.current&&setAiStrategy(value as typeof aiStrategy)}
              options={[
                { value: "UTILITY_TROJAN", label: "Mensagem transacional legítima" },
                { value: "DIRECT_MARKETING", label: "Marketing / oferta comercial" },
              ]}
            />
            )}
          </div>

          {aiStrategy === "UTILITY_TROJAN" && (
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: "var(--radius-md)",
                fontSize: "11px",
                color: "var(--text-secondary)",
                display: "flex",
                gap: "8px",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: "14px" }}>💡</span>
              <span>
                <strong>Conteúdo transacional:</strong> use somente quando houver uma operação real que justifique o aviso. Ofertas comerciais devem ser apresentadas como marketing. O rascunho exige revisão; aprovação e tarifas dependem do provedor.
              </span>
            </div>
          )}

          <div><Button type="button" size="sm" variant="primary" prefixIcon={<Sparkles size={14} />} loading={isGenerating} disabled={locked} onClick={handleGenerateWithAi}>Gerar sugestão</Button></div>
          {aiExplanation && (
            <div style={{ padding: "10px 12px", background: "var(--bg-surface)", borderRadius: "var(--radius-md)", fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Observações da sugestão aplicada:</strong> {aiExplanation}
              {variableLabels.length > 0 && <div style={{ marginTop: "6px" }}><strong>Variáveis sugeridas:</strong> {variableLabels.map((label, index) => `{{${index + 1}}} = ${label}`).join(" · ")}</div>}
            </div>
          )}
        </div>

        {/* Quick WABA Presets */}
        <div
          style={{
            padding: "10px 12px",
            backgroundColor: "var(--bg-canvas)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
          }}
        >
          <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Ou comece com um exemplo pronto:
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {WABA_PRESETS.map((preset) => (
              <Button
                disabled={locked}
                key={preset.id}
                size="xs"
                variant="secondary"
                type="button"
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) minmax(0, 300px)", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", minWidth: 0 }}>
            <Input disabled={locked}
              ref={nameRef}
              label="Identificador do modelo"
              placeholder="ex: confirmacao_proposta_v1"
              value={formName}
              onChange={(e) => setFormName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
              error={formErrors.name}
              helperText="Letras minúsculas, números e sublinhado (_)."
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
                Categoria Meta
              </label>
              {isMobile?<select aria-label="Categoria Meta" disabled={locked} value={formCategory} onChange={e=>setFormCategory(e.target.value as typeof formCategory)} style={{minHeight:40,width:"100%"}}><option value="UTILITY">Utilidade (transacional)</option><option value="MARKETING">Marketing (promocional)</option></select>:(
              <SegmentedControl aria-label="Categoria Meta"
                value={formCategory}
                onChange={(val) => !locked&&!busy.current&&setFormCategory(val as "UTILITY" | "MARKETING")}
                options={[
                  { value: "UTILITY", label: "Utilidade (Transacional)" },
                  { value: "MARKETING", label: "Marketing (Promocional)" },
                ]}
              />
              )}
            </div>

            <Input disabled={locked}
              label="Cabeçalho (Opcional)"
              placeholder="ex: Proposta Comercial Liberada"
              value={formHeader}
              onChange={(e) => setFormHeader(e.target.value)}
              error={formErrors.headerText}
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <label style={{ fontSize: "var(--font-size-xs)", fontWeight: 500, color: "var(--text-secondary)" }}>
                Corpo da Mensagem (com variáveis {"{{1}}"}, {"{{2}}"})
              </label>
              <textarea
                disabled={locked}
                ref={bodyRef}
                aria-invalid={Boolean(formErrors.bodyText)}
                aria-label="Corpo da mensagem"
                rows={4}
                placeholder="Olá {{1}}, sua proposta para {{2}} está pronta..."
                value={formBody}
                onChange={(e) => {setFormBody(e.target.value);setAiExplanation(null);setVariableLabels([]);}}
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  border: formErrors.bodyText ? "1px solid var(--color-danger)" : "1px solid var(--border-default)",
                  fontSize: "var(--font-size-sm)",
                  fontFamily: "inherit",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              {formErrors.bodyText && (
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger)" }}>
                  {formErrors.bodyText}
                </span>
              )}
            </div>

            <Input disabled={locked}
              label="Rodapé (Opcional)"
              placeholder="ex: Responda SAIR para cancelar"
              value={formFooter}
              onChange={(e) => setFormFooter(e.target.value)}
              error={formErrors.footerText}
            />

            <Input disabled={locked}
              label="Resposta rápida (opcional)"
              placeholder="ex: Quero detalhes"
              value={formButton}
              onChange={(e) => setFormButton(e.target.value)}
              error={formErrors.buttonText}
            />
          </div>

          {/* Live WhatsApp Bubble Preview */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
              Prévia do rascunho (não enviado)
            </span>
            <div
              style={{
                backgroundColor: "var(--bg-canvas)",
                padding: "16px",
                borderRadius: "var(--radius-lg)",
                border: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  backgroundColor: "var(--bg-surface)",
                  padding: "12px 14px",
                  borderRadius: "10px 0 10px 10px",
                  boxShadow: "var(--shadow-sm)",
                  width: "100%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  fontSize: "var(--font-size-sm)",
                  boxSizing: "border-box",
                }}
              >
                {formHeader && (
                  <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.85rem", overflowWrap: "anywhere" }}>
                    {formHeader}
                  </div>
                )}
                <div style={{ color: "var(--text-primary)", overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
                  {formBody ? renderWhatsappMarkdown(formBody) : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Corpo do modelo aparecerá aqui...</span>}
                </div>
                {formFooter && (
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-muted)", marginTop: "2px" }}>
                    {formFooter}
                  </div>
                )}
                {formButton && (
                  <div
                    style={{
                      marginTop: "8px",
                      paddingTop: "8px",
                      borderTop: "1px solid var(--border-subtle)",
                      textAlign: "center",
                      color: "var(--color-operational)",
                      fontWeight: 600,
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    {formButton}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        </fieldset>
        <div style={{ display: "flex",flexWrap:"wrap", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
          <Button size="sm" type="button" variant="secondary" onClick={close} disabled={isSubmitting||discard.isPending}>
            Cancelar
          </Button>
          <Button size="sm" variant="primary" type="submit" loading={isSubmitting} disabled={locked||!!suggestion}>
            Salvar rascunho local
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
