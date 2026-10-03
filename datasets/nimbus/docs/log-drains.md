---
id: log-drains
title: Log drains
lang: en
tags: [logs, observability]
---

A log drain forwards your project's logs to an outside system in near real time. Drains are available on the Business and Enterprise plans. Nimbus supports three destinations: an HTTPS endpoint, which receives batches of newline-delimited JSON (up to 1 MB or every 5 seconds, whichever comes first); syslog over TLS; and Datadog.

Create one with `nimbus drains add https://logs.example.com/ingest --project api`. Drains are not retroactive: only lines produced after the drain is created are sent, so use the built-in log search for anything older.
