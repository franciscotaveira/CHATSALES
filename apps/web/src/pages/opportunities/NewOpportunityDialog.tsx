import { useState, useEffect, useRef, type FC, type FormEvent, type CSSProperties } from "react";
import { Dialog, Input, Button, useBreakpoint } from "@sos-sales/ui";
import { apiClient, ApiError, type ContactSummary, type JourneyStage } from "../../services/api-client";
import { STAGES, getStageLabel, type CustomStagesMap } from "./stages";
import { UnsavedChangesNotice, useDiscardChanges } from "../UnsavedChangesNotice";
import { userFacingError } from "../../utils/user-facing-error";

interface NewOpportunityDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  workspaceId: string;
  token: string;
  contacts: ContactSummary[];
  customStages?: CustomStagesMap;
  thread?:{id:string;contactId:string};
  initialStage?:JourneyStage;
}

const selectStyle: CSSProperties = {
  width: "100%",
  height: "36px",
  padding: "0 10px",
  fontSize: "var(--font-size-sm)",
  color: "var(--text-primary)",
  backgroundColor: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  fontFamily: "inherit",
};

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  fontSize: "var(--font-size-xs)",
  fontWeight: 600,
  color: "var(--text-secondary)",
};

/**
 * Parses currency strings into integer cents; null when empty or invalid.
 * Disambiguates "." as thousands separator vs. decimal point:
 *   "1.500"     -> 1500.00 (dot-grouped thousands, pt-BR)
 *   "1.234,56"  -> 1234.56 (thousands + comma decimal, pt-BR)
 *   "1234,5"    -> 1234.50 (comma decimal, no grouping)
 *   "1234.56"   -> 1234.56 (plain dot decimal)
 *   "1234"      -> 1234.00 (integer)
 */
const parseBrlToCents = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let normalized: string | null = null;
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(trimmed) || /^\d+,\d{1,2}$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, "");
  } else if (/^\d+\.\d{1,2}$/.test(trimmed) || /^\d+$/.test(trimmed)) {
    normalized = trimmed;
  }
  if (normalized === null) return null;

  const value = Number(normalized);
  const cents=Math.round(value * 100);
  return Number.isSafeInteger(cents) && cents >= 0 && cents <= 2147483647 ? cents : null;
};

export const NewOpportunityDialog: FC<NewOpportunityDialogProps> = props => <OpportunityForm key={JSON.stringify([props.isOpen,props.workspaceId,props.token,props.thread?.id,props.thread?.contactId,props.initialStage])} {...props}/>;
const OpportunityForm: FC<NewOpportunityDialogProps> = ({
  isOpen,
  onClose,
  onCreated,
  workspaceId,
  token,
  contacts,
  customStages = {},thread,initialStage="lead",
}) => {
  const {isMobile}=useBreakpoint();
  const live=useRef(true),busy=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const mobileAction:CSSProperties|undefined=isMobile?{width:'100%',minHeight:44,height:'auto',whiteSpace:'normal',overflowWrap:'anywhere'}:undefined;
  const [contactSearch,setContactSearch]=useState(''),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState<string|null>(null);
  const [foundContacts,setFoundContacts]=useState<ContactSummary[]|null>(null),[discovered,setDiscovered]=useState<ContactSummary[]>([]);
  const searchBusy=useRef(false);
  const allContacts=Array.from(new Map([...contacts,...discovered].map(c=>[c.id,c])).values());
  const [contactId, setContactId] = useState("");
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<JourneyStage>("lead");
  const [valueInput, setValueInput] = useState("");
  const [created,setCreated]=useState(false);
  const [creationUncertain,setCreationUncertain]=useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setContactId(thread?.contactId??"");
      setTitle("");
      setStage(initialStage==="won"||initialStage==="lost"?"proposal":initialStage);
      setValueInput("");
      setErrorMsg(null);
    }
  }, [isOpen, workspaceId]);

  const titleRef=useRef<HTMLInputElement>(null);
  const valueRef=useRef<HTMLInputElement>(null),errorRef=useRef<HTMLDivElement>(null);
  const [valueError,setValueError]=useState<{message:string}|null>(null);
  useEffect(()=>{if(valueError)valueRef.current?.focus();},[valueError]);
  useEffect(()=>{if(errorMsg)errorRef.current?.focus();},[errorMsg]);
  const initialOpenStage=initialStage==="won"||initialStage==="lost"?"proposal":initialStage;
  const dirty=!created&&!creationUncertain&&(contactId!==(thread?.contactId??"")||title.trim()!==""||stage!==initialOpenStage||valueInput.trim()!=="");
  const discard=useDiscardChanges(dirty,JSON.stringify([isOpen,workspaceId,token,thread?.id,thread?.contactId,initialStage]),()=>titleRef.current,isOpen);
  const requestClose=()=>{if(!busy.current)discard.requestExit(onClose);};

  const searchContacts=async()=>{
    if(discard.isPending||searchBusy.current||busy.current||created||creationUncertain||!isOpen||!workspaceId||!token)return;
    const query=contactSearch.trim();
    if(!query){setFoundContacts(null);setSearchError(null);return;}
    searchBusy.current=true;setSearching(true);setSearchError(null);
    try{const result=await apiClient.getContacts(workspaceId,{search:query,limit:100},{token});if(!live.current)return;setFoundContacts(result.contacts);setDiscovered(previous=>Array.from(new Map([...previous,...result.contacts].map(c=>[c.id,c])).values()));}
    catch(e){if(live.current)setSearchError(userFacingError(e,'Não foi possível buscar contatos. Sua seleção foi preservada.'));}
    finally{if(live.current){searchBusy.current=false;setSearching(false);}}
  };
  const visibleContacts=foundContacts??contacts;
  const selectedContact=allContacts.find(c=>c.id===contactId);
  const choices=selectedContact&&!visibleContacts.some(c=>c.id===contactId)?[selectedContact,...visibleContacts]:visibleContacts;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (discard.isPending||!isOpen||!workspaceId||!token||busy.current||searchBusy.current||created||creationUncertain) return;
    if ((thread&&contactId!==thread.contactId)||!allContacts.some(contact => contact.id === contactId)) {
      setErrorMsg("Selecione um lead.");
      return;
    }
    if(stage==="won"||stage==="lost"){setErrorMsg("Cadastre uma etapa aberta e registre ganho ou perda pela revisão do desfecho.");return;}
    const cents = parseBrlToCents(valueInput);
    if (valueInput.trim() && cents === null) {
      setErrorMsg(null);setValueError({message:"Informe um valor válido de até R$ 21.474.836,47. Use o formato 1.500,00."});
      return;
    }

    setValueError(null);busy.current=true;setIsSubmitting(true);
    setErrorMsg(null);
    let committed=false;
    try {
      await apiClient.createJourney(
        workspaceId,
        {
          contactId,
          ...(thread?{threadId:thread.id}:{}),
          title: title.trim() || undefined,
          stage,
          attributionSource: "manual_input",
          estimatedValueCents: cents ?? undefined,
        },
        { token }
      );
      committed=true;
      if(!live.current)return;
      setCreated(true);
      await onCreated();
      if(live.current)onClose();
    } catch (err: unknown) {
      if(!live.current)return;
      if(committed){setErrorMsg("Oportunidade criada, mas não foi possível atualizar a lista. Feche e consulte as oportunidades antes de criar outra.");return;}
      if (!(err instanceof ApiError && err.status>=400 && err.status<500 && err.status!==408)) {
        setCreationUncertain(true);
        setErrorMsg("Não foi possível confirmar se a oportunidade foi criada. Feche e confira as oportunidades antes de tentar novamente; os dados podem ter sido salvos.");
      } else if (err instanceof ApiError && err.status === 409) {
        setErrorMsg("Este lead já tem uma oportunidade aberta.");
      } else {
        setErrorMsg(userFacingError(err, "Falha ao criar oportunidade. Os dados foram preservados."));
      }
    } finally {
      if(live.current){busy.current=false;setIsSubmitting(false);}
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={requestClose}
      title="Nova Oportunidade"
      description="Abra uma oportunidade de venda vinculada a um lead."
    >
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard}/>}
        {errorMsg && (
          <div
            ref={errorRef} tabIndex={-1} role="alert"
            style={{
              padding: "8px 12px",
              backgroundColor: "var(--color-danger-subtle)",
              color: "var(--color-danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
            }}
          >
            {errorMsg}
          </div>
        )}

        <fieldset disabled={isSubmitting||created||creationUncertain||discard.isPending} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:16}}>
        {thread?<p role="status">Esta oportunidade ficará vinculada à conversa e ao cliente selecionados no atendimento.</p>:<>
        <Input label="Buscar contato na empresa" placeholder="Nome ou telefone" value={contactSearch} disabled={searching} onChange={e=>setContactSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void searchContacts();}}}/>
        <Button style={mobileAction} type="button" variant="secondary" disabled={searching} onClick={()=>void searchContacts()}>{searching?'Buscando contatos…':'Buscar contatos'}</Button>
        {searchError&&<p role="alert">{searchError}</p>}
        {foundContacts&&<p role="status">{foundContacts.length===0?'Nenhum contato encontrado nesta busca.':`${foundContacts.length} contato(s) encontrado(s). Selecione o lead abaixo.`}{foundContacts.length===100?' A busca retornou até 100 contatos; refine o nome ou telefone.':''}</p>}
        </>}
        <label style={labelStyle}>
          Lead
          <select disabled={Boolean(thread)} required value={contactId} onChange={(e) => setContactId(e.target.value)} style={{...selectStyle,height:isMobile?44:36}}>
            <option value="">{choices.length === 0 ? "Busque um contato acima" : "Selecione um lead"}</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ? `${c.name} · ${c.phoneE164}` : c.phoneE164}
              </option>
            ))}
          </select>
        </label>

        <Input ref={titleRef} label="Título (Opcional)" placeholder="Ex: Pacote mensal" value={title} onChange={(e) => setTitle(e.target.value)} />

        <label style={labelStyle}>
          Etapa
          <select value={stage} onChange={(e) => setStage(e.target.value as JourneyStage)} style={{...selectStyle,height:isMobile?44:36}}>
            {STAGES.filter(s=>s.id!=="won"&&s.id!=="lost").map((s) => (
              <option key={s.id} value={s.id}>
                {getStageLabel(s.id, customStages)}
              </option>
            ))}
          </select>
        </label>

        <Input ref={valueRef} error={valueError?.message} inputMode="decimal" label="Valor estimado em R$ (Opcional)" placeholder="1.500,00" value={valueInput} onChange={(e) => {setValueInput(e.target.value);setValueError(null);}} />

        </fieldset>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px",flexDirection:isMobile?"column":undefined }}>
          <Button style={mobileAction} size="sm" variant="secondary" type="button" onClick={requestClose} disabled={isSubmitting||discard.isPending}>
            Cancelar
          </Button>
          <Button style={mobileAction} size="sm" variant="primary" type="submit" disabled={discard.isPending || isSubmitting || searching || created || creationUncertain || choices.length === 0}>
            {isSubmitting ? "Salvando..." : created ? "Oportunidade criada" : creationUncertain ? "Confira as oportunidades" : "Criar Oportunidade"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
