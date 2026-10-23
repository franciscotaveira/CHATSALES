# 📚 CATÁLOGO OPERACIONAL DE SOLUÇÕES N8N • MCT AUTOMAÇÕES
### Portfólio Soberano de Workflows Derivados de Engenharia Reversa (Meta-REA)
> **MCT OS v2.0** | Francisco Rios | Chapecó, SC  
> **Infraestrutura:** VPS Hostinger Cloud KVM 4 (`200.141.17.99`) • Engine: `n8n` (`automacao.automatizaprocessos.tech`)  
> **Filosofia:** Poder invisível, simplicidade visível • Truth in Data  

---

## 1. VISÃO ESTRATÉGICA DO CATÁLOGO

Este catálogo reúne as **8 soluções turnkey** concebidas através da metodologia Meta-REA, traduzindo o conhecimento técnico de mais de 23 repositórios abertos (fiscais, contábeis, jurídicos e trabalhistas) em **workflows executáveis no n8n**.

Cada solução segue a arquitetura **Screen-to-Workflow (S2W)**:
1. **Especificação declarativa (`.spec.md`)** na pasta [`specs/`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/);
2. **Compilador soberano** ([`scripts/compile-spec-to-n8n.mjs`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/scripts/compile-spec-to-n8n.mjs)) que gera o JSON canônico do n8n;
3. **Deploy em 1 comando** diretamente na VPS (`--deploy`);
4. **Interface no WhatsApp ou Telegram**: zero treinamento para o cliente final.

---

## 2. GRADE DE SOLUÇÕES TURNKEY

| Código | Nome da Solução | Nicho Alvo | Gatilho (Trigger) | Dor Eliminada | Repositórios Base |
|---|---|---|---|---|---|
| **CONT-01** | Triagem e Arquivamento Documental | Escritórios Contábeis e PMEs | WhatsApp Webhook (Mídia) | Fim dos comprovantes perdidos em conversas privadas | `marcosdiez/contabilizei`, `PyNFe` |
| **CONT-02** | Conciliação Extrato OFX x Notas | Financeiro e Contabilidade | WhatsApp Webhook (Arquivo .OFX) | 35h/mês de digitação manual de extrato eliminadas | `marcosdiez/contabilizei`, `wandersonwhcr/balance` |
| **ENG-01** | Dossiê de Portaria & SST (Obras) | Construtoras e Indústrias | WhatsApp Webhook (ASO/NRs) | Risco de embargo e autuação por terceirizado sem ASO | `ctresb/leis` (NR-07, NR-18, NR-35) |
| **FROT-01** | Compliance e Liberação de Frotas | Transportadoras e Logística | WhatsApp Webhook (CNH/ANTT) | Caminhões parados em barreira fiscal por documento vencido | `Hercules-NET/ZeusFiscal` (MDF-e/CT-e) |
| **ONB-01** | Provisionador Zero-Touch de Clientes | Operação Interna MCT | Telegram / CLI (`/provisionar`) | Setup manual de pastas, banco e links (de 30min para 1.8s) | `mct_drive_manager`, PostgreSQL VPS |
| **LICIT-01**| Radar PNCP de Licitações + CND | Construtoras, Serviços e TI | Cron Diário (06h30 AM) | Desclassificação em editais por certidão vencida | `Licitei/dados-publicos-mcp`, `mct_cnd_sentinel` |
| **RH-01**   | Admissão Digital e eSocial | RH, Comércio e Construção | WhatsApp Webhook (Docs Pessoais) | 2h de digitação por funcionário admitido | `themisterpaps/SGRH`, `michelej/sisnom`, `CLT` |
| **FISC-01** | Auditoria de Monofásicos & ICMS-ST | Autopeças, Farmácias, Bebidas | Google Drive / Webhook (XML) | Pagamento indevido de PIS/COFINS no Simples Nacional | `DeHor-Labs/mcp-fiscal`, `ZeusFiscal`, `FiscalNet` |

---

## 3. DETALHAMENTO DE CADA WORKFLOW

### 📊 CONT-02: Conciliação Automática de Extrato OFX x Notas Fiscais
- **Especificação:** [`specs/CONT-02-conciliacao-extrato-ofx.spec.md`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/CONT-02-conciliacao-extrato-ofx.spec.md)
- **JSON Compilado:** [`specs/CONT-02-conciliacao-extrato-ofx.n8n.json`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/CONT-02-conciliacao-extrato-ofx.n8n.json)
- **O que faz:**
  1. O financeiro envia o arquivo `.ofx` no grupo do WhatsApp da contabilidade;
  2. O nó Code do n8n parseia débitos e créditos com limpeza de ruídos bancários;
  3. O nó Postgres cruza as saídas com o acervo de notas fiscais armazenadas no Google Drive;
  4. Devolve no chat: *"Extrato conciliado com 94% de match. Faltam apenas 3 comprovantes (R$ 120, R$ 450, R$ 89). Responda com a foto deles para fechamento."*
- **Impacto no Cliente:** O fechamento contábil que demorava até o dia 15 é antecipado para o dia 3.

---

### 🏛️ LICIT-01: Radar Autônomo de Licitações Públicas (PNCP) com Alerta de CND
- **Especificação:** [`specs/LICIT-01-radar-pncp-editais.spec.md`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/LICIT-01-radar-pncp-editais.spec.md)
- **JSON Compilado:** [`specs/LICIT-01-radar-pncp-editais.n8n.json`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/LICIT-01-radar-pncp-editais.n8n.json)
- **O que faz:**
  1. Roda automaticamente de segunda a sexta às 06:30 AM via cron;
  2. Consulta a API de dados abertos do PNCP filtrando oportunidades em Santa Catarina e região de Chapecó;
  3. Cruza os objetos dos editais com o portfólio de produtos e serviços do cliente;
  4. Executa a checagem das CNDs (FGTS Caixa, CNDT Trabalhista e Receita Federal);
  5. Despacha no Telegram da diretoria: edital resumido com link oficial e garantia de regularidade documental.

---

### 👥 RH-01: Admissão Digital de Colaboradores e Validação eSocial
- **Especificação:** [`specs/RH-01-admissao-trabalhista-esocial.spec.md`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/RH-01-admissao-trabalhista-esocial.spec.md)
- **JSON Compilado:** [`specs/RH-01-admissao-trabalhista-esocial.n8n.json`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/RH-01-admissao-trabalhista-esocial.n8n.json)
- **O que faz:**
  1. O candidato envia fotos dos documentos pelo WhatsApp (RG/CNH, CPF, CTPS digital, comprovante de residência);
  2. Nó LangChain Agent com OCR extrai todos os campos exigidos pelo evento S-2200 do eSocial;
  3. Organiza os arquivos na pasta restrita do colaborador no Google Drive sob regras da LGPD;
  4. Cadastra a ficha no PostgreSQL e gera o contrato de trabalho em PDF pronto para assinatura digital via Gov.br.

---

### 🔍 FISC-01: Auditoria Preventiva de XML NF-e (Monofásicos & ICMS-ST)
- **Especificação:** [`specs/FISC-01-auditoria-xml-nfe.spec.md`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/FISC-01-auditoria-xml-nfe.spec.md)
- **JSON Compilado:** [`specs/FISC-01-auditoria-xml-nfe.n8n.json`](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/specs/FISC-01-auditoria-xml-nfe.n8n.json)
- **O que faz:**
  1. Disparado no momento em que um arquivo `.xml` cai na pasta do Google Drive ou é recebido no chat;
  2. Decompõe todos os itens da nota fiscal (NCM, CFOP, CST, valores de PIS, COFINS e ICMS);
  3. Cruza com a matriz tributária de produtos monofásicos (Lei 10.147/2000) e ICMS-ST;
  4. Alerta imediatamente se o cliente do Simples Nacional estiver tributando PIS/COFINS em duplicidade, estimando o valor recuperável em reais.

---

## 4. COMO COMPILAR E IMPLANTAR NA VPS EM 1 COMANDO

Para compilar e subir qualquer solução diretamente no n8n da VPS Hostinger KVM 4:

```bash
# Compilar qualquer spec em n8n.json:
node scripts/compile-spec-to-n8n.mjs specs/CONT-02-conciliacao-extrato-ofx.spec.md

# Deploy direto no banco do n8n na VPS:
node scripts/compile-spec-to-n8n.mjs specs/CONT-02-conciliacao-extrato-ofx.spec.md --deploy
```

---

_MCT OS v2.0 • Poder invisível, simplicidade visível • MCT LTDA 2026_
