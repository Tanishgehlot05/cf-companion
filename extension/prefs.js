import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class CFCompanionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage({
            title: 'CF Companion',
            icon_name: 'preferences-system-symbolic',
        });

        const contestsGroup = new Adw.PreferencesGroup({
            title: 'Contests',
            description: 'Control how often contests are refreshed and how many appear in the menu.',
        });

        const refreshRow = new Adw.SpinRow({
            title: 'Refresh interval',
            subtitle: 'Minutes between Codeforces API refreshes',
            adjustment: new Gtk.Adjustment({
                lower: 5,
                upper: 180,
                step_increment: 5,
                page_increment: 15,
            }),
        });
        settings.bind(
            'refresh-interval-minutes',
            refreshRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const maxContestsRow = new Adw.SpinRow({
            title: 'Contests shown',
            subtitle: 'Maximum upcoming contests in the dropdown',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 20,
                step_increment: 1,
                page_increment: 5,
            }),
        });
        settings.bind(
            'max-contests',
            maxContestsRow,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        contestsGroup.add(refreshRow);
        contestsGroup.add(maxContestsRow);

        const notificationGroup = new Adw.PreferencesGroup({
            title: 'Notifications',
        });

        const notificationRow = new Adw.SwitchRow({
            title: 'Desktop reminders',
            subtitle: 'Notify 1 hour before, 15 minutes before, and when contests start',
        });
        settings.bind(
            'enable-notifications',
            notificationRow,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );

        notificationGroup.add(notificationRow);

        page.add(contestsGroup);
        page.add(notificationGroup);
        window.add(page);
    }
}
