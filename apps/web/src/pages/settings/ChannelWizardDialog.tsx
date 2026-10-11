import { useState, useCallback, useEffect, type FC } from "react";
import { Dialog, Button, Input, SegmentedControl, Alert } from "@sos-sales/ui";
import { Check, ArrowRight, ArrowLeft, QrCode } from "lucide-react";
import { apiClient } from "../../services/api-client";

interface ChannelWizardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId?: string;
  token?: string;
  onChannelCreated: () => void;
  onOpenQr?: (channelId: string, channelName: string) => void;
  initialProvider?: "meta_waba" | "waha" | "evolution";
}

export const ChannelWizardDialog: FC<ChannelWizardDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
  token,
  onChannelCreated,
  onOpenQr,
  initialProvider = "meta_waba",
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<"meta_waba" | "waha" | "evolution">(initialProvider);
  const [displayName, setDisplayName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  // Meta credentials
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [wabaAccountId, setWabaAccountId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  // WAHA / Evolution credentials
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const [createdChannelId, setCreatedChannelId] = useState<string | null>(null);
  const [createdChannelName, setCreatedChannelName] = useState<string>("");

  // Sync initialProvider when dialog opens
  useEffect(() => {
    if (isOpen) {
      setProvider(initialProvider);
      if (initialProvider === "waha") {
        setBaseUrl("http://sos-sales-waha:3000");
        setApiKey("mct_sos_waha_master_2026");
      }
    }
  }, [isOpen, initialProvider]);

  const handleProviderChange = (newProvider: "meta_waba" | "waha" | "evolution") => {
    setProvider(newProvider);
    if (newProvider === "waha" && (!baseUrl || baseUrl === "http://seu-servidor:3000")) {
      setBaseUrl("http://sos-sales-waha:3000");
      setApiKey("mct_sos_waha_master_2026");
    }
  };

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleTestConnection = async () => {
    if (!workspaceId || !token) return;
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await apiClient.testChannelConnection(
        workspaceId,
        {
          provider,
          credentials: {
            accessToken: accessToken.trim() || undefined,
            phoneNumberId: phoneNumberId.trim() || undefined,
            wabaAccountId: wabaAccountId.trim() || undefined,
            appSecret: appSecret.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
          },
        },
        { token }
      );
      setTestResult(res);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "Falha ao testar conexão.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCreateChannel = async () => {
    if (!workspaceId || !token || !displayName.trim()) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.createChannel(
        workspaceId,
        {
          provider,
          displayName: displayName.trim(),
          phoneNumberE164: phoneNumber.trim() || undefined,
          credentials: {
            accessToken: accessToken.trim() || undefined,
            phoneNumberId: phoneNumberId.trim() || undefined,
            wabaAccountId: wabaAccountId.trim() || undefined,
            appSecret: appSecret.trim() || undefined,
            apiKey: apiKey.trim() || undefined,
            baseUrl: baseUrl.trim() || undefined,
          },
        },
        { token }
      );

      if (res?.channel?.id) {
        setCreatedChannelId(res.channel.id);
        setCreatedChannelName(res.channel.displayName);
      }
      setStep(3);
      onChannelCreated();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Falha ao registrar canal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = useCallback(() => {
    setStep(1);
    setDisplayName("");
    setPhoneNumber("");
    setAccessToken("");
    setPhoneNumberId("");
    setTestResult(null);
    setErrorMsg(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={handleClose}
      title={step === 3 ? "Canal Conectado com Sucesso!" : "Conectar Nova Linha WhatsApp"}
      description={
        step === 1
          ? "Escolha o tipo de integração e identifique a nova linha."
          : step === 2
          ? "Insira as credenciais de autenticação da instância."
          : "Sua instância está configurada e pronta para receber mensagens no Cockpit."
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "8px 0" }}>
        {errorMsg && (
          <Alert variant="danger" title="Erro no Provisionamento">
            {errorMsg}
          </Alert>
        )}

        {step === 1 && (
          <>
            <div>
              <label style={{ display: "block", fontSize: "var(--font-size-xs, 0.75rem)", fontWeight: 500, marginBottom: "6px" }}>
                Provedor WhatsApp
              </label>
              <SegmentedControl
                value={provider}
                onChange={(val) => handleProviderChange(val as any)}
                options={[
                  { value: "meta_waba", label: "Meta Cloud API" },
                  { value: "waha", label: "WAHA (QR Code)" },
                  { value: "evolution", label: "Evolution API" },
                ]}
              />
            </div>

            <Input
              label="Nome de Identificação da Linha"
              placeholder="Ex: Comercial Principal, Suporte VIP"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />

            <Input
              label="Número do WhatsApp (Opcional)"
              placeholder="+55 49 99999-8888"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "8px" }}>
              <Button size="sm" variant="secondary" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!displayName.trim()}
                onClick={() => setStep(2)}
                prefixIcon={<ArrowRight size={14} />}
              >
                Continuar
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {provider === "meta_waba" ? (
              <>
                <Input
                  label="Token de Acesso Permanente (System User Token)"
                  placeholder="EAAB..."
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  required
                />
                <Input
                  label="Phone Number ID"
                  placeholder="Ex: 1049283749283"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  required
                />
                <Input
                  label="WABA Account ID (WhatsApp Business Account)"
                  placeholder="Ex: 1982736452819"
                  value={wabaAccountId}
                  onChange={(e) => setWabaAccountId(e.target.value)}
                />
                <Input
                  label="App Secret (Meta App)"
                  placeholder="Opcional..."
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                />
              </>
            ) : provider === "waha" ? (
              <>
                <div
                  style={{
                    padding: "10px 14px",
                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    borderRadius: "var(--radius-md)",
                    fontSize: "var(--font-size-xs)",
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                  }}
                >
                  <strong>💡 Servidor WAHA Nativo na VPS:</strong> A URL interna e chave de autenticação já vêm configuradas para a sua instância local. Ao salvar o canal, você poderá escanear o <strong>QR Code</strong> instantaneamente pelo WhatsApp do seu celular (<em>Aparelhos Conectados</em>).
                </div>
                <Input
                  label="URL Base da Instância WAHA (Servidor Interno)"
                  placeholder="http://sos-sales-waha:3000"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                />
                <Input
                  label="API Key / Chave de Acesso WAHA"
                  placeholder="mct_sos_waha_master_2026"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </>
            ) : (
              <>
                <Input
                  label="URL Base da Instância Evolution"
                  placeholder="http://seu-servidor:8080"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  required
                />
                <Input
                  label="API Key / Chave Global Evolution"
                  placeholder="Sua chave de acesso..."
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </>
            )}

            {testResult && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "var(--radius-md)",
                  fontSize: "var(--font-size-xs)",
                  backgroundColor: testResult.success ? "var(--color-action-subtle)" : "var(--color-danger-subtle)",
                  color: testResult.success ? "var(--color-action)" : "var(--color-danger)",
                  border: testResult.success ? "1px solid var(--color-action-border)" : "1px solid var(--color-danger-border)",
                }}
              >
                {testResult.success ? "Conexão testada com sucesso!" : testResult.message || "Falha na conexão com o provedor."}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "8px" }}>
              <Button size="sm" variant="ghost" prefixIcon={<ArrowLeft size={14} />} onClick={() => setStep(1)}>
                Voltar
              </Button>
              <div style={{ display: "flex", gap: "8px" }}>
                <Button size="sm" variant="secondary" onClick={handleTestConnection} disabled={isTesting}>
                  {isTesting ? "Testando..." : "Testar Conexão"}
                </Button>
                <Button size="sm" variant="primary" onClick={handleCreateChannel} disabled={isSubmitting}>
                  {isSubmitting ? "Salvando..." : "Salvar Canal"}
                </Button>
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "12px 0" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                backgroundColor: "var(--color-action-subtle)",
                color: "var(--color-action)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Check size={24} />
            </div>
            <div style={{ fontSize: "var(--font-size-base)", fontWeight: 600 }}>
              Instância conectada com sucesso!
            </div>
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", textAlign: "center", margin: 0 }}>
              {provider === "waha"
                ? "A sessão WAHA foi criada no servidor. Agora você precisa ler o QR Code com o aplicativo WhatsApp no seu celular."
                : "O canal agora está sincronizado e ativo para atendimento no Cockpit."}
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              {provider === "waha" && onOpenQr && createdChannelId && (
                <Button
                  size="sm"
                  variant="primary"
                  prefixIcon={<QrCode size={16} />}
                  onClick={() => {
                    const chId = createdChannelId;
                    const chName = createdChannelName || displayName;
                    handleClose();
                    onOpenQr(chId, chName);
                  }}
                >
                  Escanear QR Code Agora
                </Button>
              )}
              <Button size="sm" variant={provider === "waha" ? "secondary" : "primary"} onClick={handleClose}>
                {provider === "waha" ? "Fazer Isso Mais Tarde" : "Concluir"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
