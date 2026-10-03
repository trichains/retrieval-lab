---
id: gerenciamento-de-equipe
title: Gerenciamento de equipe e papéis
lang: pt
tags: [equipes, conta]
---

Cada organização da Nimbus tem membros, e cada membro tem um papel que define o que ele pode fazer.

| Papel     | O que pode fazer                                                 |
| --------- | ---------------------------------------------------------------- |
| Owner     | Tudo, inclusive apagar a organização e transferir a titularidade |
| Admin     | Gerenciar membros (exceto Owners), projetos e configurações      |
| Developer | Fazer deploy, editar variáveis de ambiente, ver logs e métricas  |
| Billing   | Ver faturas, alterar forma de pagamento e dados fiscais          |
| Viewer    | Apenas leitura de projetos, deploys e métricas                   |

## Convidar pessoas

Pelo console, em Configurações > Equipe, ou pelo CLI:

```
nimbus team invite ana@empresa.com --role developer
```

O convite vale por 7 dias. Se expirar, reenvie com `nimbus team invite ana@empresa.com --resend`. Em organizações com SSO exigido, pessoas do domínio verificado entram pelo provedor de identidade e não precisam de convite.

## Assentos e cobrança

Os planos pagos cobram por membro. Os papéis Viewer e Billing não ocupam assento pago, então é possível dar acesso de leitura a um gestor ou ao financeiro sem aumentar a fatura.

## Remover um membro

Ao remover alguém, as chaves pessoais dessa pessoa são revogadas na hora. Chaves de projeto e clientes OAuth continuam valendo, mesmo que tenham sido criados por ela; revise-os se a saída não foi amigável. Deploys feitos pela pessoa permanecem no histórico.

## Transferir a titularidade

Só um Owner pode promover outro membro a Owner. A organização precisa ter sempre pelo menos um Owner, então, para sair, promova outra pessoa antes de rebaixar a si mesmo.

## Exigir 2FA

Nos planos Pro e superiores, Owners podem exigir autenticação em dois fatores em Configurações > Segurança. Membros sem 2FA ficam bloqueados até configurar um aplicativo autenticador ou chave de segurança.
