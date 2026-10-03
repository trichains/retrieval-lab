---
id: webhooks-signature-verification
title: Verifying webhook signatures
lang: en
tags: [webhooks, security]
---

Anyone who knows your webhook URL can send requests to it, so every handler should check that a delivery really came from Nimbus before acting on it. Each delivery is signed with the endpoint's signing secret, which starts with `whsec_` and is shown in Console > Webhooks > your endpoint.

## The signature header

```
Nimbus-Signature: t=1727990400,v1=5f2b9c0e4d...
```

`t` is the Unix timestamp of the moment the delivery was signed, and `v1` is a hex-encoded HMAC-SHA256. The signed payload is the timestamp, a dot, and the raw request body: `"{t}.{raw_body}"`.

## Example in Node.js

```js
import crypto from "node:crypto";

function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (age > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
```

Three details matter:

1. Use the raw body bytes. If your framework parses JSON first and you serialize it again, the bytes change and the signature will not match.
2. Compare with a constant-time function such as `timingSafeEqual`, not with `===`.
3. Reject timestamps more than 300 seconds away from your clock. This blocks replayed requests. Keep your server clock synced with NTP.

The official SDKs wrap all of this in one call, for example `nimbus.webhooks.verify(rawBody, header, secret)` in Node.js and `nimbus.webhooks.verify(raw_body, header, secret)` in Python.

## Rolling the signing secret

To change the secret, run `nimbus webhooks secret roll --endpoint we_3k9d`. For the next 24 hours, deliveries carry two `v1` values in the same header, one per secret, and your handler should accept the request if either matches. After 24 hours, only the new secret is used.
