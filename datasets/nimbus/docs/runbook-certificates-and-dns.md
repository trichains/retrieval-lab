---
id: runbook-certificates-and-dns
title: Runbook for TLS certificates and DNS
lang: en
tags: [runbook, domains, tls, dns]
---

This runbook covers custom domains on Nimbus: how certificates are issued and renewed, what to do when a certificate is about to expire or already expired, and how to troubleshoot DNS records that do not resolve to Nimbus.

## How certificates work on Nimbus

When you add a custom domain to a project, Nimbus issues a TLS certificate for it automatically through an ACME certificate authority. Certificates are valid for 90 days and renewal starts 30 days before expiry, without any action on your side. Renewal uses an HTTP challenge served by Nimbus itself, so it only works while the domain's DNS points to Nimbus.

If renewal keeps failing, Nimbus warns you twice: an email to the project's Owners and Admins when 14 days remain, and a `domain.certificate_expiring` webhook event at the same moment, which you can route to your on-call tool. Another email is sent when 3 days remain.

## Symptoms

- Browsers show "Your connection is not private" or `NET::ERR_CERT_DATE_INVALID` for your domain.
- API clients fail with `certificate has expired` or `x509: certificate has expired or is not yet valid`.
- The domain shows `renewal_failed` or `expired` in Console > Domains.
- You received the 14-day or 3-day warning email.

## Step 1: Check the domain state

```
nimbus domains inspect app.example.com
```

The output shows the certificate's expiry date, the result of the last renewal attempt with its error message, and the DNS records Nimbus sees for the domain. Most problems are explained by that last error message.

## Step 2: Common causes of failed renewals

### DNS no longer points to Nimbus

Someone moved the domain to another provider, changed the record during a migration, or the domain registration itself expired. The challenge request never reaches Nimbus. Fix the DNS records (see "DNS configuration" below) and force a renewal.

### A CAA record blocks the certificate authority

CAA records list which authorities may issue certificates for a domain. If your domain or its parent has CAA records, one of them must allow `nimbus.dev`:

```
example.com.  CAA 0 issue "nimbus.dev"
```

Adding a CAA record for another provider without including Nimbus is a frequent cause of renewal failures months after the domain was set up.

### A proxy in front of Nimbus

If a CDN or proxy sits in front of Nimbus and terminates TLS itself, the challenge request is answered by the proxy and never reaches Nimbus. Either turn the proxy off for the domain (DNS only), or let the proxy handle the public certificate and keep Nimbus for origin traffic.

## Step 3: Force a renewal

After fixing the cause, do not wait for the next automatic attempt, which can be hours away:

```
nimbus domains cert renew app.example.com
```

Issuance usually completes in under two minutes. Run `nimbus domains inspect` again to confirm the new expiry date.

## Custom certificates

On Business and Enterprise you can upload your own certificate instead, for example an extended validation certificate required by a client:

```
nimbus domains cert upload app.example.com --cert fullchain.pem --key privkey.pem
```

Uploaded certificates are never renewed by Nimbus. You must upload the new one before the old expires, and the expiry warnings described above still apply. To return to automatic certificates, run `nimbus domains cert auto app.example.com`.

## DNS configuration

Use these records when connecting a domain to a project:

| Domain type                   | Record | Value                             |
| ----------------------------- | ------ | --------------------------------- |
| Subdomain (`app.example.com`) | CNAME  | `cname.nimbus-dns.net`            |
| Apex (`example.com`)          | A      | `203.0.113.10` and `203.0.113.11` |

Prefer subdomains with a CNAME: they follow changes in Nimbus's network without any action from you. If your DNS provider supports CNAME flattening or ALIAS records at the apex, you can use `cname.nimbus-dns.net` there too.

Before a domain is attached to a project, Nimbus asks you to prove ownership with a TXT record named `_nimbus-challenge` on the domain, holding a value shown in the console. You can remove it after verification succeeds.

## Troubleshooting DNS

### The domain does not resolve to Nimbus

Query the records directly, bypassing caches:

```
dig +short app.example.com CNAME
dig +short example.com A @1.1.1.1
dig +short _nimbus-challenge.app.example.com TXT
```

If the answer is empty or shows another provider's addresses, the record is missing or wrong at your DNS host. Check also that you edited the zone at the provider that is actually authoritative: `dig NS example.com` shows the name servers in use.

### Changes are not visible yet

DNS changes propagate according to the TTL of the old record. If the old record had a TTL of one day, some resolvers may keep the old answer for up to a day. Before a planned migration, lower the TTL to 300 seconds a day ahead.

### Conflicting records

A name cannot have a CNAME together with other records. If you added a CNAME to a subdomain that already had A or MX records, many providers silently keep the old ones. Remove the conflicting records.

## Verification

- `nimbus domains inspect` shows status `active` and an expiry date more than 30 days away.
- `curl -vI https://app.example.com` completes the TLS handshake and shows the new certificate's dates.
- The domain warning is gone from the console.

## Preventing the next one

Route the `domain.certificate_expiring` webhook to your alerting tool, keep CAA records in a reviewed configuration file, and avoid putting a proxy in front of Nimbus unless you have a clear reason.
