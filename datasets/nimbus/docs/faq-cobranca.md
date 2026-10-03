---
id: faq-cobranca
title: Perguntas frequentes sobre planos e cobrança
lang: pt
tags: [cobranca, planos, faq]
---

Esta página responde às dúvidas mais comuns sobre planos, preços, formas de pagamento e impostos. Para assuntos com página própria, como reembolso e nota fiscal, há um resumo aqui e o detalhe na página específica.

## Planos e preços

### Quais planos existem?

| Plano      | Preço em dólar        | Preço em reais        |
| ---------- | --------------------- | --------------------- |
| Hobby      | Gratuito              | Gratuito              |
| Pro        | US$ 20 por membro/mês | R$ 109 por membro/mês |
| Business   | US$ 60 por membro/mês | R$ 329 por membro/mês |
| Enterprise | Sob contrato          | Sob contrato          |

O Hobby é pensado para projetos pessoais e permite apenas um membro. O Pro atende equipes pequenas, e o Business acrescenta SSO, SLA de 99,95%, log drains e várias regiões por projeto.

### Todo membro paga?

Não. Os papéis Viewer e Billing não ocupam assento pago. Só pagam Owners, Admins e Developers.

### Existe desconto no plano anual?

Sim. No pagamento anual você paga 10 meses e usa 12. O valor é cobrado de uma vez, no início do período.

## Cobrança por uso

### O que está incluído em cada plano?

| Recurso por mês    | Hobby   | Pro       | Business   |
| ------------------ | ------- | --------- | ---------- |
| Requisições        | 100 mil | 5 milhões | 25 milhões |
| Transferência      | 10 GB   | 500 GB    | 2 TB       |
| Minutos de build   | 100     | 3.000     | 10.000     |
| Armazenamento Blob | 1 GB    | 50 GB     | 250 GB     |

### Quanto custa o que passar do incluído?

No Pro e no Business, o excedente é cobrado na fatura do mês seguinte: US$ 0,40 por milhão de requisições, US$ 0,08 por GB de transferência, US$ 0,01 por minuto de build e US$ 0,02 por GB de armazenamento por mês. No Hobby não existe excedente; ao atingir o limite do mês, os projetos param de receber tráfego até o mês seguinte ou até você mudar de plano.

### Como evito surpresas?

Configure um orçamento mensal com alertas por e-mail e, se quiser, um limite rígido. Veja a página sobre orçamento e alertas de uso.

## Formas de pagamento

### Quais formas de pagamento são aceitas?

Cartão de crédito (Visa, Mastercard e American Express) em todas as contas. Contas brasileiras faturadas em reais também podem pagar com Pix ou boleto.

### Quanto tempo o boleto leva para ser compensado?

O boleto vence 5 dias depois de emitido, e a compensação bancária leva até 2 dias úteis após o pagamento. Enquanto isso, a fatura aparece como "aguardando confirmação". O Pix é confirmado em poucos minutos.

## Pagamento recusado

### O que acontece se o cartão for recusado?

A Nimbus tenta cobrar de novo 3, 5 e 7 dias depois da primeira tentativa e avisa os contatos de cobrança por e-mail a cada vez. Se a fatura continuar em aberto 14 dias depois da primeira falha, a organização fica restrita: não é possível fazer novos deploys, mas o que já está em produção continua no ar. Com 30 dias, a organização é suspensa e os projetos são parados. Os dados de uma organização suspensa são apagados 30 dias após a suspensão, então não deixe chegar a esse ponto.

### Paguei. Quanto tempo leva para liberar?

Com cartão ou Pix, a restrição sai assim que o pagamento é confirmado. Com boleto, só depois da compensação.

## Mudança de plano

### Como funciona o upgrade?

O upgrade vale na hora. Você paga a diferença proporcional aos dias que faltam no ciclo, e os novos limites passam a valer imediatamente.

### E o downgrade?

Também vale na hora, mas o valor não usado vira crédito na conta, abatido da próxima fatura; não há devolução em dinheiro. Antes de concluir, o console mostra quais recursos passam da cota do plano novo, como projetos ou domínios a mais, e pede que você os remova.

### Tenho direito a reembolso?

Planos mensais não são reembolsáveis. Planos anuais podem ser reembolsados integralmente se o pedido for feito em até 14 dias da compra. A política completa está na página de reembolso.

## Impostos e nota fiscal

### O preço em reais já inclui impostos?

Sim. Contas faturadas em reais são atendidas pela Nimbus Tecnologia Ltda., empresa brasileira, e o preço já inclui o ISS. Contas faturadas em dólar são atendidas pela Nimbus Inc. e recebem uma invoice comercial sem tributos brasileiros; nesse caso, encargos como o IOF da compra internacional no cartão ficam por conta do cliente.

### Posso trocar uma conta em dólar para reais?

Sim, desde que o endereço de cobrança seja no Brasil e você informe CPF ou CNPJ. A troca vale a partir do ciclo seguinte e não pode ser feita com fatura em aberto.

### Minha empresa precisa reter impostos na fonte. Como faço?

Informe as retenções em Billing > Dados fiscais antes do fechamento do mês. A Nimbus emite a nota com os valores retidos destacados, e a fatura passa a cobrar o valor líquido. Mudanças feitas depois da emissão da nota só valem para o mês seguinte.

### Quando recebo a NFS-e?

Em até 3 dias úteis depois da confirmação do pagamento, por e-mail e em Console > Billing > Documentos fiscais. Detalhes sobre CNPJ e cancelamento estão na página sobre nota fiscal.

## Cancelamento

### Como cancelo o plano pago?

Em Billing > Plano > Cancelar assinatura. A organização volta ao Hobby no fim do período já pago. Se ela tiver mais recursos do que o Hobby permite, os projetos excedentes ficam pausados, não apagados, até você reduzir o uso ou contratar de novo. Cancelar o plano não apaga a organização; para isso, um Owner precisa excluí-la em Configurações > Avançado.
