---
id: api-client-retries
title: Retries and idempotency keys in API clients
lang: en
tags: [api, sdk, reliability]
---

Network calls fail now and then, and the official Nimbus SDKs retry some failures for you. This page is about requests your code sends to the Nimbus API. For events Nimbus sends to your server, see the webhook retries page instead.

By default the SDKs retry a request up to 3 times when they get a connection error, a timeout, or one of the statuses 429, 500, 502, 503 and 504. The delay starts at 0.5 seconds and doubles on each attempt, capped at 8 seconds, with full jitter. When the response has a `Retry-After` header, the SDK waits at least that long. You can change the behaviour per client:

```python
from nimbus import Nimbus

client = Nimbus(max_retries=5, timeout=30)
client_without_retries = Nimbus(max_retries=0)
```

Other 4xx errors, such as `401 invalid_api_key` or `422 validation_failed`, are never retried, because sending the same request again would give the same answer.

## Idempotency keys

Retrying a `GET` is harmless, but retrying a `POST` could create a resource twice if the first attempt actually reached the server. To prevent that, send an `Idempotency-Key` header with a unique value, such as a UUID, on every `POST`:

```
curl -X POST https://api.nimbus.dev/v2/projects/prj_42/deployments \
  -H "Authorization: Bearer $NIMBUS_API_KEY" \
  -H "Idempotency-Key: 6f1c2a0e-3b7d-4c55-9a51-0d2f8e7b1c90" \
  -d '{"ref": "main"}'
```

Nimbus stores the result of the first request for 24 hours. A repeated request with the same key gets the stored response instead of running again. Reusing a key with a different body returns `422 idempotency_key_reused`, and sending the same key while the first request is still running returns `409 conflict`. The SDKs generate an idempotency key automatically for every `POST` and reuse it across their own retries.
