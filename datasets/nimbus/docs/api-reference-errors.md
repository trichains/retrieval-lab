---
id: api-reference-errors
title: API error codes reference
lang: en
tags: [api, errors, reference]
---

This reference lists every error the Nimbus API v2 can return, grouped by HTTP status, plus the errors the edge network serves to visitors of your applications. Branch on the `code` field in your code, not on the message: messages may be reworded, codes are stable.

## Error format

All API errors share the same JSON body:

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "This operation requires the deploy:write scope.",
    "request_id": "req_01J9ZKQ4B7",
    "details": { "required_scope": "deploy:write" }
  }
}
```

`request_id` matches the `X-Request-Id` response header. Include it in support tickets. `details` is optional and its shape depends on the code.

## 400 Bad Request

### bad_request

The body is not valid JSON, or a query parameter has the wrong type. The message points to the first problem found. Check that you send `Content-Type: application/json`.

### invalid_scope

Returned only by the OAuth token endpoint, when the requested scopes are not all allowed for the client.

## 401 Unauthorized

### missing_credentials

No `Authorization` header was sent. If you are migrating from API v1, note that v2 ignores the old `X-Nimbus-Key` header.

### invalid_api_key

The key does not exist, was revoked, or its rotation grace period has ended. Keys are checked by prefix as well: a `nmb_test_` key cannot call production resources and gets this same error.

### token_expired

An OAuth access token is older than one hour. Request a new one from the token endpoint; there is no refresh token.

### invalid_client

OAuth client ID or secret is wrong.

## 402 Payment Required

### payment_required

The organization is restricted because an invoice is more than 14 days overdue. Reads still work; operations that create deployments, builds or new resources fail until the invoice is paid.

### budget_exceeded

The organization reached its monthly budget with the hard limit turned on. New builds and preview deployments are blocked until the next billing cycle or until an Owner raises the budget. Production traffic is not affected.

## 403 Forbidden

### insufficient_scope

The credentials are valid but lack the scope required by the operation. `details.required_scope` names it. Scopes cannot be added to an existing key; create a new key.

### quota_exceeded

Creating the resource would go over a plan allowance, such as the number of projects, custom domains or Blob storage. `details.quota` names the allowance and `details.limit` its value.

### ip_not_allowed

The organization has an IP allowlist (Enterprise only) and the request came from an address outside it.

## 404 Not Found

### not_found

The resource does not exist, or it exists in an organization your credentials cannot see. Nimbus does not distinguish the two cases, to avoid revealing which IDs exist.

## 409 Conflict

### conflict

The request conflicts with the current state of the resource. Common causes: a request with the same `Idempotency-Key` is still being processed, or you tried to start a database failover while the previous one has not finished.

### deployment_in_progress

You tried to promote, roll back or cancel while another operation on the same project's production environment is running. Wait for it to finish and try again.

## 410 Gone

### api_version_retired

The request used an API version that has been retired. API v1 returns this code after 2027-03-31, and during the scheduled brownout windows before that date.

## 413 Payload Too Large

### payload_too_large

The request body is larger than 10 MB. To upload files to Nimbus Blob, use the multipart upload endpoints, which accept parts of up to 100 MB each.

## 422 Unprocessable Entity

### validation_failed

The JSON is well formed but a field is invalid. `details.fields` lists each field with the reason, for example `{"name": "must match ^[a-z0-9-]{3,40}$"}`.

### idempotency_key_reused

The `Idempotency-Key` was already used in the last 24 hours with a different request body. Generate a new key for each distinct operation.

## 429 Too Many Requests

### rate_limited

The organization's request bucket is empty, or an endpoint-specific limit was hit. The response has a `Retry-After` header with the number of seconds to wait. See the rate limits page for the limits per plan.

## 5xx Server Errors

### internal_error (500)

An unexpected failure on the Nimbus side. These are safe to retry with backoff, and the official SDKs do so automatically. If it persists, check status.nimbus.dev and contact support with the `request_id`.

### service_unavailable (503)

The API is in scheduled maintenance or temporarily overloaded. The response includes `Retry-After`. Maintenance windows are announced on the status page 72 hours in advance.

## Edge errors served to your visitors

These errors are not returned by the Nimbus API. They are served by the edge network to people visiting your application when Nimbus cannot get a valid response from it. They carry an `X-Nimbus-Error` header with the code, which lets you tell them apart from 5xx responses produced by your own code.

### upstream_error (502)

Your application closed the connection, crashed while handling the request, or returned a malformed HTTP response. Look at the application logs around the same timestamp; a crash usually leaves a stack trace.

### no_healthy_instances (503)

There is no running instance able to receive traffic. This happens when every instance fails its health check, when a deployment fails to boot, or when the project was stopped because of billing. Scaling to zero does not cause this error: a cold start is triggered instead.

### upstream_timeout (504)

Your application did not answer within the request timeout. The default is 60 seconds. You can raise it with `timeout` in `nimbus.toml`, up to 120 seconds on Pro and 300 seconds on Business and Enterprise. Long-running work should go to a background job instead of a request handler.

## Retrying safely

As a rule of thumb, retry `429`, `500`, `502`, `503` and `504` with exponential backoff, and never retry other 4xx errors without changing the request. For `POST` requests, send an `Idempotency-Key` so a retry cannot create the same resource twice.
