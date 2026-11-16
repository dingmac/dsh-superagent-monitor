# dsh-superagent-monitor

A DSH bundle that adds a **Superagent Monitor** page and a **Superagent** conversation tab to the DeepSeek Harness Web GUI.

It is the dashboard/control surface for a standalone `dsh-superagent` instance: service status, launchd job, management API, logs, start/stop/restart, dashboard-plugin sync, and the desktop entry that relays conversation to the Superagent desktop source.

## Features

- **Service overview** — reads the launchd job, management API (`/orchestrator/api/*`), and the tail of the process logs.
- **Explicit controls** — start, stop, and restart through the repository's own `scripts/dsh-superagent` control script; it never signals a PID directly.
- **Plugin sync** — lists plugins installed in the current DSH profile and copies selected ones into the superagent profile with `dsh plugin add`.
- **Sync state** — shows dependency, bundle, installed contents, and whether the running superagent picked the plugin up.
- **Auto sync** — optionally copies newly installed dashboard plugins to superagent on the next poll.
- **Superagent tab** — desktop conversation entry that relays to the superagent desktop source and aggregates Feishu/GitHub feedback.
- **Loopback-only API** — non-loopback management URLs are refused rather than contacted.

## Requirements

- DeepSeek Harness (DSH) Web GUI with plugin-bundle support.
- macOS with `launchd` for service supervision.
- A standalone `dsh-superagent` checkout (default `~/src/dsh-superagent`) with its `scripts/dsh-superagent` control script.
- Node.js available to DSH.

## Install from GitHub

```bash
dsh plugin --profile desktop add github:dingmac/dsh-superagent-monitor
```

Restart DSH (or reload plugins) after installation. The bundle patch adds the `superagent-monitor` row to the profile.

## Install from a local checkout

```bash
git clone https://github.com/dingmac/dsh-superagent-monitor.git
dsh plugin --profile desktop add /absolute/path/to/dsh-superagent-monitor
```

Restart DSH after installation.

## Configuration

Defaults are resolved in `normalizeConfig` / `cordis.patch.yml`:

| Field | Default | Purpose |
|---|---|---|
| `root` | `~/src/dsh-superagent` | standalone superagent checkout |
| `profile` | `superagent` | DSH profile used by superagent |
| `url` | `http://127.0.0.1:3082` | local superagent management API (loopback only) |
| `stateDir` | `~/.dsh-superagent` | superagent state directory |
| `launchAgentsDir` | `~/Library/LaunchAgents` | launchd job discovery |
| `stateFile` | `~/.dsh/state/superagent-monitor/state.json` | dashboard state |

Override these in the bundle row configuration when your paths or port differ.

## Usage

1. Open the DSH Web GUI.
2. Open **Superagent Monitor** from the sidebar.
3. Review the service, launchd job, API, and log sections.
4. Use **Start**, **Stop**, or **Restart** only after confirming the target service and checkout.
5. Use the plugin-sync section to copy selected dashboard plugins into the superagent profile.
6. Open the **Superagent** tab for the desktop conversation entry.

## Security notes

- Management API access is restricted to loopback addresses.
- Service mutations require explicit same-origin POST requests.
- The plugin reads local service state and logs; it does not upload them anywhere.
- `dsh plugin add` runs against the superagent profile only when initiated by the user (or by the configured auto-sync switch).

## Version

Current bundle version: **1.4.0**.

## License

MIT. See [LICENSE](./LICENSE).
