import { useState, useRef, useEffect, type FC, type FormEvent } from "react";
import { Button, Input, Alert } from "@sos-sales/ui";
import { MessageSquareText, Mail, ShieldCheck, Lock } from "lucide-react";
import { apiClient } from "../services/api-client";
import {
  isSupabaseConfigured,
  sendSupabaseOtp,
  verifySupabaseOtp,
} from "../services/supabase-auth";

import {userFacingError} from "../utils/user-facing-error";

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

  const [otpEmail,setOtpEmail]=useState("");
  const passwordEmailField=useRef<HTMLInputElement>(null),otpEmailField=useRef<HTMLInputElement>(null),otpCodeField=useRef<HTMLInputElement>(null),focusedStep=useRef("");
  useEffect(()=>{
    const step=authMode==="password"?"password":otpSent?"otp-code":"otp-email";
    if(isLoading||focusedStep.current===step)return;
    const field=step==="password"?passwordEmailField.current:step==="otp-code"?otpCodeField.current:otpEmailField.current;
    if(field){field.focus();focusedStep.current=step;}
  },[authMode,otpSent,isLoading]);

  const attempt=useRef(0),locked=useRef(false),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;attempt.current++;};},[]);
  async function run(operation:(valid:()=>boolean)=>Promise<void>){
    if(locked.current)return;const request=++attempt.current;const valid=()=>mounted.current&&request===attempt.current;
    locked.current=true;setIsLoading(true);setErrorMessage(null);setSuccessNotice(null);
    try{await operation(valid);}catch(error){if(valid())setErrorMessage(userFacingError(error,"Não foi possível concluir o acesso. Tente novamente."));}
    finally{if(valid()){locked.current=false;setIsLoading(false);}}
  }
  const handlePasswordLogin=async(event:FormEvent)=>{
    event.preventDefault();if(!email.trim()||!password){setErrorMessage("Informe o e-mail e a senha cadastrados.");return;}
    await run(async valid=>{const result=await apiClient.loginWithPassword({email:email.trim(),password});if(!valid())return;if(result.token)onLoginSuccess(result.token);else setErrorMessage("A autenticação não retornou uma sessão válida. Tente novamente.");});
  };
  const handleSendOtp=async(event:FormEvent)=>{
    event.preventDefault();const requestedEmail=email.trim();if(!requestedEmail){setErrorMessage("Informe o e-mail cadastrado.");return;}
    await run(async valid=>{const result=await sendSupabaseOtp(requestedEmail);if(!valid())return;if(result.success){setOtpEmail(requestedEmail);setOtpSent(true);setSuccessNotice(`Código de acesso enviado para ${requestedEmail}. Verifique sua caixa de entrada.`);}else setErrorMessage(result.message||"Não foi possível solicitar o código de acesso.");});
  };
  const handleVerifyOtp=async(event:FormEvent)=>{
    event.preventDefault();if(!/^\d{6}$/.test(otpCode.trim())){setErrorMessage("Informe o código de 6 dígitos recebido.");return;}
    await run(async valid=>{const result=await verifySupabaseOtp(otpEmail,otpCode.trim());if(!valid())return;if(result.token)onLoginSuccess(result.token);else setErrorMessage(result.error||"Código inválido ou expirado. Solicite outro código.");});
  };
  const resetOtp=()=>{if(locked.current)return;attempt.current++;setOtpSent(false);setOtpCode("");setOtpEmail("");setErrorMessage(null);setSuccessNotice(null);};

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
              CHAT-SALES
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
              ref={passwordEmailField}
              label="E-mail"
              autoComplete="username" disabled={isLoading}
              type="email"
              placeholder="seu.email@empresa.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            <Input
              label="Senha de Acesso"
              autoComplete="current-password" disabled={isLoading}
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
              {isLoading ? "Autenticando..." : "Entrar no CHAT-SALES"}
            </Button>

            {hasSupabase && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: "8px" }}>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    resetOtp();setPassword("");setAuthMode("otp");
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
                  ref={otpEmailField}
                  label="E-mail Profissional"
                  autoComplete="email" disabled={isLoading}
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
                <p style={{margin:0,fontSize:13,overflowWrap:"anywhere"}}>Código solicitado para {otpEmail}.</p>
                <Input
                  ref={otpCodeField}
                  label="Código de Acesso (6 dígitos)"
                  autoComplete="one-time-code" inputMode="numeric" maxLength={6} disabled={isLoading}
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

            {otpSent&&<button type="button" disabled={isLoading} onClick={resetOtp}>Alterar e-mail ou solicitar outro código</button>}
            <button
              type="button" disabled={isLoading}
              onClick={() => {
                resetOtp();setAuthMode("password");
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
