---
id: data-retention-gdpr
title: Data retention and GDPR
lang: en
tags: [privacy, gdpr, retention]
---

This page lists how long Nimbus keeps each kind of data and how we handle requests under the GDPR.

## Retention periods

| Data                            | Kept for                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| Application logs                | 1 day (Hobby), 7 days (Pro), 30 days (Business), up to 90 days (Enterprise) |
| Metrics                         | 7 days (Hobby), 30 days (Pro), 90 days (Business and Enterprise)            |
| Webhook delivery logs           | 30 days                                                                     |
| Audit log                       | 90 days (Pro), 1 year (Business and Enterprise)                             |
| Postgres point-in-time recovery | 7 days (Pro), 30 days (Business)                                            |
| Invoices and tax records        | As long as tax law requires                                                 |

When an Owner deletes an organization, its projects stop at once and its data is deleted within 30 days. Copies in backups are purged within 90 days. Invoices are kept because the law requires it.

## Exporting your data

Owners can request an export in Console > Settings > Privacy > Export data, or with `nimbus export --org acme`. The export is a ZIP file with JSON documents for projects, deployments metadata, members, environment variable names (never values) and invoices. It is ready within 48 hours, and the download link is valid for 7 days.

## GDPR

For data your applications store on Nimbus, you are the controller and Nimbus is the processor. Our Data Processing Agreement, which includes the Standard Contractual Clauses, is available in Console > Settings > Legal and can be signed online. If you want compute and databases to stay in the European Union, deploy to the `fra1` region.

Requests from data subjects about account data held by Nimbus (access, rectification, erasure, portability) are answered within 30 days. Send them to privacy@nimbus.dev. The list of subprocessors is published on our website, and customers who signed the DPA are notified 30 days before a new subprocessor is added.
