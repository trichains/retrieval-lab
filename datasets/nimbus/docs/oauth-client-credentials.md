---
id: oauth-client-credentials
title: OAuth client credentials
lang: en
tags: [auth, oauth]
---

For server-to-server integrations that should not depend on a person's account, use an OAuth client instead of a personal API key. Nimbus supports the OAuth 2.0 client credentials grant. An Owner or Admin creates the client in Console > Settings > OAuth clients and chooses which scopes it may request. The client secret is shown once, at creation time.

Exchange the client ID and secret for an access token:

```
curl -X POST https://auth.nimbus.dev/oauth/token \
  -u "$NIMBUS_CLIENT_ID:$NIMBUS_CLIENT_SECRET" \
  -d grant_type=client_credentials \
  -d scope="projects:read deploy:write"
```

The response looks like this:

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "projects:read deploy:write"
}
```

Send the token in the `Authorization: Bearer` header, exactly like an API key. Tokens are valid for one hour and there is no refresh token in this flow: when a token is about to expire, request a new one with the same credentials. A good practice is to cache the token and renew it about five minutes before `expires_in` runs out, instead of asking for a new token on every call. The token endpoint is limited to 20 requests per minute per client, so fetching a token per request will eventually return 429.

The requested scopes must be a subset of the scopes allowed for the client; asking for anything else returns `400 invalid_scope`. A wrong client ID or secret returns `401 invalid_client`, and calling the API with an expired token returns `401 token_expired`.

Each organization can have up to 20 OAuth clients. To change a client's secret without downtime, generate a second secret in the console: a client can hold two active secrets at once. Move your services to the new secret and then delete the old one.
