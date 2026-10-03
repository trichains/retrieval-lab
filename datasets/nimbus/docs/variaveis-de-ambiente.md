---
id: variaveis-de-ambiente
title: Variáveis de ambiente e segredos
lang: pt
tags: [deploy, configuracao, seguranca]
---

Variáveis de ambiente guardam configurações que mudam entre ambientes, como URLs de serviços, flags e credenciais. Na Nimbus, cada variável pertence a um ambiente: `production`, `staging` ou `preview`. A mesma chave pode ter valores diferentes em cada um.

## Comandos principais

```
nimbus env set API_URL=https://api.exemplo.com --env production
nimbus env set DATABASE_PASSWORD --secret --env production
nimbus env ls --env production
nimbus env rm FEATURE_X --env preview
nimbus env pull .env.local
```

Com `--secret`, o CLI pede o valor de forma interativa, sem que ele apareça no histórico do terminal. Segredos são criptografados com AES-256 e não podem ser lidos depois de criados, nem pelo console nem pela API; dá apenas para sobrescrever ou apagar. Por isso, `nimbus env pull` baixa somente as variáveis comuns, nunca os segredos.

## Quando a mudança vale

Alterar uma variável não muda os deploys que já estão rodando. O valor novo só passa a valer no próximo deploy, porque cada deploy guarda uma cópia das variáveis do momento em que foi criado. Depois de trocar uma senha, rode `nimbus deploy --prod` para publicar com o valor novo.

## Regras e limites

- Nomes devem seguir o padrão `^[A-Z_][A-Z0-9_]*$`, por exemplo `STRIPE_KEY` ou `_INTERNAL_FLAG`.
- O prefixo `NIMBUS_` é reservado para variáveis do sistema.
- O tamanho total das variáveis de um ambiente é de até 64 KB.

## Variáveis do sistema

Todo deploy recebe automaticamente `NIMBUS_ENV` (o nome do ambiente), `NIMBUS_REGION` (por exemplo `gru1`) e `NIMBUS_DEPLOYMENT_ID`. Elas são úteis em logs e para ajustar comportamento por ambiente sem criar variáveis próprias.
