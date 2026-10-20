import { UnsavedChangesNotice, useDiscardChanges } from "./UnsavedChangesNotice";
import { ContactNoteConflict } from "./ContactNoteConflict";
import {readContactMetadata,contactMetadataPatch,type ContactMetadataField} from './contact-metadata';
import { useState, useEffect, useCallback, useRef, type FC } from "react";
import {
  PageHeader, Input, Button, LoadingState, EmptyState, Dialog, ListItem,
  Avatar, Badge, Drawer, SegmentedControl, useBreakpoint,
} from "@sos-sales/ui";
import { Search, Plus, PhoneCall, Edit3, UserX, UserCheck, Building2, Mail, Tag } from "lucide-react";
import type { UseSessionReturn } from "../hooks/useSession";
import { apiClient, ApiError, type ContactSummary } from "../services/api-client";
import { formatPhone } from "./cockpit/utils/formatPhone";
import { userFacingError } from "../utils/user-facing-error";

type ContactStatus = "active" | "inactive" | "all";
type ContactForm = {
  name: string; phoneE164: string; email: string; company: string; notes: string; tags: string;
};

const emptyForm: ContactForm = { name: "", phoneE164: "+55", email: "", company: "", notes: "", tags: "" };
function validateContactRows(value:unknown):void{
 if(!Array.isArray(value))throw new Error("A consulta não confirmou uma lista válida de contatos. Tente consultar novamente.");
 const ids=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||!row.id.trim()||ids.has(row.id)||typeof row.phoneE164!=="string"||!row.phoneE164.trim()||(row.name!=null&&typeof row.name!=="string")||typeof row.optOut!=="boolean"||typeof row.updatedAt!=="string")throw new Error("A consulta retornou contatos com identidade ou preferência comercial não confirmada. Consulte novamente; os registros anteriores foram preservados.");
  ids.add(row.id);
 }
}

export const ContactsPage: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token } = session;
  const sessionLoading=Boolean(session.isLoadingMe||session.isLoadingWorkspace);
  const { isMobile } = useBreakpoint();
  const [pagination,setPagination]=useState<{hasMore:boolean;nextCursor:{updatedAt:string;id:string}|null}>({hasMore:false,nextCursor:null});
  const [moreLoading,setMoreLoading]=useState(false);
  const moreBusy=useRef(false),seenCursors=useRef(new Set<string>()),loadedPages=useRef(1);
  const [paginationBlocked,setPaginationBlocked]=useState(false);
  const cursorKey=(cursor:{updatedAt:string;id:string}|null|undefined)=>cursor?JSON.stringify([cursor.updatedAt,cursor.id]):"";
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ContactStatus>("active");
  const [selected, setSelected] = useState<ContactSummary | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const editedMetadata=useRef(new Set<ContactMetadataField>());
  const editNotesBase=useRef<unknown>(null);
  const editIdentityBase=useRef({name:"",phoneE164:""});
  const editFormBase=useRef<ContactForm>(emptyForm);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const [noteConflict,setNoteConflict]=useState(false);
  const [currentNote,setCurrentNote]=useState<{value:unknown}|null>(null);
  const [noteLoading,setNoteLoading]=useState(false);
  const noteRequest=useRef(0);
  const clearNoteConflict=()=>{noteRequest.current++;setNoteConflict(false);setCurrentNote(null);setNoteLoading(false);};

  const loadContacts = useCallback(async () => {
    if (sessionLoading || !activeWorkspace || !token) {setIsLoading(false);return;}
    const sequence = ++requestSequence.current;
    moreBusy.current=false;setMoreLoading(false);
    setIsLoading(true);
    setLoadError(null);
    try {
      let res = await apiClient.getContacts(
        activeWorkspace.id,
        { search: search.trim() || undefined, status,limit:100 },
        { token }
      );
      if (sequence !== requestSequence.current) return;
      const seen=new Set<string>();
      const validate=(used?:string)=>{validateContactRows(res?.contacts);const next=cursorKey(res.pagination?.nextCursor);if(res.pagination?.hasMore&&(!next||next===used||seen.has(next)))throw new Error("A consulta não confirmou uma continuação válida. Tente consultar os contatos novamente.");};
      validate();let records=res.contacts,pages=1;
      while(pages<loadedPages.current&&res.pagination?.hasMore){
        const cursor=res.pagination.nextCursor!;seen.add(cursorKey(cursor));
        res=await apiClient.getContacts(activeWorkspace.id,{search:search.trim()||undefined,status,limit:100,beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id},{token});
        if(sequence!==requestSequence.current)return;
        validate(cursorKey(cursor));records=Array.from(new Map([...records,...res.contacts].map(contact=>[contact.id,contact])).values());pages++;
      }
      seenCursors.current=seen;loadedPages.current=pages;setPaginationBlocked(false);
      setContacts(records);
      setPagination(res.pagination??{hasMore:false,nextCursor:null});
      setSelected(current => current ? records.find(c => c.id === current.id) || current : null);
    } catch (err) {
      if (sequence === requestSequence.current) {setPaginationBlocked(true);setLoadError(userFacingError(err, "Falha ao carregar contatos."));}
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [activeWorkspace?.id, token, search, status, sessionLoading]);

  useEffect(() => {
    clearNoteConflict();setContacts([]); setSelected(null); setIsCreateOpen(false); setForm(emptyForm);
    setErrorMsg(null); setLoadError(null);
  }, [activeWorkspace?.id, token]);

  useEffect(() => {
    moreBusy.current=false;setMoreLoading(false);seenCursors.current.clear();loadedPages.current=1;setPaginationBlocked(false);setPagination({hasMore:false,nextCursor:null});
    setIsLoading(Boolean(activeWorkspace && token));
    const handler = setTimeout(loadContacts, 300);
    return () => { clearTimeout(handler); requestSequence.current++; };
  }, [loadContacts]);

  const loadMoreContacts=async()=>{
    if(!activeWorkspace||!token||paginationBlocked||isLoading||moreBusy.current||mutationBusy.current||!pagination.nextCursor)return;
    const sequence=requestSequence.current,cursor=pagination.nextCursor;
    moreBusy.current=true;setMoreLoading(true);setLoadError(null);
    try{const res=await apiClient.getContacts(activeWorkspace.id,{search:search.trim()||undefined,status,limit:100,beforeUpdatedAt:cursor.updatedAt,beforeId:cursor.id},{token});if(sequence!==requestSequence.current)return;
      validateContactRows(res?.contacts);
      const next=cursorKey(res.pagination?.nextCursor);
      if(res.pagination?.hasMore&&(!next||next===cursorKey(cursor)||seenCursors.current.has(next))){setPaginationBlocked(true);throw new Error("A consulta não confirmou uma continuação válida. Atualize os contatos antes de continuar.");}
      seenCursors.current.add(cursorKey(cursor));loadedPages.current++;
      setContacts(items=>Array.from(new Map([...items,...res.contacts].map(c=>[c.id,c])).values()));setPagination(res.pagination??{hasMore:false,nextCursor:null});
    }catch(e){if(sequence===requestSequence.current)setLoadError(userFacingError(e,'Não foi possível carregar mais contatos. Os registros anteriores foram preservados.'));}
    finally{if(sequence===requestSequence.current){moreBusy.current=false;setMoreLoading(false);}}
  };

  const openContact = (contact: ContactSummary) => {
    if(mutationBusy.current||moreBusy.current)return;operation.current++;setSuccessMessage("");setPreferenceOpen(false);setConsentEvidence("");
    clearNoteConflict();setSelected(contact);
    setMode("view");
    setErrorMsg(null);
  };

  const startEdit = () => {
    if (!selected||mutationBusy.current) return;
    clearNoteConflict();setSuccessMessage("");
    editedMetadata.current.clear();
    editNotesBase.current=selected.metadata?.notes??null;
    editIdentityBase.current={name:selected.name||"",phoneE164:selected.phoneE164};
    const metadata=readContactMetadata(selected.metadata);
    const initialForm={
      name: selected.name || "",
      phoneE164: selected.phoneE164,
      email: metadata.email,
      company: metadata.company,
      notes: metadata.notes,
      tags: metadata.tags.join(", "),
    };
    editFormBase.current=initialForm;setForm(initialForm);
    setMode("edit");
  };

  const [successMessage,setSuccessMessage]=useState("");
  const [preferenceOpen,setPreferenceOpen]=useState(false);
  const [consentEvidence,setConsentEvidence]=useState("");
  const operation=useRef(0),mutationBusy=useRef(false),scope=useRef("");
  scope.current=`${activeWorkspace?.id}:${token}`;
  useEffect(()=>{operation.current++;mutationBusy.current=false;setIsSubmitting(false);setSuccessMessage("");setPreferenceOpen(false);setConsentEvidence("");return()=>{operation.current++;};},[activeWorkspace?.id,token]);
  const resumeContactField=useRef<HTMLInputElement>(null);
  const discardGuard=useDiscardChanges(
    isCreateOpen ? JSON.stringify(form)!==JSON.stringify(emptyForm) : Boolean(selected&&mode==="edit"&&JSON.stringify(form)!==JSON.stringify(editFormBase.current)),
    `${activeWorkspace?.id}:${token}:${selected?.id}:${mode}:${isCreateOpen}`,()=>resumeContactField.current,true
  );
  const discardCreate=()=>{if(mutationBusy.current)return;operation.current++;setIsCreateOpen(false);setForm(emptyForm);setErrorMsg(null);};
  const discardContact=()=>{if(mutationBusy.current)return;operation.current++;clearNoteConflict();setSelected(null);setMode("view");setErrorMsg(null);setSuccessMessage("");setPreferenceOpen(false);setConsentEvidence("");};
  const closeCreate=()=>{if(!mutationBusy.current)discardGuard.requestExit(discardCreate);};
  const closeContact=()=>{if(!mutationBusy.current)discardGuard.requestExit(discardContact);};
  const cancelEdit=()=>{if(!mutationBusy.current)discardGuard.requestExit(()=>{setMode("view");setErrorMsg(null);clearNoteConflict();});};
  const mutate=async(action:()=>Promise<{contact:ContactSummary}>,message:string,created=false)=>{
    if(discardGuard.isPending||mutationBusy.current||moreBusy.current)return;
    const request=operation.current,requestedScope=scope.current;
    const valid=()=>request===operation.current&&requestedScope===scope.current;
    mutationBusy.current=true;setIsSubmitting(true);setErrorMsg(null);setSuccessMessage("");requestSequence.current++;setIsLoading(false);
    try{
      const result=await action();if(!valid())return;
      clearNoteConflict();setSelected(result.contact);setMode("view");setPreferenceOpen(false);setConsentEvidence("");setSuccessMessage(message);
      setContacts(items=>items.map(c=>c.id===result.contact.id?result.contact:c));
      if(created){setIsCreateOpen(false);setForm(emptyForm);}
      await loadContacts();
    }catch(err){if(valid()){if(err instanceof ApiError&&err.status===409&&err.title==="Nota alterada"){setNoteConflict(true);setCurrentNote(null);}setPreferenceOpen(false);setErrorMsg(userFacingError(err,"Não foi possível confirmar a alteração. Confira o cadastro antes de repetir."));}}
    finally{if(valid()){mutationBusy.current=false;setIsSubmitting(false);}}
  };
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();if (discardGuard.isPending || !activeWorkspace || !token || mutationBusy.current) return;
    if (!/^\+[1-9][0-9]{6,14}$/.test(form.phoneE164.replace(/\s/g, ""))) {
      setErrorMsg("Informe o telefone com +, código do país e DDD. Exemplo: +5511999999999."); return;
    }
    if(form.name.trim().length>150){setErrorMsg("Use um nome de até 150 caracteres.");return;}
    await mutate(()=>apiClient.createContact(activeWorkspace.id,{phoneE164:form.phoneE164.replace(/\s/g,""),name:form.name.trim()||undefined},{token}),"Cadastro disponível. Confira os dados do contato; um telefone já cadastrado reutiliza a ficha existente.",true);
  };
  const handleSave = async () => {
    if (discardGuard.isPending || !activeWorkspace || !token || !selected || mutationBusy.current || noteConflict) return;
    if (!/^\+[1-9][0-9]{6,14}$/.test(form.phoneE164.replace(/\s/g, ""))) {setErrorMsg("Informe um telefone válido com +, código do país e DDD.");return;}
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {setErrorMsg("Confira o e-mail antes de salvar.");return;}
    const tags=[...new Set(form.tags.split(",").map(t=>t.trim()).filter(Boolean))];
    if(form.name.trim().length>150||form.email.trim().length>254||form.company.trim().length>150||form.notes.trim().length>2000||tags.length>20||tags.some(t=>t.length>40)){setErrorMsg("Confira os limites: nome/empresa até 150 caracteres, e-mail 254, observações 2000 e até 20 etiquetas de 40 caracteres.");return;}
    const metadataPatch=contactMetadataPatch(selected.metadata,{email:form.email.trim(),company:form.company.trim(),notes:form.notes.trim(),tags},editedMetadata.current);
    const identityPatch={...(form.name!==editIdentityBase.current.name?{name:form.name.trim()||null}:{}),...(form.phoneE164.replace(/\s/g,"")!==editIdentityBase.current.phoneE164?{phoneE164:form.phoneE164.replace(/\s/g,"")}:{})};
    if(!Object.keys(identityPatch).length&&!Object.keys(metadataPatch).length){setErrorMsg("Nenhuma alteração para salvar.");return;}
    await mutate(()=>apiClient.updateContact(activeWorkspace.id,selected.id,{...identityPatch,...(Object.keys(metadataPatch).length?{metadata:metadataPatch}:{}),...(metadataPatch.notes!==undefined?{expectedNotes:editNotesBase.current}:{})},{token}),"Dados do contato salvos.");
  };
  const refreshConflictingNote=async()=>{
    if(discardGuard.isPending||!activeWorkspace||!token||!selected||noteLoading)return;
    const request=++noteRequest.current,requestedScope=scope.current,op=operation.current;
    const valid=()=>request===noteRequest.current&&requestedScope===scope.current&&op===operation.current;
    setNoteLoading(true);setCurrentNote(null);setErrorMsg(null);
    try{const res=await apiClient.getContacts(activeWorkspace.id,{search:selected.phoneE164,status:"all",limit:1},{token});const found=res.contacts.find(c=>c.id===selected.id);if(!found)throw new Error("Contato não localizado nesta consulta. A edição foi preservada.");if(valid())setCurrentNote({value:found.metadata?.notes??null});}
    catch(error){if(valid())setErrorMsg(userFacingError(error,"Não foi possível consultar a nota. Tente novamente."));}
    finally{if(valid())setNoteLoading(false);}
  };
  const chooseConflictingNote=(useReceived:boolean)=>{
    if(discardGuard.isPending||!currentNote||noteLoading)return;
    editNotesBase.current=currentNote.value;
    editFormBase.current={...editFormBase.current,notes:typeof currentNote.value==="string"?currentNote.value:""};
    editedMetadata.current.add("notes");
    if(useReceived)setForm(f=>({...f,notes:typeof currentNote.value==="string"?currentNote.value:""}));
    clearNoteConflict();setErrorMsg(null);
  };
  const toggleActive = async () => {
    if (!activeWorkspace || !token || !selected || mutationBusy.current) return;
    if(selected.optOut&&consentEvidence.trim().length<5){setErrorMsg("Registre onde e quando o cliente pediu ou aceitou voltar a receber mensagens comerciais.");setPreferenceOpen(false);return;}
    await mutate(()=>apiClient.updateContact(activeWorkspace.id,selected.id,{optOut:!selected.optOut,...(selected.optOut?{consentEvidence:consentEvidence.trim()}:{})},{token}),selected.optOut?"Retomada comercial registrada com a evidência informada.":"Bloqueio comercial registrado. Mensagens já entregues não podem ser retiradas.");
  };

  const selectedMetadata=readContactMetadata(selected?.metadata);
  const displayMetadata=(key:ContactMetadataField)=>selectedMetadata.invalid.has(key)?'Dado precisa de revisão':key==='tags'?selectedMetadata.tags.join(', '):selectedMetadata[key];
  const metadataHelp=(key:ContactMetadataField)=>selectedMetadata.invalid.has(key)?'O valor anterior tem formato incompatível. Se não editar este campo, ele será preservado.':undefined;
  const editMetadata=(key:ContactMetadataField,value:string)=>{editedMetadata.current.add(key);setForm(current=>({...current,[key]:value}));};
  const contactRow = (c: ContactSummary, mobile = false) => mobile ? (
    <ListItem key={c.id} height="lg" leading={<Avatar id={c.id} name={c.name || undefined} size="md" />}
      style={{height:"auto",maxHeight:"none",padding:"12px 16px"}}
      title={<span style={{ fontWeight: 500,whiteSpace:"normal",overflowWrap:"anywhere" }}>{c.name || "Contato sem nome"}</span>}
      subtitle={<>
        <span style={{display:"block",overflow:"hidden",textOverflow:"ellipsis"}}>{formatPhone(c.phoneE164)} · {readContactMetadata(c.metadata).invalid.has("company")?"Empresa precisa de revisão":readContactMetadata(c.metadata).company || "Sem empresa"}</span>
        <span style={{display:"block",whiteSpace:"normal",fontSize:12}}>{c.optOut ? "Com bloqueio comercial" : "Sem bloqueio comercial"}</span>
      </>} onClick={() => openContact(c)} />
  ) : (
    <tr key={c.id} onClick={() => openContact(c)} tabIndex={0} role="button"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openContact(c); } }}
      style={{ height: 56, borderBottom: "1px solid var(--border-subtle)", cursor: "pointer" }}>
      <td style={{ padding: "0 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar id={c.id} name={c.name || undefined} size="sm" />
        <div><div style={{ fontWeight: 600 }}>{c.name || "Sem nome"}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{readContactMetadata(c.metadata).invalid.has("company")?"Empresa precisa de revisão":readContactMetadata(c.metadata).company || "Sem empresa informada"}</div></div>
      </div></td>
      <td style={{ padding: "0 16px", fontFamily: "var(--font-mono, monospace)", color: "var(--text-secondary)" }}>{formatPhone(c.phoneE164)}</td>
      <td style={{ padding: "0 16px" }}><Badge variant={c.optOut ? "neutral" : "operational"}>{c.optOut ? "Com bloqueio comercial" : "Sem bloqueio comercial"}</Badge></td>
      <td style={{ padding: "0 16px", color: "var(--text-secondary)", fontSize: 12 }}>{new Date(c.updatedAt).toLocaleDateString("pt-BR")}</td>
    </tr>
  );

  if(sessionLoading)return <div><p role="status">Conferindo acesso aos contatos…</p><LoadingState variant="skeleton" lines={5}/></div>;
  if(!activeWorkspace||!token)return <EmptyState icon={<PhoneCall size={48}/>} title={!activeWorkspace?"Selecione uma empresa":"Acesso não confirmado"} description={!activeWorkspace?"Escolha a empresa para consultar e cadastrar contatos.":"Entre novamente para consultar os contatos desta empresa."}/>;

  return <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--bg-canvas)", overflowY: "auto", padding: "var(--space-6)", boxSizing: "border-box" }}>
    <div style={{ maxWidth: 1080, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader title="Contatos & Leads" description="Cadastros, histórico e preferências dos clientes do WhatsApp."
        actions={<Button size="sm" variant="primary" prefixIcon={<Plus size={14}/>} disabled={isSubmitting||discardGuard.isPending} onClick={() => { if(mutationBusy.current)return;operation.current++;setSelected(null);setSuccessMessage("");setForm(emptyForm); setErrorMsg(null); setIsCreateOpen(true); }}>Novo Contato</Button>} />
      <div style={{ background: "var(--bg-surface)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-default)", padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ maxWidth: 400, flex: "1 1 280px" }}><Input aria-label="Buscar contatos por telefone ou nome" placeholder="Buscar por telefone ou nome..." prefixIcon={<Search size={16}/>} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <SegmentedControl aria-label="Preferência comercial dos contatos" value={status} onChange={(v) => setStatus(v as ContactStatus)}
          options={[{ value: "active", label: "Sem bloqueio" }, { value: "inactive", label: "Bloqueados" }, { value: "all", label: "Todos" }]} />
        <Button size="sm" variant="secondary" disabled={isLoading||moreLoading||isSubmitting} onClick={()=>{if(mutationBusy.current||moreBusy.current)return;void loadContacts();}}>Atualizar contatos</Button>
        <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{contacts.length} contato{contacts.length === 1 ? "" : "s"} carregado{contacts.length === 1 ? "" : "s"}</span>
      </div>

      {loadError && <div role="alert" style={{ padding: 12, color: "var(--color-danger)", background: "var(--color-danger-subtle)", borderRadius: 8 }}>{loadError} <Button size="sm" onClick={() => void loadContacts()} disabled={isLoading}>Tentar novamente</Button></div>}
      {isLoading&&contacts.length>0&&<p role="status">Consultando contatos… Os registros exibidos são da última consulta concluída e podem não corresponder aos novos filtros.</p>}
      {loadError&&contacts.length>0&&!isLoading&&<p role="status">Os registros anteriores foram preservados. Esta tentativa não confirmou o estado atual da lista.</p>}
      {isLoading && contacts.length === 0 ? <LoadingState variant="skeleton" lines={5} text="Carregando contatos..." />
      : contacts.length === 0 ? (loadError ? null : <EmptyState icon={<PhoneCall size={48}/>} title="Nenhum contato encontrado" description="Altere o filtro ou cadastre um novo contato." />)
      : isMobile ? <div style={{ background: "var(--bg-surface)", borderRadius: 12, border: "1px solid var(--border-default)", overflow: "hidden" }}>{contacts.map((c) => contactRow(c, true))}</div>
      : <div style={{ background: "var(--bg-surface)", borderRadius: 12, border: "1px solid var(--border-default)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}><thead><tr style={{ background: "var(--bg-surface-elevated)", borderBottom: "1px solid var(--border-default)" }}>
          {["Contato", "Telefone", "Status", "Atualizado em"].map((h) => <th key={h} style={{ padding: "0 16px", height: 48, fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{h}</th>)}
        </tr></thead><tbody>{contacts.map((c) => contactRow(c))}</tbody></table>
      </div>}
      {pagination.hasMore&&<div><p role="status">Há mais contatos nesta consulta. A lista segue a última atualização e pode mudar durante o uso; atualizar consulta novamente as páginas já abertas. Alterar os filtros inicia uma nova lista.</p><Button disabled={paginationBlocked||isLoading||moreLoading||isSubmitting} onClick={()=>void loadMoreContacts()}>{moreLoading?'Carregando mais contatos…':'Carregar mais contatos'}</Button></div>}
    </div>

    <Dialog isOpen={isCreateOpen} onClose={closeCreate} title="Cadastrar Novo Contato" description="Crie o cadastro básico; os demais dados podem ser preenchidos na ficha.">
      <form onSubmit={handleCreateContact} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {discardGuard.isPending&&<UnsavedChangesNotice onKeep={discardGuard.keepEditing} onDiscard={discardGuard.discard} disabled={isSubmitting}/>}
        {errorMsg && <div role="alert" style={{ color: "var(--color-danger)" }}>{errorMsg}</div>}
        <Input ref={resumeContactField} disabled={isSubmitting||discardGuard.isPending} label="Telefone WhatsApp (E.164)" required value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}/>
        <Input disabled={isSubmitting||discardGuard.isPending} label="Nome completo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><Button size="sm" variant="secondary" type="button" disabled={isSubmitting||discardGuard.isPending} onClick={closeCreate}>Cancelar</Button><Button size="sm" variant="primary" type="submit" disabled={isSubmitting||discardGuard.isPending}>{isSubmitting ? "Salvando..." : "Salvar"}</Button></div>
      </form>
    </Dialog>

    <Drawer isOpen={Boolean(selected)} onClose={closeContact} title={selected?.name || "Contato sem nome"}
      description={selected ? formatPhone(selected.phoneE164) : ""} width="480px"
      footer={selected && <div style={{ display: "flex", justifyContent: "space-between", gap: 8,flexWrap:"wrap" }}>
        <Button size="sm" variant="secondary" prefixIcon={selected.optOut ? <UserCheck size={15}/> : <UserX size={15}/>} onClick={()=>{setErrorMsg(null);setPreferenceOpen(true);}} disabled={isSubmitting||mode==="edit"} title={mode==="edit"?"Salve ou cancele a edição dos dados antes de alterar a preferência comercial.":undefined}>
          {selected.optOut ? "Retomar mensagens comerciais" : "Bloquear mensagens comerciais"}
        </Button>
        {mode === "view" ? <Button size="sm" variant="primary" prefixIcon={<Edit3 size={15}/>} disabled={isSubmitting||discardGuard.isPending} onClick={startEdit}>Editar dados</Button>
          : <div style={{ display: "flex", gap: 8,flexWrap:"wrap" }}><Button size="sm" variant="secondary" disabled={isSubmitting||discardGuard.isPending} onClick={cancelEdit}>Cancelar</Button><Button size="sm" variant="primary" onClick={handleSave} disabled={isSubmitting||discardGuard.isPending||noteConflict}>{isSubmitting ? "Salvando..." : "Salvar"}</Button></div>}
      </div>}>
      {selected && <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
        {discardGuard.isPending&&<UnsavedChangesNotice onKeep={discardGuard.keepEditing} onDiscard={discardGuard.discard} disabled={isSubmitting}/>}
        {selectedMetadata.invalid.size>0&&<p role="status">{selectedMetadata.invalidContainer?"Os dados complementares têm formato incompatível e precisam de revisão técnica. Você pode salvar nome e telefone sem substituí-los.":"Alguns dados deste cadastro precisam de revisão. Campos incompatíveis que você não editar serão preservados ao salvar."}</p>}
        {successMessage&&<p role="status">{successMessage}</p>}
        {loadError&&<p role="alert">A lista não foi atualizada: {loadError}</p>}
        {errorMsg && <div role="alert" style={{ padding: 10, color: "var(--color-danger)", background: "var(--color-danger-subtle)", borderRadius: 8 }}>{errorMsg}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}><Avatar id={selected.id} name={selected.name || undefined} size="lg"/><div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{selected.name || "Contato sem nome"}</div>
          <Badge variant={selected.optOut ? "neutral" : "operational"}>{selected.optOut ? "Mensagens comerciais bloqueadas" : "Sem bloqueio comercial"}</Badge>
        </div></div>
        {mode === "edit" && noteConflict && <ContactNoteConflict disabled={discardGuard.isPending} current={currentNote} loading={noteLoading} onRefresh={refreshConflictingNote} onChoose={chooseConflictingNote}/>}
        {mode === "edit" ? <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input ref={resumeContactField} disabled={isSubmitting||discardGuard.isPending} label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}/>
          <Input disabled={isSubmitting||discardGuard.isPending} label="Telefone WhatsApp" value={form.phoneE164} onChange={(e) => setForm({ ...form, phoneE164: e.target.value })}/>
          <Input disabled={isSubmitting||discardGuard.isPending||selectedMetadata.invalidContainer} label="E-mail" type="email" value={form.email} helperText={metadataHelp("email")} onChange={(e) => editMetadata("email",e.target.value)}/>
          <Input disabled={isSubmitting||discardGuard.isPending||selectedMetadata.invalidContainer} label="Empresa" value={form.company} helperText={metadataHelp("company")} onChange={(e) => editMetadata("company",e.target.value)}/>
          <Input disabled={isSubmitting||discardGuard.isPending||selectedMetadata.invalidContainer} label="Etiquetas (separadas por vírgula)" value={form.tags} helperText={metadataHelp("tags")} onChange={(e) => editMetadata("tags",e.target.value)}/>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>Observações
            {metadataHelp("notes")&&<span style={{fontWeight:400}}>{metadataHelp("notes")}</span>}
            <textarea disabled={isSubmitting||discardGuard.isPending||selectedMetadata.invalidContainer} maxLength={2000} value={form.notes} onChange={(e) => editMetadata("notes",e.target.value)} rows={6}
              style={{ resize: "vertical", padding: 12, border: "1px solid var(--border-default)", borderRadius: 8, font: "inherit", fontWeight: 400 }}/>
          </label>
        </div> : <div style={{ display: "grid", gap: 12 }}>
          <Info icon={<Building2 size={17}/>} label="Empresa" value={displayMetadata("company")}/>
          <Info icon={<Mail size={17}/>} label="E-mail" value={displayMetadata("email")}/>
          <Info icon={<Tag size={17}/>} label="Etiquetas" value={displayMetadata("tags")}/>
          <div style={{ padding: 14, background: "var(--bg-surface-elevated)", borderRadius: 10 }}><div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Observações</div><div style={{ whiteSpace: "pre-wrap" }}>{displayMetadata("notes") || "Nenhuma observação cadastrada"}</div></div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Criado em {new Date(selected.createdAt).toLocaleString("pt-BR")} · atualizado em {new Date(selected.updatedAt).toLocaleString("pt-BR")}</div>
        </div>}
      </div>}
    </Drawer>
    <Dialog isOpen={preferenceOpen&&!!selected} onClose={()=>{if(!mutationBusy.current)setPreferenceOpen(false);}} title={selected?.optOut?"Retomar mensagens comerciais":"Bloquear mensagens comerciais"} description="Preferência deste cadastro de cliente."
      footer={<div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Button disabled={isSubmitting||discardGuard.isPending} variant="secondary" onClick={()=>setPreferenceOpen(false)}>Cancelar</Button><Button disabled={isSubmitting||discardGuard.isPending} onClick={()=>void toggleActive()}>{isSubmitting?"Salvando...":selected?.optOut?"Confirmar retomada":"Confirmar bloqueio"}</Button></div>}>
      {selected?.optOut?<><p>Retome somente após um pedido ou aceite explícito do cliente. Uma nova conversa, por si só, não é autorização para ofertas.</p><Input disabled={isSubmitting||discardGuard.isPending} maxLength={500} label="Origem e momento do aceite do cliente" value={consentEvidence} onChange={e=>setConsentEvidence(e.target.value)} placeholder="Ex.: pedido do cliente nesta conversa, hoje às 14h"/></>:<p>Impede campanhas e acompanhamentos comerciais que verificam esta preferência. O cadastro e o histórico serão preservados.</p>}
    </Dialog>
  </div>;
};

const Info: FC<{ icon: React.ReactNode; label: string; value?: string }> = ({ icon, label, value }) => <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderBottom: "1px solid var(--border-subtle)" }}>
  <span style={{ color: "var(--text-secondary)" }}>{icon}</span><div><div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{label}</div><div>{value || "Não informado"}</div></div>
</div>;

export default ContactsPage;
