const { EmbedBuilder, PermissionFlagsBits, ChannelType, AuditLogEvent } = require('discord.js');
const { pool } = require('../database');

const BRAND_COLOR = '#00bfff';
const SUCCESS_COLOR = '#57f287';
const WARNING_COLOR = '#facc15';
const DANGER_COLOR = '#ff4d4d';
const EDIT_COLOR = '#5865f2';

const CATEGORY_LABELS = {
    message: 'Message Logs',
    member: 'Member Logs',
    role: 'Role Logs',
    channel: 'Channel Logs',
    server: 'Server Logs',
    moderation: 'Moderation Logs'
};

const COLUMNS = {
    message: 'message_logs',
    member: 'member_logs',
    role: 'role_logs',
    channel: 'channel_logs',
    server: 'server_logs',
    moderation: 'moderation_logs'
};

let tableReady = false;
const cache = new Map();
const CACHE_MS = 30_000;

function cut(value, max = 1024) {
    const text = String(value ?? '').trim();
    return text.length > max ? `${text.slice(0, max - 3)}...` : (text || 'None');
}

function block(value, language = '') {
    const safe = String(value ?? '').replace(/```/g, "'''{}").trim();
    if (!safe) return '*No text content available.*';
    return `\`\`\`${language}\n${cut(safe, 3900)}\n\`\`\``;
}

function inlineCode(value) {
    return `\`${String(value ?? 'Unknown').replace(/`/g, 'ˋ')}\``;
}

function formatUser(user, fallback = 'Unknown User') {
    if (!user) return fallback;
    const tag = user.tag || user.username || fallback;
    return `**${tag}**\n${inlineCode(user.id || 'Unknown ID')}`;
}

function formatMember(member, fallback = 'Unknown Member') {
    if (!member) return fallback;
    return formatUser(member.user || member, fallback);
}

function formatChannel(channel, fallback = 'Unknown Channel') {
    if (!channel) return fallback;
    const mention = channel.id ? `<#${channel.id}>` : `#${channel.name || 'unknown'}`;
    return `**${mention}**\n${inlineCode(channel.id || 'Unknown ID')}`;
}

function formatRole(role, fallback = 'Unknown Role') {
    if (!role) return fallback;
    const mention = role.id ? `<@&${role.id}>` : role.name || fallback;
    return `**${mention}**\n${inlineCode(role.id || 'Unknown ID')}`;
}

function yesNo(value) {
    return value ? 'Yes' : 'No';
}

function unix(ms) {
    return ms ? Math.floor(ms / 1000) : null;
}

function formatDuration(ms) {
    if (!ms || ms <= 0) return '0s';
    const seconds = Math.floor(ms / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    if (secs && !days) parts.push(`${secs}s`);
    return parts.slice(0, 3).join(' ') || '0s';
}

async function ensureLoggingTable() {
    if (tableReady) return;

    await pool.query(`
        CREATE TABLE IF NOT EXISTS infinity_log_settings (
            guild_id VARCHAR(32) PRIMARY KEY,
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            message_logs VARCHAR(32) NULL,
            member_logs VARCHAR(32) NULL,
            role_logs VARCHAR(32) NULL,
            channel_logs VARCHAR(32) NULL,
            server_logs VARCHAR(32) NULL,
            moderation_logs VARCHAR(32) NULL,
            ignored_channels TEXT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
    `);

    tableReady = true;
}

async function getLogSettings(guildId) {
    await ensureLoggingTable();

    const cached = cache.get(guildId);
    if (cached && Date.now() - cached.time < CACHE_MS) return cached.data;

    const [rows] = await pool.query(
        'SELECT * FROM infinity_log_settings WHERE guild_id = ? LIMIT 1',
        [guildId]
    );

    let settings = rows[0];

    if (!settings) {
        await pool.query(
            'INSERT INTO infinity_log_settings (guild_id, enabled) VALUES (?, 1)',
            [guildId]
        );

        settings = { guild_id: guildId, enabled: 1, ignored_channels: null };
    }

    cache.set(guildId, { time: Date.now(), data: settings });
    return settings;
}

async function setLogChannel(guildId, category, channelId) {
    await ensureLoggingTable();

    const column = COLUMNS[category];
    if (!column) throw new Error('Invalid logging category');

    await pool.query(
        `INSERT INTO infinity_log_settings (guild_id, enabled, ${column}) VALUES (?, 1, ?)
         ON DUPLICATE KEY UPDATE ${column} = VALUES(${column}), updated_at = CURRENT_TIMESTAMP`,
        [guildId, channelId]
    );

    cache.delete(guildId);
}

async function setLoggingEnabled(guildId, enabled) {
    await ensureLoggingTable();

    await pool.query(
        `INSERT INTO infinity_log_settings (guild_id, enabled) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_at = CURRENT_TIMESTAMP`,
        [guildId, enabled ? 1 : 0]
    );

    cache.delete(guildId);
}

async function setIgnoredChannel(guildId, channelId, ignored) {
    const settings = await getLogSettings(guildId);
    const ids = new Set(
        String(settings.ignored_channels || '')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean)
    );

    ignored ? ids.add(channelId) : ids.delete(channelId);

    await pool.query(
        'UPDATE infinity_log_settings SET ignored_channels = ? WHERE guild_id = ?',
        [[...ids].join(','), guildId]
    );

    cache.delete(guildId);
}

function isIgnored(settings, channelId) {
    return String(settings.ignored_channels || '')
        .split(',')
        .map(id => id.trim())
        .includes(channelId);
}

async function getLogChannel(guild, category, sourceChannelId = null) {
    const settings = await getLogSettings(guild.id);
    if (!Number(settings.enabled)) return null;
    if (sourceChannelId && isIgnored(settings, sourceChannelId)) return null;

    const channelId = settings[COLUMNS[category]] || settings.moderation_logs || settings.server_logs || settings.message_logs;
    if (!channelId) return null;

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return null;

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const permissions = me ? channel.permissionsFor(me) : null;

    if (
        !permissions?.has(PermissionFlagsBits.ViewChannel) ||
        !permissions?.has(PermissionFlagsBits.SendMessages) ||
        !permissions?.has(PermissionFlagsBits.EmbedLinks)
    ) {
        return null;
    }

    return channel;
}

async function sendAdvancedLog(guild, category, payload = {}) {
    try {
        const channel = await getLogChannel(guild, category, payload.sourceChannelId);
        if (!channel) return false;

        const embed = new EmbedBuilder()
            .setColor(payload.color || BRAND_COLOR)
            .setAuthor({
                name: payload.authorName || `Infinity • ${CATEGORY_LABELS[category] || 'Logs'}`,
                iconURL: payload.authorIcon || guild.iconURL({ dynamic: true }) || undefined
            })
            .setTitle(payload.title || 'Server Log')
            .setDescription(payload.description ? cut(payload.description, 4096) : null)
            .setThumbnail(payload.thumbnail || null)
            .setTimestamp(payload.timestamp || new Date())
            .setFooter({
                text: payload.footer || `${guild.name} • Advanced Logging`,
                iconURL: guild.iconURL({ dynamic: true }) || undefined
            });

        if (payload.url) embed.setURL(payload.url);
        if (payload.image) embed.setImage(payload.image);

        for (const field of (payload.fields || []).slice(0, 25)) {
            embed.addFields({
                name: cut(field.name, 256),
                value: cut(field.value, 1024),
                inline: Boolean(field.inline)
            });
        }

        await channel.send({ embeds: [embed] });
        return true;
    } catch (error) {
        console.error('Advanced logger error:', error);
        return false;
    }
}

async function fetchAuditEntry(guild, type, targetId = null, maxAgeMs = 12_000) {
    try {
        const logs = await guild.fetchAuditLogs({ type, limit: 8 });
        const now = Date.now();

        return logs.entries.find(entry => {
            const fresh = now - entry.createdTimestamp <= maxAgeMs;
            const targetMatches = !targetId || entry.target?.id === targetId;
            return fresh && targetMatches;
        }) || null;
    } catch {
        return null;
    }
}

async function fetchAuditExecutor(guild, type, targetId = null, maxAgeMs = 12_000) {
    const entry = await fetchAuditEntry(guild, type, targetId, maxAgeMs);
    return entry?.executor || null;
}

async function findRecentCaseModerator(guild, client, targetId, actionWords = [], withinSeconds = 20) {
    if (!guild?.id || !targetId) return null;

    const words = Array.isArray(actionWords) ? actionWords : [actionWords];
    const now = Math.floor(Date.now() / 1000);

    try {
        const [rows] = await pool.query(
            `SELECT moderator_id, case_number, action, reason, created_at
             FROM cases
             WHERE guild_id = ?
               AND user_id = ?
               AND created_at >= ?
             ORDER BY case_number DESC
             LIMIT 8`,
            [guild.id, targetId, now - withinSeconds]
        );

        const row = rows.find(entry => {
            const action = String(entry.action || '').toLowerCase();
            return !words.length || words.some(word => action.includes(String(word).toLowerCase()));
        }) || rows[0];

        if (!row?.moderator_id) return null;

        const user =
            guild.client?.users.cache.get(row.moderator_id) ||
            client?.users?.cache?.get(row.moderator_id) ||
            await (client || guild.client).users.fetch(row.moderator_id).catch(() => null);

        return user ? { user, caseNumber: row.case_number, reason: row.reason, action: row.action } : null;
    } catch (error) {
        console.error('Failed to fetch recent case moderator:', error);
        return null;
    }
}

module.exports = {
    AuditLogEvent,
    BRAND_COLOR,
    CATEGORY_LABELS,
    DANGER_COLOR,
    EDIT_COLOR,
    SUCCESS_COLOR,
    WARNING_COLOR,
    block,
    cut,
    ensureLoggingTable,
    fetchAuditEntry,
    fetchAuditExecutor,
    findRecentCaseModerator,
    formatChannel,
    formatDuration,
    formatMember,
    formatRole,
    formatUser,
    getLogSettings,
    inlineCode,
    sendAdvancedLog,
    setIgnoredChannel,
    setLogChannel,
    setLoggingEnabled,
    unix,
    yesNo
};
