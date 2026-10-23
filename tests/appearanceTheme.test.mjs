import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applyPendingSettings, discardPendingSettings } from '../extension/prefs/generalSettings.js';
import { urgencyClass } from '../extension/utils/time.js';
import {
    buildPreferencesCss,
    buildShellThemeCss,
    DEFAULT_THEME,
    getTheme,
    normalizeThemeId,
    readAppearanceTheme,
    setAppearanceThemeDraft,
    THEMES,
} from '../extension/utils/themes.js';

const extensionDirectory = new URL('../extension/', import.meta.url);
const panelSource = readFileSync(new URL('ui/panel.js', extensionDirectory), 'utf8');
const prefsSource = readFileSync(new URL('prefs.js', extensionDirectory), 'utf8');
const stylesheet = readFileSync(new URL('stylesheet.css', extensionDirectory), 'utf8');
const schema = readFileSync(new URL('schemas/org.gnome.shell.extensions.cf-companion.gschema.xml', extensionDirectory), 'utf8');
const codeforcesIcon = readFileSync(new URL('icons/codeforces.svg', extensionDirectory), 'utf8');
const codeforcesInverseIcon = readFileSync(new URL('icons/codeforces-inverse.svg', extensionDirectory), 'utf8');
assert.match(codeforcesIcon, /fill="#1F8ACB"/,
    'GNOME Default uses the bundled blue Codeforces brand mark');
assert.match(codeforcesInverseIcon, /fill="#F1F0F7"/,
    'custom themes use a light Codeforces mark visible on dark surfaces');
assert.match(panelSource, /Gio\.FileIcon\.new\([\s\S]*icons\/codeforces\.svg/,
    'the panel loads its Codeforces mark from a bundled local asset');
assert.match(panelSource, /text: '<\/>'[\s\S]*style_class: 'cf-profile-brand-code'/,
    'the profile tile uses the compact code glyph');
assert.match(panelSource, /style_class: 'cf-profile-brand-code',[\s\S]*x_expand: true,[\s\S]*y_expand: true,[\s\S]*x_align: Clutter\.ActorAlign\.CENTER,[\s\S]*y_align: Clutter\.ActorAlign\.CENTER/,
    'the code glyph fills the profile tile and centers on both axes');
assert.match(panelSource, /vertical: true,[\s\S]*x_expand: true,[\s\S]*y_align: Clutter\.ActorAlign\.CENTER/,
    'the handle and rank block is vertically centered against the profile tile');
assert.match(panelSource, /this\._codeforcesToolbarIcon\.gicon = codeforcesIcon/,
    'the Codeforces logo remains in the bottom toolbar');
assert.match(panelSource, /themeId === 'system' \? this\._codeforcesIcon : this\._codeforcesInverseIcon/,
    'the toolbar selects a contrasting Codeforces mark for each palette family');
assert.match(stylesheet, /\.cf-contest-expand-button \{ padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 500; \}/,
    'View all uses a slightly larger, still compact label and hit target');
assert.match(panelSource, /view-refresh-symbolic/);
assert.match(panelSource, /preferences-system-symbolic/);
assert.doesNotMatch(prefsSource, /icons\/codeforces(?:-inverse)?\.svg/,
    'Appearance swatches contain no miniature logo assets');
assert.doesNotMatch(prefsSource, /new URL\(/,
    'preferences asset loading does not rely on the browser URL global');

assert.equal(DEFAULT_THEME, 'orbit');
assert.equal(readAppearanceTheme(null), 'orbit', 'a missing settings object safely keeps Orbit as the saved fallback');
assert.throws(() => readAppearanceTheme({ get_string: () => { throw new Error('missing key'); } }), /missing key/,
    'unexpected GSettings read errors are not hidden');
assert.equal(normalizeThemeId('invalid'), 'orbit', 'an invalid saved ID safely falls back to Orbit');
assert.equal(readAppearanceTheme({ get_string: () => 'invalid' }), 'orbit',
    'an invalid stored theme safely falls back to Orbit');
assert.match(prefsSource, /window\.set_default_size\(760, 680\)/,
    'the native preferences window requests the roomier concept size');
assert.match(prefsSource, /title: 'Appearance',\s*description: 'Changes apply to both the top bar dropdown and this settings window\.'/,
    'Appearance has its own page heading and supporting description');
assert.match(prefsSource, /discardPendingSettings\(generalSettings/,
    'the visible Discard action reverts the pending GSettings draft');
assert.match(prefsSource, /label: 'Discard'/);
assert.match(prefsSource, /label: 'Apply Changes'/);
assert.match(prefsSource, /for \(const page of Object\.values\(pages\)\)\s*addApplyControls\(page\)/,
    'each standard preferences page ends with Discard and Apply Changes controls');
assert.match(prefsSource, /halign: Gtk\.Align\.END/,
    'the page action buttons align to the right');
assert.match(prefsSource, /cf-apply-theme-\$\{theme\.id\}/,
    'the enabled Apply Changes button follows the selected theme accent');
assert.equal(urgencyClass(48 * 3600), 'cf-countdown-normal',
    'long-range countdowns are normal themed text rather than green urgency');
assert.match(schema, /<key name="appearance-theme" type="s">\s*<default>'orbit'<\/default>/,
    'Orbit remains the GSettings default for existing installations and unset values');

assert.deepEqual(THEMES.map(theme => theme.id), ['system', 'orbit', 'slate', 'sage', 'ember']);
assert.equal(getTheme('system')?.name, 'GNOME Default');
assert.equal(getTheme('system')?.subtitle, 'Follow the system GNOME appearance.');
for (const theme of THEMES) {
    assert.equal(getTheme(theme.id), theme);
    for (const token of [
        'background', 'surface', 'secondarySurface', 'rowBackground', 'surfaceHover',
        'primaryAccent', 'secondaryAccent', 'primaryText', 'secondaryText',
        'disabledText', 'separator',
    ])
        assert.match(theme[token], /^#[0-9A-F]{6}$/i, `${theme.id}.${token} is a valid hex color`);
}
const channelLuminance = value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};
const luminance = color => {
    const hex = color.slice(1);
    return 0.2126 * channelLuminance(hex.slice(0, 2)) +
        0.7152 * channelLuminance(hex.slice(2, 4)) +
        0.0722 * channelLuminance(hex.slice(4, 6));
};
const contrast = (foreground, background) => {
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
};
const rankTints = ['#A1A1A8', '#55CE7B', '#25C5B8', '#68A5FF', '#D391F4', '#FFA447', '#FF7272'];
for (const theme of THEMES) {
    if (theme.id === 'system') {
        assert.ok(theme.background, `${theme.id} has a neutral background`);
        assert.ok(theme.primaryText, `${theme.id} has a readable primary text color`);
        continue;
    }
    for (const token of ['primaryAccent', 'secondaryAccent', 'primaryText', 'secondaryText'])
        assert.ok(contrast(theme[token], theme.background) >= 4.5,
            `${theme.id}.${token} has readable contrast against its background`);
    assert.ok(contrast(theme.primaryText, theme.surface) >= 4.5,
        `${theme.id} tooltip text has readable contrast against its raised surface`);
    assert.ok(contrast(theme.primaryText, theme.rowBackground) >= 4.5,
        `${theme.id} contest names have readable contrast against contest rows`);
    assert.ok(contrast(theme.secondaryText, theme.secondarySurface) >= 4.5,
        `${theme.id} secondary text has readable contrast against secondary surfaces`);
    for (const rankColor of rankTints)
        assert.ok(contrast(rankColor, theme.background) >= 4.5,
            `${rankColor} rank tint remains readable on ${theme.id}`);
}

class DelayedSettingsMock {
    constructor() {
        this.saved = 'orbit';
        this.draft = this.saved;
    }

    get_string(key) {
        assert.equal(key, 'appearance-theme');
        return this.draft;
    }

    is_writable(key) {
        return key === 'appearance-theme';
    }

    set_string(key, value) {
        assert.equal(key, 'appearance-theme');
        this.draft = value;
        return true;
    }

    get_has_unapplied() {
        return this.draft !== this.saved;
    }

    apply() {
        this.saved = this.draft;
    }

    revert() {
        this.draft = this.saved;
    }
}

const settings = new DelayedSettingsMock();
assert.equal(setAppearanceThemeDraft(settings, 'sage'), true);
assert.equal(settings.get_has_unapplied(), true, 'theme selection creates a pending Apply Changes edit');
assert.equal(settings.saved, 'orbit', 'selecting a theme does not save before Apply Changes');
let runtimeTheme = 'orbit';
assert.equal(applyPendingSettings(settings, () => {
    runtimeTheme = readAppearanceTheme(settings);
}), true);
assert.equal(settings.saved, 'sage');
assert.equal(runtimeTheme, 'sage', 'applying a pending theme immediately updates its runtime consumer');
assert.equal(settings.get_has_unapplied(), false);

assert.equal(setAppearanceThemeDraft(settings, 'ember'), true);
assert.equal(discardPendingSettings(settings), true, 'Discard reverts unapplied preference edits');
assert.equal(readAppearanceTheme(settings), 'sage', 'discarding pending changes restores the saved theme');
assert.equal(settings.get_has_unapplied(), false);
assert.equal(discardPendingSettings(settings), false, 'Discard is a no-op without a pending edit');

const begin = '/* BEGIN GENERATED THEME RULES */';
const end = '/* END GENERATED THEME RULES */';
const start = stylesheet.indexOf(begin) + begin.length;
const finish = stylesheet.indexOf(end);
assert.ok(start >= begin.length && finish > start, 'generated Shell theme section has ordered markers');
assert.equal(stylesheet.slice(start, finish).trim(), buildShellThemeCss().trim(),
    'the Shell stylesheet is generated from the shared palette definition');
assert.match(buildPreferencesCss(), /cf-theme-swatch-system/);
assert.match(buildPreferencesCss(), /\.cf-theme-row-selected-system \{\s*background-color: alpha\(@theme_selected_bg_color, 0\.12\);\s*border: 2px solid @theme_selected_bg_color;/,
    'GNOME Default selection follows the system accent instead of a fixed theme color');
assert.match(buildPreferencesCss(), /theme-orbit/);
assert.match(buildPreferencesCss(), /theme-slate/);
assert.match(buildPreferencesCss(), /theme-sage/);
assert.match(buildPreferencesCss(), /theme-ember/);
assert.match(buildShellThemeCss(), /\.cf-companion-menu\.cf-theme-system \.popup-menu-item:hover/,
    'GNOME Default receives the shared interaction highlight without a popup surface override');
assert.doesNotMatch(buildShellThemeCss(), /\.cf-companion-menu\.cf-theme-system \{/,
    'GNOME Default keeps the native popup surface');
assert.doesNotMatch(buildShellThemeCss(), /cf-urgency-green/,
    'normal long-range countdowns do not use a hard-coded green urgency class');
assert.match(buildShellThemeCss(), /\.cf-profile-row\.cf-profile-theme-system \{\s*background-color: transparent;\s*border: none;/,
    'GNOME Default profile card follows the native Shell surface in light and dark modes');
assert.match(buildShellThemeCss(), /\.cf-profile-row\.cf-profile-theme-system \.cf-profile-brand \{[\s\S]*?background-color: rgba\(153, 180, 255, 0\.16\);[\s\S]*?border: 1px solid rgba\(153, 180, 255, 0\.2\);/,
    'GNOME Default brand tile uses a softened shared-palette accent');
assert.match(buildShellThemeCss(), /\.cf-profile-row\.cf-profile-theme-system \.cf-profile-brand-code \{\s*color: inherit;\s*font-size: 16px;/,
    'GNOME Default code mark inherits the native foreground color');
assert.match(buildShellThemeCss(), /\.cf-contest-accent-strip\.cf-contest-accent-theme-system \{\s*background-color: #99b4ff;/,
    'contest strip colors come from the active theme');
assert.doesNotMatch(buildShellThemeCss(), /\.cf-contest-row\.cf-contest-theme-system[^}]*border-left/,
    'contest rows no longer simulate the strip with a border');
assert.match(buildShellThemeCss(), /\.popup-menu-item:hover,[\s\S]*?background-color: rgba\(153, 180, 255, 0\.15\);/,
    'menu hover uses a faint primary-accent fill');
assert.match(panelSource, /_enableKeyboardMenuFocus\(\)[\s\S]*key-press-event[\s\S]*motion-event/,
    'keyboard focus styling is enabled by keyboard navigation and cleared by pointer movement');
assert.match(panelSource, /actor\.disconnect\(signal\)/,
    'menu input signal handlers are disconnected during indicator destruction');
assert.match(panelSource, /open-state-changed'[\s\S]*_setKeyboardMenuFocus\(false\)/,
    'opening the menu clears keyboard-only focus styling from a previous session');
assert.match(buildPreferencesCss(), /cf-theme-swatch-system \{\s*background-color: #1a1b1f;[\s\S]*?border: 1px solid #3a3d46;/,
    'GNOME Default swatch uses its themes.js palette entry');
assert.doesNotMatch(buildPreferencesCss(), /\.theme-system preferencespage/,
    'GNOME Default preferences do not override the system appearance');
assert.match(prefsSource, /row\.add_prefix\(swatch\)/,
    'the palette swatch sits before the theme name and description');
assert.doesNotMatch(prefsSource, /row\.add_suffix\(swatch\)/,
    'the swatch does not push the theme description out of the expanding title column');
assert.match(buildShellThemeCss(), /\.popup-menu-boxpointer \{\s*background-color: transparent;[\s\S]*?border: none;/,
    'the popup pointer/root does not draw a second border around the content surface');
assert.doesNotMatch(buildShellThemeCss(), /cf-rank-/, 'theme decoration does not override Codeforces rank classes');
assert.match(buildShellThemeCss(), /\.popup-menu-icon \{\s*color: #[0-9A-F]{6};/,
    'native menu icons receive the active palette accent');
assert.match(panelSource, /style_class: 'popup-menu-icon cf-action-toolbar-icon',[\s\S]*icon_size: 16,[\s\S]*y_align: Clutter\.ActorAlign\.CENTER/,
    'toolbar icons share a fixed size and vertical alignment');
assert.doesNotMatch(buildShellThemeCss(), /cf-codeforces-toolbar-icon/,
    'the Codeforces toolbar icon has no unique framed tile');
for (const theme of THEMES) {
    const css = buildShellThemeCss();
    const idleRowRule = css.match(
        new RegExp(`\\.cf-contest-row-layout\\.cf-contest-theme-${theme.id} \\{([^}]*)\\}`)
    )?.[1] ?? '';
    assert.match(idleRowRule, /background-color: transparent;/,
        `${theme.id} contest rows are transparent when idle`);
    const stripRule = css.match(
        new RegExp(`\\.cf-contest-accent-strip\\.cf-contest-accent-theme-${theme.id} \\{([^}]*)\\}`)
    )?.[1] ?? '';
    assert.ok(stripRule.includes(`background-color: ${theme.primaryAccent};`),
        `${theme.id} contest strips use the primary accent`);
    assert.doesNotMatch(stripRule, /opacity:/,
        `${theme.id} strip visibility is controlled by row interaction state`);
    assert.ok(css.includes(
        `.cf-companion-menu.cf-theme-${theme.id} .cf-contest-row-item:hover .cf-contest-row-layout.cf-contest-theme-${theme.id}`
    ) && css.includes(
        `.cf-companion-menu.cf-theme-${theme.id}.cf-keyboard-navigation .cf-contest-row-item:focus .cf-contest-row-layout.cf-contest-theme-${theme.id}`
    ), `${theme.id} tints rows on hover and keyboard focus`);
}
for (const theme of THEMES) {
    assert.ok(buildShellThemeCss().includes(
        `.cf-companion-menu.cf-theme-${theme.id} .cf-friend-row .cf-friend-handle {\n    color: ${theme.primaryText};\n    font-weight: 700;`),
    `${theme.id} friend handles use bold primary text`);
}
for (const theme of THEMES) {
    if (theme.id === 'system') {
        assert.ok(buildShellThemeCss().includes(
            `.cf-companion-menu.cf-theme-system .cf-action-toolbar-row.cf-action-toolbar-theme-system {\n    background-color: transparent;\n    border: none;\n    border-radius: 12px;\n    padding: 4px;`),
        'GNOME Default toolbar follows the native Shell surface');
    } else {
        assert.ok(buildShellThemeCss().includes(
            `.cf-companion-menu.cf-theme-${theme.id} .cf-action-toolbar-row.cf-action-toolbar-theme-${theme.id} {\n    background-color: ${theme.secondarySurface};\n    border: 1px solid ${theme.separator};\n    border-radius: 12px;\n    padding: 4px;`),
        `${theme.id} toolbar uses its theme surface and separator border`);
    }
    assert.ok(buildShellThemeCss().includes(
        `.cf-companion-menu.cf-theme-${theme.id} .cf-action-toolbar-button:hover`),
    `${theme.id} toolbar buttons have themed hover states`);
}

const preferencesCss = buildPreferencesCss();
assert.match(preferencesCss, /min-width: 112px;\s*min-height: 56px/,
    'theme swatches use the compact requested dimensions');
for (const theme of THEMES) {
    if (theme.id !== 'system') {
        assert.ok(preferencesCss.includes(
            `.cf-companion-preferences .cf-theme-row-selected-${theme.id} {\n    background-color: rgba(`),
        `${theme.id} selected theme row uses a faint generated accent fill`);
    }
    assert.ok(preferencesCss.includes(
        `.cf-companion-preferences .cf-apply-changes-button.cf-apply-theme-${theme.id}.suggested-action`),
    `${theme.id} enabled apply button uses its generated accent`);
}
for (const theme of THEMES) {
    if (theme.id === 'system') {
        assert.match(stylesheet, /cf-companion-menu\.cf-theme-system \.popup-menu-item:hover/);
        assert.doesNotMatch(preferencesCss, /\.theme-system preferencespage/);
        continue;
    }
    assert.match(stylesheet, new RegExp(`cf-panel-label\\.cf-theme-${theme.id}`));
    assert.match(stylesheet, new RegExp(`cf-companion-menu\\.cf-theme-${theme.id} \\.popup-menu-content`),
        'the active palette styles the actual GNOME popup content surface');
    assert.match(stylesheet, new RegExp(`cf-action-tooltip\\.cf-theme-${theme.id}`));
    assert.match(preferencesCss, new RegExp(`cf-companion-preferences\\.theme-${theme.id} preferencespage`),
        'the active palette styles preferences pages');
    assert.match(preferencesCss, new RegExp(`cf-companion-preferences\\.theme-${theme.id} headerbar`),
        'the active palette styles the preferences headerbar');
    assert.match(preferencesCss, new RegExp(`cf-companion-preferences\\.theme-${theme.id} list\\.boxed-list`),
        'the active palette styles Adwaita preference cards');
    assert.match(preferencesCss, new RegExp(`cf-companion-preferences\\.theme-${theme.id} toolbarview`),
        'the active palette styles the preferences content surface');
    assert.ok(preferencesCss.includes(
        `.cf-companion-preferences .cf-theme-swatch-${theme.id} {\n    background-color: ${theme.background};\n    border: 1px solid ${theme.separator};`),
    `${theme.name} swatch background and border come from themes.js`);
    for (const [dot, color] of [
        ['surface', theme.surface],
        ['primary-accent', theme.primaryAccent],
        ['secondary-accent', theme.secondaryAccent],
        ['primary-text', theme.primaryText],
    ]) {
        assert.ok(preferencesCss.includes(
            `.cf-companion-preferences .cf-theme-swatch-${theme.id} .cf-theme-swatch-dot-${dot} {\n    background-color: ${color};`),
        `${theme.name} swatch includes ${dot} in the requested dot order`);
    }
    assert.ok(buildShellThemeCss().includes(
        `.cf-companion-menu.cf-theme-${theme.id} .cf-contest-name {\n    color: ${theme.primaryText};`),
    `${theme.id} contest titles retain the palette's primary text color`);
    if (theme.id !== 'system') {
        assert.ok(buildShellThemeCss().includes(
            `.cf-companion-menu.cf-theme-${theme.id} .cf-contest-countdown.cf-countdown-normal { color: ${theme.primaryAccent}; }`),
        `${theme.id} long-range countdowns use the selected primary accent`);
    } else {
        assert.doesNotMatch(buildShellThemeCss(), /cf-theme-system.*cf-countdown-normal/,
            'GNOME Default inherits native countdown text styling');
    }
}
assert.match(preferencesCss, /button\.suggested-action/,
    'pending Apply Changes uses the themed suggested-action style');
assert.match(preferencesCss, /cf-theme-swatch-slate \.cf-theme-swatch-dot-secondary-accent/,
    'Slate swatch palette is independent of the active preferences theme');
assert.match(panelSource, /changed::appearance-theme/,
    'the running extension applies a persisted theme change without rebuilding the menu');
assert.match(panelSource, /_applyTheme\(this\._activeTheme\)/);
assert.match(prefsSource, /setAppearanceThemeDraft\(generalSettings, theme\.id\)/,
    'theme choices use the delayed general Apply Changes settings object');
assert.match(prefsSource, /function buildThemeSwatch\(theme\)/,
    'theme options render a simple GTK palette swatch');
assert.match(prefsSource, /orientation: Gtk\.Orientation\.HORIZONTAL,[\s\S]*spacing: 8,[\s\S]*width_request: 112,[\s\S]*height_request: 56/,
    'swatches use the requested dimensions and dot spacing');
assert.match(prefsSource, /width_request: 16,[\s\S]*height_request: 16/,
    'each swatch dot is 16px');
assert.match(prefsSource, /swatch\.update_property\(\[Gtk\.AccessibleProperty\.LABEL\]/,
    'each swatch has an accessible palette label');
assert.match(prefsSource, /const colors = \['surface', 'primary-accent', 'secondary-accent', 'primary-text'\]/,
    'dots are created in surface, primary accent, secondary accent, primary text order');
assert.match(prefsSource, /margin_start: index === 0 \? 12 : 0,[\s\S]*margin_end: index === colors\.length - 1 \? 12 : 0/,
    'the dot row is centered horizontally inside the swatch');
assert.doesNotMatch(prefsSource, /buildThemePreview|cf-preview-|codeforcesIconPath|codeforcesInverseIconPath/,
    'old mini-preview markup and its icon dependencies are removed');
assert.doesNotMatch(preferencesCss, /cf-theme-preview|cf-preview-/,
    'no unused mini-preview rules remain in generated preferences CSS');
for (const theme of THEMES)
    assert.match(preferencesCss, new RegExp(`cf-theme-swatch-${theme.id}`),
        `${theme.name} swatch uses its own palette`);
assert.match(prefsSource, /generalSignals\.push\(generalSettings\.connect\('changed::appearance-theme'/,
    'reverting a draft resynchronizes the selected theme control');
assert.match(prefsSource, /settings\.connect\('changed::appearance-theme', updatePreferencesTheme\)/,
    'applying a theme updates the open preferences window');
assert.match(prefsSource, /updatePreferencesTheme\(generalSettings\)/,
    'Apply Changes restyles the open preferences window from the saved theme');
assert.match(prefsSource, /window\.connect\('destroy', cleanup\)/,
    'the preferences CSS provider is removed when the window is destroyed');
assert.match(prefsSource, /Gtk\.StyleContext\.remove_provider_for_display/,
    'the display-scoped CSS provider has a matching cleanup path');
assert.match(prefsSource, /add_css_class\('suggested-action'\)/,
    'pending general preference edits mark Apply Changes as suggested');
assert.match(prefsSource, /themedSurfaces/,
    'theme classes are applied to the preferences window and its pages');
assert.doesNotMatch(prefsSource, /cf-appearance-preview|Selected theme preview/,
    'the unrelated standalone preview row is removed');
assert.match(prefsSource, /widget\.add_css_class\('cf-companion-preferences'\)/,
    'preferences styles are scoped to the extension window and pages');
assert.doesNotMatch(prefsSource, /Upcoming Contest · LIVE|Ends in 00:/,
    'the appearance preview does not present fabricated live contest data');
assert.match(prefsSource, /settings\.set_string\('codeforces-handle'/,
    'profile validation keeps saving immediately and independently');
assert.match(prefsSource, /settings\.set_strv\('friends'/,
    'friend management keeps saving immediately and independently');
assert.match(panelSource, /cf-panel-urgent/);
assert.match(panelSource, /rankStyleClass\(friend\.rank\)/);
assert.match(panelSource, /_scheduleCountdownTick\(\);[\s\S]*this\._syncContestRows\(/,
    'theme application does not introduce timers or interrupt live/countdown updates');
assert.doesNotMatch(panelSource, /_statsItem|_featuredItem|cf-contest-timeline|cf-console-featured/,
    'the real panel contains no stats strip, duplicate featured contest, or timeline connector');
assert.match(panelSource, /cf-contest-row-priority/,
    'the existing first-upcoming contest priority marker is retained without idle row highlighting');
assert.doesNotMatch(panelSource, /cf-contest-row-featured|cf-console|_updateConsoleStats|_updateFeaturedContest/,
    'the current dropdown has no remnants of the old featured-card experiment');
assert.match(panelSource, /_friendsSubmenu[\s\S]*_contestHeader[\s\S]*_contestSection/,
    'the collapsed Friends submenu precedes the single contest list');
assert.doesNotMatch(panelSource, /set_tooltip_text/,
    'Shell controls avoid the unsupported St.Button tooltip method');

console.log('appearance theme tests passed');
