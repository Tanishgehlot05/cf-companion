export const REMINDER_MODE_ALL = 0;
export const REMINDER_MODE_STARRED_ONLY = 1;
export const REMINDER_MODE_DEFAULT = REMINDER_MODE_ALL;
export const PANEL_URGENCY_THRESHOLD_SECONDS = 15 * 60;

export function normalizeReminderMode(value) {
    return value === REMINDER_MODE_STARRED_ONLY
        ? REMINDER_MODE_STARRED_ONLY
        : REMINDER_MODE_DEFAULT;
}

export function readStarredContestIds(values) {
    if (!Array.isArray(values))
        return new Set();

    const ids = new Set();
    for (const value of values) {
        if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
            continue;
        const id = Number(value);
        if (Number.isSafeInteger(id) && String(id) === value)
            ids.add(id);
    }
    return ids;
}

export function serializeStarredContestIds(ids) {
    return [...ids]
        .filter(id => Number.isSafeInteger(id) && id > 0)
        .sort((a, b) => a - b)
        .map(String);
}

export function setContestStarred(values, contestId, starred) {
    const ids = readStarredContestIds(values);
    if (starred)
        ids.add(contestId);
    else
        ids.delete(contestId);
    return serializeStarredContestIds(ids);
}

export function removeFinishedStarredContestIds(values, finishedContestIds) {
    const finishedIds = new Set(finishedContestIds.filter(id => Number.isSafeInteger(id) && id > 0));
    const current = readStarredContestIds(values);
    return serializeStarredContestIds([...current].filter(id => !finishedIds.has(id)));
}

export function shouldSendRegularReminder(contestId, reminderMode, starredIds) {
    return normalizeReminderMode(reminderMode) !== REMINDER_MODE_STARRED_ONLY ||
        starredIds.has(contestId);
}

export function snoozedReminderKey(contestId, sequence) {
    return `snooze-${contestId}-${sequence}`;
}

export function contestHasNotEnded(contest, nowSeconds = Math.floor(Date.now() / 1000)) {
    return Number.isSafeInteger(contest?.id) && contest.id > 0 &&
        Number.isFinite(contest.startTimeSeconds) && Number.isFinite(contest.durationSeconds) &&
        contest.startTimeSeconds + contest.durationSeconds > nowSeconds;
}

export function dueReminderKinds(secondsLeft, enabled = {}) {
    const kinds = [];
    if (enabled.oneHour !== false && secondsLeft > 3480 && secondsLeft <= 3720)
        kinds.push('1h');
    if (enabled.fifteenMinutes !== false && secondsLeft > 780 && secondsLeft <= 1020)
        kinds.push('15m');
    if (enabled.atStart !== false && secondsLeft > -240 && secondsLeft <= 0)
        kinds.push('start');
    return kinds;
}

export function isPanelUrgent(secondsLeft) {
    return Number.isFinite(secondsLeft) && secondsLeft > 0 &&
        secondsLeft <= PANEL_URGENCY_THRESHOLD_SECONDS;
}
