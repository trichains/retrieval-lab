---
id: sdks
title: Official SDKs
lang: en
tags: [sdk, api]
---

Nimbus maintains official SDKs for three languages:

| Language | Package                           | Minimum runtime |
| -------- | --------------------------------- | --------------- |
| Node.js  | `@nimbus/sdk`                     | Node 18         |
| Python   | `nimbus-sdk`                      | Python 3.9      |
| Go       | `github.com/nimbus-dev/nimbus-go` | Go 1.21         |

A community-maintained PHP library also exists, but it is not supported by Nimbus.

## Versions

SDK v4 talks to API v2 and is the version to use for new code. SDK v3 talks to API v1; it receives only security fixes and stops working when API v1 is retired on 2027-03-31. Upgrading from v3 to v4 is mostly a matter of renaming `apps` to `projects` in method calls; see the v1 to v2 migration guide.

## Configuration

All SDKs read the API key from the `NIMBUS_API_KEY` environment variable when you do not pass one explicitly:

```js
import { Nimbus } from "@nimbus/sdk";

const nimbus = new Nimbus(); // uses NIMBUS_API_KEY
const project = await nimbus.projects.get("prj_42");
```

Other options are `timeout` (30 seconds by default), `maxRetries` (3 by default) and `baseUrl`, which is useful when testing against a mock server.

## Helpers

- **Pagination.** List methods return async iterators that follow the cursor for you: `for await (const d of nimbus.deployments.list("prj_42"))`.
- **Webhooks.** `nimbus.webhooks.verify(rawBody, signatureHeader, secret)` checks the signature and the timestamp tolerance and returns the parsed event.
- **Errors.** API errors are raised as `NimbusError` with `code`, `status` and `requestId` fields, so you can branch on `err.code === "rate_limited"`.

Bugs and feature requests for the SDKs go to their public repositories; questions about your account go to support.
