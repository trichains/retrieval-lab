---
id: changelog-2026
title: Changelog 2026
lang: en
tags: [changelog, api]
---

- **2026-09-22** Canary deployments can now auto-promote: pass `--canary-duration` and Nimbus promotes the new version if the error rate stays under the threshold for that period.
- **2026-08-05** New region: `nrt1` (Tokyo).
- **2026-06-10** Brazilian accounts billed in BRL can now pay with Pix.
- **2026-04-01** API v1 is deprecated. v1 responses now carry `Deprecation` and `Sunset` headers. v1 will be retired on 2027-03-31.
- **2026-01-15** API v2 is generally available, together with SDK v4 for Node.js, Python and Go.
