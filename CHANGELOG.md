# Changelog

This file records changes found in repository history. Historical V1 SemVer
labels below are the requested product labels, not verified Git release tags:
EGO records the initial V1 submission as rejected version `1` and its
review-fix submission as `1.1 (2)` (unreviewed at the time of release-workflow
setup). See [docs/RELEASING.md](docs/RELEASING.md) before creating V1 tags.

## 2.0.0 — V2 release candidate (not tagged or published)

- Restructures the extension into services, UI, and utility modules, with
  centralized timeout cleanup and a validated local contest cache.
- Adds GSettings preferences for contest filters, reminder modes, panel display,
  and five appearance themes.
- Adds Codeforces profile and friends management, including current ratings and
  rank colors in the dropdown.
- Adds starred contests, notification actions, live-contest shortcuts, and a
  compact collapsible menu.
- Keeps the Telegram button as a development placeholder; this extension does
  not include the separate Telegram backend.

## 1.0.1 — V1 reviewer-fix history (EGO submission used 1.1)

- Cancels in-flight requests and removes pending timers during extension
  teardown; cancellation is handled as normal shutdown.
- Removes redundant exception handling around notification-source cleanup and
  creates notification state only during extension enable.
- Removes committed ZIP artifacts, updates packaging to include utility source,
  and fixes popup-row cleanup for supported GNOME Shell APIs.
- Adds the donation metadata entry and a human-readable version name.

## 1.0.0 — Initial V1 submission (EGO submission rejected)

- Adds a GNOME Shell panel indicator for upcoming Codeforces contests, with
  countdowns, urgency colors, and desktop reminders.
- Includes an optional Telegram backend in the V1 repository; this backend is
  not part of V2.
