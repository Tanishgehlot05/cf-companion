import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { ContestService } from './services/contestService.js';
import { CodeforcesUserService } from './services/codeforcesUserService.js';
import { FriendsService } from './services/friendsService.js';
import { CFIndicator } from './ui/panel.js';
import { ReminderService } from './utils/reminderService.js';
import { TimerManager } from './utils/timerManager.js';

export default class CFCompanion extends Extension {
    enable() {
        try {
            this._settings = this.getSettings();
        } catch (error) {
            console.warn(`[CF Companion] Settings unavailable; using defaults: ${error.message}`);
            this._settings = null;
        }
        this._timers = new TimerManager();
        this._reminders = new ReminderService(this._timers, this._settings);
        this._indicator = new CFIndicator({
            extensionPath: this.path,
            timers: this._timers,
            onRefresh: () => this._contestService?.refresh() ?? false,
            onOpenPreferences: () => this._openOrPresentPreferences(),
            reminders: this._reminders,
            settings: this._settings,
        });
        Main.panel.addToStatusArea(this.uuid, this._indicator, 0, 'right');
        this._contestService = new ContestService(this._timers, state => {
            this._indicator?.setContestState(state);
        }, this._settings, isRefreshing => this._indicator?.setRefreshState(isRefreshing));
        this._friendsService = new FriendsService(this._timers, this._settings, state => {
            this._indicator?.setFriendsState(state);
        });
        this._userService = new CodeforcesUserService(this._timers, this._settings, state => {
            this._indicator?.setProfileState(state);
        });
        this._contestService.start();
        this._friendsService.start();
        this._userService.start();
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
        this._userService?.destroy();
        this._userService = null;
        this._friendsService?.destroy();
        this._friendsService = null;
        this._contestService?.destroy();
        this._contestService = null;
        this._reminders?.destroy();
        this._reminders = null;
        this._timers?.destroy();
        this._timers = null;
        this._settings = null;
    }

    _openOrPresentPreferences() {
        const title = this.metadata.name;
        const existingWindow = global.display.get_tab_list(
            Meta.TabList.NORMAL_ALL, null
        ).find(window => {
            const windowTitle = window.get_title() ?? '';
            return windowTitle === title || windowTitle.startsWith(`${title} —`) ||
                windowTitle.startsWith(`${title} -`);
        });
        if (existingWindow) {
            if (existingWindow.minimized)
                existingWindow.unminimize();
            Main.activateWindow(existingWindow, global.get_current_time());
            return;
        }

        this.openPreferences();
    }
}
