import {readGuidedRecord} from './guided-record';
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { guidedChecks, guidedScenarios, guidedLabels, guidedFunctions, initialGuidedDraft, type GuidedDraft, type GuidedRecord } from "@sos-sales/contracts";
import {userFacingError} from "../../utils/user-facing-error";
import { apiClient, ApiError } from "../../services/api-client";
const panel: CSSProperties = { border: "1px solid var(--border-default)", borderRadius: 12, padding: 20, background: "var(--bg-surface)", display: "grid", gap: 14 };
const input: CSSProperties = { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-canvas)", color: "var(--text-primary)", font: "inherit" };
const button: CSSProperties = { ...input, width: "auto", cursor: "pointer" };
const objectives = { support: "Tirar dúvidas", qualify: "Qualificar contatos", sell: "Vender", schedule: "Agendar" } as const;
const steps = ["Objetivo", "Conhecimento", "Limites", "Revisão", "Cenários"];
function DraftSummary({draft}:{draft:GuidedDraft}){
  return <div style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>
    <p><strong>Empresa:</strong> {draft.company||"Não informada"}</p>
    <p><strong>Objetivo:</strong> {objectives[draft.objective]} • {draft.mode==="assist"?"Assistência ao atendente":"Atendimento automático após validação"}</p>
    <p><strong>Funções:</strong> {draft.functions.map(key=>guidedLabels[key]).join(", ")||"Atendimento informativo"}</p>
    <p><strong>Informações confirmadas:</strong> {draft.facts||"Não informadas"}</p>
    <p><strong>Qualificação:</strong> {draft.qualification||"Não definida"}</p>
    <p><strong>Encaminhamento:</strong> {draft.handoff||"Não definido"}</p>
    {draft.customCases.map(item=><p key={item.id}><strong>Caso próprio:</strong> {item.question}<br/>Esperado: {item.expected}</p>)}
  </div>;
}
export function GuidedAgentSetup({ workspaceId, token,operationalRevision=0,operationalDirty=false,onPrepared,onLoaded,onUnsavedChange,onBusyChange,interactionLocked=false }: { workspaceId?: string; token?: string;operationalRevision?:number;operationalDirty?:boolean;onPrepared?:()=>void;onLoaded?:()=>void;onUnsavedChange?:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void;interactionLocked?:boolean }) {
  const [draft, setDraft] = useState<GuidedDraft>({ ...initialGuidedDraft });
  const [plan, setPlan] = useState<GuidedRecord | null>(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [customQuestion, setCustomQuestion] = useState("");
  const [customExpected, setCustomExpected] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState("");
  const generation = useRef(0);
  const scope = useRef(""); scope.current=`${workspaceId ?? ""}:${token ?? ""}`;
  const operation = useRef<symbol|null>(null);
  const rehearsal = useRef<symbol|null>(null);
  const [reload,setReload]=useState(0);
  const [loadedScope,setLoadedScope]=useState<string|null>(null);
  const [loadError,setLoadError]=useState("");
  const [conflict,setConflict]=useState(false);
  const [comparison,setComparison]=useState<GuidedRecord|null>(null);
  const [comparisonLoaded,setComparisonLoaded]=useState(false);
  const [comparing,setComparing]=useState(false);
  const comparisonRequest=useRef<symbol|null>(null);
  const dirty = !plan || JSON.stringify(draft) !== JSON.stringify(plan.draft);
  const noteChanged=(id:string)=>(notes[id]??"").trim()!==(plan?.reviews[id]??"").trim();
  const localUnsaved=loadedScope===scope.current&&!loading&&(JSON.stringify(draft)!==JSON.stringify(plan?.draft??initialGuidedDraft)||Object.keys(notes).some(noteChanged)||Boolean(customQuestion.trim()||customExpected.trim()||chatInput.trim()));
  useEffect(()=>{onUnsavedChange?.(localUnsaved);},[localUnsaved,onUnsavedChange]);
  useEffect(()=>{onBusyChange?.(busy||chatBusy||comparing);},[busy,chatBusy,comparing,onBusyChange]);
  useEffect(()=>()=>{onUnsavedChange?.(false);onBusyChange?.(false);},[onUnsavedChange,onBusyChange]);
  useEffect(() => {
    const gen = ++generation.current; const requestedScope=scope.current;
    operation.current=null;rehearsal.current=null;comparisonRequest.current=null;setLoadedScope(null);setLoadError("");setConflict(false);setComparison(null);setComparisonLoaded(false);setComparing(false);setCustomQuestion("");setCustomExpected("");setChatInput("");
    setLoading(true); setBusy(false); setError(""); setPlan(null); setDraft({ ...initialGuidedDraft }); setNotes({}); setAcknowledged(false); setStep(0); setNotice(""); setChat([]); setChatError(""); setChatBusy(false);
    if (!workspaceId || !token) { setLoading(false); return; }
    apiClient.getGuidedPlan(workspaceId, { token }).then(({ plan: loaded }) => {
      if (generation.current !== gen || requestedScope!==scope.current) return;
      const confirmed=readGuidedRecord(loaded);setLoadedScope(requestedScope);setPlan(confirmed); setDraft(confirmed?.draft ?? { ...initialGuidedDraft }); setNotes(confirmed?.reviews ?? {});
    }).catch(e => { if (generation.current === gen && requestedScope===scope.current) setLoadError(userFacingError(e,"Não foi possível carregar o plano.")); })
      .finally(() => { if (generation.current === gen && requestedScope===scope.current){setLoading(false);onLoaded?.();} });
    return () => { generation.current++; };
  }, [workspaceId, token,reload]);
  function update(patch: Partial<GuidedDraft>) { setDraft(d => ({ ...d, ...patch })); setNotice(""); setAcknowledged(false); setChat([]); setChatError(""); }
  async function perform(execute: () => Promise<{ plan: GuidedRecord }>, message: string, resetNotes = false) {
    if(interactionLocked||operation.current||rehearsal.current||loadedScope!==scope.current||!workspaceId||!token||conflict)return;
    const id=Symbol();operation.current=id;
    const gen = generation.current, requestedScope=scope.current;
    setBusy(true); setError(""); setNotice("");
    try { const { plan: result } = await execute(); if (generation.current !== gen || requestedScope!==scope.current) return; const confirmed=readGuidedRecord(result);if(!confirmed)throw new Error("A operação não retornou o plano salvo. Consulte o estado atual antes de repetir.");setPlan(confirmed); if (resetNotes) { setNotes(confirmed.reviews); setDraft(confirmed.draft); } setNotice(message); }
    catch (e) { if (generation.current === gen && requestedScope===scope.current) {setError(userFacingError(e,"Não foi possível concluir. Seu texto foi preservado."));if(e instanceof ApiError&&e.status===409){setConflict(true);setAcknowledged(false);}} }
    finally { if(operation.current===id){operation.current=null;if(generation.current===gen&&requestedScope===scope.current)setBusy(false);} }
  }
  async function rehearse() {
    if (interactionLocked || !workspaceId || !token || !chatInput.trim() || rehearsal.current || operation.current || dirty || conflict || loadedScope!==scope.current || chat.length>=16) return;
    const gen = generation.current, requestedScope=scope.current;
    const id=Symbol();rehearsal.current=id;
    const message = chatInput.trim();
    setChatBusy(true); setChatError("");
    try {
      const result = await apiClient.simulateAiAgent(workspaceId, {
        message, history: chat,
        draftConfig: {
          name: draft.company, personality: "cordial_comercial", strictMode: true, temperature: 0.1,
          systemPrompt: `Você atende ${draft.company}. Objetivo: ${objectives[draft.objective]}. Use somente fatos confirmados abaixo. Se faltar informação, explique e encaminhe. Pedido humano pausa atendimento. Comprovante não confirma pagamento. Não afirme execução de cobrança, reserva ou integração neste simulador. Não conceda exceções sem autorização.\nFatos: ${draft.facts}\nCritérios: ${draft.qualification}\nEncaminhamento: ${draft.handoff}`,
          skills: { qualify_lead: draft.functions.includes("qualify"), catalog_offers: draft.functions.includes("catalog"), pix_charges: false, appointments: false, capi_tracking: false },
          businessRules: { companyName: draft.company, generalRules: "Simulação textual. Não executar nem alegar ações externas." }, faq: [],
        },
      }, { token });
      if (generation.current !== gen || requestedScope!==scope.current) return;
      setChat(previous => [...previous, { role: "user", content: message }, { role: "assistant", content: result.replyText }]);
      setChatInput("");
    } catch (e) { if (generation.current === gen && requestedScope===scope.current) setChatError(userFacingError(e,"Não foi possível ensaiar a mensagem.")); }
    finally { if(rehearsal.current===id){rehearsal.current=null;if(generation.current===gen&&requestedScope===scope.current)setChatBusy(false);} }
  }
  async function compareCurrent(){
    if(interactionLocked||comparisonRequest.current||!workspaceId||!token||!conflict)return;
    const gen=generation.current,requestedScope=scope.current;
    const id=Symbol();comparisonRequest.current=id;setComparing(true);setComparisonLoaded(false);setError("");
    try{const result=await apiClient.getGuidedPlan(workspaceId,{token});if(gen!==generation.current||requestedScope!==scope.current)return;setComparison(readGuidedRecord(result.plan));setComparisonLoaded(true);}
    catch(e){if(gen===generation.current&&requestedScope===scope.current)setError(userFacingError(e,"Não foi possível consultar a versão atual."));}
    finally{if(comparisonRequest.current===id){comparisonRequest.current=null;if(gen===generation.current&&requestedScope===scope.current)setComparing(false);}}
  }
  function resolveConflict(useCurrent:boolean){
    if(interactionLocked||comparisonRequest.current||comparing||!comparisonLoaded||!conflict)return;
    setPlan(comparison);setNotes(comparison?.reviews??{});
    if(useCurrent)setDraft(comparison?.draft??{...initialGuidedDraft});
    setConflict(false);setComparison(null);setComparisonLoaded(false);setError("");setAcknowledged(false);setChat([]);setChatError("");
    setNotice(useCurrent?"Versão salva carregada.":"Seu rascunho foi mantido. Confira as diferenças antes de salvar uma nova revisão.");
  }
  async function prepareOperationalDraft(){
    if(interactionLocked||!workspaceId||!token||!plan||dirty||plan.approvedRevision!==plan.revision||operationalDirty||operation.current||rehearsal.current)return;
    const id=Symbol();operation.current=id;const gen=generation.current,requestedScope=scope.current;setBusy(true);setError("");setNotice("");
    try{
      const result=await apiClient.prepareAiAgentFromGuided(workspaceId,{expectedRevision:operationalRevision,expectedGuidedRevision:plan.revision},{token});
      if(gen!==generation.current||requestedScope!==scope.current)return;
      setNotice(`Rascunho operacional revisão ${result.version.draftRevision} preparado. O atendimento em uso foi preservado.`);onPrepared?.();
    }catch(error){if(gen===generation.current&&requestedScope===scope.current)setError(userFacingError(error,"Não foi possível preparar o rascunho operacional. Atualize a configuração antes de tentar novamente."));}
    finally{if(operation.current===id){operation.current=null;if(gen===generation.current&&requestedScope===scope.current)setBusy(false);}}
  }
  const checks = guidedChecks(draft);
  const scenarios = guidedScenarios(draft);
  const canApprove = !dirty && checks.every(c => c.passed) && scenarios.every(s => Boolean(plan?.reviews[s.id]?.trim())) && acknowledged;
  if(loadError)return <section style={panel} aria-label="Construção guiada da IA"><p role="alert">{loadError}</p><button type="button" style={button} onClick={()=>setReload(value=>value+1)}>Tentar carregar plano novamente</button></section>;
  if (loading || (workspaceId&&token&&loadedScope!==scope.current)) return <section style={panel} aria-busy="true">Carregando construção guiada…</section>;
  return <section style={panel} aria-label="Construção guiada da IA">
    <header><h3 style={{ margin: 0 }}>Construa seu atendimento por etapas</h3><p>Defina o trabalho da IA, confira o entendimento e prepare os testes.</p>
      <strong>{!dirty && plan?.approvedRevision === plan?.revision && plan ? "Plano aprovado para teste assistido" : "Rascunho • modo de teste"}</strong>
      <p>Este MVP prepara o plano e revisa cenários. Não ativa o atendimento, não envia mensagens e não executa cobranças ou integrações.</p>
    </header>
    {!workspaceId || !token ? <p role="alert">Selecione uma empresa e entre na conta para salvar.</p> : null}
    {error && <p role="alert">{error} Seu rascunho continua na tela.</p>}
    {notice && <p role="status">{notice}</p>}
    {conflict&&<aside aria-label="Conflito de versão" style={panel}>
      <p>Outra alteração foi salva. Compare antes de decidir qual versão manter.</p>
      <button type="button" style={button} disabled={comparing} onClick={()=>void compareCurrent()}>{comparing?"Consultando…":"Consultar versão salva"}</button>
      {comparisonLoaded&&<><h4>Versão salva — revisão {comparison?.revision??0}</h4><DraftSummary draft={comparison?.draft??initialGuidedDraft}/><h4>Seu rascunho</h4><DraftSummary draft={draft}/><button type="button" style={button} onClick={()=>resolveConflict(true)}>Usar versão salva</button><button type="button" style={button} onClick={()=>resolveConflict(false)}>Manter meu rascunho para revisar</button></>}
    </aside>}
    <nav aria-label="Etapas da configuração" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{steps.map((label, i) => <button type="button" style={button} key={label} aria-current={step === i ? "step" : undefined} onClick={() => setStep(i)}>{i + 1}. {label}</button>)}</nav>
    <fieldset disabled={interactionLocked || busy || chatBusy || conflict || !workspaceId || !token} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: 14 }}>
    {step === 0 && <>
      <label>Qual é a empresa?<input style={input} maxLength={200} value={draft.company} onChange={e => update({ company: e.target.value })} /></label>
      <label>Qual é o objetivo principal?<select style={input} value={draft.objective} onChange={e => update({ objective: e.target.value as GuidedDraft["objective"] })}>{Object.entries(objectives).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Como deseja atender depois dos testes?<select style={input} value={draft.mode} onChange={e => update({ mode: e.target.value as GuidedDraft["mode"] })}><option value="assist">Sugerir respostas ao atendente</option><option value="automatic">Atendimento automático após validação e liberação futura</option></select></label>
      <fieldset><legend>Quais funções pretende usar?</legend>{guidedFunctions.map(key => <label key={key} style={{ display: "block", padding: 6 }}><input type="checkbox" checked={draft.functions.includes(key)} onChange={e => update({ functions: e.target.checked ? [...draft.functions, key] : draft.functions.filter(k => k !== key) })} /> {guidedLabels[key]}</label>)}</fieldset>
      <p>Escolher uma função adiciona os cenários correspondentes. Não conecta serviços nem concede permissão de execução.</p>
    </>}
    {step === 1 && <>
      <label>O que a empresa confirma que a IA pode informar?<textarea rows={6} style={input} maxLength={2000} placeholder="Serviços, horários e condições confirmadas. Não inclua senhas ou dados sensíveis." value={draft.facts} onChange={e => update({ facts: e.target.value })} /></label>
      {(draft.functions.includes("qualify") || draft.objective === "qualify") && <label>Quais critérios tornam um contato qualificado?<textarea rows={4} style={input} maxLength={1000} value={draft.qualification} onChange={e => update({ qualification: e.target.value })} /></label>}
      <p>Informação ausente não será inventada. Nesta versão, preencha manualmente; importação com revisão faz parte da evolução.</p>
    </>}
    {step === 2 && <>
      <label>Para qual equipe ou responsável encaminhar quando precisar de uma pessoa?<textarea rows={3} style={input} maxLength={500} placeholder="Ex.: equipe comercial, mantendo o pedido na fila fora do expediente." value={draft.handoff} onChange={e => update({ handoff: e.target.value })} /></label>
      <ul><li>Sem informação válida: esclarecer e encaminhar, sem inventar condições.</li><li>Na fila humana: preservar mensagens e não retomar sozinho.</li><li>Comprovante não confirma pagamento.</li><li>Estoque e agenda dependem de consulta válida; consulta não é reserva.</li><li>Exceção comercial exige autorização; aprovação do plano não executa ações.</li></ul>
    </>}
    {step === 3 && <>
      <h4>Confira o entendimento</h4><DraftSummary draft={draft}/>
      <ul>{checks.map(c => <li key={c.id}>{c.passed ? "✓" : "Pendente:"} {c.label}</li>)}</ul>
      <p>Volte à etapa correspondente para corrigir. Salvar uma alteração cria outra revisão e exige revisar os cenários novamente.</p>
    </>}
    {step === 4 && <>
      <h4>Revisão dos cenários do plano</h4><p>Confira os comportamentos esperados e registre sua avaliação. Isto revisa a especificação; não é uma resposta gerada por modelo nem comprovação de ações executadas.</p>
      <details><summary>Ensaiar conversa com o modelo configurado</summary>
        <p>Simulação textual com provedor configurado, que pode consumir créditos. Não executa ações. Sem credencial válida, o ensaio ficará indisponível. Aprovar o plano não aprova o modelo para produção.</p>
        <div aria-label="Histórico do ensaio">{chat.map((m, i) => <p key={i} style={{ whiteSpace: "pre-wrap" }}><strong>{m.role === "user" ? "Cliente" : "IA"}:</strong> {m.content}</p>)}</div>
        <label>Mensagem de teste<textarea style={input} maxLength={2000} value={chatInput} onChange={e => setChatInput(e.target.value)} /></label>
        <button style={button} type="button" disabled={dirty || !chatInput.trim() || chatBusy || chat.length >= 16 || !workspaceId || !token} onClick={() => void rehearse()}>Ensaiar mensagem</button>
        <button style={button} type="button" disabled={chatBusy} onClick={() => { setChat([]); setChatError(""); setChatInput(""); }}>Reiniciar ensaio</button>
        {chatBusy && <p role="status">Aguardando o modelo…</p>}
        {chatError && <p role="alert">Ensaio não concluído: {chatError} Mensagem preservada para nova tentativa.</p>}
        {chat.length >= 16 && <p>Limite de 8 turnos. Reinicie o ensaio para testar outra situação.</p>}
      </details>
      {dirty && <p role="status">Salve o rascunho antes de registrar as revisões.</p>}
      {scenarios.map(s => <article key={s.id} style={panel}><strong>{s.title}</strong><p>Cliente: {s.question}</p><p>Esperado: {s.expected}</p>
        {draft.customCases.some(c => c.id === s.id) && <button style={button} type="button" onClick={() => update({ customCases: draft.customCases.filter(c => c.id !== s.id) })}>Remover caso próprio</button>}
        <label>Avaliação deste cenário (mínimo 10 caracteres)<textarea style={input} rows={2} maxLength={1000} value={notes[s.id] ?? ""} onChange={e => { setNotes(n => ({ ...n, [s.id]: e.target.value })); setAcknowledged(false); }} /></label>
        <button type="button" style={button} disabled={dirty || !workspaceId || !token || (notes[s.id]?.trim().length ?? 0) < 10} onClick={() => void perform(() => apiClient.reviewGuidedPlan(workspaceId!, { expectedRevision: plan!.revision, scenarioId: s.id, note: notes[s.id]!.trim() }, { token }), "Revisão registrada nesta versão.")}>Registrar revisão: {s.title}</button>
        {plan?.reviews[s.id] && <span>{dirty?"Revisão da versão salva; este rascunho precisa de nova revisão.":`Revisão registrada${noteChanged(s.id) ? " • texto alterado, registre novamente" : ""}`}</span>}
      </article>)}
      <details><summary>Adicionar caso próprio (até 5)</summary><label>Pergunta do cliente<input style={input} maxLength={500} value={customQuestion} onChange={e => setCustomQuestion(e.target.value)} /></label><label>Comportamento esperado<textarea style={input} maxLength={1000} value={customExpected} onChange={e => setCustomExpected(e.target.value)} /></label><button style={button} type="button" disabled={draft.customCases.length >= 5 || !customQuestion.trim() || !customExpected.trim()} onClick={() => { update({ customCases: [...draft.customCases, { id: crypto.randomUUID(), question: customQuestion.trim(), expected: customExpected.trim() }] }); setCustomQuestion(""); setCustomExpected(""); }}>Adicionar cenário</button></details>
      <label><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} /> Revisei este plano e entendo que a aprovação é para teste assistido, sem ativar a IA ou comprovar execução real.</label>
      <button style={button} type="button" disabled={!canApprove || scenarios.some(s => noteChanged(s.id))} onClick={() => void perform(() => apiClient.approveGuidedPlan(workspaceId!, plan!.revision, { token }), "Plano aprovado para teste assistido. Atendimento ativo permanece inalterado.")}>Aprovar plano para teste assistido</button>
    </>}
    {step===4&&plan?.approvedRevision===plan?.revision&&plan&&!dirty&&<aside style={panel} aria-label="Preparar rascunho operacional">
      <h4>Levar este plano para o rascunho da IA</h4><p>Cria uma nova revisão operacional com as informações e funções deste plano. Mantém provedor e modelo configurados e preserva as revisões anteriores. O atendimento em uso não é alterado. Os testes e a liberação operacional são etapas separadas.</p>
      {operationalDirty&&<p role="status">Há alterações no formulário operacional. Salve esse rascunho antes de preparar uma revisão a partir do plano.</p>}
      <button type="button" style={button} disabled={operationalDirty||!onPrepared} onClick={()=>void prepareOperationalDraft()}>Preparar rascunho operacional</button>
    </aside>}
    <footer style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <button style={button} type="button" disabled={step === 0} onClick={() => setStep(s => s - 1)}>Voltar</button>
      {step < 4 && <button style={button} type="button" onClick={() => setStep(s => s + 1)}>Continuar</button>}
      <button style={button} type="button" disabled={!dirty || !workspaceId || !token} onClick={() => void perform(() => apiClient.saveGuidedPlan(workspaceId!, { expectedRevision: plan?.revision ?? 0, draft }, { token }), "Rascunho salvo no servidor. Revisões anteriores foram invalidadas.", true)}>Salvar rascunho</button>
      <span>{busy ? "Processando…" : dirty ? "Alterações ainda não salvas" : `Revisão ${plan?.revision} salva`}</span>
    </footer></fieldset>
  </section>;
}
