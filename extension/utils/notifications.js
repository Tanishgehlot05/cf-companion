import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

const sentNotifications = new Set();

let _notificationSource = null;

function getSource() {
    if (_notificationSource === null) {
        _notificationSource = new MessageTray.Source({
            title: 'CF Companion',
            iconName: 'dialog-information-symbolic',
        });
        Main.messageTray.add(_notificationSource);
    }
    return _notificationSource;
}

// only fires once per session — key like "1234-1h" prevents duplicates across the minute timer
export function notify(key, title, body) {
    if (sentNotifications.has(key)) return;
    sentNotifications.add(key);

    try {
        const source = getSource();
        const notification = new MessageTray.Notification({ source, title, body });
        source.addNotification(notification);
    } catch (err) {
        console.error(`[CF Companion] Notification failed: ${err.message}`);
    }
}

// called every minute by the countdown timer
export function checkReminders(contests, enabled = true) {
    if (!enabled) return;

    const nowSeconds = Math.floor(Date.now() / 1000);

    for (const contest of contests) {
        const secondsLeft = contest.startTimeSeconds - nowSeconds;

        if (secondsLeft > 3540 && secondsLeft <= 3660)
            notify(`${contest.id}-1h`, '⏰ Contest in 1 hour', contest.name);

        if (secondsLeft > 840 && secondsLeft <= 960)
            notify(`${contest.id}-15m`, '🔔 Contest in 15 minutes!', contest.name);

        if (secondsLeft > -60 && secondsLeft <= 0)
            notify(`${contest.id}-start`, '🚀 Contest started!', contest.name);
    }
}

export function destroySource() {
    if (_notificationSource !== null) {
        try {
            _notificationSource.destroy();
        } catch (err) {
            console.error(`[CF Companion] Notification cleanup failed: ${err.message}`);
        }
        _notificationSource = null;
    }
    sentNotifications.clear();
}