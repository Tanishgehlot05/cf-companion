import { filterContests } from './contestFilters.js';
import { formatCountdown } from './time.js';

export const MAX_UPCOMING_CONTESTS = 8;
export const DEFAULT_VISIBLE_UPCOMING_CONTESTS = 3;

function selectContests(contests, isEnabled, nowSeconds, upcomingLimit) {
    const eligible = filterContests(contests, isEnabled, nowSeconds);
    const active = eligible.filter(contest => contestLifecycle(contest, nowSeconds) === 'live')
        .sort((a, b) =>
            (a.startTimeSeconds + a.durationSeconds) - (b.startTimeSeconds + b.durationSeconds) || a.id - b.id);
    const sortedUpcoming = eligible.filter(contest => contestLifecycle(contest, nowSeconds) === 'upcoming')
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.id - b.id);
    const upcoming = upcomingLimit === null
        ? sortedUpcoming
        : sortedUpcoming.slice(0, upcomingLimit);
    return [...active, ...upcoming];
}

export function selectUpcomingContests(contests, isEnabled, nowSeconds = Math.floor(Date.now() / 1000)) {
    return selectContests(contests, isEnabled, nowSeconds, MAX_UPCOMING_CONTESTS);
}

// The panel may reveal all eligible contests, while the existing reminder feed
// retains its original upcoming-contest limit.
export function selectAllUpcomingContests(contests, isEnabled, nowSeconds = Math.floor(Date.now() / 1000)) {
    return selectContests(contests, isEnabled, nowSeconds, null);
}

export function selectVisibleMenuContests(contests, expanded = false, nowSeconds = Math.floor(Date.now() / 1000)) {
    let upcomingCount = 0;
    return contests.filter(contest => {
        const lifecycle = contestLifecycle(contest, nowSeconds);
        if (lifecycle === 'live')
            return true;
        if (lifecycle !== 'upcoming')
            return false;
        upcomingCount++;
        return expanded || upcomingCount <= DEFAULT_VISIBLE_UPCOMING_CONTESTS;
    });
}

export function contestLifecycle(contest, nowSeconds = Math.floor(Date.now() / 1000)) {
    if (!contest || !Number.isFinite(contest.startTimeSeconds) ||
        !Number.isFinite(contest.durationSeconds) || contest.durationSeconds <= 0 ||
        !Number.isFinite(nowSeconds))
        return 'unknown';
    if (contest.phase === 'FINISHED' || contest.startTimeSeconds + contest.durationSeconds <= nowSeconds)
        return 'finished';
    if (contest.phase === 'CODING')
        return 'live';
    if (contest.phase !== 'BEFORE')
        return 'unknown';
    return contest.startTimeSeconds <= nowSeconds ? 'live' : 'upcoming';
}

export function reconcileContestList(previous, fresh, nowSeconds = Math.floor(Date.now() / 1000)) {
    const byId = new Map(fresh.map(contest => [contest.id, contest]));
    for (const contest of previous) {
        if (!byId.has(contest.id) && contestLifecycle(contest, nowSeconds) === 'live')
            byId.set(contest.id, contest);
    }
    return [...byId.values()];
}

export function selectPrimaryActiveContest(contests, starredIds = new Set(), nowSeconds = Math.floor(Date.now() / 1000)) {
    return contests.filter(contest => contestLifecycle(contest, nowSeconds) === 'live')
        .sort((a, b) => {
            const starredOrder = Number(starredIds.has(b.id)) - Number(starredIds.has(a.id));
            return starredOrder ||
                (a.startTimeSeconds + a.durationSeconds) - (b.startTimeSeconds + b.durationSeconds) ||
                a.id - b.id;
        })[0] ?? null;
}

export function panelContestDisplay(contests, mode, starredIds = new Set(), nowSeconds = Math.floor(Date.now() / 1000), stale = false) {
    const primaryLive = selectPrimaryActiveContest(contests, starredIds, nowSeconds);
    if (primaryLive) {
        const remaining = formatCountdown(primaryLive.startTimeSeconds + primaryLive.durationSeconds - nowSeconds);
        const cachedSuffix = stale || primaryLive.phase === 'BEFORE' ? ' · cached' : '';
        if (mode === 2) {
            const name = primaryLive.name.length > 28 ? `${primaryLive.name.slice(0, 27).trimEnd()}…` : primaryLive.name;
            return { contest: primaryLive, live: true, urgent: false,
                text: `CF • ${name} • LIVE · ${remaining}${cachedSuffix}` };
        }
        return { contest: primaryLive, live: true, urgent: false,
            text: mode === 1 ? `LIVE · ${remaining}${cachedSuffix}` : `CF • LIVE · ${remaining}${cachedSuffix}` };
    }

    const next = contests.filter(contest => contestLifecycle(contest, nowSeconds) === 'upcoming')
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.id - b.id)[0] ?? null;
    if (!next)
        return { contest: null, live: false, urgent: false, text: 'CF ✓' };
    const secondsLeft = next.startTimeSeconds - nowSeconds;
    const countdown = formatCountdown(secondsLeft);
    if (mode === 1)
        return { contest: next, live: false, urgent: secondsLeft > 0 && secondsLeft <= 15 * 60, text: countdown };
    if (mode === 2) {
        const name = next.name.length > 28 ? `${next.name.slice(0, 27).trimEnd()}…` : next.name;
        return { contest: next, live: false, urgent: secondsLeft > 0 && secondsLeft <= 15 * 60, text: `CF • ${name} • ${countdown}` };
    }
    return { contest: next, live: false, urgent: secondsLeft > 0 && secondsLeft <= 15 * 60, text: `CF • ${countdown}` };
}

export function upcomingContestViewMode(contests, offline, loading) {
    if (contests.length > 0)
        return 'rows';
    if (loading)
        return 'loading';
    return offline ? 'offline' : 'empty';
}
