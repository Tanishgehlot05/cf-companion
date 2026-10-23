# Development

CF Companion targets GNOME Shell 46 and uses the GNOME-provided GJS, GLib, Soup, GTK, and libadwaita APIs. No separate runtime package manager is used for the extension.

## Local setup

Clone the repository and work from its root. The extension source and metadata are in `extension/`; GNOME Shell installs a packaged extension under the directory named by its UUID, `cf-companion@Tanishgehlot05.github.io`.

For a local source install, copy the contents of `extension/` into:

```text
~/.local/share/gnome-shell/extensions/cf-companion@Tanishgehlot05.github.io/
```

Then disable and enable the extension with GNOME Extensions or the `gnome-extensions` command. On Wayland, signing out and back in reloads GNOME Shell if a code change is not picked up by toggling the extension.

## Checks

Run the existing tests and static checks from the repository root:

```sh
for test in tests/*.test.mjs; do node --experimental-default-type=module "$test"; done
for test in tests/*.test.js; do gjs --module "$test"; done
find extension scripts tests -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
  | xargs -0 -n1 node --experimental-default-type=module --check
glib-compile-schemas --strict --dry-run extension/schemas
node --experimental-default-type=module scripts/generate-theme-stylesheet.mjs --check
git diff --check
```

Regenerate the generated theme stylesheet after changing a palette:

```sh
node scripts/generate-theme-stylesheet.mjs
```

## Build a production bundle

```sh
node --experimental-default-type=module scripts/package-extension.mjs --out-dir=/tmp
```

The bundle is named using the production UUID in `extension/metadata.json`. Validate a bundle with:

```sh
node --experimental-default-type=module scripts/check-release.mjs \
  --archive /tmp/cf-companion@Tanishgehlot05.github.io.shell-extension.zip
unzip -t /tmp/cf-companion@Tanishgehlot05.github.io.shell-extension.zip
```

The package helper stages the required runtime files and excludes tests, documentation, Git data, and backend files. For metadata, release tagging, and GitHub Actions, see the [release guide](RELEASING.md).

## Troubleshooting

- Check extension state with `gnome-extensions info cf-companion@Tanishgehlot05.github.io`.
- Inspect recent Shell messages with `journalctl -f -o cat /usr/bin/gnome-shell`.
- Confirm the settings schema compiled and is available to the installed extension if preferences fail to open.
- A successful static test or enabled state does not replace visual testing in a GNOME Shell 46 session.
