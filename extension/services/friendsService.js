import Gio from 'gi://Gio';

import { CodeforcesApi } from './codeforcesUserService.js';
import { normalizeFriends, sortFriendProfiles } from '../utils/userProfile.js';

const FRIEND_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const FALLBACK_REQUEST_GAP_MS = 1100;

export class FriendsService {
    constructor(timerManager, settings, onUpdate) {
        this._timers = timerManager;
        this._settings = settings;
        this._onUpdate = onUpdate;
        this._api = new CodeforcesApi();
        this._destroyed = false;
        this._started = false;
        this._friends = [];
        this._friendProfiles = new Map();
        this._friendFailed = new Set();
        this._friendRequestRunning = false;
        this._friendRefreshAgain = false;
        this._friendError = false;
        this._friendCancellable = null;
        this._friendTimer = null;
        this._settingsSignal = 0;
        this._delaySources = new Map();

        try {
            this._settingsSignal = this._settings?.connect('changed::friends', () => this._readFriends()) ?? 0;
        } catch (_error) {
            // Missing friend settings leave the leaderboard empty.
        }
    }

    start() {
        if (this._started || this._destroyed)
            return;
        this._started = true;
        this._readFriends();
    }

    _readFriends() {
        if (this._destroyed)
            return;
        let friends = [];
        try {
            friends = normalizeFriends(this._settings?.get_strv('friends'));
        } catch (_error) {
            friends = [];
        }

        const oldKeys = this._friends.map(handle => handle.toLowerCase()).join(',');
        const newKeys = friends.map(handle => handle.toLowerCase()).join(',');
        if (oldKeys === newKeys)
            return;

        this._friends = friends;
        this._emit();
        if (this._friendRequestRunning) {
            this._friendRefreshAgain = true;
            this._friendCancellable?.cancel();
        } else {
            this._refreshFriends(true);
        }
    }

    _refreshFriends(force = false) {
        if (this._destroyed)
            return;
        if (this._friends.length === 0) {
            this._cancelFriendTimer();
            this._friendError = false;
            this._emit();
            return;
        }
        if (this._friendRequestRunning) {
            this._friendRefreshAgain ||= force;
            return;
        }

        this._cancelFriendTimer();
        const requestedHandles = [...this._friends];
        const cancellable = new Gio.Cancellable();
        this._friendCancellable = cancellable;
        this._friendRequestRunning = true;
        this._friendError = false;
        this._emit();
        this._api.lookupUsers(requestedHandles, cancellable)
            .then(profiles => {
                if (!this._destroyed && !cancellable.is_cancelled())
                    this._storeFriendProfiles(profiles, requestedHandles);
            })
            .catch(async error => {
                if (this._destroyed || cancellable.is_cancelled())
                    return;
                if (error.apiFailure)
                    await this._lookupFriendsIndividually(requestedHandles, cancellable);
                else {
                    this._friendError = true;
                    for (const handle of requestedHandles)
                        this._friendFailed.add(handle.toLowerCase());
                }
            })
            .finally(() => {
                if (this._destroyed)
                    return;
                this._friendRequestRunning = false;
                this._friendCancellable = null;
                this._emit();
                if (this._friendRefreshAgain) {
                    this._friendRefreshAgain = false;
                    this._refreshFriends(true);
                } else {
                    this._scheduleFriendRefresh();
                }
            });
    }

    async _lookupFriendsIndividually(handles, cancellable) {
        const profiles = new Map();
        const failedHandles = new Set();
        let failed = false;
        for (let index = 0; index < handles.length; index++) {
            if (this._destroyed || cancellable.is_cancelled())
                return;
            if (index > 0)
                await this._delay(FALLBACK_REQUEST_GAP_MS);
            if (this._destroyed || cancellable.is_cancelled())
                return;
            try {
                const profile = await this._api.lookupUser(handles[index], cancellable);
                profiles.set(profile.handle.toLowerCase(), profile);
            } catch (_error) {
                failed = true;
                failedHandles.add(handles[index].toLowerCase());
            }
        }
        if (!this._destroyed && !cancellable.is_cancelled()) {
            this._storeFriendProfiles(profiles, handles);
            this._friendFailed = failedHandles;
            this._friendError = failed;
        }
    }

    _storeFriendProfiles(profiles, requestedHandles) {
        const now = Date.now();
        this._friendFailed.clear();
        for (const [key, profile] of profiles) {
            this._friendProfiles.set(key, { ...profile, updatedAt: now });
            this._friendFailed.delete(key);
        }
        for (const handle of requestedHandles) {
            const key = handle.toLowerCase();
            if (!profiles.has(key))
                this._friendFailed.add(key);
        }
        this._friendError = false;
    }

    _scheduleFriendRefresh() {
        if (this._destroyed || this._friends.length === 0)
            return;
        this._cancelFriendTimer();
        this._friendTimer = this._timers.timeout(FRIEND_REFRESH_INTERVAL_MS, () => {
            this._friendTimer = null;
            this._refreshFriends();
        });
    }

    _cancelFriendTimer() {
        if (this._friendTimer !== null) {
            this._timers.cancel(this._friendTimer);
            this._friendTimer = null;
        }
    }

    _delay(delayMs) {
        return new Promise(resolve => {
            let source = null;
            source = this._timers.timeout(delayMs, () => {
                this._delaySources.delete(source);
                resolve();
            });
            if (source !== null)
                this._delaySources.set(source, resolve);
            else
                resolve();
        });
    }

    _emit() {
        if (this._destroyed || !this._onUpdate)
            return;
        const friends = sortFriendProfiles(this._friends.map(handle => {
            const key = handle.toLowerCase();
            const profile = this._friendProfiles.get(key);
            return {
                handle: profile?.handle ?? handle,
                rating: profile?.rating ?? null,
                rank: profile?.rank ?? 'unrated',
                status: profile ? (this._friendRequestRunning ? 'refreshing'
                    : this._friendFailed.has(key) ? 'stale' : 'ready')
                    : this._friendRequestRunning ? 'loading' : this._friendFailed.has(key) ? 'unavailable' : 'loading',
            };
        }));
        this._onUpdate({
            friends,
            friendsState: this._friends.length === 0 ? 'empty' : this._friendRequestRunning ? 'loading'
                : this._friendError && friends.every(friend => friend.status === 'unavailable') ? 'unavailable' : 'ready',
        });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._cancelFriendTimer();
        this._friendCancellable?.cancel();
        this._friendCancellable = null;
        for (const [source, resolve] of this._delaySources) {
            this._timers.cancel(source);
            resolve();
        }
        this._delaySources.clear();
        if (this._settings && this._settingsSignal)
            this._settings.disconnect(this._settingsSignal);
        this._settingsSignal = 0;
        this._settings = null;
        this._api.destroy();
        this._friendProfiles.clear();
        this._friendFailed.clear();
        this._friends = [];
        this._onUpdate = null;
    }
}
