# nangoctl

CLI to install and run **[Nango](https://www.nango.dev)** locally on **Kubernetes** using the official Helm chart, a **kind** cluster, and generated ConfigMaps/secrets tuned for development.

## Quick start

```bash
git clone <repo-url>
cd nangoctl
npm install
npm install -g .
nangoctl --help
```

## Prerequisites

- **Node.js** 20+
- **kubectl** and **Helm 3**
- **kind** (a local cluster is created by default on first install)
- **Docker** (for creating and using the kind cluster)
- Access to pull **`nangohq/nango`** (and Bitnami dependency images used by the chart)

If something is missing, install tools manually or use **`nangoctl local bootstrap`** (see [Bootstrap prerequisites](#bootstrap-prerequisites) below). Preflight errors from `local install` also suggest this command.

## Bootstrap prerequisites

`nangoctl local bootstrap` installs **Docker**, **kubectl**, **Helm**, and **kind** when they are not already on your `PATH`. Behavior depends on your OS:

| Platform | What runs |
|----------|-----------|
| **macOS** | [Homebrew](https://brew.sh): `brew install` for `kubernetes-cli`, `kind`, `helm`; optional `brew install --cask docker` for Docker Desktop |
| **Linux** | [snap](https://snapcraft.io/) (requires `sudo`): `kubectl`, `helm`, `kind`, `docker` as available in the store |
| **Windows** | [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) for `kubectl` and Helm when present; **kind** and **Docker Desktop** may need a manual install (the command prints links) |
| **Other** | Not automated; the command exits with links to official install docs |

Useful flags:

- **`--dry-run`** — Print the install commands without running them.
- **`--no-docker`** — Only install CLI tools (`kubectl`, Helm, `kind`), skip Docker.
- **`--json`** — Machine-readable report (`before` / `after` presence, planned commands, notes).

Run **`nangoctl local bootstrap --help`** for the full flag list.

## Getting started

From the repo:

```bash
npm install
npm run build          # or: npm run dev -- <args> for development without a prior build
```

### 1. Install Nango in the cluster

```bash
nangoctl local install
```

This will, by default:

- Ensure a **kind** cluster exists (default name: `nango-local`)
- Apply generated **ConfigMap** / **Secret** (including `FLAG_SERVE_CONNECT_UI=true` and public URLs)
- Run **Helm** to install the **nango** chart with values that:
  - Start the **server** via **`packages/server/entrypoint.sh`** (API + Connect UI), not only `node …/server.js`
  - Expose **Connect UI** on the server Service (port **3009** in the pod, alongside HTTP on **80** → **8080** in the container)
  - Enable **persistent volumes** for **server** and **jobs**: the server chart creates a PVC; **jobs** reuses that PVC so both pods see the same files under **`/nango/data`**
  - Set **`NANGO_INTEGRATIONS_FULL_PATH`** to **`/nango/data/integrations`** (place `providers.yaml` and related assets here)

Install prints **kubectl port-forward** hints for:

| What            | Default localhost port | Remote (Service) |
|-----------------|-------------------------|------------------|
| Server / dashboard / API | **4280** | **80** |
| Connect UI      | **4281** | **3009** |

Override with:

```bash
nangoctl local install --server-port 4280 --connect-ui-port 4281
nangoctl local install --with-image-tag 1.2.3   # sets Helm global.image.tag (all Nango images)
```

State (cluster name, namespace, ports, etc.) is stored under your user config directory (on macOS: `~/Library/Application Support/nangoctl/local`).

### 2. Open the UIs from your machine

```bash
nangoctl local open
```

By default this runs **one** `kubectl port-forward` with **both** ports (server **80** and Connect UI **3009** mapped to localhost **4280** and **4281**), **blocks** in the terminal, and opens the **dashboard** in your browser. **Press Ctrl+C** to stop forwarding and return to the shell.

- **`--detach`** — run port-forward in the **background** and exit. The kubectl PID is stored in `port-forward.pid` under your state directory so you can stop it later with **`nangoctl local close`**.
- **`--json`** — prints machine-readable output and also runs in the background (same idea as `--detach`).
- **`--open-connect`** — also open the Connect UI in the browser.
- **`--no-browser`** — only start port-forwarding.

Then:

- **Dashboard / API:** `http://127.0.0.1:4280` (or the `--server-port` you chose)
- **Connect UI:** `http://127.0.0.1:4281` (or your `--connect-ui-port`)

Stop a background session:

```bash
nangoctl local close
```

### 3. Day-to-day commands

```bash
nangoctl local bootstrap              # see [Bootstrap prerequisites](#bootstrap-prerequisites)
nangoctl local status
nangoctl local logs --service server
nangoctl local credentials          # dashboard basic-auth (from local configmap.yaml)
nangoctl local config
nangoctl local close
nangoctl local uninstall
```

Global flags: **`--json`**, **`--verbose`**, **`--context`** (when kube context is not in saved state).

## Development

```bash
npm run dev -- local install
npm run dev -- local open
npm run lint
npm test
```

## License

Apache-2.0
