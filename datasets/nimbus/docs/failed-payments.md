---
id: failed-payments
title: Failed payments
lang: en
tags: [billing]
---

If a card charge fails, Nimbus retries it automatically 3, 5 and 7 days after the first attempt and emails the billing contacts each time. You can update the card or pay with another method at any point from Console > Billing.

If the invoice is still unpaid 14 days after the first failure, the organization becomes restricted: new deploys are rejected with `402 payment_required`, but production keeps serving traffic. At 30 days the organization is suspended and its projects are stopped. Paying the open invoice lifts either state right away.
