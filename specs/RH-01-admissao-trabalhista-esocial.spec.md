---
id: RH-01-admissao-trabalhista-esocial
titulo: Admissão Digital de Colaboradores e Validação eSocial via WhatsApp
empresa: MCT DocOps • Recursos Humanos & Pessoal
versao: 1.0.0
canal_entrada: whatsapp
trigger_tipo: webhook
responsavel: Francisco Rios
tags: [rh, admissao, esocial, clt, whatsapp, lgpd, ocr]
---

# 1. Visão Geral da Rotina
O encarregado de obra ou gestor de departamento envia o comando de contratação no WhatsApp. O candidato recebe uma mensagem acolhedora com link direto ou instrução para envio de fotos dos documentos (RG/CNH, CPF, Carteira de Trabalho Digital, Comprovante de Residência e certidão de dependentes). A automação faz o OCR soberano com validação de regras da CLT e campos obrigatórios do eSocial, arquiva com segurança no Google Drive sob governança LGPD e devolve a ficha cadastral preenchida com o contrato de trabalho gerado em PDF pronto para assinatura Gov.br.

---

# 2. Mapeamento de Telas & Ações

<!-- @n8n:trigger type="n8n-nodes-base.webhook" httpMethod="POST" path="intake-admissao-rh" name="Inbound WhatsApp Admissao" -->
## [TELA 1: Inbound WhatsApp do Candidato]
- **Origem:** Conversa do candidato no WhatsApp comercial da empresa.
- **Entrada:** Fotos ou PDFs de documentos pessoais (RG/CNH, CPF, Título, PIS, Comprovante de Residência).
- **Ação:** Identificação do número de telefone, recuperação da vaga/empresa vinculada e captura dos anexos de mídia.

<!-- @n8n:node type="@n8n/n8n-nodes-langchain.agent" name="Extrator de Documentos de Pessoal NVIDIA" -->
## [TELA 2: OCR Estruturado & Validação Trabalhista]
- **Origem:** Imagens binárias dos documentos.
- **Ação (baseado em `themisterpaps/SGRH` e `ctresb/leis`):**
  - Execução de OCR para leitura dos campos do eSocial (Eventos S-2200 - Admissão de Trabalhador);
  - Extração: Nome completo, CPF, Data de Nascimento, Filiação, Número/Série CTPS, PIS/PASEP, Estado Civil, Grau de Instrução, Endereço com CEP;
  - Validação de dígito verificador do CPF e PIS;
  - Validação de maioridade e aptidão trabalhista pela CLT.

<!-- @n8n:node type="n8n-nodes-base.googleDrive" name="Pasta Segura do Colaborador no Drive" operation="upload" -->
## [TELA 3: Arquivamento e Conformidade LGPD]
- **Destino:** Google Drive Soberano da empresa (baseado em `niagalves/guia-basico-LGPD`).
- **Pasta:** `/Contabilidade/{{empresa_slug}}/04_Folha_e_FGTS/Admissoes/{{colaborador_slug}}/`
- **Ação:** Renomear arquivos para formato canônico: `CPF_RG_Frente.jpg`, `CPF_Comprovante_Residencia.pdf`, etc.
- **Segurança:** Acesso restrito à Service Account soberana.

<!-- @n8n:node type="n8n-nodes-base.postgres" operation="executeQuery" name="Cadastro de Ficha no Banco de Dados" -->
## [TELA 4: Registro da Ficha Cadastral]
- **Destino:** Banco de dados PostgreSQL da VPS.
- **Ação (baseado em `michelej/sisnom`):**
  - Inserir na tabela de admissões com salário base, cargo, CBO correspondente, regime de contratação (CLT/PJ) e parâmetros de cálculo de INSS e IRRF;
  - Gerar ID único de admissão: `ADM-{{ano}}-{{id}}`.

<!-- @n8n:node type="n8n-nodes-base.httpRequest" name="Despacho Contrato e Boas-Vindas" method="POST" url="https://chat.automatizaprocessos.tech/api/v1/webhook" -->
## [TELA 5: Confirmação e Contrato de Trabalho]
- **Destino:** WhatsApp do candidato e do RH.
- **Mensagem ao Candidato:**
  > "🎉 *DOCUMENTAÇÃO CONFERIDA COM SUCESSO!*\n\n"
  > "Olá, {{primeiro_nome}}! Seus documentos foram validados e sua ficha de admissão na *{{empresa_nome}}* está pronta.\n\n"
  > "📄 *Seu Contrato de Trabalho foi gerado:*\n"
  > "👉 [Acessar Contrato para Assinatura Gov.br]({{url_contrato_pdf}})\n\n"
  > "Seja muito bem-vindo à equipe!"
- **Alerta ao RH:** Ficha completa de admissão despachada no e-mail/painel pronta para transmissão no eSocial.

<!-- @n8n:errorHandler type="n8n-nodes-base.postgres" table="rh_admissao_errors" name="Handler de Excecoes de Pessoal" -->
## [TELA 6: Tratamento de Erros e Documentos Ilegíveis]
- Se alguma foto estiver ilegível (ex: reflexo na foto do RG ou CPF rasurado), responde educadamente no WhatsApp solicitando o reenvio apenas do documento problemático.
