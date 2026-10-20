# Propostas e aplicação de rascunhos

Branch local codex/iteration-2.7; laboratório isolado, sem publicação ou envio real.

## Comportamento esperado

Radar mostra o texto atual quando houver e nomeia a ação como adicionar ao texto. O cockpit consulta o texto mais recente ao receber a sugestão e adiciona ao final, preservando os caracteres existentes. Não envia mensagem. A revisão anterior já vincula a decisão à conversa atual.

Proposta inicia com item/preço vazios e quantidade 1. Não assume R$ 1.500. Cada item exige título, preço brasileiro válido e quantidade inteira positiva; zero/vazio não são convertidos em 1. Total inválido não é apresentado como valor válido. Data opcional termina às 23:59:59.999 no horário do dispositivo; data inválida/passada bloqueia criação. Layout usa duas colunas no celular.

Solicitação de criação usa requestKey estável para os mesmos dados. Servidor serializa a chave por empresa, preserva uma proposta (e uma cobrança Pix, se solicitada) e retorna o registro existente no retry. Alterar termos com a mesma chave produz 409. Migração 051 cria tabela de recebimento tenant-scoped, SELECT/INSERT para aplicação; não altera propostas existentes. Chamadores sem chave continuam compatíveis.

Criar proposta não implica envio, aceitação ou pagamento. Durante criação o formulário bloqueia outras ações; falha preserva campos e identidade; retorno de outra conversa não fecha o painel atual.

## Evidências

14 testes UI direcionados e 22 testes API com PostgreSQL/Redis dedicados e provedores sintéticos aprovados. Typecheck 18/18 e builds API/web aprovados; regressão completa final aprovada: 1.154 testes em 102 arquivos (proposal-draft-full-suite.log). Migração 051 aplicada somente a bancos lab/teste.

REA: cinco fontes, zero falhas de parse; ev_59cf6d03bb6a7013c966a301dcab873a15d8fc999b1e8f9556217dc610075e8e. Manifesto proposal-draft-rea-manifest.json, projeção proposal-draft-rea-summary.json. Análise estática não comprova interface renderizada ou integrações externas.

Conferência visual permanece pendente pela recusa de observação da aba em erro, já registrada em ui-ux.md. Nenhum contorno ou ação produtiva executado. Ainda falta validar regras padrão de validade por empresa e componentes/jornadas pendentes da matriz geral; esta correção não aprova o produto inteiro.
