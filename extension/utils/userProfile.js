const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{1,24}$/;

function validInteger(value, minimum = 0) {
    return Number.isSafeInteger(value) && value >= minimum;
}

export function normalizeHandle(value) {
    if (typeof value !== 'string')
        throw new Error('Enter a Codeforces handle.');
    const handle = value.trim();
    if (!HANDLE_PATTERN.test(handle))
        throw new Error('Use 1–24 letters, numbers, underscores, dots, or dashes.');
    return handle;
}

export function parseUserInfo(response, expectedHandle) {
    if (!response || typeof response !== 'object' || Array.isArray(response))
        throw new Error('Codeforces returned an invalid response.');
    if (response.status !== 'OK') {
        const comment = typeof response.comment === 'string' ? response.comment : '';
        throw new Error(comment || 'Codeforces could not find that user.');
    }
    if (!Array.isArray(response.result) || response.result.length !== 1)
        throw new Error('Codeforces returned an invalid user record.');

    const user = response.result[0];
    if (!user || typeof user !== 'object' || Array.isArray(user) ||
        typeof user.handle !== 'string' ||
        user.handle.toLowerCase() !== expectedHandle.toLowerCase()) {
        throw new Error('Codeforces returned an invalid user record.');
    }

    let rating = null;
    if (user.rating !== undefined) {
        if (!Number.isSafeInteger(user.rating) || user.rating < 0)
            throw new Error('Codeforces returned an invalid rating.');
        rating = user.rating;
    }
    if (user.rank !== undefined && typeof user.rank !== 'string')
        throw new Error('Codeforces returned an invalid rank.');

    const rank = rating === null || !user.rank?.trim() ? 'unrated' : user.rank.trim();
    return { handle: user.handle, rating, rank };
}

export function parseUserInfoBatch(response, requestedHandles) {
    if (response?.status !== 'OK' || !Array.isArray(response.result))
        throw new Error('Codeforces returned invalid friend profile data.');

    const requested = new Set(requestedHandles.map(handle => handle.toLowerCase()));
    const profiles = new Map();
    for (const user of response.result) {
        if (!user || typeof user !== 'object' || Array.isArray(user) ||
            typeof user.handle !== 'string' || !HANDLE_PATTERN.test(user.handle) ||
            !requested.has(user.handle.toLowerCase()))
            continue;
        if (user.rating !== undefined && !validInteger(user.rating))
            continue;
        if (user.rank !== undefined && typeof user.rank !== 'string')
            continue;

        const rating = user.rating ?? null;
        const rank = rating === null || !user.rank?.trim() ? 'unrated' : user.rank.trim();
        profiles.set(user.handle.toLowerCase(), { handle: user.handle, rating, rank });
    }
    return profiles;
}

export function sortFriendProfiles(profiles) {
    return [...profiles].sort((a, b) => {
        const ratedA = Number.isSafeInteger(a.rating);
        const ratedB = Number.isSafeInteger(b.rating);
        if (ratedA !== ratedB)
            return ratedA ? -1 : 1;
        if (ratedA && a.rating !== b.rating)
            return b.rating - a.rating;
        return a.handle.localeCompare(b.handle, undefined, { sensitivity: 'base' });
    });
}

export function rankStyleClass(rank) {
    const key = typeof rank === 'string' ? rank.trim().toLowerCase() : '';
    const classes = new Map([
        ['newbie', 'cf-rank-newbie'],
        ['pupil', 'cf-rank-pupil'],
        ['specialist', 'cf-rank-specialist'],
        ['expert', 'cf-rank-expert'],
        ['candidate master', 'cf-rank-candidate-master'],
        ['master', 'cf-rank-master'],
        ['international master', 'cf-rank-international-master'],
        ['grandmaster', 'cf-rank-grandmaster'],
        ['international grandmaster', 'cf-rank-international-grandmaster'],
        ['legendary grandmaster', 'cf-rank-legendary-grandmaster'],
    ]);
    return classes.get(key) ?? 'cf-rank-neutral';
}

export function normalizeFriends(value) {
    if (!Array.isArray(value))
        return [];
    const friends = [];
    const seen = new Set();
    for (const entry of value) {
        let handle;
        try {
            handle = normalizeHandle(entry);
        } catch (_error) {
            continue;
        }
        const key = handle.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        friends.push(handle);
        if (friends.length === 10)
            break;
    }
    return friends;
}

export function hasFriend(friends, handle) {
    const key = handle.toLowerCase();
    return friends.some(friend => friend.toLowerCase() === key);
}
