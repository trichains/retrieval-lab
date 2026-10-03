---
id: runbook-failover-banco-de-dados
title: Runbook de failover do banco de dados
lang: pt
tags: [runbook, banco-de-dados, incidentes]
---

Este runbook é para equipes que usam o Nimbus Postgres e estão diante de um banco indisponível, lento ou que acabou de trocar de primário. Siga as seções na ordem e registre os horários de cada passo para o relatório do incidente.

## Como a alta disponibilidade funciona

Bancos com alta disponibilidade (HA) têm um primário e um standby em outra zona da mesma região, com replicação síncrona: uma transação só é confirmada depois de gravada nos dois. A HA vem incluída no Business e no Enterprise; no Pro, é um complemento contratado por banco.

Quando o primário fica sem responder às verificações de saúde por 30 segundos, a Nimbus promove o standby automaticamente. O processo completo costuma levar de 30 a 90 segundos, contados desde a falha. A string de conexão não muda: o endereço `db-<id>.pg.nimbus.dev` passa a apontar para o novo primário, com TTL de DNS de 5 segundos.

Bancos sem HA não têm failover automático. Se o servidor de um banco sem HA falhar, a Nimbus recria a instância a partir do último backup e do log de transações, o que pode levar de 10 a 30 minutos.

## Sintomas

- Erros de conexão na aplicação, como `connection refused` ou `terminating connection due to administrator command` (código `57P01`).
- Aumento repentino de respostas 5xx em endpoints que usam o banco.
- No console, o banco aparece com o status `failing_over` ou um evento "Primary promoted" na aba Eventos.
- Alertas de `http_5xx_rate` ou de latência disparados ao mesmo tempo em vários projetos ligados ao mesmo banco.

## Diagnóstico

Primeiro, confirme o estado do banco:

```
nimbus db status db_4kz9
nimbus db events db_4kz9 --since 1h
```

O status `available` com um evento `failover_completed` recente indica que o failover automático já aconteceu e o banco está saudável; o problema restante provavelmente está nas conexões da aplicação (veja "Depois do failover"). O status `failing_over` indica que a troca está em andamento: espere até 2 minutos antes de agir.

Depois, confira status.nimbus.dev, componente Postgres, na região do banco. Se houver um incidente aberto pela Nimbus, acompanhe por lá e não faça failover manual, porque ele pode competir com a recuperação feita pela equipe da plataforma.

Por fim, descarte causas que não são falha do servidor: conexões esgotadas (o limite é de 100 conexões no Pro e 400 no Business), consultas travadas por lock ou disco cheio. Nesses casos o banco responde, mas mal, e um failover não resolve; ele só transfere o problema para o novo primário.

## Failover manual

Use o failover manual quando o primário está degradado mas não caiu, por exemplo com latência de disco muito alta reportada nos eventos, e a Nimbus não fez a troca sozinha. Ele também serve para testar se a sua aplicação aguenta a troca, em horário de baixo movimento.

```
nimbus db failover db_4kz9 --confirm
```

O comando exige o papel Admin ou Owner e só funciona em bancos com HA. A troca manual costuma levar menos de 30 segundos, porque não precisa esperar a detecção da falha. Não rode o comando duas vezes seguidas: enquanto o novo standby não estiver pronto, um segundo failover é recusado com o erro `409 conflict`.

## Depois do failover

### Reconexão da aplicação

As conexões abertas com o primário antigo são encerradas. Transações que estavam em andamento são abortadas e precisam ser repetidas pela aplicação. Bibliotecas de pool costumam reconectar sozinhas, mas algumas guardam conexões quebradas por vários minutos. Se os erros continuarem depois que o banco voltou para `available`, reinicie as instâncias da aplicação com `nimbus restart --project api`.

Para reduzir o impacto em trocas futuras, use o pooler de conexões da Nimbus na porta 6543 em vez da porta 5432: ele segura novas conexões por alguns segundos durante a troca, em vez de recusá-las.

### Novo standby

Depois de qualquer failover, a Nimbus cria um novo standby automaticamente. Isso leva cerca de 10 minutos para bancos de até 100 GB. Durante essa janela o banco está sem proteção de HA, então evite manutenções e migrações pesadas até o status mostrar `ha: healthy`.

### Verificação

- `nimbus db status db_4kz9` mostra `available` e `ha: healthy`.
- A métrica `http_5xx_rate` voltou ao nível normal.
- Não há erros `57P01` nos logs dos últimos 10 minutos.

## Se o failover não resolver

Se os dados foram corrompidos ou apagados por engano, um failover não ajuda, porque o standby recebe as mesmas alterações. Nesse caso, use a recuperação para um ponto no tempo (PITR):

```
nimbus db restore db_4kz9 --to "2026-09-30T14:05:00Z" --name db-restaurado
```

O restore cria um banco novo; o original não é alterado. A janela de recuperação é de 7 dias no Pro e 30 dias no Business. Depois de validar os dados no banco restaurado, aponte a variável `DATABASE_URL` da aplicação para ele e faça um novo deploy.

## Comunicação

Durante o incidente, abra um chamado de prioridade urgente informando o ID do banco, o horário do início e os IDs de requisição com erro. Clientes Business e Enterprise têm atendimento 24 horas para chamados urgentes. Se o incidente afetar seus próprios clientes, atualize a sua página de status a cada 30 minutos, mesmo sem novidade.
