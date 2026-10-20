import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

export class ReminderManager {
    constructor() {
        this._sentKeys = new Set();
        this._source = null;
    }

    _getSource() {
        if (this._source === null) {
            const source = new MessageTray.Source({
                title: 'CF Companion',
                iconName: 'dialog-information-symbolic',
            });
            this._source = source;
            source.connect('destroy', () => {
                if (this._source === source)
                    this._source = null;
            });
            Main.messageTray.add(source);
        }
        return this._source;
    }

    _notify(key, title, body) {
        if (this._sentKeys.has(key))
            return;
        this._sentKeys.add(key);

        const source = this._getSource();
        const notification = new MessageTray.Notification({ source, title, body });
        source.addNotification(notification);
    }

    check(contests, enabled = true) {
        if (!enabled)
            return;

        const nowSeconds = Math.floor(Date.now() / 1000);

        for (const contest of contests) {
            const secondsLeft = contest.startTimeSeconds - nowSeconds;

            if (secondsLeft > 3480 && secondsLeft <= 3720)
                this._notify(`${contest.id}-1h`, '⏰ Contest in 1 hour', contest.name);

            if (secondsLeft > 780 && secondsLeft <= 1020)
                this._notify(`${contest.id}-15m`, '🔔 Contest in 15 minutes!', contest.name);

            if (secondsLeft > -240 && secondsLeft <= 0)
                this._notify(`${contest.id}-start`, '🚀 Contest started!', contest.name);
        }
    }

    destroy() {
        this._source?.destroy();
        this._source = null;
        this._sentKeys.clear();
    }
}
