export class SingleTimer {
    constructor(timerManager) {
        this._timers = timerManager;
        this._sourceId = null;
    }

    get isScheduled() {
        return this._sourceId !== null;
    }

    schedule(delayMs, callback) {
        this.cancel();
        this._sourceId = this._timers.timeout(delayMs, () => {
            this._sourceId = null;
            callback();
        });
    }

    scheduleIfMissing(delayMs, callback) {
        if (this.isScheduled)
            return false;
        this.schedule(delayMs, callback);
        return this.isScheduled;
    }

    cancel() {
        if (this._sourceId === null)
            return;
        this._timers.cancel(this._sourceId);
        this._sourceId = null;
    }
}
