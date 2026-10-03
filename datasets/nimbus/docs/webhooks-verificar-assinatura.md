---
id: webhooks-verificar-assinatura
title: Como verificar a assinatura de um webhook
lang: pt
tags: [webhooks, seguranca]
---

Toda entrega de webhook da Nimbus traz o cabeçalho `Nimbus-Signature`, no formato `t=<timestamp>,v1=<assinatura>`. Para conferir se a requisição veio mesmo da Nimbus, monte uma string com o timestamp, um ponto e o corpo bruto da requisição, exatamente como chegou, sem reformatar o JSON. Calcule o HMAC-SHA256 dessa string usando o segredo do endpoint (ele começa com `whsec_`) e compare o resultado, em hexadecimal, com o valor de `v1`, sempre com uma comparação de tempo constante.

Rejeite a entrega se o timestamp estiver a mais de cinco minutos do seu relógio; isso impede que alguém capture uma requisição válida e a reenvie depois. O erro mais comum é deixar o framework fazer o parse do JSON antes da verificação: qualquer espaço ou quebra de linha a mais muda o hash, e a assinatura nunca bate.
