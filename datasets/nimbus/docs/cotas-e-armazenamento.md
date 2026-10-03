---
id: cotas-e-armazenamento
title: Cotas e armazenamento
lang: pt
tags: [cotas, armazenamento, planos]
---

Cotas são os limites de quantidade de recursos que cada plano inclui, como número de projetos ou espaço de armazenamento. Elas não têm relação com a velocidade das chamadas à API, que é controlada pelos limites de requisição.

| Recurso                       | Hobby              | Pro                | Business           |
| ----------------------------- | ------------------ | ------------------ | ------------------ |
| Projetos por organização      | 3                  | 50                 | 500                |
| Domínios próprios por projeto | 1                  | 50                 | 200                |
| Armazenamento no Nimbus Blob  | 1 GB               | 50 GB              | 250 GB             |
| Membros da equipe             | 1                  | Ilimitado          | Ilimitado          |
| Variáveis de ambiente         | 64 KB por ambiente | 64 KB por ambiente | 64 KB por ambiente |

## Nimbus Blob

O Nimbus Blob é o armazenamento de objetos da plataforma, usado para arquivos enviados pelos usuários, imagens e backups da aplicação. Cada objeto pode ter até 5 GB. Uploads maiores que 100 MB devem usar upload em partes (`multipart`). No Pro e no Business, o espaço acima do incluído no plano é cobrado por uso, a US$ 0,02 por GB por mês. No Hobby não há cobrança extra: ao atingir 1 GB, novos uploads são recusados.

## Quando uma cota estoura

Ao tentar criar um recurso além da cota, a API responde `403` com o código `quota_exceeded` e a mensagem indica qual cota foi atingida. Os recursos existentes continuam funcionando normalmente. Você pode liberar espaço apagando o que não usa, mudar de plano ou, no Business e no Enterprise, pedir ao suporte um aumento de cota específico, como mais domínios para um projeto de white label.

O uso atual de cada cota aparece em Console > Configurações > Uso, junto com a porcentagem consumida.
