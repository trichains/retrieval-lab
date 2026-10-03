---
id: migration-guide-v1-v2
title: Migrating from API v1 to v2
lang: en
tags: [api, migration, changelog]
---

API v2 became generally available on 2026-01-15. API v1 is deprecated and will be retired on 2027-03-31. This guide lists every breaking change and the order in which we suggest you migrate. Most integrations need a day or two of work; those that consume webhooks need a little more, because the signature scheme changed.

## Timeline

| Date       | What happens                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| 2026-01-15 | API v2 and SDK v4 released.                                                                                       |
| 2026-04-01 | v1 deprecated. Every v1 response carries `Deprecation: true` and `Sunset: Wed, 31 Mar 2027 23:59:59 GMT` headers. |
| 2027-02-10 | First brownout: v1 returns `410 api_version_retired` for one hour, from 14:00 to 15:00 UTC.                       |
| 2027-03-03 | Second brownout: four hours, from 12:00 to 16:00 UTC.                                                             |
| 2027-03-31 | v1 retired. All v1 requests return `410 api_version_retired`.                                                     |

The brownouts exist to reveal integrations that nobody remembers. If something breaks during a brownout, you have found a v1 caller. To see which of your keys still call v1, open Console > Settings > API usage and filter by version.

## Base URL and versioning

The version is part of the path. Replace `https://api.nimbus.dev/v1/` with `https://api.nimbus.dev/v2/`. There is no version header and no per-key version pinning; the path alone decides.

## Authentication

v1 accepted the key in the `X-Nimbus-Key` header. v2 accepts only the standard header:

```
Authorization: Bearer nmb_live_...
```

Existing keys keep working, so you do not need to create new ones. OAuth access tokens work only with v2.

## Renamed resources

| v1                  | v2                           |
| ------------------- | ---------------------------- |
| `/apps`             | `/projects`                  |
| `/apps/{id}/builds` | `/projects/{id}/deployments` |
| `app_id` field      | `project_id`                 |
| `/hooks`            | `/webhooks/endpoints`        |

IDs did not change. An app with ID `prj_42` in v1 is the project `prj_42` in v2.

## Status values

Deployment statuses were renamed to be more explicit:

| v1        | v2         |
| --------- | ---------- |
| `pending` | `queued`   |
| `running` | `building` |
| `ok`      | `ready`    |
| `error`   | `failed`   |
| `stopped` | `canceled` |

If you compare status strings anywhere, for example in a CI script that waits for `ok`, update those comparisons.

## Pagination

v1 used page numbers (`?page=3&per_page=50`). v2 uses cursors:

```
GET /v2/projects/prj_42/deployments?limit=50
GET /v2/projects/prj_42/deployments?limit=50&starting_after=dep_9xk1
```

Each list response has a `data` array and a `has_more` boolean. To get the next page, pass the ID of the last item as `starting_after`. The maximum `limit` is 100, and the default is 20. Cursors are stable when new items are created during the iteration, which was a frequent source of duplicates with page numbers.

## Timestamps and amounts

v1 returned timestamps as Unix seconds (`"created": 1727990400`). v2 returns ISO 8601 strings in UTC, and the field names end in `_at`:

```json
{ "created_at": "2024-10-03T21:20:00Z" }
```

Money amounts are integers in the smallest currency unit in v2 (`"amount": 2000, "currency": "usd"` means US$ 20.00). In v1 they were decimal strings (`"amount": "20.00"`).

## Error format

v1 returned errors as `{"error": "Invalid key"}`. v2 returns an object with a stable `code`, a `message` and a `request_id`. See the error codes reference for the full list. If your code matched on v1 error messages, switch to matching on `code`.

## Rate limit headers

v1 sent `X-Rate-Limit` and `X-Rate-Limit-Left`. v2 sends `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`, and `Retry-After` on 429 responses. The limits themselves are the same in both versions.

## Webhooks

This is the change that requires the most care. v1 endpoints received an `X-Nimbus-Signature` header with an HMAC-SHA256 of the body alone, without a timestamp. v2 endpoints receive `Nimbus-Signature: t=...,v1=...`, where the signed payload is the timestamp, a dot and the raw body. The timestamp lets you reject replayed requests.

The signature version follows the endpoint, not the API you call. To migrate an endpoint:

1. Update your handler to accept both formats: check for `Nimbus-Signature` first and fall back to `X-Nimbus-Signature`.
2. Deploy the handler.
3. In the console, open the endpoint and click "Upgrade to v2 payloads". From then on, it receives only the new header and the v2 event format.
4. Remove the fallback.

The event payload also changed: v2 events wrap the object in `data.object` and include `type`, `id` and `created_at` at the top level. The event names follow the resource renames, so `build.succeeded` became `deployment.ready` and `build.failed` became `deployment.failed`.

## SDKs

SDK v4 targets API v2. SDK v3 targets v1 and stops working at the sunset. In most codebases, the upgrade means bumping the package version and renaming `apps` to `projects` in method calls. The SDKs' changelogs list a few smaller renames.

## Migration checklist

- Find every v1 caller using the API usage page in the console.
- Change the base URL and the authentication header.
- Rename resources, fields and status values.
- Replace page-number pagination with cursors.
- Parse ISO 8601 timestamps and integer amounts.
- Match errors on `code`.
- Migrate each webhook endpoint to v2 signatures, one at a time.
- Upgrade to SDK v4.
- Watch the brownout dates and confirm nothing breaks.
