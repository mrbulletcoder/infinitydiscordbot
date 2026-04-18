const { pool } = require('../database');
const { EmbedBuilder } = require('discord.js');

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
    try {
        if (!guild) {
            throw new Error('logAction requires a guild.');
        }

        const guildId = guild.id;

        // ===== NORMALIZE USER / MODERATOR =====
        const targetUser = user?.user || user || null;
        const modUser = moderator?.user || moderator || null;

        const targetId = targetUser?.id || null;
        const moderatorId = modUser?.id || null;

        const targetTag =
            targetUser?.tag ||
            (targetUser?.username ? `${targetUser.username}` : null);

        const moderatorTag =
            modUser?.tag ||
            (modUser?.username ? `${modUser.username}` : null);

        // ===== GET OR CREATE GUILD SETTINGS =====
        await pool.query(
            `INSERT INTO guild_settings (guild_id) VALUES (?) 
             ON DUPLICATE KEY UPDATE guild_id = guild_id`,
            [guildId]
        );

        // ===== INCREMENT CASE NUMBER =====
        const [rows] = await pool.query(
            `SELECT case_number FROM guild_settings WHERE guild_id = ?`,
            [guildId]
        );

        let caseNumber = rows[0]?.case_number || 0;
        caseNumber++;

        await pool.query(
            `UPDATE guild_settings SET case_number = ? WHERE guild_id = ?`,
            [caseNumber, guildId]
        );

        // ===== INSERT CASE =====
        await pool.query(
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
                Math.floor(Date.now() / 1000)
            ]
        );

        // ===== GET LOG CHANNEL =====
        const [settings] = await pool.query(
            `SELECT mod_logs FROM guild_settings WHERE guild_id = ?`,
            [guildId]
        );

        const logChannelId = settings[0]?.mod_logs;
        if (!logChannelId) return;

        let channel = guild.channels.cache.get(logChannelId);
        if (!channel) {
            try {
                channel = await guild.channels.fetch(logChannelId);
            } catch {
                return;
            }
        }

        if (!channel) return;

        const timestamp = Math.floor(Date.now() / 1000);

        // ===== EMBED =====
        const embedFields = [
            {
                name: '👤 Target',
                value: targetId
                    ? `${targetTag || 'Unknown User'}\n\`${targetId}\``
                    : 'No target user',
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: moderatorId
                    ? `${moderatorTag || 'Unknown Moderator'}\n\`${moderatorId}\``
                    : 'Unknown',
                inline: true
            },
            {
                name: '📄 Reason',
                value: reason || 'No reason provided'
            }
        ];

        if (extra) {
            embedFields.push({
                name: '📌 Extra',
                value: String(extra)
            });
        }

        embedFields.push({
            name: '📅 Date',
            value: `<t:${timestamp}:F>`
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

        await channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Log Action Error:', error);
    }
};