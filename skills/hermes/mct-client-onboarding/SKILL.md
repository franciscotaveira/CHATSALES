---
name: mct-client-onboarding
description: "Provisionamento turnkey de novos clientes no Google Drive e no PostgreSQL da VPS com regras de compliance e boas-vindas no WhatsApp."
version: 1.0.0
author: Francisco Rios / MCT LTDA
license: Proprietary
platforms: [linux]
metadata:
  hermes:
    tags: [onboarding, google-drive, postgres, whatsapp, mct-os, compliance]
prerequisites:
  commands: [python3, docker]
---

# MCT Client Onboarding & Provisioning

Esta skill ensina o Hermes Agent a integrar e provisionar imediatamente qualquer novo cliente corporativo (construtoras, prestadores industriais ou escritórios) na infraestrutura soberana da MCT.

## Quando Usar

- Quando o usuário (Francisco) disser: "Integre a Construtora X", "Faça onboarding do cliente Y", ou usar o comando `/onboard`.
- Quando um novo cliente fechar contrato via WhatsApp ou SOS Vendas.
- Quando for necessário criar uma nova estrutura de pastas para cliente no Google Drive da MCT.

## Como Executar

O Hermes deve invocar diretamente o script soberano via bash:

```bash
python3 /opt/plx-documentos/app/scripts/mct_client_onboarding.py \
  --name "<Nome da Empresa>" \
  --segment "<construcao|contabil|geral>" \
  --phone "<554999999999>" \
  --email "<email_do_cliente@dominio.com>" \
  --works "<Obra_1>" "<Obra_2>"
```

### Parâmetros Suportados:
- `--name` (Obrigatório): Razão social ou nome fantasia da empresa.
- `--segment`: `construcao` (default para empreiteiras), `contabil` ou `geral`.
- `--phone`: WhatsApp do responsável ou do mestre de obras (com DDI e DDD: 5549...).
- `--email`: E-mail para compartilhamento direto de leitura no Google Drive.
- `--works`: Nomes das obras ativas atendidas (cria subpastas nominais em `01_Obras_Ativas`).

## O Que a Skill Executa nos Bastidores:
1. Conecta ao Google Drive Master (`1pm8OyvZogbs2jcXnl1o2tPQToX1IsAL4`) via Service Account (`mct-drive-worker@sosautonatiza.iam.gserviceaccount.com`).
2. Cria a árvore canônica: `00_Dossie_Geral_Empresa`, `01_Obras_Ativas`, `02_Colaboradores`, `99_Quarentena`.
3. Semeia as regras de validade na tabela `data_table_user_chkrulesv1taveira` no banco `plx_n8n` da VPS.
4. Dispara a mensagem oficial de boas-vindas com o link da pasta via container WAHA.
5. Retorna o JSON com o `view_url` e o status de ativação.
