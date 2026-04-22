const { pool } = require('../database');

async function safeQuery(query, params = []) {
    try {
        const [rows] = await pool.query(query, params);
        return { ok: true, rows };
    } catch (error) {
        console.error('moderationDb safeQuery error:', error);
        return { ok: false, error, rows: [] };
    }
}

async function insertWarning({ guildId, userId, moderatorId, reason, createdAt }) {
    try {
        await pool.query(
            `INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [guildId, userId, moderatorId, reason, createdAt]
        );

        return { ok: true };
    } catch (error) {
        console.error('moderationDb insertWarning error:', error);
        return { ok: false, error };
    }
}

async function getWarnings(guildId, userId) {
    return safeQuery(
        `SELECT id, reason, moderator_id, created_at
         FROM warnings
         WHERE guild_id = ? AND user_id = ?
         ORDER BY id ASC`,
        [guildId, userId]
    );
}

async function deleteWarningById(id) {
    try {
        await pool.query(
            `DELETE FROM warnings
             WHERE id = ?
             LIMIT 1`,
            [id]
        );

        return { ok: true };
    } catch (error) {
        console.error('moderationDb deleteWarningById error:', error);
        return { ok: false, error };
    }
}

async function clearWarnings(guildId, userId) {
    try {
        await pool.query(
            `DELETE FROM warnings
             WHERE guild_id = ? AND user_id = ?`,
            [guildId, userId]
        );

        return { ok: true };
    } catch (error) {
        console.error('moderationDb clearWarnings error:', error);
        return { ok: false, error };
    }
}

async function getCaseByNumber(guildId, caseNumber) {
    return safeQuery(
        `SELECT case_number, action, user_id, moderator_id, reason, created_at
         FROM cases
         WHERE guild_id = ? AND case_number = ?
         LIMIT 1`,
        [guildId, caseNumber]
    );
}

async function getCasesForUser(guildId, userId, limit = 10) {
    return safeQuery(
        `SELECT case_number, action, moderator_id, reason, created_at
         FROM cases
         WHERE guild_id = ? AND user_id = ?
         ORDER BY case_number DESC
         LIMIT ?`,
        [guildId, userId, limit]
    );
}

async function getAppealableCasesForUser(guildId, userId, limit = 10) {
    return safeQuery(
        `SELECT case_number, action, moderator_id, reason, created_at
         FROM cases
         WHERE guild_id = ?
           AND user_id = ?
           AND (
                action LIKE '%Ban%'
                OR action LIKE '%Kick%'
                OR action LIKE '%Timeout%'
                OR action LIKE '%Warn%'
           )
         ORDER BY case_number DESC
         LIMIT ?`,
        [guildId, userId, limit]
    );
}

module.exports = {
    safeQuery,
    insertWarning,
    getWarnings,
    deleteWarningById,
    clearWarnings,
    getCaseByNumber,
    getCasesForUser,
    getAppealableCasesForUser
};