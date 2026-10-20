import { useEffect, useState, useRef, type FC, type CSSProperties } from "react";
import { Button, Dialog, Input, Badge, useBreakpoint } from "@sos-sales/ui";
import { apiClient, type ContactSummary, type JourneyStage, type JourneySummary } from "../../services/api-client";
import {userFacingError} from "../../utils/user-facing-error";
import { UnsavedChangesNotice,useDiscardChanges } from "../UnsavedChangesNotice";
import { STAGES, formatCents, getStageLabel, type CustomStagesMap } from "./stages";
import {confirmedStage,confirmedOutcome} from './journey-confirmation';

interface Props {
  journey: JourneySummary | null;
  contact?: ContactSummary;
  workspaceId: string;
  token: string;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
  customStages?: CustomStagesMap;
  readOnly?:boolean;
  requestedStage?:JourneyStage;
}

const selectStyle: CSSProperties = { width: "100%", height: "38px", padding: "0 10px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)", color: "var(--text-primary)" };

export const centsFromOutcomeInput = (value: string):number|null => {
  const raw=value.trim();
  if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw))return null;
  const [units,fraction=""]=raw.replace(/\./g,"").split(",");
  const cents=Number(units)*100+Number(fraction.padEnd(2,"0"));
  return Number.isSafeInteger(cents)&&cents<=2147483647?cents:null;
};

export const OpportunityDetailDialog: FC<Props> = ({ journey, contact, workspaceId, token, onClose, onChanged, customStages, readOnly=false,requestedStage }) => {
  const {isMobile}=useBreakpoint();
  const actionStyle:CSSProperties|undefined=isMobile?{width:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.35}:undefined;
  const [needsReview,setNeedsReview]=useState(false);
  const [stage, setStage] = useState<JourneyStage>("lead");
  const [value, setValue] = useState("0,00");
  const [lossReason, setLossReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError,setFieldError]=useState<{field:"value"|"reason";message:string}|null>(null);
  const valueRef=useRef<HTMLInputElement>(null),reasonRef=useRef<HTMLInputElement>(null),errorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(fieldError)(fieldError.field==="value"?valueRef.current:reasonRef.current)?.focus();},[fieldError]);
  useEffect(()=>{if(error)errorRef.current?.focus();},[error]);

  const [confirmOutcome,setConfirmOutcome]=useState<"won"|"lost"|null>(null);
  const [saved,setSaved]=useState(false);
  const [confirmStageOnly,setConfirmStageOnly]=useState(false);
  const resumeStageRef=useRef<HTMLSelectElement>(null);
  const busy=useRef(false),generation=useRef(0),scope=useRef("");
  const scopeKey=`${workspaceId}:${token}:${journey?.id}:${journey?.updatedAt}:${readOnly}:${requestedStage}`;
  scope.current=scopeKey;
  useEffect(() => {
    generation.current++;busy.current=false;setIsSaving(false);setSaved(false);setNeedsReview(false);setConfirmOutcome(null);setConfirmStageOnly(false);
    setStage(requestedStage&&requestedStage!=="won"&&requestedStage!=="lost"?requestedStage:journey?.stage??"lead");
    setValue(journey?.estimatedValueCents==null?"":((journey.estimatedValueCents) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setLossReason("");setError(null);setFieldError(null);
    return()=>{generation.current++;};
  }, [scopeKey]);

  const initialValue=journey?.estimatedValueCents==null?"":(journey.estimatedValueCents/100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const normalizedValue=(raw:string)=>centsFromOutcomeInput(raw)??raw.trim();
  const outcomeDirty=normalizedValue(value)!==normalizedValue(initialValue)||Boolean(lossReason.trim());
  const knownStage=STAGES.some(item=>item.id===journey?.stage);
  const terminal=journey?.stage==="won"||journey?.stage==="lost";
  const dirty=Boolean(journey)&&knownStage&&!readOnly&&!saved&&!needsReview&&!terminal&&(stage!==journey?.stage||outcomeDirty);
  const discardGuard=useDiscardChanges(dirty,scopeKey,()=>resumeStageRef.current,Boolean(journey));
  if (!journey) return null;
  const locked=!knownStage||readOnly||isSaving||saved||terminal||needsReview||discardGuard.isPending;
  const close=()=>{if(!busy.current)discardGuard.requestExit(onClose);};
  const run = async (action: () => Promise<unknown>,confirms:(response:unknown)=>boolean) => {
    if(!knownStage||readOnly||busy.current||saved||terminal||needsReview||discardGuard.isPending)return;
    const request=generation.current,requestedScope=scope.current;
    const valid=()=>request===generation.current&&requestedScope===scope.current;
    busy.current=true;setIsSaving(true);setError(null);setFieldError(null);
    let committed=false;
    try {
      const response=await action();
      if(!valid())return;
      if(!confirms(response))throw new Error("O retorno não confirmou a alteração desta oportunidade. Feche e atualize a lista para conferir o resultado antes de repetir.");
      committed=true;
      setSaved(true);setConfirmOutcome(null);setConfirmStageOnly(false);
      await onChanged();
      if(valid())onClose();
    } catch (err: unknown) {
      if(valid()){setNeedsReview(!committed);setConfirmOutcome(null);setConfirmStageOnly(false);setError(committed?"A alteração foi salva, mas a lista não pôde ser atualizada. Feche e atualize as oportunidades; não repita o registro.":userFacingError(err,"Não foi possível confirmar a alteração. Atualize as oportunidades antes de repetir."));}
    } finally {if(valid()){busy.current=false;setIsSaving(false);}}
  };
  const saveStage = () => {
    if(locked||busy.current||stage===journey.stage||stage === "won" || stage === "lost") return;
    if(outcomeDirty){setConfirmStageOnly(true);return;}
    return run(() => apiClient.updateJourneyStage(workspaceId, journey.id, stage, { token },journey.updatedAt),response=>confirmedStage(response,journey.id,journey.contactId,stage));
  };
  const confirmSaveStageOnly=()=>{
    if(!confirmStageOnly||locked||busy.current||stage===journey.stage||stage==="won"||stage==="lost")return;
    return run(()=>apiClient.updateJourneyStage(workspaceId,journey.id,stage,{token},journey.updatedAt),response=>confirmedStage(response,journey.id,journey.contactId,stage));
  };
  const prepareOutcome=(status:"won"|"lost")=>{
    if(locked||busy.current)return;
    if(centsFromOutcomeInput(value)===null){setError(null);setFieldError({field:"value",message:"Informe um valor válido em reais, como 1.500,00. Use 0,00 apenas quando não houver valor."});return;}
    if(status==="lost"&&(!lossReason.trim()||lossReason.trim().length>500)){setError(null);setFieldError({field:"reason",message:"Informe o motivo da perda com até 500 caracteres."});return;}
    setError(null);setFieldError(null);setConfirmOutcome(status);
  };
  const recordOutcome = () => {
    const valueCents=centsFromOutcomeInput(value);
    if(!confirmOutcome||valueCents===null)return;
    return run(() => apiClient.recordJourneyOutcome(workspaceId, journey.id, {
      status:confirmOutcome,valueCents,expectedUpdatedAt:journey.updatedAt,currency:"BRL",reason:confirmOutcome==="lost"?lossReason.trim():undefined,
    }, { token }),response=>confirmedOutcome(response,journey.id,confirmOutcome,valueCents));
  };

  return (
    <>
    <Dialog isOpen={Boolean(journey)} onClose={close} title={contact?.name || contact?.phoneE164 || "Oportunidade"} description={journey.title || "Oportunidade comercial"}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px",overflowWrap:"anywhere" }}>
        {discardGuard.isPending&&<UnsavedChangesNotice onKeep={discardGuard.keepEditing} onDiscard={discardGuard.discard} disabled={isSaving}/>}
        {requestedStage&&<p role="status">Você solicitou {getStageLabel(requestedStage,customStages??{})}. Confira esta negociação e confirme a alteração abaixo.</p>}
        {!knownStage&&<p role="alert">A etapa desta oportunidade não foi reconhecida. Feche o detalhe, atualize a lista e confira o registro antes de alterar a negociação.</p>}
        {readOnly&&<p role="status">Somente consulta. Seu perfil não permite alterar esta oportunidade.</p>}
        {saved&&<p role="status">Alteração salva.</p>}
        {needsReview&&<p role="status">Feche este detalhe, atualize a lista e confira o resultado antes de registrar outra alteração.</p>}
        {terminal&&<p>Esta oportunidade está encerrada. O registro comercial não substitui uma confirmação de recebimento no caixa.</p>}
        {error && <div ref={errorRef} tabIndex={-1} role="alert" style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--color-danger-subtle)", color: "var(--color-danger)", fontSize: "var(--font-size-sm)" }}>{error}</div>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,160px),1fr))", gap: "12px" }}>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Contato</div><strong>{contact?.phoneE164 || "Não informado"}</strong></div>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Valor estimado</div><strong>{journey.estimatedValueCents==null?"Não informado":formatCents(journey.estimatedValueCents)}</strong></div>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Criada em</div><span>{new Date(journey.createdAt).toLocaleString("pt-BR")}</span></div>
          <div><div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>Situação</div><Badge variant="neutral">{getStageLabel(journey.stage,customStages)}</Badge></div>
        </div>

        {journey.stage !== "won" && journey.stage !== "lost" && (
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--text-secondary)" }}>
            Mover para outra etapa
            <select ref={resumeStageRef} disabled={locked} value={stage} onChange={(event) => setStage(event.target.value as JourneyStage)} style={{...selectStyle,height:isMobile?44:38}}>
              {STAGES.filter((item) => item.id !== "won" && item.id !== "lost").map((item) => <option key={item.id} value={item.id}>{getStageLabel(item.id,customStages)}</option>)}
            </select>
          </label>
        )}

        <Input ref={valueRef} error={fieldError?.field==="value"?fieldError.message:undefined} disabled={locked} label="Valor final em R$" inputMode="decimal" placeholder="Ex.: 1.500,00" value={value} onChange={(event) => {setValue(event.target.value);if(fieldError?.field==="value")setFieldError(null);}} helperText="Usado somente ao registrar ganho ou perda." />
        <Input ref={reasonRef} error={fieldError?.field==="reason"?fieldError.message:undefined} disabled={locked} maxLength={500} label="Motivo da perda" value={lossReason} onChange={(event) => {setLossReason(event.target.value);if(fieldError?.field==="reason")setFieldError(null);}} placeholder="Ex.: cliente desistiu ou escolheu concorrente" />

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: "8px",flexDirection:isMobile?"column":undefined }}>
          <div style={{ display: "flex", gap: "8px",flexWrap:"wrap",flexDirection:isMobile?"column":undefined }}>
            <Button style={actionStyle} size="sm" variant="secondary" type="button" disabled={locked} onClick={() => prepareOutcome("lost")}>Marcar perdido</Button>
            <Button style={actionStyle} size="sm" variant="primary" type="button" disabled={locked} onClick={() => prepareOutcome("won")}>Marcar ganho</Button>
          </div>
          <div style={{ display: "flex", gap: "8px",flexWrap:"wrap",flexDirection:isMobile?"column":undefined }}>
            <Button style={actionStyle} size="sm" variant="secondary" type="button" disabled={isSaving||discardGuard.isPending} onClick={close}>Fechar</Button>
            <Button style={actionStyle} size="sm" variant="primary" type="button" disabled={locked || stage === journey.stage || stage === "won" || stage === "lost"} onClick={saveStage}>{isSaving ? "Salvando..." : "Salvar etapa"}</Button>
          </div>
        </div>
      </div>
    </Dialog>
    <Dialog isOpen={confirmStageOnly} onClose={()=>{if(!busy.current)setConfirmStageOnly(false);}} title="Salvar somente a etapa?" description="O valor final e o motivo preenchidos ainda não foram registrados."
      footer={<div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end",flexDirection:isMobile?"column":undefined}}><Button style={actionStyle} disabled={isSaving} variant="secondary" onClick={()=>setConfirmStageOnly(false)}>Continuar editando</Button><Button style={actionStyle} disabled={isSaving} onClick={()=>void confirmSaveStageOnly()}>Salvar etapa e descartar desfecho</Button></div>}>
      <p>A etapa será alterada para <strong>{getStageLabel(stage,customStages)}</strong>. O rascunho de valor final e motivo será descartado. Essa ação não registra ganho, perda ou pagamento.</p>
    </Dialog>
    <Dialog isOpen={!!confirmOutcome} onClose={()=>{if(!busy.current)setConfirmOutcome(null);}} title={confirmOutcome==="won"?"Confirmar ganho":"Confirmar perda"} description="Confira o desfecho antes de registrar."
      footer={<div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end",flexDirection:isMobile?"column":undefined}}><Button style={actionStyle} disabled={isSaving} variant="secondary" onClick={()=>setConfirmOutcome(null)}>Voltar</Button><Button style={actionStyle} disabled={isSaving} onClick={()=>void recordOutcome()}>{isSaving?"Registrando...":confirmOutcome==="won"?"Registrar ganho":"Registrar perda"}</Button></div>}>
      <p>{journey.title||"Oportunidade comercial"}</p><p>Valor final: <strong>{formatCents(centsFromOutcomeInput(value)??0)}</strong></p>
      {confirmOutcome==="lost"?<p>Motivo: {lossReason.trim()}</p>:<p>Confirme que o marco de ganho definido pela empresa foi atendido. Este registro não confirma um pagamento.</p>}
    </Dialog>
    </>
  );
};
