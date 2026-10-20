import { UnsavedChangesNotice, useDiscardChanges } from "../../UnsavedChangesNotice";
import { ContactNoteConflict } from "../../ContactNoteConflict";
import {readContactMetadata,contactMetadataPatch,type ContactMetadataField} from '../../contact-metadata';
import {hasEstimatedValue,hasRecurringIndication} from '../../opportunities/opportunity-filters';
import { useEffect, useState, useRef, type FC, type ReactNode } from "react";
import { Drawer, Button, Badge, Avatar, Input, LoadingState } from "@sos-sales/ui";
import { Building2, Mail, Phone, MessageCircle, Tag, StickyNote, Edit3, Sparkles } from "lucide-react";
import { apiClient, ApiError, type CommercialThreadSummary, type ContactSummary } from "../../../services/api-client";
import { CommercialTasks } from "./CommercialTasks";
import { formatPhone } from "../utils/formatPhone";

import {userFacingError} from "../../../utils/user-facing-error";
export function parseHistoricalSpent(value:string):number|null{
 const raw=value.trim();if(!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw))return null;
 const [units,fraction=""]=raw.replace(/\./g,"").split(",");const cents=Number(units)*100+Number(fraction.padEnd(2,"0"));return Number.isSafeInteger(cents)&&cents>=0?cents:null;
}
interface Props {
  isOpen: boolean;
  onClose: () => void;
  thread: CommercialThreadSummary | null;
  workspaceId?: string;
  token?: string;
  onContactUpdated?: (contact: ContactSummary) => void | Promise<void>;
}

type ContactForm = {
  name: string;
  email: string;
  company: string;
  tags: string;
  notes: string;
  isRecurring: boolean;
  totalOrders: string;
  totalSpentReais: string;
};

const emptyForm: ContactForm = {
  name: "",
  email: "",
  company: "",
  tags: "",
  notes: "",
  isRecurring: false,
  totalOrders: "",
  totalSpentReais: "",
};

function dossierForm(contact:ContactSummary|null):ContactForm{
 const data=readContactMetadata(contact?.metadata);
 return {name:contact?.name||'',email:data.email,company:data.company,tags:data.tags.join(', '),notes:data.notes,isRecurring:contact?.metadata?.isRecurring===true,totalOrders:hasEstimatedValue(contact?.metadata?.totalOrders)?String(contact!.metadata.totalOrders):'',totalSpentReais:hasEstimatedValue(contact?.metadata?.totalSpentCents)?(contact!.metadata.totalSpentCents!/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):''};
}

const statusLabel: Record<CommercialThreadSummary["status"], string> = {
  active: "Em atendimento",
  waiting_client: "Aguardando cliente",
  waiting_human: "Precisa de atenção",
  closed: "Encerrada",
};

export const DossierDrawer: FC<Props> = ({ isOpen, onClose, thread, workspaceId, token, onContactUpdated }) => {
  const [contact, setContact] = useState<ContactSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);

  const [noteConflict,setNoteConflict]=useState(false);
  const [currentNote,setCurrentNote]=useState<{value:unknown}|null>(null);
  const [noteLoading,setNoteLoading]=useState(false);
  const noteRequest=useRef(0);
  const clearNoteConflict=()=>{noteRequest.current++;setNoteConflict(false);setCurrentNote(null);setNoteLoading(false);};
  const [reload,setReload]=useState(0);
  const generation=useRef(0),busy=useRef(false);
  const recurrenceEdited=useRef(false),editedMetadata=useRef(new Set<ContactMetadataField>());
  const scope=useRef("");scope.current=`${workspaceId}:${token}:${thread?.id}:${thread?.contactId}:${isOpen}`;
  useEffect(() => {
    clearNoteConflict();recurrenceEdited.current=false;editedMetadata.current.clear();
    generation.current++;busy.current=false;setSaving(false);setContact(null);setEditing(false);setForm(emptyForm);setError(null);setLoading(false);
    if (!isOpen || !thread || !workspaceId || !token) return;
    let cancelled=false;
    setContact(null);
    setLoading(true);
    setEditing(false);
    setError(null);
    apiClient.getContacts(workspaceId, { search: thread.contactPhone, status: "all", limit: 10 }, { token }).then((contacts) => {
      if(cancelled)return;
      if(!Array.isArray(contacts?.contacts))throw new Error("A consulta não confirmou uma lista válida de clientes. Tente consultar a ficha novamente.");
      const matches=contacts.contacts.filter(item=>item&&typeof item==="object"&&item.id===thread.contactId);
      const loadedContact=matches[0]??null;
      if(matches.length>1||(loadedContact&&(typeof loadedContact.phoneE164!=="string"||(loadedContact.name!=null&&typeof loadedContact.name!=="string"))))throw new Error("A consulta não confirmou dados válidos para a ficha deste cliente. Tente consultar novamente.");
      setContact(loadedContact);
      
      setForm(dossierForm(loadedContact));
    }).catch((e) => {if(!cancelled){setContact(null);setError(userFacingError(e,"Falha ao carregar o cliente."));}}).finally(() => {if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;generation.current++;};
  }, [isOpen, thread?.id,thread?.contactId,thread?.contactPhone, workspaceId, token,reload]);

  const startEditing = () => {
    if (!contact) return;
    clearNoteConflict();recurrenceEdited.current=false;editedMetadata.current.clear();
    setForm(dossierForm(contact));
    setError(null);
    setEditing(true);
  };

  const saveContact = async () => {
    if (discardGuard.isPending || !contact || !workspaceId || !token||busy.current||noteConflict) return;
    const requestedScope=scope.current,request=generation.current;const valid=()=>requestedScope===scope.current&&request===generation.current;
    const totalSpentCents=form.totalSpentReais.trim()?parseHistoricalSpent(form.totalSpentReais):undefined;
    if(totalSpentCents===null||(form.totalOrders.trim()&&(!/^\d+$/.test(form.totalOrders.trim())||!Number.isSafeInteger(Number(form.totalOrders))))){setError("Informe compras como inteiro não negativo e gasto total em reais, com vírgula para centavos.");return;}
    if(form.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())){setError("Confira o e-mail informado.");return;}
    const totalOrders=form.totalOrders.trim()?Number(form.totalOrders):undefined;
    const originalForm=dossierForm(contact);
    const metadataPatch={...contactMetadataPatch(contact.metadata,{email:form.email.trim(),company:form.company.trim(),notes:form.notes.trim(),tags:form.tags.split(',').map(tag=>tag.trim()).filter(Boolean)},editedMetadata.current),...(recurrenceEdited.current?{isRecurring:form.isRecurring}:{}),...(form.totalOrders!==originalForm.totalOrders&&totalOrders!==undefined?{totalOrders}:{}),...(form.totalSpentReais!==originalForm.totalSpentReais&&totalSpentCents!==undefined?{totalSpentCents}:{})};
    const identityPatch=form.name!==originalForm.name?{name:form.name.trim()||null}:{};
    if(!Object.keys(identityPatch).length&&!Object.keys(metadataPatch).length){setError("Nenhuma alteração para salvar.");return;}
    busy.current=true;
    setSaving(true);
    setError(null);
    let committed=false;
    try {
      const result = await apiClient.updateContact(workspaceId, contact.id, {
        ...identityPatch,
        ...(Object.keys(metadataPatch).length?{metadata:metadataPatch}:{}),
        ...(metadataPatch.notes !== undefined ? { expectedNotes: contact.metadata?.notes ?? null } : {}),
      }, { token });
      if(!valid())return;
      if(!result?.contact||result.contact.id!==contact.id||typeof result.contact.phoneE164!=="string"||(result.contact.name!=null&&typeof result.contact.name!=="string"))throw new Error("A resposta não confirmou a ficha deste cliente. Sua edição foi preservada; confira o cadastro antes de repetir.");
      committed=true;setContact(result.contact);setEditing(false);
      await onContactUpdated?.(result.contact);
    } catch (err) {
      if(valid()){if(committed){setError("Ficha salva, mas a tela anterior não pôde ser atualizada. Feche e atualize o atendimento; não é necessário salvar novamente.");return;}if(err instanceof ApiError&&err.status===409&&err.title==="Nota alterada"){setNoteConflict(true);setCurrentNote(null);}setError(userFacingError(err,"Não foi possível salvar a ficha do cliente."));}
    } finally {
      if(valid()){busy.current=false;setSaving(false);}
    }
  };

  const refreshConflictingNote=async()=>{
    if(discardGuard.isPending||!contact||!workspaceId||!token||noteLoading)return;
    const request=++noteRequest.current,requestedScope=scope.current,epoch=generation.current;
    const valid=()=>request===noteRequest.current&&requestedScope===scope.current&&epoch===generation.current;
    setNoteLoading(true);setCurrentNote(null);setError(null);
    try{const result=await apiClient.getContacts(workspaceId,{search:contact.phoneE164,status:"all",limit:1},{token});const found=result.contacts.find(c=>c.id===contact.id);if(!found)throw new Error("Contato não localizado nesta consulta. A edição foi preservada.");if(valid())setCurrentNote({value:found.metadata?.notes??null});}
    catch(error){if(valid())setError(userFacingError(error,"Não foi possível consultar a nota. Tente novamente."));}
    finally{if(valid())setNoteLoading(false);}
  };
  const chooseConflictingNote=(useReceived:boolean)=>{
    if(discardGuard.isPending||!currentNote||noteLoading)return;
    setContact(c=>c?{...c,metadata:{...c.metadata,notes:currentNote.value as string}}:c);
    editedMetadata.current.add("notes");
    if(useReceived)setForm(f=>({...f,notes:typeof currentNote.value==="string"?currentNote.value:""}));
    clearNoteConflict();setError(null);
  };
  const meta = contact?.metadata || {};
  const data=readContactMetadata(contact?.metadata);
  const isRec=hasRecurringIndication(contact??undefined);
  const totalOrders=hasEstimatedValue(meta.totalOrders)?meta.totalOrders:null;
  const totalSpentCents=hasEstimatedValue(meta.totalSpentCents)?meta.totalSpentCents:null;
  const editMetadata=(key:ContactMetadataField,value:string)=>{editedMetadata.current.add(key);setForm(current=>({...current,[key]:value}));};

  const nameRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(editing)nameRef.current?.focus();},[editing]);
  const discardGuard=useDiscardChanges(editing&&JSON.stringify(form)!==JSON.stringify(dossierForm(contact)),scope.current,()=>nameRef.current,isOpen);
  const requestClose=()=>{if(!busy.current)discardGuard.requestExit(onClose);};
  const requestCancel=()=>{if(!busy.current)discardGuard.requestExit(()=>{setEditing(false);setError(null);clearNoteConflict();});};
  return (
    <Drawer
      isOpen={isOpen}
      onClose={requestClose}
      title="Ficha do Cliente"
      description="Informações cadastrais, inteligência de compras e histórico deste atendimento."
      footer={
        editing ? (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={requestCancel} disabled={saving||discardGuard.isPending}>
              Cancelar
            </Button>
            <Button size="sm" variant="primary" onClick={saveContact} disabled={saving||discardGuard.isPending||noteConflict}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={onClose}>Fechar</Button>
            <Button size="sm" variant="primary" prefixIcon={<Edit3 size={14}/>} onClick={startEditing} disabled={!contact}>
              Editar ficha
            </Button>
          </div>
        )
      }
    >
      {!thread ? (
        <div style={{ padding: 24, color: "var(--text-secondary)" }}>Selecione uma conversa para consultar o cliente.</div>
      ) : loading ? (
        <div style={{ padding: 20 }}><LoadingState variant="skeleton" lines={5} text="Carregando ficha..."/></div>
      ) : !contact ? (
        <div style={{padding:20}}>{error&&<p role="alert">{error}</p>}<p>{error?"A ficha não está disponível nesta consulta.":"O contato não foi encontrado. Confira o cadastro e tente novamente."}</p><Button size="sm" onClick={()=>setReload(value=>value+1)}>Tentar novamente</Button></div>
      ) : (
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          {discardGuard.isPending&&<UnsavedChangesNotice onKeep={discardGuard.keepEditing} onDiscard={discardGuard.discard} disabled={saving}/>}
          {data.invalid.size>0&&<p role="status">{data.invalidContainer?"Dados complementares incompatíveis: precisam de revisão técnica e serão preservados. Nome continua editável.":"Alguns dados têm formato incompatível. Campos não editados serão preservados ao salvar."}</p>}
          {editing && noteConflict && <ContactNoteConflict disabled={discardGuard.isPending} current={currentNote} loading={noteLoading} onRefresh={refreshConflictingNote} onChoose={chooseConflictingNote}/>}
          {error && <div role="alert" style={{ padding: 10, color: "var(--color-danger)", background: "var(--color-danger-subtle)", borderRadius: 8 }}>{error}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar id={thread.contactId} name={contact?.name || thread.contactName || undefined} size="lg"/>
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{contact?.name || thread.contactName || "Contato sem nome"}</div>
              <div style={{ color: "var(--text-secondary)", margin: "3px 0 7px" }}>{formatPhone(thread.contactPhone)}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Badge variant={thread.status === "waiting_human" ? "warning" : thread.status === "closed" ? "neutral" : "operational"}>
                  {Object.prototype.hasOwnProperty.call(statusLabel,thread.status)?statusLabel[thread.status]:"Estado não reconhecido"}
                </Badge>
                {isRec ? (
                  <Badge variant="action">⭐ Cliente Recorrente</Badge>
                ) : (
                  <Badge variant="neutral">Sem indicação de recorrência</Badge>
                )}
                {contact?.optOut && <Badge variant="neutral">Mensagens comerciais bloqueadas</Badge>}
              </div>
            </div>
          </div>

          {contact.optOut&&<p role="status" style={{fontSize:12,color:"var(--text-secondary)"}}>Campanhas e acompanhamentos comerciais estão bloqueados neste cadastro. Novas solicitações do cliente e avisos necessários de pedidos continuam sujeitos às regras do canal.</p>}

          {editing ? (
            <fieldset disabled={saving||discardGuard.isPending} style={{border:0,margin:0,padding:0,minWidth:0,display: "flex", flexDirection: "column", gap: 14 }}>
              <Input ref={nameRef} label="Nome do cliente" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/>
              <Input label="Empresa" value={form.company} onChange={(event) => editMetadata("company",event.target.value)}/>
              <Input label="E-mail" type="email" value={form.email} onChange={(event) => editMetadata("email",event.target.value)}/>
              <Input label="Etiquetas (separadas por vírgula)" value={form.tags} onChange={(event) => editMetadata("tags",event.target.value)}/>
              
              {/* Seção de Recorrência & LTV */}
              <div style={{ padding: 12, border: "1px solid var(--border-default)", borderRadius: 8, backgroundColor: "var(--bg-canvas)", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>
                  <Sparkles size={15} style={{ color: "var(--color-action)" }} />
                  Inteligência de Compras & Recorrência
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={form.isRecurring}
                    disabled={data.invalidContainer} onChange={(e) => {recurrenceEdited.current=true;setForm({ ...form, isRecurring: e.target.checked });}}
                    style={{ width: 16, height: 16, accentColor: "var(--color-action)" }}
                  />
                  <span><strong>Indicação manual de recorrência</strong></span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input
                    label="Compras informadas (opcional)"
                    disabled={data.invalidContainer}
                    type="number"
                    value={form.totalOrders}
                    onChange={(e) => setForm({ ...form, totalOrders: e.target.value })}
                    placeholder="Ex: 2"
                  />
                  <Input
                    label="Gasto acumulado informado (R$, opcional)"
                    disabled={data.invalidContainer}
                    value={form.totalSpentReais}
                    onChange={(e) => setForm({ ...form, totalSpentReais: e.target.value })}
                    placeholder="Ex: 150,00"
                  />
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                  Deixe os campos de histórico vazios para preservar o dado atual sem registrar zero. Estes valores não comprovam pagamentos nem ativam o envio de conversões à Meta.
                </div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, fontWeight: 600 }}>Observações
                <textarea disabled={data.invalidContainer} value={form.notes} onChange={(event) => editMetadata("notes",event.target.value)} rows={5}
                  style={{ resize: "vertical", padding: 12, border: "1px solid var(--border-default)", borderRadius: 8, font: "inherit", fontWeight: 400, background: "var(--bg-surface)", color: "var(--text-primary)" }}/>
              </label>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>O número do WhatsApp é protegido nesta ficha para preservar o vínculo com a conversa.</div>
            </fieldset>
          ) : (
            <>
              {/* Card de Inteligência de Recorrência & LTV */}
              <section style={{ padding: 14, background: "var(--bg-surface-elevated)", borderRadius: 10, border: "1px solid var(--border-default)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
                    <Sparkles size={16} style={{ color: "var(--color-action)" }}/> Histórico informado
                  </div>
                  {isRec ? <Badge variant="action">⭐ Recorrência informada</Badge> : <Badge variant="neutral">Sem indicação de recorrência</Badge>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                  <div>Compras informadas: <strong>{totalOrders===null?"Não informado":totalOrders.toLocaleString("pt-BR")}</strong></div>
                  <div>Gasto acumulado informado: <strong>{totalSpentCents===null?"Não informado":(totalSpentCents/100).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong></div>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
                  Dados de histórico informados no cadastro; não substituem confirmações de pagamento.
                </div>
              </section>

              <section style={{ border: "1px solid var(--border-default)", borderRadius: 10, overflow: "hidden" }}>
                <Info icon={<Building2 size={16}/>} label="Empresa" value={data.invalid.has("company")?"Dado precisa de revisão":data.company}/>
                <Info icon={<Mail size={16}/>} label="E-mail" value={data.invalid.has("email")?"Dado precisa de revisão":data.email}/>
                <Info icon={<Phone size={16}/>} label="WhatsApp" value={formatPhone(thread.contactPhone)}/>
                <Info icon={<MessageCircle size={16}/>} label="Canal" value={thread.channelName || thread.channelProvider}/>
                <Info icon={<Tag size={16}/>} label="Etiquetas" value={data.invalid.has("tags")?"Dado precisa de revisão":data.tags.join(", ")}/>
              </section>
              <section style={{ padding: 14, background: "var(--bg-surface-elevated)", borderRadius: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600, marginBottom: 8 }}><StickyNote size={16}/> Observações do cliente</div>
                <div style={{ color: meta.notes ? "var(--text-primary)" : "var(--text-secondary)", whiteSpace: "pre-wrap", fontSize: 13 }}>{data.invalid.has("notes")?"Dado precisa de revisão":data.notes || "Nenhuma observação cadastrada."}</div>
              </section>
              <section style={{ padding: 14, border: "1px solid var(--border-default)", borderRadius: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 5 }}>Última interação</div>
                <div style={{ fontSize: 13, marginBottom: 5 }}>{thread.lastMessage?.body || "Nenhuma mensagem disponível"}</div>
                <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{thread.lastMessage ? `${thread.lastMessage.direction === "inbound" ? "Recebida" : "Enviada"} em ${new Date(thread.lastMessage.createdAt).toLocaleString("pt-BR")}` : ""}</div>
              </section>
              {workspaceId&&token&&<CommercialTasks key={`${workspaceId}:${thread.id}`} workspaceId={workspaceId} threadId={thread.id} token={token}/>}

              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Conversa iniciada em {new Date(thread.createdAt).toLocaleString("pt-BR")}</div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
};

const Info: FC<{ icon: ReactNode; label: string; value?: string }> = ({ icon, label, value }) => (
  <div style={{ display: "grid", gridTemplateColumns: "22px 95px 1fr", gap: 8, padding: "11px 12px", borderBottom: "1px solid var(--border-subtle)", alignItems: "center", fontSize: 13 }}>
    <span style={{ color: "var(--text-secondary)" }}>{icon}</span>
    <span style={{ color: "var(--text-secondary)" }}>{label}</span>
    <span style={{ fontWeight: 500, overflowWrap: "anywhere" }}>{value || "Não informado"}</span>
  </div>
);
