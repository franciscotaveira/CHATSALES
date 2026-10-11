import { useState, type FC } from "react";
import { Dialog, Button, Input, Alert, Badge } from "@sos-sales/ui";
import { Building2, User, Mail, Lock, Copy, Check, ArrowRight, Sparkles } from "lucide-react";
import { apiClient } from "../services/api-client";

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newWorkspaceId: string) => Promise<void> | void;
}

export const CreateWorkspaceModal: FC<CreateWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [initialPassword, setInitialPassword] = useState("MctSoberana2026!");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const [createdResult, setCreatedResult] = useState<{
    workspace: { id: string; name: string; slug: string };
    owner: { name: string; email: string; tempPassword?: string | null; isExistingUser?: boolean };
    welcomeMessage: string;
  } | null>(null);

  const resetForm = () => {
    setName("");
    setOwnerName("");
    setOwnerEmail("");
    setInitialPassword("MctSoberana2026!");
    setErrorMessage(null);
    setCreatedResult(null);
    setHasCopied(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!name.trim() || !ownerName.trim() || !ownerEmail.trim()) {
      setErrorMessage("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.createWorkspace({
        name: name.trim(),
        ownerName: ownerName.trim(),
        ownerEmail: ownerEmail.trim().toLowerCase(),
        initialPassword: initialPassword.trim() || "MctSoberana2026!",
      });

      setCreatedResult({
        workspace: res.workspace,
        owner: res.owner,
        welcomeMessage: res.welcomeMessage,
      });
    } catch (err: any) {
      setErrorMessage(
        err?.message || err?.detail || "Falha ao provisionar a nova empresa. Verifique os dados e tente novamente."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyMessage = async () => {
    if (!createdResult) return;
    try {
      await navigator.clipboard.writeText(createdResult.welcomeMessage);
      setHasCopied(true);
      setTimeout(() => setHasCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleSwitchToNewWorkspace = async () => {
    if (!createdResult) return;
    const wsId = createdResult.workspace.id;
    handleClose();
    await onCreated(wsId);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={createdResult ? "Empresa Provisionada com Sucesso!" : "Cadastrar Nova Empresa (Workspace)"}
      description={
        createdResult
          ? "O workspace foi criado sob isolamento RLS e o acesso do cliente está pronto para ser enviado."
          : "Crie uma nova empresa isolada com acesso de proprietário e recursos de IA prontos para rodar."
      }
      maxWidth="540px"
      footer={
        createdResult ? (
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: "12px" }}>
            <Button variant="secondary" onClick={handleClose}>
              Fechar
            </Button>
            <Button
              variant="primary"
              onClick={handleSwitchToNewWorkspace}
              suffixIcon={<ArrowRight size={16} />}
            >
              Entrar nesta Empresa Agora
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: "12px" }}>
            <Button variant="secondary" onClick={handleClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => handleSubmit()}
              loading={isSubmitting}
              prefixIcon={<Sparkles size={16} />}
            >
              {isSubmitting ? "Provisionando..." : "Criar Empresa e Liberar Acesso"}
            </Button>
          </div>
        )
      }
    >
      {errorMessage && (
        <div style={{ marginBottom: "16px" }}>
          <Alert variant="danger" title="Erro no Provisionamento">
            {errorMessage}
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
              <Badge variant="action">Ativo & Blindado (RLS)</Badge>
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
            <label
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
          <div>
            <label
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Clínica Dra. Camila ou Studio Bella Vista"
              prefixIcon={<Building2 size={16} />}
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div>
            <label
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
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Ex: Camila Santos"
              prefixIcon={<User size={16} />}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
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
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="Ex: camila@clinica.com.br"
              prefixIcon={<Mail size={16} />}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
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
              type="text"
              value={initialPassword}
              onChange={(e) => setInitialPassword(e.target.value)}
              placeholder="MctSoberana2026!"
              prefixIcon={<Lock size={16} />}
              disabled={isSubmitting}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted, #64748B)", marginTop: "4px", display: "block" }}>
              O cliente poderá alterar a senha a qualquer momento dentro de Configurações &gt; Equipe &amp; Acessos.
            </span>
          </div>
        </form>
      )}
    </Dialog>
  );
};
