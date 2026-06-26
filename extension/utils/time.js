// time formatting helpers

// seconds left until contest starts
export function secondsUntil(startTimeSeconds) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return startTimeSeconds - nowSeconds;
}

// turns seconds into small text like 2h 14m
export function formatCountdown(seconds) {
    if (seconds <= 0) return 'now';

    const days  = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins  = Math.floor((seconds % 3600) / 60);

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

// contest start date for dropdown
export function formatStartDate(startTimeSeconds) {
    const date = new Date(startTimeSeconds * 1000);
    return date.toLocaleString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// contest duration like 2h 30m
export function formatDuration(durationSeconds) {
    const hours = Math.floor(durationSeconds / 3600);
    const mins  = Math.floor((durationSeconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

// css class based on how close the contest is
export function urgencyClass(seconds) {
    if (seconds > 24 * 3600) return 'cf-urgency-green';
    if (seconds > 6 * 3600)  return 'cf-urgency-yellow';
    if (seconds > 3600)      return 'cf-urgency-orange';
    return 'cf-urgency-red';
}
