# Running ProjectHub on Kubernetes

For organisations that already run a cluster. Do README Steps 1–6 first (Supabase and the database).

**You need:** a cluster and `kubectl`; the [ingress-nginx](https://kubernetes.github.io/ingress-nginx/)
controller and [cert-manager](https://cert-manager.io) (for HTTPS) installed; a container registry
you can push to (e.g. GitHub Container Registry); Docker to build the image.

The files are in `deploy/kubernetes/`: a namespace with the *restricted* pod security level, a
ConfigMap, a Secret made from `secret.env`, a Deployment (2 copies, health probes, read-only file
system, non-root), a Service, an Ingress with HTTPS, and a PodDisruptionBudget.

## 1. Build and push the image

The two public Supabase values are built into the image:

```bash
docker build -t ghcr.io/YOUR-NAME/projecthub:1.0.0 \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://YOUR_REF.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... .
docker push ghcr.io/YOUR-NAME/projecthub:1.0.0
```

## 2. Edit the four marked places

| File | Change |
|---|---|
| `kustomization.yaml` | `newName` / `newTag`: the image you pushed |
| `configmap.yaml` | `SITE_URL`: your address (`https://…`, no slash at the end). If you use the meeting recorder, `RECALL_REGION` |
| `ingress.yaml` | Your host name (twice) and your cert-manager issuer |
| `secret.env` | Created in the next step |

## 3. Create the secrets file

```bash
npm run setup -- --for kubernetes
```

It writes `deploy/kubernetes/secret.env` (Git ignores it) and prints the values for
`configmap.yaml`. Or copy `secret.env.example` to `secret.env` and fill it in.

## 4. Apply

```bash
kubectl apply -k deploy/kubernetes
kubectl -n projecthub get pods
```

✔ Two pods become `Running` and `READY 1/1` within a minute. Open your address.

Then in Supabase → **Authentication → URL Configuration**: **Site URL** = your address, and add
`https://your-host/**` to **Redirect URLs**.

## 5. First admin and tidying up

If this Supabase project has no admin yet, open `https://your-host/setup` with the `SETUP_TOKEN` from
`secret.env`. Afterwards remove `SETUP_TOKEN` from `secret.env` and run `kubectl apply -k deploy/kubernetes`
again (the Secret gets a new name, so the pods restart with it).

## Updating

Build and push a new tag, change `newTag` in `kustomization.yaml`, and `kubectl apply -k deploy/kubernetes`.
Pods are replaced one at a time with no downtime.

## Notes

- Any number of copies can run: logins, rate limits, notes and files all live in Supabase.
- If the cluster restricts outgoing traffic (NetworkPolicies), allow HTTPS (443) to Supabase, the
  mail server (465 for Gmail), and Recall.ai / api.anthropic.com for the meeting recorder.
- The meeting recorder's webhook (`/api/recall/webhook`) must be reachable from the internet over HTTPS.
- Pods get 2 minutes to shut down (`terminationGracePeriodSeconds: 120`) so a meeting summary that's
  being written can finish.
