import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import { normalizeHandle, parseUserInfo, parseUserInfoBatch } from '../utils/userProfile.js';

const API_URL = 'https://codeforces.com/api/';
const PROFILE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class CodeforcesApi {
    constructor() {
        this._session = new Soup.Session();
        this._session.timeout = 30;
        this._cancellables = new Set();
        this._inFlightHandles = new Set();
        this._destroyed = false;
    }

    lookupUser(value, cancellable = new Gio.Cancellable()) {
        let handle;
        try {
            handle = normalizeHandle(value);
        } catch (error) {
            return Promise.reject(error);
        }
        if (this._destroyed)
            return Promise.reject(new Error('Profile service is unavailable.'));
        const requestKey = handle.toLowerCase();
        if (this._inFlightHandles.has(requestKey))
            return Promise.reject(new Error('A request for this handle is already running.'));

        this._inFlightHandles.add(requestKey);
        return this._requestJson(`${API_URL}user.info?handles=${encodeURIComponent(handle)}`, cancellable)
            .then(response => parseUserInfo(response, handle))
            .finally(() => this._inFlightHandles.delete(requestKey));
    }

    lookupUsers(values, cancellable = new Gio.Cancellable()) {
        let handles;
        try {
            handles = [...new Set(values.map(value => normalizeHandle(value)))];
        } catch (error) {
            return Promise.reject(error);
        }
        if (handles.length === 0)
            return Promise.resolve(new Map());
        const encodedHandles = encodeURIComponent(handles.join(';'));
        return this._requestJson(`${API_URL}user.info?handles=${encodedHandles}`, cancellable)
            .then(response => parseUserInfoBatch(response, handles));
    }

    _requestJson(url, cancellable) {
        if (this._destroyed)
            return Promise.reject(new Error('Codeforces service is unavailable.'));
        this._cancellables.add(cancellable);
        return new Promise((resolve, reject) => {
            const message = Soup.Message.new('GET', url);
            if (!message) {
                this._cancellables.delete(cancellable);
                reject(new Error('Could not create the Codeforces request.'));
                return;
            }
            message.request_headers.append('User-Agent', 'CFCompanion-GNOME/1.0');
            this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                cancellable,
                (session, result) => {
                    this._cancellables.delete(cancellable);
                    try {
                        const bytes = session.send_and_read_finish(result);
                        if (this._destroyed || cancellable.is_cancelled())
                            throw new Error('Request cancelled.');
                        const status = message.get_status();
                        if (status === 429) {
                            const error = new Error('Codeforces rate limit reached. Please try again later.');
                            error.rateLimited = true;
                            throw error;
                        }
                        let response;
                        try {
                            response = JSON.parse(new TextDecoder('utf-8').decode(bytes.get_data()));
                        } catch (_error) {
                            throw new Error('Codeforces returned malformed data.');
                        }
                        if (status !== Soup.Status.OK)
                            throw new Error(`Codeforces request failed (HTTP ${status}).`);
                        if (response?.status === 'FAILED') {
                            const error = new Error(typeof response.comment === 'string'
                                ? response.comment
                                : 'Codeforces rejected the request.');
                            error.apiFailure = true;
                            throw error;
                        }
                        resolve(response);
                    } catch (error) {
                        if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.TIMED_OUT))
                            reject(new Error('Codeforces request timed out.'));
                        else
                            reject(error);
                    }
                }
            );
        });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const cancellable of this._cancellables)
            cancellable.cancel();
        this._cancellables.clear();
        this._inFlightHandles.clear();
        this._session.abort();
        this._session = null;
    }
}

export class CodeforcesUserService {
    constructor(timerManager, settings, onUpdate) {
        this._timers = timerManager;
        this._settings = settings;
        this._onUpdate = onUpdate;
        this._api = new CodeforcesApi();
        this._handle = '';
        this._profile = null;
        this._cancellable = null;
        this._profileTimer = null;
        this._generation = 0;
        this._destroyed = false;
        this._settingsSignal = 0;
        try {
            this._settingsSignal = this._settings?.connect('changed::codeforces-handle', () => this._readHandle()) ?? 0;
        } catch (_error) {
            // A missing setting leaves the profile section hidden.
        }
    }

    start() {
        this._readHandle();
    }

    _readHandle() {
        if (this._destroyed)
            return;
        let handle = '';
        try {
            handle = this._settings?.get_string('codeforces-handle').trim() ?? '';
        } catch (_error) {
            handle = '';
        }
        if (handle === this._handle)
            return;

        this._generation++;
        this._cancelProfileTimer();
        this._cancellable?.cancel();
        this._cancellable = null;
        this._handle = handle;
        this._profile = null;
        if (!handle) {
            this._emit('empty', null);
            return;
        }

        let normalizedHandle;
        try {
            normalizedHandle = normalizeHandle(handle);
        } catch (error) {
            this._emit('unavailable', error.message);
            return;
        }

        const generation = this._generation;
        this._fetchProfile(normalizedHandle, generation);
    }

    _fetchProfile(handle, generation) {
        if (!this._isCurrent(generation, handle))
            return;
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        this._emit(this._profile ? 'refreshing' : 'loading', null);
        this._api.lookupUser(handle, cancellable)
            .then(profile => {
                if (!this._isCurrent(generation, handle))
                    return;
                this._profile = profile;
                this._emit('ready', null);
                this._scheduleProfileRefresh(generation, handle);
            })
            .catch(error => {
                if (!this._isCurrent(generation, handle) || cancellable.is_cancelled())
                    return;
                this._emit(this._profile ? 'stale' : 'unavailable', error.message);
                this._scheduleProfileRefresh(generation, handle);
            })
            .finally(() => {
                if (this._isCurrent(generation, handle))
                    this._cancellable = null;
            });
    }

    _scheduleProfileRefresh(generation, handle) {
        this._cancelProfileTimer();
        this._profileTimer = this._timers.timeout(PROFILE_REFRESH_INTERVAL_MS, () => {
            this._profileTimer = null;
            this._fetchProfile(handle, generation);
        });
    }

    _cancelProfileTimer() {
        if (this._profileTimer !== null) {
            this._timers.cancel(this._profileTimer);
            this._profileTimer = null;
        }
    }

    _isCurrent(generation, handle) {
        return !this._destroyed && this._generation === generation && this._handle === handle;
    }

    _emit(state, error) {
        if (this._destroyed || !this._onUpdate)
            return;
        this._onUpdate({ handle: this._handle, profile: this._profile, state, error });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        this._generation++;
        this._cancelProfileTimer();
        this._cancellable?.cancel();
        this._cancellable = null;
        if (this._settings && this._settingsSignal)
            this._settings.disconnect(this._settingsSignal);
        this._settingsSignal = 0;
        this._settings = null;
        this._api.destroy();
        this._profile = null;
        this._onUpdate = null;
    }
}
