---
id: rate-limits
title: Rate limits
lang: en
tags: [api, rate-limits]
---

The Nimbus API uses a token bucket per organization. Every request takes one token; the bucket refills continuously at the per-minute rate of your plan, and its size (the burst) decides how many requests you can send at once after a quiet period. All API keys and OAuth tokens of an organization share the same bucket.

| Plan       | Sustained rate        | Burst    |
| ---------- | --------------------- | -------- |
| Hobby      | 60 requests/minute    | 20       |
| Pro        | 600 requests/minute   | 100      |
| Business   | 3,000 requests/minute | 500      |
| Enterprise | Contract              | Contract |

## Response headers

Every response includes:

- `X-RateLimit-Limit`: the sustained rate per minute for your plan.
- `X-RateLimit-Remaining`: tokens left in the bucket right now.
- `X-RateLimit-Reset`: Unix time at which the bucket will be full again.

When the bucket is empty, the API answers:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 4

{"error": {"code": "rate_limited", "message": "Too many requests", "request_id": "req_01J9..."}}
```

## Handling 429

Wait at least the number of seconds in `Retry-After` before sending the next request. If you run many workers, add random jitter so they do not all retry at the same instant. Watching `X-RateLimit-Remaining` lets you slow down before you hit the limit, which is better than reacting to errors.

## Endpoint-specific limits

Some operations have their own limits on top of the organization bucket:

- Creating deployments: 30 per hour per project.
- `POST /oauth/token`: 20 per minute per OAuth client.
- Live log streams (`nimbus logs --follow`): 5 concurrent connections per project.

These limits return the same `429 rate_limited` error. Monthly allowances such as number of projects or storage are not rate limits; exceeding those returns `403 quota_exceeded` instead.
