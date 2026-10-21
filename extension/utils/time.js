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

function isSameLocalDate(left, right) {
    return left.getFullYear() === right.getFullYear() &&
        left.getMonth() === right.getMonth() &&
        left.getDate() === right.getDate();
}

export function formatFriendlyStartDate(startTimeSeconds, nowMilliseconds = Date.now()) {
    const date = new Date(startTimeSeconds * 1000);
    const today = new Date(nowMilliseconds);
    const tomorrow = new Date(nowMilliseconds);
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isSameLocalDate(date, today))
        return `Today, ${time}`;
    if (isSameLocalDate(date, tomorrow))
        return `Tomorrow, ${time}`;

    const day = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return `${day}, ${time}`;
}

// contest duration like 2h 30m
export function formatDuration(durationSeconds) {
    const hours = Math.floor(durationSeconds / 3600);
    const mins  = Math.floor((durationSeconds % 3600) / 60);
    return `${hours}h ${mins}m`;
}

// css class based on how close the contest is
export function urgencyClass(seconds) {
    if (seconds > 24 * 3600) return 'cf-countdown-normal';
    if (seconds > 6 * 3600)  return 'cf-urgency-yellow';
    if (seconds > 3600)      return 'cf-urgency-orange';
    return 'cf-urgency-red';
}
