---
id: deploy-rollbacks
title: Rolling back a deployment
lang: en
tags: [deployments, cli]
---

A rollback points your production domains back to an earlier deployment. It does not rebuild anything: Nimbus keeps the build artifacts of recent deployments, so switching back takes a few seconds.

## From the CLI

```
nimbus rollback                # previous ready production deployment
nimbus rollback dep_7hk2m      # a specific deployment
nimbus deployments list --env production
```

Use `nimbus deployments list` to find the ID you want. Only deployments with status `ready` can be targets.

## From the console

Open the project, go to Deployments, pick a previous production deployment and choose "Promote to production". This does the same thing as the CLI command and is recorded in the audit log with your name.

## How far back you can go

Nimbus keeps the artifacts of the last 5 production deployments on Hobby, the last 20 on Pro and the last 100 on Business and Enterprise. Older deployments still appear in the list, but they can only be restored by redeploying their commit, which runs a full build.

## Things a rollback does not undo

- **Environment variables.** A rollback uses the snapshot of environment variables that was taken when the target deployment was built. If you changed a secret after that deployment, for example a rotated database password, the rolled-back version will start with the old value. Check the variables before rolling back to an old deployment.
- **Database migrations.** Schema changes applied by the newer version stay in place. Write migrations that older code can tolerate, or prepare a down migration.
- **Webhooks and cron schedules** defined in `nimbus.toml` follow the target deployment's configuration.

After a rollback, automatic deploys from your Git branch are paused for that project, so the next push does not undo the rollback by accident. Resume them with `nimbus deploy --resume-auto` once the fix is merged. A canary that fails its health checks is rolled back automatically; this page covers manual rollbacks.
