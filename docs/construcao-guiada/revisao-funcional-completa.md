# Revisão funcional completa — CHAT-SALES

> Registro histórico de 17/10/2026. Para o estado atual das correções, evidências e pendências, consulte [UI/UX](ui-ux.md). Os totais de testes abaixo pertencem à rodada histórica e não representam a validação mais recente.

Data: 17/10/2026. Checkout `/Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES`, branch `codex/iteration-2.7`, base `893569415f533ad9cbaf39e25122d6eb4988573a`. Alterações anteriores preservadas. Pedido: revisar todos os grupos existentes, corrigir defeitos demonstrados e manter os limites explícitos. Método: construir + REA + testes de contratos, banco, integração sintética e laboratório.

## Parecer

Validação: 18 tarefas de typecheck, builds API/worker e web concluídos; suíte completa com 1.005 testes aprovados e regressão final direcionada com 67 aprovados. O banco de teste é separado do laboratório.

A revisão passou pelos **27 grupos do inventário**, com níveis de evidência diferentes. Isso não significa que todas as funções estão concluídas ou homologadas em produção. O configurador guiado é apenas uma parte do produto. As decisões D01–D108 continuam sendo requisitos de evolução; não são uma lista de capacidades já entregues.

O laboratório foi atualizado, com backup, API/interface compiladas e sem worker de envio ou credenciais reais. **Liberação geral para produção permanece pendente.** A conferência visual desta nova rodada ficou bloqueada porque o navegador integrado não conseguiu anexar a webview; a tentativa de abertura pelo Codex ficou em fila. O percurso visual anterior consta em `percurso-telas.md` e não certifica as telas modificadas nesta rodada.

## Cobertura e limites por grupo

“Teste” abaixo identifica execução automatizada local; substitutos de provedor são sintéticos. “Inspeção” não comprova execução externa. Referências de testes estão nos diretórios `apps/api/src/__tests__`, `apps/worker/src/__tests__`, `apps/web/src/__tests__` e `packages/database/src/__tests__`.

| ID | Grupo | Resultado desta rodada | Evidência e limite restante |
|---|---|---|---|
| 01 | Login/sessão | Revisto; logout da zona de perigo limitado às chaves da aplicação, sem limpar todo o navegador | `auth-session`, `auth-vertical-slice`, `api-client-and-session`; nova ação visual ainda pendente |
| 02 | Empresas/onboarding | Corrigida senha fixa: omissão passa a gerar senha aleatória no servidor; campo inicial vazio e oculto | `create-workspace-modal`, autenticação e isolamento; não é fluxo de convite com expiração obrigatória |
| 03 | Equipe/acessos | Revistos contratos/permissões; proprietário exibido corretamente no editor; configuração IA exige permissão administrativa | `security-hardening-r2`, `ai-config-and-embedded-contract`, RBAC; perfis granulares ajustáveis por equipe ainda não implementados |
| 04 | Conexão Meta/WAHA | Contrato criptográfico corrigido antes; removidas credenciais/URL predefinidas e limpos campos ao trocar provedor. Revogação desativa canal; remoção arquiva histórico | `channel-onboarding-m7`, `webhook-pairing`, `full-functional-audit`; QR, Embedded Signup e sincronização reais pendentes |
| 05 | Inbox/mensagens | Corrigidas referências SQL inexistentes; entrada não qualifica automaticamente contato; callbacks limitados a mensagem e canal corretos | `messaging-e2e-lifecycle`, processadores e concorrência/fencing; recebimento/envio reais não executados |
| 06 | Mídia/áudio | Proxy exige mídia registrada na empresa/canal e usa credencial correspondente. Removido segredo padrão WAHA; cache privado; token do navegador restrito à origem da API | `media-upload`, `full-functional-audit`; download Meta simulado. Transcrição, formatos reais e análise por IA de documentos ainda dependem de validação/implementação específica |
| 07 | Contatos/dossiê | CRUD/isolamento revistos; dossiê descarta respostas antigas após troca de contexto e mostra falha de carregamento | `contacts`, `tenant-isolation`; vínculo/unificação reversível entre canais ainda não implementado |
| 08 | Notas | Correção anterior de persistência preservada e coberta por regressão | `cockpit-persistence`; não confundir nota interna com resumo gerado por IA |
| 09 | Funil/oportunidades | Rótulos compartilhados no servidor, com versão para impedir sobrescrita silenciosa; cockpit e oportunidades usam mesma fonte | `commercial-and-conversions`, `commercial-concurrency-r3`, `full-functional-audit`; são rótulos das etapas existentes, não múltiplos funis arbitrários |
| 10 | Tarefas | Ligada a API existente à interface do dossiê: criar, concluir, cancelar com motivo, reagendar e consultar histórico | `commercial-actions.routes`, banco e ensaio API no lab; atribuição por equipe/rodízio e escalonamento não foram construídos |
| 11 | Propostas | Correção de expectedVersion preservada; transições, concorrência e vínculos revisados nos testes existentes | `commercial-proposals.routes`, `commercial-concurrency-r3`; validade/preço congelado conforme todos os novos requisitos ainda precisa de evolução específica |
| 12 | Catálogo | GET não cria mais ofertas automaticamente. Exemplos antigos do lab ficaram SIMULADO e INACTIVE, preservados | `full-functional-audit` e `full-audit-lab-functional.json`; estoque externo por SKU/variação não está implementado |
| 13 | Executor IA | Pix exige capacidade explícita; revalida configuração e responsabilidade após inferência; intenção repetida não chama modelo nem cria outra cobrança; consulta preço/status atual | `ai-pix-capability` e cenário integrado sob papel worker; modelo real, publicação versionada obrigatória e limites de consumo ainda pendentes |
| 14 | Simulador/guiado | MVP multi-turno e registros de revisão preservados; removidas promessas absolutas de “nunca inventar” | `guided-agent` API/web; simulação e aprovação de plano não ativam nem certificam o executor produtivo |
| 15 | Transferência humana | Resposta da IA bloqueada se humano assumir durante inferência ou antes do despacho; fila humana continua protegida | `ai-pix-capability`, processador e dispatcher; fila, resumo e orientação interna avançados ainda incompletos |
| 16 | Agendamento/Flows | Adicionado envio de formulário pela fila; IDs demonstrativos deixam de aparecer publicados; UI esclarece que envio não confirma agenda | Inspeção, build e `full-functional-audit` para estados vazios; publicação/retorno de Flow real e agenda externa não homologados. Não existe motor nativo de agenda |
| 17 | Templates | Cadastro local PENDING; sincronização consulta estado na Meta com credencial do canal; aprovação expira para envio após 24h sem nova verificação | `full-functional-audit` com Meta sintética; aprovação/publicação reais pendentes. Retiradas tarifas/economia fixas sem fonte |
| 18 | Disparos/importação | Chave estável por solicitação; público congelado; vínculo destinatário/outbox transacional; contagens distinguem fila/envio; opt-out e cancelamento revalidados no despacho | `full-functional-audit`, `broadcast-audience-schema`, sanitização de planilha, filas/fencing; envio real e jornada obrigatória de teste antes de aprovação da campanha ainda pendentes |
| 19 | Relatório de campanha | Resposta depende de referência à mensagem original; pagamento ligado à mesma conversa, janela de 7 dias e uma campanha principal por cobrança | `broadcast-sales-attribution` e inspeção SQL. Não prova causalidade publicitária nem traz ainda assistências completas |
| 20 | Pix/caixa | Replay persistente transacional; evento conflitante rejeitado; notificação usa tabela correta e chave estável; pagamento não fecha negociação automaticamente | `pix-webhook`, `pix-notification`, `pix`, teste IA integrado. Nenhuma liquidação bancária real; proposta/estoque/entrega continuam separados |
| 21 | Cakto | Segredo obrigatório, assinatura inválida não aceita fallback, deduplicação persistente e evidência financeira sem inventar ganho comercial | `full-functional-audit`; integração usa configuração de segredo do servidor. Segredo por integração/empresa, estorno/chargeback e reconciliação real continuam pendentes |
| 22 | Conversões Meta | Contratos/filas revisados; tela mostra falha de consulta e diferencia aceite do evento de atribuição publicitária | `commercial-and-conversions`, `capi-dispatcher`; eventos/atribuição reais e configuração completa por integração pendentes |
| 23 | Radar/sugestões | Revistos elegibilidade, versões, aplicação e governança nos testes existentes | `integration.routes`, `integration-suggestions`; sugestão não equivale a envio automático. Reativação real não executada |
| 24 | Integrações/webhooks | Implementada fila operacional durável para cinco eventos, HMAC e ID estável. Novo destino inativo, teste e ativação explícita; suspensão preserva pendências; resultado incerto vai a revisão | `full-functional-audit`; worker habilitado apenas com `OUTBOUND_WEBHOOK_DISPATCH_ENABLED=true`. Nenhuma conexão n8n/ERP real. Fila incerta/suspensa não é retomada automaticamente; reprocessamento administrativo ainda precisa de jornada própria |
| 25 | Billing SaaS | Inspecionado; removida tela fictícia de plano/saldo/recarga | **Não implementado**: assinatura recorrente, cobrança da plataforma, saldo e conciliação. Componente não é prova de faturamento operacional |
| 26 | Navegação/busca/mobile | Ação global de campanha aponta ao assistente correto; cadastro de produto abre formulário; simulação offline restaura URL real da API | Inspeção, typecheck, testes web e hash do asset servido. Nova validação visual/mobile/acessibilidade bloqueada. Busca global ainda é de comandos/navegação, não consulta semântica de todo o CRM |
| 27 | Infra/migrações/entrega | Nove migrações aplicadas no lab com backup; permissões mínimas da fila restauradas; bootstrap de teste e restauração física corrigidos | Banco de teste separado, RLS, recuperação e smoke. Sem deploy/VPS/produção nesta rodada |

## Correções operacionais principais

- Cadastro vazio não cria produtos, templates aprovados ou Flows publicados.
- Campanha preparada/enfileirada não aparece como mensagem entregue. Repetir a mesma solicitação não cria outra campanha nem outro comando por contato.
- O vínculo da campanha com o comando é gravado na mesma transação antes do worker poder enviá-lo; a ausência inesperada desse vínculo bloqueia o despacho.
- A IA não repete um efeito financeiro já registrado para a mesma mensagem. Desativação ou tomada humana impede resposta autônoma pendente.
- Confirmação financeira é um fato separado de ganho comercial, disponibilidade e entrega.
- Webhooks deixam de ser apenas cadastro/ping: contatos novos, mensagens recebidas, propostas criadas, pagamento Pix e mudança de etapa produzem eventos mínimos com identificador do recurso. A integração consulta os detalhes pela API autorizada.
- Tentativas de webhook só são automáticas para falhas HTTP temporárias quando o destino declara suporte a idempotência. Timeout/resultado incerto exigem revisão; desativação suspende a fila antiga.
- Recibos de eventos e confirmações financeiras não podem ser alterados ou apagados pelo papel da aplicação. URLs de logs ocultam tokens de mídia e credenciais de query.
- Segredos de webhook na listagem ficam restritos a proprietário/administrador; desativação preserva registros em vez de apagá-los.

## Evidências

- `evidencias/full-audit-typecheck.log`: verificação de tipos de todos os pacotes.
- `evidencias/full-audit-build-api.log` e `full-audit-build-web.log`: builds API/worker e interface lab; bundle web continua grande, cerca de 1,83 MB sem gzip.
- `evidencias/full-suite-final.log`: suíte completa, 85 arquivos e 1.005 testes aprovados. Após as últimas alterações, mais uma execução direcionada passou com 67 testes em cinco arquivos (inclui testes repetidos; não somar os totais). `full-suite-current.log` registra a regressão direcionada posterior às últimas restrições de privilégios, aviso de transferência e ocultação de tokens. Conferir o resumo; mensagens de falha simulada dos testes do smoke não representam falha da suíte.
- `evidencias/full-audit-lab-migrations.json`: backup, hashes e nove migrações 039–047 no laboratório.
- `evidencias/api-smoke.json`: 27 consultas 200, sem login 401, outra empresa 403; leitura não certifica todos os ciclos.
- `evidencias/full-audit-lab-functional.json`: rótulos salvar/conflito/restaurar, tarefa criar/reagendar/histórico/concluir/persistir, exemplos inativos e hash do frontend servido.
- `evidencias/full-audit-before-rea.json` e `full-audit-after-rea.json`: REA em sete arquivos antes/depois, sem falhas de parse. A semântica permanece parcial; não é auditoria de todo o repositório nem comprovação de runtime.

## Limites e próximo ciclo

1. Validar as telas modificadas no navegador quando a webview estiver disponível, incluindo mobile, permissões e mensagens de erro. Testes de componentes/API e asset servido não substituem esse percurso.
2. Usar contas e destinatários de teste autorizados para conexão Meta/WAHA, entrada/saída, áudio, template aprovado, campanha cancelada e retorno do webhook. Exigir recibos do provedor, sem confundir enfileiramento com entrega.
3. Implementar como recortes próprios as capacidades ainda ausentes: publicação versionada da IA vinculada aos testes, estoque/agenda externos, limites/custos, billing, identidade entre canais, múltiplos funis e busca do CRM. O documento `atendimento-ia.md` continua sendo a referência de decisões.
4. Antes de qualquer deploy, revisar as migrações que suspendem integrações anteriores ou removem aprovação local sem prova. Planejar reteste/reativação; não executar essas mudanças em produção implicitamente.

Este relatório encerra o inventário desta rodada com pendências explícitas. Não autoriza chamar o produto inteiro de aprovado ou concluir que não existem outros defeitos.
