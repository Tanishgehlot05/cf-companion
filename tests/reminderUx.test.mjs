import assert from 'node:assert/strict';
import { formatFriendlyStartDate } from '../extension/utils/time.js';
import { createContestMenuActions } from '../extension/utils/contestMenuActions.js';
import { contestUrls } from '../extension/utils/contestMenuActions.js';
import { applyPendingSettings } from '../extension/utils/generalPreferences.js';
import {
    dueReminderKinds,
    contestHasNotEnded,
    isPanelUrgent,
    normalizeReminderMode,
    removeFinishedStarredContestIds,
    readStarredContestIds,
    REMINDER_MODE_ALL,
    REMINDER_MODE_STARRED_ONLY,
    setContestStarred,
    shouldSendRegularReminder,
    snoozedReminderKey,
} from '../extension/utils/reminderPreferences.js';
import { SNOOZE_DELAY_MS, SnoozeTimerManager } from '../extension/utils/snoozeTimerManager.js';

assert.equal(normalizeReminderMode(undefined), REMINDER_MODE_ALL, 'missing setting defaults to all contests');
assert.equal(normalizeReminderMode(99), REMINDER_MODE_ALL, 'invalid mode safely defaults to all contests');
const settingsStarred = setContestStarred([], 42, true);
assert.deepEqual(settingsStarred, ['42'], 'starring serializes a contest ID for GSettings');
assert.equal(readStarredContestIds(settingsStarred).has(42), true, 'star state survives a settings round trip');
assert.deepEqual(setContestStarred(settingsStarred, 42, false), [], 'unstarring removes the contest ID');
assert.deepEqual(removeFinishedStarredContestIds(['42', '43', '90'], [42]), ['43', '90'],
    'only finished IDs from an authoritative contest response are pruned');
assert.deepEqual([...readStarredContestIds(['42', '42', '0', '-1', 'NaN', '9007199254740992'])], [42],
    'starred IDs are deduplicated and malformed IDs are ignored');
const openedContests = [];
const starChanges = [];
const rowActions = createContestMenuActions(42, id => openedContests.push(id), (id, active) => starChanges.push([id, active]));
rowActions.toggleStar(true);
assert.deepEqual(starChanges, [[42, true]], 'the separate star control updates its contest state');
assert.deepEqual(openedContests, [], 'toggling a star does not activate the contest open action');
rowActions.open();
assert.deepEqual(openedContests, [42], 'the main contest row retains its open action');
assert.deepEqual(contestUrls(42), {
    contest: 'https://codeforces.com/contest/42',
    problemset: 'https://codeforces.com/contest/42/problemset',
    standings: 'https://codeforces.com/contest/42/standings',
}, 'live shortcuts use contest-specific HTTPS URLs');
assert.equal(contestUrls(0), null, 'invalid contest IDs cannot be interpolated into a URL');
assert.equal(contestUrls('42'), null, 'contest URL construction requires a validated integer ID');

const starred = new Set([42]);
assert.equal(shouldSendRegularReminder(43, REMINDER_MODE_ALL, starred), true,
    'all-contests is the existing regular reminder behavior');
assert.equal(shouldSendRegularReminder(43, REMINDER_MODE_STARRED_ONLY, starred), false,
    'unstarred contests are filtered in starred-only mode');
assert.equal(shouldSendRegularReminder(43, REMINDER_MODE_STARRED_ONLY, new Set()), false,
    'starred-only mode with no stars suppresses regular reminders');
assert.equal(shouldSendRegularReminder(42, REMINDER_MODE_STARRED_ONLY, starred), true,
    'starred contests remain eligible for regular reminders');

let runtimeReminderMode = REMINDER_MODE_ALL;
const delayedSettings = {
    values: { mode: REMINDER_MODE_ALL },
    pending: null,
    callback: null,
    get_has_unapplied() { return this.pending !== null; },
    set_uint(_key, value) { this.pending = value; },
    apply() {
        this.values.mode = this.pending;
        this.pending = null;
        this.callback?.();
    },
};
delayedSettings.callback = () => {
    runtimeReminderMode = normalizeReminderMode(delayedSettings.values.mode);
};
delayedSettings.set_uint('reminder-mode', REMINDER_MODE_STARRED_ONLY);
assert.equal(runtimeReminderMode, REMINDER_MODE_ALL, 'draft mode does not affect runtime before Apply');
assert.equal(applyPendingSettings(delayedSettings), true);
assert.equal(runtimeReminderMode, REMINDER_MODE_STARRED_ONLY,
    'applying the mode changes runtime reminder filtering without restart');

assert.deepEqual(dueReminderKinds(3720), ['1h'], 'the existing one-hour reminder window remains intact');
assert.deepEqual(dueReminderKinds(1020), ['15m'], 'the existing fifteen-minute reminder window remains intact');
assert.deepEqual(dueReminderKinds(0), ['start'], 'the existing start reminder window remains intact');
assert.deepEqual(dueReminderKinds(3600, { oneHour: false }), [], 'disabled reminder slots stay disabled');

assert.equal(snoozedReminderKey(42, 1), 'snooze-42-1');
assert.notEqual(snoozedReminderKey(42, 1), '42-1h', 'a snoozed reminder is not suppressed by the regular sent key');
assert.notEqual(snoozedReminderKey(42, 1), snoozedReminderKey(42, 2),
    'repeated explicit snoozes have distinct send-once keys');
assert.equal(contestHasNotEnded({ id: 42, startTimeSeconds: 100, durationSeconds: 60 }, 159), true);
assert.equal(contestHasNotEnded({ id: 42, startTimeSeconds: 100, durationSeconds: 60 }, 160), false,
    'stale snooze actions are rejected once a contest has ended');

class FakeTimerManager {
    constructor() {
        this.nextId = 1;
        this.entries = new Map();
        this.cancelled = [];
    }

    timeout(delay, callback) {
        if (this.failNext) {
            this.failNext = false;
            return null;
        }
        const id = this.nextId++;
        this.entries.set(id, { delay, callback });
        return id;
    }

    cancel(id) {
        this.cancelled.push(id);
        this.entries.delete(id);
    }

    fire(id) {
        const entry = this.entries.get(id);
        this.entries.delete(id);
        entry.callback();
    }
}

const fakeTimers = new FakeTimerManager();
const snoozed = [];
const scheduleErrors = [];
const snoozes = new SnoozeTimerManager(
    fakeTimers,
    contest => snoozed.push(contest.id),
    contest => scheduleErrors.push(contest.id)
);
const contest = { id: 42, name: 'Codeforces Round 42' };
assert.equal(snoozes.schedule(contest), true);
const firstTimer = [...fakeTimers.entries.keys()][0];
assert.equal(fakeTimers.entries.get(firstTimer).delay, SNOOZE_DELAY_MS,
    'snooze is scheduled five minutes later');
assert.equal(snoozes.schedule(contest), true, 'a new snooze replaces the old timer for this contest');
assert.deepEqual(fakeTimers.cancelled, [firstTimer]);
assert.equal(fakeTimers.entries.size, 1, 'only one snooze timer exists per contest');
fakeTimers.fire([...fakeTimers.entries.keys()][0]);
assert.deepEqual(snoozed, [42], 'the snoozed callback refers to its original contest');
assert.equal(fakeTimers.entries.size, 0, 'fired timer is no longer pending');
snoozes.schedule(contest);
const pendingTimer = [...fakeTimers.entries.keys()][0];
fakeTimers.failNext = true;
assert.equal(snoozes.schedule(contest), false, 'a timer failure is surfaced to the caller');
assert.deepEqual(scheduleErrors, [42], 'a failed timer schedule identifies the affected contest');
assert.equal(fakeTimers.entries.has(pendingTimer), true,
    'a failed replacement leaves the existing snooze intact');
snoozes.destroy();
assert.equal(fakeTimers.entries.size, 0, 'destroy cancels every pending snooze timer');
assert.deepEqual(fakeTimers.cancelled, [firstTimer, pendingTimer]);

assert.equal(isPanelUrgent(900), true, 'panel urgency includes the 15-minute threshold');
assert.equal(isPanelUrgent(901), false, 'panel urgency clears beyond 15 minutes');
assert.equal(isPanelUrgent(0), false, 'a contest that has started is no longer upcoming');
assert.equal(isPanelUrgent(null), false, 'empty states clear panel urgency');

const now = new Date(2026, 9, 20, 23, 58, 0, 0);
const today = new Date(2026, 9, 20, 20, 5, 0, 0);
const tomorrow = new Date(now);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 5, 0, 0);
const later = new Date(now);
later.setDate(later.getDate() + 3);
later.setHours(16, 35, 0, 0);
assert.equal(formatFriendlyStartDate(today.getTime() / 1000, now.getTime()),
    `Today, ${today.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
assert.equal(formatFriendlyStartDate(tomorrow.getTime() / 1000, now.getTime()),
    `Tomorrow, ${tomorrow.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    'local calendar boundaries handle midnight without fixed offset arithmetic');
assert.equal(formatFriendlyStartDate(later.getTime() / 1000, now.getTime()),
    `${later.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${later.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);

console.log('reminder UX tests passed');
