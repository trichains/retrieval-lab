---
id: faq-autenticacao
title: Perguntas frequentes sobre autenticação
lang: pt
tags: [autenticacao, chaves-de-api, faq]
---

Reunimos aqui as dúvidas que mais chegam ao suporte sobre chaves de API, escopos, OAuth e login na Nimbus. Cada resposta é curta; quando o assunto tem página própria, indicamos onde ler mais.

## Chaves de API

### Qual é a diferença entre chave de projeto e chave pessoal?

A chave de projeto pertence ao projeto e continua funcionando mesmo que a pessoa que a criou saia da equipe. É a escolha certa para servidores, pipelines de CI e integrações. A chave pessoal pertence a um usuário, tem no máximo as permissões do papel dessa pessoa e é revogada automaticamente quando ela é removida da organização. Use chaves pessoais para scripts locais e testes.

### Como envio a chave nas requisições?

No cabeçalho `Authorization`, com o prefixo `Bearer`:

```
curl https://api.nimbus.dev/v2/projects \
  -H "Authorization: Bearer $NIMBUS_API_KEY"
```

O cabeçalho antigo `X-Nimbus-Key` só funciona na API v1, que está descontinuada.

### Onde vejo a chave depois de criada?

Em lugar nenhum. O valor completo aparece uma única vez, no momento da criação, e a Nimbus guarda apenas um hash. Depois disso, o console mostra só os quatro últimos caracteres e o ID da chave (por exemplo `key_8f2a`). Se você perdeu o valor, crie uma chave nova e revogue a antiga.

### Quantas chaves posso ter?

Até 10 chaves ativas por projeto. Chaves revogadas ou expiradas não entram na conta.

### Para que servem as chaves de teste?

Chaves que começam com `nmb_test_` acessam o modo sandbox: os recursos criados com elas não geram cobrança, os deploys ficam em um ambiente isolado e os webhooks só são entregues a endpoints marcados como de teste. Chaves de produção começam com `nmb_live_`. As duas têm o mesmo formato e os mesmos escopos; a única diferença é o ambiente que acessam.

## Escopos

### Quais escopos existem?

- `projects:read` e `projects:write`: ler e alterar projetos.
- `deploy:write`: criar deploys, promover e fazer rollback.
- `logs:read` e `metrics:read`: consultar logs e métricas.
- `webhooks:manage`: criar e editar endpoints de webhook.
- `billing:read`: ler faturas e uso.
- `keys:manage`: criar e revogar outras chaves.
- `team:manage`: convidar e remover membros.

Uma chave nova recebe apenas `projects:read`, a menos que você escolha outros escopos na criação.

### Recebi 403 insufficient_scope. O que fazer?

A chave é válida, mas não tem o escopo que a operação exige. A mensagem de erro informa o escopo que faltou, por exemplo `deploy:write`. Não é possível adicionar escopos a uma chave existente: crie outra com os escopos certos. Isso é intencional, para que uma chave vazada nunca ganhe poderes novos sem que alguém perceba.

## Rotação e revogação

### Com que frequência devo trocar as chaves?

A recomendação é a cada 90 dias. O console marca com um aviso amarelo as chaves mais antigas que isso. Troque também sempre que alguém com acesso à chave sair da empresa.

### Como trocar uma chave sem derrubar a aplicação?

Pelo console, abra Configurações > Chaves de API, clique nos três pontos ao lado da chave e escolha Rotacionar. Você define um período de carência entre 1 hora e 7 dias. Durante esse período, a chave antiga e a nova funcionam ao mesmo tempo, então dá tempo de atualizar o segredo em todos os serviços e fazer um novo deploy. Quando a carência termina, a chave antiga deixa de funcionar sozinha, sem ação sua. Se preferir o terminal, o comando equivalente é `nimbus keys rotate`.

Uma dica: antes do fim da carência, confira no console a coluna "Último uso" da chave antiga. Se a data ainda estiver mudando, algum serviço continua usando a chave velha.

### Vazou uma chave, e agora?

Revogue imediatamente em Configurações > Chaves de API > Revogar, ou com `nimbus keys revoke`. Não use a rotação nesse caso, porque ela mantém a chave antiga viva durante a carência. A revogação vale em todas as regiões em até 60 segundos. Depois, confira o log de auditoria para ver o que foi feito com a chave.

A Nimbus também participa de varredura de segredos em repositórios públicos do GitHub. Se uma chave `nmb_live_` for publicada num repositório público, ela é revogada automaticamente e os Owners recebem um e-mail com o link do commit.

## OAuth

### Quando usar OAuth em vez de chave de API?

Para integrações entre servidores que precisam de credenciais que expiram sozinhas e podem ser auditadas por cliente. A Nimbus suporta o fluxo client credentials: você troca `client_id` e `client_secret` por um token de acesso em `https://auth.nimbus.dev/oauth/token`. O token vale por 1 hora e não há refresh token; peça um novo quando estiver perto de expirar. Veja a página sobre OAuth client credentials para exemplos.

### Posso usar OAuth para login de usuários no meu app?

Não. A Nimbus não é provedor de identidade para as suas aplicações. O OAuth da Nimbus serve apenas para acessar a API da própria Nimbus.

## Login e SSO

### Posso exigir 2FA da equipe?

Sim, nos planos Pro e superiores, em Configurações > Segurança. A Nimbus aceita aplicativos autenticadores (TOTP) e chaves de segurança físicas (WebAuthn). SMS não é aceito.

### O SSO está disponível em quais planos?

No Business e no Enterprise, via SAML 2.0. O provisionamento automático de contas via SCIM existe só no Enterprise. O passo a passo está na página sobre SSO com SAML.

### Perdi o celular com o 2FA. Como recupero o acesso?

Use um dos códigos de recuperação gerados quando você ativou o 2FA; cada código funciona uma vez. Sem os códigos, peça a um Owner da organização para redefinir o seu 2FA. Se você for o único Owner, o suporte faz uma verificação de identidade, que leva até 3 dias úteis.

### Por que fui desconectado do console?

Sessões do console expiram após 30 dias sem uso, ou após 12 horas quando o login foi feito via SSO. Trocar a senha encerra todas as outras sessões abertas.
