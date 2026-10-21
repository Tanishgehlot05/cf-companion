export function applyPendingSettings(settings, onApplied = () => {}) {
    if (!settings.get_has_unapplied())
        return false;

    settings.apply();
    onApplied();
    return true;
}

export function discardPendingSettings(settings, onDiscarded = () => {}) {
    if (!settings.get_has_unapplied())
        return false;

    settings.revert();
    onDiscarded();
    return true;
}
