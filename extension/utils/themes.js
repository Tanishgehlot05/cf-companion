export const DEFAULT_THEME = 'orbit';

export const THEMES = Object.freeze([
    Object.freeze({
        id: 'system',
        name: 'GNOME Default',
        subtitle: 'Follow the system GNOME appearance.',
        background: '#1a1b1f',
        surface: '#2d2f36',
        secondarySurface: '#212325',
        rowBackground: '#202228',
        surfaceHover: '#363a43',
        primaryAccent: '#99b4ff',
        secondaryAccent: '#7dd3fc',
        primaryText: '#f5f5f5',
        secondaryText: '#d0d4db',
        disabledText: '#8b90a0',
        separator: '#3a3d46',
        onlineAccent: '#55CE7B',
    }),
    Object.freeze({
        id: 'orbit',
        name: 'Orbit',
        subtitle: 'Graphite with muted violet and soft cyan accents.',
        background: '#1F212B',
        surface: '#292A35',
        secondarySurface: '#242731',
        rowBackground: '#232630',
        surfaceHover: '#343640',
        primaryAccent: '#A99AF4',
        secondaryAccent: '#74C9C1',
        primaryText: '#F1F0F7',
        secondaryText: '#A7A9B7',
        disabledText: '#7A7D8C',
        separator: '#3B3E4B',
        onlineAccent: '#55CE7B',
    }),
    Object.freeze({
        id: 'slate',
        name: 'Slate',
        subtitle: 'Cool blue-grey with a quiet, professional feel.',
        background: '#20262D',
        surface: '#2A3139',
        secondarySurface: '#232B33',
        rowBackground: '#232C34',
        surfaceHover: '#394954',
        primaryAccent: '#93AFD6',
        secondaryAccent: '#AFC4D8',
        primaryText: '#EEF4F8',
        secondaryText: '#A2AFBA',
        disabledText: '#758392',
        separator: '#404C58',
        onlineAccent: '#55CE7B',
    }),
    Object.freeze({
        id: 'sage',
        name: 'Sage',
        subtitle: 'Subtle sage green with a soft olive accent.',
        background: '#202620',
        surface: '#2A332A',
        secondarySurface: '#232C25',
        rowBackground: '#232B26',
        surfaceHover: '#3A4640',
        primaryAccent: '#9ABDA4',
        secondaryAccent: '#C9D7A7',
        primaryText: '#EEF2EA',
        secondaryText: '#A8B0A1',
        disabledText: '#788575',
        separator: '#3F4C41',
        onlineAccent: '#55CE7B',
    }),
    Object.freeze({
        id: 'ember',
        name: 'Ember',
        subtitle: 'Warm charcoal with muted amber and terracotta.',
        background: '#28231F',
        surface: '#332B26',
        secondarySurface: '#2B2522',
        rowBackground: '#2A2522',
        surfaceHover: '#433731',
        primaryAccent: '#D7AF7E',
        secondaryAccent: '#C78D78',
        primaryText: '#F3EEE8',
        secondaryText: '#B5A699',
        disabledText: '#857A6E',
        separator: '#4B3E35',
        onlineAccent: '#55CE7B',
    }),
]);

const THEMES_BY_ID = new Map(THEMES.map(theme => [theme.id, theme]));

function colorWithAlpha(hex, alpha) {
    const value = hex.slice(1);
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function normalizeThemeId(value) {
    if (typeof value !== 'string')
        return DEFAULT_THEME;
    return THEMES_BY_ID.has(value) ? value : DEFAULT_THEME;
}

export function getTheme(value) {
    return THEMES_BY_ID.get(normalizeThemeId(value));
}

export function readAppearanceTheme(settings) {
    try {
        return normalizeThemeId(settings?.get_string('appearance-theme'));
    } catch (_error) {
        return DEFAULT_THEME;
    }
}

export function setAppearanceThemeDraft(settings, value) {
    const themeId = normalizeThemeId(value);
    try {
        if (!settings?.is_writable('appearance-theme'))
            return false;
        return settings.set_string('appearance-theme', themeId);
    } catch (_error) {
        return false;
    }
}

export function buildShellThemeCss() {
    const profileCardRules = THEMES.map(theme => `
.cf-profile-row.cf-profile-theme-${theme.id} {
    background-color: ${theme.surface};
    border: 1px solid ${theme.separator};
    border-radius: 14px;
    padding: 10px 12px;
}

.cf-profile-row.cf-profile-theme-${theme.id} .cf-profile-brand {
    background-color: ${colorWithAlpha(theme.primaryAccent, 0.2)};
    border: 1px solid ${colorWithAlpha(theme.primaryAccent, 0.32)};
    border-radius: 10px;
    padding: 0;
}

.cf-profile-row.cf-profile-theme-${theme.id} .cf-profile-brand-code {
    color: ${theme.primaryAccent};
    font-size: 17px;
    font-weight: 700;
}

.cf-profile-row.cf-profile-theme-${theme.id} .cf-profile-indicator {
    color: ${theme.disabledText};
}

.cf-profile-row.cf-profile-theme-${theme.id} .cf-profile-indicator-online {
    color: ${theme.onlineAccent};
}

.cf-profile-row.cf-profile-theme-${theme.id} .cf-profile-chevron {
    color: ${theme.secondaryText};
}
`).join('\n');

    const friendHandleRules = THEMES.map(theme => `
.cf-companion-menu.cf-theme-${theme.id} .cf-friend-row .cf-friend-handle {
    color: ${theme.primaryText};
    font-weight: 700;
}
`).join('\n');

    const contestRowRules = THEMES.map(theme => `
.cf-contest-row.cf-contest-theme-${theme.id} {
    background-color: transparent;
    border-radius: 12px;
    padding: 10px 12px;
}

.cf-contest-row.cf-contest-theme-${theme.id}.cf-contest-row-priority {
    border-left: 3px solid ${theme.primaryAccent};
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-row-item:hover .cf-contest-row.cf-contest-theme-${theme.id},
.cf-companion-menu.cf-theme-${theme.id}.cf-keyboard-navigation .cf-contest-row-item:focus .cf-contest-row.cf-contest-theme-${theme.id},
.cf-companion-menu.cf-theme-${theme.id} .cf-contest-row-item:active .cf-contest-row.cf-contest-theme-${theme.id} {
    background-color: ${colorWithAlpha(theme.primaryAccent, 0.15)};
}
`).join('\n');

    const toolbarRules = THEMES.map(theme => `
.cf-companion-menu.cf-theme-${theme.id} .cf-action-toolbar-row.cf-action-toolbar-theme-${theme.id} {
    background-color: ${theme.secondarySurface};
    border: 1px solid ${theme.separator};
    border-radius: 12px;
    padding: 4px;
}
`).join('\n');

    const menuInteractionRules = THEMES.map(theme => `
.cf-companion-menu.cf-theme-${theme.id} .popup-menu-item:hover,
.cf-companion-menu.cf-theme-${theme.id}.cf-keyboard-navigation .popup-menu-item:focus,
.cf-companion-menu.cf-theme-${theme.id} .popup-menu-item:active,
.cf-companion-menu.cf-theme-${theme.id} .cf-action-toolbar-button:hover,
.cf-companion-menu.cf-theme-${theme.id}.cf-keyboard-navigation .cf-action-toolbar-button:focus,
.cf-companion-menu.cf-theme-${theme.id} .cf-action-toolbar-button:active {
    background-color: ${colorWithAlpha(theme.primaryAccent, 0.15)};
    border-radius: 8px;
}
`).join('\n');

    const customThemeRules = THEMES.filter(theme => theme.id !== 'system').map(theme => `
.cf-panel-label.cf-theme-${theme.id} {
    color: ${theme.primaryAccent};
}

.cf-panel-label.cf-panel-live.cf-theme-${theme.id} {
    color: ${theme.secondaryAccent};
}

.cf-panel-label.cf-panel-urgent.cf-theme-${theme.id} {
    color: #E46D66;
}

.cf-companion-menu.cf-theme-${theme.id},
.cf-companion-menu.cf-theme-${theme.id} .popup-menu-boxpointer {
    background-color: transparent;
    color: ${theme.primaryText};
    border: none;
    box-shadow: none;
}

.cf-companion-menu.cf-theme-${theme.id} .popup-menu-content {
    background-color: ${theme.background};
    color: ${theme.primaryText};
    border: 1px solid ${theme.separator};
    border-radius: 14px;
    box-shadow: none;
    padding: 6px;
}

.cf-companion-menu.cf-theme-${theme.id} .popup-menu-item {
    color: ${theme.primaryText};
    background-color: transparent;
    border-color: transparent;
    box-shadow: none;
}

.cf-companion-menu.cf-theme-${theme.id} .popup-menu-item:insensitive {
    color: ${theme.disabledText};
    background-color: transparent;
}

.cf-companion-menu.cf-theme-${theme.id} .popup-inactive-menu-item {
    color: ${theme.primaryText};
}

.cf-companion-menu.cf-theme-${theme.id} .popup-sub-menu {
    background-color: ${theme.secondarySurface};
    border-color: ${theme.separator};
}

.cf-companion-menu.cf-theme-${theme.id} .popup-menu-icon {
    color: ${theme.primaryAccent};
}

.cf-companion-menu.cf-theme-${theme.id} .cf-friend-row {
    background-color: transparent;
    padding: 2px 0;
}

.cf-companion-menu.cf-theme-${theme.id} .cf-menu-header {
    background-color: transparent;
    color: ${theme.secondaryAccent};
    border-radius: 0;
    padding: 5px 8px 2px;
    font-weight: 600;
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-name {
    color: ${theme.primaryText};
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-details,
.cf-companion-menu.cf-theme-${theme.id} .cf-menu-footer,
.cf-companion-menu.cf-theme-${theme.id} .cf-loading-label {
    color: ${theme.secondaryText};
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-countdown.cf-countdown-normal { color: ${theme.primaryAccent}; }
.cf-companion-menu.cf-theme-${theme.id} .cf-contest-countdown.cf-urgency-yellow { color: #E7C66B; }
.cf-companion-menu.cf-theme-${theme.id} .cf-contest-countdown.cf-urgency-orange { color: #E6A15E; }
.cf-companion-menu.cf-theme-${theme.id} .cf-contest-countdown.cf-urgency-red { color: #EA7770; }

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-expand-button {
    color: ${theme.secondaryAccent};
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-expand-button:hover,
.cf-companion-menu.cf-theme-${theme.id} .cf-contest-expand-button:focus {
    background-color: ${theme.surfaceHover};
}

.cf-companion-menu.cf-theme-${theme.id} .cf-live-contest {
    color: ${theme.secondaryAccent};
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-star-button {
    color: ${theme.primaryAccent};
    background-color: transparent;
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-star-button:checked {
    background-color: ${theme.surface};
    border-radius: 5px;
}

.cf-companion-menu.cf-theme-${theme.id} .cf-contest-star-button:focus {
    border: 1px solid ${theme.primaryAccent};
    border-radius: 5px;
}

.cf-companion-menu.cf-theme-${theme.id}.cf-keyboard-navigation .cf-action-toolbar-button:focus {
    border: 1px solid ${theme.primaryAccent};
    border-radius: 8px;
}

.cf-companion-menu.cf-theme-${theme.id} .cf-action-toolbar-button:insensitive {
    color: ${theme.disabledText};
    background-color: transparent;
}

.cf-companion-menu.cf-theme-${theme.id} .popup-menu-item .popup-menu-item-label {
    color: ${theme.primaryText};
}

.cf-companion-menu.cf-theme-${theme.id} .popup-separator-menu-item {
    background-color: transparent;
    border-color: ${theme.separator};
    padding: 1px 8px;
}

.cf-companion-menu.cf-theme-${theme.id} .popup-separator-menu-item-separator {
    background-color: ${theme.separator};
}

.cf-action-tooltip.cf-theme-${theme.id} {
    background-color: ${theme.surface};
    color: ${theme.primaryText};
    border-color: ${theme.separator};
}
`).join('\n');

    return `${profileCardRules}\n${friendHandleRules}\n${contestRowRules}\n${toolbarRules}\n${customThemeRules}\n${menuInteractionRules}`;
}

export function buildPreferencesCss() {
    const errorColor = '#E46D66';
    const swatches = THEMES.map(theme => `
.cf-companion-preferences .cf-theme-swatch-${theme.id} {
    background-color: ${theme.background};
    border: 1px solid ${theme.separator};
    border-radius: 10px;
}
.cf-companion-preferences .cf-theme-swatch-${theme.id} .cf-theme-swatch-dot-surface {
    background-color: ${theme.surface};
}
.cf-companion-preferences .cf-theme-swatch-${theme.id} .cf-theme-swatch-dot-primary-accent {
    background-color: ${theme.primaryAccent};
}
.cf-companion-preferences .cf-theme-swatch-${theme.id} .cf-theme-swatch-dot-secondary-accent {
    background-color: ${theme.secondaryAccent};
}
.cf-companion-preferences .cf-theme-swatch-${theme.id} .cf-theme-swatch-dot-primary-text {
    background-color: ${theme.primaryText};
}
`).join('\n');

    const swatchBase = `
.cf-companion-preferences .cf-theme-swatch {
    min-width: 112px;
    min-height: 56px;
    border-radius: 10px;
}
.cf-companion-preferences .cf-theme-swatch-dot {
    min-width: 16px;
    min-height: 16px;
    border-radius: 8px;
}
`;

    const selectedRows = THEMES.map(theme => `
.cf-companion-preferences .cf-theme-row-selected-${theme.id} {
    background-color: ${colorWithAlpha(theme.primaryAccent, 0.12)};
    border: 2px solid ${theme.primaryAccent};
    border-radius: 10px;
}`).join('\n');

    const applyButtons = THEMES.map(theme => `
.cf-companion-preferences .cf-apply-changes-button.cf-apply-theme-${theme.id}.suggested-action {
    background-color: ${theme.primaryAccent};
    color: ${theme.background};
}
.cf-companion-preferences .cf-apply-changes-button.cf-apply-theme-${theme.id}.suggested-action:hover {
    background-color: ${theme.surfaceHover};
    color: ${theme.primaryText};
}`).join('\n');

    const palettes = THEMES.filter(theme => theme.id !== 'system').map(theme => {
        const root = `.cf-companion-preferences.theme-${theme.id}`;
        return `
window${root},
window${root}.background,
${root} toastoverlay,
${root} leaflet,
${root} navigation-view,
${root} navigation-view-page,
${root} toolbarview,
${root} preferencespage,
${root} scrolledwindow,
${root} viewport,
${root} clamp {
    background-color: ${theme.background};
    color: ${theme.primaryText};
}

${root} headerbar,
${root} .top-bar,
${root} viewswitcher,
${root} viewswitcherbar,
${root} actionbar {
    background-color: ${theme.secondarySurface};
    color: ${theme.primaryText};
    box-shadow: none;
    border-color: ${theme.separator};
}

${root} .navigation-sidebar,
${root} list.navigation-sidebar,
${root} .sidebar {
    background-color: ${theme.secondarySurface};
    color: ${theme.primaryText};
    border-color: ${theme.separator};
}

${root} .navigation-sidebar row:selected,
${root} list.navigation-sidebar row:selected,
${root} viewswitcher button:checked,
${root} viewswitcher button:checked label {
    background-color: ${theme.surface};
    color: ${theme.primaryText};
}

${root} preferencesgroup {
    background-color: transparent;
    border: none;
    box-shadow: none;
}

${root} list.boxed-list {
    background-color: ${theme.surface};
    color: ${theme.primaryText};
    border: 1px solid ${theme.separator};
    border-radius: 8px;
    box-shadow: none;
}

${root} preferencesgroup > box {
    background-color: transparent;
    border: none;
}

${root} list.boxed-list row,
${root} preferencesgroup row {
    color: ${theme.primaryText};
    background-color: transparent;
    border: none;
    border-radius: 0;
}

${root} list.boxed-list row:hover,
${root} list.boxed-list row:focus,
${root} preferencesgroup row:hover,
${root} preferencesgroup row:focus {
    background-color: ${theme.surfaceHover};
}

${root} label,
${root} label.title,
${root} label.heading {
    color: ${theme.primaryText};
}

${root} label.dim-label,
${root} label.subtitle,
${root} label.caption,
${root} label.description {
    color: ${theme.secondaryText};
}

${root} button.text-button,
${root} entry,
${root} text,
${root} combobox,
${root} dropdown,
${root} popover,
${root} popover.background,
${root} popover contents {
    color: ${theme.primaryText};
    background-color: ${theme.surface};
    border-color: ${theme.separator};
}

${root} button.flat {
    color: ${theme.primaryText};
    background-color: transparent;
}

${root} button.text-button:hover,
${root} button.flat:hover,
${root} viewswitcher button:hover {
    background-color: ${theme.surfaceHover};
}

${root} button:disabled,
${root} label:disabled {
    color: ${theme.disabledText};
}

${root} button.suggested-action {
    background-color: ${theme.primaryAccent};
    color: ${theme.background};
}

${root} button.suggested-action:hover {
    background-color: ${theme.surfaceHover};
    color: ${theme.primaryText};
}

${root} button:focus,
${root} entry:focus,
${root} checkbutton:focus,
${root} switch:focus {
    border-color: ${theme.primaryAccent};
    outline-color: ${theme.primaryAccent};
}

${root} switch {
    background-color: ${theme.separator};
}

${root} switch:checked,
${root} checkbutton radio:checked,
${root} checkbutton check:checked {
    background-color: ${theme.primaryAccent};
    color: ${theme.background};
    border-color: ${theme.primaryAccent};
}

${root} switch slider {
    background-color: ${theme.primaryText};
}

${root} checkbutton radio,
${root} checkbutton check {
    background-color: ${theme.surface};
    border: 1px solid ${theme.separator};
}

${root} separator,
${root} undershoot,
${root} windowcontrols button {
    color: ${theme.primaryText};
    border-color: ${theme.separator};
}

${root} .error,
${root} .cf-status-error,
${root} .cf-status-error label,
${root} .cf-status-error label.dim-label,
${root} button.destructive-action {
    color: ${errorColor};
}
`;
    }).join('\n');

    return `${swatchBase}\n${swatches}\n${selectedRows}\n${applyButtons}\n${palettes}`;
}
