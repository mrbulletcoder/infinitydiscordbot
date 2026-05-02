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

const SHOP_ITEMS = [
    {
        id: 'lucky_charm',
        name: 'Lucky Charm',
        emoji: '🍀',
        price: 2500,
        description: 'A shiny charm that may bring luck.'
    },
    {
        id: 'bank_shield',
        name: 'Bank Shield',
        emoji: '🛡️',
        price: 5000,
        description: 'A protective item for rob/bank protection systems.'
    },
    {
        id: 'gold_ring',
        name: 'Gold Ring',
        emoji: '💍',
        price: 10000,
        description: 'A flex item to show off your wealth.'
    },
    {
        id: 'vip_crown',
        name: 'VIP Crown',
        emoji: '👑',
        price: 25000,
        description: 'A premium flex item for rich members.'
    }
];

function getShopItems() {
    return SHOP_ITEMS;
}

function getShopItem(itemId) {
    return SHOP_ITEMS.find(item => item.id === itemId);
}

async function addInventoryItem(guildId, userId, itemId, quantity = 1) {
    await pool.query(
        `INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
        [guildId, userId, itemId, quantity]
    );
}

async function getInventory(guildId, userId) {
    const [rows] = await pool.query(
        `SELECT item_id, quantity
         FROM economy_inventory
         WHERE guild_id = ? AND user_id = ?
         ORDER BY item_id ASC`,
        [guildId, userId]
    );

    return rows;
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
    formatTime,
    getShopItems,
    getShopItem,
    addInventoryItem,
    getInventory
};