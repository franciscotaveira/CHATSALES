# Laboratório local CHAT-SALES

Preparado e verificado em 2026-10-16, checkout codex/iteration-2.7, commit 893569415f533ad9cbaf39e25122d6eb4988573a.

## Acesso
- Interface: http://127.0.0.1:23400
- API: http://127.0.0.1:24400
- Login fictício: operador@chat-sales.test
- Senha exclusiva deste laboratório: Laboratorio-2026!
- Workspace: LAB — Revisão Chat Sales

Esses dados são sintéticos e não devem ser reutilizados em produção. O navegador já foi autenticado.

## Limites do ambiente
Compose chat-sales-guided-lab com PostgreSQL novo, Redis, API e Nginx. API e bancos estão somente na rede Docker internal=true. Nginx conecta essa rede à rede edge e publica apenas portas em 127.0.0.1. Nenhum worker está rodando. Não foram fornecidas credenciais externas à API nem associadas credenciais ao canal de teste. A inspeção posterior identificou que o frontend preenche valores padrão de WAHA no assistente; eles não foram usados e sua validade não foi verificada. Não confundir esses padrões com uma conexão configurada. A API monta /dev/null sobre /app/.env e usa variáveis sintéticas. A interface é dist-lab, sem VITE_DEV_DEMO_TOKEN e com VITE_API_BASE_URL na porta 24400.

O isolamento refere-se ao backend Docker; o navegador do usuário continua com sua conectividade normal. Não cadastrar credenciais reais neste laboratório. Não houve envio externo, pareamento ou cobrança real.

Há um contato, canal inativo e conversa fictícios. Os quatro produtos, quatro templates e três flows foram criados pelo próprio comportamento de seed da aplicação nas consultas, não são catálogo aprovado pelo usuário.

## Operação
Executar no diretório /Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES:

```sh
rtk proxy docker compose --env-file docs/construcao-guiada/laboratorio/empty.env -f docs/construcao-guiada/laboratorio/compose.json up -d
rtk proxy python3 docs/construcao-guiada/laboratorio/smoke.py
```

Parar preservando o banco:

```sh
rtk proxy docker compose --env-file docs/construcao-guiada/laboratorio/empty.env -f docs/construcao-guiada/laboratorio/compose.json stop
```

compose.json e empty.env ficam locais e ignorados pelo Git. Não executar down -v se quiser preservar os dados e a preparação atual. O código e dist-lab são montados do checkout, portanto mudanças de build alteram o laboratório. O ambiente atual está pronto para retomar, mas esta pasta não constitui instalador portátil de uma base nova.

## Ajuste necessário na preparação
As migrações foram inicializadas pelo usuário lab_admin. A migração 002 define privilégios padrão para criações de sos_migration_owner; tabelas posteriores criadas por lab_admin não herdaram esses privilégios. Isso causou permission denied em channel_instances, commercial_threads e messages. Aplicado somente no banco chat_sales_lab:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE
ON channel_instances, commercial_threads, messages TO sos_app_user;
```

RLS permaneceu habilitado; nenhum papel recebeu BYPASSRLS. Este ajuste é de bootstrap local, não evidência de defeito na instalação produtiva. Outros caminhos ainda podem exigir preparação equivalente e devem ser registrados.

## Evidências
Health/ready 200; login por senha; 27 consultas retornaram 200; acesso sem autenticação retornou 401 e workspace não autorizado retornou 403. Resultados em ../evidencias/api-smoke.json. Consultas de leitura não homologam criação/edição, efeitos externos, concorrência ou isolamento completo entre duas empresas reais.

A avaliação e pendências estão em ../avaliacao-integral.md.

## Ensaio Pix — etapa 1C

Foi aplicada no laboratório a migração 037_grant_worker_enqueue_outbound_commands.sql. Ela permite INSERT da fila ao worker, preservando RLS. O ensaio run-pix-lab.mjs exige APP_ENV=lab e banco chat_sales_lab, cria uma empresa descartável, injeta resposta LLM sintética e executa o processador com papel sos_worker_user. Remove os registros próprios ao terminar. Não iniciar o dispatcher para este ensaio.

Compilar apenas o processador com tsup para laboratorio/runtime (ESM), disponibilizar as dependências do worker e executar o script dentro do contêiner API. runtime/ é ignorado no Git. O script não inicia o entrypoint de workers. Resultado validado em ../evidencias/etapa-1c-lab.json; escopo e limites em ../etapa-1c-pix.md. API reiniciada nesta etapa, mantendo a IA principal desativada.


## MVP guiado 0.1

Migração 038_guided_agent_plans.sql aplicada apenas no banco de laboratório. Configurações → Atendimento IA & Skills abre o configurador em cinco etapas. O exemplo LAB — MVP para comentários é sintético; revisão 3 do plano foi aprovada para teste assistido pela passagem visual. Plano não ativa IA.

Para reconstruir frontend local, informar explicitamente VITE_API_BASE_URL=http://127.0.0.1:24400 e VITE_DEV_DEMO_TOKEN vazio ao executar build:lab; sem isso o build usa fallback localhost:4400 e a interface aparece offline. Scripts verificar-mvp-guiado.py e evidências mvp-* registram a validação; o QA sobrescreve apenas o plano sintético da empresa LAB e não a configuração operacional. Não rodar esse script contra produção.


## Revisão completa — 17/10/2026

Migrações 039–047 aplicadas somente neste laboratório, com backup local verificado e journal em lab_control.applied_migrations. Ver ../evidencias/full-audit-lab-migrations.json. A IA principal continua desativada; nenhum worker de envio foi iniciado. Os quatro produtos do seed antigo foram preservados, marcados SIMULADO e inativados. Modelos locais ficaram pendentes e Flows demonstrativos em rascunho.

`verify-full-audit-lab.py` confere pela API rótulos compartilhados (incluindo conflito), ciclo de tarefa, estados demonstrativos e hash do frontend servido. Cria registros de tarefa identificados como SIMULADO e mantém o histórico. Não substitui teste visual.

Há outro PostgreSQL **descartável e separado**, chat-sales-full-audit-db em 127.0.0.1:55440, e Redis em 56389. O runner `run-full-audit.py` usa somente essas portas e credenciais sintéticas, sem carregar .env. **Sem argumentos, recria sos_sales_v3_test antes da suíte completa**; com caminhos de testes, preserva o banco para regressões direcionadas. Nunca apontar esse runner para banco operacional. Não houve alteração de produção/VPS.

Webhooks operacionais usam fila e worker com `OUTBOUND_WEBHOOK_DISPATCH_ENABLED=true`; esse flag não foi ativado no lab. Novos destinos começam inativos e precisam de ping bem-sucedido e ativação explícita. A migração 045 suspende assinaturas anteriores, e a 041 remove rótulos de aprovação sem prova do provedor; planejar reteste antes de qualquer uso produtivo.

O navegador integrado falhou ao anexar a webview nesta rodada. A abertura pelo Codex ficou em fila. A verificação visual das telas alteradas continua pendente; a API e o asset servido foram conferidos separadamente.
