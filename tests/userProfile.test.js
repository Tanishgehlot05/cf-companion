import {
    hasFriend,
    normalizeFriends,
    normalizeHandle,
    parseUserInfoBatch,
    parseUserInfo,
    rankStyleClass,
    sortFriendProfiles,
} from '../extension/utils/userProfile.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

function assertThrows(callback, message) {
    let threw = false;
    try {
        callback();
    } catch (_error) {
        threw = true;
    }
    assert(threw, message);
}

assert(normalizeHandle('  tourist  ') === 'tourist', 'handle is trimmed');
assert(normalizeHandle('legacy.name-1') === 'legacy.name-1', 'legacy dots and dashes are accepted');
assertThrows(() => normalizeHandle('bad handle'), 'invalid characters are rejected');

const rated = parseUserInfo({
    status: 'OK',
    result: [{ handle: 'tourist', rating: 3858, rank: 'legendary grandmaster' }],
}, 'tourist');
assert(rated.rating === 3858 && rated.rank === 'legendary grandmaster', 'rated profile is parsed');

const unrated = parseUserInfo({ status: 'OK', result: [{ handle: 'new_user' }] }, 'new_user');
assert(unrated.rating === null && unrated.rank === 'unrated', 'unrated profile is explicit');
assertThrows(() => parseUserInfo({ status: 'FAILED', comment: 'not found' }, 'unknown'), 'failed API result is rejected');
assertThrows(() => parseUserInfo({ status: 'OK', result: [] }, 'tourist'), 'malformed API result is rejected');
assert(rankStyleClass('expert') === 'cf-rank-expert', 'known rank maps to a safe class');
assert(rankStyleClass('unexpected rank') === 'cf-rank-neutral', 'unknown rank uses neutral class');

const friends = normalizeFriends([
    'alpha', 'Alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta',
    'eta', 'theta', 'iota', 'kappa', 'lambda', 'bad handle',
]);
assert(friends.length === 10, 'friend list is limited to ten');
assert(friends.length === new Set(friends.map(friend => friend.toLowerCase())).size, 'friends are deduplicated case-insensitively');
assert(hasFriend(friends, 'ALPHA'), 'duplicate comparison is case-insensitive');

const batch = parseUserInfoBatch({
    status: 'OK',
    result: [
        { handle: 'alpha', rating: 2100, rank: 'master' },
        { handle: 'beta' },
        { handle: 'unrequested', rating: 9999, rank: 'legendary grandmaster' },
    ],
}, ['alpha', 'beta']);
assert(batch.size === 2, 'batch profile parsing only returns requested friend handles');
assert(batch.get('beta').rating === null && batch.get('beta').rank === 'unrated',
    'unrated friends have an explicit neutral profile');
const sorted = sortFriendProfiles([
    { handle: 'zeta', rating: null },
    { handle: 'beta', rating: 1200 },
    { handle: 'alpha', rating: 2000 },
    { handle: 'gamma', rating: null },
]);
assert(sorted.map(profile => profile.handle).join(',') === 'alpha,beta,gamma,zeta',
    'friend leaderboard sorts rated profiles by rating, then unrated handles alphabetically');

print('userProfile tests passed');
