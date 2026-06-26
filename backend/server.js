// backend server for cf companion

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cron from 'node-cron';
import fetch from 'node-fetch';

import db from './db.js';
import {
    startBot,
    sendMorningDigest,
    sendContestReminder,
    sendStandingsUpdate,
} from './bot.js';

const app = express();
const PORT = process.env.PORT || 3000;

// middleware

app.use(helmet());
app.use(cors());
app.use(express.json());

// health check

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// pulls latest contests from codeforces and saves it in local db
async function fetchAndStoreContests() {
    try {
        const resp = await fetch('https://codeforces.com/api/contest.list?gym=false', {
            headers: { 'User-Agent': 'CFCompanion-Backend/1.0' },
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();

        if (data.status !== 'OK') {
            throw new Error(`CF API: ${data.comment}`);
        }

        const upsert = db.prepare(`
            INSERT INTO contests (cf_id, name, start_time, duration, phase)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(cf_id) DO UPDATE SET
                name       = excluded.name,
                start_time = excluded.start_time,
                duration   = excluded.duration,
                phase      = excluded.phase,
                fetched_at = datetime('now')
        `);

        // batch insert in a transaction for speed
        const insertAll = db.transaction(contests => {
            for (const c of contests) {
                upsert.run(c.id, c.name, c.startTimeSeconds, c.durationSeconds, c.phase);
            }
        });

        insertAll(data.result);

        const upcoming = data.result.filter(c => c.phase === 'BEFORE');
        console.log(`[Cron] Fetched ${upcoming.length} upcoming contests from CF.`);
        return upcoming;

    } catch (err) {
        console.error(`[Cron] Contest fetch failed: ${err.message}`);
        return [];
    }
}

// checking if telegram reminders are due
async function checkAndSendReminders(contests) {
    const nowSeconds = Math.floor(Date.now() / 1000);

    for (const contest of contests) {
        const cfContest = db.prepare('SELECT * FROM contests WHERE cf_id = ?').get(contest.id);
        if (!cfContest) continue;

        const secondsLeft = contest.startTimeSeconds - nowSeconds;

        if (secondsLeft > 3540 && secondsLeft <= 3660) {
            await sendContestReminder(cfContest, '1h');
        }

        if (secondsLeft > 840 && secondsLeft <= 960) {
            await sendContestReminder(cfContest, '15m');
        }

        if (secondsLeft > -60 && secondsLeft <= 0) {
            await sendContestReminder(cfContest, 'start');
        }
    }
}

// checks recently ended contests and sends standings
async function checkStandings() {
    const now = Math.floor(Date.now() / 1000);

    // ended between now and 10 minutes ago
    const recentlyEnded = db.prepare(`
        SELECT * FROM contests
        WHERE phase = 'FINISHED'
          AND (start_time + duration) BETWEEN ? AND ?
    `).all(now - 600, now);

    for (const contest of recentlyEnded) {
        await sendStandingsUpdate(contest);
    }
}

// cron jobs

// fetch contests every 30 minutes by default
const fetchCron = process.env.FETCH_CRON || '*/30 * * * *';
cron.schedule(fetchCron, async () => {
    const contests = await fetchAndStoreContests();
    await checkAndSendReminders(contests);
});

// check standings every 5 minutes
const standingsCron = process.env.STANDINGS_CRON || '*/5 * * * *';
cron.schedule(standingsCron, async () => {
    await checkStandings();
});

const morningCron = process.env.MORNING_DIGEST_CRON || '0 8 * * *';
cron.schedule(morningCron, async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const contests = db.prepare(`
        SELECT * FROM contests WHERE phase = 'BEFORE' AND start_time > ?
        ORDER BY start_time
    `).all(nowSeconds);

    // convert db rows to the format sendMorningDigest expects
    const mapped = contests.map(c => ({ ...c, start_time: c.start_time }));
    const result = await sendMorningDigest(mapped);
    console.log(`[Cron] Morning digest: ${result.reason}; sent to ${result.sent} user(s).`);
});

// startup

app.listen(PORT, async () => {
    console.log(`[Server] CF Companion backend running on port ${PORT}`);

    // fetch contests immediately on startup
    const contests = await fetchAndStoreContests();
    await checkAndSendReminders(contests);

    // start telegram bot
    startBot();
});

export default app;
