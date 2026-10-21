import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { CodeforcesApi } from './services/codeforcesUserService.js';
import { applyPendingSettings, discardPendingSettings } from './utils/generalPreferences.js';
import { buildPreferencesCss, getTheme, readAppearanceTheme, setAppearanceThemeDraft, THEMES } from './utils/themes.js';
import { hasFriend, normalizeFriends, normalizeHandle } from './utils/userProfile.js';

const MAX_FRIENDS = 10;

const CONTEST_SETTINGS = [
    ['show-div1', 'Division 1'],
    ['show-div2', 'Division 2'],
    ['show-div3', 'Division 3'],
    ['show-div4', 'Division 4'],
    ['show-educational', 'Educational rounds'],
    ['show-global', 'Global rounds'],
    ['show-other', 'Other or unclassified contests'],
];

const REMINDER_SETTINGS = [
    ['reminder-one-hour', 'One hour before'],
    ['reminder-fifteen-minutes', 'Fifteen minutes before'],
    ['reminder-at-start', 'At contest start'],
];

function buildThemeSwatch(theme) {
    const swatch = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        width_request: 112,
        height_request: 56,
        hexpand: false,
        valign: Gtk.Align.CENTER,
    });
    swatch.add_css_class('cf-theme-swatch');
    swatch.add_css_class(`cf-theme-swatch-${theme.id}`);
    swatch.update_property([Gtk.AccessibleProperty.LABEL], [`${theme.name} palette`]);

    const colors = ['surface', 'primary-accent', 'secondary-accent', 'primary-text'];
    for (const [index, color] of colors.entries()) {
        const dot = new Gtk.Box({
            width_request: 16,
            height_request: 16,
            hexpand: false,
            vexpand: false,
            valign: Gtk.Align.CENTER,
            margin_start: index === 0 ? 12 : 0,
            margin_end: index === colors.length - 1 ? 12 : 0,
        });
        dot.add_css_class('cf-theme-swatch-dot');
        dot.add_css_class(`cf-theme-swatch-dot-${color}`);
        swatch.append(dot);
    }

    return swatch;
}

export default class CFCompanionPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window.set_default_size(760, 680);
        let settings;
        let generalSettings;
        try {
            settings = this.getSettings();
            generalSettings = this.getSettings();
        } catch (error) {
            const page = new Adw.PreferencesPage();
            page.add(new Adw.PreferencesGroup({
                title: 'Settings unavailable',
                description: `CF Companion settings could not be loaded: ${error.message}`,
            }));
            window.add(page);
            return;
        }
        generalSettings.delay();

        const pages = {
            general: new Adw.PreferencesPage({ title: 'General', icon_name: 'preferences-system-symbolic', name: 'general' }),
            contests: new Adw.PreferencesPage({ title: 'Contests', icon_name: 'view-list-symbolic', name: 'contests' }),
            reminders: new Adw.PreferencesPage({ title: 'Reminders', icon_name: 'preferences-system-notifications-symbolic', name: 'reminders' }),
            account: new Adw.PreferencesPage({ title: 'Profile & Friends', icon_name: 'avatar-default-symbolic', name: 'profile-friends' }),
            appearance: new Adw.PreferencesPage({ title: 'Appearance', icon_name: 'applications-graphics-symbolic', name: 'appearance' }),
            integration: new Adw.PreferencesPage({ title: 'Integration', icon_name: 'network-server-symbolic', name: 'integration' }),
        };
        const themedSurfaces = [window, ...Object.values(pages)];
        for (const widget of themedSurfaces)
            widget.add_css_class('cf-companion-preferences');
        const styleProvider = new Gtk.CssProvider();
        let styleDisplay = null;
        try {
            styleProvider.load_from_string(buildPreferencesCss());
            styleDisplay = Gdk.Display.get_default();
            if (styleDisplay)
                Gtk.StyleContext.add_provider_for_display(styleDisplay, styleProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        } catch (error) {
            console.warn(`[CF Companion] Could not load preferences theme styles: ${error.message}`);
        }
        const updatePreferencesTheme = (source = settings) => {
            const currentTheme = readAppearanceTheme(source);
            for (const widget of themedSurfaces) {
                for (const theme of THEMES)
                    widget.remove_css_class(`theme-${theme.id}`);
                if (currentTheme !== 'system')
                    widget.add_css_class(`theme-${currentTheme}`);
            }
        };
        updatePreferencesTheme();
        const api = new CodeforcesApi();
        const cancellables = new Set();
        let closed = false;
        let discardConfirmed = false;
        let appliedMessage = '';
        const cleanup = () => {
            if (closed)
                return;
            closed = true;
            for (const cancellable of cancellables)
                cancellable.cancel();
            cancellables.clear();
            api.destroy();
            for (const [object, signal] of settingsSignals)
                object.disconnect(signal);
            for (const signal of generalSignals)
                generalSettings.disconnect(signal);
            if (styleDisplay) {
                Gtk.StyleContext.remove_provider_for_display(styleDisplay, styleProvider);
                styleDisplay = null;
            }
        };
        window.connect('destroy', cleanup);
        const settingsSignals = [];
        const generalSignals = [];
        const applyButtons = [];
        const discardButtons = [];
        const applyGroups = [];

        const updateApplyState = () => {
            const pending = generalSettings.get_has_unapplied();
            for (const button of [...applyButtons, ...discardButtons])
                button.sensitive = pending;
            const draftTheme = readAppearanceTheme(generalSettings);
            for (const button of applyButtons) {
                for (const theme of THEMES)
                    button.remove_css_class(`cf-apply-theme-${theme.id}`);
                button.add_css_class(`cf-apply-theme-${draftTheme}`);
                if (pending)
                    button.add_css_class('suggested-action');
                else
                    button.remove_css_class('suggested-action');
            }
            const description = pending
                ? 'You have unapplied contest, reminder, panel, or appearance changes.'
                : appliedMessage || 'Apply your changes while this window stays open.';
            for (const group of applyGroups)
                group.description = description;
        };
        const applyChanges = () => {
            try {
                applyPendingSettings(generalSettings, () => {
                    appliedMessage = 'Changes applied.';
                    updatePreferencesTheme(generalSettings);
                });
                updateApplyState();
            } catch (error) {
                appliedMessage = `Could not apply changes: ${error.message}`;
                updateApplyState();
            }
        };
        const discardChanges = () => {
            try {
                if (!discardPendingSettings(generalSettings, () => {
                    appliedMessage = 'Changes discarded.';
                    updatePreferencesTheme(settings);
                }))
                    return;
                updateApplyState();
            } catch (error) {
                appliedMessage = `Could not discard changes: ${error.message}`;
                updateApplyState();
            }
        };
        const addApplyControls = page => {
            const group = new Adw.PreferencesGroup();
            const row = new Adw.PreferencesRow();
            row.add_css_class('cf-preferences-actions-row');
            const actions = new Gtk.Box({ spacing: 8, halign: Gtk.Align.END, valign: Gtk.Align.CENTER });
            const discardButton = new Gtk.Button({ label: 'Discard', valign: Gtk.Align.CENTER, sensitive: false });
            const applyButton = new Gtk.Button({ label: 'Apply Changes', valign: Gtk.Align.CENTER, sensitive: false });
            applyButton.add_css_class('cf-apply-changes-button');
            discardButton.connect('clicked', discardChanges);
            applyButton.connect('clicked', applyChanges);
            actions.set_margin_top(8);
            actions.set_margin_bottom(8);
            actions.set_margin_end(8);
            actions.append(discardButton);
            actions.append(applyButton);
            row.set_child(actions);
            group.add(row);
            page.add(group);
            applyGroups.push(group);
            discardButtons.push(discardButton);
            applyButtons.push(applyButton);
        };
        for (const key of [
            ...CONTEST_SETTINGS.map(([setting]) => setting),
            ...REMINDER_SETTINGS.map(([setting]) => setting),
            'reminder-mode',
            'panel-display-mode',
            'appearance-theme',
        ]) {
            try {
                generalSignals.push(generalSettings.connect(`changed::${key}`, () => {
                    appliedMessage = '';
                    updateApplyState();
                }));
            } catch (_error) {
                // Keep the remaining preferences available if a key is missing.
            }
        }
        settingsSignals.push([settings, settings.connect('changed::appearance-theme', updatePreferencesTheme)]);

        window.connect('close-request', () => {
            if (generalSettings.get_has_unapplied() && !discardConfirmed) {
                const dialog = new Gtk.AlertDialog({
                    message: 'Discard unapplied changes?',
                    detail: 'Your contest, reminder, panel, and appearance edits have not been applied.',
                    buttons: ['Keep Editing', 'Discard Changes'],
                    cancel_button: 0,
                    default_button: 0,
                });
                dialog.choose(window, null, (alert, result) => {
                    let response;
                    try {
                        response = alert.choose_finish(result);
                    } catch (_error) {
                        return;
                    }
                    if (response === 1) {
                        discardPendingSettings(generalSettings, () => {
                            updatePreferencesTheme(settings);
                            appliedMessage = 'Changes discarded.';
                        });
                        updateApplyState();
                        discardConfirmed = true;
                        window.close();
                    }
                });
                return true;
            }
            cleanup();
            return false;
        });

        const setGroupStatus = (group, message, isError = false) => {
            group.description = message;
            if (isError)
                group.add_css_class('cf-status-error');
            else
                group.remove_css_class('cf-status-error');
        };
        const profileGroup = new Adw.PreferencesGroup({
            title: 'Codeforces profile',
            description: 'Validate a public Codeforces handle before saving it.',
        });
        const handleRow = new Adw.ActionRow({ title: 'Codeforces handle' });
        const handleEntry = new Gtk.Entry({
            text: this._readString(settings, 'codeforces-handle'),
            placeholder_text: 'Enter your handle',
            hexpand: true,
            valign: Gtk.Align.CENTER,
            max_length: 24,
        });
        const handleButton = new Gtk.Button({ label: 'Validate and Save', valign: Gtk.Align.CENTER });
        handleRow.add_suffix(handleEntry);
        handleRow.add_suffix(handleButton);
        handleRow.activatable_widget = handleEntry;
        profileGroup.add(handleRow);
        pages.account.add(profileGroup);

        const validateHandle = async () => {
            if (closed || !handleButton.sensitive)
                return;
            let handle;
            try {
                handle = normalizeHandle(handleEntry.text);
            } catch (error) {
                setGroupStatus(profileGroup, error.message, true);
                return;
            }
            const cancellable = new Gio.Cancellable();
            cancellables.add(cancellable);
            handleButton.sensitive = false;
            handleEntry.sensitive = false;
            setGroupStatus(profileGroup, `Checking ${handle} with Codeforces…`);
            try {
                const profile = await api.lookupUser(handle, cancellable);
                if (closed || cancellable.is_cancelled())
                    return;
                handleEntry.text = profile.handle;
                if (settings.is_writable('codeforces-handle')) {
                    settings.set_string('codeforces-handle', profile.handle);
                    setGroupStatus(profileGroup, `Validated and saved ${profile.handle}.`);
                } else {
                    setGroupStatus(profileGroup, 'Handle validated, but settings are not writable.', true);
                }
            } catch (error) {
                if (!closed && !cancellable.is_cancelled())
                    setGroupStatus(profileGroup, `Could not validate handle: ${error.message}`, true);
            } finally {
                cancellables.delete(cancellable);
                if (!closed) {
                    handleButton.sensitive = true;
                    handleEntry.sensitive = true;
                }
            }
        };
        handleButton.connect('clicked', validateHandle);
        handleEntry.connect('activate', validateHandle);
        settingsSignals.push([settings, settings.connect('changed::codeforces-handle', () => {
            if (!closed && !handleEntry.has_focus)
                handleEntry.text = this._readString(settings, 'codeforces-handle');
        })]);

        const friendsGroup = new Adw.PreferencesGroup({
            title: 'Friends',
            description: `Add up to ${MAX_FRIENDS} Codeforces handles. Each handle is checked before saving.`,
        });
        const friendEntryRow = new Adw.ActionRow({ title: 'Add a friend' });
        const friendEntry = new Gtk.Entry({
            placeholder_text: 'Enter a Codeforces handle',
            hexpand: true,
            valign: Gtk.Align.CENTER,
            max_length: 24,
        });
        const addFriendButton = new Gtk.Button({ label: 'Validate and Add', valign: Gtk.Align.CENTER });
        friendEntryRow.add_suffix(friendEntry);
        friendEntryRow.add_suffix(addFriendButton);
        friendEntryRow.activatable_widget = friendEntry;
        friendsGroup.add(friendEntryRow);
        const savedFriendsGroup = new Adw.PreferencesGroup({ title: 'Saved friends' });
        const friendRows = [];
        pages.account.add(friendsGroup);
        pages.account.add(savedFriendsGroup);

        const currentFriends = () => {
            try {
                return normalizeFriends(settings.get_strv('friends'));
            } catch (_error) {
                return [];
            }
        };
        const renderFriends = () => {
            if (closed)
                return;
            for (const row of friendRows)
                savedFriendsGroup.remove(row);
            friendRows.length = 0;
            for (const friend of currentFriends()) {
                const row = new Adw.ActionRow({ title: friend });
                const removeButton = new Gtk.Button({
                    label: 'Remove',
                    valign: Gtk.Align.CENTER,
                    tooltip_text: `Remove ${friend}`,
                });
                removeButton.connect('clicked', () => {
                    const friends = currentFriends().filter(value => value.toLowerCase() !== friend.toLowerCase());
                    if (!settings.is_writable('friends'))
                        setGroupStatus(friendsGroup, 'Settings are not writable; the friend was not removed.', true);
                    else
                        settings.set_strv('friends', friends);
                });
                row.add_suffix(removeButton);
                savedFriendsGroup.add(row);
                friendRows.push(row);
            }
            if (currentFriends().length === 0)
                savedFriendsGroup.description = 'No friends saved yet.';
            else
                savedFriendsGroup.description = `${currentFriends().length} of ${MAX_FRIENDS} friends saved.`;
        };
        const validateFriend = async () => {
            if (closed || !addFriendButton.sensitive)
                return;
            let handle;
            try {
                handle = normalizeHandle(friendEntry.text);
            } catch (error) {
                setGroupStatus(friendsGroup, error.message, true);
                return;
            }
            let friends = currentFriends();
            if (hasFriend(friends, handle)) {
                setGroupStatus(friendsGroup, `${handle} is already in your friends list.`);
                return;
            }
            if (friends.length >= MAX_FRIENDS) {
                setGroupStatus(friendsGroup, `You can save at most ${MAX_FRIENDS} friends.`, true);
                return;
            }

            const cancellable = new Gio.Cancellable();
            cancellables.add(cancellable);
            addFriendButton.sensitive = false;
            friendEntry.sensitive = false;
            setGroupStatus(friendsGroup, `Checking ${handle} with Codeforces…`);
            try {
                const profile = await api.lookupUser(handle, cancellable);
                if (closed || cancellable.is_cancelled())
                    return;
                friends = currentFriends();
                if (hasFriend(friends, profile.handle)) {
                    setGroupStatus(friendsGroup, `${profile.handle} is already in your friends list.`);
                    return;
                }
                if (friends.length >= MAX_FRIENDS) {
                    setGroupStatus(friendsGroup, `You can save at most ${MAX_FRIENDS} friends.`, true);
                    return;
                }
                friends.push(profile.handle);
                if (!settings.is_writable('friends')) {
                    setGroupStatus(friendsGroup, 'Friend validated, but settings are not writable.', true);
                    return;
                }
                settings.set_strv('friends', friends);
                friendEntry.text = '';
                setGroupStatus(friendsGroup, `Validated and added ${profile.handle}.`);
            } catch (error) {
                if (!closed && !cancellable.is_cancelled())
                    setGroupStatus(friendsGroup, `Could not validate friend: ${error.message}`, true);
            } finally {
                cancellables.delete(cancellable);
                if (!closed)
                    addFriendButton.sensitive = true;
                if (!closed)
                    friendEntry.sensitive = true;
            }
        };
        addFriendButton.connect('clicked', validateFriend);
        friendEntry.connect('activate', validateFriend);
        renderFriends();
        settingsSignals.push([settings, settings.connect('changed::friends', renderFriends)]);

        const contests = new Adw.PreferencesGroup({ title: 'Contest types' });
        for (const [key, title] of CONTEST_SETTINGS)
            contests.add(this._switchRow(generalSettings, key, title));
        pages.contests.add(contests);

        const reminders = new Adw.PreferencesGroup({ title: 'Reminders' });
        for (const [key, title] of REMINDER_SETTINGS)
            reminders.add(this._switchRow(generalSettings, key, title));
        pages.reminders.add(reminders);

        const reminderMode = new Adw.PreferencesGroup({
            title: 'Reminder mode',
            description: 'All contests is the default. Starred contests only skips regular reminders when nothing is starred; explicit Snooze 5 min actions still run.',
        });
        const reminderModeRow = new Adw.ComboRow({
            title: 'Send reminders for',
            subtitle: 'Star contests from the dropdown to manage them independently of reminder mode',
            model: Gtk.StringList.new(['All contests', 'Starred contests only']),
        });
        generalSettings.bind('reminder-mode', reminderModeRow, 'selected', Gio.SettingsBindFlags.DEFAULT);
        reminderMode.add(reminderModeRow);
        pages.reminders.add(reminderMode);

        const panel = new Adw.PreferencesGroup({ title: 'Panel display' });
        const panelMode = new Adw.ComboRow({
            title: 'Indicator content',
            subtitle: 'Choose what appears in the top panel',
            model: Gtk.StringList.new([
                'Default (CF and countdown)',
                'Countdown only',
                'Contest name and countdown',
            ]),
        });
        generalSettings.bind('panel-display-mode', panelMode, 'selected', Gio.SettingsBindFlags.DEFAULT);
        panel.add(panelMode);
        pages.general.add(panel);

        const appearanceHeader = new Adw.PreferencesGroup({
            title: 'Appearance',
            description: 'Changes apply to both the top bar dropdown and this settings window.',
        });
        pages.appearance.add(appearanceHeader);
        const appearance = new Adw.PreferencesGroup({ title: 'Themes' });
        const themeRows = new Map();
        const themeChecks = new Map();
        let firstThemeCheck = null;
        let syncingThemeChecks = false;
        for (const theme of THEMES) {
            const row = new Adw.ActionRow({ title: theme.name, subtitle: theme.subtitle });
            const swatch = buildThemeSwatch(theme);
            row.add_prefix(swatch);
            const check = new Gtk.CheckButton({ valign: Gtk.Align.CENTER });
            check.accessible_role = Gtk.AccessibleRole.RADIO;
            check.update_property([Gtk.AccessibleProperty.LABEL], [`${theme.name} colour theme`]);
            if (firstThemeCheck)
                check.set_group(firstThemeCheck);
            else
                firstThemeCheck = check;
            row.add_suffix(check);
            row.activatable_widget = check;
            check.connect('toggled', () => {
                if (syncingThemeChecks || !check.active || closed)
                    return;
                appliedMessage = '';
                if (!setAppearanceThemeDraft(generalSettings, theme.id))
                    setGroupStatus(appearance, 'Theme settings are not writable; the selection was not saved.', true);
                updateApplyState();
            });
            themeRows.set(theme.id, row);
            themeChecks.set(theme.id, check);
            appearance.add(row);
        }
        const syncDraftTheme = () => {
            const draftTheme = readAppearanceTheme(generalSettings);
            syncingThemeChecks = true;
            for (const theme of THEMES) {
                themeChecks.get(theme.id).active = theme.id === draftTheme;
                const row = themeRows.get(theme.id);
                row.remove_css_class('cf-theme-row-selected');
                for (const candidate of THEMES)
                    row.remove_css_class(`cf-theme-row-selected-${candidate.id}`);
            }
            const selectedRow = themeRows.get(draftTheme) ?? themeRows.get('system');
            if (selectedRow) {
                selectedRow.add_css_class('cf-theme-row-selected');
                selectedRow.add_css_class(`cf-theme-row-selected-${draftTheme}`);
            }
            setGroupStatus(appearance, generalSettings.get_has_unapplied()
                ? `${getTheme(draftTheme).name} is selected as a draft. Apply Changes to update the dropdown and this window.`
                : `${getTheme(draftTheme).name} is active on the dropdown and this window.`);
            syncingThemeChecks = false;
        };
        generalSignals.push(generalSettings.connect('changed::appearance-theme', syncDraftTheme));
        syncDraftTheme();

        pages.appearance.add(appearance);

        const telegram = new Adw.PreferencesGroup({ title: 'Telegram' });
        const row = new Adw.ActionRow({ title: 'Connect Telegram' });
        const button = new Gtk.Button({ label: 'Connect Telegram', valign: Gtk.Align.CENTER });
        const explanation = new Gtk.Label({
            label: 'Telegram integration is under development and coming soon.',
            wrap: true,
            visible: false,
            xalign: 0,
        });
        button.connect('clicked', () => {
            explanation.visible = true;
        });
        row.add_suffix(button);
        row.activatable_widget = button;
        telegram.add(row);
        const explanationRow = new Adw.PreferencesRow();
        explanationRow.set_child(explanation);
        telegram.add(explanationRow);
        pages.integration.add(telegram);

        for (const page of Object.values(pages))
            addApplyControls(page);

        updateApplyState();
        for (const page of Object.values(pages))
            window.add(page);
    }

    _readString(settings, key) {
        try {
            return settings.get_string(key);
        } catch (_error) {
            return '';
        }
    }

    _switchRow(settings, key, title) {
        const row = new Adw.SwitchRow({ title });
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }
}
