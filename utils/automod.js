const { pool } = require('../database');
const logAction = require('./logAction');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { logError } = require('./errorHandler');
const { safeReply } = require('../handlers/interactions/safeReply');

const DISPLAY_TIME = 20000;
const CACHE_TIME = 60 * 1000;

const userMessages = new Map();
const configCache = new Map();
const whitelistCache = new Map();
const filteredWordsCache = new Map();

function reply(interaction, payload, ephemeral = true) {
    return safeReply(interaction, payload, ephemeral);
}

function isCacheValid(cacheItem) {
    return cacheItem && Date.now() - cacheItem.createdAt < CACHE_TIME;
}

function invalidateAutomodCache(guildId) {
    configCache.delete(guildId);
    whitelistCache.delete(guildId);
    filteredWordsCache.delete(guildId);
}

async function ensureAutomodConfig(guildId) {
    await pool.query(
        `INSERT INTO automod_config (
            guild_id,
            spam_enabled,
            links_enabled,
            invites_enabled,
            caps_enabled,
            filter_enabled
        )
        VALUES (?, 0, 0, 0, 0, 0)
        ON DUPLICATE KEY UPDATE guild_id = guild_id`,
        [guildId]
    );
}

async function getAutomodConfig(guildId) {
    const cached = configCache.get(guildId);
    if (isCacheValid(cached)) return cached.data;

    await ensureAutomodConfig(guildId);

    const [rows] = await pool.query(
        `SELECT spam_enabled, links_enabled, invites_enabled, caps_enabled, filter_enabled
        FROM automod_config
        WHERE guild_id = ?`,
        [guildId]
    );

    const data = rows[0] || {
        spam_enabled: 0,
        links_enabled: 0,
        invites_enabled: 0,
        caps_enabled: 0,
        filter_enabled: 0
    };

    configCache.set(guildId, {
        data,
        createdAt: Date.now()
    });

    return data;
}

async function getWhitelist(guildId) {
    const cached = whitelistCache.get(guildId);
    if (isCacheValid(cached)) return cached.data;

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

    const data = {
        roles: roleRows.map(row => row.role_id),
        users: userRows.map(row => row.user_id),
        channels: channelRows.map(row => row.channel_id)
    };

    whitelistCache.set(guildId, {
        data,
        createdAt: Date.now()
    });

    return data;
}

async function getFilteredWords(guildId) {
    const cached = filteredWordsCache.get(guildId);
    if (isCacheValid(cached)) return cached.data;

    const [rows] = await pool.query(
        `SELECT word
         FROM automod_filtered_words
         WHERE guild_id = ?`,
        [guildId]
    );

    const data = rows.map(row => row.word.toLowerCase());

    filteredWordsCache.set(guildId, {
        data,
        createdAt: Date.now()
    });

    return data;
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

    if (exactRows.length > 0) return exactRows[0].punishment;

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

async function automod(message) {
    try {
        if (!message.guild || message.author.bot) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const channelId = message.channel.id;

        if (
            message.member.permissions.has(PermissionFlagsBits.Administrator) ||
            message.guild.ownerId === userId
        ) return;

        const config = await getAutomodConfig(guildId);
        const whitelist = await getWhitelist(guildId);

        if (whitelist.roles.some(roleId => message.member.roles.cache.has(roleId))) return;
        if (whitelist.users.includes(userId)) return;
        if (whitelist.channels.includes(channelId)) return;

        const content = message.content;

        const lowerContent = content.toLowerCase();

        const inviteRegex = /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[^\s]+/i;

        if (config.filter_enabled) {
            const filteredWords = await getFilteredWords(guildId);

            const matchedWord = filteredWords.find(word => {
                const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${escaped}\\b`, 'i');
                return regex.test(lowerContent);
            });

            if (matchedWord) {
                await punish(message, '🚫 Blocked Word Detected', 'filter');
                return;
            }
        }

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

        if (config.invites_enabled && inviteRegex.test(lowerContent)) {
            await punish(message, '📨 Discord Invite Detected', 'invites');
            return;
        }

        if (config.links_enabled && /(https?:\/\/[^\s]+)/gi.test(content)) {
            await punish(message, '🔗 Unauthorized Link Detected', 'links');
            return;
        }

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
    } catch (error) {
        logError('AUTOMOD', error, {
            event: 'messageCreate',
            guild: message.guild ? `${message.guild.name} (${message.guild.id})` : 'Unknown',
            user: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown'
        });
    }
}

async function punish(message, reason, type) {
    try {
        const guildId = message.guild.id;
        const userId = message.author.id;

        message.client.recentAutomodDeletes ??= new Map();

        message.client.recentAutomodDeletes.set(message.id, {
            executor: message.client.user,
            reason,
            type,
            deletedAt: Date.now()
        });

        setTimeout(() => {
            message.client.recentAutomodDeletes?.delete(message.id);
        }, 15_000);

        await message.delete().catch(() => { });

        const offenseCount = await incrementOffense(guildId, userId);
        const rule = await getPunishment(guildId, type, offenseCount);

        let action = '⚠️ Warn';
        let color = '#ffff00';
        let shouldKick = false;
        let timeoutDuration = null;

        if (typeof rule === 'string' && rule.startsWith('timeout:')) {
            action = '⏳ Timeout';
            color = '#ffaa00';
            timeoutDuration = parseInt(rule.split(':')[1], 10);
        } else if (rule === 'kick') {
            action = '👢 Kick';
            color = '#ff0000';
            shouldKick = true;
        }

        // ✅ Send channel notice FIRST
        const embed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({
                name: '🤖 Infinity AutoMod',
                iconURL: message.guild.iconURL({ dynamic: true }) || undefined
            })
            .setDescription(`⚠️ ${message.author} triggered AutoMod.`)
            .addFields(
                {
                    name: '👤 User',
                    value: `${message.author.tag}\n\`${message.author.id}\``,
                    inline: true
                },
                {
                    name: '📍 Channel',
                    value: `${message.channel}\n\`${message.channel.id}\``,
                    inline: true
                },
                {
                    name: '📌 Action Taken',
                    value: [
                        '```yaml',
                        `Action: ${action}`,
                        `Offense: #${offenseCount}`,
                        `Rule: ${type}`,
                        '```'
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '📄 Reason',
                    value: [
                        '```',
                        reason,
                        '```'
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity AutoMod • Protection System' })
            .setTimestamp();

        const notice = await message.channel.send({ embeds: [embed] }).catch(() => null);

        if (notice) {
            setTimeout(() => {
                notice.delete().catch(() => { });
            }, 20_000);
        }

        // ✅ Then apply punishment
        if (timeoutDuration && message.member.moderatable) {
            await message.member.timeout(timeoutDuration, reason).catch(() => { });
        }

        if (shouldKick && message.member.kickable) {
            await message.member.kick(reason).catch(() => { });
        }

        // ✅ Then log to modlogs
        await logAction({
            client: message.client,
            guild: message.guild,
            action: `🤖 AutoMod • ${action}`,
            user: message.author,
            moderator: message.client.user,
            reason: `${reason} (Offense #${offenseCount})`,
            color
        });
    } catch (error) {
        logError('AUTOMOD PUNISH', error, {
            guild: message.guild ? `${message.guild.name} (${message.guild.id})` : 'Unknown',
            user: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown',
            channel: message.channel ? `${message.channel.name} (${message.channel.id})` : 'Unknown'
        });
    }
}

automod.invalidateAutomodCache = invalidateAutomodCache;

module.exports = automod;