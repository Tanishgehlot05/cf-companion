export const SNOOZE_DELAY_MS = 5 * 60 * 1000;

export class SnoozeTimerManager {
    constructor(timerManager, onFire, onScheduleError) {
        this._timers = timerManager;
        this._onFire = onFire;
        this._onScheduleError = onScheduleError;
        this._timersByContest = new Map();
        this._destroyed = false;
    }

    schedule(contest) {
        if (this._destroyed || !Number.isSafeInteger(contest?.id) || contest.id <= 0)
            return false;

        const previousTimerId = this._timersByContest.get(contest.id);
        let timerId = null;
        timerId = this._timers.timeout(SNOOZE_DELAY_MS, () => {
            if (this._timersByContest.get(contest.id) !== timerId)
                return;
            this._timersByContest.delete(contest.id);
            if (!this._destroyed)
                this._onFire?.(contest);
        });

        if (timerId === null) {
            this._onScheduleError?.(contest);
            return false;
        }
        if (previousTimerId !== undefined)
            this._timers.cancel(previousTimerId);
        this._timersByContest.set(contest.id, timerId);
        return true;
    }

    cancel(contestId) {
        const timerId = this._timersByContest.get(contestId);
        if (timerId === undefined)
            return;
        this._timersByContest.delete(contestId);
        this._timers.cancel(timerId);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const timerId of this._timersByContest.values())
            this._timers.cancel(timerId);
        this._timersByContest.clear();
        this._timers = null;
        this._onFire = null;
        this._onScheduleError = null;
    }
}
