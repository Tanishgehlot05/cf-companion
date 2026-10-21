# CF Companion

A GNOME Shell extension that brings Codeforces contests, live countdowns, reminders, and your Codeforces profile to the top bar. Manage friends, star contests, and choose from five themes in a compact dropdown.

[![Latest GitHub release](https://img.shields.io/github/v/release/Tanishgehlot05/cf-companion?display_name=tag)](https://github.com/Tanishgehlot05/cf-companion/releases/latest)
[![GNOME Shell 46](https://img.shields.io/badge/GNOME%20Shell-46-4a86cf?logo=gnome&logoColor=white)](https://www.gnome.org/)
[![MIT License](https://img.shields.io/github/license/Tanishgehlot05/cf-companion)](LICENSE)

## Features

- Track upcoming and live Codeforces contests with countdowns and contest links.
- Get desktop reminders with useful notification actions.
- Manage your Codeforces profile and friends, including rating details.
- Star contests and filter the contest list to your preferences.
- Choose GNOME Default, Orbit, Slate, Sage, or Ember appearance.

## Installation

Build and install from the source repository:

```bash
git clone https://github.com/Tanishgehlot05/cf-companion.git
cd cf-companion

gnome-extensions pack extension --force --extra-source=utils
gnome-extensions install --force cf-companion@Tanishgehlot05.github.io.shell-extension.zip
gnome-extensions enable cf-companion@Tanishgehlot05.github.io
```

CF Companion targets **GNOME Shell 46**. The GNOME Shell session may need to reload before the installed extension appears:

- **Wayland:** Log out of GNOME, then log back in.
- **Xorg/X11:** Press `Alt`+`F2`, enter `r`, then press Enter.

After reloading, CF Companion should be available and enabled. If it is not, open the GNOME Extensions app or run `gnome-extensions enable cf-companion@Tanishgehlot05.github.io`. GitHub distribution is separate from submission and review on GNOME Extensions.

## Screenshots

### GNOME Default

[![CF Companion running with the GNOME Default theme, showing the settings window and contest dropdown on the desktop](docs/screenshots/theme-gnome-default.png)](docs/screenshots/theme-gnome-default.png)

### Orbit

[![CF Companion running with the Orbit theme, showing the settings window and contest dropdown on the desktop](docs/screenshots/theme-orbit.png)](docs/screenshots/theme-orbit.png)

### Slate

[![CF Companion running with the Slate theme, showing the settings window and contest dropdown on the desktop](docs/screenshots/theme-slate.png)](docs/screenshots/theme-slate.png)

### Sage

[![CF Companion running with the Sage theme, showing the settings window and contest dropdown on the desktop](docs/screenshots/theme-sage.png)](docs/screenshots/theme-sage.png)

### Ember

[![CF Companion running with the Ember theme, showing the settings window and contest dropdown on the desktop](docs/screenshots/theme-ember.png)](docs/screenshots/theme-ember.png)

## Links

[GitHub Releases](https://github.com/Tanishgehlot05/cf-companion/releases) · [Report an issue](https://github.com/Tanishgehlot05/cf-companion/issues) · [Development](docs/DEVELOPMENT.md) · [Architecture](docs/ARCHITECTURE.md) · [Release guide](docs/RELEASING.md) · [MIT License](LICENSE)
