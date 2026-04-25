const { pool } = require('../database');

const reactionRoleCooldowns = new Map();
const reactionRoleCooldownNotices = new Map();

async function parseEmojiInput(input, guild = null) {
    const trimmed = String(input || '').trim();
    const compact = trimmed.replace(/\s+/g, '');

    const customMatch = compact.match(/^<(a?):([A-Za-z0-9_]+):(\d{17,20})>$/);
    if (customMatch) {
        const [, animatedFlag, name, id] = customMatch;
        return {
            emojiKey: id,
            emojiDisplay: `<${animatedFlag ? 'a' : ''}:${name}:${id}>`
        };
    }

    const idMatch = compact.match(/^(\d{17,20})$/);
    if (idMatch && guild) {
        const id = idMatch[1];
        const emoji =
            guild.emojis.cache.get(id) ||
            await guild.emojis.fetch(id).catch(() => null);

        if (!emoji) {
            throw new Error('Custom emoji ID not found in this server.');
        }

        return {
            emojiKey: emoji.id,
            emojiDisplay: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
        };
    }

    const nameMatch = compact.match(/^:([A-Za-z0-9_]+):$/);
    if (nameMatch && guild) {
        const name = nameMatch[1];
        const emoji =
            guild.emojis.cache.find(entry => entry.name === name) ||
            (await guild.emojis.fetch().catch(() => null))?.find(entry => entry.name === name);

        if (!emoji) {
            throw new Error('Custom emoji name not found in this server.');
        }

        return {
            emojiKey: emoji.id,
            emojiDisplay: `<${emoji.animated ? 'a' : ''}:${emoji.name}:${emoji.id}>`
        };
    }

    return {
        emojiKey: trimmed,
        emojiDisplay: trimmed
    };
}

function getReactionEmojiKey(reaction) {
    return reaction.emoji.id || reaction.emoji.name;
}

async function getReactionRoleMatch(guildId, messageId, emojiKey) {
    const [rows] = await pool.query(
        `
        SELECT
            rrm.guild_id,
            rrm.channel_id,
            rrm.message_id,
            rrc.id AS category_id,
            rrc.name AS category_name,
            rrc.description AS category_description,
            rrc.mode AS category_mode,
            rri.role_id,
            rri.emoji_key,
            rri.emoji_display,
            rri.label
        FROM reaction_role_messages rrm
        INNER JOIN reaction_role_categories rrc
            ON rrm.category_id = rrc.id
        INNER JOIN reaction_role_items rri
            ON rri.category_id = rrc.id
        WHERE rrm.guild_id = ?
          AND rrm.message_id = ?
          AND rri.emoji_key = ?
        LIMIT 1
        `,
        [guildId, messageId, emojiKey]
    );

    return rows[0] || null;
}

async function getCategoryByName(guildId, name) {
    const [rows] = await pool.query(
        `SELECT * FROM reaction_role_categories WHERE guild_id = ? AND name = ? LIMIT 1`,
        [guildId, name]
    );

    return rows[0] || null;
}

async function getCategoryRoleIds(categoryId) {
    const [rows] = await pool.query(
        `SELECT role_id FROM reaction_role_items WHERE category_id = ?`,
        [categoryId]
    );

    return rows.map(row => row.role_id);
}

function checkReactionRoleCooldown(guildId, userId, limit = 3, windowMs = 10_000) {
    const key = `${guildId}:${userId}`;
    const now = Date.now();

    const timestamps = reactionRoleCooldowns.get(key) || [];
    const filtered = timestamps.filter(timestamp => now - timestamp < windowMs);

    if (filtered.length >= limit) {
        reactionRoleCooldowns.set(key, filtered);
        return {
            allowed: false,
            remainingMs: windowMs - (now - filtered[0])
        };
    }

    filtered.push(now);
    reactionRoleCooldowns.set(key, filtered);

    return {
        allowed: true,
        remainingMs: 0
    };
}

function formatCooldown(ms) {
    const seconds = Math.ceil(ms / 1000);
    return `${seconds}s`;
}

function getCleanCategoryTitle(name) {
    return String(name || 'Reaction Roles')
        .replace(/^\s*[🎮🎭🎯✨⭐🌟🔥💎👑🛡️⚔️🎨🎵🎬📢📌✅🔔💬🌈🚀🧩]\s*/u, '')
        .trim() || 'Reaction Roles';
}

function trimEmbedText(value, max = 1024) {
    const text = String(value || '');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function chunkEmbedLines(lines, max = 950) {
    const chunks = [];
    let current = '';

    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;

        if (next.length > max && current) {
            chunks.push(current);
            current = line;
        } else {
            current = next;
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

function buildReactionRoleEmbed(category, items, guildName = 'Infinity') {
    const mode = category.mode || category.category_mode || 'multi';
    const name = category.name || category.category_name || 'Reaction Roles';
    const description =
        category.description ||
        category.category_description ||
        'Choose your roles below.';

    const isSingle = mode === 'single';

    const roleList = items.length
        ? items.map((item, index) => {
            const number = String(index + 1).padStart(2, '0');
            const label = item.label || 'Role';
            return [
                `**${number}.** ${item.emoji_display} <@&${item.role_id}>`,
                `> ${label}`
            ].join('\n');
        }).join('\n\n')
        : '> No roles configured yet.';

    return {
        author: {
            name: `${guildName} • Infinity Role Panel`
        },

        title: `✦ ${name}`,

        description: [
            `> ${description}`,
            '',
            isSingle
                ? '```ansi\nSelect one role from the options below\n```'
                : '```ansi\nSelect any roles you want from the options below\n```'
        ].join('\n'),

        color: 0x00bfff,

        fields: [
            {
                name: '╭─ Available Roles',
                value: roleList,
                inline: false
            },
            {
                name: '╰─ How It Works',
                value: [
                    isSingle
                        ? '🎯 **Single Select:** only one role can be active from this panel.'
                        : '✨ **Multi Select:** choose as many roles as you want.',
                    '🔁 **Remove:** remove your reaction to remove the role.',
                    '⚡ **Instant:** role changes apply automatically.'
                ].join('\n'),
                inline: false
            }
        ],

        footer: {
            text: `${guildName} • ${isSingle ? 'Single Select' : 'Multi Select'} • ${items.length} role${items.length === 1 ? '' : 's'}`
        },

        timestamp: new Date().toISOString()
    };
}

async function syncPanelReactions(message, items) {
    await message.fetch(true);

    const wantedEmojiSet = new Set(items.map(item => item.emoji_display));

    for (const [, reaction] of message.reactions.cache) {
        const reactionIdentifier = reaction.emoji.id
            ? `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`
            : reaction.emoji.name;

        if (!wantedEmojiSet.has(reactionIdentifier)) {
            try {
                await reaction.remove();
            } catch (error) {
                console.error(`Failed to remove old reaction ${reactionIdentifier}:`, error);
            }
        }
    }

    for (const item of items) {
        const existingReaction = message.reactions.cache.find(reaction => {
            if (reaction.emoji.id) {
                return item.emoji_display === `<${reaction.emoji.animated ? 'a' : ''}:${reaction.emoji.name}:${reaction.emoji.id}>`;
            }

            return item.emoji_display === reaction.emoji.name;
        });

        if (!existingReaction) {
            try {
                await message.react(item.emoji_display);
            } catch (error) {
                console.error(`Failed to react with ${item.emoji_display}:`, error);
            }
        }
    }
}

async function sendOrUpdateReactionRoleCooldownNotice(channel, userId, remainingMs) {
    const key = `${channel.guild.id}:${channel.id}:${userId}`;
    const existing = reactionRoleCooldownNotices.get(key);
    const expiresAt = Date.now() + remainingMs;

    if (existing) {
        existing.expiresAt = expiresAt;
        return;
    }

    const message = await channel.send({
        content: `<@${userId}> ⏳ You're changing reaction roles too quickly in **${channel.guild.name}**. Please wait **${formatCooldown(remainingMs)}** and try again.`,
        allowedMentions: { users: [userId] }
    }).catch(() => null);

    if (!message) return;

    const state = {
        message,
        userId,
        expiresAt,
        interval: null
    };

    reactionRoleCooldownNotices.set(key, state);

    const cleanup = async () => {
        if (state.interval) clearInterval(state.interval);

        reactionRoleCooldownNotices.delete(key);
        await message.delete().catch(() => null);
    };

    state.interval = setInterval(async () => {
        const remaining = state.expiresAt - Date.now();

        if (remaining <= 0) {
            await cleanup();
            return;
        }

        await message.edit({
            content: `<@${userId}> ⏳ You're changing reaction roles too quickly in **${channel.guild.name}**. Please wait **${formatCooldown(remaining)}** and try again.`,
            allowedMentions: { users: [userId] }
        }).catch(() => null);
    }, 1000);
}

module.exports = {
    parseEmojiInput,
    getReactionEmojiKey,
    getReactionRoleMatch,
    getCategoryByName,
    getCategoryRoleIds,
    checkReactionRoleCooldown,
    formatCooldown,
    buildReactionRoleEmbed,
    syncPanelReactions,
    sendOrUpdateReactionRoleCooldownNotice
};