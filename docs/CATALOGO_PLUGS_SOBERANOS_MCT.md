# Catálogo Canônico de Plugs Soberanos — MCT OS v2.0

> **MCT LTDA | Francisco Taveira Rios | Chapecó - SC**  
> *Filosofia: Poder invisível, simplicidade visível. Truth in Data: dado real ou estado vazio, nunca ficção.*

---

## 🧭 MAPA DO ECOSSISTEMA DE PLUGS

A holding MCT opera uma esteira modular de **6 Macro Plugs de Negócio** e um **Squad de 6 Micro-Plugs Conversacionais**, cobrindo o ciclo completo de caixa de PMEs, frotas e indústrias no Sul do Brasil:

```
┌────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ECOSSISTEMA MCT OS v2.0                                      │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. MCT TAX SOVEREIGN ─────> Auditoria de XMLs, PIS/COFINS monofásico e restituição 60 meses   │
│ 2. MCT B2G TURNKEY ───────> Caçador de editais PNCP, mesa sniper e co-gestão (Lei 14.133/21)  │
│ 3. MCT CENTRAL COMPRAS ───> Equalização tributária (Súmula 432 STJ) e cotação direta usinas   │
│ 4. MCT SOS VENDAS ────────> Gestão de tráfego corporativo e atendimento 24/7 via WhatsApp WAHA │
│ 5. MCT FROTAS NIC ────────> Blindagem contra Multa NIC (Art. 257 CTB) e automação do FICI      │
│ 6. MCT STOCKVISION ───────> Auditoria visual de inventário por câmera com fotos SHA-256        │
├────────────────────────────────────────────────────────────────────────────────────────────────┤
│ SQUAD MICRO-PLUGS WHATSAPP: Fiscal • Cobrança • Anti-Faltas • Reativação • Coletor • Avaliações│
└────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. PLUG 01: MCT TAX SOVEREIGN (Inteligência Tributária & Recuperação)

* **Código:** `PLUG-TAX-01`
* **Nicho-Alvo:** Autopeças, truck centers, transportadoras, clínicas médicas/odontológicas e construtoras do Simples Nacional e Lucro Presumido.
* **Dor que Resolve:** Bitributação indevida de PIS/COFINS e ICMS-ST em produtos monofásicos já recolhidos na indústria/importador, além de presunção inflada de IRPJ em serviços cirúrgicos.
* **Modelo Comercial:** **100% Variável / Gain-Share** (Risco Zero):
  - **25% de Success Fee** sobre o crédito retroativo homologado dos últimos 60 meses (PER/DCOMP Web).
  - **20% sobre a economia mensal recorrente** blindada nos 12 meses seguintes.
  - Zero taxa de adesão, zero mensalidade.
* **Blindagem Jurídica & Co-Working Contábil:**
  - Operação estrita como **TaxTech / Provedora de Software e Inteligência de Dados** (CNAEs 62.01 e 63.11).
  - Procedimento puramente administrativo perante a Receita Federal: sem necessidade de OAB (restrita a litígios judiciais) e sem necessidade de CRC (restrito à escrituração contábil anual).
  - **Repasse de 10% a 20% do Success Fee para o contador do cliente**: neutraliza ciúme corporativo e transforma o contador em parceiro promotor.
* **As 5 Teses Estatutárias:**
  1. *STF Súmula Vinculante 31:* 0% ISS sobre locação pura de maquinário e equipamentos pesados.
  2. *STJ Súmula 432:* Não incidência de ICMS-ST/DIFAL sobre insumos de construção civil e pavimentação.
  3. *STJ Tema 779:* Pneus, óleos lubrificantes e peças em transportadoras são insumos essenciais (9,25% PIS/COFINS).
  4. *STJ Tema 125 (Equiparação Hospitalar):* Clínicas com procedimentos cirúrgicos/invasivos e alvará sanitário reduzem IRPJ de 32% para 8% no Presumido.
  5. *Decreto-Lei 406/1968 (SUP):* Sociedades Uniprofissionais recolhem ISS fixo anual em vez de 5% sobre receita bruta.
* **Arquitetura Técnica:**
  - Engine: `app/core/xml_tax_parser.py` (parser regex de alta performance, sem dependência de libexpat/C).
  - Interface: `app/static/tributario.html` publicado em `https://b2g.automatizaprocessos.tech/tributario.html`.
  - Minerador: `scripts/minerar_leads_chapeco_live.py` (BrasilAPI live).
* **Pre-Mortem (Risco & Vacina):**
  - *Risco:* Cliente não saber exportar XMLs do ERP.
  - *Vacina:* Aceitar o chave de acesso de 44 dígitos da nota impressa ou importar diretamente do e-mail do fornecedor.
* **Status Atual:** **PRODUÇÃO (100% Homologado na VPS)**.

---

## 2. PLUG 02: MCT B2G TURNKEY & RADAR (Compras Públicas & Licitações)

* **Código:** `PLUG-B2G-02`
* **Nicho-Alvo:** Prestadores de serviços especializados (ex: aplicação de películas, ar condicionado, pintura predial, frotas) e distribuidores de insumos.
* **Dor que Resolve:** Dificuldade do pequeno/médio empresário em operar a burocracia pesada do PNCP, Compras.gov.br e portais municipais, perdendo contratos milionários do governo.
* **Modelo Comercial:**
  - **Co-Gestão Turnkey:** A MCT assume 100% da inteligência, monitoramento de editais, montagem da proposta e operação dos lances; o parceiro entra exclusivamente como executor técnico do serviço.
  - **Remuneração por Êxito:** **12% a 15% de Success Fee** incidente exclusivamente sobre os valores pagos pelo órgão público (repasse em até 5 dias após a liquidação na conta do parceiro).
  - Sem mensalidade, sem taxa de setup.
* **Doutrina Anti-Bypass ("Não Entregar o Ouro"):**
  - Ocultação mandatória de número de edital, processo e hash do PNCP em qualquer dossiê preliminar.
  - Identificação por código interno (`MCT-B2G-UF-ANO/TAG-SEQ`).
  - Pasta isolada por cliente em `docs/representacao_consultoria_b2g/clientes/<slug>/`.
  - Contrato assinado com força de Título Executivo Extrajudicial (Art. 784, III do CPC).
* **Arquitetura Técnica:**
  - Engine de Varredura: `app/core/pncp_service.py` com backoff exponencial contra HTTP 429 (`_safe_pncp_get`).
  - Robô Sniper: `app/core/bidding_sniper.py` com trava de Hard Stop Loss (18% de margem mínima líquida protegida).
  - Cockpit Web: `app/static/compras.html` e `app/static/index.html`.
* **Pre-Mortem (Risco & Vacina):**
  - *Risco:* Parceiro ser tentado a atravessar a MCT e dar lances por conta própria.
  - *Vacina:* Retenção da inteligência técnica até a assinatura da autorização com multa penal expressa de 30% do valor do contrato em caso de desvio de canal.
* **Status Atual:** **PRODUÇÃO (Piloto ativo: Chapecó Películas LTDA, Issue Linear MCT-18)**.

---

## 3. PLUG 03: MCT CENTRAL DE COMPRAS B2B (Procurement Desk & Arbitragem)

* **Código:** `PLUG-PROC-03`
* **Nicho-Alvo:** Construtoras civis, loteadoras, pavimentadoras e transportadoras de cargas.
* **Dor que Resolve:** Cotação pulverizada no varejo com margem de lucro comprimida e bi-tributação interestadual de ICMS-ST / DIFAL em insumos pesados.
* **Modelo Comercial:**
  - **Fee de Intermediação / Arbitragem:** **8% a 15%** faturado direto com as indústrias/usinas parceiras ou split de economia gerada para o comprador.
  - **Equalização Fiscal Súmula 432 STJ:** Eliminação legal da cobrança de ICMS-ST e DIFAL na compra interestadual de materiais aplicados em obras de construção civil.
* **Arquitetura Técnica:**
  - Engine: `app/core/private_works_timeline.py` e `app/core/tax_arbitrage_engine.py`.
  - Curva ABC & Decomposição SINAPI: desmembramento automatizado de insumos Classe A (cimento, aço, tubos PEAD).
  - Base de Fornecedores: Cruzamento de 203 usinas e distribuidores homologados no Sul com prazo faturado.
* **Pre-Mortem (Risco & Vacina):**
  - *Risco:* Inadimplência do comprador com a indústria.
  - *Vacina:* A MCT não toma risco financeiro nem financia pedidos: o faturamento é direto da indústria para o comprador sob análise de crédito fabril.
* **Status Atual:** **PRODUÇÃO (Integrado ao Cockpit B2G)**.

---

## 4. PLUG 04: MCT SOS VENDAS / WHATSAPP SOVEREIGN (Atendimento 24/7 & Inbound)

* **Código:** `PLUG-WPP-04`
* **Nicho-Alvo:** Empresas de serviços locais, clínicas, imobiliárias, concessionárias e locadoras de máquinas.
* **Dor que Resolve:** Perda de leads e oportunidades por demora de horas no atendimento manual do WhatsApp, especialmente fora do horário comercial.
* **Modelo Comercial:**
  - **Setup Inicial:** R$ 1.500,00 a R$ 3.000,00 à vista (implantação e treinamento do fluxo).
  - **Mensalidade Recorrente (MRR):** R$ 490,00 a R$ 890,00/mês para manutenção da infraestrutura e monitoramento.
* **Arquitetura Técnica:**
  - Gateway de Mensageria: Container `sos-sales-waha` na VPS Hostinger (`200.141.17.99`), rodando sessão oficial conectada ao WhatsApp corporativo.
  - Ouvido Inteligente & Pacing Governor: `app/core/procurement_automation.py` com simulação de latência humana (3 a 7 min) para blindagem anti-ban da Meta.
  - Transcrição Local de Áudios: `whisper-asr` integrado para leitura de mensagens de voz.
* **Pre-Mortem (Risco & Vacina):**
  - *Risco:* Bloqueio de número pelo sistema anti-spam da Meta.
  - *Vacina:* Operação estritamente inbound ou com disparos ativos controlados por Pacing Governor, jitter aleatório e aquecimento gradual do chip.
* **Status Atual:** **PRODUÇÃO (Sessão conectada na VPS)**.

---

## 5. PLUG 05: MCT FROTAS NIC SENTINEL (Gestão de Multas & Blindagem PJ)

* **Código:** `PLUG-NIC-05`
* **Nicho-Alvo:** Empresas com frota própria (transportadoras, distribuidoras, locadoras, empreiteiras) com mais de 5 veículos cadastrados em CNPJ.
* **Dor que Resolve:** A devastadora **Multa NIC (Não Indicação do Condutor - Art. 257, § 8º do CTB)**, que duplica e multiplica o valor de cada infração cometida por veículos PJ quando o condutor não é identificado no prazo de 30 dias da Notificação de Autuação (NA).
* **Modelo Comercial:**
  - **Taxa por Placa / Veículo:** R$ 25,00 a R$ 45,00/veículo/mês (recorrência pura).
  - **Taxa de Sucesso em Recursos Administrativos:** 20% a 30% sobre o valor das penalidades canceladas.
* **Arquitetura Técnica:**
  - Varredura de Infrações: Leitura automática dos portais Detran/Senatran e emissão do Formulário de Identificação do Condutor Infrator (FICI).
  - Sentinela de Prazos: Alerta automático via WhatsApp no D-15 e D-5 antes do vencimento da indicação.
* **Pre-Mortem (Risco & Vacina):**
  - *Risco:* O gestor da frota não saber qual motorista estava dirigindo no momento da infração.
  - *Vacina:* Vínculo preventivo de escalas de motoristas via bot do WhatsApp (check-in de chave/veículo).
* **Status Atual:** **SKILL HOMOLOGADA (Mapeado no Ecossistema MCT)**.

---

## 6. PLUG 06: MCT STOCKVISION (Auditoria Visual & Inventário Cego)

* **Código:** `PLUG-STOCK-06`
* **Nicho-Alvo:** Depósitos de materiais de construção, distribuidoras de autopeças e indústrias com estoques pesados e dispersos.
* **Dor que Resolve:** Furos de estoque, desvios internos, divergências de inventário manual e retrabalho na contagem física de mercadorias.
* **Modelo Comercial:**
  - **Setup de Implantação:** R$ 3.000,00 a R$ 5.000,00.
  - **Licenciamento SaaS:** R$ 1.800,00 a R$ 3.500,00/mês por unidade/galpão auditado.
* **Arquitetura Técnica:**
  - Host VPS: `/opt/stock-vision` (container `stock-vision-app` em `127.0.0.1:4500` servido via Caddy).
  - MediaVault SHA-256: Fotos reais de conferência registradas com carimbo de tempo e hash criptográfico imutável.
  - Interface Híbrida: Alternância instantânea entre `🖼️ Estante Visual` e `📋 Tabela Contábil`.
* **Pre-Mortem (Risco & Vacina):**
  - *Risco:* Estoquistas sabotarem o processo por medo de fiscalização.
  - *Vacina:* Posicionamento da ferramenta como salvaguarda da equipe, eliminando a responsabilidade de contagem manual e comprovando a inocência dos operadores.
* **Status Atual:** **PRODUÇÃO (Homologado na VPS com 55/55 testes Vitest)**.

---

## 7. SQUAD DE MICRO-PLUGS CONVERSACIONAIS (WhatsApp Plugs Hub)

Microsserviços especializados acionados sob demanda dentro das conversas de WhatsApp para resolver gargalos pontuais de operação:

| Micro-Plug | Objetivo | Gatilho Conversacional | Saída Gerada |
| :--- | :--- | :--- | :--- |
| **Fiscal Assistido** | Emissão e consulta rápida de NFS-e para prestadores MEI/ME | `"emitir nota para cliente X"` | Rascunho da NFS-e + Link de confirmação |
| **Cobrança Empática** | Régua preventiva de vencimento de boletos e Pix | `"enviar aviso de vencimento lote"` | Mensagem personalizada com código Pix copia-e-cola |
| **Guardião Anti-Faltas** | Confirmação ativa de consultas e procedimentos (Odonto/Saúde) | `"agenda de amanhã"` | Disparo D-1 com botões de [Confirmar] ou [Reagendar] |
| **Reativação de Clientes** | Resgate de clientes inativos há mais de 60 dias | `"disparar oferta clientes inativos"` | Convite exclusivo com oferta pontual de retorno |
| **Coletor Documental** | Recepção e triagem de documentos admissionais e fiscais (PLX) | `"enviar CNDs / holerites"` | OCR automático, validação de validade e upload em pasta |
| **Reputação Orgânica** | Convite ético de avaliação no Google Meu Negócio pós-atendimento | `"atendimento concluído com sucesso"` | Link direto de avaliação no Google sem filtros escusos |

---

## 📊 MATRIZ COMPARATIVA DE CICLO DE CAIXA & VELOCIDADE DE RETORNO

```
┌─────────────────────────┬──────────────────────┬──────────────────────┬──────────────────────┐
│ PLUG MCT                │ VELOCIDADE DO 1º CAIXA│ NATUREZA DA RECEITA  │ ESCALABILIDADE       │
├─────────────────────────┼──────────────────────┼──────────────────────┼──────────────────────┤
│ 1. MCT Tax Sovereign    │ 30 a 60 dias         │ Success Fee (Alto)   │ Altíssima (Software) │
│ 2. MCT B2G Turnkey      │ 15 a 45 dias         │ Success Fee Garantido│ Alta (Parcerias)     │
│ 3. MCT Central Compras  │ Imediato (no faturamento)│ Arbitragem / Split   │ Alta (Volume)        │
│ 4. MCT SOS Vendas       │ Imediato (Setup + MRR)│ Recorrência Mensal   │ Média (Atendimento)  │
│ 5. MCT Frotas NIC       │ Imediato (Recorrência)│ MRR por Placa        │ Altíssima (Contratos)│
│ 6. MCT StockVision      │ 30 a 45 dias         │ Setup + Licença SaaS │ Média (Galpões)      │
└─────────────────────────┴──────────────────────┴──────────────────────┴──────────────────────┘
```

---

*Catálogo Canônico de Plugs v2.0 • MCT LTDA • Chapecó, SC • 03/11/2026*
