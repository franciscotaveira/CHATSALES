import { useState, type FC, type FormEvent } from "react";
import { Button, Input, Alert } from "@sos-sales/ui";
import { MessageSquareText, Mail, ShieldCheck, Lock } from "lucide-react";
import { apiClient } from "../services/api-client";
import {
  isSupabaseConfigured,
  sendSupabaseOtp,
  verifySupabaseOtp,
} from "../services/supabase-auth";

interface LoginPageProps {
  onLoginSuccess: (token: string) => void;
  initialError?: string | null;
}

export const LoginPage: FC<LoginPageProps> = ({ onLoginSuccess, initialError }) => {
  const hasSupabase = isSupabaseConfigured();

  // Primary Login State (Email + Password)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Alternate Mode State (OTP)
  const [authMode, setAuthMode] = useState<"password" | "otp">("password");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError || null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  /**
   * Sovereign Native Login Flow (Email + Password via Scrypt) - MCT OS v2.0
   */
  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Informe seu e-mail cadastrado.");
      return;
    }
    if (!password.trim()) {
      setErrorMessage("Informe sua senha de acesso.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.loginWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (res.token) {
        onLoginSuccess(res.token);
      } else {
        setErrorMessage("Resposta de autenticação sem token válido.");
      }
    } catch (err: unknown) {
      const msg =
        (err as { detail?: string; message?: string }).detail ||
        (err as Error).message ||
        "E-mail ou senha incorretos.";
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Supabase Auth OTP Flow (Optional Alternate)
   */
  const handleSendOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMessage("Informe o e-mail cadastrado.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessNotice(null);

    const res = await sendSupabaseOtp(email.trim());
    setIsLoading(false);

    if (res.success) {
      setOtpSent(true);
      setSuccessNotice(`Código de acesso enviado para ${email.trim()}. Verifique sua caixa de entrada.`);
    } else {
      setErrorMessage(res.message || "Falha ao enviar código de acesso.");
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setErrorMessage("Informe o código de 6 dígitos recebido.");
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await verifySupabaseOtp(email.trim(), otpCode.trim());
    setIsLoading(false);

    if (res.token) {
      onLoginSuccess(res.token);
    } else {
      setErrorMessage(res.error || "Código de acesso inválido ou expirado.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 50% 0%, rgba(0, 128, 105, 0.09) 0%, rgba(37, 99, 235, 0.03) 40%, var(--bg-canvas) 80%)",
        padding: "var(--space-4, 16px)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(226, 232, 240, 0.9)",
          borderRadius: "var(--radius-xl, 16px)",
          boxShadow:
            "0 20px 40px -15px rgba(15, 23, 42, 0.08), 0 1px 3px 0 rgba(15, 23, 42, 0.05)",
          padding: "36px 30px",
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          boxSizing: "border-box",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "10px",
          }}
        >
          <div
            style={{
              width: "52px",
              height: "52px",
              borderRadius: "14px",
              backgroundColor: "var(--color-action)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#FFFFFF",
              boxShadow: "0 8px 24px -2px rgba(0, 128, 105, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.25) inset",
            }}
          >
            <MessageSquareText size={28} />
          </div>
          <div>
            <h1
              style={{
                fontSize: "var(--font-size-xl, 1.25rem)",
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: 0,
              }}
            >
              SOS Sales
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-sm, 0.875rem)",
                color: "var(--text-secondary)",
                margin: "4px 0 0 0",
              }}
            >
              Sistema Operacional de Vendas & Atendimento
            </p>
          </div>
        </div>

        {/* Notices & Alerts */}
        {errorMessage && (
          <Alert variant="danger" title="Erro no Acesso">
            {errorMessage}
          </Alert>
        )}
        {successNotice && (
          <Alert variant="info" title="Código Enviado">
            {successNotice}
          </Alert>
        )}

        {/* 1. Sovereign Native Login (Email + Password) — DEFAULT */}
        {authMode === "password" && (
          <form onSubmit={handlePasswordLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input
              label="E-mail"
              type="email"
              placeholder="seu.email@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            <Input
              label="Senha de Acesso"
              type="password"
              placeholder="Digite sua senha..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <Button
              size="md"
              variant="primary"
              type="submit"
              disabled={isLoading}
              prefixIcon={<Lock size={16} />}
              style={{ width: "100%", marginTop: "4px" }}
            >
              {isLoading ? "Autenticando..." : "Entrar no SOS Sales"}
            </Button>

            {hasSupabase && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("otp");
                    setErrorMessage(null);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "var(--font-size-xs, 0.75rem)",
                    color: "var(--text-secondary)",
                    textDecoration: "underline",
                  }}
                >
                  Entrar com código por e-mail (OTP)
                </button>
              </div>
            )}
          </form>
        )}

        {/* 2. Supabase Auth OTP Flow (Optional Alternate) */}
        {authMode === "otp" && (
          <>
            {!otpSent ? (
              <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Input
                  label="E-mail Profissional"
                  type="email"
                  placeholder="seu.email@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />

                <Button
                  size="md"
                  variant="primary"
                  type="submit"
                  disabled={isLoading}
                  prefixIcon={<Mail size={16} />}
                  style={{ width: "100%", marginTop: "4px" }}
                >
                  {isLoading ? "Enviando..." : "Receber Código de Acesso"}
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <Input
                  label="Código de Acesso (6 dígitos)"
                  type="text"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  required
                />

                <Button
                  size="md"
                  variant="primary"
                  type="submit"
                  disabled={isLoading}
                  prefixIcon={<ShieldCheck size={16} />}
                  style={{ width: "100%", marginTop: "4px" }}
                >
                  {isLoading ? "Validando..." : "Confirmar e Acessar"}
                </Button>
              </form>
            )}

            <button
              type="button"
              onClick={() => {
                setAuthMode("password");
                setOtpSent(false);
                setOtpCode("");
                setErrorMessage(null);
                setSuccessNotice(null);
              }}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: "var(--font-size-xs, 0.75rem)",
                color: "var(--text-secondary)",
                textDecoration: "underline",
                textAlign: "center",
              }}
            >
              Voltar ao login com senha
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
