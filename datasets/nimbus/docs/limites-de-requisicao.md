---
id: limites-de-requisicao
title: Limites de requisição da API
lang: pt
tags: [api, limites]
---

A API da Nimbus limita o número de chamadas por minuto de cada organização, somando o tráfego de todas as chaves. No plano Hobby são 60 requisições por minuto, no Pro são 600 e no Business, 3.000. No Enterprise, o limite é negociado em contrato.

Quando o limite estoura, a API responde com status 429, código de erro `rate_limited` e o cabeçalho `Retry-After`, que informa quantos segundos esperar antes de tentar de novo. Criar mais chaves não aumenta o limite, justamente porque a contagem é feita por organização e não por chave. Se você precisa de mais capacidade de forma permanente, o caminho é mudar de plano ou conversar com o time comercial.
