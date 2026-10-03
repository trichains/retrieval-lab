---
id: webhooks-idempotencia
title: Eventos duplicados e idempotência em webhooks
lang: pt
tags: [webhooks, confiabilidade]
---

A Nimbus garante que cada evento será entregue pelo menos uma vez, mas não garante que será entregue uma única vez. Na prática, o mesmo evento pode chegar duas ou mais vezes ao seu endpoint. Isso acontece, por exemplo, quando o seu servidor processa o evento mas demora mais de 10 segundos para responder: para a Nimbus, a entrega falhou, e ela tenta de novo. Também acontece quando alguém da equipe usa o replay para reenviar eventos, ou quando uma falha de rede derruba a conexão depois que a resposta já tinha sido enviada.

Por isso, o processamento precisa ser idempotente, ou seja, receber o mesmo evento várias vezes deve ter o mesmo efeito que recebê-lo uma vez. A forma mais simples é usar o cabeçalho `Nimbus-Event-Id`, que traz um identificador no formato `evt_...` e é o mesmo em todas as tentativas e replays de um evento. Guarde os IDs já processados e ignore os que aparecerem de novo.

Uma implementação segura grava o ID do evento numa tabela com restrição de unicidade, dentro da mesma transação que aplica o efeito do evento. Se a gravação falhar por chave duplicada, o evento já foi tratado e basta responder 200. Evite checar primeiro e gravar depois em passos separados: duas entregas simultâneas podem passar pela checagem ao mesmo tempo.

Por quanto tempo guardar os IDs? As tentativas automáticas terminam em cerca de 21 horas, mas o replay manual pode reenviar eventos de até 30 dias atrás. Guardar os IDs por pelo menos 30 dias cobre os dois casos.

Também não conte com a ordem de chegada. Um `deployment.ready` pode chegar antes do `deployment.building` do mesmo deploy, se a primeira tentativa do segundo evento falhou. Use o campo `created_at` do evento, ou consulte o estado atual do recurso na API, antes de sobrescrever dados mais novos com dados mais antigos.
