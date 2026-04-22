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

async function safeExecute(query, params = []) {
    try {
        const [result] = await pool.query(query, params);
        return { ok: true, result };
    } catch (error) {
        console.error('moderationDb safeExecute error:', error);
        return { ok: false, error, result: null };
    }
}

async function insertWarning({ guildId, userId, moderatorId, reason, createdAt }) {
    return safeExecute(
        `INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, userId, moderatorId, reason, createdAt]
    );
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
    return safeExecute(
        `DELETE FROM warnings
         WHERE id = ?
         LIMIT 1`,
        [id]
    );
}

async function clearWarnings(guildId, userId) {
    return safeExecute(
        `DELETE FROM warnings
         WHERE guild_id = ? AND user_id = ?`,
        [guildId, userId]
    );
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
        `SELECT case_number, action, user_id, moderator_id, reason, created_at
         FROM cases
         WHERE guild_id = ? AND user_id = ?
         ORDER BY case_number DESC
         LIMIT ?`,
        [guildId, userId, limit]
    );
}

async function getCasesByModerator(guildId, moderatorId, limit = 10) {
    return safeQuery(
        `SELECT case_number, action, user_id, moderator_id, reason, created_at
         FROM cases
         WHERE guild_id = ? AND moderator_id = ?
         ORDER BY case_number DESC
         LIMIT ?`,
        [guildId, moderatorId, limit]
    );
}

async function getRecentCases(guildId, limit = 10) {
    return safeQuery(
        `SELECT case_number, action, user_id, moderator_id, reason, created_at
         FROM cases
         WHERE guild_id = ?
         ORDER BY case_number DESC
         LIMIT ?`,
        [guildId, limit]
    );
}

async function getCasesByAction(guildId, actionKeyword, limit = 10) {
    return safeQuery(
        `SELECT case_number, action, user_id, moderator_id, reason, created_at
         FROM cases
         WHERE guild_id = ?
           AND action LIKE ?
         ORDER BY case_number DESC
         LIMIT ?`,
        [guildId, `%${actionKeyword}%`, limit]
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

async function editCaseReason(guildId, caseNumber, reason) {
    return safeExecute(
        `UPDATE cases
         SET reason = ?
         WHERE guild_id = ? AND case_number = ?
         LIMIT 1`,
        [reason, guildId, caseNumber]
    );
}

async function deleteCase(guildId, caseNumber) {
    return safeExecute(
        `DELETE FROM cases
         WHERE guild_id = ? AND case_number = ?
         LIMIT 1`,
        [guildId, caseNumber]
    );
}

async function addCaseNote(guildId, caseNumber, authorId, note, createdAt) {
    return safeExecute(
        `INSERT INTO case_notes (guild_id, case_number, author_id, note, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [guildId, caseNumber, authorId, note, createdAt]
    );
}

async function getCaseNotes(guildId, caseNumber, limit = 5) {
    return safeQuery(
        `SELECT id, author_id, note, created_at
         FROM case_notes
         WHERE guild_id = ? AND case_number = ?
         ORDER BY id DESC
         LIMIT ?`,
        [guildId, caseNumber, limit]
    );
}

async function getCaseNoteCount(guildId, caseNumber) {
    return safeQuery(
        `SELECT COUNT(*) AS total
         FROM case_notes
         WHERE guild_id = ? AND case_number = ?`,
        [guildId, caseNumber]
    );
}

async function deleteCaseNotes(guildId, caseNumber) {
    return safeExecute(
        `DELETE FROM case_notes
         WHERE guild_id = ? AND case_number = ?`,
        [guildId, caseNumber]
    );
}

module.exports = {
    safeQuery,
    safeExecute,
    insertWarning,
    getWarnings,
    deleteWarningById,
    clearWarnings,
    getCaseByNumber,
    getCasesForUser,
    getCasesByModerator,
    getRecentCases,
    getCasesByAction,
    getAppealableCasesForUser,
    editCaseReason,
    deleteCase,
    addCaseNote,
    getCaseNotes,
    getCaseNoteCount,
    deleteCaseNotes
};