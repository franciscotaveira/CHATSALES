# Estado Publicado e Evidências

**Snapshot:** 2026-10-05
**Ambiente:** `https://chat.automatizaprocessos.tech`
**Regra:** documento temporal; atualizar após cada release.

## Evidência de infraestrutura

| Componente | Evidência | Estado |
|---|---|---|
| API | `GET /health` retorna 200, `sos-sales-api` `3.0.0-alpha.1` | saudável |
| Web | container `chat-sales-web` | healthy |
| Worker | container `chat-sales-worker` | healthy |
| Proxy | `sos-sales-caddy` | ativo |
| Banco | `sos-sales-postgres` | ativo; integridade E2E não inferida |
| Redis | `sos-sales-redis` | healthy |

O endpoint canônico é `/health`. `/api/health` não faz parte do contrato atual.

## Correção crítica do frontend

O domínio servia um build antigo de desenvolvimento montado no host, enquanto o container web já continha o build de produção correto.

Correção aplicada:

- Caddy passou a encaminhar o frontend para `chat-sales-web:80`;
- API, webhooks e health permaneceram em `chat-sales-api:4400`;
- Caddyfile anterior foi preservado em backup;
- configuração foi validada antes do reload.

Leitura pública após a correção:

| Verificação | Resultado |
|---|---:|
| chamadas `jsxDEV` | 0 |
| caminhos `/Users/franciscotaveira.ads` | 0 |
| asset principal | `index-Ca6w-p_B.js` |
| login laboratorial na API | HTTP 403 |

Os componentes laboratoriais foram removidos fisicamente do bundle comercial por uma constante de compilação. O build executa um gate obrigatório que rejeita artefatos de desenvolvimento, caminhos locais e formulários laboratoriais.

## Superfícies observadas no bundle

- Contexto do lead;
- Integrações / API & Webhooks;
- Radar;
- reativação de contato;
- atualização com feedback;
- catálogo, templates, flows, Pix, canais e conversões.

Ausências ou provas insuficientes:

- jornada visível completa de Próxima Ação;
- detalhe e movimentação do funil comprovados na interface;
- empresa/equipe e segurança como configurações completas;
- token externo permanente e webhooks de saída;
- CAPI com recibo real;
- restore de backup ensaiado.

## Segurança de autenticação

- API executa com `NODE_ENV=production`;
- `ENABLE_LAB_SYNTHETIC=false`;
- `POST /v1/auth/session` retorna 403 sem habilitação explícita;
- provider publicado ainda é `local-jwt`; identidade comercial externa permanece pendente.

## Gate para o próximo release

O CI deve falhar se o bundle público contiver:

```text
jsxDEV
/Users/
Chave Mestra de Laboratório
Token Manual de Laboratório
```

Após o deploy, registrar hash do asset, SHA do código, migrations aplicadas, `/health` e evidência E2E das capacidades alteradas.
