---
id: cache-de-build
title: Cache de build
lang: pt
tags: [deploy, build]
---

A Nimbus guarda, por projeto, um cache com as dependências instaladas durante o build. A chave do cache combina o hash do arquivo de lock (package-lock.json, poetry.lock, go.sum e similares) com a versão da imagem de build, então ele é invalidado sozinho quando as dependências mudam.

Caches sem uso por 7 dias são apagados, e cada projeto pode ter até 2 GB de cache (10 GB no Business). Se um build está falhando de um jeito estranho, rode um deploy ignorando o cache com `nimbus deploy --no-cache`, ou limpe tudo com `nimbus cache purge`.
