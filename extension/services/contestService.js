import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';
import { reconcileContestList, selectAllUpcomingContests, selectUpcomingContests } from '../utils/upcomingContests.js';

const CF_API_URL = 'https://codeforces.com/api/contest.list?gym=false';
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const RETRY_INTERVALS_MS = [2, 5, 10, 30].map(minutes => minutes * 60 * 1000);
const CACHE_VERSION = 1;

function isContest(value) {
    return value !== null && typeof value === 'object' &&
        Number.isSafeInteger(value.id) && value.id > 0 &&
        typeof value.name === 'string' && value.name.length > 0 &&
        typeof value.type === 'string' && value.type.length > 0 &&
        typeof value.phase === 'string' &&
        Number.isFinite(value.startTimeSeconds) && value.startTimeSeconds > 0 &&
        Number.isFinite(value.durationSeconds) && value.durationSeconds > 0;
}

function validateContests(value) {
    if (!Array.isArray(value) || value.some(contest => !isContest(contest)))
        return null;
    return value.map(({ id, name, type, phase, startTimeSeconds, durationSeconds }) => ({
        id, name, type, phase, startTimeSeconds, durationSeconds,
    }));
}

export class ContestService {
    constructor(timerManager, onUpdate, settings = null, onRequestState = null) {
        this._timers = timerManager;
        this._onUpdate = onUpdate;
        this._onRequestState = onRequestState;
        this._settings = settings;
        this._settingsSignals = [];
        if (this._settings) {
            for (const key of ['show-div1', 'show-div2', 'show-div3', 'show-div4', 'show-educational', 'show-global', 'show-other']) {
                this._settingsSignals.push(this._settings.connect(`changed::${key}`, () => this._scheduleFilterUpdate()));
            }
        }
        this._session = new Soup.Session();
        this._session.timeout = 30;
        this._requestCancellable = new Gio.Cancellable();
        this._cacheCancellable = new Gio.Cancellable();
        this._requestRunning = false;
        this._started = false;
        this._retryAttempt = 0;
        this._refreshTimer = null;
        this._filterUpdateTimer = null;
        this._rawContests = [];
        this._staleContestIds = new Set();
        this._lastUpdatedAt = null;
        this._offline = false;
        this._hasFreshContestList = false;

        const cacheDir = GLib.build_filenamev([GLib.get_user_cache_dir(), 'cf-companion']);
        this._cacheDirectory = Gio.File.new_for_path(cacheDir);
        this._cacheFile = this._cacheDirectory.get_child('contests.json');
    }

    start() {
        if (this._started || this._session === null)
            return;
        this._started = true;
        this._loadCache().finally(() => {
            if (this._session !== null)
                this.refresh();
        });
    }

    refresh() {
        if (this._session === null)
            return false;
        if (this._requestRunning) {
            this._notifyRequestState();
            return false;
        }

        if (this._refreshTimer !== null) {
            this._timers.cancel(this._refreshTimer);
            this._refreshTimer = null;
        }

        this._requestRunning = true;
        this._notifyRequestState();
        this._fetchContests()
            .then(contests => {
                if (this._session === null)
                    return;
                const freshIds = new Set(contests.map(contest => contest.id));
                this._rawContests = reconcileContestList(
                    this._rawContests,
                    contests,
                    Math.floor(Date.now() / 1000)
                );
                this._staleContestIds = new Set(this._rawContests
                    .filter(contest => !freshIds.has(contest.id))
                    .map(contest => contest.id));
                this._lastUpdatedAt = Date.now();
                this._offline = false;
                this._hasFreshContestList = true;
                this._retryAttempt = 0;
                this._emit();
                this._saveCache();
                this._schedule(REFRESH_INTERVAL_MS);
            })
            .catch(error => {
                if (this._session === null || this._requestCancellable.is_cancelled() ||
                    error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    return;

                console.error(`[CF Companion] Contest refresh failed: ${error.message}`);
                this._offline = true;
                this._emit();
                const delay = RETRY_INTERVALS_MS[Math.min(this._retryAttempt, RETRY_INTERVALS_MS.length - 1)];
                this._retryAttempt++;
                this._schedule(delay);
            })
            .finally(() => {
                this._requestRunning = false;
                this._notifyRequestState();
            });
        return true;
    }

    _notifyRequestState() {
        if (this._session !== null)
            this._onRequestState?.(this._requestRunning);
    }

    _schedule(delayMs) {
        if (this._session === null)
            return;
        if (this._refreshTimer !== null)
            this._timers.cancel(this._refreshTimer);
        this._refreshTimer = this._timers.timeout(delayMs, () => {
            this._refreshTimer = null;
            this.refresh();
        });
    }

    _scheduleFilterUpdate() {
        if (this._session === null)
            return;
        if (this._filterUpdateTimer !== null)
            this._timers.cancel(this._filterUpdateTimer);
        this._filterUpdateTimer = this._timers.timeout(0, () => {
            this._filterUpdateTimer = null;
            this._emit();
        });
    }

    _fetchContests() {
        return new Promise((resolve, reject) => {
            const message = Soup.Message.new('GET', CF_API_URL);
            if (!message) {
                reject(new Error('Invalid Codeforces API URL'));
                return;
            }
            message.request_headers.append('User-Agent', 'CFCompanion-GNOME/1.0');
            this._session.send_and_read_async(
                message,
                GLib.PRIORITY_DEFAULT,
                this._requestCancellable,
                (session, result) => {
                    try {
                        const bytes = session.send_and_read_finish(result);
                        if (this._session === null || this._requestCancellable.is_cancelled()) {
                            reject(new Error('Request cancelled'));
                            return;
                        }
                        if (message.get_status() !== Soup.Status.OK)
                            throw new Error(`HTTP ${message.get_status()}`);

                        const response = JSON.parse(new TextDecoder('utf-8').decode(bytes.get_data()));
                        if (response.status !== 'OK' || !Array.isArray(response.result))
                            throw new Error(`Codeforces API returned an invalid response${response.comment ? `: ${response.comment}` : ''}`);

                        const contests = validateContests(response.result);
                        if (contests === null)
                            throw new Error('Codeforces API contest list is invalid');
                        resolve(contests);
                    } catch (error) {
                        reject(error);
                    }
                }
            );
        });
    }

    async _loadCache() {
        try {
            const [loaded, bytes] = await new Promise((resolve, reject) => {
                this._cacheFile.load_contents_async(this._cacheCancellable, (file, result) => {
                    try {
                        resolve(file.load_contents_finish(result));
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (this._session === null)
                return;
            if (!loaded)
                throw new Error('Contest cache could not be read');

            const cache = JSON.parse(new TextDecoder('utf-8').decode(bytes));
            const contests = validateContests(cache?.contests);
            if (cache?.version !== CACHE_VERSION || contests === null ||
                !Number.isFinite(cache.updatedAt) || cache.updatedAt <= 0) {
                throw new Error('Cached contest data has an unsupported or invalid format');
            }

            this._rawContests = contests;
            this._staleContestIds = new Set(contests.map(contest => contest.id));
            this._lastUpdatedAt = cache.updatedAt;
            this._emit();
        } catch (error) {
            if (this._session === null || error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED) ||
                error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return;
            console.warn(`[CF Companion] Could not load contest cache: ${error.message}`);
        }
    }

    async _saveCache() {
        const cache = JSON.stringify({
            version: CACHE_VERSION,
            updatedAt: this._lastUpdatedAt,
            contests: this._rawContests,
        });
        try {
            await this._ensureDirectory(this._cacheDirectory);
            if (this._session === null)
                return;

            await new Promise((resolve, reject) => {
                this._cacheFile.replace_contents_async(
                    new TextEncoder().encode(cache),
                    null,
                    false,
                    Gio.FileCreateFlags.REPLACE_DESTINATION,
                    this._cacheCancellable,
                    (file, result) => {
                        try {
                            file.replace_contents_finish(result);
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            });
        } catch (error) {
            if (this._session !== null && !error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                console.warn(`[CF Companion] Could not save contest cache: ${error.message}`);
        }
    }

    async _ensureDirectory(directory) {
        try {
            await new Promise((resolve, reject) => {
                directory.make_directory_async(GLib.PRIORITY_DEFAULT, this._cacheCancellable, (file, result) => {
                    try {
                        file.make_directory_finish(result);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });
            });
        } catch (error) {
            if (error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                return;
            if (!error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw error;
            const parent = directory.get_parent();
            if (parent === null)
                throw error;
            await this._ensureDirectory(parent);
            await this._ensureDirectory(directory);
        }
    }

    _emit() {
        if (this._session === null)
            return;
        const isEnabled = (key, fallback) => {
            if (!this._settings)
                return fallback;
            return this._settings.get_boolean(key);
        };
        const contests = selectUpcomingContests(this._rawContests, isEnabled);
        const displayContests = selectAllUpcomingContests(this._rawContests, isEnabled);
        this._onUpdate({
            contests,
            displayContests,
            finishedContestIds: this._hasFreshContestList && !this._offline
                ? this._rawContests.filter(contest => contest.phase === 'FINISHED').map(contest => contest.id)
                : [],
            offline: this._offline,
            stale: !this._hasFreshContestList || this._offline,
            staleContestIds: [...this._staleContestIds],
            lastUpdatedAt: this._lastUpdatedAt,
        });
    }

    destroy() {
        if (this._session === null)
            return;
        if (this._refreshTimer !== null) {
            this._timers.cancel(this._refreshTimer);
            this._refreshTimer = null;
        }
        if (this._filterUpdateTimer !== null) {
            this._timers.cancel(this._filterUpdateTimer);
            this._filterUpdateTimer = null;
        }
        this._requestCancellable.cancel();
        this._cacheCancellable.cancel();
        if (this._settings) {
            for (const signal of this._settingsSignals)
                this._settings.disconnect(signal);
        }
        this._settingsSignals = [];
        this._settings = null;
        this._session.abort();
        this._session = null;
        this._onUpdate = null;
        this._onRequestState = null;
    }
}
