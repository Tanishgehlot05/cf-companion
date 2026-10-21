const STANDARD_ROUND_PATTERN = /^Codeforces Round\b/i;
const EMBEDDED_ROUND_PATTERN = /\(\s*Codeforces Round\b/i;
const EDUCATIONAL_PATTERN = /^Educational Codeforces Round\b/i;
const GLOBAL_PATTERN = /^Codeforces Global Round\b/i;
const DIVISION_PATTERN = /\bDiv(?:ision)?\.?\s*([1-4])\b/gi;

export function classifyContest(contest) {
    const name = typeof contest?.name === 'string' ? contest.name.trim() : '';
    const categories = new Set();

    if (EDUCATIONAL_PATTERN.test(name)) {
        categories.add('educational');
        return categories;
    }
    if (GLOBAL_PATTERN.test(name)) {
        categories.add('global');
        return categories;
    }

    if (!STANDARD_ROUND_PATTERN.test(name) && !EMBEDDED_ROUND_PATTERN.test(name))
        return categories;

    // Standard rounds may omit a numeric round identifier. Branded rounds
    // include the explicit “Codeforces Round” marker in parentheses.
    const divisionsText = name.match(/\([^)]*\)/g)?.join(' ') ?? name;
    for (const match of divisionsText.matchAll(DIVISION_PATTERN)) {
        categories.add(`div${match[1]}`);
    }
    return categories;
}

export function contestCategoryLabel(contest) {
    const categories = classifyContest(contest);
    const divisions = ['div1', 'div2', 'div3', 'div4']
        .filter(category => categories.has(category))
        .map(category => `Div. ${category.slice(3)}`);

    if (divisions.length > 0)
        return divisions.join(' + ');
    if (categories.has('educational'))
        return 'Educational';
    if (categories.has('global'))
        return 'Global';
    return 'Other';
}

export function isContestVisible(contest, isEnabled) {
    const categories = classifyContest(contest);
    if (categories.size === 0)
        return isEnabled('show-other', true);
    return [...categories].some(category => isEnabled(`show-${category}`, true));
}

export function filterContests(contests, isEnabled, nowSeconds = Math.floor(Date.now() / 1000)) {
    return contests.filter(contest =>
        (contest.phase === 'BEFORE' || contest.phase === 'CODING') &&
        contest.startTimeSeconds + contest.durationSeconds > nowSeconds &&
        isContestVisible(contest, isEnabled));
}
