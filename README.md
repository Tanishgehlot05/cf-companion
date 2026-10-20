# CF Companion

CF Companion is a GNOME Shell extension that shows upcoming Codeforces contests in the top panel. It provides contest countdowns, urgency colors, and desktop reminders.

This standalone project contains only the GNOME Shell extension. It targets **GNOME Shell 46** and retains the existing UUID `cf-companion@Tanishgehlot05.github.io`.

## Baseline

The extension source is copied from the submitted V1 review-fixes baseline, commit [`8b616e2`](https://github.com/Tanishgehlot05/cf-companion/commit/8b616e29b9276189fa37f92b653163fba9fbc50f). The current V1 behavior and metadata are preserved. No V2 functionality has been implemented yet.

## Package

From this project directory, run:

```sh
gnome-extensions pack extension --force --extra-source=utils --out-dir=/tmp
```

The package is written to `/tmp` using the UUID from `extension/metadata.json`. The `utils` directory is included as extra source, matching the V1 packaging workflow.

For local development, copy the contents of `extension/` into:

```text
~/.local/share/gnome-shell/extensions/cf-companion@Tanishgehlot05.github.io/
```

Then disable and re-enable the extension using GNOME Extensions or `gnome-extensions`. Shell/session behavior should be tested on GNOME Shell 46.

## Project contents

- `extension/extension.js` — extension entry point
- `extension/metadata.json` — GNOME extension metadata
- `extension/stylesheet.css` — panel and menu styling
- `extension/utils/` — countdown, urgency, and notification helpers
- `LICENSE` — MIT License

The Telegram backend, credentials, generated packages, and V1 Git history are not part of this repository.
