import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const panelSource = readFileSync(new URL('../extension/ui/panel.js', import.meta.url), 'utf8');
const extensionSource = readFileSync(new URL('../extension/extension.js', import.meta.url), 'utf8');
const contestServiceSource = readFileSync(new URL('../extension/services/contestService.js', import.meta.url), 'utf8');
const friendsServiceSource = readFileSync(new URL('../extension/services/friendsService.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../extension/services/codeforcesUserService.js', import.meta.url), 'utf8');
const contestRowSource = panelSource.slice(
    panelSource.indexOf('_buildContestItem(contest) {'),
    panelSource.indexOf('_updateRow(row, secondsLeft) {'));
const friendRenderSource = panelSource.slice(
    panelSource.indexOf('_renderFriendRows() {'),
    panelSource.indexOf('_updateFriendRow(friend) {'));

assert.doesNotMatch(`${panelSource}\n${extensionSource}\n${contestServiceSource}`,
    /Recently finished contests|recentContests|recentSubmenu|setResultsState|ContestResultsService/,
    'the extension no longer renders or wires post-contest results');
assert.equal(existsSync(new URL('../extension/services/contestResultsService.js', import.meta.url)), false,
    'the recent-results polling service is removed');
assert.equal(existsSync(new URL('../extension/utils/contestResults.js', import.meta.url)), false,
    'recap-only validation, standings, and rating-polling helpers are removed');
assert.doesNotMatch(apiSource, /contestStandings|ratingHistory|contest\.standings|user\.rating/,
    'the extension no longer requests post-contest standings or rating history');
assert.doesNotMatch(`${panelSource}\n${extensionSource}\n${contestServiceSource}\n${friendsServiceSource}`,
    /contest-results\.json|rating-poll|standings-cache/,
    'no recent-results cache or polling timers remain in extension runtime wiring');

assert.match(panelSource, /new PopupMenu\.PopupSubMenuMenuItem\('Friends', false\)/,
    'Friends uses a collapsed native submenu');
assert.match(panelSource, /Friends · \$\{friendCount\}/,
    'the collapsed Friends submenu includes the saved friend count when nonempty');
assert.match(friendRenderSource, /this\._friendsSubmenu\.menu\.addMenuItem\(item\)/,
    'friend entries are added to the submenu, not the main dropdown');
assert.doesNotMatch(friendRenderSource, /this\.menu\.addMenuItem\(item\)/,
    'friend rows stay out of the main menu');
assert.match(panelSource, /sameOrder[\s\S]*_updateFriendRow\(friend\)/,
    'friend profile updates reuse rows when saved friend order is unchanged');
assert.match(panelSource, /_pendingFriendsUpdate[\s\S]*_renderFriendRows\(\)/,
    'adding or removing friends safely refreshes the submenu after the popup closes');
assert.match(friendsServiceSource, /normalizeFriends\(this\._settings\?\.get_strv\('friends'\)\)/,
    'the friend service honors the existing bounded saved-friend list');
assert.match(friendsServiceSource, /this\._api\.lookupUsers\(requestedHandles, cancellable\)/,
    'friend profiles are fetched independently of the submenu open action');
assert.doesNotMatch(panelSource, /_friendsSubmenu\.connect\(['"]open-state-changed['"],[\s\S]{0,200}lookupUsers/,
    'opening Friends does not trigger a new request');

assert.match(panelSource, /cf-action-toolbar-row/,
    'toolbar actions share one compact menu row');
assert.match(panelSource, /'view-refresh-symbolic',[\s\S]*'Refresh contests'/,
    'the toolbar exposes an accessible refresh icon button');
assert.match(panelSource, /this\._codeforcesIcon,[\s\S]*'Open Codeforces'/,
    'the toolbar exposes an accessible Codeforces button using its brand mark');
assert.match(extensionSource, /extensionPath: this\.path/,
    'the active extension instance passes its supported filesystem path to the UI');
assert.doesNotMatch(`${panelSource}\n${extensionSource}`, /new URL\(/,
    'Shell asset loading does not rely on the browser URL global');
assert.match(panelSource, /'preferences-system-symbolic',[\s\S]*'Settings'/,
    'the toolbar exposes an accessible settings button');
assert.match(panelSource, /accessible_name: accessibleName/,
    'toolbar buttons expose screen-reader names');
assert.match(panelSource, /class ToolbarTooltip[\s\S]*Main\.uiGroup\.add_child\(this\.actor\)/,
    'toolbar hover hints use an extension-owned Shell label overlay');
assert.match(panelSource, /this\._timers\.timeout\(550[\s\S]*this\._cancelTimeout\(\)/,
    'toolbar hover hints use a delayed, cancellable timer');
assert.match(panelSource, /for \(const tooltip of this\._toolbarTooltips\)\s*tooltip\.destroy\(\)/,
    'toolbar hover hints are destroyed with the indicator');
assert.doesNotMatch(panelSource, /set_tooltip_text/,
    'toolbar avoids the unsupported St.Button tooltip method');
assert.match(panelSource, /button\.connect\('clicked', callback\)/,
    'toolbar controls are clickable St.Button widgets');
assert.match(extensionSource, /this\.openPreferences\(\)/,
    'Settings opens preferences using the running extension instance and UUID');
assert.match(extensionSource, /get_tab_list\([\s\S]*?window\.get_title\(\)[\s\S]*?Main\.activateWindow\(existingWindow/,
    'preference actions present an already-open settings window');
assert.match(extensionSource, /if \(existingWindow\.minimized\)\s*existingWindow\.unminimize\(\);\s*Main\.activateWindow\(existingWindow/,
    'preference actions unminimize an existing window before activating it once');
assert.match(panelSource, /this\._openUri\('https:\/\/codeforces\.com\/contests'\)/,
    'Open Codeforces uses the supported URI opener');
assert.doesNotMatch(panelSource, /PopupMenuItem\(['"](?:🔄\s+)?Refresh Now/,
    'refresh is no longer a full-width menu item');

assert.match(panelSource, /new PopupMenu\.PopupBaseMenuItem\(\{\s*reactive: false,[\s\S]*?style_class: 'cf-action-toolbar-row'/,
    'toolbar parent is non-activating so button clicks do not activate/close the popup');
assert.match(panelSource, /_refreshIcon\.set_icon_name\(isRefreshing \? 'process-working-symbolic' : 'view-refresh-symbolic'\)/,
    'refresh progress updates the existing icon in place');
assert.match(panelSource, /_refreshLabel\.set_text\(isRefreshing \? 'Refreshing…' : 'Refresh'\)/,
    'refresh progress is visible while a request is pending');
assert.match(panelSource, /this\._refreshButton\.sensitive = !isRefreshing/,
    'the refresh control is disabled during the single in-flight request and restored afterward');
assert.match(contestServiceSource, /if \(this\._requestRunning\)\s*\{\s*this\._notifyRequestState\(\);\s*return false;/,
    'manual refresh reuses the existing single-flight request');
assert.match(contestServiceSource, /this\._requestRunning = true;\s*this\._notifyRequestState\(\);/,
    'the loading state is emitted synchronously before the fetch');
assert.match(contestServiceSource, /\.finally\(\(\) => \{\s*this\._requestRunning = false;\s*this\._notifyRequestState\(\);/,
    'success and failure both clear refresh progress');
assert.match(contestServiceSource, /if \(this\._session === null \|\| this\._requestCancellable\.is_cancelled\(\)/,
    'late or cancelled contest responses are ignored after session cleanup');
assert.match(contestServiceSource, /this\._rawContests,\s*contests,/,
    'successful responses reconcile with the existing cached contest list');
assert.match(contestServiceSource, /this\._offline = true;\s*this\._emit\(\);/,
    'failures retain cached contests and update the offline state');
assert.match(panelSource, /if \(mode === this\._renderedContestMode && sameIds\)[\s\S]*this\._updateRow\(row,/,
    'unchanged contest IDs update existing rows instead of rebuilding them');
assert.match(panelSource, /this\.menu\.isOpen && mode === 'rows' && this\._contestRows\.length === 0[\s\S]*this\._renderContestRows\(\)/,
    'a successful first response fills the visible contest section without closing the popup');
assert.match(panelSource, /this\._contestSection\.actor\.show\(\);/,
    'contest rows explicitly re-show their section after it is populated');
assert.doesNotMatch(panelSource, /row\.separator\s*=|addMenuItem\(row\.separator\)/,
    'contest rows render as separate cards without separator lines');
assert.match(panelSource, /cf-contest-theme-\$\{this\._activeTheme\}/,
    'contest rows track the active theme for card and highlight colors');
assert.match(panelSource, /source === starButton[\s\S]*actions\.open\(\)/,
    'star interaction does not activate the contest row');
assert.match(contestRowSource, /cf-contest-marker/,
    'contest type is shown with a compact category marker');
assert.doesNotMatch(contestRowSource, /cf-contest-category-badge|contestCategoryLabel/,
    'contest rows do not display division badges');
assert.match(panelSource, /text: 'UPCOMING CONTESTS · 0'[\s\S]*label: 'View all'/,
    'the contest header and View all action remain available');
assert.match(panelSource, /selectVisibleMenuContests\(this\._contests, this\._contestsExpanded/,
    'collapsed contest rows are hidden in place without rebuilding the section');
assert.match(panelSource, /this\._contestViewButton\.set_label\(this\._contestsExpanded \? 'Show fewer' : 'View all'\)/,
    'the contest heading toggles between View all and Show fewer');
assert.match(panelSource, /urls\.problemset|urls\.standings/,
    'Live Contest Mode keeps contest-specific shortcuts');
assert.match(panelSource, /cf-profile-handle cf-friend-handle/,
    'friend handles use a dedicated visible text style');
assert.match(extensionSource, /new FriendsService[\s\S]*new CodeforcesUserService/,
    'friends and personal profile services remain wired after recap removal');
assert.match(panelSource, /_reminders\.check\(this\._reminderContests\)/,
    'reminders retain the existing selected contest feed while the panel reveals all contests');
assert.match(panelSource, /_scheduleCountdownTick\(\);[\s\S]*this\._syncContestRows\(/,
    'countdown ticks continue to reschedule before UI updates');
assert.match(extensionSource, /this\._friendsService\?\.destroy\(\)[\s\S]*this\._contestService\?\.destroy\(\)[\s\S]*this\._timers\?\.destroy\(\)/,
    'friend, contest, and shared timer cleanup remain wired on disable');

console.log('contest panel regression tests passed');
