---
id: deploy-reverter-versao
title: Voltar para a versão anterior
lang: pt
tags: [deploy, cli]
---

Se a última publicação em produção quebrou alguma coisa, volte para a versão anterior com um único comando:

```
nimbus rollback
```

Sem argumentos, o comando faz o domínio de produção apontar de novo para o deploy anterior que estava com status `ready`. Para escolher uma versão específica, passe o ID dela, por exemplo `nimbus rollback dep_7hk2m`. A troca é imediata porque não existe novo build: a Nimbus reaproveita os artefatos que já estavam guardados.

Atenção: o banco de dados não volta junto. Migrações que a versão nova aplicou continuam aplicadas.
