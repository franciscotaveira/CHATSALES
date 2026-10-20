import { useState, useEffect, useRef, useId, type FC } from "react";
import { Dialog, Button, Input, Alert, Badge } from "@sos-sales/ui";
import { Building2, User, Mail, Lock, Copy, Check, ArrowRight, Sparkles } from "lucide-react";
import {useDiscardChanges,UnsavedChangesNotice} from "../pages/UnsavedChangesNotice";
import { apiClient,ApiError } from "../services/api-client";

import {userFacingError} from "../utils/user-facing-error";

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newWorkspaceId: string) => Promise<void> | void;
  accessPending?:boolean;
}

export const CreateWorkspaceModal: FC<CreateWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  accessPending=false,
}) => {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);
  const [creationUncertain,setCreationUncertain]=useState(false);
  const nameRef=useRef<HTMLInputElement>(null);

  const [createdResult, setCreatedResult] = useState<{
    workspace: { id: string; name: string; slug: string };
    owner: { name: string; email: string; tempPassword?: string | null; isExistingUser?: boolean };
    welcomeMessage: string;
  } | null>(null);

  const idPrefix=useId();
  const generation=useRef(0),busy=useRef(false),copyTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const [isSwitching,setIsSwitching]=useState(false);
  const open=useRef(isOpen);open.current=isOpen;
  useEffect(()=>{generation.current++;busy.current=false;setIsSubmitting(false);setIsSwitching(false);clearTimeout(copyTimer.current);resetForm();return()=>{generation.current++;clearTimeout(copyTimer.current);};},[isOpen]);
  const resetForm = () => {
    setCreationUncertain(false);
    setName("");
    setOwnerName("");
    setOwnerEmail("");
    setInitialPassword("");
    setErrorMessage(null);
    setCreatedResult(null);
    setHasCopied(false);
  };

  const discard=useDiscardChanges(isOpen&&!createdResult&&!creationUncertain&&Boolean(name||ownerName||ownerEmail||initialPassword),`${idPrefix}:${isOpen}`,()=>nameRef.current,isOpen);
  const closeNow = () => {
    if(busy.current)return;
    generation.current++;clearTimeout(copyTimer.current);resetForm();
    onClose();
  };

  const handleClose=()=>{if(!busy.current)discard.requestExit(closeNow);};

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if(busy.current||createdResult||discard.isPending||accessPending||creationUncertain)return;
    if (!name.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setErrorMessage("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    if(name.trim().length<2||name.trim().length>100||ownerName.trim().length<2||ownerName.trim().length>100){setErrorMessage("Informe nomes entre 2 e 100 caracteres.");return;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())){setErrorMessage("Confira o e-mail do proprietário.");return;}
    if(initialPassword&&(initialPassword.length<6||initialPassword.length>100||!initialPassword.trim())){setErrorMessage("Use uma senha de 6 a 100 caracteres, com pelo menos um caractere além de espaços.");return;}
    const request=generation.current;const valid=()=>request===generation.current&&open.current;
    busy.current=true;setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.createWorkspace({
        name: name.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        initialPassword: initialPassword || undefined,
      });

      if(!valid())return;
      setInitialPassword("");
      setCreatedResult({
        workspace: res.workspace,
        owner: res.owner,
        welcomeMessage: res.welcomeMessage,
      });
    } catch (error:unknown) {
      if(valid()){
        setErrorMessage(userFacingError(error,"Não foi possível confirmar o cadastro. Confira as empresas existentes antes de repetir a solicitação."));
        if(!(error instanceof ApiError&&error.status>=400&&error.status<500&&error.status!==408))setCreationUncertain(true);
      }
    } finally {if(valid()){busy.current=false;setIsSubmitting(false);}}
  };
  const handleCopyMessage=async()=>{
    if(!createdResult)return;const request=generation.current;
    try{await navigator.clipboard.writeText(createdResult.welcomeMessage);if(request!==generation.current||!open.current)return;setErrorMessage(null);setHasCopied(true);clearTimeout(copyTimer.current);copyTimer.current=setTimeout(()=>setHasCopied(false),2500);}
    catch{if(request===generation.current&&open.current)setErrorMessage("Não foi possível copiar. Selecione a mensagem abaixo e copie manualmente.");}
  };
  const handleSwitchToNewWorkspace=async()=>{
    if(!createdResult||busy.current)return;const request=generation.current;const valid=()=>request===generation.current&&open.current;
    busy.current=true;setIsSwitching(true);setErrorMessage(null);
    try{await onCreated(createdResult.workspace.id);if(!valid())return;busy.current=false;setIsSwitching(false);handleClose();}
    catch(error){if(valid())setErrorMessage(userFacingError(error,"A empresa já foi criada, mas não foi possível entrar nela. Os dados foram mantidos; tente entrar novamente."));}
    finally{if(valid()){busy.current=false;setIsSwitching(false);}}
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={createdResult ? "Empresa criada" : "Cadastrar Nova Empresa"}
      description={
        createdResult
          ? "Confira o proprietário e os dados de acesso. Você pode copiar a mensagem para compartilhar pelo canal escolhido."
          : "Cadastre a empresa e seu proprietário. Depois, configure o atendimento por etapas."
      }
      maxWidth="540px"
      footer={
        createdResult ? (
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: "12px",flexWrap:"wrap" }}>
            <Button variant="secondary" disabled={isSwitching} onClick={handleClose}>
              Fechar
            </Button>
            <Button
              variant="primary"
              disabled={isSwitching}
              onClick={()=>void handleSwitchToNewWorkspace()}
              suffixIcon={<ArrowRight size={16} />}
            >
              {isSwitching?"Entrando...":"Entrar nesta Empresa Agora"}
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: "12px",flexWrap:"wrap" }}>
            <Button variant="secondary" onClick={handleClose} disabled={isSubmitting||discard.isPending}>
              {creationUncertain?"Fechar e conferir empresas":"Cancelar"}
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSubmit()}
              disabled={isSubmitting||discard.isPending||accessPending||creationUncertain}
              loading={isSubmitting}
              prefixIcon={<Sparkles size={16} />}
            >
              {isSubmitting ? "Criando..." : "Criar Empresa e Liberar Acesso"}
            </Button>
          </div>
        )
      }
    >
      {discard.isPending&&<UnsavedChangesNotice onKeep={discard.keepEditing} onDiscard={discard.discard} disabled={isSubmitting||isSwitching}/>}
      {creationUncertain&&<p role="alert">O resultado do cadastro é incerto. A empresa pode já existir; confira a lista de empresas antes de tentar criar novamente. Fechar este diálogo não desfaz um cadastro confirmado pelo servidor.</p>}
      {accessPending&&!createdResult&&<p role="status">Conferindo seu acesso. Aguarde antes de criar a empresa.</p>}
      {errorMessage && (
        <div style={{ marginBottom: "16px" }}>
          <Alert variant="danger" title="Não foi possível concluir">
            {createdResult?"A empresa já foi criada. ":""}{errorMessage}
          </Alert>
        </div>
      )}

      {createdResult ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              padding: "16px",
              backgroundColor: "var(--color-action-subtle, #E6F4F1)",
              border: "1px solid var(--border-action, #A7F3D0)",
              borderRadius: "var(--radius-md, 8px)",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-primary, #0F172A)" }}>
                {createdResult.workspace.name}
              </span>
              <Badge variant="action">Empresa criada</Badge>
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary, #475569)" }}>
              <strong>Proprietário:</strong> {createdResult.owner.name} ({createdResult.owner.email})
            </div>
            <div style={{ fontSize: "0.875rem", color: "var(--text-secondary, #475569)" }}>
              <strong>{createdResult.owner.isExistingUser ? "Acesso:" : "Senha Provisória:"}</strong>{" "}
              <code
                style={{
                  fontFamily: "var(--font-mono, monospace)",
                  backgroundColor: "rgba(0,0,0,0.06)",
                  padding: "2px 6px",
                  borderRadius: "4px",
                }}
              >
                {createdResult.owner.tempPassword || "Conta existente (senha atual mantida)"}
              </code>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label htmlFor={`${idPrefix}-welcome`}
              style={{
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-primary, #0F172A)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>Mensagem Pronta para WhatsApp</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleCopyMessage}
                prefixIcon={hasCopied ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              >
                {hasCopied ? "Copiado!" : "Copiar Mensagem"}
              </Button>
            </label>
            <textarea
              id={`${idPrefix}-welcome`}
              readOnly
              rows={6}
              value={createdResult.welcomeMessage}
              style={{
                width: "100%",
                padding: "10px",
                borderRadius: "var(--radius-md, 8px)",
                border: "1px solid var(--border-default, #E2E8F0)",
                backgroundColor: "var(--bg-canvas, #F8FAFC)",
                fontSize: "0.875rem",
                fontFamily: "var(--font-mono, monospace)",
                color: "var(--text-primary, #0F172A)",
                resize: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <fieldset disabled={isSubmitting||discard.isPending||accessPending||creationUncertain} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:16}}>
          <div>
            <label htmlFor={`${idPrefix}-company`}
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-primary, #0F172A)",
              }}
            >
              Nome da Empresa / Negócio *
            </label>
            <Input
              id={`${idPrefix}-company`}
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Clínica Dra. Camila ou Studio Bella Vista"
              prefixIcon={<Building2 size={16} />}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div>
            <label htmlFor={`${idPrefix}-owner`}
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-primary, #0F172A)",
              }}
            >
              Nome do Proprietário / Sócio *
            </label>
            <Input
              id={`${idPrefix}-owner`}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Ex: Camila Santos"
              prefixIcon={<User size={16} />}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor={`${idPrefix}-email`}
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-primary, #0F172A)",
              }}
            >
              E-mail de Acesso do Cliente *
            </label>
            <Input
              id={`${idPrefix}-email`}
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="Ex: camila@clinica.com.br"
              prefixIcon={<Mail size={16} />}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label htmlFor={`${idPrefix}-password`}
              style={{
                display: "block",
                marginBottom: "6px",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "var(--text-primary, #0F172A)",
              }}
            >
              Senha Provisória
            </label>
            <Input
              id={`${idPrefix}-password`}
              type="password"
              autoComplete="new-password"
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
              placeholder="Deixe em branco para gerar uma senha única"
              prefixIcon={<Lock size={16} />}
              disabled={isSubmitting}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #64748B)", marginTop: "4px", display: "block" }}>
              Se o e-mail já tiver conta, a senha existente será mantida. Confira os dados antes de compartilhar o acesso.
            </span>
          </div>
          </fieldset>
        </form>
      )}
    </Dialog>
  );
};
