const { pool } = require('../database');
const { sendAdvancedLog } = require('./advancedLogger');

function normaliseUser(value) {
    return value?.user || value || null;
}

function getUserTag(user, fallback = 'Unknown') {
    if (!user) return fallback;
    return user.tag || user.username || fallback;
}

function formatUser(user, emptyText = 'Unknown') {
    if (!user?.id) return emptyText;
    return `${getUserTag(user)}\n\`${user.id}\``;
}

function cleanActionName(action = 'UNKNOWN') {
    return String(action || 'UNKNOWN').replace(/^[^\w#]+\s*/u, '').trim() || 'UNKNOWN';
}

module.exports = async function logAction({
    client,
    guild,
    action,
    user,
    moderator,
    reason,
    color,
    extra,
    createCase = true,
    existingCaseNumber = null
}) {
    if (!guild) {
        console.error('logAction requires a guild.');
        return null;
    }

    const guildId = guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    const targetUser = normaliseUser(user);
    const modUser = normaliseUser(moderator);

    const targetId = targetUser?.id || null;
    const moderatorId = modUser?.id || null;

    let caseNumber = existingCaseNumber;

    // ==================================================
    // DATABASE: KEEP CASE SYSTEM IN logAction
    // ==================================================
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query(
            `INSERT INTO guild_settings (guild_id, case_number)
             VALUES (?, 0)
             ON DUPLICATE KEY UPDATE guild_id = guild_id`,
            [guildId]
        );

        if (createCase) {
            const [caseRows] = await connection.query(
                `SELECT COALESCE(MAX(case_number), 0) AS lastCase
                 FROM cases
                 WHERE guild_id = ?
                 FOR UPDATE`,
                [guildId]
            );

            caseNumber = Number(caseRows[0]?.lastCase || 0) + 1;

            await connection.query(
                `UPDATE guild_settings
                 SET case_number = ?
                 WHERE guild_id = ?`,
                [caseNumber, guildId]
            );

            await connection.query(
                `INSERT INTO cases
                 (guild_id, case_number, action, user_id, moderator_id, reason, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    guildId,
                    caseNumber,
                    action || 'UNKNOWN',
                    targetId,
                    moderatorId,
                    reason || 'No reason provided',
                    createdAt
                ]
            );
        }

        await connection.commit();
    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackError) {
                console.error('logAction rollback failed:', rollbackError);
            }
        }

        console.error('logAction database error:', error);
        return null;
    } finally {
        if (connection) connection.release();
    }

    // ==================================================
    // SEND THROUGH ADVANCED LOGGER
    // No more old guild_settings.mod_logs channel fetch.
    // /logging setup controls the moderation log channel now.
    // ==================================================
    const actionName = cleanActionName(action);
    const logged = await sendAdvancedLog(guild, 'moderation', {
        color: color || '#00bfff',
        title: caseNumber ? `${action || 'Moderation Action'} • Case #${caseNumber}` : `${action || 'Moderation Action'}`,
        description: 'A moderation action was recorded by Infinity.',
        thumbnail: targetUser?.displayAvatarURL?.({ dynamic: true }) || null,
        fields: [
            {
                name: '👤 Target',
                value: formatUser(targetUser, 'No target user'),
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: formatUser(modUser, 'Unknown Moderator'),
                inline: true
            },
            {
                name: '📁 Case',
                value: caseNumber ? `\`#${caseNumber}\`` : '`No case created`',
                inline: true
            },
            {
                name: '📄 Reason',
                value: reason || 'No reason provided',
                inline: false
            },
            ...(extra ? [{
                name: '📌 Extra',
                value: String(extra).slice(0, 1024),
                inline: false
            }] : []),
            {
                name: '📅 Date',
                value: `<t:${createdAt}:F>\n<t:${createdAt}:R>`,
                inline: false
            }
        ],
        metadata: {
            type: 'moderation',
            action: actionName,
            caseNumber,
            targetId,
            moderatorId
        }
    });

    return {
        caseNumber,
        logged: Boolean(logged),
        reason: logged ? undefined : 'No advanced moderation log channel configured or channel unavailable'
    };
};
