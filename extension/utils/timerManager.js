import GLib from 'gi://GLib';

// Owns every extension timeout so its lifetime is explicit and centrally cleaned up.
export class TimerManager {
    constructor() {
        this._sources = new Set();
        this._destroyed = false;
    }

    timeout(delayMs, callback) {
        if (this._destroyed)
            return null;

        let sourceId = null;
        sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delayMs, () => {
            this._sources.delete(sourceId);
            if (this._destroyed)
                return GLib.SOURCE_REMOVE;

            try {
                callback();
            } catch (error) {
                console.error(`[CF Companion] Timer callback failed: ${error.message}`);
            }
            return GLib.SOURCE_REMOVE;
        });
        this._sources.add(sourceId);
        return sourceId;
    }

    cancel(sourceId) {
        if (sourceId === null || !this._sources.delete(sourceId))
            return;
        GLib.source_remove(sourceId);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        for (const sourceId of this._sources)
            GLib.source_remove(sourceId);
        this._sources.clear();
    }
}
