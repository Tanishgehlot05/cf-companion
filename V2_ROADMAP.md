# CF Companion V2 roadmap

Stages 1–5 are implemented.

1. **Extension foundations — implemented:** Restructure the extension into smaller modules, centralize timer management, and persist the last contest list locally. The cache lives in the user's GNOME cache directory and has no age-based expiry; invalid/missing data is ignored, and failed network requests do not replace a valid cached list.
2. **Preferences — implemented:** Add GSettings-backed controls for contest types, reminders, and panel display. Add a placeholder “Connect Telegram” button that explains the feature is coming later.
3. **Codeforces identity — implemented:** Store and validate the user's handle and up to ten friends. Show the user's public profile in the dropdown with rank styling.
4. **Friends leaderboard — implemented:** Show saved friends' current Codeforces ratings and ranks in a collapsed submenu. Friend profiles refresh hourly while friends are configured. Post-contest summaries, standings comparisons, and rating-result messages are deferred to the separate Telegram backend project; the GNOME extension does not fetch or cache recent-contest results.
5. **Contest interaction and presentation — implemented:** Add Open contest and Snooze 5 min notification actions, persistent upcoming-contest stars, an Apply Changes-controlled all-or-starred reminder mode, local Today/Tomorrow/friendly dates, and a red panel label within 15 minutes of contest start. Snooze timers share the extension timer manager, replace by contest ID, and are cancelled during disable. Stars are pruned only from fresh contest data that reports a finished phase; cached and offline data preserve them.

## Telegram separation

The Telegram backend will be developed and hosted separately from this extension. The eventual connection between the two codebases will be designed later. Do not put backend code, API credentials, bot tokens, or secrets in this extension project.

## Post-Stage-5: Live contest lifecycle and compact menu

- **Live Contest Mode — implemented:** Keep scheduled or API-confirmed active contests visible through the existing validated contest list and cache, show live time remaining in the panel, and provide selected-contest shortcuts to the contest, problemset, and standings.
- **Compact dropdown and refresh — implemented:** Put Refresh, Open Codeforces, and Settings in a single toolbar row; preserve the open popup during single-flight refresh and show progress in place. Put current friend profiles in a collapsed native submenu.
- **Post-contest summaries — deferred:** Post-contest standings summaries, friend comparisons, and rating-result messages are planned for the separate Telegram backend project, not the GNOME extension.
