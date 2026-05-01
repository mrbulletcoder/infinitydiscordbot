const { pool } = require('../database');

const COIN = '🪙';

function formatMoney(amount) {
    return `${COIN} ${Number(amount || 0).toLocaleString()}`;
}

async function ensureUser(guildId, userId) {
    await pool.query(
        `INSERT INTO economy_users (guild_id, user_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = user_id`,
        [guildId, userId]
    );
}

async function getUser(guildId, userId) {
    await ensureUser(guildId, userId);

    const [rows] = await pool.query(
        `SELECT * FROM economy_users WHERE guild_id = ? AND user_id = ? LIMIT 1`,
        [guildId, userId]
    );

    return rows[0];
}

async function addWallet(guildId, userId, amount, type = 'earn', description = null) {
    await ensureUser(guildId, userId);

    await pool.query(
        `UPDATE economy_users
         SET wallet = wallet + ?
         WHERE guild_id = ? AND user_id = ?`,
        [amount, guildId, userId]
    );

    await pool.query(
        `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description)
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, type, amount, description]
    );
}

async function removeWallet(guildId, userId, amount, type = 'spend', description = null) {
    const user = await getUser(guildId, userId);

    if (user.wallet < amount) {
        return false;
    }

    await pool.query(
        `UPDATE economy_users
         SET wallet = wallet - ?
         WHERE guild_id = ? AND user_id = ?`,
        [amount, guildId, userId]
    );

    await pool.query(
        `INSERT INTO economy_transactions (guild_id, user_id, type, amount, description)
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, type, -amount, description]
    );

    return true;
}

async function setCooldown(guildId, userId, field) {
    await ensureUser(guildId, userId);

    await pool.query(
        `UPDATE economy_users
         SET ${field} = ?
         WHERE guild_id = ? AND user_id = ?`,
        [Date.now(), guildId, userId]
    );
}

function getRemaining(lastUsed, cooldownMs) {
    const remaining = cooldownMs - (Date.now() - Number(lastUsed || 0));
    return Math.max(0, remaining);
}

function formatTime(ms) {
    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

module.exports = {
    COIN,
    formatMoney,
    ensureUser,
    getUser,
    addWallet,
    removeWallet,
    setCooldown,
    getRemaining,
    formatTime
};