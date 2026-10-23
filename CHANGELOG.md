# Changelog

This file records V2 GitHub releases and V1 submission history. The V1 SemVer
labels are product labels, not Git release tags: EGO records the initial V1
submission as rejected version `1` and its review-fix submission as `1.1 (2)`.
See [docs/RELEASING.md](docs/RELEASING.md) before creating V1 tags.

## 2.0.1 — GNOME Extensions review fixes

- Tightens extension and preferences cleanup, including cancellation and timer
  handling, and removes an unused timer helper.
- Makes the preferences-only settings helper's process location explicit and
  renames shared reminder preferences rules to clarify their use by the Shell.
- Removes unnecessary exception wrappers and replaces emoji notification text
  with plain notification labels.

## 2.0.0 — First V2 release

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
