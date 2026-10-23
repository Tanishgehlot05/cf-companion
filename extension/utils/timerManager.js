import GLib from 'gi://GLib';

// Owns every extension timeout so its lifetime is explicit and centrally cleaned up.
export class TimerManager {
    constructor() {
        this._sources = new Set();
    }

    timeout(delayMs, callback) {
        if (this._sources === null)
            return null;

        let sourceId = null;
        sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._sources.delete(sourceId);
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this._sources.add(sourceId);
        return sourceId;
    }

    cancel(sourceId) {
        if (this._sources === null || sourceId === null || !this._sources.delete(sourceId))
            return;
        GLib.source_remove(sourceId);
    }

    destroy() {
        if (this._sources === null)
            return;
        for (const sourceId of this._sources)
            GLib.source_remove(sourceId);
        this._sources.clear();
        this._sources = null;
    }
}
