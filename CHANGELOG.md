# Changelog

## 1.0a · alpha.4

- Added administrator/root-only, user-wide `Remove RAM Cap` control.
- Persisted the override in the server-owned user database so it applies across every client session for the account.
- Added login admission control based on current host free memory, active per-user quota reservations, host reserve and login headroom.
- Rejected unavailable logins with HTTP 503 and the exact `Resource temporarily unavailable` toast.
- Added same-message mapping for Node `ENOMEM` and `EAGAIN` request failures.
- Added per-account session invalidation when reported runtime allocation is exceeded.
- Changed critical-pressure behavior: active uncapped accounts trigger session-handler logout for all non-resistant accounts; capped accounts are targeted by reported usage, with fail-safe global invalidation when usage cannot be attributed.
- Kept `Resist Logging Off` as a per-user exception and preserved multi-client quota reservation semantics.
