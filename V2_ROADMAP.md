# CF Companion V2 roadmap

Everything below is planned work. None of these V2 stages is implemented in the current extension baseline.

1. **Extension foundations:** Restructure the extension into smaller modules, centralize timer management, and persist the last contest list locally.
2. **Preferences:** Add settings for contest types, reminders, and panel display. Add a placeholder “Connect Telegram” button that explains the feature is coming later.
3. **Codeforces identity:** Add the user's Codeforces handle and a locally stored friends list with handle validation.
4. **Friends and results:** Add a friends leaderboard and recently finished contests, including rating updates when Codeforces publishes them.
5. **Contest interaction and presentation:** Add notification actions, starred contests, reminder modes, friendly dates, and urgency styling.

## Telegram separation

The Telegram backend will be developed and hosted separately from this extension. The eventual connection between the two codebases will be designed later. Do not put backend code, API credentials, bot tokens, or secrets in this extension project.
