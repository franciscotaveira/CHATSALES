import { useState, useRef, type FC } from "react";
import { Button } from "@sos-sales/ui";
import { LogOut } from "lucide-react";
import type { UseSessionReturn } from "../../hooks/useSession";

export const DangerSection: FC<{ session?: UseSessionReturn }> = ({ session }) => {
  const [isResetting, setIsResetting] = useState(false);
  const [error,setError]=useState<string|null>(null);
  const resetting=useRef(false);

  const handleClearSession = () => {
    if(resetting.current)return;
    const confirmed = window.confirm(
      "Deseja realmente desconectar sua sessão ativa e limpar os dados locais de autenticação?"
    );
    if (!confirmed) return;

    resetting.current=true;setIsResetting(true);setError(null);
    let complete=true;
    for(const name of ["localStorage","sessionStorage"] as const){
      try{
        const storage=window[name];
        for(const key of ["sos_sales_auth_token","sos_sales_dev_token","sos_v3_lab_token","sos_sales_active_workspace_id"]){
          try{storage.removeItem(key);}catch{complete=false;}
        }
      }catch{complete=false;}
    }
    try{sessionStorage.setItem("sos_v3_explicit_logged_out","true");}catch{complete=false;}
    try{session?.logout();}catch{complete=false;}
    if(complete){
      try{window.location.assign("/login");return;}catch{/* Keep a visible recovery action when navigation is unavailable. */}
    }
    setError("Não foi possível confirmar a limpeza completa da sessão neste navegador. Tente novamente. Evite deixar este dispositivo compartilhado com a sessão aberta.");
    resetting.current=false;setIsResetting(false);
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg-surface)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border-default)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <LogOut size={18} style={{ color: "var(--text-secondary)" }} />
        <h2 style={{ fontSize: "var(--font-size-sm)", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
          Sessão deste dispositivo
        </h2>
      </div>

      <p style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)", margin: 0 }}>
        Encerre a sessão deste dispositivo. As informações da empresa permanecem salvas.
      </p>

      {error&&<p role="alert">{error}</p>}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap:16,
          paddingTop: "12px",
          borderTop: "1px solid var(--border-default)",
        }}
      >
        <div style={{flex:"1 1 220px",minWidth:0}}>
          <div style={{ fontSize: "var(--font-size-sm)", fontWeight: 500, color: "var(--text-primary)" }}>
            Desconectar Sessão do Dispositivo
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }}>
            Limpa tokens armazenados localmente e retorna à tela de autenticação.
          </div>
        </div>

        <Button
          size="sm"
          variant="secondary"
          prefixIcon={<LogOut size={14} />}
          onClick={handleClearSession}
          disabled={isResetting}
        >
          {isResetting?"Desconectando…":"Desconectar"}
        </Button>
      </div>
    </div>
  );
};
