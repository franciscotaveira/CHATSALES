# Etapa 1B — contratos da API e autorização da IA

Data: 16/10/2026. Escopo autorizado: continuação da evolução guiada com REA explícito. Checkout codex/iteration-2.7, base HEAD 893569415f533ad9cbaf39e25122d6eb4988573a com alterações locais anteriores preservadas. Nenhuma publicação produtiva.

## Critérios e resultado

- **Verificado:** restaurar typecheck da API e do monorepo, sem suprimir diagnósticos ou enfraquecer tipos. pnpm exec turbo typecheck passou: 18 tarefas de 18 (16 em cache; API e web verificadas nesta execução).
- **Verificado com simulação:** campos gravados no embedded signup correspondem ao contrato real de encryptPayload e o material gravado é recuperável por decryptPayload. Chamada HTTP Fastify e criptografia reais; banco e respostas Meta substituídos no teste.
- **Verificado com simulação:** INSERT sem identificador de credencial ou sem linha de canal não retorna 201. A transação real não foi exercitada nesses testes; o teste não prova rollback PostgreSQL.
- **Verificado:** PUT ai-agent exige workspace:manage. Os papéis owner/admin são permitidos pela política existente; operator/manager/analyst/integration_service/support_auditor são recusados antes da escrita. Não foram criados papéis ou ampliadas permissões.
- **Verificado:** troca de código OAuth sem META_APP_SECRET recusa com 503 antes de chamar Meta ou abrir transação. Removido segredo padrão embutido nessa rota; não foi verificada sua vigência nem executada rotação em contas externas. A remoção desta ocorrência não certifica ausência de outros segredos no projeto/histórico.

## Mudanças

channels.routes.ts usa encryptedBase64, ivBase64, authTagBase64 e keyVersion, conforme o contrato existente. Guardas conferem os resultados de credencial/canal antes de usá-los. O segredo OAuth vem exclusivamente da configuração do servidor quando é necessária troca de code.

ai-agent.routes.ts adiciona app.requirePermission("workspace:manage") ao PUT de configuração. Os endpoints de leitura/simulação não foram alterados neste incremento. A UI de configuração ainda precisa refletir a permissão de edição; aqui a barreira é a API.

## Verificações

- 13 testes em apps/api/src/__tests__/ai-config-and-embedded-contract.test.ts passaram. Incluem cinco papéis negados, dois permitidos, ausência de autenticação, outro workspace, roundtrip criptográfico, OAuth sem segredo e resultados de persistência incompletos.
- Na criação do teste houve uma falha de importação por nome incorreto do plugin; o nome foi corrigido e a suíte passou. Essa falha não era do produto.
- API build passou (tsup); git diff --check passou.
- API local reconstruída e reiniciada no Compose chat-sales-guided-lab. Banco e Redis preservados; nenhum worker iniciado.
- HTTP real contra API 24400 e PostgreSQL do laboratório: identidade sintética temporária com membership operator e claim owner no JWT recebeu 403 ao tentar habilitar IA. Owner recebeu 200 ao salvar enabled=false; leitura posterior confirmou false. A identidade sintética foi removida ao final. Não foram alteradas senhas ou credenciais do usuário.
- Evidência: evidencias/etapa-1b-http.json. Reprodutor restrito a containers/URLs locais em laboratorio/verificar-autorizacao-ia.py; não imprimir JWT/segredos.

## REA

A correção parte da inspeção anterior em rea-investigacao.md. Nova análise estática após alterações: 3/3 arquivos parseados, 120.631 bytes, sem falha de parse. Recorte: ai-agent.routes.ts, channels.routes.ts e crypto-payload.ts.

Evidência pai: ev_1ed52f6e1b840fb225dc064d1d54a2ea45bf6907a76de32420d5c8e3a5616048. Resumo: ev_8dd08eaf3b2ef4e3246ab88f7ff60afb65f2b80a0bbb9ef1a70a859db4cd5b7d. Manifesto e resumo preservados em evidencias/rea-etapa1b-*.json.

Cobertura de fontes do recorte completa; semântica unknown com 2.862 incógnitas. São recortes distintos do anterior de cinco arquivos: a diferença de contagens não mede redução de defeitos. REA não prova execução, autorização efetiva nem pareamento Meta; essas conclusões dependem dos testes separados acima.

## Pendências e próximo trecho

- Imposição das habilidades no executor, especialmente pix_charges, continua pendente. Não declarar que a IA já respeita todos os switches.
- Qualificação automática no inbox, evento CAPI, webhook Cakto, seeds e estados de aprovação continuam pendentes.
- Embedded signup real, troca OAuth e pareamento Meta não foram executados; 201 no teste com provedor simulado não homologa uma conexão externa.
- Próximo critério: com pix_charges desligado, nem marcador OFFER_PIX produzido pelo modelo pode gerar cobrança ou mensagem de cobrança; com habilidade ligada, validar pré-condições. Não depender do prompt como controle de autorização.
