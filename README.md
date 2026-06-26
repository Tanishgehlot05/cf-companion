# CF Companion

A GNOME Shell extension for competitive programmers. Tracks upcoming Codeforces contests from your panel, sends desktop notifications before they start, and optionally connects to a Telegram bot that sends reminders and post-contest standings comparisons with friends.

![GNOME 45+](https://img.shields.io/badge/GNOME-45%2B-4A86CF?logo=gnome&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Screenshots

> Add release screenshots to the `screenshots/` folder before publishing.

| Panel label | Dropdown menu | Notification |
|---|---|---|
| `screenshots/panel.png` | `screenshots/dropdown.png` | `screenshots/notification.png` |

---

## Features

### GNOME Extension

- **Live countdown** — panel shows time until the next contest (`CF • 2h 14m`), updated every minute without re-fetching
- **Urgency colors** — contest names turn green → yellow → orange → red as the start time approaches
- **Desktop notifications** — one notification at 1 hour before, 15 minutes before, and at contest start; no duplicates within a session
- **Preferences** — configure refresh interval, max contests shown, and desktop reminders
- **Offline-friendly** — keeps showing the last fetched contests if the network is unavailable, with an "Offline · Last update: HH:MM" footer

### Telegram Bot (optional)

- Set your Codeforces handle and add friends to track
- Morning digest at 8am with today's contests
- Reminders 1 hour and 15 minutes before each contest
- After each contest: standings comparison with your friends, sorted by rank

---

## Architecture

```
cf-companion/
├── extension/          ← GNOME Shell extension (GJS, ES Modules)
│   ├── extension.js    ← Main indicator and menu logic
│   ├── metadata.json   ← Extension identity and GNOME version support
│   ├── prefs.js        ← GNOME preferences window
│   ├── stylesheet.css  ← Panel and dropdown styles
│   ├── icons/          ← Extension icons
│   ├── schemas/        ← GSettings schema for preferences
│   └── utils/
│       ├── time.js         ← Countdown formatting and urgency logic
│       └── notifications.js ← Desktop notification helpers
│
├── backend/            ← Node.js backend (optional)
│   ├── server.js       ← Health endpoint + cron jobs
│   ├── bot.js          ← Telegram bot (long-polling)
│   ├── db.js           ← SQLite setup
│   └── package.json
│
├── .github/workflows/  ← GitHub Actions CI
├── screenshots/
├── README.md
├── LICENSE
└── .gitignore
```

**Data flow:**

```
Codeforces API ──► GNOME Extension (direct, every 30 min)
                        │
                        └── Panel label, dropdown, notifications,
                            preferences (all local, no backend needed)

Codeforces API ──► Backend (cron, every 30 min)
                        │
                        ├── SQLite DB (contest cache)
                        └── Telegram Bot ──► Users
                                                │
                                                └── Reminders, morning digest,
                                                    post-contest standings
```

---

## Installation — Extension

### Option 1: Manual (recommended for development)

```bash
# Clone the repo
git clone <repo-url>
cd cf-companion

# Copy the extension to GNOME's extensions folder
cp -r extension ~/.local/share/gnome-shell/extensions/cf-companion@gnome

# Compile preferences schema
glib-compile-schemas ~/.local/share/gnome-shell/extensions/cf-companion@gnome/schemas

# Enable it
gnome-extensions enable cf-companion@gnome

# On Wayland: log out and back in to restart GNOME Shell
# On X11: press Alt+F2, type 'r', press Enter
```

### Option 2: GNOME Extensions website

> *(Submit to [extensions.gnome.org](https://extensions.gnome.org) once tested)*

---

## Running the Backend (optional)

The extension works standalone. The backend is only needed for the Telegram bot features.

```bash
cd backend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env — add your Telegram bot token

# Start
npm start

# Or with auto-restart during development
npm run dev
```

The server runs on `http://localhost:3000` by default.

---

## Telegram Bot Setup

See the detailed guide below for creating your bot token. Once you have it:

1. Add `TELEGRAM_BOT_TOKEN=your_token_here` to `backend/.env`
2. Start the backend: `npm start` inside `backend/`
3. Open Telegram, find your bot, and send `/start`
4. Set your handle: `/add YourCFHandle`
5. Add friends: `/add FriendHandle`

### Bot Commands

| Command | Description |
|---|---|
| `/start` | Register and see welcome message |
| `/help` | List all commands |
| `/add <handle>` | Set your handle (first time) or add a friend |
| `/remove <handle>` | Remove a friend |
| `/friends` | See your current friend list |

---

## Debugging the Extension

```bash
# Watch live GNOME Shell logs (best way to debug)
journalctl -f -o cat /usr/bin/gnome-shell

# Reload the extension after code changes (X11 only)
gnome-extensions disable cf-companion@gnome
gnome-extensions enable cf-companion@gnome
```

---

## Future Improvements

- Contest type filter (Div. 1, Div. 2, Educational, etc.)
- Rating change display in post-contest standings (requires `/user.rating` API call)
- Support for Codeforces Gym contests
- Light theme color variants for urgency labels

---

## License

MIT — see [LICENSE](LICENSE).
