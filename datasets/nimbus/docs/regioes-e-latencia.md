---
id: regioes-e-latencia
title: Regiões e latência
lang: pt
tags: [regioes, desempenho]
---

A Nimbus roda aplicações em cinco regiões:

| Código | Localização           |
| ------ | --------------------- |
| `gru1` | São Paulo, Brasil     |
| `iad1` | Washington, D.C., EUA |
| `fra1` | Frankfurt, Alemanha   |
| `sin1` | Singapura             |
| `nrt1` | Tóquio, Japão         |

Se você não escolher nada, os projetos novos vão para `iad1`. Para mudar, defina a região no `nimbus.toml`:

```toml
regions = ["gru1"]
```

## Como escolher

A regra prática é colocar a aplicação perto do banco de dados, e os dois perto da maioria dos usuários. Uma aplicação em `gru1` que consulta um banco em `iad1` paga a viagem de ida e volta a cada consulta, o que costuma ser pior do que ter tudo nos EUA.

Valores típicos de latência de rede para um usuário em São Paulo:

| Destino | Latência típica |
| ------- | --------------- |
| `gru1`  | 10 a 25 ms      |
| `iad1`  | cerca de 120 ms |
| `fra1`  | cerca de 200 ms |
| `nrt1`  | cerca de 260 ms |

Conteúdo estático e respostas com cache são servidos pela rede de borda, com mais de 30 pontos de presença, independentemente da região da aplicação.

## Várias regiões

No Business, um projeto pode rodar em até 3 regiões ao mesmo tempo; no Enterprise, em todas. O tráfego vai para a região mais próxima do usuário. O banco Nimbus Postgres, porém, tem um único primário, na região em que foi criado. No Business, é possível criar réplicas de leitura em outras regiões; as escritas continuam indo para o primário.

## Mudar de região

Para a aplicação, basta alterar `regions` e fazer um novo deploy. O banco não pode ser movido: crie um banco novo na região desejada e restaure nele um backup do antigo, planejando uma janela de manutenção para as escritas feitas durante a cópia.
