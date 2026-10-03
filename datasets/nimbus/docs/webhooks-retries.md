---
id: webhooks-retries
title: Webhook retries and backoff
lang: en
tags: [webhooks, reliability]
---

A webhook delivery counts as successful when your endpoint answers with any 2xx status within 10 seconds. Everything else is a failure: 4xx and 5xx responses, timeouts, connection errors, TLS errors and also 3xx responses, because Nimbus does not follow redirects.

When a delivery fails, Nimbus retries it with an increasing delay. There is one initial attempt and up to seven retries:

| Attempt | Delay after the previous attempt |
| ------- | -------------------------------- |
| 2       | 30 seconds                       |
| 3       | 2 minutes                        |
| 4       | 10 minutes                       |
| 5       | 30 minutes                       |
| 6       | 2 hours                          |
| 7       | 6 hours                          |
| 8       | 12 hours                         |

The last attempt happens about 21 hours after the first one. Each request carries the header `Nimbus-Delivery-Attempt` with the attempt number, which helps when you read your own access logs. If all eight attempts fail, the delivery is marked `failed` in the delivery log and is not retried again automatically. You can still replay it by hand from the console or with `nimbus webhooks replay`.

Two situations stop retries earlier. If your endpoint answers `410 Gone`, Nimbus treats it as a request to unsubscribe and disables the endpoint immediately. And if an endpoint has received only failures for 72 hours in a row, with no successful delivery in between, it is disabled automatically and the organization's Owners receive an email. A disabled endpoint keeps its configuration and signing secret; turn it back on in the console once the receiving side is fixed.

Because a delivery can be retried after your server already processed it (for example, when your handler did the work but took longer than 10 seconds to answer), the same event may arrive more than once. Make your handler idempotent by recording the `Nimbus-Event-Id` of each event you have processed.
