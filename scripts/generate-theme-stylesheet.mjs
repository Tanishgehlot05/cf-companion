import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildShellThemeCss } from '../extension/utils/themes.js';

const stylesheetPath = fileURLToPath(new URL('../extension/stylesheet.css', import.meta.url));
const begin = '/* BEGIN GENERATED THEME RULES */';
const end = '/* END GENERATED THEME RULES */';
const current = readFileSync(stylesheetPath, 'utf8');
const startIndex = current.indexOf(begin);
const endIndex = current.indexOf(end);

if (startIndex < 0 || endIndex < startIndex)
    throw new Error('Theme stylesheet markers are missing or out of order.');

const generated = `${begin}\n${buildShellThemeCss().trim()}\n${end}`;
const updated = `${current.slice(0, startIndex)}${generated}${current.slice(endIndex + end.length)}`;

if (process.argv.includes('--check')) {
    if (current !== updated) {
        console.error('stylesheet.css is out of date; run node scripts/generate-theme-stylesheet.mjs.');
        process.exitCode = 1;
    } else {
        console.log('theme stylesheet is current');
    }
} else {
    writeFileSync(stylesheetPath, updated);
    console.log('generated extension/stylesheet.css from extension/utils/themes.js');
}
