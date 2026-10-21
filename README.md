# CF Companion

CF Companion is a GNOME Shell extension that shows upcoming Codeforces contests in the top panel. It provides contest countdowns, urgency colors, and desktop reminders.

This standalone project contains only the GNOME Shell extension. It targets **GNOME Shell 46** and retains the existing UUID `cf-companion@Tanishgehlot05.github.io`.

## Baseline

The extension source is based on the submitted V1 review-fixes baseline, commit [`8b616e2`](https://github.com/Tanishgehlot05/cf-companion/commit/8b616e29b9276189fa37f92b653163fba9fbc50f). Stages 1–5 are implemented. The official UUID and extension version are unchanged.

## Package

From this project directory, run:

```sh
node scripts/generate-theme-stylesheet.mjs
gnome-extensions pack extension --force \
  --extra-source=services --extra-source=ui --extra-source=utils --extra-source=icons \
  --schema=schemas/org.gnome.shell.extensions.cf-companion.gschema.xml \
  --out-dir=/tmp
```

The package is written to `/tmp` using the UUID from `extension/metadata.json`. The service, UI, utility, and icon directories are included as extra source because the extension keeps those assets in dedicated directories. The GSettings schema is included for the preferences window.

The four custom palettes and GNOME Default option are defined in `extension/utils/themes.js`. The generator keeps the Shell stylesheet's theme selectors in sync with those shared palette values; it is a development-time helper and is not included in the extension package. Bundled Codeforces icon variants are in `extension/icons/`; their source and license are documented alongside them.

For local development, copy the contents of `extension/` into:

```text
~/.local/share/gnome-shell/extensions/cf-companion@Tanishgehlot05.github.io/
```

Then disable and re-enable the extension using GNOME Extensions or `gnome-extensions`. Shell/session behavior should be tested on GNOME Shell 46.

## Project contents

- `extension/extension.js` — extension entry point
- `extension/metadata.json` — GNOME extension metadata
- `extension/stylesheet.css` — panel and menu styling
- `extension/services/` — contest, profile, and friend-profile fetching with retries and upcoming-contest cache persistence
- `extension/ui/` — panel indicator and dropdown
- `extension/utils/` — countdown, urgency, and notification helpers
- `LICENSE` — MIT License

The Telegram backend, credentials, generated packages, and V1 Git history are not part of this repository.

## Stage 1 architecture

- `extension/extension.js` owns enable/disable and connects the runtime components.
- `extension/services/contestService.js` fetches and validates the Codeforces list, handles retries, and reads/writes the local cache.
- `extension/services/codeforcesUserService.js` validates handles and fetches the configured public profile from Codeforces.
- `extension/services/friendsService.js` maintains the rating-sorted friends leaderboard and refreshes current public friend profiles hourly.
- `extension/ui/panel.js` owns the panel indicator, menu, rows, countdown display, and manual refresh action.
- `extension/utils/reminderService.js` owns reminder deduplication and the MessageTray source lifecycle.
- `extension/utils/snoozeTimerManager.js` tracks one replaceable five-minute snooze per contest through the shared timer manager.
- `extension/utils/reminderPreferences.js` handles reminder-mode filtering, persisted starred contest IDs, reminder windows, and panel urgency rules.
- `extension/utils/timerManager.js` tracks every GLib timeout and removes outstanding sources during teardown.
- `extension/prefs.js` provides General, Contests, Reminders, Profile & Friends, Appearance, and Integration pages. Orbit, Slate, Sage, and Ember are applied through the existing general Apply Changes workflow.
- The `codeforces-handle` and `friends` preferences are stored locally in GSettings. Current friend profile data is kept in memory.

The last successful contest list is stored at `${XDG_CACHE_HOME:-~/.cache}/cf-companion/contests.json`. It is validated before display and has no age-based expiry: the most recently successful valid response remains available until replaced by another successful response. Missing or invalid cache data is ignored; a network failure leaves an already loaded cache in place and displays the existing offline state. Cache writes are asynchronous and contain only contest data and its successful update timestamp.

Post-contest summaries, standings comparisons, and rating-result messages are deferred to the separate Telegram backend project. The GNOME extension does not fetch, poll, read, or write recent-contest results. Any existing `contest-results.json` file is left untouched and is no longer used by the extension.

Regular reminders default to **All contests**. The optional **Starred contests only** mode is applied with the other general preferences and reads the starred contest IDs stored in GSettings. Upcoming and live contest rows have an inline accessible star control. IDs are removed from the saved star list only when a fresh contest-list response confirms that contest has finished; cached and offline data do not prune stars. Reminder notifications have Open contest and Snooze 5 min actions. Snoozes use the shared timer manager, replace an existing snooze for the same contest, and are cancelled on disable. The snoozed notification uses a distinct send-once key and is checked again against the contest end time before delivery.

The dropdown keeps every filtered active contest available when Codeforces reports `CODING` or its validated schedule places it between its start and end. If a refresh omits a still-active contest, its last known contest record remains available until its scheduled end; cached live rows are labelled as schedule-based. The panel uses the existing minute timer to show live time remaining, prefers a starred active contest for the compact indicator, and otherwise selects the active contest ending soonest. Live rows provide contest, problemset, and standings shortcuts.

The Friends leaderboard is a collapsed native submenu. Current friend profiles are cached in memory for the session, shown with rank colors, and refreshed hourly; opening the submenu does not trigger a request. Post-contest summaries are deferred to the separate Telegram backend project.

Refresh, Open Codeforces, and Settings share one compact toolbar row. Refresh status updates in place while the contest request is running; the contest service keeps requests single-flight and retains its validated contest cache on failure.

Upcoming contest rows use local-time friendly dates (Today, Tomorrow, or weekday/date) and update their date and countdown text in place. The panel indicator text turns red during the final 15 minutes before a contest starts and returns to its normal color during live contests or when no upcoming contest applies.
