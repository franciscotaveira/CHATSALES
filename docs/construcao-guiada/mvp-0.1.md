# CHAT-SALES — MVP 0.1 para teste assistido

Data: 17/10/2026. Branch codex/iteration-2.7; base 893569415f533ad9cbaf39e25122d6eb4988573a, alterações locais preservadas. Autorização: usuário pediu adotar recomendações e concluir versão para testar/comentar, sem novas perguntas repetitivas.

## Resultado entregue neste recorte

Configurações → Atendimento IA & Skills → Construa seu atendimento por etapas.

1. Objetivo: empresa, objetivo principal, modo pretendido e funções.
2. Conhecimento: informações confirmadas e critérios de qualificação pertinentes.
3. Limites: encaminhamento humano e regras comuns visíveis.
4. Revisão: entendimento consolidado e verificações objetivas de completude/coerência.
5. Cenários: base comum, cenários das funções escolhidas e até cinco casos próprios. Avaliação registrada por cenário na revisão salva. Aprovação explícita do plano para teste assistido.

Rascunho fica em tabela própria por empresa; gravação usa versão esperada e retorna conflito 409 em edição desatualizada. Nova gravação invalida revisões e aprovação. Revisor e momento da aprovação ficam registrados. Perfis sem workspace:manage não acessam o configurador pela API; a interface apresenta erro de permissão. Não há mudança da configuração operacional pela aprovação do plano.

Ensaio textual opcional permite até oito turnos, reaproveitando o endpoint de simulação e o provedor já configurado. Rascunho precisa estar salvo; histórico segue nas próximas mensagens. Falha preserva a mensagem para nova tentativa. Credenciais não são armazenadas no plano. A simulação força capacidades de cobrança, agendamento e CAPI desligadas no payload e não executa ferramentas. Revisar cenários do plano NÃO é testar um modelo real nem comprovar ações operacionais.

## Critérios de aceite

- Jornada acessível pela tela existente e resumo editável retornando às etapas.
- Plano preservado após recarregar e isolado por empresa.
- Sem aprovação enquanto faltam dados coerentes ou revisões dos cenários.
- Reconhecimento explícito do alcance de teste assistido antes da aprovação.
- Alteração invalida revisão; gravação desatualizada não sobrescreve dados.
- Configuração da IA ativa permanece idêntica ao estado anterior.
- Testes negativos de autenticação, autorização e RLS.
- Builds, tipos, testes pertinentes, REA estático e passagem visual.

## Limites explícitos

Este recorte não implementa as 107 decisões operacionais como produto completo. Não libera atendimento automático, não oferece cadastro produtivo de permissões extras, não cria integrações de estoque/agenda, não envia WhatsApp/Meta e não processa pagamentos reais. Configuração operacional antiga continua em seção recolhida e independente; ela não é governada pelo plano deste MVP. O plano não mantém um arquivo completo de todas as revisões anteriores: a revisão corrente e sua aprovação são preservadas; versionamento operacional completo é evolução necessária.

Os checks verificam estrutura/coerência do plano, não a veracidade comercial de textos nem o comportamento de LLM. Revisões são avaliações humanas da especificação. O caso de demonstração salvo é sintético e identificado como QA. Provedor real ausente no laboratório impede homologação do atendimento com LLM; integração real exige etapa posterior. Ausência de provedor não é teste aprovado do modelo.

## Cobertura e evolução

As decisões D01–D107 permanecem em atendimento-ia.md. A matriz de 27 grupos em avaliacao-integral.md e o percurso de telas são referência do produto existente, não lista de funcionalidades prontas neste incremento.

- Base MVP: grupos 02, 13, 14 — configuração, plano e revisão; grupo 03 — autorização existente aplicada; grupo 27 — persistência/RLS e laboratório.
- Mantidos com validações anteriores: notas/propostas (1A), criptografia/autorização (1B), barreira Pix (1C).
- Evolução prioritária: plano aprovado → versão executável com capacidades comprovadas; idempotência do executor; qualificação com evidências; remoção de seeds demonstrativos; webhook Cakto fail-closed; integrações oficiais e fonte de estoque/agenda; conversões/campanhas e relatórios conforme decisões.
- Complementos do levantamento que não entram agora: templates reais aprovados pelo provedor (cadastro local não equivale a aprovação); conexão de canal com estados verificáveis; cobrança SaaS somente após definir provedor e contrato; exportação com escopo e permissões; navegação e suporte mobile com testes próprios. Nenhum desses itens é implicitamente ativado.

## Reprodução local

Aplicar migração 038_guided_agent_plans.sql apenas ao banco de laboratório; não há permissão para worker ou ingress nessa tabela. Build dos contratos e API. Frontend: VITE_API_BASE_URL=http://127.0.0.1:24400 e VITE_DEV_DEMO_TOKEN vazio ao executar build:lab. Reiniciar apenas API do compose de laboratório. Não iniciar dispatcher/worker.

QA de API/banco: laboratorio/verificar-mvp-guiado.py. Usa somente identidade e empresa sintéticas do laboratório e deixa demonstração revisada para teste assistido. O script não chama provedor nem altera a IA ativa.

## Evidências

- evidencias/mvp-typecheck.log: 18/18 tarefas passaram.
- Builds da API e frontend lab passaram; bundle grande continua como limitação preexistente.
- 88 testes em dez arquivos passaram, incluindo 16 testes novos de contrato/API e interface.
- evidencias/mvp-http-db.json: persistência real, conflito 409, bloqueio 422 sem revisões, invalidação ao editar, 401/403, RLS de leitura/alteração/inserção e configuração ativa inalterada.
- REA: três fontes, 24.809 bytes, sem falhas de parse. Evidência ev_8d294ffcc3c7375e756be82e67a71c244163ca74bd15f17a2d3caf14b2a55213; manifesto SHA-256 e resumo em evidencias/mvp-rea*.json. Cobertura semântica unknown/parcial: análise estática não comprova execução e não examinou a migração SQL.
- Passagem visual: edição retirou aprovação; salvamento criou revisão 3; cinco avaliações registradas pela interface; aprovação explícita para teste assistido; reload completo preservou empresa, revisão e aprovação. Screenshot: evidencias/mvp-revisao.png. Avaliações identificadas como QA do plano, sem alegação de modelo real homologado.

Estado: MVP de configuração concluído e tecnicamente validado para teste assistido no laboratório. Cenário de demonstração aprovado no alcance do plano. Atendimento com modelo real e ações externas não homologados; produção não alterada.
