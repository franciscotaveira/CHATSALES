import { type FC } from "react";
import { Shield, FileText, CheckCircle2, ArrowLeft } from "lucide-react";

interface PublicLegalPageProps {
  type: "privacy" | "terms";
}

export const PublicLegalPage: FC<PublicLegalPageProps> = ({ type }) => {
  const isPrivacy = type === "privacy";

  return (
    <main
      style={{
        minHeight: "100dvh",
        flexShrink: 0,
        width: "100%",
        overflowWrap: "anywhere",
        backgroundColor: "#0B0F17",
        color: "#F8FAFC",
        fontFamily: "'Inter', sans-serif",
        padding: "clamp(16px,4vw,40px) clamp(12px,3vw,20px)",
      }}
    >
      <div
        style={{
          maxWidth: "840px",
          width: "100%",
          backgroundColor: "#111827",
          border: "1px solid #1F2937",
          borderRadius: "16px",
          padding: "clamp(20px,5vw,40px)",
          margin: "0 auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "32px" }}>
          <a
            href="/"
            style={{
              display: "inline-flex",
              flexShrink: 0,
              alignItems: "center",
              gap: "8px",
              color: "#94A3B8",
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            <ArrowLeft size={16} /> Voltar ao Sistema
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#10B981", fontSize: "13px", fontWeight: 600 }}>
            <CheckCircle2 size={16} /> Documento Oficial em Vigor
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <div
            style={{
              flexShrink: 0,
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              backgroundColor: "rgba(16, 185, 129, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#10B981",
            }}
          >
            {isPrivacy ? <Shield size={24} /> : <FileText size={24} />}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(20px,4vw,24px)", fontWeight: 700 }}>
              {isPrivacy ? "Política de Privacidade e Proteção de Dados" : "Termos de Uso e Serviço"}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#94A3B8" }}>
              STA — Seu Time de Atendimento & SOS Vendas | FRANCISCO TAVEIRA RIOS (CNPJ: 69.553.990/0001-91)
            </p>
          </div>
        </div>

        <div
          style={{
            borderBottom: "1px solid #1F2937",
            paddingBottom: "16px",
            marginBottom: "24px",
            fontSize: "13px",
            color: "#64748B",
          }}
        >
          Última atualização: 20 de Outubro de 2026 • Em conformidade com a LGPD (Lei nº 13.709/2018) e Meta Platform Terms
        </div>

        {isPrivacy ? (
          <div style={{ fontSize: "14px", lineHeight: "1.7", color: "#CBD5E1", display: "flex", flexDirection: "column", gap: "20px" }}>
            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                1. Visão Geral e Controlador dos Dados
              </h2>
              <p>
                A plataforma <strong>STA — Seu Time de Atendimento</strong> (também operando sob a marca comercial SOS Vendas e MCT LTDA) é desenvolvida e controlada por <strong>69.553.990 FRANCISCO TAVEIRA RIOS</strong>, pessoa jurídica de direito privado inscrita no CNPJ/MF sob o nº <strong>69.553.990/0001-91</strong>, com sede na Rua Barão do Rio Branco - E, nº 837E, Bairro Jardim Itália, Chapecó - SC, CEP 89802-101. Esta Política de Privacidade explica de forma transparente como coletamos, processamos, armazenamos e protegemos as informações fornecidas pelos usuários, clientes e parceiros ao utilizar nosso software como serviço (SaaS), inclusive através de integrações oficiais com a Meta Cloud API (WhatsApp Business Cloud API, Instagram Messaging e Facebook Login).
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                2. Integração com WhatsApp Business Cloud API & Meta Platforms
              </h2>
              <p>
                Nosso aplicativo atua como Provedor de Tecnologia (Tech Provider) para empresas que conectam suas contas do WhatsApp Business. No âmbito dessa integração:
              </p>
              <ul style={{ paddingLeft: "20px", margin: "8px 0" }}>
                <li><strong>Finalidade Exclusiva:</strong> Os dados de mensagens, números de telefone de remetentes/destinatários e modelos de mensagens são processados estritamente para viabilizar a comunicação comercial e o suporte ao cliente solicitado pelo titular da conta.</li>
                <li><strong>Não Compartilhamento:</strong> Não vendemos, não alugamos e não utilizamos conteúdos de conversas do WhatsApp para fins de treinamento de modelos públicos ou venda de publicidade.</li>
                <li><strong>Armazenamento Seguro e Criptografia:</strong> Tokens de acesso do WhatsApp Business e credenciais de provedores são armazenados com criptografia de ponta (AES-256-GCM) em repouso no banco de dados isolado por workspace (Multi-Tenant RLS).</li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                3. Dados Coletados
              </h2>
              <p>Coletamos estritamente os dados necessários para o funcionamento do CRM e das automações:</p>
              <ul style={{ paddingLeft: "20px", margin: "8px 0" }}>
                <li><strong>Dados de Cadastro da Empresa:</strong> Nome empresarial, e-mail de contato do administrador, identificador da empresa na Meta (Business ID e WABA ID).</li>
                <li><strong>Dados de Conversação:</strong> Número de telefone E.164, registros de data/hora de envio e recebimento, status de entrega e leitura, e conteúdo das mensagens transmitidas pelas rotas oficiais.</li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                4. Direitos dos Titulares (LGPD)
              </h2>
              <p>
                Em conformidade com o Artigo 18 da LGPD, os titulares de dados ou clientes podem solicitar a qualquer momento a confirmação de tratamento, acesso, correção, anonimização, eliminação de dados ou revogação de consentimento de canais conectados através do e-mail do Encarregado de Dados (DPO): <code>suporte@automatizaprocessos.tech</code> ou pelo telefone institucional <code>+55 (49) 8844-7562</code>.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                5. Exclusão de Dados de Usuário (Meta Data Deletion Callback)
              </h2>
              <p>
                Usuários que conectarem sua conta via Facebook Login podem revogar a permissão no próprio painel de Configurações da Meta ou solicitar a exclusão total dos dados associados enviando requisição com seu identificador para <code>suporte@automatizaprocessos.tech</code>, momento em que os tokens e credenciais serão expurgados do banco de dados em até 48 horas úteis.
              </p>
            </section>
          </div>
        ) : (
          <div style={{ fontSize: "14px", lineHeight: "1.7", color: "#CBD5E1", display: "flex", flexDirection: "column", gap: "20px" }}>
            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                1. Aceitação dos Termos
              </h2>
              <p>
                Ao acessar e utilizar a plataforma <strong>STA — Seu Time de Atendimento</strong> (SOS Vendas), disponibilizada por <strong>69.553.990 FRANCISCO TAVEIRA RIOS</strong> (CNPJ/MF sob o nº <strong>69.553.990/0001-91</strong>, operando sob a marca <strong>MCT LTDA</strong>), com sede em Chapecó - SC, você concorda expressamente em vincular-se a estes Termos de Serviço e a cumprir integralmente a legislação vigente, bem como as Políticas de Uso Comercial da Meta Platforms.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                2. Descrição dos Serviços
              </h2>
              <p>
                O STA é uma solução de software como serviço (SaaS) voltada para a gestão de atendimento, automação conversacional e integração de canais de mensageria empresarial (incluindo WhatsApp Business Cloud API e Instagram).
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                3. Conformidade com as Políticas de Mensagens do WhatsApp
              </h2>
              <p>
                O usuário e contratante é o único responsável pelo conteúdo das mensagens transmitidas através de sua conta do WhatsApp Business conectada, obrigando-se a:
              </p>
              <ul style={{ paddingLeft: "20px", margin: "8px 0" }}>
                <li>Obter consentimento prévio válido (Opt-in) dos destinatários antes de iniciar comunicações ativas.</li>
                <li>Não disseminar spam, conteúdos ilícitos, fraudulentos, ofensivos ou que violem a Política de Comércio do WhatsApp.</li>
                <li>Respeitar as categorias de modelos de mensagem (Marketing, Utility e Autenticação) homologadas pela Meta.</li>
              </ul>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                4. Disponibilidade e Nível de Serviço (SLA)
              </h2>
              <p>
                A 69.553.990 FRANCISCO TAVEIRA RIOS (MCT LTDA) emprega práticas avançadas de engenharia de software para assegurar alta disponibilidade da plataforma. Não obstante, interrupções originadas diretamente nos servidores da Meta Platforms, operadoras de telecomunicação ou provedores de nuvem de terceiros estão fora do controle direto da plataforma.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: "16px", color: "#F8FAFC", fontWeight: 600, marginBottom: "8px" }}>
                5. Foro e Legislação Aplicável
              </h2>
              <p>
                Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o Foro da Comarca de Chapecó, Estado de Santa Catarina, para dirimir quaisquer controvérsias decorrentes deste instrumento.
              </p>
            </section>
          </div>
        )}

        <div
          style={{
            marginTop: "40px",
            paddingTop: "20px",
            borderTop: "1px solid #1F2937",
            textAlign: "center",
            fontSize: "12px",
            color: "#64748B",
          }}
        >
          © 2026 69.553.990 FRANCISCO TAVEIRA RIOS • CNPJ: 69.553.990/0001-91 • MCT LTDA. Todos os direitos reservados. Chapecó - SC, Brasil.
        </div>
      </div>
    </main>
  );
};
