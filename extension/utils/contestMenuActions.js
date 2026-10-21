export function createContestMenuActions(contestId, openContest, setStarred) {
    return {
        open: () => openContest(contestId),
        toggleStar: starred => setStarred(contestId, Boolean(starred)),
    };
}

export function contestUrls(contestId) {
    if (!Number.isSafeInteger(contestId) || contestId <= 0)
        return null;
    const base = `https://codeforces.com/contest/${contestId}`;
    return {
        contest: base,
        problemset: `${base}/problemset`,
        standings: `${base}/standings`,
    };
}
