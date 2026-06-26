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
import { checkReminders, destroySource } from './utils/notifications.js';


const CF_API_URL = 'https://codeforces.com/api/contest.list?gym=false';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const COUNTDOWN_INTERVAL_MS = 60 * 1000;
const MAX_CONTESTS = 8;


export default class CFCompanion extends Extension {

    enable() {
        this._indicator = new CFIndicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
    }

    disable() {
        destroySource();
        this._indicator?.destroy();
        this._indicator = null;
    }
}


const CFIndicator = GObject.registerClass(
class CFIndicator extends PanelMenu.Button {

    _init(extension) {
        super._init(0.0, 'CF Companion', false);

        this._extension = extension;
        this._httpSession = new Soup.Session();
        this._cancellable = new Gio.Cancellable();
        this._isDestroyed = false;

        this._refreshTimer   = null;
        this._countdownTimer = null;

        // cache last good contests for offline mode
        this._lastContests  = [];
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
        const countdown   = formatCountdown(secondsLeft);
        this._panelLabel.set_text(`CF • ${countdown}`);
    }

    _buildMenu() {
        const headerItem = new PopupMenu.PopupMenuItem('📡  Upcoming Contests', {
            reactive: false,
        });
        headerItem.label.add_style_class_name('cf-menu-header');
        this.menu.addMenuItem(headerItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // this part gets rebuilt on every refresh
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
        const item = new PopupMenu.PopupMenuItem('⏳  Loading contests…', { reactive: false });
        item.label.add_style_class_name('cf-loading-label');
        this._contestSection.addMenuItem(item);
    }

    // rebuilds contest list in dropdown
    _updateMenu(contests) {
        this._contestSection.removeAll();

        if (contests.length === 0) {
            const item = new PopupMenu.PopupMenuItem('No upcoming contests found.', { reactive: false });
            this._contestSection.addMenuItem(item);
            this._updateFooter();
            return;
        }

        for (let i = 0; i < contests.length; i++) {
            this._contestSection.addMenuItem(this._buildContestItem(contests[i]));

            if (i < contests.length - 1) {
                this._contestSection.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }
        }

        this._updateFooter();
        this._updatePanelLabel();
    }

    // one contest row in the dropdown
    _buildContestItem(contest) {
        const secondsLeft  = secondsUntil(contest.startTimeSeconds);
        const countdown    = formatCountdown(secondsLeft);
        const dateStr      = formatStartDate(contest.startTimeSeconds);
        const durationStr  = formatDuration(contest.durationSeconds);
        const colorClass   = urgencyClass(secondsLeft);

        const typeBadge = contest.type === 'CF' ? '🔵' : contest.type === 'ICPC' ? '🟢' : '🟡';

        const item = new PopupMenu.PopupSubMenuMenuItem('', false);
        item.label.hide();

        const vbox = new St.BoxLayout({
            vertical: true,
            style_class: 'cf-contest-row',
        });

        const nameLabel = new St.Label({
            text: `${typeBadge}  ${contest.name}`,
            style_class: `cf-contest-name ${colorClass}`,
        });

        const detailLabel = new St.Label({
            text: `📅 ${dateStr}   ⏱ ${durationStr}   ⏳ in ${countdown}`,
            style_class: 'cf-contest-details',
        });

        vbox.add_child(nameLabel);
        vbox.add_child(detailLabel);

        item.insert_child_at_index(vbox, 1);

        const openContestItem = new PopupMenu.PopupMenuItem('🔗  Open contest page');
        openContestItem.connect('activate', () => {
            this._openUri(`https://codeforces.com/contests/${contest.id}`);
        });
        item.menu.addMenuItem(openContestItem);

        return item;
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
            const item = new PopupMenu.PopupMenuItem('', { reactive: false });

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
            item.label.hide();
            item.add_child(vbox);

            this._contestSection.addMenuItem(item);
        }

        this._updateFooter();
        this._panelLabel.set_text('CF (offline)');
    }

    _refresh() {
        if (this._isDestroyed) return;

        this._clearTimer(this._refreshTimer);
        this._refreshTimer = null;

        this._fetchContests()
            .then(contests => {
                if (this._isDestroyed) return;

                this._isOffline     = false;
                this._lastContests  = contests;
                this._lastUpdatedAt = new Date();

                this._updateMenu(contests);
                checkReminders(contests);

                this._refreshTimer = this._scheduleTimer(REFRESH_INTERVAL_MS, () => {
                    this._refresh();
                });
            })
            .catch(err => {
                if (this._isDestroyed || err.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)) {
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

                this._refreshTimer = this._scheduleTimer(REFRESH_INTERVAL_MS, () => {
                    this._refresh();
                });
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
                    if (this._isDestroyed) {
                        reject(new Error('Request cancelled'));
                        return;
                    }

                    try {
                        const bytes = session.send_and_read_finish(result);

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

    // minute tick for panel text and reminders
    _startCountdownTick() {
        this._countdownTimer = this._scheduleRepeatingTimer(COUNTDOWN_INTERVAL_MS, () => {
            this._updatePanelLabel();
            if (this._lastContests.length > 0) {
                checkReminders(this._lastContests);
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _scheduleTimer(intervalMs, callback) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, () => {
            callback();
            return GLib.SOURCE_REMOVE;
        });
    }

    _scheduleRepeatingTimer(intervalMs, callback) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, intervalMs, callback);
    }

    _clearTimer(timerId) {
        if (timerId !== null && timerId !== undefined) {
            GLib.source_remove(timerId);
        }
    }

    destroy() {
        this._isDestroyed = true;
        this._cancellable?.cancel();
        this._clearTimer(this._refreshTimer);
        this._clearTimer(this._countdownTimer);
        this._refreshTimer   = null;
        this._countdownTimer = null;
        this._httpSession    = null;
        this._cancellable    = null;
        super.destroy();
    }
});