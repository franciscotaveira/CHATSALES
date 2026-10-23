---
id: FISC-01-auditoria-xml-nfe
titulo: Auditoria Preventiva de XML NF-e com Detecção de Monofásicos e ICMS-ST
empresa: MCT Fiscal • Auditoria Tributária Soberana
versao: 1.0.0
canal_entrada: drive
trigger_tipo: webhook
responsavel: Francisco Rios
tags: [fiscal, nfe, xml, icms_st, monofasicos, tributario, drive]
---

# 1. Visão Geral da Rotina
Disparada sempre que novos arquivos XML de NF-e chegam na pasta monitorada do Google Drive ou são recebidos via WhatsApp. O fluxo parseia os nós fiscais de cada item (`<det>`, `<prod>`, `<imposto>`, `<ICMS>`, `<PIS>`, `<COFINS>`), cruza os NCMs com a tabela de produtos monofásicos (autopeças, bebidas, medicamentos) e regras de ICMS-ST. Se o emitente (optante do Simples Nacional ou Lucro Presumido) estiver tributando PIS/COFINS em produtos que deveriam ser segregados com alíquota zero, a automação emite um relatório preventivo de recuperação tributária imediata.

---

# 2. Mapeamento de Telas & Ações

<!-- @n8n:trigger type="n8n-nodes-base.webhook" httpMethod="POST" path="intake-xml-nfe" name="Inbound XML NF-e" -->
## [TELA 1: Inbound de XML Fiscal]
- **Origem:** Upload na pasta de notas do Google Drive ou envio de arquivo `.xml` no WhatsApp.
- **Entrada:** Arquivo XML válido com schema da SEFAZ (Modelo 55 ou 65).
- **Ação:** Validação da estrutura XML e extração da chave de acesso de 44 dígitos.

<!-- @n8n:node type="n8n-nodes-base.code" name="Parser Fiscal de Itens e Tributos" -->
## [TELA 2: Decomposição de Itens e Alíquotas]
- **Origem:** Estrutura XML da nota (baseado em `Hercules-NET/ZeusFiscal` e `wmixvideo/nfe`).
- **Ação:**
  - Extrair cabeçalho: CNPJ emitente, CNPJ destinatário, Data de Emissão, Regime Tributário (CRT: 1-Simples, 3-Normal);
  - Iterar sobre todos os produtos da tag `<det>`:
    - `cProd`: Código do produto
    - `xProd`: Descrição do produto
    - `NCM`: Nomenclatura Comum do Mercosul (8 dígitos)
    - `CFOP`: Código Fiscal de Operações e Prestações
    - `CST` ou `CSOSN`: Código de Situação Tributária
    - `vProd`: Valor do produto
    - `vICMS`, `vPIS`, `vCOFINS`: Valores destacados de imposto.

<!-- @n8n:node type="n8n-nodes-base.postgres" operation="executeQuery" name="Auditor de Monofasicos e ICMS-ST" -->
## [TELA 3: Cruzamento com Matriz Tributária Nacional]
- **Origem:** Banco de dados PostgreSQL da VPS (baseado em `DeHor-Labs/mcp-fiscal-brasil` e `sacfiscal/FiscalNet_old`).
- **Regras de Auditoria:**
  1. *Regra Monofásicos PIS/COFINS (Lei 10.147/2000):* Se o NCM pertence à lista de monofásicos e a empresa é do Simples Nacional, o CSOSN deve permitir segregação de receita (CST 04/06). Se tributou 100%, calcula o valor de imposto pago a mais.
  2. *Regra ICMS-ST:* Verifica se o CFOP utilizado é compatível com a operação (ex: 5.405 para substituído vs 5.102 para tributação integral).

<!-- @n8n:node type="n8n-nodes-base.googleDrive" name="Arquivamento Seguro do XML no Drive" operation="upload" -->
## [TELA 4: Arquivamento na Pasta Fiscal da Empresa]
- **Destino:** Google Drive Soberano da empresa.
- **Pasta:** `/Contabilidade/{{empresa_slug}}/{{competencia}}/02_Notas_Fiscais_NFe_NFSe/XMLs/`
- **Arquivo:** `{{chave_nfe}}-nfe.xml`

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Despacho Parecer Fiscal WhatsApp" method="POST" url="https://chat.automatizaprocessos.tech/api/v1/webhook" -->
## [TELA 5: Emissão de Alerta e Oportunidade Tributária]
- **Destino:** WhatsApp do contador e do financeiro da empresa.
- **Mensagem se houver inconsistência:**
  > "🛡️ *PARECER DE AUDITORIA FISCAL (NF-e {{numero_nota}})*\n\n"
  > "🏢 *Emitente:* {{razao_social}}\n"
  > "💰 *Valor Total:* R$ {{valor_total}}\n\n"
  > "🚨 *OPORTUNIDADE DE ECONOMIA TRIBUTÁRIA DETECTADA:*\n"
  > "• Identificamos {{total_itens_monofasicos}} item(ns) monofásico(s) tributado(s) integralmente (NCM: {{ncms_detectados}}).\n"
  > "• *Imposto pago a mais estimado:* R$ {{valor_recuperavel}}\n\n"
  > "💡 _Aviso enviado para que sua contabilidade faça a segregação correta no PGDAS e não pague imposto duplicado._"
- **Mensagem se 100% regular:** Apenas confirma o arquivamento com selo verde.

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="fiscal_audit_errors" name="Handler de Excecoes Fiscais" -->
## [TELA 6: Log de Auditoria]
- Armazena histórico completo de todas as notas fiscais auditadas para gerar relatórios de fechamento contábil.
