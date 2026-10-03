---
id: runbook-elevated-5xx
title: Runbook for elevated 5xx errors
lang: en
tags: [runbook, incidents, errors]
---

Use this runbook when an application on Nimbus starts returning more server errors than usual, typically because an `http_5xx_rate` alert fired. Work through the steps in order. Most incidents are solved by step 3.

## Before you start

Open three things side by side: the project's Metrics tab, a terminal with `nimbus logs --project <name> --follow --level error`, and status.nimbus.dev. Write down the time the errors started; you will need it to correlate with deployments and to file a ticket if the cause is on our side.

## Step 1: Is it Nimbus or is it you?

Check status.nimbus.dev for the region your project runs in. If the Edge network or Postgres component shows an open incident in that region, the errors are probably not caused by your code. Subscribe to the incident, avoid making changes that would complicate the picture, and skip to "Communicating" below.

If the status page is green, look at whether the problem is limited to one project. Errors across several unrelated projects in the same region, with no deploy in any of them, are worth reporting to support even before the status page shows anything. Include request IDs.

## Step 2: Identify the kind of 5xx

Not all 5xx errors mean the same thing. The edge network adds an `X-Nimbus-Error` header when it generates the error itself; responses produced by your code do not have it.

| What you see                 | Who produced it  | Usual cause                                      |
| ---------------------------- | ---------------- | ------------------------------------------------ |
| 500 without `X-Nimbus-Error` | Your application | An unhandled exception in your code              |
| 502 `upstream_error`         | Edge             | The process crashed or closed the connection     |
| 503 `no_healthy_instances`   | Edge             | No instance passes the health check              |
| 504 `upstream_timeout`       | Edge             | The handler took longer than the request timeout |

Run `nimbus logs --project api --since 30m --search "X-Nimbus-Error"` to count edge errors by code, or use the status code breakdown in the Metrics tab.

## Step 3: Correlate with recent deployments

```
nimbus deployments list --project api --env production --limit 5
```

If a deployment went live shortly before the errors started, roll it back first and investigate later:

```
nimbus rollback --project api
```

The rollback reuses the previous build and takes a few seconds. Remember that it restores the environment variables from that older deployment's snapshot. If the errors stop, you have your cause; open the faulty deployment's logs at leisure. Also consider changes that are not deployments: a modified environment variable takes effect on the next deploy, so the culprit may be a variable changed days ago and picked up by today's release.

## Step 4: Check dependencies

When there was no recent deploy, the usual suspect is a dependency.

### Database connections

A burst of `500` responses with errors like `too many connections` or `remaining connection slots are reserved` means the database ran out of connections. Nimbus Postgres allows 100 connections on Pro and 400 on Business. Each instance of your app opens its own pool, so scaling out can make this worse. Point the app at the connection pooler on port 6543 instead of 5432, and lower the pool size per instance.

### Database failover

`terminating connection due to administrator command` in the logs means the database switched primaries. Follow the database failover runbook.

### Third-party APIs

If your logs show timeouts calling an external service, your handlers are probably waiting on it until the request timeout, which turns into 504s. Add a client-side timeout shorter than the request timeout and return a degraded response instead.

## Step 5: Capacity

If CPU or memory are close to the limit on every instance, or `cold_starts` jumped, the app may simply need more instances:

```
nimbus scale --project api --min 3 --max 20
```

Scaling takes effect within a minute and does not need a deploy. Memory near the limit followed by restarts points to a memory leak; more instances buys time but does not fix it. A 503 `no_healthy_instances` with low traffic usually means instances fail the health check at boot, not lack of capacity: read the boot logs of the latest deployment.

## Step 6: Timeouts

For 504 `upstream_timeout`, find the slow endpoints using `latency_p99` broken down by route in the Metrics tab. The default request timeout is 60 seconds. You can raise it in `nimbus.toml`:

```toml
[http]
timeout = 120
```

The maximum is 120 seconds on Pro and 300 seconds on Business and Enterprise. Treat this as a stopgap: requests that take minutes belong in a background job that the client polls.

## Verifying recovery

- `http_5xx_rate` is back to its usual level for at least 15 minutes.
- No new `X-Nimbus-Error` responses in the logs.
- The alert resolved on its own (it resolves after the metric stays under the threshold for the configured window).

## Communicating

If the incident affects your users, post on your own status page early and update it at least every 30 minutes. If the cause is on the Nimbus side, open an urgent ticket with the region, the time window and a few request IDs. Business customers may be entitled to service credits under the SLA; claims must be filed within 30 days.

## After the incident

Write a short post-incident review: timeline, cause, what detected it, what fixed it, and one or two follow-up actions. Good follow-ups from this runbook are adding a health check that exercises the database, adding client timeouts to external calls, and enabling canary deployments so the next bad release reaches only a fraction of traffic.
