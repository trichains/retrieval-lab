---
id: guia-observabilidade
title: Guia de observabilidade com logs, métricas e alertas
lang: pt
tags: [observabilidade, logs, metricas, alertas]
---

Este guia mostra como acompanhar o que acontece nas suas aplicações na Nimbus: onde ler os logs, quais métricas existem, como criar alertas e como seguir uma requisição de ponta a ponta.

## Logs

Tudo o que a aplicação escreve na saída padrão (stdout) e na saída de erro (stderr) vira log, junto com os logs de build e os logs de acesso da rede de borda. Você pode ler os logs no console, na aba Logs do projeto, ou pelo CLI.

### Consultando pelo CLI

```
nimbus logs --project api --since 2h
nimbus logs --project api --follow
nimbus logs --project api --level error --since 30m
nimbus logs --project api --deployment dep_7hk2m
nimbus logs --project api --search "timeout" --since 1d
```

`--follow` mantém a conexão aberta e mostra as linhas novas em tempo real; cada projeto aceita até 5 conexões desse tipo ao mesmo tempo. `--level` filtra pelo nível, quando a linha é um JSON com o campo `level`. Escrever logs em JSON, com um objeto por linha, permite filtrar por qualquer campo no console.

### Limites e retenção

Cada linha pode ter até 16 KB; o que passar disso é cortado e marcado com `[truncated]`. Os logs ficam guardados por 1 dia no Hobby, 7 dias no Pro, 30 dias no Business e até 90 dias no Enterprise. Para guardar por mais tempo ou analisar em outra ferramenta, use um log drain, disponível a partir do Business.

### Logs de build

Os logs de build ficam no próprio deploy, em Deployments > (deploy) > Build, e seguem a mesma retenção. Se um build falha antes de começar a rodar o seu comando, procure por mensagens da etapa `restore-cache` ou `install`: a maioria dos problemas nessa fase vem de dependências ou do cache.

## Métricas

A Nimbus coleta métricas de cada projeto automaticamente, sem instalar agente:

| Métrica                                     | O que mede                              |
| ------------------------------------------- | --------------------------------------- |
| `requests`                                  | Requisições por minuto, por status HTTP |
| `latency_p50`, `latency_p95`, `latency_p99` | Tempo de resposta em milissegundos      |
| `http_5xx_rate`                             | Porcentagem de respostas 5xx            |
| `cpu`                                       | Uso de CPU por instância                |
| `memory`                                    | Uso de memória por instância, em MB     |
| `cold_starts`                               | Instâncias iniciadas do zero por minuto |
| `instances`                                 | Número de instâncias ativas             |

A resolução é de 1 minuto. As métricas ficam disponíveis por 7 dias no Hobby, 30 dias no Pro e 90 dias no Business e no Enterprise. No console, a aba Métricas permite comparar dois deploys lado a lado, o que ajuda a confirmar se uma versão nova piorou a latência.

Para métricas da sua própria aplicação, como pedidos criados por minuto, escreva uma linha de log em JSON com o campo `metric` e um valor numérico. O console agrega essas linhas como métricas personalizadas, com a mesma retenção dos logs.

## Alertas

Alertas avisam quando uma métrica passa de um limite por um certo tempo. Estão disponíveis a partir do plano Pro; no Hobby só existem os alertas de uso da cobrança.

### Criando uma regra

```
nimbus alerts create --project api \
  --metric http_5xx_rate --above 2 --for 5m \
  --channel slack:#ops --channel email:oncall@empresa.com
```

Essa regra dispara quando a taxa de 5xx fica acima de 2% durante 5 minutos seguidos. Os canais aceitos são e-mail, Slack, PagerDuty e webhook. No canal webhook, a Nimbus envia o evento `alert.triggered`, assinado como qualquer outro webhook. Cada projeto pode ter até 25 regras.

### Disparo e resolução

Uma regra disparada só envia nova notificação quando é resolvida, ou seja, quando a métrica volta ao normal pelo mesmo período configurado em `--for`. Isso evita dezenas de mensagens durante um mesmo incidente. Para silenciar uma regra durante uma manutenção planejada, use `nimbus alerts mute <id> --for 2h`.

### Sugestões de regras para começar

- `http_5xx_rate` acima de 2% por 5 minutos.
- `latency_p95` acima do dobro do valor normal por 10 minutos.
- `memory` acima de 90% do limite da instância por 10 minutos, que costuma anteceder reinícios por falta de memória.
- `instances` igual a 0 por 2 minutos em produção.

## Rastreando uma requisição

Toda resposta da Nimbus, tanto da API quanto das suas aplicações, traz o cabeçalho `X-Request-Id`, com um valor como `req_01J9ZKQ4`. O mesmo ID aparece nos logs de acesso da borda e é repassado à sua aplicação no cabeçalho de entrada. Registre esse valor nos seus logs: com ele, você encontra todas as linhas de uma requisição com `nimbus logs --search req_01J9ZKQ4`. Inclua também o ID quando abrir um chamado no suporte; ele acelera muito a investigação.

## Enviando dados para outras ferramentas

Se a sua equipe já usa outra plataforma de observabilidade, configure um log drain para enviar os logs em tempo quase real para um endpoint HTTPS, um servidor syslog ou o Datadog. O recurso existe no Business e no Enterprise e só envia linhas geradas depois da criação do drain. As métricas da plataforma podem ser lidas pela API, em `GET /v2/projects/{id}/metrics`, com o escopo `metrics:read`, o que permite montar painéis próprios.

## Boas práticas

- Escreva logs estruturados em JSON, com `level`, `message` e o `X-Request-Id`.
- Não registre segredos, tokens nem dados pessoais desnecessários; os logs ficam acessíveis a todos os membros com papel Developer ou superior.
- Crie alertas antes do primeiro incidente, não durante.
- Revise as regras a cada trimestre: alerta que dispara toda semana sem ação acaba sendo ignorado.
