# 🏛️ ENCICLOPÉDIA META-REA: DECODIFICAÇÃO DOS 23 REPOSITÓRIOS
### Framework Soberano de Engenharia Reversa Aplicada a Negócios, Contabilidade, Jurídico e Faturamento
> **MCT OS v2.0** | Francisco Rios | Chapecó, SC  
> **Filosofia:** Poder invisível, simplicidade visível • Truth in Data  

---

## 1. INTRODUÇÃO E OBJETIVO ESTRATÉGICO
Este documento consolida a análise técnica e estratégica de 23 repositórios de código aberto cobrindo Legislação Brasileira, Motores Fiscais (NF-e, NFC-e, CT-e, MDF-e), Sistemas Contábeis, Algoritmos de Folha de Pagamento e Servidores MCP.

O objetivo é extrair regras de negócio determinísticas e integrá-las à infraestrutura soberana da MCT Automações (VPS Hostinger Cloud KVM 4, Caddy 2, PostgreSQL, n8n e Tavibot/Hermes), gerando produtos de automação de alto impacto para PMEs, contabilidades, construtoras e transportadoras.

---

## 2. MAPA SINTÉTICO DOS 23 REPOSITÓRIOS

| # | Repositório | Área | Ouro Oculto Decodificado |
|---|---|---|---|
| **01** | `ctresb/leis` | Legislação | Dicionário de normas e prazos em texto parseável (CLT, CC, CTN) |
| **02** | `felvieira/api-legislacao` | API Legislativa | Endpoints REST para consulta de tramitações e vigência de leis |
| **03** | `Licitei/dados-publicos-mcp` | MCP Licitações | Servidor MCP para consultar editais, pregões e compras governamentais |
| **04** | `cgamboa-fisher/Skill-Juridico-BR` | Agente Jurídico | Prompts, ontologia processual e contagem de prazos (CPC/CLT) |
| **05** | `thiagotpc/legislacao-ti-brasil` | Marco Civil/TI | Regulamentação de software, guarda de logs e contratos digitais |
| **06** | `pablovercosa/custo-brasil` | Custos/Encargos | Fórmulas matemáticas de encargos trabalhistas, FGTS, férias e 13º |
| **07** | `wmixvideo/nfe` | NF-e / CT-e / MDF-e | Schemas XML oficiais e validação de contingência e comunicação SEFAZ |
| **08** | `Hercules-NET/ZeusFiscal` | Padrão Ouro Fiscal | Matriz completa de tributos (ICMS, PIS/COFINS, IPI, ST, DIFAL e Reforma) |
| **09** | `DeHor-Labs/mcp-fiscal-brasil` | MCP Fiscal IA | Ferramentas MCP para LLMs validarem NCM, CFOP, CST e alíquotas |
| **10** | `sacfiscal/FiscalNet_old` | Cálculos Fiscais | Algoritmo determinístico de ICMS-ST, MVA e Redução de Base |
| **11** | `Engenere/BrazilFiscalReport` | Relatórios Fiscais | Motor de geração de DANFE, DACTE e extratos SPED em PDF |
| **12** | `LukasMeine/emissor-nota-fiscal` | Emissor Leve | Fluxo enxuto de assinatura e transmissão de NFS-e / NF-e |
| **13** | `TadaSoftware/PyNFe` | Assinatura Python | Comunicação direta SEFAZ com certificado A1 sem dependências externas |
| **14** | `niagalves/guia-basico-LGPD` | LGPD | Modelos de consentimento, bases legais e termo de guarda de dados |
| **15** | `rogeriob2br/leis-brasileiras` | Leis Federais | Banco de dados consolidado de leis federais e resoluções normativas |
| **16** | `hiltonbruce/Igreja` | Terceiro Setor | Regras contábeis de dízimos, ofertas, recibos de doação e imunidade |
| **17** | `sandeco/contabilidade` | Contábil Python | Plano de contas, partidas dobradas, razão, diário e DRE matemática |
| **18** | `themisterpaps/SGRH` | Gestão RH | Estrutura de cargos, salários, faltas, férias e prontuário de pessoal |
| **19** | `michelej/sisnom` | Folha de Pagamento | Motor de cálculo de proventos, descontos de INSS progressivo e IRRF |
| **20** | `kplian/sis_contabilidad` | Contabilidade Web | Centros de custo, balancetes de verificação e auditoria contábil |
| **21** | `wandersonwhcr/balance` | Conciliação | Algoritmo de cruzamento de saldos bancários com livros fiscais |
| **22** | `marcosdiez/contabilizei` | Automação Contábil | Automação de extratos bancários, rotinas de conciliação e fechamento |
| **23** | `AndresRamos/Contpaqi.Sdk.Contabilidad`| Integração ERPs | SDK para comunicar com bancos de dados de sistemas contábeis legados |

---

## 3. AS 4 SUPER-CONEXÕES OPERACIONAIS NO ECOSSISTEMA MCT

### A. Super-Sistema 1: Conciliador de Extratos e Fechamento Contábil (PLX M02B)
- **Fundação:** `marcosdiez/contabilizei` + `wandersonwhcr/balance` + `Hercules-NET/ZeusFiscal`.
- **Mecânica:**
  1. O cliente anexa o arquivo `.ofx` ou `.pdf` do extrato bancário no grupo de WhatsApp da contabilidade;
  2. O script na VPS lê as transações bancárias e cruza com a chave de acesso das NF-e/NFS-e armazenadas no Google Drive da empresa;
  3. Gera o balancete conciliado de 90%+ das saídas;
  4. Para as saídas sem nota correspondente, o Tavibot dispara cobrança pontual no WhatsApp: *"Detectamos pagamento de R$ 380,00 no dia 14 para o Fornecedor X. Por favor, envie a foto do comprovante para conclusão do balanço."*

### B. Super-Sistema 2: Radar de Licitações B2G com CND Preventiva
- **Fundação:** `Licitei/dados-publicos-mcp` + `mct_cnd_sentinel.py` + `cgamboa-fisher/Skill-Juridico-BR`.
- **Mecânica:**
  1. Diariamente às 06:30 AM, o worker consulta a API do PNCP para as cidades de atuação do cliente (Chapecó e região);
  2. Filtra editais pelo CNAE e catálogo de produtos cadastrados no PostgreSQL;
  3. Verifica a regularidade das CNDs (FGTS, CNDT e Receita Federal);
  4. Alerta a diretoria no Telegram com link do edital e atestado de aptidão das certidões.

### C. Super-Sistema 3: Emissão Fiscal Soberana Pós-Pix (Chat Sales V3)
- **Fundação:** `TadaSoftware/PyNFe` + `DeHor-Labs/mcp-fiscal-brasil` + `AbacatePay`.
- **Mecânica:**
  1. O cliente compra no balcão do SOS Vendas ou via WhatsApp e paga o Pix;
  2. O webhook confirma o pagamento e dispara a Meta Conversions API (CAPI v26.0);
  3. Imediatamente, o script em Python assina o XML da NF-e com o certificado A1 da empresa e transmite à SEFAZ;
  4. O DANFE em PDF é gerado localmente via `BrazilFiscalReport` e enviado ao WhatsApp do comprador em <3 segundos.

### D. Super-Sistema 4: Admissão e eSocial Zero-Touch no WhatsApp
- **Fundação:** `themisterpaps/SGRH` + `michelej/sisnom` + `ctresb/leis` (CLT).
- **Mecânica:**
  1. Encarregado envia `/admitir [Nome] [Cargo] [Salário]`;
  2. Candidato recebe mensagem no WhatsApp pedindo fotos dos documentos;
  3. Motor neural (Nemotron OCR) extrai CPF, PIS, RG, CTPS e dados de dependentes;
  4. Valida contra regras trabalhistas da CLT e eSocial, monta a ficha de registro e gera o contrato de trabalho pronto para assinatura digital Gov.br.

---

## 4. CONCLUSÃO & PRÓXIMOS PASSOS
Esta base enciclopédica estabelece o roadmap de expansão técnica da MCT Automações para os próximos 12 meses, garantindo que qualquer nova demanda de clientes possa ser resolvida reutilizando lógica aberta já testada, combinada com a agilidade do WhatsApp e a robustez da nossa infraestrutura soberana na VPS Hostinger KVM 4.
