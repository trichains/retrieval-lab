---
id: runbook-fila-de-webhooks
title: Runbook de fila de webhooks acumulada
lang: pt
tags: [runbook, webhooks, incidentes]
---

Use este runbook quando os eventos de webhook estão chegando com atraso grande ao seu endpoint, ou quando o painel do endpoint mostra muitos eventos pendentes. O objetivo é esvaziar a fila sem perder eventos e sem processar nada duas vezes.

## Sintomas

- O contador "Pendentes" em Console > Webhooks > (endpoint) cresce em vez de cair.
- Eventos como `deployment.ready` chegam minutos ou horas depois do que aconteceu.
- O log de entregas mostra muitas tentativas com status `timeout` ou respostas 5xx do seu servidor.
- Você recebeu o e-mail avisando que o endpoint está prestes a ser desativado.

## Como a fila funciona

Cada endpoint tem uma fila própria. A Nimbus envia até 10 requisições simultâneas para o mesmo endpoint (50 no Business e no Enterprise). Uma entrega só libera espaço para a próxima quando o seu servidor responde ou quando estoura o tempo limite de 10 segundos. Por isso, um endpoint lento acumula fila mesmo que nunca devolva erro: se cada resposta leva 9 segundos, o endpoint processa pouco mais de uma entrega por segundo.

A ordem de entrega não é garantida, e as novas tentativas de eventos que falharam competem pelo mesmo espaço com os eventos novos. Eventos que ficam mais de 72 horas na fila sem conseguir ser entregues são descartados da fila e aparecem no log de entregas com o status `expired`. Eles não somem: ainda podem ser reenviados pelo replay enquanto estiverem no log, que guarda 30 dias.

## Diagnóstico

Liste as entregas com falha recentes e veja o tempo de resposta:

```
nimbus webhooks deliveries list --endpoint we_3k9d --status failed --since 1h
nimbus webhooks endpoint show we_3k9d
```

O comando `endpoint show` mostra o tamanho da fila, o tempo médio de resposta nos últimos 15 minutos e a taxa de sucesso. Em geral, o problema cai em um destes casos:

1. **Endpoint lento.** Taxa de sucesso alta, mas tempo de resposta perto de 10 segundos. O seu handler está fazendo trabalho pesado antes de responder.
2. **Endpoint quebrando.** Muitas respostas 5xx ou erros de conexão. Pode ser um deploy recente do lado do receptor, um certificado TLS inválido ou um firewall bloqueando a Nimbus.
3. **Pico de eventos.** Taxa de sucesso e tempo normais, mas um volume fora do comum, como um deploy em massa ou o fechamento das faturas no dia 1º.
4. **Assinatura rejeitada.** Respostas 400 ou 401 do seu próprio código, normalmente depois de uma troca do segredo de assinatura que não chegou a todos os servidores.

## Mitigação

### Responda rápido e processe depois

A correção mais eficaz para o caso 1 é mudar o handler para validar a assinatura, gravar o evento numa fila sua e responder 200 imediatamente. O processamento pesado acontece em segundo plano. Com isso, o tempo de resposta cai para milissegundos e a fila da Nimbus esvazia rápido.

### Pausar o endpoint

Se o receptor está fora do ar e vai demorar para voltar, pause o endpoint para que as entregas parem de falhar e de gastar tentativas:

```
nimbus webhooks pause we_3k9d
nimbus webhooks resume we_3k9d
```

Enquanto pausado, os eventos se acumulam na fila e nenhuma tentativa é consumida. Lembre-se do limite de 72 horas na fila. Um endpoint que só recebe falhas por 72 horas seguidas é desativado automaticamente; pausar evita essa desativação.

### Absorver um pico de eventos

No caso 3, o receptor está saudável e a fila vai esvaziar sozinha; a pergunta é quanto tempo isso leva. Divida o tamanho da fila pela vazão atual do endpoint, que aparece em `endpoint show`, para estimar. Se a espera for aceitável, não faça nada além de acompanhar. Se não for, há duas saídas: deixar o handler mais rápido, como descrito acima, ou aumentar a concorrência. O limite de 10 requisições simultâneas do Pro sobe para 50 com a mudança para o Business, e clientes Enterprise podem pedir ao suporte até 200 por endpoint. Antes de pedir mais concorrência, confirme que o seu servidor aguenta esse volume de requisições paralelas; caso contrário, você só troca timeouts por erros 5xx.

### Corrigir o receptor

Para o caso 2, trate como um incidente comum do seu serviço: reverta o último deploy do receptor, verifique o certificado e confirme que os endereços de saída da Nimbus, publicados em `https://api.nimbus.dev/v2/meta/egress-ips`, estão liberados no firewall. Para o caso 4, confirme que todos os servidores aceitam as duas assinaturas durante as 24 horas de transição do segredo.

## Reprocessar eventos perdidos

Depois que o receptor estiver saudável, reenvie o que falhou ou expirou. O replay em lote aceita um intervalo de tempo e um filtro de status:

```
nimbus webhooks replay --endpoint we_3k9d \
  --since 2026-09-30T00:00:00Z --until 2026-09-30T06:00:00Z \
  --status failed,expired
```

O replay respeita o mesmo limite de concorrência do endpoint, então um lote grande também leva tempo. Comece com uma janela pequena para confirmar que tudo está funcionando. Os eventos reenviados mantêm o mesmo `Nimbus-Event-Id` da entrega original.

## Depois do incidente

- Confirme que o contador "Pendentes" voltou a zero e que a taxa de sucesso está acima de 99%.
- Garanta que o handler é idempotente. Replays e novas tentativas fazem eventos já processados chegarem de novo, e o `Nimbus-Event-Id` é o que permite ignorá-los.
- Crie um alerta para o tempo de resposta do endpoint, usando o canal de e-mail ou Slack, para perceber a lentidão antes da fila crescer.
- Registre no relatório do incidente quantos eventos expiraram e se todos foram reprocessados.
