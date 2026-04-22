const { pool } = require('../database');
const {
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

module.exports = async function logAction({
    client,
    guild,
    action,
    user,
    moderator,
    reason,
    color,
    extra
}) {
    if (!guild) {
        console.error('logAction requires a guild.');
        return null;
    }

    const guildId = guild.id;
    const createdAt = Math.floor(Date.now() / 1000);

    // ==================================================
    // NORMALIZE USER / MODERATOR
    // ==================================================
    const targetUser = user?.user || user || null;
    const modUser = moderator?.user || moderator || null;

    const targetId = targetUser?.id || null;
    const moderatorId = modUser?.id || null;

    const targetTag =
        targetUser?.tag ||
        (targetUser?.username ? `${targetUser.username}` : 'Unknown User');

    const moderatorTag =
        modUser?.tag ||
        (modUser?.username ? `${modUser.username}` : 'Unknown Moderator');

    let caseNumber = null;
    let logChannelId = null;

    // ==================================================
    // DATABASE: ENSURE SETTINGS ROW, GET NEXT CASE FROM CASES TABLE,
    // UPDATE SETTINGS, INSERT CASE
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

        const [settingsRows] = await connection.query(
            `SELECT mod_logs
             FROM guild_settings
             WHERE guild_id = ?
             LIMIT 1
             FOR UPDATE`,
            [guildId]
        );

        const settings = settingsRows[0] || {};
        logChannelId = settings.mod_logs || null;

        const [caseRows] = await connection.query(
            `SELECT COALESCE(MAX(case_number), 0) AS lastCase
             FROM cases
             WHERE guild_id = ?
             FOR UPDATE`,
            [guildId]
        );

        const lastCaseNumber = Number(caseRows[0]?.lastCase || 0);
        caseNumber = lastCaseNumber + 1;

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
    // IF NO LOG CHANNEL IS SET, STOP AFTER CASE INSERT
    // ==================================================
    if (!logChannelId) {
        return { caseNumber, logged: false, reason: 'No mod log channel configured' };
    }

    // ==================================================
    // FETCH CHANNEL SAFELY
    // ==================================================
    let channel = guild.channels.cache.get(logChannelId);

    if (!channel) {
        try {
            channel = await guild.channels.fetch(logChannelId);
        } catch (error) {
            console.error(`logAction could not fetch log channel ${logChannelId}:`, error);
            return { caseNumber, logged: false, reason: 'Failed to fetch log channel' };
        }
    }

    if (!channel) {
        return { caseNumber, logged: false, reason: 'Log channel not found' };
    }

    const allowedChannelTypes = new Set([
        ChannelType.GuildText,
        ChannelType.GuildAnnouncement
    ]);

    if (!allowedChannelTypes.has(channel.type)) {
        console.error(`logAction channel ${logChannelId} is not a text/announcement channel.`);
        return { caseNumber, logged: false, reason: 'Invalid log channel type' };
    }

    // ==================================================
    // BOT PERMISSION CHECKS
    // ==================================================
    const botMember = guild.members.me;
    const permissions = channel.permissionsFor(botMember);

    if (!permissions) {
        console.error(`logAction could not resolve bot permissions in channel ${logChannelId}.`);
        return { caseNumber, logged: false, reason: 'Could not resolve bot permissions' };
    }

    const requiredPerms = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ];

    const missingPerms = requiredPerms.filter(perm => !permissions.has(perm));

    if (missingPerms.length) {
        console.error(`logAction missing permissions in channel ${logChannelId}:`, missingPerms);
        return { caseNumber, logged: false, reason: 'Missing channel permissions' };
    }

    // ==================================================
    // BUILD EMBED SAFELY
    // ==================================================
    const embedFields = [
        {
            name: '👤 Target',
            value: targetId
                ? `${targetTag}\n\`${targetId}\``
                : 'No target user',
            inline: true
        },
        {
            name: '🛡️ Moderator',
            value: moderatorId
                ? `${moderatorTag}\n\`${moderatorId}\``
                : 'Unknown',
            inline: true
        },
        {
            name: '📄 Reason',
            value: reason || 'No reason provided',
            inline: false
        }
    ];

    if (extra) {
        embedFields.push({
            name: '📌 Extra',
            value: String(extra).slice(0, 1024),
            inline: false
        });
    }

    embedFields.push({
        name: '📅 Date',
        value: `<t:${createdAt}:F>`,
        inline: false
    });

    const embed = new EmbedBuilder()
        .setTitle(`${action || 'UNKNOWN'} • Case #${caseNumber}`)
        .setColor(color || '#00bfff')
        .setThumbnail(targetUser?.displayAvatarURL?.({ dynamic: true }) || null)
        .addFields(embedFields)
        .setFooter({
            text: `Case #${caseNumber} • Infinity Moderation`,
            iconURL: guild.iconURL() || null
        })
        .setTimestamp();

    // ==================================================
    // SEND LOG SAFELY
    // ==================================================
    try {
        await channel.send({ embeds: [embed] });
        return { caseNumber, logged: true };
    } catch (error) {
        console.error('logAction send error:', error);
        return { caseNumber, logged: false, reason: 'Failed to send log embed' };
    }
};