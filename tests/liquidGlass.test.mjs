import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
    LIQUID_GLASS_BLUR_BRIGHTNESS,
    LIQUID_GLASS_BLUR_RADIUS,
    readLiquidGlassSettings,
} from '../extension/utils/liquidGlass.js';
import { buildShellThemeCss, THEMES } from '../extension/utils/themes.js';

assert.equal(LIQUID_GLASS_BLUR_RADIUS, 10);
assert.equal(LIQUID_GLASS_BLUR_BRIGHTNESS, 0.92);
assert.deepEqual(readLiquidGlassSettings({ get_boolean: () => true }), { enabled: true });
assert.deepEqual(readLiquidGlassSettings({ get_boolean: () => false }), { enabled: false });
assert.deepEqual(readLiquidGlassSettings(null), { enabled: false });
assert.deepEqual(readLiquidGlassSettings({ get_boolean: () => { throw new Error('missing key'); } }),
    { enabled: false });

const schema = await readFile(new URL('../extension/schemas/org.gnome.shell.extensions.cf-companion.gschema.xml', import.meta.url), 'utf8');
const prefs = await readFile(new URL('../extension/prefs.js', import.meta.url), 'utf8');
const panel = await readFile(new URL('../extension/ui/panel.js', import.meta.url), 'utf8');
assert.match(schema, /<key name="liquid-glass-enabled" type="b">\s*<default>false<\/default>/,
    'Liquid Glass remains off for new users');
assert.doesNotMatch(schema, /liquid-glass-strength/,
    'the unreliable strength setting is removed from the schema');
assert.doesNotMatch(prefs, /liquid-glass-strength|Effect Strength|Gtk\.Scale/,
    'the preference exposes only the toggle, without slider callbacks');
assert.doesNotMatch(panel, /liquid-glass-strength/,
    'the running extension no longer reads a removed strength key');
assert.match(panel, /new Shell\.BlurEffect\([\s\S]*?radius: LIQUID_GLASS_BLUR_RADIUS,[\s\S]*?brightness: LIQUID_GLASS_BLUR_BRIGHTNESS/,
    'the popup uses centrally defined fixed native blur parameters');
assert.match(panel, /new Shell\.Stack\([\s\S]*?stack\.add_child\(backdrop\);\s*stack\.add_child\(content\)/,
    'the blur backing is beneath the sharp menu content');
for (const theme of THEMES) {
    assert.ok(buildShellThemeCss().includes(
        `.cf-companion-menu.cf-theme-${theme.id}.cf-liquid-glass .popup-menu-content`),
    `${theme.name} has its own tinted glass surface`);
    assert.ok(buildShellThemeCss().includes(
        `.cf-companion-menu.cf-theme-${theme.id}.cf-liquid-glass .cf-profile-row`),
    `${theme.name} styles the profile as a separate glass layer`);
}

console.log('liquid glass tests passed');
