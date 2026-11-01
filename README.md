# AetherOS Webtop 1.0a (1.0 Alpha)

A multi-user Node.js/Express Webtop. The **server owns and operates the VFS**. The browser is an authenticated client and never receives a host filesystem path or direct filesystem handle.

## Requirements
- Node.js 20+
- npm

## First launch
1. Extract the archive and run `npm install`.
2. Set `AETHEROS_ADMIN_PASSWORD` to a strong password (minimum 14 characters).
3. Set `SESSION_SECRET` to at least 32 random characters.
4. Run `npm run server` or `npm start`.
5. Open `http://localhost:6969/` and sign in as `admin`.

PowerShell:
```powershell
$env:AETHEROS_ADMIN_PASSWORD = "use-a-unique-long-password-here"
$env:SESSION_SECRET = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
npm install
npm run server
```

## Architecture
- `server.js` is the authority for authentication, authorization, API requests and VFS operations.
- `lib/vfs.js` performs path validation and disk I/O under `data/homes/<username>/`.
- The browser only calls authenticated API endpoints. It cannot access the host filesystem directly.
- Every VFS route derives the username from the server-side authenticated session, never from a client-supplied username.

## Included client applications
- **File Manager:** browse, create folders, upload (20 MiB per file), download, rename, delete and edit small text files (2 MiB maximum).
- **PDF viewing:** opens a PDF through an authenticated, private server response using the browser's built-in PDF viewer.
- **HTML Application Runtime:** launches HTML files in an iframe with `sandbox="allow-scripts"` and a restrictive CSP. No same-origin permission, network requests, forms, popups, downloads, workers, storage, embedded frames or host filesystem access are granted. Relative app assets are fetched by the trusted parent client from the same app directory and converted to blob URLs. External assets are blocked and trigger termination.
- **App bridge:** applications have no capabilities by default. At launch, the user may grant read access and optionally write access. Requests go through the parent client and then the authenticated server API; the server still enforces the user's VFS boundary. An ungranted or unknown bridge capability terminates the app.
- **Violation supervision:** CSP violations, attempted form submissions, link navigation, app-asset directory escape and unauthorized bridge requests terminate the iframe.

The sample `examples/hello.html` demonstrates the controlled `aetheros.request('files.read', {path})` bridge. Upload it from the extracted project folder into a user's VFS (for example, `Apps/hello.html`) to launch it from the Applications view.

## Authentication and account management
- Individual accounts with salted scrypt password hashes.
- Session regeneration at login and file-backed server-side sessions.
- Login throttling (8 failures per IP per 15 minutes).
- Administrator account creation, role changes and deletion.
- Last-administrator protections.
- Password changes invalidate the current session.

## Security boundaries and limitations
- The server is the VFS authority, but this is still an application-level filesystem sandbox, not a kernel-enforced boundary. Run under a dedicated unprivileged OS account and protect `data/` and `sessions/` with OS permissions.
- The HTML runtime uses browser sandboxing and CSP as defense in depth. It is not a guarantee against browser vulnerabilities or resource-exhaustion attacks. A tight infinite loop can still consume renderer CPU; terminating the iframe cannot guarantee immediate preemption if the renderer is blocked. For hostile third-party apps, use a separate OS process/container with resource limits and a brokered IPC protocol.
- The app bridge currently exposes only explicit `files.read` and `files.write` capabilities. Apps cannot call arbitrary server endpoints through the bridge.
- PDF display uses the user's browser PDF implementation. No PDF JavaScript is intentionally enabled by AetherOS, but browser PDF engines remain part of the trusted computing base.
- The file-backed session store is for a single server instance. Use a shared production session store for clustered deployment.
- Set `COOKIE_SECURE=true` behind correctly configured HTTPS. Do not expose this service publicly without TLS, firewalling, backups and a security review.
- No arbitrary host command execution or remote OS shutdown is provided.

## Data layout
- `data/users.json` — account metadata and password hashes
- `data/homes/<username>/` — private user files
- `sessions/` — server-side sessions
- `config.json` — validated runtime configuration

## AetherOS IDE, packages and installers (1.0a)
The built-in IDE is available from the desktop navigation. It creates projects in the signed-in user's server-side `Projects/` directory, edits source files through authenticated VFS APIs, and invokes the server-side compiler. Standard apps, daemons and Layer 1 projects compile to `.aoapp`; Installer Projects compile to `.aoi`.

### Project types
- **Standard App Project (`standard-app`)** — HTML/CSS/JavaScript UI app. Its HTML entrypoint runs in the existing opaque-origin iframe runtime. Packaged assets are loaded from the bundle as blob URLs. Capabilities are declared in `aetheros.project.json` and must also be approved by the user at launch.
- **Daemon Project (`daemon`)** — server-side background-service source with `start(context)` / `stop(context)` lifecycle contract. Administrators can compile and install it. The Daemon Supervisor runs it as a separate Node.js child process and provides start/stop plus persistent enable/disable state. Daemons run with the same OS account privileges as the Webtop server; this is process separation, not a security sandbox. Run AetherOS under a dedicated unprivileged OS account and only install trusted daemon packages.
- **Layer 1 Application Project (`layer1`)** — the Layer 1 daemon / privileged server-extension plane, closer to AetherOS server software than an ordinary daemon. It can provide system-wide facilities such as protocol registration. It must set `executionModel: "privileged-server-extension"` and `approvalRequired: true`; compilation and installation are administrator-only. Installation stages the package in `Layer1/PendingApproval`; it is not executed. A dedicated signed, reviewed Layer 1 host and capability broker are still required for activation. Layer 1 source is never loaded into the Express process.

- **Installer Project (`installer`)** — references an existing `.aoapp` in the user VFS through `installer.json` (`packagePath`) and builds a single `.aoi` installer. Installers can be compiled by users; installation authorization is enforced against the embedded target type. They validate the embedded AOAPP hash and manifest before installation. Standard apps install into the user's `Applications/`; daemon packages are registered with the system Daemon Supervisor; Layer 1 packages are staged for privileged review. Nested installers are rejected.

### Daemon lifecycle and `aetherctl`
Daemons are system-installed and administrator-managed. Commands: `node bin/aetherctl.js start <id>`, `node bin/aetherctl.js stop <id>`, `node bin/aetherctl.js enable <id>`, `node bin/aetherctl.js disable <id>`, `node bin/aetherctl.js status <id>`, and `node bin/aetherctl.js list`. After `npm link`, the shorter `aetherctl` command is available. `start`/`stop` affect the current process; `enable`/`disable` persist boot-autostart configuration and do not implicitly start/stop the service. The CLI uses a random local control token in `data/control.token` and only contacts the loopback control endpoint. Enabled daemons are started when the Webtop server starts.

### Building and installing an artifact
1. Create and compile a Standard App, Daemon or Layer 1 project to produce an `.aoapp`.
2. Create an Installer Project and load it in the IDE.
3. Drag the `.aoapp` onto the Installer input area (or choose it with the file picker). The IDE uploads it to the server-owned VFS and writes its path into `installer.json`.
4. Build the Installer Project to produce an `.aoi`.
5. In File Manager, choose **Install** on the `.aoi` file. The server validates the package and installs according to its embedded artifact type.

### IDE examples
- **Hello World App** — basic UI, stylesheet and script.
- **Quick Notes App** — demonstrates explicit `files.read` / `files.write` bridge capabilities.
- **Heartbeat Daemon** — demonstrates the daemon lifecycle contract.
- **Layer 1 Protocol Provider** — demonstrates a system-wide protocol provider contract and its privileged approval boundary.
- **Basic Installer** — demonstrates an installer manifest that embeds an existing `.aoapp` package.

### AOAPP container format
`.aoapp` is a single UTF-8 JSON container with `format: AETHEROS_AOAPP`, a versioned manifest, and a file map. Each file is Base64 encoded and carries a SHA-256 digest and byte length. This makes the artifact portable as one file without running an external packager. The server validates paths, entrypoint, project type and package size before writing it to the user's `Applications/` directory. Limits: 200 files, 2 MiB per file, 10 MiB uncompressed project data and 20 MiB final package.

**Execution boundary:** only `standard-app` packages launch in the browser runtime. Daemon packages execute in supervised child processes after administrator installation; they are not sandboxed from the host OS and must be trusted. Layer 1 packages are installable only into a pending-approval staging area and cannot execute in this alpha. Installer packages do not execute embedded code; the server validates and installs the contained artifact according to its type. Never `require()` Layer 1 code inside the Express process.

## Version 1.0a scope
This is an alpha release. The project format, API surface and CLI may change. Layer 1 activation is intentionally not implemented; its package build, integrity validation, install staging and approval boundary are implemented. Daemon child processes are supervised but not OS-sandboxed.

## Web Browser (1.0a)

The Webtop includes a multi-tab browser workspace with tab groups. Tab metadata (URLs, titles, group membership and active tab) is stored in `Browser/browser-state.json` inside the authenticated user's VFS home. The browser state API derives the account from the server session; clients cannot select another user's home. Tabs and groups are capped at 50 and 20 respectively.

External pages are loaded in a credentialless, sandboxed iframe with scripts and forms enabled, no same-origin privilege, no popups, no downloads, and no referrer. This is intentionally a privacy-first, ephemeral browsing mode: website cookies, sign-in sessions and persistent website storage are not available. The client fails closed on browsers without credentialless iframe support. Some websites refuse to be embedded (for example via frame-ancestors / X-Frame-Options); those sites cannot be displayed in this embedded browser. Cross-origin back/forward history and browser extensions are not provided in this alpha. The browser does not proxy arbitrary URLs through the AetherOS server.

Tab groups organize a user's tabs only; they do not share data with other accounts. Browser workspace state is private per user. Website state is intentionally ephemeral and credentialless, so a user cannot inherit another AetherOS user's website cookies through this embedded browser.

## Application runtime, memory policy and AetherKit (1.0a update)

### Webtop-owned GUI app runtime
Standard GUI apps run in a dedicated opaque-origin iframe controlled by the Webtop. The frame has no same-origin access, no direct host filesystem access, no arbitrary network access, no workers, no persistent browser storage, no process APIs and no host command execution. The parent Webtop mediates the small app bridge and the server derives the account identity from the authenticated session for every operation. The current bridge includes explicitly granted `files.read` / `files.write`, plus an app-private cooperative swap slot (`runtime.swap` / `runtime.restore`). Unknown or ungranted capabilities terminate the app.

This is browser sandboxing and API mediation, not a kernel security boundary. A browser or renderer vulnerability remains in the trusted computing base. Do not run hostile code on a privileged workstation and do not treat an iframe as a replacement for OS process isolation.

### Per-user app memory allocation
Each account has a persisted application-runtime allocation under `Runtime/policy.json`:
- Default: 2 GiB per user.
- Upgrade: 4 GiB per user only when the Webtop host reports strictly more than 8 GiB of physical RAM.
- Exactly 8 GiB is not eligible.
- The user can select 2 or 4 GiB in Control Center; the server validates eligibility and persists the allocation in that user's VFS home.

**Important implementation boundary:** browser JavaScript does not expose a reliable hard per-iframe memory limit or isolated per-origin heap measurement. Chromium's optional `performance.memory` is approximate and may include shared renderer memory. AetherOS reports that estimate and terminates the app if the reported heap exceeds the assigned budget, but this is not a hard OS-enforced cap. True hard per-user memory enforcement requires running each app in a separately constrained OS process/container (for example, cgroups v2 on Linux or a platform-specific job/resource-control facility). The policy endpoint explicitly reports `hardPerIframeLimit: false` rather than pretending otherwise.

### Background suspension and keep-alive policy
When the Applications view is no longer visible, a GUI app receives a 30-second grace period. If it has not reported qualifying activity, the runtime asks it to suspend. The runtime pauses its managed timers and animation-frame callbacks and suspends Web Audio contexts; on returning to the app, it resumes them. Ongoing media playback / Web Audio activity and actual canvas/WebGL drawing or active CSS animations refresh the keep-alive window. An app can implement `aetheros.lifecycle.onSuspend(callback)` and listen for `aetheros:resume` to checkpoint and restore its own state.

The activity checks are cooperative browser-runtime signals, not a security boundary: an app can intentionally keep itself active. Browsers also retain control over actual renderer scheduling and memory reclamation.

### Cooperative memory swapping
A browser cannot transparently serialize and restore an arbitrary JavaScript heap. AetherOS therefore provides an explicit checkpoint API for app-owned state:

```js
// Register a callback that runs before the runtime pauses the app.
aetheros.lifecycle.onSuspend(async () => {
  await aetheros.memory.swap({
    draft: document.querySelector('#draft').value,
    selectedTab: 2
  });
});

// Restore the app's last checkpoint when it becomes active again.
window.addEventListener('aetheros:resume', async () => {
  const checkpoint = await aetheros.memory.restore();
  if (checkpoint.found) {
    document.querySelector('#draft').value = checkpoint.data.draft || '';
  }
});
```

Swap checkpoints are stored server-side in `Runtime/Swap/` inside the authenticated user's private VFS home. The app cannot choose a host path or access another user's swap data. Each checkpoint is limited to 1 MiB per app. This is cooperative state swapping, not transparent process-memory paging; apps must decide which state is serializable.

### AetherKit design language
AetherKit is injected into every Standard App runtime. It provides AetherOS-aligned design tokens and reusable CSS classes without requiring the app to access host stylesheets or the network. Available classes include `.ak-card`, `.ak-row`, `.ak-stack`, `.ak-muted`, `.ak-badge`, `.ak-divider`, `.ak-input`, `.ak-button-secondary`, `.ak-button-danger` and `.ak-button-quiet`. Tokens use the `--ak-*` namespace. Apps can inspect `aetheros.ui.version`, `aetheros.ui.designLanguage` and `aetheros.ui.classes`.

AetherKit is intentionally a CSS design system in this alpha, not a privileged native widget toolkit. App markup and styles remain confined to the app's own frame.


## Concurrent users and browser clients (1.0a)

The HTTP server binds to `0.0.0.0`, so multiple independent clients can connect concurrently over the configured network interface. Each client has its own signed session cookie. User identity is taken from that server-side session, never from a client-supplied username. Browser tab state, files, swap checkpoints, runtime policy and Resist Logging Off preferences live in that user's private VFS home. This supports multiple simultaneous accounts and multiple devices per account on one Webtop server. The included file-backed session store is intended for one server instance; clustered or horizontally scaled deployments require a shared production session store and shared VFS.

The Webtop client is standards-based HTML, CSS and JavaScript and does not require Electron. It can be opened directly from Safari, Chrome, Firefox, Pale Moon and other browsers that support the application's JavaScript baseline, cookies and iframe sandboxing. No browser vendor or user-agent check is used. The embedded external-site browser has a stricter requirement: credentialless iframe support is required for its privacy model, so it remains disabled in browsers without that feature rather than silently weakening cross-account website-session isolation. This does not prevent using the Webtop desktop, file manager, IDE or other applications from those browsers. Browser-specific compatibility still needs validation against each exact browser release.

## Host memory pressure and Resist Logging Off

The server samples host physical-memory availability every five seconds. Critical pressure is declared after two consecutive samples with free memory at or below `max(512 MiB, 5% of physical RAM)`. Recovery is considered complete only after free memory reaches `max(1 GiB, 10% of physical RAM)`.

When critical pressure is detected, the server distinguishes capped accounts from accounts with **Remove RAM Cap**. If any active, non-resistant account has Remove RAM Cap enabled, the session handler invalidates every non-resistant active session. If all active accounts remain capped, the server first revokes the highest-reported account; if usage cannot be attributed, it fails safe by invalidating all non-resistant sessions. A per-account pending notice is shown once on the next successful login with the exact text: “Your computer was forcibly logged out because of a problem.” Accounts that enabled **Resist Logging Off** keep their sessions. The preference is stored per user at `Runtime/resist-logging-off.json`.

The server then attempts to recover host memory by stopping AetherOS-managed daemon processes and sending a cooperative throttle signal to remaining daemons. The included daemon SDK's scheduled callbacks run at four-times their normal interval while throttled and return to normal after the host crosses the recovery threshold. This never targets unrelated host operating-system processes. The host monitor measures the Webtop server machine only.

The memory monitor is a safety response, not a substitute for host swap or OS-level memory control. Configure operating-system swap/pagefile independently. A Webtop server under severe pressure may not have enough resources to complete graceful shutdowns or persist every in-flight operation.


## Root account: Remove RAM Cap and login admission (alpha.4)

An administrator/root account can set the user-wide **Remove RAM Cap** flag for any account through Control Center or `PATCH /api/users/:username/memory-cap`. The flag is stored in the server-owned user database, not the user's VFS, and applies across all concurrent sessions and clients for that account. When enabled, the account's 2/4 GiB quota reservation and reported runtime cap are bypassed. This is intentionally powerful: if an uncapped account is active when the host reaches critical memory pressure, the session handler invalidates all non-resistant sessions. **Resist Logging Off** remains an explicit per-user exception.

Before creating a new authenticated session, AetherOS checks actual host free memory and reserves each already-active capped account's configured 2/4 GiB budget once, regardless of how many browser clients that account has. A new capped account reserves its own budget. The host keeps a reserve of at least 1.5 GiB or 20% of physical RAM, whichever is larger, plus 256 MiB login headroom. If free memory or projected quota capacity is insufficient, login is rejected with HTTP 503 and the exact toast text **`Resource temporarily unavailable`**. The same public error string is returned for Node `ENOMEM` and `EAGAIN` resource failures, matching the requested `bcsh` resource-exhaustion wording.

The user-wide flag is only writable through the administrator-protected route. The `admin` role is the root-equivalent privilege in this alpha. Multiple clients using the same account share one quota reservation; they do not each receive a fresh 2/4 GiB allocation.

**Important boundary:** this alpha still runs the Standard App HTML/JavaScript document in a sandboxed iframe on the connecting browser. Its VFS, packages, API broker, sessions and quota admission are server-owned, but that is not the same as executing the entire GUI application process on the server. Hard server-side per-user RAM enforcement and server-rendered/streamed GUI execution require a dedicated app-process host with OS resource controls and a remote-display transport; this build does not claim those pieces are complete. The telemetry-based cap signal is cooperative/approximate until that host exists.

### Contributions

This section includes how you contribute to AetherOS.

## Pull Requests

Fork the repository, do your changes, double-check them, and make a Pull Request, We will check it, And if it passes the tests, It will be merged.

## Usage of AI

AI is a helpful tool that I used to write this, But make sure you don't fully depend on it.
Read the code to make sure it works without introducing frequent bugs.
Optionally, **Don't be a meat proxy**. While this is optional, It's recommended, make sure to scan the code and make your own changes to it before making a pull request.
