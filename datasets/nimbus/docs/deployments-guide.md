---
id: deployments-guide
title: Deployments guide
lang: en
tags: [deployments, cli, environments]
---

This guide explains how code becomes a running deployment on Nimbus: project configuration, environments, the deployment lifecycle, release strategies, build cache, environment variables and continuous integration.

## Project configuration

Each project has a `nimbus.toml` file at the repository root. A minimal one looks like this:

```toml
name = "api"
regions = ["gru1"]

[build]
command = "npm run build"
output = "dist"

[http]
port = 8080
health_check = "/healthz"
```

`health_check` is the path Nimbus calls to decide if an instance is ready to receive traffic. It must answer 200 within 2 seconds. If you omit it, Nimbus only checks that the port accepts connections.

## Your first deployment

```
nimbus login
nimbus link        # connects the current directory to a project
nimbus deploy      # creates a preview deployment
nimbus deploy --prod
```

`nimbus deploy` without flags always creates a preview deployment, never a production one. Production requires `--prod`, so a mistyped command cannot replace your live site.

## Environments

Every project has three kinds of environments:

- **Production**: served at `<project>.nimbus.app` and at your custom domains. There is one production deployment live at a time.
- **Staging**: an optional long-lived environment for final checks, available on Pro and above, served at `<project>--staging.nimbus.app`. Deploy to it with `nimbus deploy --env staging`.
- **Preview**: one per Git branch, created automatically on every push, served at `<branch>--<project>.nimbus.app`. Preview deployments of deleted branches are removed after 7 days.

Each environment has its own set of environment variables, so preview deployments never see production secrets unless you copy them on purpose.

## Deployment lifecycle

A deployment moves through these statuses: `queued`, `building`, `ready`, and finally either stays `ready` or ends as `failed` or `canceled`. A build that runs for more than 45 minutes is stopped and marked `failed`. Each project can create up to 30 deployments per hour; beyond that, the API returns `429 rate_limited`.

Build minutes are counted from the start of `building` to the end of the build, and are billed against your plan's monthly allowance. Waiting in `queued` is not counted.

## Release strategies

How a new production deployment receives traffic depends on the strategy. Set it per deploy with `--strategy`, or as a default in `nimbus.toml`.

### Rolling (default)

Instances of the new version start, pass the health check and replace old instances in batches. It needs no extra capacity, but for a short time both versions serve traffic.

### Blue-green

```
nimbus deploy --prod --strategy blue-green
```

Nimbus starts a complete set of instances for the new version while the old set keeps serving all traffic. When the health check has passed three times in a row on every new instance, traffic switches to the new set in a single step. If that does not happen within 5 minutes, the deployment is marked `failed` and traffic never moves. The old set stays idle for 15 minutes after the switch, so switching back during that window is instant. Blue-green doubles the instance count during the deployment, which is billed normally.

### Canary

```
nimbus deploy --prod --strategy canary --canary-percent 10
```

The new version receives the given percentage of requests (from 1 to 50) and the rest stay on the current version. Watch the metrics, then decide:

```
nimbus promote dep_8pq3r      # send 100% to the canary
nimbus canary abort dep_8pq3r # send 100% back to the current version
```

With `--canary-duration 30m`, Nimbus promotes the canary automatically if its 5xx rate stays below the threshold (2% by default, configurable with `--canary-max-error-rate`) for the whole period. If the error rate goes over the threshold at any point, the canary is aborted and rolled back automatically. A canary that is neither promoted nor aborted within 24 hours is aborted.

## Build cache

Dependencies installed during the build are cached per project, keyed by your lockfile's hash and the build image version. The cache is restored at the beginning of every build in the same project, across all environments. Use `nimbus deploy --no-cache` to build from scratch once, for example when you suspect a corrupted dependency.

## Environment variables and secrets

Set variables per environment with `nimbus env set`. Values marked as secrets are write-only. Every deployment takes a snapshot of the variables at creation time; changing a variable does not affect running deployments until the next deploy. This is also why rolling back restores the variable values of the older deployment.

## Promoting and rolling back

Any `ready` preview deployment can be promoted to production with `nimbus promote <deployment-id>`, which skips the build because the artifacts already exist. To go back to an earlier production deployment, use `nimbus rollback`; the rollbacks page explains its limits.

## Continuous integration

Connecting a Git repository in the console is the simplest option: pushes to the default branch deploy to production and other branches create previews. To deploy from your own CI instead, create a project API key with only the `deploy:write` scope, store it as a CI secret named `NIMBUS_TOKEN` (the CLI reads it from the environment automatically), and run:

```
nimbus deploy --prod --yes
```

`--yes` skips interactive confirmations. The command exits with a non-zero status if the deployment fails, so the CI job fails too. Add `--wait=false` if you do not want the job to wait for the build to finish.
