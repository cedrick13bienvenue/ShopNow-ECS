# Kubernetes RBAC Lab — Phase 1 (Kind)

Hands-on walkthrough of Kubernetes RBAC fundamentals on a local Kind cluster,
before the same concepts get applied to EKS (Phase 2) and to a Gateway API
migration (Phase 3). Everything here uses the core Kubernetes
`CertificateSigningRequest` API rather than cluster-specific tooling, so the
whole flow is portable to any conformant cluster, including EKS.

## Prerequisites

- Docker (daemon running)
- [`kind`](https://kind.sigs.k8s.io/) — installed via direct binary download
  (no Homebrew): see https://kind.sigs.k8s.io/docs/user/quick-start/#installation
- `kubectl`
- `openssl`

## Cluster

```bash
kind create cluster --config kind-config.yaml
```

[`kind-config.yaml`](kind-config.yaml) names the cluster `rbac-lab`, giving it
the kubeconfig context `kind-rbac-lab`, with a single control-plane node
(no workers needed for RBAC work).

## Core concept: AuthN vs AuthZ

Every request to the API server goes through two independent phases:

1. **Authentication (AuthN)** — *who are you?* Answered by a client
   certificate, a bearer token, etc. Kubernetes trusts whatever identity is
   embedded in valid, signed credentials — there is no central user database.
2. **Authorization (AuthZ)** — *what are you allowed to do?* Answered by
   RBAC: `Role`/`ClusterRole` (permissions) bound to identities via
   `RoleBinding`/`ClusterRoleBinding`.

A failed AuthN attempt returns `401 Unauthorized`. A failed AuthZ check
(valid identity, no matching permission) returns `403 Forbidden`. This
distinction is the throughline of the whole lab.

## Step 1 — Inspect the cluster-admin cert Kind already gave you

```bash
kubectl config view --raw -o jsonpath='{.users[?(@.name=="kind-rbac-lab")].user.client-certificate-data}' | base64 -d | openssl x509 -noout -subject -issuer
kubectl get clusterrolebinding cluster-admin -o yaml
```

Kind's default kubeconfig embeds a client cert with
`subject=O=system:masters, CN=kubernetes-admin`. Per the
[x509 client cert auth docs](https://kubernetes.io/docs/reference/access-authn-authz/authentication/#x509-client-certs):
the cert's `CN` becomes your **username**, and any `O` fields become **group
memberships**. `system:masters` isn't special-cased in code — it's just a
group that a built-in `ClusterRoleBinding` called `cluster-admin` happens to
bind to the all-powerful `cluster-admin` `ClusterRole`. No magic, just RBAC.

## Step 2 — Create an unprivileged user via the CSR API

```bash
openssl genrsa -out dev-alice.key 2048
openssl req -new -key dev-alice.key -out dev-alice.csr -subj "/CN=dev-alice"

cat <<EOF | kubectl apply -f -
apiVersion: certificates.k8s.io/v1
kind: CertificateSigningRequest
metadata:
  name: dev-alice
spec:
  request: $(cat dev-alice.csr | base64 | tr -d "\n")
  signerName: kubernetes.io/kube-apiserver-client
  expirationSeconds: 604800
  usages:
  - client auth
EOF
kubectl certificate approve dev-alice
kubectl get csr dev-alice -o jsonpath='{.status.certificate}' | base64 -d > dev-alice.crt

kubectl config set-credentials dev-alice --client-certificate=dev-alice.crt --client-key=dev-alice.key --embed-certs=true
kubectl config set-context dev-alice-ctx --cluster=kind-rbac-lab --user=dev-alice
```

`signerName: kubernetes.io/kube-apiserver-client` is a
[built-in Kubernetes signer](https://kubernetes.io/docs/reference/access-authn-authz/certificate-signing-requests/#kubernetes-signers)
— identical on Kind and EKS. This signer does not auto-approve; a human (or a
controller with explicit `approve` permission) must act, which is the natural
place to insert a review gate in a real org.

**Proof AuthN ≠ AuthZ:**

```bash
kubectl config use-context dev-alice-ctx
kubectl auth whoami        # confirms identity: Username dev-alice, Groups [system:authenticated]
kubectl get pods           # Forbidden — authenticated, but no permissions granted yet
```

## Step 3 — Grant scoped access: Role + RoleBinding

[`role-pod-reader.yaml`](role-pod-reader.yaml) + [`rolebinding-dev-alice.yaml`](rolebinding-dev-alice.yaml)

A `Role` is namespaced — its permissions only apply within the namespace it's
defined in (`default`, here). `dev-alice` gets `get/list/watch` on `pods` in
`default` only; `kubectl get pods -n kube-system` remains `Forbidden`.

## Step 4 — Cluster-wide access: ClusterRole + ClusterRoleBinding

[`clusterrole-pod-reader.yaml`](clusterrole-pod-reader.yaml) + [`clusterrolebinding-dev-alice.yaml`](clusterrolebinding-dev-alice.yaml)

Same `rules` shape as a `Role`, but a `ClusterRole` bound via a
`ClusterRoleBinding` applies everywhere, not just one namespace. Note: RBAC
is **purely additive** — there's no "deny" and no precedence between
bindings. The union of every applicable binding is what's allowed.

## Step 5 — Group-based binding (the pattern real orgs use)

A second user, `dev-bob`, generated the same way as `dev-alice` but with a
group in the cert:

```bash
openssl req -new -key dev-bob.key -out dev-bob.csr -subj "/CN=dev-bob/O=shopnow-viewers"
```

[`clusterrolebinding-shopnow-viewers.yaml`](clusterrolebinding-shopnow-viewers.yaml)
binds the `shopnow-viewers` **group** (not `dev-bob` by name) to the same
`pod-reader-cluster` ClusterRole. `dev-bob` inherits access purely through
group membership — no RBAC object anywhere mentions his name. This is how
onboarding/offboarding works in practice: issue a cert (or map an IAM role,
in EKS) with the right group, and RBAC never needs to change.

## Step 6 — RBAC for a workload, not a human: ServiceAccount

[`serviceaccount-pod-lister.yaml`](serviceaccount-pod-lister.yaml) +
[`rolebinding-pod-lister-sa.yaml`](rolebinding-pod-lister-sa.yaml) +
[`pod-lister-test.yaml`](pod-lister-test.yaml)

Unlike `User`/`Group`, a `ServiceAccount` is a real API object. Kubernetes
auto-mounts a signed token for it into any pod that references it
(`serviceAccountName:`), authenticating that pod as
`system:serviceaccount:<namespace>:<sa-name>`. Same RBAC authorizer,
different authenticator (token vs. cert) than the human-user flow above.

Note for Phase 2: this is distinct from EKS's `eks.amazonaws.com/role-arn`
IRSA annotation on a ServiceAccount, which grants **AWS IAM** permissions
(e.g. S3 access) — a completely separate axis from Kubernetes RBAC. A single
ServiceAccount can carry both.

## Step 7 — Impersonation, and a gotcha about groups

[`clusterrole-impersonate-shopnow-viewers.yaml`](clusterrole-impersonate-shopnow-viewers.yaml) +
[`clusterrolebinding-dev-alice-impersonate.yaml`](clusterrolebinding-dev-alice-impersonate.yaml)

```bash
kubectl auth can-i get pods --as dev-bob -n kube-system                              # no  — group not asserted
kubectl auth can-i get pods --as dev-bob --as-group=shopnow-viewers -n kube-system    # yes
```

Kubernetes has no identity store to look up "what groups does dev-bob
belong to" — impersonation (or any auth) only ever knows what's explicitly
asserted at request time. `--as` alone does not carry over group membership.

The `impersonate-shopnow-viewers` `ClusterRole` uses `resourceNames` to scope
`dev-alice`'s impersonation rights to *exactly* `dev-bob` (user) and
`shopnow-viewers` (group) — she cannot impersonate anything else:

```bash
kubectl auth can-i get pods --as system:admin
# Error: users "system:admin" is forbidden: User "dev-alice" cannot impersonate resource "users"
```

## File reference

| File | Purpose |
|---|---|
| `kind-config.yaml` | Kind cluster definition (Step 1) |
| `role-pod-reader.yaml` | Namespaced Role: read pods in `default` |
| `rolebinding-dev-alice.yaml` | Binds `dev-alice` (user) to `pod-reader` |
| `clusterrole-pod-reader.yaml` | Cluster-scoped read-pods permission |
| `clusterrolebinding-dev-alice.yaml` | Binds `dev-alice` (user) cluster-wide |
| `clusterrolebinding-shopnow-viewers.yaml` | Binds `shopnow-viewers` (group) cluster-wide |
| `serviceaccount-pod-lister.yaml` | ServiceAccount for a workload identity |
| `rolebinding-pod-lister-sa.yaml` | Binds the ServiceAccount to `pod-reader` |
| `pod-lister-test.yaml` | Pod that proves the ServiceAccount's own token is scoped |
| `clusterrole-impersonate-shopnow-viewers.yaml` | Narrow impersonation permission (resourceNames-scoped) |
| `clusterrolebinding-dev-alice-impersonate.yaml` | Binds `dev-alice` to that impersonation permission |

`dev-alice.key`/`.csr`/`.crt` and `dev-bob.key`/`.csr`/`.crt` are generated
locally by the commands above and are gitignored — regenerate them by
re-running Step 2's commands (with `dev-bob` substituted where noted).

## Key takeaways

- RBAC authorization is always downstream of a successful authentication —
  `Forbidden` means "I know who you are, but no."
- Usernames and groups are never stored by Kubernetes; they're asserted by
  whatever authenticator validated the request (cert `CN`/`O`, SA token
  claims, OIDC claims, etc.).
- `Role`/`RoleBinding` = namespace-scoped. `ClusterRole`/`ClusterRoleBinding`
  = cluster-scoped. A `ClusterRole`'s blast radius is decided by *how* it's
  bound, not by the object itself.
- Bind to groups, not individual users, whenever more than one person needs
  the same access — it's how you avoid touching RBAC on every hire/departure.
- RBAC has no deny rules and no binding precedence — permissions only ever
  accumulate.
- Impersonation requires explicit `impersonate` permission per resource type
  (`users`, `groups`, `serviceaccounts`), independently scopable with
  `resourceNames`.

## Next

- **Phase 2** — same concepts against the EKS cluster in [`../eks/`](../eks/):
  IAM Access Entries mapping IAM principals to Kubernetes groups, feeding
  into the same `Role`/`RoleBinding` layer built here.
- **Phase 3** — migrate [`../k8s/ingress.yaml`](../k8s/ingress.yaml) to the
  Gateway API (`GatewayClass`/`Gateway`/`HTTPRoute`).
