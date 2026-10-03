---
id: api-keys-rotation
title: Rotating API keys
lang: en
tags: [auth, api-keys, security]
---

API keys give full access to whatever their scopes allow, so they should be replaced on a schedule and immediately when you suspect a leak. Nimbus lets you rotate a key without downtime: the new key and the old one work side by side for a grace period, which gives you time to update every place that uses it.

## Rotate with the CLI

List the keys of the current project to find the key ID (keys are identified by IDs like `key_8f2a`, never by their secret value):

```
nimbus keys list
```

Then rotate it, choosing how long the old key keeps working:

```
nimbus keys rotate key_8f2a --grace 48h
```

The command prints the new secret once. Copy it straight into your secret manager; Nimbus only stores a hash and cannot show it again. The new key keeps the name and the scopes of the old one. If you omit `--grace`, the old key stays valid for 24 hours. The longest grace period allowed is 7 days (`--grace 168h`).

During the grace period the old key is shown as `expiring` in `nimbus keys list` and in the console. When the period ends, any request made with it fails with `401 invalid_api_key`.

## Check that nothing still uses the old key

Each key has a `last_used_at` field, visible with `nimbus keys show key_8f2a`. Before the grace period ends, confirm that this timestamp stopped moving. If it is still recent, some service, cron job or CI pipeline is still sending the old key. You can extend the grace period once with `nimbus keys rotate key_8f2a --extend 24h`, as long as the total stays within 7 days.

## When a key has leaked

Do not rotate a leaked key: rotation keeps the old key alive during the grace period. Revoke it instead:

```
nimbus keys revoke key_8f2a
```

Revocation takes effect across all regions within 60 seconds. Create a new key afterwards with `nimbus keys create --name backend --scope deploy:write`.

## How often to rotate

We recommend rotating every 90 days. The console shows a warning next to any key older than that, and Owners receive a monthly email listing keys that have not been rotated. Rotation is a per-key action; there is no bulk rotation, so scripts that rotate many keys should call the command once per key.
