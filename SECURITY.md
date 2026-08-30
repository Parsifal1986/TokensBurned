# Security and privacy boundary

Burn is designed so its product promise is also its architecture.

Burn may read:

- usage metadata delivered to an official lifecycle hook;
- known harness configuration fields needed for best-effort backend attribution;
- its own files under `~/.burn`.

Burn does not open transcript or rollout/session history, recursively scan the home directory, read prompt or response fields for attribution, inspect source repositories, read API keys, intercept traffic, install a proxy, or start a daemon.

The only network destination is GitHub, and only after profile sync is configured. Public output contains aggregate totals and, by default, harness/provider percentages. It never contains endpoints, raw events, timestamps, repository names, machine information, or credentials. Provider publication can be disabled with `burn privacy private`.

Please report security issues privately to the maintainers before opening a public issue.
