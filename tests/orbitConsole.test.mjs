import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panelSource = readFileSync(new URL('../extension/ui/panel.js', import.meta.url), 'utf8');
const menuSource = panelSource.slice(
    panelSource.indexOf('_buildMenu() {'),
    panelSource.indexOf('_buildActionToolbar() {'));

assert.doesNotMatch(panelSource,
    /selectFeaturedContest|_updateConsoleStats|_updateFeaturedContest|_featuredItem|cf-contest-timeline|cf-console/,
    'the dropdown no longer contains the earlier statistics, featured card, or timeline experiment');
assert.match(menuSource, /this\.menu\.addMenuItem\(this\._profileItem\)/,
    'the compact profile header is first');
assert.ok(menuSource.indexOf("'Change Codeforces account…'") < menuSource.indexOf("'Add a friend…'") &&
    menuSource.indexOf("'Add a friend…'") < menuSource.indexOf("'Friends', false") &&
    menuSource.indexOf("'Friends', false") < menuSource.indexOf("'UPCOMING CONTESTS · 0'"),
'account actions and collapsed Friends appear before upcoming contests');
assert.equal((menuSource.match(/this\.menu\.addMenuItem\(this\._accountAction\)/g) ?? []).length, 1,
    'the account action is present exactly once');
assert.match(menuSource, /new PopupMenu\.PopupImageMenuItem\('Add a friend…', 'list-add-symbolic'\)/,
    'Add a friend uses a small native symbolic icon');
assert.match(menuSource, /this\._friendsSubmenu = new PopupMenu\.PopupSubMenuMenuItem\('Friends', false\)/,
    'friends remain inside a collapsed native submenu');
assert.match(menuSource, /this\._contestHeader = new PopupMenu\.PopupBaseMenuItem/,
    'the contest heading uses a native custom menu row');
assert.match(menuSource, /text: 'UPCOMING CONTESTS · 0'/,
    'the contest section heading includes its current count');
assert.match(menuSource, /label: 'View all'/,
    'the compact heading exposes a View all action');
assert.doesNotMatch(panelSource, /row\.separator\s*=|addMenuItem\(row\.separator\)/,
    'contest rows use individual cards without separator lines');
assert.match(panelSource, /cf-contest-section/,
    'the contest section spaces the individual row cards');
assert.match(panelSource, /cf-contest-row-priority/,
    'the first upcoming row can receive the subtle accent shown in the reference');
assert.match(panelSource, /_buildActionToolbar\(\)/,
    'Refresh, Codeforces, and Settings remain in the bottom toolbar');

console.log('compact dropdown design tests passed');
