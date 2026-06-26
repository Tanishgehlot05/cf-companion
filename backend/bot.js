// Telegram bot for CF Companion.
import fetch from 'node-fetch';
import db from './db.js';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API   = `https://api.telegram.org/bot${TOKEN}`;

let _offset = 0;  

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

//send message to telegram
async function sendMessage(chatId, text, parseMode = 'HTML') {
    try {
        const resp = await fetch(`${API}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: parseMode,
                disable_web_page_preview: true,
            }),
        });

        if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(`HTTP ${resp.status}: ${errorText}`);
        }
    } catch (err) {
        console.error(`[Bot] Failed to send message to ${chatId}: ${err.message}`);
        throw err;
    }
}

//handling incoming telegram pre defined command from the user side
async function handleMessage(msg) {
    const chatId = String(msg.chat.id);
    const text   = (msg.text || '').trim();

    if (!text.startsWith('/')) return;

    const [command, ...args] = text.split(/\s+/);

    switch (command.split('@')[0]) { 
        case '/start':
            // Register the user if they're new
            db.prepare(`
                INSERT OR IGNORE INTO users (telegram_id) VALUES (?)
            `).run(chatId);

            await sendMessage(chatId,
                `👋 <b>Welcome to CF Companion!</b>\n\n` +
                `I'll send you Codeforces contest reminders and compare your standings with friends.\n\n` +
                `To get started, set your handle:\n<code>/add YourCFHandle</code>\n\n` +
                `Type /help to see all commands.`
            );
            break;

        case '/help':
            await sendMessage(chatId,
                `<b>CF Companion Commands</b>\n\n` +
                `/add &lt;handle&gt; — Add yourself or a friend\n` +
                `/remove &lt;handle&gt; — Remove a friend\n` +
                `/friends — See your friend list\n` +
                `/help — Show this message`
            );
            break;

        case '/add': {
            const handle = args[0];

            if (!handle) {
                await sendMessage(chatId, '⚠️ Usage: <code>/add YourHandle</code>');
                break;
            }

            
            const clean = handle.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);

            if (!clean) {
                await sendMessage(chatId, '⚠️ That doesn\'t look like a valid CF handle.');
                break;
            }

            // if doing /add first time then its sets the user then after it adds friend
            const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(chatId);

            if (!user || !user.cf_handle) {
                //if first /add
                //sql calls
                db.prepare(`
                    INSERT INTO users (telegram_id, cf_handle)
                    VALUES (?, ?)
                    ON CONFLICT(telegram_id) DO UPDATE SET cf_handle = excluded.cf_handle
                `).run(chatId, clean);

                await sendMessage(chatId,
                    `✅ Your Codeforces handle is set to <b>${escapeHtml(clean)}</b>.\n\n` +
                    `You'll receive contest reminders and standings updates.\n` +
                    `Add friends with /add &lt;their_handle&gt;`
                );
            } else {
                // if user already set then just add friend
                db.prepare(`
                    INSERT OR IGNORE INTO friends (user_id, friend_handle) VALUES (?, ?)
                `).run(chatId, clean);

                await sendMessage(chatId, `✅ Added <b>${escapeHtml(clean)}</b> to your friend list.`);
            }
            break;
        }

        case '/remove': {
            const handle = args[0];

            if (!handle) {
                await sendMessage(chatId, '⚠️ Usage: <code>/remove HandleToRemove</code>');
                break;
            }

            const clean = handle.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 64);
            const result = db.prepare(`
                DELETE FROM friends WHERE user_id = ? AND friend_handle = ?
            `).run(chatId, clean);

            if (result.changes === 0) {
                await sendMessage(chatId, `⚠️ <b>${escapeHtml(clean)}</b> wasn't in your friend list.`);
            } else {
                await sendMessage(chatId, `✅ Removed <b>${escapeHtml(clean)}</b> from your friend list.`);
            }
            break;
        }

        case '/friends': {
            const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(chatId);

            if (!user) {
                await sendMessage(chatId, '⚠️ You haven\'t set up yet. Use /start first.');
                break;
            }

            const friends = db
                .prepare('SELECT friend_handle FROM friends WHERE user_id = ?')
                .all(chatId);

            if (friends.length === 0) {
                await sendMessage(chatId,
                    `You have no friends added yet.\nYour handle: <b>${escapeHtml(user.cf_handle || 'not set')}</b>\n\n` +
                    `Add friends: /add &lt;handle&gt;`
                );
            } else {
                const list = friends.map(f => `• ${escapeHtml(f.friend_handle)}`).join('\n');
                await sendMessage(chatId,
                    `<b>Your handle:</b> ${escapeHtml(user.cf_handle || 'not set')}\n\n<b>Friends:</b>\n${list}`
                );
            }
            break;
        }

        default:
            // Ignore unknown commands silently
            break;
    }
}

//morning digest at 8:AM
export async function sendMorningDigest(contests) {
    if (contests.length === 0) {
        return { sent: 0, reason: 'no upcoming contests' };
    }

    const users = db.prepare('SELECT telegram_id FROM users WHERE cf_handle IS NOT NULL').all();
    if (users.length === 0) {
        return { sent: 0, reason: 'no registered users with CF handles' };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const todayContests = contests.filter(c => {
        const start = new Date(c.start_time * 1000);
        return start >= todayStart && start < tomorrowStart;
    });

    const digestContests = todayContests.length > 0
        ? todayContests
        : contests
            .slice()
            .sort((a, b) => a.start_time - b.start_time)
            .slice(0, 3);

    let message = todayContests.length > 0
        ? `🌅 <b>Today's Contests</b>\n\n`
        : `🌅 <b>No Codeforces contests today</b>\n\nNext upcoming:\n`;

    for (const c of digestContests) {
        const start = new Date(c.start_time * 1000);
        const time = start.toLocaleString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
        message += `• <b>${escapeHtml(c.name)}</b>\n  ⏰ ${escapeHtml(time)}\n`;
    }

    let sent = 0;
    for (const user of users) {
        try {
            await sendMessage(user.telegram_id, message);
            sent++;
        } catch {
            // sendMessage already logs the Telegram API error with the chat id.
        }
    }

    return {
        sent,
        reason: todayContests.length > 0 ? 'today contests' : 'no contests today',
    };
}


// contest reminder through telegram 
export async function sendContestReminder(contest, reminderType) {
    const users = db.prepare('SELECT telegram_id FROM users WHERE cf_handle IS NOT NULL').all();

    const emoji = reminderType === 'start' ? '🚀' : '⏰';
    const timeStr = reminderType === 'start'
        ? 'is starting now!'
        : `starts in ${reminderType}`;

    const message =
        `${emoji} <b>${escapeHtml(contest.name)}</b>\n` +
        `${timeStr}\n` +
        `<a href="https://codeforces.com/contests/${contest.cf_id}">Open contest →</a>`;

    for (const user of users) {
        // Check if we've already sent this reminder
        const alreadySent = db.prepare(`
            SELECT 1 FROM sent_reminders
            WHERE telegram_id = ? AND contest_id = ? AND reminder_type = ?
        `).get(user.telegram_id, contest.cf_id, reminderType);

        if (alreadySent) continue;

        await sendMessage(user.telegram_id, message);

        db.prepare(`
            INSERT OR IGNORE INTO sent_reminders (telegram_id, contest_id, reminder_type)
            VALUES (?, ?, ?)
        `).run(user.telegram_id, contest.cf_id, reminderType);
    }
}


  //Fetches standings from Codeforces 
 // Called after a contest ends.
export async function sendStandingsUpdate(contest) {
    const users = db.prepare('SELECT * FROM users WHERE cf_handle IS NOT NULL').all();

    for (const user of users) {
        const friends = db
            .prepare('SELECT friend_handle FROM friends WHERE user_id = ?')
            .all(user.telegram_id)
            .map(f => f.friend_handle);

        const handles = [user.cf_handle, ...friends];

        try {
            const handlesParam = handles.map(h => `handles=${encodeURIComponent(h)}`).join('&');
            const url = `https://codeforces.com/api/contest.standings?contestId=${contest.cf_id}&${handlesParam}&showUnofficial=false`;

            const resp = await fetch(url);
            const data = await resp.json();

            if (data.status !== 'OK') continue;

            const rows = data.result.rows;
            if (!rows || rows.length === 0) continue;

            // Sort by rank
            rows.sort((a, b) => a.rank - b.rank);

            const medals = ['🥇', '🥈', '🥉'];

            let message = `📊 <b>Standings — ${escapeHtml(contest.name)}</b>\n\n`;

            rows.forEach((row, i) => {
                const handle = row.party.members[0]?.handle || '?';
                const label  = handle === user.cf_handle ? `${handle} (you)` : handle;
                const medal  = medals[i] || `${i + 1}.`;
                const delta  = row.points >= 0 ? `+${row.points}` : `${row.points}`;

                message += `${medal} <b>${escapeHtml(label)}</b>\n`;
                message += `   Rank ${row.rank}`;

                // Rating changes aren't in standings — we'd need /user.rating for that.
                // For now just show rank.
                message += '\n';
            });

            await sendMessage(user.telegram_id, message);
        } catch (err) {
            console.error(`[Bot] Standings fetch failed for user ${user.telegram_id}: ${err.message}`);
        }
    }
}


 // Starts the Telegram bot with long-polling.
 // Runs forever in the background once started.
 
export async function startBot() {
    if (!TOKEN) {
        console.warn('[Bot] TELEGRAM_BOT_TOKEN not set — bot is disabled.');
        return;
    }

    console.log('[Bot] Starting long-poll listener…');

    const poll = async () => {
        try {
            const resp = await fetch(
                `${API}/getUpdates?offset=${_offset}&timeout=30&allowed_updates=["message"]`
            );
            const data = await resp.json();

            if (!data.ok) {
                console.error('[Bot] getUpdates error:', data.description);
                await sleep(5000);
                poll();
                return;
            }

            for (const update of data.result) {
                _offset = update.update_id + 1;
                if (update.message) {
                    handleMessage(update.message).catch(err => {
                        console.error('[Bot] Message handler error:', err.message);
                    });
                }
            }
        } catch (err) {
            console.error('[Bot] Poll error:', err.message);
            await sleep(5000);
        }

        poll();  
    };

    poll();
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
