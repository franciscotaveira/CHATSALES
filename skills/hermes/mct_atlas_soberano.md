# ATLAS SOBERANO MCT LTDA — CONTEXTO MACRO & MAPA TÉCNICO

> **MCT LTDA | Chapecó, SC | Francisco Rios**  
> **VPS Hostinger Cloud KVM 4:** `200.141.17.99` (Campinas, SP)  
> **Domínio Soberano:** `automatizaprocessos.tech`  
> **DNS Gerenciado:** Hostinger API (developers.hostinger.com)

---

## 1. Topologia das Ilhas na VPS

A VPS roda Caddy 2 como reverse proxy unificado na borda (portas 80 e 443 com Let's Encrypt automático) roteando para 3 ilhas totalmente isoladas por redes Docker:

1. **Ilha SOS Vendas (`/opt/chat-sales`):**
   * Rede: `sos-sales-network`
   * URL: `https://chat.automatizaprocessos.tech`
   * Banco: PostgreSQL 16 (`sos-sales-postgres`) com dados preservados de 16.692 mensagens, 891 threads, 841 contatos e 30 workspaces.
   * Motor de Mensageria: WAHA (`sos-sales-waha`) porta interna 3000.
   * Gateway de Pagamentos: AbacatePay v2 com HMAC timing-safe e fallback Pix transparente.
   * Catálogo de Modelos: 70+ templates de mensagens homologados.

2. **Ilha PLX Contabilidade & n8n (`/opt/plx-documentos`):**
   * Rede: `plx-network`
   * URL: `https://automacao.automatizaprocessos.tech` (n8n Editor) e `/operacao/` (Painel)
   * Banco: PostgreSQL 16 (`plx-n8n-db`) com 148 tabelas, Data Tables de checklist (`data_table_user_chkrulesv1taveira`, `data_table_user_chkrunsv1taveira`, `data_table_user_3xiyVdhcSZl6qzP8`).
   * Scripts no Host: `/opt/plx-documentos/app/scripts/`
     - `mct_client_onboarding.py` (Onboarding e provisionamento)
     - `mct_industrial_compliance_engine.py` (Compliance de obras e SST)
     - `mct_drive_manager.py` (Gestão soberana de Google Drive via Service Account)
     - `plx_checklist_engine.py` (Auditoria contábil M02B)
     - `/usr/local/bin/plx-workflow-deployer` (Injetor de workflows no n8n)

3. **Ilha Hermes Agent (`/opt/hermes-island`):**
   * Runtime: Hermes Agent v0.22.4 (Python 3.14)
   * Modelo: `nvidia/nemotron-3-ultra-550b-a55b` via NVIDIA NIM (`NVIDIA_API_KEY`)
   * Papel: Orquestrador executivo e secretário geral da infraestrutura.

---

## 2. Repositório Soberano de Google Drive

* **Conta Master:** `sosautomatiza@gmail.com`
* **Pasta Raiz Master:** `MCT Clientes` (ID: `1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4`)
* **Service Account Autônoma:** `mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`
* **Credencial na VPS:** `/opt/plx-documentos/credentials/google-service-account-mct.json`
* **Propriedade:** Chave RSA sem expiração de token.

---

## 3. Verticais de Negócio Ativas

1. **MCT DocOps Construtoras:**
   * Triagem de documentos via WhatsApp.
   * Arquivamento automático na árvore do Drive (`00_Dossie_Geral`, `01_Obras`, `02_Colaboradores`).
   * Validação de validades de ASO, NRs (NR-35, NR-33, NR-10) e CNDs para liberação imediata na portaria da **Aurora Coop, BRF, Tirol e JBS**.
2. **PLX Contabilidade:**
   * Triagem de notas fiscais (NF-e, NFS-e), comprovantes Pix e extratos bancários.
   * Reconciliação com documentos no Drive.
3. **SOS Vendas (SaaS Comercial):**
   * Atendimento WhatsApp multi-agente, fechamento instantâneo via Pix AbacatePay, enriquecimento BrasilAPI.
