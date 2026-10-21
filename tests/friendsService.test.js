import { FriendsService } from '../extension/services/friendsService.js';

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
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

    fireNext() {
        const [id, callback] = this.callbacks.entries().next().value ?? [];
        if (id === undefined)
            return false;
        this.callbacks.delete(id);
        callback();
        return true;
    }
}

class FakeSettings {
    constructor(friends) {
        this.friends = friends;
        this.callback = null;
    }

    connect(_signal, callback) {
        this.callback = callback;
        return 1;
    }

    disconnect() {
        this.callback = null;
    }

    get_strv() {
        return this.friends;
    }

    setFriends(friends) {
        this.friends = friends;
        this.callback?.();
    }
}

const flush = async () => {
    for (let i = 0; i < 8; i++)
        await Promise.resolve();
};

const names = ['alpha', 'beta'];
const settings = new FakeSettings(names);
const timers = new FakeTimerManager();
const states = [];
const service = new FriendsService(timers, settings, state => states.push(state));
const requests = [];
service._api.lookupUsers = handles => new Promise((resolve, reject) => {
    requests.push({ handles, resolve, reject });
});
service.start();
assert(requests.length === 1, 'saved friends trigger one batched profile request at start');
assert(states.at(-1).friends.every(friend => friend.status === 'loading'),
    'friend rows show a loading state during the profile request');

const profilesFor = handles => new Map(handles.map((handle, index) => [handle.toLowerCase(), {
    handle, rating: 2000 - index * 100, rank: 'expert',
}]));
requests[0].resolve(profilesFor(requests[0].handles));
await flush();
assert(states.at(-1).friends.every(friend => friend.status === 'ready'),
    'successful profile data updates friend rows');
assert(states.at(-1).friends.map(friend => friend.handle).join(',') === 'alpha,beta',
    'saved friend order breaks equal-profile sorting deterministically by handle');

const added = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu'];
settings.setFriends(added);
assert(requests.length === 2, 'adding friends schedules one refresh for the new saved list');
assert(requests[1].handles.length === 10, 'the service respects the existing ten-friend limit');
requests[1].resolve(profilesFor(requests[1].handles));
await flush();
assert(states.at(-1).friends.length === 10, 'ten friends remain available in the emitted leaderboard');

settings.setFriends(['alpha', 'gamma', 'delta']);
assert(requests.length === 3, 'removing friends refreshes the current saved list');
requests[2].resolve(profilesFor(requests[2].handles));
await flush();
assert(states.at(-1).friends.map(friend => friend.handle).length === 3,
    'removed friends are removed from the emitted leaderboard');

timers.fireNext();
assert(requests.length === 4, 'the hourly timer refreshes friend profiles');
requests[3].reject(new Error('simulated offline failure'));
await flush();
assert(states.at(-1).friends.find(friend => friend.handle === 'alpha').status === 'stale',
    'a failed refresh retains the last profile and marks it stale');
assert(states.at(-1).friends.find(friend => friend.handle === 'alpha').rating === 2000,
    'a failed refresh does not erase the last known rating');

timers.fireNext();
assert(requests.length === 5, 'friend refresh remains scheduled after a failure');
const updateCount = states.length;
service.destroy();
requests[4].resolve(profilesFor(requests[4].handles));
await flush();
assert(states.length === updateCount, 'a late response after destroy cannot update the UI');
assert(timers.callbacks.size === 0, 'destroy cancels the friend refresh timer');

print('friends service tests passed');
