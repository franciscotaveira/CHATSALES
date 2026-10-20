/**
 * SOS Sales V3 — Component Catalog & Showcase (/dev/ui)
 * Visual showcase and test bench for all primitives in @sos-sales/ui.
 * Accessible in development/lab mode (/dev/ui or #catalog).
 */

import { useState, type FC } from "react";
import {
  Button,
  Input,
  Badge,
  Alert,
  EmptyState,
  LoadingState,
  Dialog,
  Drawer,
  colors,
} from "@sos-sales/ui";
import {
  Sparkles,
  MessageSquare,
  Search,
  Check,
  Send,
  Layers,
  Sliders,
  X,
} from "lucide-react";

export const CatalogPage: FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");
  const [previewOpen,setPreviewOpen]=useState(false);
  const [previewWidth,setPreviewWidth]=useState(390);
  const [previewPath,setPreviewPath]=useState("/");

  return (
    <div
      style={{
        padding: "32px 24px",
        maxWidth: "1200px",
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: "40px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid var(--border-default)",
          paddingBottom: "24px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--text-primary)" }}>
              Catálogo de Primitives & Tokens
            </h1>
            <Badge variant="action" pulseDot>
              @sos-sales/ui
            </Badge>
          </div>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            Biblioteca de componentes e tokens canônicos do CHAT-SALES para revisão visual e de acessibilidade.
          </p>
        </div>

        {onClose && (
          <Button variant="secondary" size="sm" prefixIcon={<X size={16} />} onClick={onClose}>
            Fechar Catálogo
          </Button>
        )}
      </div>

      <section aria-label="Prévia responsiva do laboratório" style={{display:"grid",gap:12,minWidth:0}}>
        <h2 style={{margin:0,fontSize:20}}>Prévia responsiva do laboratório</h2>
        <p style={{margin:0}}>Confira a aplicação em uma largura controlada. Esta prévia usa a sessão e os dados do laboratório; não representa um aparelho real. Trocar a tela pode descartar edições não salvas.</p>
        <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"end"}}>
          <label style={{display:"grid",gap:6}}>Largura da prévia
            <select value={previewWidth} onChange={event=>setPreviewWidth(Number(event.target.value))} style={{minHeight:40}}>
              {[320,390,768,1280,1440].map(width=><option key={width} value={width}>{width} px</option>)}
            </select>
          </label>
          <label style={{display:"grid",gap:6}}>Tela da prévia
            <select value={previewPath} onChange={event=>setPreviewPath(event.target.value)} style={{minHeight:40}}>
              {[["/","Atendimento"],["/contatos","Contatos"],["/oportunidades","Oportunidades"],["/modelos","Modelos"],["/produtos","Produtos"],["/conversoes","Conversões"],["/settings","Configurações"]].map(([path,label])=><option key={path} value={path}>{label}</option>)}
            </select>
          </label>
          <Button variant="secondary" onClick={()=>setPreviewOpen(open=>!open)}>{previewOpen?"Fechar prévia":"Abrir prévia"}</Button>
        </div>
        {previewOpen&&<div style={{maxWidth:"100%",overflow:"auto",border:"1px solid var(--border-default)",borderRadius:8}}>
          <iframe title="Aplicação em prévia responsiva" src={previewPath} style={{display:"block",width:previewWidth,height:720,border:0,maxWidth:"none"}}/>
        </div>}
      </section>

      {/* 1. Tokens de Cores */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Layers size={20} color="var(--color-action)" />
          1. Tokens Semânticos de Cores
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          {[
            { name: "Canvas", val: colors.canvas, label: "Canvas Neutro", text: colors.textPrimary },
            { name: "Surface", val: colors.surface, label: "Superfície Pura", text: colors.textPrimary },
            { name: "Sidebar Navy", val: colors.sidebar, label: "Estrutural Dark", text: colors.sidebarText },
            { name: "Action Green", val: colors.action, label: "Ação Primária", text: "var(--text-inverse)" },
            { name: "Operational Blue", val: colors.operational, label: "Operacional/Links", text: "var(--text-inverse)" },
            { name: "Warning Amber", val: colors.warning, label: "Alertas/Pausa", text: "var(--text-inverse)" },
            { name: "Danger Red", val: colors.danger, label: "Erros/Exclusão", text: "var(--text-inverse)" },
          ].map((c) => (
            <div
              key={c.name}
              style={{
                backgroundColor: c.val,
                color: c.text,
                padding: "16px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                minHeight: "90px",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: "0.9rem" }}>{c.name}</div>
              <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>
                {c.val} • {c.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Tipografia */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
          <Sliders size={20} color="var(--color-action)" />
          2. Tipografia Canônica (Inter & JetBrains Mono)
        </h2>
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <div>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
              INTER (INTERFACE DE USUÁRIO):
            </span>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)" }}>
              The quick brown fox jumps over the lazy dog (Inter Bold 700)
            </div>
            <div style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
              Texto regular e labels de navegação com alto contraste e clareza legível (Inter Regular 400).
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "16px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>
              JETBRAINS MONO (DADOS TÉCNICOS, VALORES BRL E SLA):
            </span>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", color: "var(--text-primary)", marginTop: "4px" }}>
              SLA: 00:04:12 • R$ 14.850,00 • ID: 7b9e-4a1c-92bf • HTTP 200 OK
            </div>
          </div>
        </div>
      </section>

      {/* 3. Botões */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px" }}>
          3. Primitives de Ação (Button)
        </h2>
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <Button variant="primary">Primário (Ação Verde)</Button>
            <Button variant="secondary">Secundário</Button>
            <Button variant="danger">Perigo / Excluir</Button>
            <Button variant="ghost">Fantasma / Discreto</Button>
            <Button variant="primary" loading>Carregando...</Button>
            <Button variant="primary" disabled>Desabilitado</Button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
            <Button variant="primary" size="sm" prefixIcon={<Check size={14} />}>
              Pequeno (sm)
            </Button>
            <Button variant="primary" size="md" prefixIcon={<Send size={16} />}>
              Médio (md)
            </Button>
            <Button variant="primary" size="lg" prefixIcon={<Sparkles size={18} />}>
              Grande (lg)
            </Button>
          </div>
        </div>
      </section>

      {/* 4. Inputs */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px" }}>
          4. Campos de entrada e acessibilidade
        </h2>
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "20px",
          }}
        >
          <Input
            label="Campo Padrão"
            placeholder="Digite seu nome..."
            helperText="Informação adicional para o usuário"
          />

          <Input
            label="Busca com Ícone"
            placeholder="Filtrar por nome ou telefone..."
            prefixIcon={<Search size={16} />}
          />

          <Input
            label="Campo com Validação Ativa"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              if (e.target.value.length > 0 && e.target.value.length < 3) {
                setInputError("Mínimo de 3 caracteres obrigatório.");
              } else {
                setInputError("");
              }
            }}
            error={inputError}
            helperText={!inputError ? "Digite pelo menos 3 caracteres." : undefined}
            placeholder="Digite algo..."
          />
        </div>
      </section>

      {/* 5. Badges */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px" }}>
          5. Badges & Indicadores Semânticos
        </h2>
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
          }}
        >
          <Badge variant="action" pulseDot>Operação Conectada</Badge>
          <Badge variant="operational">Disponível</Badge>
          <Badge variant="warning">Aguardando Resposta</Badge>
          <Badge variant="danger">Falha na Fila</Badge>
          <Badge variant="neutral">Offline</Badge>
        </div>
      </section>

      {/* 6. Alertas */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px" }}>
          6. Mensagens e Alertas de Sistema
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Alert variant="info" title="Atualização do Fastify">
            Sua conexão com o servidor local está ativa na porta 4400.
          </Alert>
          <Alert variant="success" title="Workspace Carregado">
            Todas as permissões do usuário foram validadas no banco de dados.
          </Alert>
          <Alert variant="warning" title="Atenção à Conexão">
            Latência do cluster de testes acima de 120ms.
          </Alert>
          <Alert
            variant="danger"
            title="Erro de Autenticação (401)"
            action={<Button size="sm" variant="danger">Reautenticar</Button>}
          >
            Seu token Bearer expirou ou não possui assinatura válida.
          </Alert>
        </div>
      </section>

      {/* 7. Loading e Empty States */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px" }}>
          7. Estados Universais (Loading e Empty State)
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              padding: "24px",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
            }}
          >
            <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "16px" }}>
              Loading Skeletons
            </h3>
            <LoadingState variant="skeleton" lines={4} />
          </div>

          <div>
            <EmptyState
              icon={<MessageSquare size={32} />}
              title="Nenhuma Conversa Ativa"
              description="Quando novos clientes enviarem mensagens pelo WhatsApp, os chats aparecerão nesta lista em tempo real."
              action={<Button variant="primary" size="sm">Iniciar Novo Atendimento</Button>}
            />
          </div>
        </div>
      </section>

      {/* 8. Modais */}
      <section>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "16px" }}>
          8. Modais Acessíveis (Dialog & Drawer)
        </h2>
        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            border: "1px solid var(--border-default)",
            display: "flex",
            gap: "16px",
          }}
        >
          <Button variant="primary" onClick={() => setIsDialogOpen(true)}>
            Abrir Dialog Acessível
          </Button>

          <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
            Abrir Drawer Lateral
          </Button>
        </div>

        <Dialog
          isOpen={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          title="Confirmar Ação de Teste"
          description="Este modal possui retenção de foco por teclado (Tab trap) e fecha com a tecla Escape."
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => setIsDialogOpen(false)}>
                Confirmar
              </Button>
            </>
          }
        >
          <p style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            O foco foi retido no interior desta janela modal. Pressione <kbd>Tab</kbd> para navegar entre os botões ou <kbd>Esc</kbd> para fechar e restaurar o foco ao elemento original.
          </p>
        </Dialog>

        <Drawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          title="Painel Deslizante Lateral"
          description="Gaveta para detalhes do contato ou configurações do workspace."
          footer={
            <Button variant="secondary" onClick={() => setIsDrawerOpen(false)}>
              Fechar Painel
            </Button>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Input label="Observações do Atendimento" placeholder="Escreva aqui..." />
            <Alert variant="info" title="Sincronização Ativa">
              Os dados são armazenados exclusivamente na sessão ativa.
            </Alert>
          </div>
        </Drawer>
      </section>
    </div>
  );
};
