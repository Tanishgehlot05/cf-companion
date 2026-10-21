# Architecture

CF Companion is a GNOME Shell 46 extension written with GJS ES modules. `extension/extension.js` creates and connects the runtime services, UI, and preferences settings; disabling the extension tears down timers, signals, and notification state.

## Runtime components

- `services/contestService.js` requests the Codeforces contest list, validates responses, prevents overlapping requests, retries failures, and persists the last valid contest list in the user cache.
- `services/codeforcesUserService.js` retrieves and validates public Codeforces profile data for the configured handle.
- `services/friendsService.js` loads public friend profiles and provides their current rating and rank information to the menu.
- `ui/panel.js` creates the top bar indicator and dropdown. It renders contests, countdowns, profile and friend rows, starred state, live contest actions, and manual refresh controls.
- `utils/reminderService.js` delivers reminders and handles notification actions. `utils/snoozeTimerManager.js` tracks replaceable snoozes.
- `utils/timerManager.js` owns GLib timeout sources and clears outstanding sources on teardown.
- `utils/reminderPreferences.js`, `utils/contestFilters.js`, and `utils/generalPreferences.js` apply stored display and reminder preferences.
- `utils/themes.js` is the palette source for the five themes. `scripts/generate-theme-stylesheet.mjs` derives theme CSS from those values.
- `prefs.js` provides the GNOME preferences pages. `schemas/org.gnome.shell.extensions.cf-companion.gschema.xml` defines the persistent settings.

## Data flow and persistence

Contest data comes from Codeforces. A successful response is validated before it is displayed and written to `${XDG_CACHE_HOME:-~/.cache}/cf-companion/contests.json`. The cache contains contest data and its successful update timestamp. Invalid or missing cache data is ignored; when a refresh fails, the last valid list remains available and the existing offline state is shown.

The configured profile handle, friends list, theme, filters, reminder modes, and other preferences are stored in GSettings. Current fetched friend profile details remain in memory for the session. Starred contest IDs are stored in GSettings and pruned only when a fresh contest response confirms a contest has ended.

When Codeforces reports an active contest or its validated schedule places it between its start and end, the menu can retain and display it as live. The panel chooses an active contest deterministically for its compact indicator, and live rows expose contest, problemset, and standings links. The extension does not fetch post-contest standings or rating changes; those functions are deferred to the separate Telegram backend project.

## Package boundary

The production extension ZIP contains runtime files from `extension/`. It does not contain the Telegram backend, credentials, development tests, or documentation. See [Development](DEVELOPMENT.md) for the packaging command and [Releasing](RELEASING.md) for release validation.
