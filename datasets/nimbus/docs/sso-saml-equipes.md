---
id: sso-saml-equipes
title: SSO com SAML para equipes
lang: pt
tags: [autenticacao, sso, equipes]
---

O login único (SSO) com SAML 2.0 permite que sua equipe entre na Nimbus usando o provedor de identidade da empresa, em vez de senha própria. O recurso está disponível nos planos Business e Enterprise. Testamos a integração com Okta, Microsoft Entra ID, Google Workspace e JumpCloud, mas qualquer provedor compatível com SAML 2.0 deve funcionar.

## Configuração

1. **Verifique o domínio.** Em Console > Configurações > Segurança > SSO, informe o domínio de e-mail da empresa. A Nimbus gera um registro TXT no formato `nimbus-verify=...`, que você cria no DNS. A verificação costuma levar poucos minutos.
2. **Crie o aplicativo no provedor.** Use estes valores, trocando `acme` pelo identificador da sua organização:
   - ACS URL: `https://auth.nimbus.dev/saml/acme/acs`
   - Entity ID: `https://auth.nimbus.dev/saml/acme`
3. **Mapeie os atributos.** O atributo `email` é obrigatório. `firstName`, `lastName` e `groups` são opcionais.
4. **Envie o metadata.** Faça upload do XML de metadata do provedor no console, ou cole a URL dele.
5. **Teste.** O botão "Testar conexão" abre um login em nova aba sem afetar ninguém da equipe.
6. **Exija o SSO.** Depois do teste, ative "Exigir SSO". A partir daí, membros com e-mail do domínio verificado não conseguem mais entrar com senha.

## Como as contas são criadas

Com o provisionamento just-in-time, quem faz o primeiro login pelo provedor ganha uma conta automaticamente, com o papel Developer. Você pode mudar o papel padrão ou mapear grupos do provedor para papéis da Nimbus. No Enterprise também existe provisionamento via SCIM, que cria, atualiza e desativa contas conforme o diretório da empresa; ao desativar alguém no provedor, o acesso à Nimbus é removido em poucos minutos.

## Detalhes importantes

As sessões abertas via SSO duram 12 horas; depois disso, o usuário passa pelo provedor de novo. Mesmo com o SSO exigido, os Owners mantêm acesso de emergência por senha e códigos de recuperação, para o caso de o provedor de identidade ficar fora do ar. Chaves de API e clientes OAuth não passam pelo SSO e continuam funcionando normalmente.
