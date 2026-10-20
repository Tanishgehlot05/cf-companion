// gnome shell extension for codeforces contests

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Soup from 'gi://Soup';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { secondsUntil, formatCountdown, formatStartDate, formatDuration, urgencyClass } from './utils/time.js';
import { ReminderManager } from './utils/notifications.js';


const CF_API_URL = 'https://codeforces.com/api/contest.list?gym=false';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const COUNTDOWN_INTERVAL_MS = 60 * 1000;
const RETRY_INTERVALS_MS = [2, 5, 10, 30].map(minutes => minutes * 60 * 1000);
const MAX_CONTESTS = 8;


export default class CFCompanion extends Extension {

    enable() {
        this._reminders = new ReminderManager();
        this._indicator = new CFIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._reminders?.destroy();
        this._reminders = null;
    }
}


const CFIndicator = GObject.registerClass(
class CFIndicator extends PanelMenu.Button {

    _init(extension) {
        super._init(0.0, 'CF Companion', false);

        this._extension = extension;
        this._httpSession = new Soup.Session();
        this._httpSession.timeout = 30;
        this._cancellable = new Gio.Cancellable();
        this._requestRunning = false;
        this._retryAttempt = 0;
        this._refreshId = null;
        this._minuteTickId = null;

        // cache last good contests for offline mode
        this._lastContests  = [];
        this._contestRows = [];
        this._isOffline     = false;
        this._lastUpdatedAt = null;

        this._buildPanelLabel();
        this._buildMenu();

        this._refresh();
        this._startCountdownTick();
    }


    _buildPanelLabel() {
        const box = new St.BoxLayout({
            style_class: 'panel-status-menu-box cf-panel-box',
        });

        this._panelLabel = new St.Label({
            text: 'CF',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'cf-panel-label',
        });

        box.add_child(this._panelLabel);
        this.add_child(box);
    }

    // updates top panel text
    _updatePanelLabel() {
        if (this._isOffline && this._lastContests.length === 0) {
            this._panelLabel.set_text('CF (offline)');
            return;
        }

        if (this._lastContests.length === 0) {
            this._panelLabel.set_text('CF ✓');
            return;
        }

        const next = this._lastContests[0];
        const secondsLeft = secondsUntil(next.startTimeSeconds);
        const countdown = secondsLeft <= 0 ? 'LIVE' : formatCountdown(secondsLeft);
        this._panelLabel.set_text(`CF • ${countdown}`);
    }

    _buildMenu() {
        const headerItem = new PopupMenu.PopupMenuItem('📡  Upcoming Contests', {
            reactive: false,
        });
        headerItem.label.add_style_class_name('cf-menu-header');
        this.menu.addMenuItem(headerItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        this._contestSection = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._contestSection);

        this._showLoadingPlaceholder();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        const refreshItem = new PopupMenu.PopupMenuItem('🔄  Refresh Now');
        refreshItem.connect('activate', () => this._refresh());
        this.menu.addMenuItem(refreshItem);

        const openItem = new PopupMenu.PopupMenuItem('🌐  Open Codeforces');
        openItem.connect('activate', () => {
            this._openUri('https://codeforces.com/contests');
        });
        this.menu.addMenuItem(openItem);

        this._footerItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._footerItem.label.add_style_class_name('cf-menu-footer');
        this.menu.addMenuItem(this._footerItem);
    }

    _showLoadingPlaceholder() {
        this._contestSection.removeAll();
        this._contestRows = [];
        const item = new PopupMenu.PopupMenuItem('⏳  Loading contests…', { reactive: false });
        item.label.add_style_class_name('cf-loading-label');
        this._contestSection.addMenuItem(item);
    }

    // rebuilds contest list in dropdown
    _updateMenu(contests) {
        this._contestSection.removeAll();
        this._contestRows = [];

        if (contests.length === 0) {
            const item = new PopupMenu.PopupMenuItem('No upcoming contests found.', { reactive: false });
            this._contestSection.addMenuItem(item);
            this._updateFooter();
            this._updatePanelLabel();
            return;
        }

        for (let i = 0; i < contests.length; i++) {
            const row = this._buildContestItem(contests[i]);
            this._contestRows.push(row);
            this._contestSection.addMenuItem(row.item);

            if (i < contests.length - 1) {
                row.separator = new PopupMenu.PopupSeparatorMenuItem();
                this._contestSection.addMenuItem(row.separator);
            }
        }

        this._updateFooter();
        this._updatePanelLabel();
    }

    // one contest row in the dropdown
    _buildContestItem(contest) {
        const secondsLeft  = secondsUntil(contest.startTimeSeconds);
        const countdown    = secondsLeft <= 0 ? 'LIVE' : formatCountdown(secondsLeft);
        const dateStr      = formatStartDate(contest.startTimeSeconds);
        const durationStr  = formatDuration(contest.durationSeconds);
        const colorClass   = urgencyClass(secondsLeft);

        const typeBadge = contest.type === 'CF' ? '🔵' : contest.type === 'ICPC' ? '🟢' : '🟡';

        const item = new PopupMenu.PopupBaseMenuItem();

        const vbox = new St.BoxLayout({
            vertical: true,
            style_class: 'cf-contest-row',
        });

        const nameLabel = new St.Label({
            text: `${typeBadge}  ${contest.name}`,
            style_class: `cf-contest-name ${colorClass}`,
        });

        const detailLabel = new St.Label({
            text: `📅 ${dateStr}   ⏱ ${durationStr}   ⏳ ${countdown === 'LIVE' ? 'LIVE' : `in ${countdown}`}`,
            style_class: 'cf-contest-details',
        });

        vbox.add_child(nameLabel);
        vbox.add_child(detailLabel);

        item.add_child(vbox);
        item.connect('activate', () => {
            this._openUri(`https://codeforces.com/contests/${contest.id}`);
        });

        return { contest, item, nameLabel, detailLabel };
    }

    _updateFooter() {
        if (this._isOffline) {
            const timeStr = this._lastUpdatedAt
                ? this._lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'unknown';
            this._footerItem.label.set_text(`Offline · Last update: ${timeStr}`);
        } else if (this._lastUpdatedAt) {
            const timeStr = this._lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this._footerItem.label.set_text(`Updated: ${timeStr}`);
        }
    }

    _showOfflineMessage() {
        if (this._lastContests.length === 0) {
            this._contestSection.removeAll();
            const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });

            const vbox = new St.BoxLayout({ vertical: true });

            const offlineLabel = new St.Label({
                text: '⚠️  Offline',
                style_class: 'cf-error-label',
            });

            const retryLabel = new St.Label({
                text: 'Click "Refresh Now" to retry',
                style_class: 'cf-menu-footer',
            });

            vbox.add_child(offlineLabel);
            vbox.add_child(retryLabel);
            item.add_child(vbox);

            this._contestSection.addMenuItem(item);
        }

        this._updateFooter();
        this._panelLabel.set_text('CF (offline)');
    }

    _refresh() {
        if (this._requestRunning)
            return;
        this._requestRunning = true;

        this._fetchContests()
            .then(contests => {
                if (this._cancellable.is_cancelled())
                    throw new Error('Request cancelled');

                this._isOffline     = false;
                this._lastContests  = contests;
                this._lastUpdatedAt = new Date();
                this._retryAttempt = 0;

                this._updateMenu(contests);
                this._extension._reminders.check(contests);

                this._scheduleRefresh(REFRESH_INTERVAL_MS);
            })
            .catch(err => {
                if (err.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) || this._cancellable.is_cancelled()) {
                    return;
                }

                console.error(`[CF Companion] Fetch failed: ${err.message}`);
                this._isOffline = true;

                if (this._lastContests.length > 0) {
                    this._updateFooter();
                    this._updatePanelLabel();
                } else {
                    this._showOfflineMessage();
                }

                const retry = RETRY_INTERVALS_MS[Math.min(this._retryAttempt, RETRY_INTERVALS_MS.length - 1)];
                this._retryAttempt++;
                this._scheduleRefresh(retry);
            })
            .finally(() => {
                this._requestRunning = false;
            });
    }

    _fetchContests() {
        return new Promise((resolve, reject) => {
            const message = Soup.Message.new('GET', CF_API_URL);
            if (!message) {
                reject(new Error('Invalid URL'));
                return;
            }

            message.request_headers.append('User-Agent', 'CFCompanion-GNOME/1.0');

            this._httpSession.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                this._cancellable,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);

                        if (this._cancellable.is_cancelled()) {
                            reject(new Error('Request cancelled'));
                            return;
                        }

                        if (message.get_status() !== Soup.Status.OK) {
                            reject(new Error(`HTTP ${message.get_status()}`));
                            return;
                        }

                        const text   = new TextDecoder('utf-8').decode(bytes.get_data());
                        const parsed = JSON.parse(text);

                        if (parsed.status !== 'OK') {
                            reject(new Error(`CF API: ${parsed.comment}`));
                            return;
                        }

                        const upcoming = parsed.result
                            .filter(c => c.phase === 'BEFORE')
                            .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
                            .slice(0, MAX_CONTESTS);

                        resolve(upcoming);
                    } catch (e) {
                        reject(e);
                    }
                }
            );
        });
    }

    _openUri(uri) {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (err) {
            console.error(`[CF Companion] Failed to open URI: ${err.message}`);
        }
    }

    // Update menu rows and reminders once per minute.
    _startCountdownTick() {
        this._minuteTickId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, COUNTDOWN_INTERVAL_MS, () => {
            this._minuteTickId = null;
            this._lastContests = this._lastContests.filter(contest =>
                contest.startTimeSeconds + contest.durationSeconds > Math.floor(Date.now() / 1000));
            this._updateContestRows();
            this._updatePanelLabel();
            if (this._lastContests.length > 0) {
                this._extension._reminders.check(this._lastContests);
            }
            this._startCountdownTick();
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateContestRows() {
        const now = Math.floor(Date.now() / 1000);
        const liveIds = new Set(this._lastContests.map(contest => contest.id));
        this._contestRows = this._contestRows.filter(row => {
            if (liveIds.has(row.contest.id))
                return true;
            this._contestSection.removeMenuItem(row.item);
            if (row.separator)
                this._contestSection.removeMenuItem(row.separator);
            return false;
        });

        const lastRow = this._contestRows[this._contestRows.length - 1];
        if (lastRow?.separator) {
            this._contestSection.removeMenuItem(lastRow.separator);
            lastRow.separator = null;
        }

        for (const row of this._contestRows) {
            const secondsLeft = row.contest.startTimeSeconds - now;
            const countdown = secondsLeft <= 0 ? 'LIVE' : formatCountdown(secondsLeft);
            const dateStr = formatStartDate(row.contest.startTimeSeconds);
            const durationStr = formatDuration(row.contest.durationSeconds);
            row.detailLabel.set_text(`📅 ${dateStr}   ⏱ ${durationStr}   ⏳ ${countdown === 'LIVE' ? 'LIVE' : `in ${countdown}`}`);
            for (const className of ['cf-urgency-green', 'cf-urgency-yellow', 'cf-urgency-orange', 'cf-urgency-red'])
                row.nameLabel.remove_style_class_name(className);
            row.nameLabel.add_style_class_name(urgencyClass(secondsLeft));
        }
    }

    _scheduleRefresh(intervalMs) {
        if (this._refreshId !== null)
            GLib.source_remove(this._refreshId);
        this._refreshId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
            this._refreshId = null;
            this._refresh();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        this._cancellable?.cancel();
        if (this._refreshId !== null) {
            GLib.source_remove(this._refreshId);
            this._refreshId = null;
        }
        if (this._minuteTickId !== null) {
            GLib.source_remove(this._minuteTickId);
            this._minuteTickId = null;
        }
        this._httpSession?.abort();
        this._httpSession    = null;
        super.destroy();
    }
});
