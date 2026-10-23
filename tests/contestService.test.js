import { ContestService } from '../extension/services/contestService.js';
import { applyPendingSettings } from '../extension/prefs/generalSettings.js';
import {
    contestLifecycle,
    panelContestDisplay,
    reconcileContestList,
    selectAllUpcomingContests,
    selectPrimaryActiveContest,
    selectUpcomingContests,
    selectVisibleMenuContests,
    upcomingContestViewMode,
} from '../extension/utils/upcomingContests.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function equal(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

class FakeTimerManager {
    constructor() {
        this.nextId = 1;
        this.callbacks = new Map();
    }

    timeout(_delay, callback) {
        const id = this.nextId++;
        this.callbacks.set(id, callback);
        return id;
    }

    cancel(id) {
        this.callbacks.delete(id);
    }

    fire(id) {
        const callback = this.callbacks.get(id);
        this.callbacks.delete(id);
        callback?.();
    }
}

class FakeSettings {
    constructor(values) {
        this.values = { ...values };
        this.pending = {};
        this.handlers = new Map();
        this.nextSignalId = 1;
    }

    connect(signal, callback) {
        const key = signal.slice('changed::'.length);
        const id = this.nextSignalId++;
        const handlers = this.handlers.get(key) ?? new Map();
        handlers.set(id, callback);
        this.handlers.set(key, handlers);
        return id;
    }

    disconnect(id) {
        for (const handlers of this.handlers.values())
            handlers.delete(id);
    }

    get_boolean(key) {
        return this.values[key];
    }

    get_has_unapplied() {
        return Object.keys(this.pending).length > 0;
    }

    set_boolean(key, value) {
        this.pending[key] = value;
    }

    apply() {
        const changedKeys = Object.keys(this.pending).filter(key => this.values[key] !== this.pending[key]);
        Object.assign(this.values, this.pending);
        this.pending = {};
        for (const key of changedKeys) {
            for (const callback of this.handlers.get(key)?.values() ?? [])
                callback();
        }
    }
}

const now = Math.floor(Date.now() / 1000);
const upcoming = (id, name, phase = 'BEFORE', startTimeSeconds = now + id * 60) => ({
    id,
    name,
    type: 'CF',
    phase,
    startTimeSeconds,
    durationSeconds: 7200,
});
const div1 = upcoming(1, 'Codeforces Round 1200 (Div. 1)');
const div2 = upcoming(2, 'Codeforces Round 1201 (Division 2)');
const div3 = upcoming(3, 'Codeforces Round 1202, Div. 3');
const educational = upcoming(4, 'Educational Codeforces Round 180');
const globalRound = upcoming(5, 'Codeforces Global Round 40');
const other = upcoming(6, 'Codeforces Kotlin Heroes');
const combined = upcoming(7, 'WorldQuant Round (Codeforces Round 1203, Div. 1 + Div. 2)');
const finished = upcoming(8, 'Codeforces Round 1199 (Div. 2)', 'FINISHED', now - 9000);
const expiredBefore = upcoming(9, 'Codeforces Round 1198 (Div. 2)', 'BEFORE', now - 9000);
const scheduledLive = upcoming(10, 'Codeforces Round 1204 (Div. 1)', 'BEFORE', now - 120);
const codingLive = upcoming(11, 'Codeforces Round 1205 (Div. 3)', 'CODING', now - 300);
const values = Object.fromEntries([
    'show-div1', 'show-div2', 'show-div3', 'show-div4',
    'show-educational', 'show-global', 'show-other',
].map(key => [key, true]));
const timers = new FakeTimerManager();
const settings = new FakeSettings(values);
const updates = [];
const service = new ContestService(timers, state => updates.push(state), settings);
service._rawContests = [div1, div2, div3, educational, globalRound, other, combined, finished, expiredBefore, scheduledLive, codingLive];
let networkRequests = 0;
service._fetchContests = () => {
    networkRequests++;
    return Promise.resolve([]);
};

service._emit();
equal(updates.at(-1).contests.map(contest => contest.id), [11, 10, 1, 2, 3, 4, 5, 6, 7],
    'scheduled and API-confirmed live contests appear before upcoming contests');
assert(contestLifecycle(scheduledLive, now) === 'live',
    'a cached BEFORE contest transitions to live using its validated schedule');
assert(contestLifecycle(codingLive, now) === 'live',
    'a Codeforces CODING contest remains active');
assert(contestLifecycle({ ...codingLive, startTimeSeconds: now + 3600 }, now) === 'live',
    'an API-confirmed CODING phase remains active even if the schedule timestamp is inconsistent');
assert(contestLifecycle(finished, now) === 'finished',
    'finished contests leave the active lifecycle');
assert(selectUpcomingContests([finished], () => true, now).length === 0,
    'finished contests are removed from active and upcoming state');
const manyActive = Array.from({ length: 10 }, (_, index) => upcoming(30 + index,
    `Codeforces Kotlin Heroes ${index}`, 'CODING', now - 300));
assert(selectUpcomingContests(manyActive, () => true, now).length === 10,
    'all active contests remain accessible beyond the upcoming-list limit');
const manyUpcoming = Array.from({ length: 10 }, (_, index) => upcoming(50 + index,
    `Codeforces Round ${1300 + index}`, 'BEFORE', now + (index + 1) * 3600));
assert(selectUpcomingContests(manyUpcoming, () => true, now).length === 8,
    'the existing reminder contest feed retains its eight-upcoming limit');
assert(selectAllUpcomingContests(manyUpcoming, () => true, now).length === 10,
    'the presentation feed keeps every filtered fetched contest available');
const menuCandidates = [...manyActive.slice(0, 4), ...manyUpcoming];
equal(selectVisibleMenuContests(menuCandidates, false, now).map(contest => contest.id),
    [...manyActive.slice(0, 4).map(contest => contest.id), ...manyUpcoming.slice(0, 3).map(contest => contest.id)],
    'collapsed menu keeps every active contest and the first three upcoming contests visible');
equal(selectVisibleMenuContests(menuCandidates, true, now).map(contest => contest.id),
    menuCandidates.map(contest => contest.id), 'expanded menu shows every eligible contest');
equal(reconcileContestList([scheduledLive, codingLive], [], now).map(contest => contest.id), [10, 11],
    'a refresh that omits active contests retains their known schedule data');
equal(reconcileContestList([scheduledLive], [{ ...scheduledLive, phase: 'FINISHED' }], now)
    .map(contest => contest.phase), ['FINISHED'], 'an explicit fresh FINISHED phase replaces stale live state');
const starredPrimary = selectPrimaryActiveContest([scheduledLive, codingLive], new Set([10]), now);
assert(starredPrimary.id === 10, 'a starred active contest wins primary panel selection');
assert(selectPrimaryActiveContest([scheduledLive, codingLive], new Set(), now).id === 11,
    'otherwise the active contest ending soonest is selected deterministically');
assert(panelContestDisplay([scheduledLive], 0, new Set(), now).text === 'CF • LIVE · 1h 58m · cached',
    'default panel mode shows live status and remaining contest duration');
assert(panelContestDisplay([scheduledLive], 0, new Set(), now).urgent === false,
    'a live contest does not leave the panel urgency color active');
assert(panelContestDisplay([scheduledLive], 1, new Set(), now).text === 'LIVE · 1h 58m · cached',
    'countdown-only mode still clearly marks a live contest');
assert(/Codeforces Round 1204.*LIVE/.test(panelContestDisplay([scheduledLive], 2, new Set(), now).text),
    'contest-name panel mode includes the active contest and remaining time');
assert(/cached$/.test(panelContestDisplay([scheduledLive], 0, new Set(), now, true).text),
    'cached schedule status is explicit while the network list is stale');
assert(panelContestDisplay([], 0, new Set(), now).text === 'CF ✓',
    'ending the last contest restores the normal empty panel state');

settings.set_boolean('show-div2', false);
settings.set_boolean('show-div3', false);
settings.set_boolean('show-educational', false);
settings.set_boolean('show-global', false);
assert(applyPendingSettings(settings), 'Apply commits contest category changes');
const filterTimer = service._filterUpdateTimer;
timers.fire(filterTimer);
equal(updates.at(-1).contests.map(contest => contest.id), [10, 1, 6, 7],
    'disabled categories are filtered, while Other does not restore recognized rounds');
assert(networkRequests === 0, 'applying categories re-filters the existing list without a network request');

settings.set_boolean('show-div1', false);
assert(applyPendingSettings(settings), 'Apply commits the Division 1 setting');
timers.fire(service._filterUpdateTimer);
equal(updates.at(-1).contests.map(contest => contest.id), [6],
    'a combined Division 1/Division 2 contest is hidden when both divisions are disabled');
assert(networkRequests === 0, 'second Apply also avoids a contest request');

assert(upcomingContestViewMode([], false, true) === 'loading', 'loading has an explicit view state');
assert(upcomingContestViewMode([], true, false) === 'offline', 'offline has an explicit view state');
assert(upcomingContestViewMode([], false, false) === 'empty', 'an empty feed has an explicit view state');
assert(upcomingContestViewMode([div1], false, false) === 'rows', 'contests select the row view state');

const cacheTimers = new FakeTimerManager();
const cacheUpdates = [];
const requestStates = [];
const cacheService = new ContestService(cacheTimers, state => cacheUpdates.push(state), new FakeSettings(values),
    isRefreshing => requestStates.push(isRefreshing));
cacheService._saveCache = () => {};
const cachedContests = [div2, scheduledLive];
const cachedBytes = new TextEncoder().encode(JSON.stringify({
    version: 1,
    updatedAt: Date.now(),
    contests: cachedContests,
}));
cacheService._cacheFile = {
    load_contents_async(_cancellable, callback) {
        callback(this, null);
    },
    load_contents_finish() {
        return [true, cachedBytes];
    },
};
await cacheService._loadCache();
equal(cacheUpdates.at(-1).contests.map(contest => contest.id), [10, 2],
    'cached upcoming contests use the same category filter and reach the update callback');
assert(cacheUpdates.at(-1).stale === true, 'cached contests are marked stale until this session gets a fresh response');

cacheService._fetchContests = () => Promise.resolve([div1]);
assert(cacheService.refresh() === true, 'a new manual refresh starts one request');
assert(requestStates.at(-1) === true, 'refresh progress is reported before the request completes');
assert(cacheService.refresh() === false, 'a repeated refresh reuses the in-flight request');
assert(requestStates.at(-1) === true, 'a repeated click keeps the loading state visible');
for (let index = 0; index < 8; index++)
    await Promise.resolve();
assert(requestStates.at(-1) === false, 'success clears the refresh loading state');
equal(cacheUpdates.at(-1).contests.map(contest => contest.id), [10, 1],
    'a successful feed that omits an active contest reconciles its previous schedule');
equal(cacheUpdates.at(-1).staleContestIds, [10],
    'an omitted retained active contest is marked as schedule-based, not API-confirmed');

cacheService._fetchContests = () => Promise.reject(new Error('simulated refresh failure'));
cacheService.refresh();
for (let index = 0; index < 8; index++)
    await Promise.resolve();
assert(requestStates.at(-1) === false, 'failure also clears the refresh loading state');
equal(cacheUpdates.at(-1).contests.map(contest => contest.id), [10, 1],
    'a failed refresh retains the previously known live and upcoming contests');
assert(cacheUpdates.at(-1).offline, 'a failed refresh reports offline state while retaining cached rows');

const destroyedStates = [];
const lateService = new ContestService(new FakeTimerManager(), () => destroyedStates.push('contest'), null,
    isRefreshing => destroyedStates.push(isRefreshing));
let finishLateRequest;
lateService._fetchContests = () => new Promise(resolve => finishLateRequest = resolve);
lateService._saveCache = () => {};
lateService.refresh();
lateService.destroy();
const stateCountAtDestroy = destroyedStates.length;
finishLateRequest([div1]);
for (let index = 0; index < 8; index++)
    await Promise.resolve();
assert(destroyedStates.length === stateCountAtDestroy,
    'a late response after destroy does not report state or update the UI');

service._rawContests = manyUpcoming;
service._emit();
assert(updates.at(-1).contests.length === 8,
    'the reminder list keeps the previous eight-upcoming selection');
assert(updates.at(-1).displayContests.length === 10,
    'the menu receives all eligible fetched contests without a new request');

service.destroy();
cacheService.destroy();
print('contest service tests passed');
