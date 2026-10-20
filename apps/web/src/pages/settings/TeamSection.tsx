import {UnsavedChangesNotice,useDiscardChanges} from "../UnsavedChangesNotice";
import { TeamRolePreview } from "./TeamRolePreview";
import {hasWorkspacePermission} from "@sos-sales/contracts";
import { useState, useEffect, useCallback, useRef, type FC, type FormEvent } from "react";
import { Button, Input, Alert, Dialog } from "@sos-sales/ui";
import { UserPlus, Shield, UserX, Copy, Check, Users } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";
import { apiClient, type WorkspaceMember } from "../../services/api-client";
import { TeamReassignmentQueue } from "./TeamReassignmentQueue";
import { userFacingError } from "../../utils/user-facing-error";

const validateMembers=(value:unknown)=>{
 if(!Array.isArray(value))throw new Error("A consulta não confirmou uma lista válida de integrantes. Tente consultar novamente.");
 const memberships=new Set<string>(),users=new Set<string>();
 for(const row of value){
  if(!row||typeof row!=="object"||Array.isArray(row)||typeof row.id!=="string"||!row.id.trim()||memberships.has(row.id)
   ||typeof row.userId!=="string"||!row.userId.trim()||users.has(row.userId)
   ||typeof row.name!=="string"||typeof row.email!=="string"||!["owner","admin","manager","operator"].includes(row.role))throw new Error("A consulta retornou um integrante incompatível. Atualize a equipe; os registros anteriores foram preservados.");
  memberships.add(row.id);users.add(row.userId);
 }
};

export const TeamSection: FC<{ session: UseSessionReturn }> = ({ session }) => {
  const { activeWorkspace, token, user } = session;

  const [reassignmentReload,setReassignmentReload]=useState(0);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersConfirmed,setMembersConfirmed]=useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "manager" | "operator">("operator");
  const [newPassword, setNewPassword] = useState("");
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; pass: string|null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyPending,setCopyPending]=useState(false),[copyError,setCopyError]=useState("");
  const copyGeneration=useRef(0),copyBusy=useRef(false),copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>{copyGeneration.current++;copyBusy.current=false;clearTimeout(copyTimer.current);setCopied(false);setCopyPending(false);setCopyError("");return()=>{copyGeneration.current++;clearTimeout(copyTimer.current);};},[createdCredentials,isAddModalOpen,activeWorkspace?.id,token]);


  // Workspace role editor; account passwords are managed separately.
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [editRole, setEditRole] = useState<"admin" | "manager" | "operator">("operator");
  const [removalTarget,setRemovalTarget]=useState<WorkspaceMember|null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const scope = useRef("");scope.current=`${activeWorkspace?.id ?? ""}:${token ?? ""}`;
  const sequence = useRef(0);
  const epoch=useRef(0);
  const mutation=useRef<string|null>(null);
  const viewerRole=members.find(member=>member.userId===user?.id)?.role??activeWorkspace?.role;
  const canManage=hasWorkspacePermission(viewerRole,'workspace:manage');
  const canView=hasWorkspacePermission(activeWorkspace?.role,'workspace:view');
  const addNameRef=useRef<HTMLInputElement>(null),editRoleRef=useRef<HTMLSelectElement>(null);
  const addDiscard=useDiscardChanges(isAddModalOpen&&!createdCredentials&&Boolean(newName.trim()||newEmail.trim()||newPassword||newRole!=="operator"),`${scope.current}:${viewerRole}:add:${isAddModalOpen}`,()=>addNameRef.current,isAddModalOpen);
  const editDiscard=useDiscardChanges(Boolean(editingMember&&editRole!==editingMember.role),`${scope.current}:${viewerRole}:edit:${editingMember?.userId}`,()=>editRoleRef.current,Boolean(editingMember));
  const closeAdd = () => { if (!mutation.current&&!isSubmittingAdd) addDiscard.requestExit(()=>{setIsAddModalOpen(false);setCreatedCredentials(null);setCopied(false);setNewName("");setNewEmail("");setNewRole("operator");setNewPassword("");setErrorMsg(null);}); };
  const closeEdit = () => { if (!mutation.current&&!isSubmittingEdit) editDiscard.requestExit(()=>{setEditingMember(null);setErrorMsg(null);}); };

  const loadMembers = useCallback(async () => {
    if (!activeWorkspace || !token || !canView) return;
    const requestedScope=scope.current,requestedEpoch=epoch.current,request=++sequence.current;
    setMembersConfirmed(false);setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiClient.getWorkspaceMembers(activeWorkspace.id, { token });
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&request===sequence.current){validateMembers(res?.members);setMembers(res.members);setMembersConfirmed(true);}
    } catch (err: unknown) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&request===sequence.current)setErrorMsg(userFacingError(err,"Falha ao carregar equipe. Tente novamente."));
    } finally {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current&&request===sequence.current)setIsLoading(false);
    }
  },[activeWorkspace?.id,activeWorkspace?.role,token]);

  useEffect(() => {
    epoch.current++;mutation.current=null;setIsLoading(false);setIsSubmittingAdd(false);setIsSubmittingEdit(false);setRemovingId(null);setRemovalTarget(null);setMembersConfirmed(false);setMembers([]);setIsAddModalOpen(false);setEditingMember(null);setCreatedCredentials(null);setNewName("");setNewEmail("");setNewRole("operator");setNewPassword("");setSuccessMsg(null);setErrorMsg(null);setCopied(false);
    void loadMembers();
    return()=>{sequence.current++;epoch.current++;};
  }, [loadMembers]);

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (addDiscard.isPending || !activeWorkspace || !token || !canManage || !membersConfirmed || isLoading || mutation.current || isSubmittingAdd) return;
    const requestedScope=scope.current,requestedEpoch=epoch.current;

    if (!newName.trim() || !newEmail.trim()) {
      setErrorMsg("Preencha nome e e-mail.");
      return;
    }

    mutation.current="add";setIsSubmittingAdd(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.addWorkspaceMember(
        activeWorkspace.id,
        {
          name: newName.trim(),
          email: newEmail.trim(),
          role: newRole,
          password: newPassword || undefined,
        },
        { token }
      );
      if(requestedScope!==scope.current||requestedEpoch!==epoch.current)return;
      try{
        validateMembers([res?.member]);
        if(res.member.email.trim().toLowerCase()!==newEmail.trim().toLowerCase()||res.member.role!==newRole
          ||members.some(member=>member.id===res.member.id||member.userId===res.member.userId)
          ||typeof res.accountCreated!=="boolean"
          ||res.accountCreated&&(typeof res.initialPassword!=="string"||!res.initialPassword.trim())
          ||!res.accountCreated&&res.initialPassword!=null)throw new Error("O servidor não confirmou o cadastro e as credenciais esperadas. Feche esta revisão e consulte a equipe antes de repetir; o preenchimento foi preservado.");
      }catch(error){setMembersConfirmed(false);throw error;}
      const assignedPassword = res.initialPassword || null;
      setCopied(false);setCreatedCredentials({
        email: res.member.email,
        pass: assignedPassword,
      });

      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("operator");
      await loadMembers();
    } catch (err: unknown) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current)setErrorMsg(userFacingError(err,"Falha ao adicionar membro."));
    } finally {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current){mutation.current=null;setIsSubmittingAdd(false);}
    }
  };

  const handleUpdateMember = async (e: FormEvent) => {
    e.preventDefault();
    if (editDiscard.isPending || !activeWorkspace || !token || !canManage || !membersConfirmed || isLoading || mutation.current || !editingMember || editingMember.role==='owner' || editingMember.userId===user?.id || editRole===editingMember.role || isSubmittingEdit) return;
    const requestedScope=scope.current,requestedEpoch=epoch.current;

    mutation.current="edit";setIsSubmittingEdit(true);
    setErrorMsg(null);

    try {
      const result=await apiClient.updateWorkspaceMember(
        activeWorkspace.id,
        editingMember.userId,
        {
          role: editRole,
          expectedRole:editingMember.role,
        },
        { token }
      );
      if(requestedScope!==scope.current||requestedEpoch!==epoch.current)return;
      try{
        validateMembers([result?.member]);
        if(result.member.id!==editingMember.id||result.member.userId!==editingMember.userId||result.member.role!==editRole)throw new Error("O servidor não confirmou o integrante e o perfil solicitados. Feche esta revisão e atualize a equipe antes de repetir.");
      }catch(error){setMembersConfirmed(false);throw error;}
      setSuccessMsg(`Membro ${editingMember.name} atualizado com sucesso.`);
      setEditingMember(null);

      await loadMembers();
    } catch (err: unknown) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current)setErrorMsg(userFacingError(err,"Falha ao atualizar membro."));
    } finally {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current){mutation.current=null;setIsSubmittingEdit(false);}
    }
  };

  const handleRemoveMember = async (member: WorkspaceMember) => {
    if (!activeWorkspace || !token || !canManage || !membersConfirmed || isLoading || mutation.current || member.role==='owner' || member.userId===user?.id || removingId) return;
    const requestedScope=scope.current,requestedEpoch=epoch.current;

    setErrorMsg(null);
    mutation.current="remove";setRemovingId(member.userId);
    try {
      const result=await apiClient.removeWorkspaceMember(activeWorkspace.id, member.userId,member.role, { token });
      if(requestedScope!==scope.current||requestedEpoch!==epoch.current)return;
      if(result?.success!==true||(result.pendingReassignment!=null&&[result.pendingReassignment.tasks,result.pendingReassignment.opportunities].some(value=>typeof value!=="number"||!Number.isSafeInteger(value)||value<0))){setMembersConfirmed(false);throw new Error("O servidor não confirmou a remoção e as pendências. Feche esta revisão e atualize a equipe antes de repetir.");}
      setRemovalTarget(null);setReassignmentReload(value=>value+1);setSuccessMsg(`Acesso de ${member.name} removido. ${result.pendingReassignment?`${result.pendingReassignment.tasks} tarefa(s) e ${result.pendingReassignment.opportunities} oportunidade(s) abertas ficaram sem responsável para revisão.`:'Consulte as pendências sem responsável para revisar o trabalho aberto.'} Histórico preservado.`);
      await loadMembers();
    } catch (err: unknown) {
      if(requestedScope===scope.current&&requestedEpoch===epoch.current)setErrorMsg(userFacingError(err,"Falha ao remover membro."));
    } finally {if(requestedScope===scope.current&&requestedEpoch===epoch.current){mutation.current=null;setRemovingId(null);}}
  };

  const handleCopyCredentials = async () => {
    if (!createdCredentials||!isAddModalOpen||copyBusy.current) return;
    const requestedScope=scope.current,requestedEpoch=epoch.current,copyRequest=copyGeneration.current;
    const valid=()=>requestedScope===scope.current&&requestedEpoch===epoch.current&&copyRequest===copyGeneration.current;
    copyBusy.current=true;setCopyPending(true);setCopyError("");setCopied(false);clearTimeout(copyTimer.current);
    const text = `Acesso ao CHAT-SALES:\nEmpresa: ${activeWorkspace?.name}\nE-mail: ${createdCredentials.email}\n${createdCredentials.pass?`Senha inicial: ${createdCredentials.pass}\n`:`Use sua senha atual.\n`}Link: ${window.location.origin}`;
    try {await navigator.clipboard.writeText(text);if(!valid())return;setCopied(true);copyTimer.current=setTimeout(() => {if(valid())setCopied(false);}, 2500);}
    catch {if(valid()){setCopied(false);setCopyError("Não foi possível copiar. Selecione os dados exibidos e copie manualmente.");}}
    finally{if(valid()){copyBusy.current=false;setCopyPending(false);}}
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "owner":
        return { label: "Proprietário", bg: "rgba(245, 158, 11, 0.12)", color: "#d97706", border: "rgba(245, 158, 11, 0.3)" };
      case "admin":
        return { label: "Administrador", bg: "rgba(139, 92, 246, 0.12)", color: "#7c3aed", border: "rgba(139, 92, 246, 0.3)" };
      case "manager":
        return { label: "Gerente", bg: "rgba(59, 130, 246, 0.12)", color: "#2563eb", border: "rgba(59, 130, 246, 0.3)" };
      case "operator":
        return { label: "Operador", bg: "rgba(16, 185, 129, 0.12)", color: "#059669", border: "rgba(16, 185, 129, 0.3)" };
      default:
        return { label: role, bg: "rgba(107, 114, 128, 0.12)", color: "#4b5563", border: "rgba(107, 114, 128, 0.3)" };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header Card */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "16px",
          padding: "20px 24px",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl, 16px)",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "var(--font-size-lg, 1.125rem)",
              fontWeight: 600,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Users size={20} color="var(--color-action)" />
            Equipe & Usuários da Empresa
          </h2>
          <p
            style={{
              margin: "4px 0 0 0",
              fontSize: "var(--font-size-sm, 0.875rem)",
              color: "var(--text-secondary)",
            }}
          >
            Gerencie os operadores e administradores com acesso ao atendimento e disparos de{" "}
            <strong>{activeWorkspace?.name}</strong>.
          </p>
        </div>

        {canView&&<Button variant="secondary" disabled={isLoading||isSubmittingAdd||isSubmittingEdit||Boolean(removingId)} onClick={()=>void loadMembers()}>Atualizar equipe</Button>}
        {canManage&&<Button
          size="md"
          variant="primary"
          disabled={!membersConfirmed||isLoading||isSubmittingAdd||isSubmittingEdit||Boolean(removingId)}
          onClick={() => {
            if(!membersConfirmed||isLoading||mutation.current)return;
            setCreatedCredentials(null);setCopied(false);
            setErrorMsg(null);setSuccessMsg(null);
            setIsAddModalOpen(true);
          }}
          prefixIcon={<UserPlus size={16} />}
        >
          Adicionar Membro
        </Button>}
      </div>

      {canManage&&!membersConfirmed&&<p role="status">Confirme a lista da equipe antes de adicionar, alterar ou remover acessos. Use Atualizar equipe.</p>}
      {!canManage&&<Alert variant="info" title="Acessos protegidos">Somente proprietário e administradores podem adicionar, alterar ou remover acessos.{!canView?' Seu perfil não permite consultar a lista da equipe.':''}</Alert>}
      {errorMsg && (
        <Alert variant="danger" title="Erro">
          {errorMsg}
          <Button size="sm" onClick={()=>void loadMembers()} disabled={isLoading}>Atualizar equipe</Button>
        </Alert>
      )}

      {successMsg && (
        <Alert variant="success" title="Sucesso">
          {successMsg}
        </Alert>
      )}

      {canManage&&activeWorkspace&&token&&<TeamReassignmentQueue key={`${activeWorkspace.id}:${token}`} workspaceId={activeWorkspace.id} token={token} members={members} membersReady={membersConfirmed&&!isLoading} reloadKey={reassignmentReload}/>}

      {/* Members List Table / Cards */}
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl, 16px)",
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
            Carregando membros da empresa...
          </div>
        ) : !canView ? null : members.length === 0 && !errorMsg ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--text-secondary)" }}>
            Nenhum membro cadastrado nesta empresa.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {members.map((m, index) => {
              const roleMeta = getRoleLabel(m.role);
              const isSelf = m.userId === user?.id || m.email === user?.email;
              const isOwner = m.role === "owner";

              return (
                <div
                  key={m.id || m.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 24px",
                    borderBottom: index < members.length - 1 ? "1px solid var(--border-default)" : "none",
                    flexWrap: "wrap",
                    gap: "12px",
                  }}
                >
                  {/* Member Profile */}
                  <div style={{ display: "flex", alignItems: "center", gap: "14px",minWidth:0,maxWidth:"100%" }}>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-action)",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        textTransform: "uppercase",
                      }}
                    >
                      {m.name.slice(0, 2)}
                    </div>
                    <div style={{minWidth:0,overflowWrap:"anywhere"}}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px",flexWrap:"wrap" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                          {m.name}
                        </span>
                        {isSelf && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: "var(--bg-canvas)",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                            }}
                          >
                            Você
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: "0.825rem", color: "var(--text-secondary)" }}>
                        {m.email}
                      </div>
                    </div>
                  </div>

                  {/* Role Badge & Actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span
                      style={{
                        padding: "4px 10px",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        backgroundColor: roleMeta.bg,
                        color: roleMeta.color,
                        border: `1px solid ${roleMeta.border}`,
                      }}
                    >
                      {roleMeta.label}
                    </span>

                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {canManage&&!isOwner&&!isSelf&&<Button
                        size="sm"
                        variant="secondary"
                        disabled={!membersConfirmed||isLoading||isSubmittingAdd||isSubmittingEdit||Boolean(removingId)}
                        onClick={() => {
                          if(!membersConfirmed||isLoading||mutation.current)return;
                          setErrorMsg(null);setSuccessMsg(null);
                          setEditingMember(m);
                          setEditRole((m.role as any) === "owner" ? "admin" : (m.role as any));

                        }}
                        aria-label={`Alterar perfil de ${m.name}`}
                      >
                        Alterar perfil
                      </Button>}

                      {canManage&&!isOwner && !isSelf && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {if(!membersConfirmed||isLoading||mutation.current)return;setErrorMsg(null);setRemovalTarget(m);}}
                          disabled={!membersConfirmed||isLoading||isSubmittingAdd||isSubmittingEdit||Boolean(removingId)}
                          prefixIcon={<UserX size={14} color="var(--color-danger)" />}
                          style={{ color: "var(--color-danger)" }}
                        >
                          {removingId===m.userId ? "Removendo..." : "Remover"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog isOpen={Boolean(removalTarget)} onClose={()=>{if(!removingId)setRemovalTarget(null);}} title="Remover acesso à empresa" description="O histórico será preservado; pendências abertas precisarão de revisão.">
        {removalTarget&&<><p>Remover o acesso de <strong>{removalTarget.name}</strong> ({removalTarget.email}) a {activeWorkspace?.name}?</p><p>O acesso será bloqueado nas próximas solicitações. Tarefas e oportunidades abertas ficam sem responsável para a equipe revisar. A conta e o acesso a outras empresas são preservados.</p>{errorMsg&&<Alert variant="danger" title="Remoção de acesso não confirmada">{errorMsg}</Alert>}<div style={{display:'flex',gap:12,flexWrap:'wrap'}}><Button disabled={Boolean(removingId)} onClick={()=>setRemovalTarget(null)}>Cancelar</Button><Button disabled={!membersConfirmed||isLoading||isSubmittingAdd||isSubmittingEdit||Boolean(removingId)} onClick={()=>void handleRemoveMember(removalTarget)}>{removingId?'Removendo acesso…':'Confirmar remoção do acesso'}</Button></div></>}
      </Dialog>
      {/* MODAL: Adicionar Membro */}
      <Dialog isOpen={isAddModalOpen} onClose={closeAdd} title="Novo Membro da Equipe" description="Defina o acesso do integrante a esta empresa.">
        {errorMsg && <Alert variant="danger" title="Não foi possível concluir">{errorMsg}</Alert>}
            {createdCredentials ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Alert variant="success" title="Membro Cadastrado com Sucesso!">
                  O integrante foi adicionado à empresa. Confira abaixo como ele deverá acessar.
                </Alert>

                <div
                  style={{
                    backgroundColor: "var(--bg-canvas)",
                    padding: "14px",
                    borderRadius: "8px",
                    border: "1px solid var(--border-default)",
                    fontSize: "0.875rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div>
                    <strong>E-mail:</strong> {createdCredentials.email}
                  </div>
                  {createdCredentials.pass?<div>
                    <strong>Senha Inicial:</strong>{" "}
                    <code style={{ backgroundColor: "rgba(0,0,0,0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                      {createdCredentials.pass}
                    </code>
                  </div>:<p>Conta existente: a senha atual foi preservada. Nenhuma nova senha foi gerada.</p>}
                  <div>
                    <strong>Empresa:</strong> {activeWorkspace?.name}
                  </div>
                </div>

                <Button
                  size="md"
                  variant="primary"
                  onClick={handleCopyCredentials}
                  disabled={copyPending}
                  prefixIcon={copied ? <Check size={16} /> : <Copy size={16} />}
                >
                  {copyPending?"Copiando…":copied ? "Credenciais Copiadas!" : "Copiar Dados de Acesso"}
                </Button>
                {copied&&<p role="status">Dados de acesso copiados para a área de transferência.</p>}
                {copyError&&<p role="alert">{copyError}</p>}

                <Button
                  size="md"
                  variant="secondary"
                  onClick={closeAdd}
                >
                  Fechar
                </Button>
              </div>
            ) : (
              <form onSubmit={handleAddMember} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {addDiscard.isPending&&<UnsavedChangesNotice onKeep={addDiscard.keepEditing} onDiscard={addDiscard.discard}/>}
                <fieldset disabled={!membersConfirmed||isLoading||isSubmittingAdd||addDiscard.isPending} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:16}}>
                <Input ref={addNameRef}
                  label="Nome Completo"
                  placeholder="Ex: João da Silva"
                  minLength={2} maxLength={100}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />

                <Input
                  label="E-mail de Login"
                  type="email"
                  autoComplete="off"
                  placeholder="joao@suaempresa.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "var(--font-size-xs, 0.75rem)",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      marginBottom: "6px",
                    }}
                  >
                    Função / Cargo na Empresa
                  </label>
                  <select
                    aria-label="Função do novo membro na empresa"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: "var(--radius-md, 8px)",
                      border: "1px solid var(--border-default)",
                      backgroundColor: "var(--bg-canvas)",
                      color: "var(--text-primary)",
                      fontSize: "var(--font-size-sm, 0.875rem)",
                    }}
                  >
                    <option value="operator">Operador (Atendimento e Inbox de Chat)</option>
                    <option value="manager">Gerente (Operação e acompanhamento; sem gestão de acessos)</option>
                    <option value="admin">Administrador (Configurações e gestão de acessos)</option>
                  </select>
                </div>

                <TeamRolePreview role={newRole}/>
                <Input
                  label="Senha Inicial (Opcional)"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Deixe em branco para gerar automaticamente"
                  minLength={6} maxLength={100}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <p>Senha inicial vale somente para conta nova. Para uma conta existente, deixe em branco e preserve a senha atual.</p>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                  <Button
                    size="md"
                    variant="secondary"
                    type="button"
                    onClick={closeAdd}
                    disabled={isSubmittingAdd}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="md"
                    variant="primary"
                    type="submit"
                    disabled={!membersConfirmed||isLoading||isSubmittingAdd}
                    prefixIcon={<Shield size={16} />}
                  >
                    {isSubmittingAdd ? "Salvando..." : "Criar Acesso"}
                  </Button>
                </div>
              </fieldset></form>
            )}
      </Dialog>

      {/* MODAL: Alterar perfil nesta empresa */}
      <Dialog isOpen={Boolean(editingMember)} onClose={closeEdit} title={`Alterar perfil: ${editingMember?.name || "membro"}`} description="Altere somente o acesso deste integrante nesta empresa.">
        {errorMsg && <Alert variant="danger" title="Não foi possível concluir">{errorMsg}</Alert>}
        {editingMember && <>
            <form onSubmit={handleUpdateMember} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {editDiscard.isPending&&<UnsavedChangesNotice onKeep={editDiscard.keepEditing} onDiscard={editDiscard.discard}/>}
              <fieldset disabled={!membersConfirmed||isLoading||isSubmittingEdit||editDiscard.isPending} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:16}}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: "6px",
                  }}
                >
                  Cargo / Nível de Acesso
                </label>
                <select ref={editRoleRef}
                  aria-label="Cargo e nível de acesso do membro"
                  value={editingMember.role === "owner" ? "owner" : editRole}
                  onChange={(e) => setEditRole(e.target.value as any)}
                  disabled={editingMember.role === "owner"}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md, 8px)",
                    border: "1px solid var(--border-default)",
                    backgroundColor: "var(--bg-canvas)",
                    color: "var(--text-primary)",
                    fontSize: "var(--font-size-sm, 0.875rem)",
                  }}
                >
                  {editingMember.role === "owner" && <option value="owner">Proprietário</option>}
                  <option value="operator">Operador (Atendimento e Inbox de Chat)</option>
                  <option value="manager">Gerente (Operação e acompanhamento; sem gestão de acessos)</option>
                  <option value="admin">Administrador (Configurações e gestão de acessos)</option>
                </select>
                {editingMember.role === "owner" && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                    O papel de Proprietário é protegido e não pode ser alterado.
                  </p>
                )}
              </div>

              <TeamRolePreview role={editingMember.role === "owner" ? "owner" : editRole} previousRole={editingMember.role}/>
              <p>A senha pertence à conta, usada em todas as empresas. Este formulário altera somente o perfil nesta empresa.</p>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
                <Button
                  size="md"
                  variant="secondary"
                  type="button"
                  onClick={closeEdit}
                  disabled={isSubmittingEdit}
                >
                  Cancelar
                </Button>
                <Button
                  size="md"
                  variant="primary"
                  type="submit"
                  disabled={!membersConfirmed||isLoading||isSubmittingEdit||editRole===editingMember.role}
                >
                  {isSubmittingEdit ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </fieldset></form>
        </>}
      </Dialog>
    </div>
  );
};
export default TeamSection;
