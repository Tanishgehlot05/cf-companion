import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { formatCountdown, formatDuration, formatFriendlyStartDate, urgencyClass } from '../utils/time.js';
import { contestUrls, createContestMenuActions } from '../utils/contestMenuActions.js';
import { isPanelUrgent, readStarredContestIds, removeFinishedStarredContestIds, setContestStarred } from '../utils/reminderPreferences.js';
import { rankStyleClass } from '../utils/userProfile.js';
import { contestCategoryLabel } from '../utils/contestFilters.js';
import { THEMES, readAppearanceTheme } from '../utils/themes.js';
import { contestLifecycle, panelContestDisplay, selectPrimaryActiveContest, selectVisibleMenuContests, upcomingContestViewMode } from '../utils/upcomingContests.js';

const COUNTDOWN_INTERVAL_MS = 60 * 1000;
const COUNTDOWN_CLASSES = ['cf-countdown-normal', 'cf-urgency-yellow', 'cf-urgency-orange', 'cf-urgency-red'];

function contestMarkerClass(type) {
    if (type === 'CF')
        return 'cf-contest-marker-cf';
    if (type === 'ICPC')
        return 'cf-contest-marker-icpc';
    return 'cf-contest-marker-other';
}

class ToolbarTooltip {
    constructor(button, text, timers) {
        this._button = button;
        this._timers = timers;
        this._timeoutId = null;
        this._destroyed = false;
        this.actor = new St.Label({
            text,
            visible: false,
            reactive: false,
            style_class: 'cf-action-tooltip',
        });
        Main.uiGroup.add_child(this.actor);
        this._hoverSignal = button.connect('notify::hover', () => this._syncHover());
        this._pressSignal = button.connect('button-press-event', () => {
            this._hide();
            return Clutter.EVENT_PROPAGATE;
        });
        this._destroySignal = button.connect('destroy', () => this.destroy());
    }

    setText(text) {
        this.actor.set_text(text);
    }

    setTheme(themeId) {
        for (const theme of THEMES)
            this.actor.remove_style_class_name(`cf-theme-${theme.id}`);
        this.actor.add_style_class_name(`cf-theme-${themeId}`);
    }

    hide() {
        this._cancelTimeout();
        this._hide();
    }

    _syncHover() {
        if (this._destroyed)
            return;
        if (!this._button.hover) {
            this._cancelTimeout();
            this._hide();
            return;
        }
        this._cancelTimeout();
        this._timeoutId = this._timers.timeout(550, () => {
            this._timeoutId = null;
            if (!this._destroyed && this._button?.hover)
                this._show();
        });
    }

    _show() {
        if (this._destroyed || !this._button?.mapped)
            return;
        this.actor.show();
        const [, , preferredWidth, preferredHeight] = this.actor.get_preferred_size();
        const [buttonX, buttonY] = this._button.get_transformed_position();
        const buttonWidth = this._button.allocation.get_width();
        const monitor = Main.layoutManager.findMonitorForActor(this._button);
        if (!monitor)
            return this._hide();
        const x = Math.clamp(
            buttonX + Math.floor((buttonWidth - preferredWidth) / 2),
            monitor.x,
            monitor.x + monitor.width - preferredWidth
        );
        const y = Math.max(monitor.y, buttonY - preferredHeight - 6);
        this.actor.set_position(x, y);
    }

    _cancelTimeout() {
        if (this._timeoutId !== null) {
            this._timers.cancel(this._timeoutId);
            this._timeoutId = null;
        }
    }

    _hide() {
        if (!this._destroyed && this.actor)
            this.actor.hide();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._cancelTimeout();
        if (this._button) {
            for (const signal of [this._hoverSignal, this._pressSignal, this._destroySignal]) {
                if (signal)
                    this._button.disconnect(signal);
            }
        }
        this._button = null;
        this._timers = null;
        this.actor?.destroy();
        this.actor = null;
    }
}

export const CFIndicator = GObject.registerClass(
class CFIndicator extends PanelMenu.Button {
    _init({ extensionPath, timers, onRefresh, onOpenPreferences, reminders, settings = null }) {
        super._init(0.0, 'CF Companion', false);
        this._timers = timers;
        this._onRefresh = onRefresh;
        this._onOpenPreferences = onOpenPreferences;
        this._reminders = reminders;
        this._settings = settings;
        this._codeforcesIcon = Gio.FileIcon.new(
            Gio.File.new_for_path(`${extensionPath}/icons/codeforces.svg`));
        this._codeforcesInverseIcon = Gio.FileIcon.new(
            Gio.File.new_for_path(`${extensionPath}/icons/codeforces-inverse.svg`));
        this._settingsSignals = [];
        this._activeTheme = readAppearanceTheme(this._settings);
        this._starredContestIds = this._readStarredContestIds();
        try {
            this._settingsSignals.push(this._settings?.connect('changed::panel-display-mode', () => {
                this._updatePanelLabel();
            }) ?? 0);
        } catch (_error) {
            // Keep the default panel label if the preference is unavailable.
        }
        try {
            this._settingsSignals.push(this._settings?.connect('changed::starred-contests', () => {
                this._syncStarredRows();
            }) ?? 0);
        } catch (_error) {
            // Starring remains unavailable if its optional setting is missing.
        }
        try {
            this._settingsSignals.push(this._settings?.connect('changed::appearance-theme', () => {
                this._activeTheme = readAppearanceTheme(this._settings);
                this._applyTheme(this._activeTheme);
            }) ?? 0);
        } catch (_error) {
            // The Orbit palette remains active if the appearance setting is unavailable.
        }
        this._contests = [];
        this._reminderContests = [];
        this._friendsState = { friends: [], friendsState: 'empty' };
        this._friendRows = new Map();
        this._renderedFriendHandles = [];
        this._pendingFriendsUpdate = false;
        this._contestRows = [];
        this._contestsExpanded = false;
        this._renderedContestIds = [];
        this._renderedContestMode = 'loading';
        this._pendingMenuUpdate = false;
        this._offline = false;
        this._stale = true;
        this._staleContestIds = new Set();
        this._loadingContests = true;
        this._lastUpdatedAt = null;
        this._minuteTickId = null;
        this._destroyed = false;
        this._toolbarTooltips = [];
        this._menuNavigationSignals = [];
        this._menuNavigationActors = [];

        this._buildPanelLabel();
        this._buildMenu();
        this._applyTheme(this._activeTheme);
        this._profileState = { handle: '', profile: null, state: 'empty' };
        this._scheduleCountdownTick();
    }

    _buildPanelLabel() {
        const box = new St.BoxLayout({ style_class: 'panel-status-menu-box cf-panel-box' });
        this._panelLabel = new St.Label({
            text: 'CF',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'cf-panel-label',
        });
        box.add_child(this._panelLabel);
        this.add_child(box);
    }

    _applyTheme(themeId) {
        if (!this._panelLabel || !this.menu?.actor)
            return;
        const codeforcesIcon = themeId === 'system' ? this._codeforcesIcon : this._codeforcesInverseIcon;
        this._codeforcesToolbarIcon.gicon = codeforcesIcon;
        const actors = [
            this._panelLabel,
            this.menu.actor,
            this._friendsSubmenu?.menu.actor,
            ...this._toolbarTooltips.map(tooltip => tooltip.actor),
        ].filter(Boolean);
        for (const actor of actors) {
            for (const theme of THEMES)
                actor.remove_style_class_name(`cf-theme-${theme.id}`);
            actor.add_style_class_name(`cf-theme-${themeId}`);
        }
        if (this._profileBox) {
            for (const theme of THEMES)
                this._profileBox.remove_style_class_name(`cf-profile-theme-${theme.id}`);
            this._profileBox.add_style_class_name(`cf-profile-theme-${themeId}`);
        }
        if (this._toolbarRow) {
            for (const theme of THEMES)
                this._toolbarRow.remove_style_class_name(`cf-action-toolbar-theme-${theme.id}`);
            this._toolbarRow.add_style_class_name(`cf-action-toolbar-theme-${themeId}`);
        }
        for (const row of this._contestRows ?? []) {
            for (const theme of THEMES)
                row.content.remove_style_class_name(`cf-contest-theme-${theme.id}`);
            row.content.add_style_class_name(`cf-contest-theme-${themeId}`);
        }
    }

    _buildMenu() {
        this.menu.actor.add_style_class_name('cf-companion-menu');
        this._profileItem = new PopupMenu.PopupBaseMenuItem({
            can_focus: true,
            style_class: 'cf-profile-item',
        });
        this._profileItem.connect('activate', () => {
            const handle = this._profileState?.handle;
            if (handle)
                this._openUri(`https://codeforces.com/profile/${encodeURIComponent(handle)}`);
        });
        const profileBox = new St.BoxLayout({ x_expand: true, style_class: 'cf-profile-row' });
        this._profileBox = profileBox;
        const headerRow = new St.BoxLayout({ style_class: 'cf-profile-header-row' });
        const brandIcon = new St.Label({
            text: '</>',
            style_class: 'cf-profile-brand-code',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const brand = new St.BoxLayout({ style_class: 'cf-profile-brand' });
        brand.add_child(brandIcon);
        this._profileHandleLabel = new St.Label({
            text: '',
            style_class: 'cf-profile-handle',
            x_expand: true,
        });
        this._profileStatusLabel = new St.Label({
            text: '',
            style_class: 'cf-profile-status cf-rank-neutral',
        });
        const profileDetails = new St.BoxLayout({ vertical: true, x_expand: true });
        this._profileIndicator = new St.Label({ text: '●', style_class: 'cf-profile-indicator' });
        headerRow.add_child(this._profileHandleLabel);
        profileDetails.add_child(headerRow);
        profileDetails.add_child(this._profileStatusLabel);
        const profileTrailing = new St.BoxLayout({
            style_class: 'cf-profile-trailing',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const profileChevron = new St.Icon({
            icon_name: 'pan-end-symbolic',
            style_class: 'cf-profile-chevron',
            y_align: Clutter.ActorAlign.CENTER,
        });
        profileTrailing.add_child(this._profileIndicator);
        profileTrailing.add_child(profileChevron);
        profileBox.add_child(brand);
        profileBox.add_child(profileDetails);
        profileBox.add_child(profileTrailing);
        this._profileItem.add_child(profileBox);
        this.menu.addMenuItem(this._profileItem);

        this._accountAction = new PopupMenu.PopupImageMenuItem(
            'Change Codeforces account', 'avatar-default-symbolic');
        this._accountAction.connect('activate', () => this._openPreferences());
        const addFriendItem = new PopupMenu.PopupImageMenuItem('Add a friend', 'list-add-symbolic');
        addFriendItem.connect('activate', () => this._openPreferences());

        this._friendsSubmenu = new PopupMenu.PopupSubMenuMenuItem('Friends', false);
        this._friendsSubmenu.insert_child_at_index(new St.Icon({
            icon_name: 'system-users-symbolic',
            style_class: 'popup-menu-icon',
        }), 0);
        this._friendsSubmenu.menu.actor.add_style_class_name('cf-companion-menu');
        this._friendsSubmenu.menu.actor.add_style_class_name('cf-friends-submenu');
        this._renderFriendRows();

        this._contestHeader = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'cf-contest-header-row',
        });
        const contestHeaderBox = new St.BoxLayout({ x_expand: true, style_class: 'cf-contest-header-box' });
        this._contestHeaderLabel = new St.Label({
            text: 'UPCOMING CONTESTS · 0',
            x_expand: true,
            style_class: 'cf-menu-header',
        });
        this._contestViewButton = new St.Button({
            label: 'View all',
            reactive: true,
            can_focus: true,
            track_hover: true,
            visible: false,
            style_class: 'cf-contest-expand-button',
            accessible_name: 'Show all contests',
        });
        this._contestViewButton.connect('clicked', () => {
            this._contestsExpanded = !this._contestsExpanded;
            this._updateContestHeader();
            this._updateContestVisibility();
        });
        contestHeaderBox.add_child(this._contestHeaderLabel);
        contestHeaderBox.add_child(this._contestViewButton);
        this._contestHeader.add_child(contestHeaderBox);
        this._contestSection = new PopupMenu.PopupMenuSection();
        this._contestSection.actor.add_style_class_name('cf-contest-section');

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this._accountAction);
        this.menu.addMenuItem(addFriendItem);
        this.menu.addMenuItem(this._friendsSubmenu);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this.menu.addMenuItem(this._contestHeader);
        this.menu.addMenuItem(this._contestSection);
        this._updateContestHeader();
        this._showPlaceholder('loading');
        this._footerItem = new PopupMenu.PopupMenuItem('', { reactive: false });
        this._footerItem.label.add_style_class_name('cf-menu-footer');
        this._footerItem.actor.hide();
        this.menu.addMenuItem(this._footerItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._buildActionToolbar();
        this._enableKeyboardMenuFocus();

        this.menu.connect('open-state-changed', (menu, isOpen) => {
            if (!isOpen && !this._destroyed) {
                for (const tooltip of this._toolbarTooltips)
                    tooltip.hide();
                if (this._pendingMenuUpdate)
                    this._renderContestRows();
                if (this._pendingFriendsUpdate)
                    this._renderFriendRows();
            }
        });
    }

    _enableKeyboardMenuFocus() {
        this._menuNavigationActors = [this.menu.actor, this._friendsSubmenu.menu.actor];
        for (const actor of this._menuNavigationActors) {
            const keySignal = actor.connect('key-press-event', (_actor, event) => {
                const key = event.get_key_symbol();
                if ([
                    Clutter.KEY_Up, Clutter.KEY_Down, Clutter.KEY_Left, Clutter.KEY_Right,
                    Clutter.KEY_Tab, Clutter.KEY_ISO_Left_Tab, Clutter.KEY_Home, Clutter.KEY_End,
                ].includes(key))
                    this._setKeyboardMenuFocus(true);
                return Clutter.EVENT_PROPAGATE;
            });
            const motionSignal = actor.connect('motion-event', () => {
                this._setKeyboardMenuFocus(false);
                return Clutter.EVENT_PROPAGATE;
            });
            this._menuNavigationSignals.push([actor, keySignal], [actor, motionSignal]);
        }
        const menuOpenSignal = this.menu.connect('open-state-changed', () => {
            this._setKeyboardMenuFocus(false);
        });
        this._menuNavigationSignals.push([this.menu, menuOpenSignal]);
    }

    _setKeyboardMenuFocus(enabled) {
        for (const actor of this._menuNavigationActors) {
            if (enabled)
                actor.add_style_class_name('cf-keyboard-navigation');
            else
                actor.remove_style_class_name('cf-keyboard-navigation');
        }
    }

    _buildActionToolbar() {
        const row = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false,
            style_class: 'cf-action-toolbar-row',
        });
        this._toolbarRow = row;
        row.add_style_class_name(`cf-action-toolbar-theme-${this._activeTheme}`);
        const box = new St.BoxLayout({ x_expand: true, style_class: 'cf-action-toolbar' });
        const refresh = this._createToolbarButton(
            'view-refresh-symbolic', 'Refresh', 'Refresh contests', () => this._onRefresh?.());
        this._refreshButton = refresh.button;
        this._refreshIcon = refresh.icon;
        this._refreshLabel = refresh.label;
        this._refreshTooltip = refresh.tooltip;
        const openButton = this._createToolbarButton(
            this._codeforcesIcon, 'Codeforces', 'Open Codeforces', () => this._openUri('https://codeforces.com/contests'));
        openButton.icon.add_style_class_name('cf-codeforces-toolbar-icon');
        this._codeforcesToolbarIcon = openButton.icon;
        const settingsButton = this._createToolbarButton(
            'preferences-system-symbolic', 'Settings', 'Settings', () => this._openPreferences());
        box.add_child(this._refreshButton);
        box.add_child(openButton.button);
        box.add_child(settingsButton.button);
        row.add_child(box);
        this.menu.addMenuItem(row);
        this._setRefreshState(false);
    }

    _createToolbarButton(iconName, text, accessibleName, callback) {
        const button = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            x_expand: true,
            style_class: 'cf-action-toolbar-button',
            accessible_name: accessibleName,
        });
        const box = new St.BoxLayout({
            x_expand: true,
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'cf-action-toolbar-button-content',
        });
        const iconOptions = { style_class: 'popup-menu-icon' };
        if (typeof iconName === 'string')
            iconOptions.icon_name = iconName;
        else
            iconOptions.gicon = iconName;
        const icon = new St.Icon(iconOptions);
        const label = new St.Label({
            text,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'cf-action-toolbar-label',
        });
        box.add_child(icon);
        box.add_child(label);
        button.set_child(box);
        button.connect('clicked', callback);
        const tooltip = new ToolbarTooltip(button, accessibleName, this._timers);
        this._toolbarTooltips.push(tooltip);
        tooltip.setTheme(this._activeTheme);
        return { button, icon, label, tooltip };
    }

    setRefreshState(isRefreshing) {
        if (this._destroyed || !this._refreshButton)
            return;
        this._setRefreshState(isRefreshing);
    }

    _setRefreshState(isRefreshing) {
        this._refreshIcon.set_icon_name(isRefreshing ? 'process-working-symbolic' : 'view-refresh-symbolic');
        this._refreshLabel.set_text(isRefreshing ? 'Refreshing…' : 'Refresh');
        this._refreshButton.accessible_name = isRefreshing ? 'Refreshing contests' : 'Refresh contests';
        this._refreshTooltip.setText(isRefreshing ? 'Refreshing contests' : 'Refresh contests');
        this._refreshButton.sensitive = !isRefreshing;
    }

    setProfileState(state) {
        if (this._destroyed)
            return;
        this._profileState = state;
        const configured = Boolean(state.handle);
        this._accountAction.label.set_text(configured
            ? 'Change Codeforces account'
            : 'Set up Codeforces account');
        this._profileHandleLabel.set_text(configured ? state.handle : 'CF Companion');
        this._profileIndicator.remove_style_class_name('cf-profile-indicator-online');
        if (configured && ['ready', 'refreshing', 'stale'].includes(state.state))
            this._profileIndicator.add_style_class_name('cf-profile-indicator-online');
        if (!configured) {
            this._profileStatusLabel.set_text('Connect a Codeforces account in Settings');
            return;
        }
        let status = 'Profile unavailable';
        let rank = 'unrated';
        if (state.state === 'loading') {
            status = 'Loading profile…';
        } else if (state.state === 'refreshing' && state.profile) {
            rank = state.profile.rank;
            status = `${this._formatProfileRank(rank, state.profile.rating)} · refreshing`;
        } else if (state.state === 'ready' && state.profile) {
            rank = state.profile.rank;
            status = this._formatProfileRank(rank, state.profile.rating);
        } else if (state.state === 'stale' && state.profile) {
            rank = state.profile.rank;
            status = `${this._formatProfileRank(rank, state.profile.rating)} · showing saved data`;
        } else if (state.state === 'unavailable') {
            status = 'Profile unavailable';
        }
        for (const styleClass of [
            'cf-rank-newbie', 'cf-rank-pupil', 'cf-rank-specialist', 'cf-rank-expert',
            'cf-rank-candidate-master', 'cf-rank-master', 'cf-rank-international-master',
            'cf-rank-grandmaster', 'cf-rank-international-grandmaster',
            'cf-rank-legendary-grandmaster', 'cf-rank-neutral',
        ]) {
            this._profileStatusLabel.remove_style_class_name(styleClass);
        }
        this._profileStatusLabel.add_style_class_name(rankStyleClass(rank));
        this._profileStatusLabel.set_text(status);
    }

    _formatProfileRank(rank, rating) {
        if (rank === 'unrated')
            return 'Unrated';
        const displayRank = rank.split(' ')
            .map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
            .join(' ');
        return `${displayRank} · ${rating}`;
    }

    setContestState({ contests, displayContests = contests, offline, stale = false, staleContestIds = [], lastUpdatedAt, finishedContestIds = [] }) {
        if (this._destroyed)
            return;
        if (!offline && finishedContestIds.length > 0)
            this._pruneFinishedStars(finishedContestIds);
        const now = Math.floor(Date.now() / 1000);
        const previousActiveIds = new Set(this._contests
            .filter(contest => contestLifecycle(contest, now) === 'live')
            .map(contest => contest.id));
        this._contests = displayContests
            .filter(contest => contestLifecycle(contest, now) === 'live' ||
                contestLifecycle(contest, now) === 'upcoming')
            .sort((a, b) => {
                const stateA = contestLifecycle(a, now);
                const stateB = contestLifecycle(b, now);
                if (stateA !== stateB)
                    return stateA === 'live' ? -1 : 1;
                return stateA === 'live'
                    ? (a.startTimeSeconds + a.durationSeconds) - (b.startTimeSeconds + b.durationSeconds) || a.id - b.id
                    : a.startTimeSeconds - b.startTimeSeconds || a.id - b.id;
            });
        this._reminderContests = contests.filter(contest =>
            contestLifecycle(contest, now) === 'live' || contestLifecycle(contest, now) === 'upcoming');
        this._offline = offline;
        this._stale = stale || offline;
        this._staleContestIds = new Set(staleContestIds);
        this._loadingContests = false;
        this._lastUpdatedAt = lastUpdatedAt;
        const endedActive = [...previousActiveIds].some(id => !this._contests.some(contest => contest.id === id)) ||
            this._contestRows.some(row => row.lifecycle === 'live' &&
                row.contest.startTimeSeconds + row.contest.durationSeconds <= now);
        this._syncContestRows(endedActive);
        this._updateFooter();
        this._updatePanelLabel();
        this._reminders.check(this._reminderContests);
    }

    setFriendsState(state) {
        if (this._destroyed)
            return;
        this._friendsState = state;
        const friendCount = state.friends.length;
        this._friendsSubmenu.label.set_text(friendCount > 0 ? `Friends · ${friendCount}` : 'Friends');
        const handles = state.friends.map(friend => friend.handle.toLowerCase());
        const sameOrder = handles.length === this._renderedFriendHandles.length &&
            handles.every((handle, index) => handle === this._renderedFriendHandles[index]);
        if (sameOrder) {
            this._pendingFriendsUpdate = false;
            for (const friend of state.friends)
                this._updateFriendRow(friend);
            return;
        }
        if (this.menu.isOpen) {
            this._pendingFriendsUpdate = true;
            for (const friend of state.friends)
                this._updateFriendRow(friend);
            return;
        }
        this._renderFriendRows();
    }

    _renderFriendRows() {
        this._pendingFriendsUpdate = false;
        this._friendsSubmenu.menu.removeAll();
        this._friendRows.clear();
        const friends = this._friendsState.friends;
        this._renderedFriendHandles = friends.map(friend => friend.handle.toLowerCase());
        if (friends.length === 0) {
            const message = this._friendsState.friendsState === 'loading'
                ? 'Loading friends…'
                : 'No friends saved yet.';
            this._friendsSubmenu.menu.addMenuItem(new PopupMenu.PopupMenuItem(message, { reactive: false }));
            return;
        }
        for (const friend of friends) {
            const item = new PopupMenu.PopupBaseMenuItem({ reactive: false });
            const box = new St.BoxLayout({ vertical: true, style_class: 'cf-friend-row' });
            const handleLabel = new St.Label({ style_class: 'cf-profile-handle' });
            const detailLabel = new St.Label({ style_class: 'cf-profile-status cf-rank-neutral' });
            box.add_child(handleLabel);
            box.add_child(detailLabel);
            item.add_child(box);
            this._friendsSubmenu.menu.addMenuItem(item);
            this._friendRows.set(friend.handle.toLowerCase(), { handleLabel, detailLabel });
            this._updateFriendRow(friend);
        }
    }

    _updateFriendRow(friend) {
        const row = this._friendRows.get(friend.handle.toLowerCase());
        if (!row)
            return;
        row.handleLabel.set_text(friend.handle);
        let details;
        if (friend.status === 'loading')
            details = 'Loading profile…';
        else if (friend.status === 'unavailable')
            details = 'Profile unavailable';
        else if (friend.rating === null)
            details = 'Unrated';
        else
            details = `Rating ${friend.rating} · ${friend.rank}`;
        if (friend.status === 'refreshing')
            details += ' · refreshing';
        else if (friend.status === 'stale')
            details += ' · showing saved data';
        row.detailLabel.set_text(details);
        for (const styleClass of this._rankStyleClasses())
            row.detailLabel.remove_style_class_name(styleClass);
        row.detailLabel.add_style_class_name(rankStyleClass(friend.rank));
    }

    _rankStyleClasses() {
        return [
            'cf-rank-newbie', 'cf-rank-pupil', 'cf-rank-specialist', 'cf-rank-expert',
            'cf-rank-candidate-master', 'cf-rank-master', 'cf-rank-international-master',
            'cf-rank-grandmaster', 'cf-rank-international-grandmaster',
            'cf-rank-legendary-grandmaster', 'cf-rank-neutral',
        ];
    }

    _showPlaceholder(mode) {
        this._contestSection.removeAll();
        this._contestRows = [];
        this._placeholderItem = new PopupMenu.PopupBaseMenuItem({ reactive: false });
        const box = new St.BoxLayout({ vertical: true });
        this._placeholderPrimary = new St.Label();
        this._placeholderSecondary = new St.Label({ style_class: 'cf-menu-footer' });
        box.add_child(this._placeholderPrimary);
        box.add_child(this._placeholderSecondary);
        this._placeholderItem.add_child(box);
        this._contestSection.addMenuItem(this._placeholderItem);
        this._contestSection.actor.show();
        this._updatePlaceholder(mode);
    }

    _updatePlaceholder(mode) {
        if (!this._placeholderItem)
            return;
        for (const styleClass of ['cf-loading-label', 'cf-error-label'])
            this._placeholderPrimary.remove_style_class_name(styleClass);
        if (mode === 'offline') {
            this._placeholderPrimary.set_text('⚠️  Offline');
            this._placeholderPrimary.add_style_class_name('cf-error-label');
            this._placeholderSecondary.set_text('Click Refresh to retry');
            this._placeholderSecondary.show();
        } else if (mode === 'loading') {
            this._placeholderPrimary.set_text('⏳  Loading contests…');
            this._placeholderPrimary.add_style_class_name('cf-loading-label');
            this._placeholderSecondary.set_text('');
            this._placeholderSecondary.hide();
        } else {
            this._placeholderPrimary.set_text('No upcoming contests');
            this._placeholderSecondary.set_text('');
            this._placeholderSecondary.hide();
        }
    }

    _desiredContestMode() {
        return upcomingContestViewMode(this._contests, this._offline, this._loadingContests);
    }

    _updateContestHeader() {
        if (!this._contestHeaderLabel || !this._contestViewButton)
            return;
        const now = Math.floor(Date.now() / 1000);
        const liveCount = this._contests.filter(contest => contestLifecycle(contest, now) === 'live').length;
        const upcomingCount = this._contests.filter(contest => contestLifecycle(contest, now) === 'upcoming').length;
        this._contestHeaderLabel.set_text(`UPCOMING CONTESTS · ${upcomingCount}${liveCount ? ` · ${liveCount} LIVE` : ''}`);
        if (upcomingCount <= 3)
            this._contestsExpanded = false;
        this._contestViewButton.visible = upcomingCount > 3;
        this._contestViewButton.set_label(this._contestsExpanded ? 'Show fewer' : 'View all');
        this._contestViewButton.accessible_name = this._contestsExpanded
            ? 'Show fewer contests'
            : 'Show all contests';
    }

    _updateContestVisibility() {
        if (!this._contestRows)
            return;
        const now = Math.floor(Date.now() / 1000);
        const visibleIds = new Set(selectVisibleMenuContests(this._contests, this._contestsExpanded, now)
            .map(contest => contest.id));
        for (const row of this._contestRows) {
            const visible = visibleIds.has(row.contest.id);
            if (visible) {
                row.item.show();
            } else {
                row.item.hide();
            }
        }
    }

    _syncContestRows(forceWhileOpen = false) {
        this._updateContestHeader();
        const mode = this._desiredContestMode();
        const ids = this._contests.map(contest => contest.id);
        const sameIds = ids.length === this._renderedContestIds.length &&
            ids.every((id, index) => id === this._renderedContestIds[index]);

        if (mode === this._renderedContestMode && sameIds) {
            if (mode === 'rows') {
                const rowsById = new Map(this._contestRows.map(row => [row.contest.id, row]));
                for (const contest of this._contests) {
                    const row = rowsById.get(contest.id);
                    if (!row)
                        continue;
                    row.contest = contest;
                    this._updateRow(row, contest.startTimeSeconds - Math.floor(Date.now() / 1000));
                }
                this._updateContestHighlight();
                this._updateContestVisibility();
            }
            this._pendingMenuUpdate = false;
            return;
        }

        if (this.menu.isOpen && ids.length === 0 && this._renderedContestIds.length === 0) {
            this._renderedContestMode = mode;
            this._pendingMenuUpdate = false;
            this._updatePlaceholder(mode);
            return;
        }

        if (this.menu.isOpen && mode === 'rows' && this._contestRows.length === 0 && ids.length > 0) {
            this._renderContestRows();
            return;
        }

        if (this.menu.isOpen && !forceWhileOpen) {
            this._pendingMenuUpdate = true;
            const rowsById = new Map(this._contestRows.map(row => [row.contest.id, row]));
            for (const contest of this._contests) {
                const row = rowsById.get(contest.id);
                if (!row)
                    continue;
                row.contest = contest;
                this._updateRow(row, contest.startTimeSeconds - Math.floor(Date.now() / 1000));
            }
            return;
        }

        this._renderContestRows();
    }

    _renderContestRows() {
        this._contestSection.removeAll();
        this._contestRows = [];
        this._pendingMenuUpdate = false;
        this._renderedContestMode = this._desiredContestMode();
        this._renderedContestIds = this._contests.map(contest => contest.id);
        this._placeholderItem = null;
        this._placeholderPrimary = null;
        this._placeholderSecondary = null;

        if (this._renderedContestMode === 'offline') {
            this._showPlaceholder('offline');
            return;
        }

        if (this._renderedContestMode === 'loading' || this._renderedContestMode === 'empty') {
            this._showPlaceholder(this._renderedContestMode);
            return;
        }

        for (const contest of this._contests) {
            const row = this._buildContestItem(contest);
            this._contestRows.push(row);
            this._contestSection.addMenuItem(row.item);
        }
        this._contestSection.actor.show();
        this._updateContestHeader();
        this._updateContestVisibility();
        this._updateContestHighlight();
    }

    _buildContestItem(contest) {
        const secondsLeft = contest.startTimeSeconds - Math.floor(Date.now() / 1000);
        const item = new PopupMenu.PopupBaseMenuItem({ style_class: 'cf-contest-row-item' });
        const urls = contestUrls(contest.id);
        const actions = createContestMenuActions(
            contest.id,
            () => urls && this._openUri(urls.contest),
            (id, starred) => this._setContestStarred(id, starred)
        );
        const content = new St.BoxLayout({
            vertical: true,
            x_expand: true,
            style_class: `cf-contest-row cf-contest-theme-${this._activeTheme}`,
        });
        const heading = new St.BoxLayout({ style_class: 'cf-contest-heading' });
        const markerLabel = new St.Label({
            text: '●',
            style_class: `cf-contest-marker ${contestMarkerClass(contest.type)}`,
            y_align: Clutter.ActorAlign.CENTER,
            accessible_name: contest.type === 'CF' ? 'Codeforces contest'
                : contest.type === 'ICPC' ? 'ICPC contest' : 'Other contest',
        });
        const nameLabel = new St.Label({
            text: contest.name,
            style_class: 'cf-contest-name',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const categoryLabel = new St.Label({
            text: contestCategoryLabel(contest),
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'cf-contest-category-badge',
        });
        const starButton = new St.Button({
            label: this._starredContestIds.has(contest.id) ? '★' : '☆',
            toggle_mode: true,
            checked: this._starredContestIds.has(contest.id),
            can_focus: true,
            reactive: true,
            track_hover: true,
            style_class: 'cf-contest-star-button',
            accessible_name: this._starredContestIds.has(contest.id) ? 'Unstar contest' : 'Star contest',
        });
        starButton.connect('clicked', () => actions.toggleStar(starButton.checked));
        const detailRow = new St.BoxLayout({
            x_expand: true,
            style_class: 'cf-contest-details-row',
        });
        const detailDateIcon = new St.Icon({ icon_name: 'x-office-calendar-symbolic', style_class: 'cf-contest-detail-icon' });
        const detailLabel = new St.Label({ style_class: 'cf-contest-details', x_expand: true });
        const durationLabel = new St.Label({ style_class: 'cf-contest-details' });
        const countdownLabel = new St.Label({
            style_class: 'cf-contest-countdown',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
        });
        const actionsBox = new St.BoxLayout({ style_class: 'cf-live-actions' });
        const actionButtons = [];
        if (urls) {
            for (const [label, url, accessibleName] of [
                ['Open', urls.contest, `Open ${contest.name}`],
                ['Problems', urls.problemset, `Open ${contest.name} problemset`],
                ['Standings', urls.standings, `Open ${contest.name} standings`],
            ]) {
                const button = new St.Button({
                    label,
                    can_focus: true,
                    reactive: true,
                    track_hover: true,
                    style_class: 'cf-live-action-button',
                    accessible_name: accessibleName,
                });
                button.connect('clicked', () => this._openUri(url));
                actionsBox.add_child(button);
                actionButtons.push(button);
            }
        }
        actionsBox.hide();
        heading.add_child(markerLabel);
        heading.add_child(nameLabel);
        heading.add_child(categoryLabel);
        heading.add_child(starButton);
        detailRow.add_child(detailDateIcon);
        detailRow.add_child(detailLabel);
        detailRow.add_child(durationLabel);
        detailRow.add_child(countdownLabel);
        content.add_child(heading);
        content.add_child(detailRow);
        content.add_child(actionsBox);
        item.add_child(content);
        item.connect('activate', (_item, event) => {
            let source = event?.get_source() ?? null;
            while (source) {
                if (source === starButton || actionButtons.includes(source))
                    return;
                source = source.get_parent();
            }
            actions.open();
        });
        const row = {
            contest,
            item,
            content,
            markerLabel,
            nameLabel,
            categoryLabel,
            detailDateIcon,
            detailLabel,
            durationLabel,
            countdownLabel,
            starButton,
            actionsBox,
            actionButtons,
        };
        this._updateRow(row, secondsLeft);
        return row;
    }

    _updateContestHighlight() {
        let highlighted = false;
        for (const row of this._contestRows) {
            const shouldHighlight = !highlighted && contestLifecycle(row.contest) === 'upcoming';
            row.content.remove_style_class_name('cf-contest-row-priority');
            if (shouldHighlight) {
                row.content.add_style_class_name('cf-contest-row-priority');
                highlighted = true;
            }
        }
    }

    _updateRow(row, secondsLeft) {
        const now = Math.floor(Date.now() / 1000);
        const lifecycle = contestLifecycle(row.contest, now);
        const live = lifecycle === 'live';
        const countdown = secondsLeft <= 0 ? 'LIVE' : formatCountdown(secondsLeft);
        row.nameLabel.set_text(row.contest.name);
        row.categoryLabel.set_text(contestCategoryLabel(row.contest));
        for (const markerClass of ['cf-contest-marker-cf', 'cf-contest-marker-icpc', 'cf-contest-marker-other'])
            row.markerLabel.remove_style_class_name(markerClass);
        row.markerLabel.add_style_class_name(contestMarkerClass(row.contest.type));
        for (const styleClass of COUNTDOWN_CLASSES)
            row.countdownLabel.remove_style_class_name(styleClass);
        row.countdownLabel.remove_style_class_name('cf-live-contest');
        row.lifecycle = lifecycle;
        if (live) {
            row.countdownLabel.add_style_class_name('cf-live-contest');
            const remaining = formatCountdown(row.contest.startTimeSeconds + row.contest.durationSeconds - now);
            const cachedSchedule = this._stale || this._staleContestIds.has(row.contest.id) || row.contest.phase === 'BEFORE';
            row.detailLabel.set_text(`Ends in ${remaining}${cachedSchedule ? ' · cached schedule' : ''}`);
            row.durationLabel.set_text('');
            row.countdownLabel.set_text('LIVE');
            row.actionsBox.show();
        } else {
            row.countdownLabel.add_style_class_name(urgencyClass(secondsLeft));
            row.detailLabel.set_text(formatFriendlyStartDate(row.contest.startTimeSeconds));
            row.durationLabel.set_text(`· ${formatDuration(row.contest.durationSeconds)}`);
            row.countdownLabel.set_text(countdown);
            row.actionsBox.hide();
        }
        this._updateStarButton(row);
    }

    _readStarredContestIds() {
        try {
            return readStarredContestIds(this._settings?.get_strv('starred-contests'));
        } catch (_error) {
            return new Set();
        }
    }

    _updateStarButton(row) {
        if (!row.starButton)
            return;
        const starred = this._starredContestIds.has(row.contest.id);
        row.starButton.checked = starred;
        row.starButton.set_label(starred ? '★' : '☆');
        row.starButton.accessible_name = starred ? 'Unstar contest' : 'Star contest';
    }

    _syncStarredRows() {
        this._starredContestIds = this._readStarredContestIds();
        for (const row of this._contestRows)
            this._updateStarButton(row);
        this._updatePanelLabel();
    }

    _pruneFinishedStars(finishedContestIds) {
        if (!this._settings)
            return;
        try {
            if (!this._settings.is_writable('starred-contests'))
                return;
            const current = this._settings.get_strv('starred-contests');
            const updated = removeFinishedStarredContestIds(current, finishedContestIds);
            if (updated.join('\0') === current.join('\0'))
                return;
            if (!this._settings.set_strv('starred-contests', updated))
                return;
            this._starredContestIds = readStarredContestIds(updated);
            this._syncStarredRows();
        } catch (error) {
            console.warn(`[CF Companion] Could not remove finished contests from stars: ${error.message}`);
        }
    }

    _setContestStarred(contestId, starred) {
        if (this._destroyed || !this._settings)
            return;
        try {
            if (!this._settings.is_writable('starred-contests'))
                throw new Error('settings are not writable');
            const current = this._settings.get_strv('starred-contests');
            const updated = setContestStarred(current, contestId, starred);
            if (!this._settings.set_strv('starred-contests', updated))
                throw new Error('settings rejected the updated star list');
            this._starredContestIds = readStarredContestIds(updated);
            this._syncStarredRows();
        } catch (error) {
            console.warn(`[CF Companion] Could not save starred contest ${contestId}: ${error.message}`);
            this._syncStarredRows();
        }
    }

    _setPanelUrgency(secondsLeft) {
        if (isPanelUrgent(secondsLeft))
            this._panelLabel.add_style_class_name('cf-panel-urgent');
        else
            this._panelLabel.remove_style_class_name('cf-panel-urgent');
    }

    _updatePanelLabel() {
        let mode = 0;
        try {
            mode = this._settings?.get_uint('panel-display-mode') ?? 0;
        } catch (_error) {
            mode = 0;
        }
        const now = Math.floor(Date.now() / 1000);
        const primaryLive = selectPrimaryActiveContest(this._contests, this._starredContestIds, now);
        const display = panelContestDisplay(
            this._contests,
            mode,
            this._starredContestIds,
            now,
            this._stale || (primaryLive !== null && this._staleContestIds.has(primaryLive.id))
        );
        if (display.live)
            this._panelLabel.add_style_class_name('cf-panel-live');
        else
            this._panelLabel.remove_style_class_name('cf-panel-live');
        this._setPanelUrgency(display.urgent ? display.contest.startTimeSeconds - now : null);
        this._panelLabel.set_text(this._offline && !display.contest ? 'CF (offline)' : display.text);
    }

    _updateFooter() {
        if (this._offline) {
            const time = this._lastUpdatedAt
                ? new Date(this._lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'unknown';
            this._footerItem.label.set_text(`Offline · Last update: ${time}`);
            this._footerItem.actor.show();
        } else {
            this._footerItem.label.set_text('');
            this._footerItem.actor.hide();
        }
    }

    _scheduleCountdownTick() {
        this._minuteTickId = this._timers.timeout(COUNTDOWN_INTERVAL_MS, () => {
            this._minuteTickId = null;
            if (this._destroyed)
                return;
            // Queue the next tick before UI work so a rendering error cannot stop updates.
            this._scheduleCountdownTick();
            const now = Math.floor(Date.now() / 1000);
            const hadExpiredLive = this._contestRows.some(row =>
                (row.lifecycle === 'live' || row.contest.startTimeSeconds <= now) &&
                row.contest.startTimeSeconds + row.contest.durationSeconds <= now);
            this._contests = this._contests.filter(contest =>
                contestLifecycle(contest, now) === 'live' || contestLifecycle(contest, now) === 'upcoming');
            this._reminderContests = this._reminderContests.filter(contest =>
                contestLifecycle(contest, now) === 'live' || contestLifecycle(contest, now) === 'upcoming');
            this._syncContestRows(hadExpiredLive);
            this._updatePanelLabel();
            this._reminders.check(this._reminderContests);
        });
    }

    _openUri(uri) {
        try {
            Gio.AppInfo.launch_default_for_uri(uri, null);
        } catch (error) {
            console.error(`[CF Companion] Failed to open URI: ${error.message}`);
        }
    }

    _openPreferences() {
        if (this._destroyed || !this._onOpenPreferences)
            return;
        this._onOpenPreferences();
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        if (this._minuteTickId !== null) {
            this._timers.cancel(this._minuteTickId);
            this._minuteTickId = null;
        }
        this._onRefresh = null;
        this._onOpenPreferences = null;
        this._reminders = null;
        if (this._settings) {
            for (const signal of this._settingsSignals) {
                if (signal)
                    this._settings.disconnect(signal);
            }
        }
        this._settingsSignals = [];
        this._settings = null;
        this._contests = [];
        this._reminderContests = [];
        for (const tooltip of this._toolbarTooltips)
            tooltip.destroy();
        this._toolbarTooltips = [];
        for (const [actor, signal] of this._menuNavigationSignals) {
            if (signal)
                actor.disconnect(signal);
        }
        this._menuNavigationSignals = [];
        this._menuNavigationActors = [];
        super.destroy();
    }
});
