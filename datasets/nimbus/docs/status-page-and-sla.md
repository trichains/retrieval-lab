---
id: status-page-and-sla
title: Status page and SLA
lang: en
tags: [status, sla, incidents]
---

## Status page

The live state of the platform is published at status.nimbus.dev. It shows each component separately (API, Console, Builds, Edge network, Postgres and Webhooks) for each region, so an outage in `fra1` does not hide the fact that `gru1` is healthy. You can subscribe to updates by email, RSS, a Slack app or a webhook, and choose to follow only the components and regions you use.

During a SEV1 incident, the status page is updated at least every 30 minutes, even when there is nothing new to report. A public post-mortem is published within 5 business days after every SEV1. Scheduled maintenance is announced on the status page at least 72 hours in advance.

## Service level agreement

| Plan       | Monthly uptime commitment       |
| ---------- | ------------------------------- |
| Hobby, Pro | No financial SLA (99.9% target) |
| Business   | 99.95%                          |
| Enterprise | 99.99%                          |

Uptime is measured per minute. A minute counts as down when more than 5% of valid requests to the API or to the edge network fail with a 5xx error caused by Nimbus.

## Service credits

If monthly uptime falls below the commitment, Business customers receive credits on the monthly fee:

| Monthly uptime        | Credit |
| --------------------- | ------ |
| 99.0% to below 99.95% | 10%    |
| 95.0% to below 99.0%  | 25%    |
| Below 95.0%           | 50%    |

Credits are capped at 50% of the monthly fee and are applied to a future invoice; they are not paid out in cash. Enterprise credits follow the contract.

To claim credits, open a support ticket within 30 days after the end of the incident, including the affected region and some request IDs from failed calls. Downtime caused by your own code or configuration, by scheduled maintenance announced on time, or by events outside our reasonable control is excluded.
