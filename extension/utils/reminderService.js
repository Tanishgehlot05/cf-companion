import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { contestHasNotEnded, dueReminderKinds, normalizeReminderMode, readStarredContestIds, shouldSendRegularReminder, snoozedReminderKey } from './reminderPreferences.js';
import { SnoozeTimerManager } from './snoozeTimerManager.js';

export class ReminderService {
    constructor(timerManager, settings = null) {
        this._sentKeys = new Set();
        this._source = null;
        this._destroyed = false;
        this._settings = settings;
        this._lastContests = [];
        this._snoozeSequence = 0;
        this._snoozes = new SnoozeTimerManager(
            timerManager,
            contest => this._sendSnoozedReminder(contest),
            contest => console.warn(`[CF Companion] Could not schedule snoozed reminder for contest ${contest.id}.`)
        );
        this._settingsSignals = [];
        if (this._settings) {
            for (const key of [
                'reminder-one-hour', 'reminder-fifteen-minutes', 'reminder-at-start',
                'reminder-mode', 'starred-contests',
            ]) {
                try {
                    this._settingsSignals.push(this._settings.connect(`changed::${key}`, () => this._checkLastContests()));
                } catch (_error) {
                    // Keep reminders enabled by default if an optional preference is unavailable.
                }
            }
        }
    }

    _getSource() {
        if (this._source === null && !this._destroyed) {
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

    _notify(key, title, contest) {
        if (this._destroyed || this._sentKeys.has(key))
            return;
        const source = this._getSource();
        if (source === null)
            return;
        const notification = new MessageTray.Notification({ source, title, body: contest.name });
        notification.addAction('Open contest', () => this._openContest(contest.id));
        notification.addAction('Snooze 5 min', () => this._scheduleSnooze(contest));
        this._sentKeys.add(key);
        source.addNotification(notification);
    }

    _openContest(contestId) {
        if (this._destroyed || !Number.isSafeInteger(contestId) || contestId <= 0)
            return;
        try {
            Gio.AppInfo.launch_default_for_uri(`https://codeforces.com/contest/${contestId}`, null);
        } catch (error) {
            console.error(`[CF Companion] Could not open contest ${contestId}: ${error.message}`);
        }
    }

    _contestForSnooze(contest) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const currentContest = this._lastContests.find(item => item.id === contest.id) ?? contest;
        return contestHasNotEnded(currentContest, nowSeconds) ? currentContest : null;
    }

    _scheduleSnooze(contest) {
        if (this._destroyed)
            return;
        const currentContest = this._contestForSnooze(contest);
        if (!currentContest)
            return;
        this._snoozes.schedule(currentContest);
    }

    _sendSnoozedReminder(contest) {
        if (this._destroyed)
            return;
        const currentContest = this._contestForSnooze(contest);
        if (!currentContest)
            return;
        this._snoozeSequence++;
        this._notify(
            snoozedReminderKey(currentContest.id, this._snoozeSequence),
            '🔔 Contest reminder',
            currentContest
        );
    }

    _isEnabled(key) {
        if (!this._settings)
            return true;
        try {
            return this._settings.get_boolean(key);
        } catch (_error) {
            return true;
        }
    }

    _checkLastContests() {
        if (!this._destroyed)
            this._check(this._lastContests);
    }

    check(contests, enabled = true) {
        if (!enabled || this._destroyed)
            return;
        this._lastContests = contests;
        this._check(contests);
    }

    _check(contests) {
        if (this._destroyed)
            return;

        const nowSeconds = Math.floor(Date.now() / 1000);
        let reminderMode = 0;
        let starredIds = new Set();
        try {
            reminderMode = normalizeReminderMode(this._settings?.get_uint('reminder-mode'));
        } catch (_error) {
            reminderMode = normalizeReminderMode(undefined);
        }
        try {
            starredIds = readStarredContestIds(this._settings?.get_strv('starred-contests'));
        } catch (_error) {
            starredIds = new Set();
        }

        for (const contest of contests) {
            if (!shouldSendRegularReminder(contest.id, reminderMode, starredIds))
                continue;
            const secondsLeft = contest.startTimeSeconds - nowSeconds;
            const kinds = dueReminderKinds(secondsLeft, {
                oneHour: this._isEnabled('reminder-one-hour'),
                fifteenMinutes: this._isEnabled('reminder-fifteen-minutes'),
                atStart: this._isEnabled('reminder-at-start'),
            });
            for (const kind of kinds) {
                const title = kind === '1h' ? '⏰ Contest in 1 hour'
                    : kind === '15m' ? '🔔 Contest in 15 minutes!'
                        : '🚀 Contest started!';
                this._notify(`${contest.id}-${kind}`, title, contest);
            }
        }
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._snoozes.destroy();
        this._source?.destroy();
        this._source = null;
        this._sentKeys.clear();
        if (this._settings) {
            for (const signal of this._settingsSignals)
                this._settings.disconnect(signal);
        }
        this._settingsSignals = [];
        this._settings = null;
        this._lastContests = [];
    }
}
