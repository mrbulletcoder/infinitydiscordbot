const { pool } = require('../database');
const logAction = require('./logAction');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const DISPLAY_TIME = 20000; // 20 seconds
const userMessages = new Map();

async function ensureAutomodConfig(guildId) {
    await pool.query(
        `INSERT INTO automod_config (guild_id)
         VALUES (?)
         ON DUPLICATE KEY UPDATE guild_id = guild_id`,
        [guildId]
    );
}

async function getAutomodConfig(guildId) {
    await ensureAutomodConfig(guildId);

    const [rows] = await pool.query(
        `SELECT spam_enabled, links_enabled, caps_enabled
         FROM automod_config
         WHERE guild_id = ?`,
        [guildId]
    );

    return rows[0] || {
        spam_enabled: 1,
        links_enabled: 1,
        caps_enabled: 1
    };
}

async function getWhitelist(guildId) {
    const [roleRows] = await pool.query(
        `SELECT role_id FROM automod_whitelist_roles WHERE guild_id = ?`,
        [guildId]
    );

    const [userRows] = await pool.query(
        `SELECT user_id FROM automod_whitelist_users WHERE guild_id = ?`,
        [guildId]
    );

    const [channelRows] = await pool.query(
        `SELECT channel_id FROM automod_whitelist_channels WHERE guild_id = ?`,
        [guildId]
    );

    return {
        roles: roleRows.map(row => row.role_id),
        users: userRows.map(row => row.user_id),
        channels: channelRows.map(row => row.channel_id)
    };
}

async function incrementOffense(guildId, userId) {
    await pool.query(
        `INSERT INTO automod_offenses (guild_id, user_id, offense_count)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE offense_count = offense_count + 1`,
        [guildId, userId]
    );

    const [rows] = await pool.query(
        `SELECT offense_count
         FROM automod_offenses
         WHERE guild_id = ? AND user_id = ?`,
        [guildId, userId]
    );

    return rows[0]?.offense_count || 1;
}

async function getPunishment(guildId, type, offenseCount) {
    const [exactRows] = await pool.query(
        `SELECT punishment
         FROM automod_punishments
         WHERE guild_id = ? AND type = ? AND offense_number = ?
         LIMIT 1`,
        [guildId, type, offenseCount]
    );

    if (exactRows.length > 0) {
        return exactRows[0].punishment;
    }

    const [fallbackRows] = await pool.query(
        `SELECT punishment
         FROM automod_punishments
         WHERE guild_id = ? AND type = ? AND offense_number <= ?
         ORDER BY offense_number DESC
         LIMIT 1`,
        [guildId, type, offenseCount]
    );

    return fallbackRows[0]?.punishment || 'warn';
}

module.exports = async function automod(message) {
    try {
        if (!message.guild || message.author.bot) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const channelId = message.channel.id;

        const config = await getAutomodConfig(guildId);
        const whitelist = await getWhitelist(guildId);

        // ===== BYPASS =====
        if (
            message.member.permissions.has(PermissionFlagsBits.Administrator) ||
            message.guild.ownerId === userId
        ) {
            return;
        }

        if (whitelist.roles.some(roleId => message.member.roles.cache.has(roleId))) return;
        if (whitelist.users.includes(userId)) return;
        if (whitelist.channels.includes(channelId)) return;

        const content = message.content;

        // ===== SPAM =====
        if (config.spam_enabled) {
            const now = Date.now();

            if (!userMessages.has(userId)) {
                userMessages.set(userId, []);
            }

            const timestamps = userMessages.get(userId);
            timestamps.push(now);

            const recent = timestamps.filter(timestamp => now - timestamp < 5000);
            userMessages.set(userId, recent);

            if (recent.length >= 5) {
                await punish(message, '🚫 Spam Detected', 'spam');
                return;
            }
        }

        // ===== LINKS =====
        if (config.links_enabled && /(https?:\/\/[^\s]+)/gi.test(content)) {
            await punish(message, '🔗 Unauthorized Link', 'links');
            return;
        }

        // ===== CAPS =====
        if (config.caps_enabled) {
            const letters = content.replace(/[^a-zA-Z]/g, '');

            if (letters.length > 8) {
                const caps = letters.replace(/[^A-Z]/g, '').length;

                if (caps / letters.length > 0.7) {
                    await punish(message, '🔊 Excessive Caps', 'caps');
                    return;
                }
            }
        }
    } catch (err) {
        console.error('AutoMod Error:', err);
    }
};

async function punish(message, reason, type) {
    try {
        const guildId = message.guild.id;
        const userId = message.author.id;

        await message.delete().catch(() => {});

        const offenseCount = await incrementOffense(guildId, userId);
        const rule = await getPunishment(guildId, type, offenseCount);

        let action = '⚠️ Warn';
        let color = '#ffff00';

        // ===== TIMEOUT =====
        if (typeof rule === 'string' && rule.startsWith('timeout:')) {
            action = '⏳ Timeout';
            color = '#ffaa00';

            const duration = parseInt(rule.split(':')[1], 10);

            if (message.member.moderatable && duration) {
                await message.member.timeout(duration, reason).catch(() => {});
            }
        }

        // ===== KICK =====
        else if (rule === 'kick') {
            action = '👢 Kick';
            color = '#ff0000';

            if (message.member.kickable) {
                await message.member.kick(reason).catch(() => {});
            }
        }

        // ===== LOG =====
        await logAction({
            client: message.client,
            guild: message.guild,
            action: `🤖 AutoMod • ${action}`,
            user: message.author,
            moderator: message.client.user,
            reason: `${reason} (Offense #${offenseCount})`,
            color
        });

        // ===== CLEAN EMBED UI =====
        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({
                name: '🤖 AutoMod Action',
                iconURL: message.guild.iconURL() || null
            })
            .setDescription(`⚠️ ${message.author}`)
            .addFields(
                { name: '📌 Reason', value: reason },
                { name: '⚙️ Action', value: action, inline: true },
                { name: '📊 Offense', value: `#${offenseCount}`, inline: true }
            )
            .setFooter({ text: 'Infinity AutoMod System' })
            .setTimestamp();

        const reply = await message.channel.send({ embeds: [embed] });

        setTimeout(() => {
            reply.delete().catch(() => {});
        }, DISPLAY_TIME);
    } catch (err) {
        console.error('AutoMod Punish Error:', err);
    }
}