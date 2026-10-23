import assert from 'node:assert/strict';
import { applyPendingSettings } from '../extension/prefs/generalSettings.js';
import { contestCategoryLabel, filterContests, isContestVisible } from '../extension/utils/contestFilters.js';

const contest = name => ({
    name,
    phase: 'BEFORE',
    startTimeSeconds: Math.floor(Date.now() / 1000) + 60,
    durationSeconds: 7200,
});
const div2 = contest('Codeforces Round (Div. 2)');
const div3 = contest('Codeforces Round (Div. 3)');
const div4 = contest('Codeforces Round 1004 (Division 4)');
const combined = contest('WorldQuant Round 1 (Codeforces Round 1128, Div. 1 + Div. 2)');
const unclassified = contest('Codeforces Kotlin Heroes 2026');
const enabled = values => (key, fallback) => values[key] ?? fallback;

assert.equal(isContestVisible(div2, enabled({ 'show-div2': false, 'show-other': true })), false,
    'a recognized Division 2 contest stays hidden when Other is enabled');
assert.equal(isContestVisible(div3, enabled({ 'show-div3': false, 'show-other': true })), false,
    'a recognized Division 3 contest stays hidden when Other is enabled');
assert.equal(isContestVisible(div4, enabled({ 'show-div4': true, 'show-other': false })), true,
    'Division 4 follows its own switch');
assert.equal(isContestVisible(combined, enabled({ 'show-div1': true, 'show-div2': false, 'show-other': false })), true,
    'a combined Division 1/Division 2 contest remains visible through an enabled category');
assert.equal(isContestVisible(unclassified, enabled({ 'show-other': false })), false,
    'unclassified contests are hidden when Other is disabled');
assert.equal(isContestVisible(unclassified, enabled({ 'show-other': true })), true,
    'unclassified contests are shown when Other is enabled');
assert.equal(isContestVisible(contest('Neighborhood Division 2 Meetup'), enabled({ 'show-div2': false, 'show-other': true })), true,
    'unrelated names are not classified as Codeforces divisions');
assert.equal(contestCategoryLabel(div4), 'Div. 4', 'division badges use the shared classifier');
assert.equal(contestCategoryLabel(combined), 'Div. 1 + Div. 2',
    'combined division badges retain both supported divisions');
assert.equal(contestCategoryLabel(contest('Educational Codeforces Round 180')), 'Educational');
assert.equal(contestCategoryLabel(contest('Codeforces Global Round 40')), 'Global');
assert.equal(contestCategoryLabel(unclassified), 'Other');

class DelayedSettings {
    constructor(values) {
        this.values = { ...values };
        this.pending = {};
        this.handlers = new Map();
        this.applyCount = 0;
    }

    connect(signal, callback) {
        const key = signal.slice('changed::'.length);
        const callbacks = this.handlers.get(key) ?? new Set();
        callbacks.add(callback);
        this.handlers.set(key, callbacks);
        return key;
    }

    get_has_unapplied() {
        return Object.keys(this.pending).length > 0;
    }

    set_boolean(key, value) {
        this.pending[key] = value;
    }

    set_uint(key, value) {
        this.pending[key] = value;
    }

    apply() {
        const changedKeys = Object.keys(this.pending).filter(key => this.values[key] !== this.pending[key]);
        Object.assign(this.values, this.pending);
        this.pending = {};
        this.applyCount++;
        for (const key of changedKeys) {
            for (const callback of this.handlers.get(key) ?? [])
                callback();
        }
    }
}

const settings = new DelayedSettings({
    'show-div2': true,
    'show-div3': true,
    'show-other': true,
    'reminder-at-start': true,
    'reminder-mode': 0,
});
const rawContests = [div2, div3, unclassified];
let visibleContests = filterContests(rawContests, enabled(settings.values));
let networkRequests = 0;
let renderCount = 0;
let preferencesWindowOpen = true;
let filterUpdateScheduled = false;
const updateVisible = () => {
    visibleContests = filterContests(rawContests, enabled(settings.values));
    renderCount++;
};
for (const key of ['show-div2', 'show-div3', 'show-other', 'reminder-at-start', 'reminder-mode'])
    settings.connect(`changed::${key}`, () => {
        filterUpdateScheduled = true;
    });

settings.set_boolean('show-div2', false);
settings.set_boolean('show-div3', false);
settings.set_boolean('reminder-at-start', false);
settings.set_uint('reminder-mode', 1);
assert.equal(visibleContests.length, 3, 'draft values do not affect the running list before Apply');
let confirmationCount = 0;
assert.equal(applyPendingSettings(settings, () => confirmationCount++), true,
    'Apply commits pending general preferences');
assert.deepEqual(settings.values, {
    'show-div2': false,
    'show-div3': false,
    'show-other': true,
    'reminder-at-start': false,
    'reminder-mode': 1,
});
if (filterUpdateScheduled) {
    filterUpdateScheduled = false;
    updateVisible();
}
assert.deepEqual(visibleContests, [unclassified],
    'applying settings filters the in-memory list using the current contests in one coalesced update');
assert.equal(networkRequests, 0, 'applying settings does not request contests');
assert.equal(renderCount, 1, 'multiple changed keys coalesce into one current-data update');
assert.equal(confirmationCount, 1, 'successful Apply reports confirmation');
assert.equal(preferencesWindowOpen, true, 'Apply does not close the preferences window');

const applyCountBeforeNoop = settings.applyCount;
const renderCountBeforeNoop = renderCount;
assert.equal(applyPendingSettings(settings, () => confirmationCount++), false,
    'Apply is a no-op when there are no pending changes');
assert.equal(settings.applyCount, applyCountBeforeNoop, 'no pending changes do not write settings');
assert.equal(renderCount, renderCountBeforeNoop, 'no pending changes do not recompute the contest list');
assert.equal(confirmationCount, 1, 'no-op Apply does not show success confirmation');
assert.equal(networkRequests, 0, 'no-op Apply does not request contests');

console.log('contest preferences tests passed');
