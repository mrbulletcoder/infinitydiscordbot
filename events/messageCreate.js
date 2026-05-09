require('dotenv').config({ quiet: true });

const prefix = process.env.PREFIX || '!';
const automod = require('../utils/automod');
const { checkPrefixPermission } = require('../utils/checkPermissions');
const { giveMessageXp } = require('../utils/rank');
const { logError } = require('../utils/errorHandler');
const { pool } = require('../database');

const {
    relayAppealDmMessage,
    relayAppealStaffMessage
} = require('../utils/appeals');

// ===== SAFE MESSAGE REPLY =====
async function safeReply(message, options) {
    try {
        return await message.reply(options);
    } catch (error) {
        console.error('Failed to reply to message:', error);
        return null;
    }
}

function getCommandCooldown(command) {
    return Number(command.cooldown ?? 3);
}

async function handlePrefixCooldown(message, command) {
    if (!message.client.cooldowns) {
        message.client.cooldowns = new Map();
    }

    const cooldowns = message.client.cooldowns;
    const commandName = command.name || 'unknown';
    const key = `${message.guild.id}:${message.author.id}:${commandName}:prefix`;
    const cooldownSeconds = getCommandCooldown(command);

    if (cooldownSeconds <= 0) return false;

    const now = Date.now();
    const expiresAt = cooldowns.get(key);

    if (expiresAt && now < expiresAt) {
        const remaining = ((expiresAt - now) / 1000).toFixed(1);

        await safeReply(message, {
            content: `⏳ Please wait **${remaining}s** before using \`${prefix}${commandName}\` again.`
        });

        return true;
    }

    cooldowns.set(key, now + cooldownSeconds * 1000);

    setTimeout(() => {
        cooldowns.delete(key);
    }, cooldownSeconds * 1000);

    return false;
}

module.exports = {
    name: 'messageCreate',

    async execute(message, client) {
        try {
            // ==================================================
            // BASIC SAFETY CHECKS
            // ==================================================
            if (!message) return;
            if (!message.author) return;
            if (message.author.bot) return;
            if (!message.guild) {
                await relayAppealDmMessage(message);
                return;
            }

            const wasAppealRelay = await relayAppealStaffMessage(message);
            if (wasAppealRelay) return;
            
            if (typeof message.content !== 'string') return;

            // ==================================================
            // AFK: REMOVE AFK STATUS WHEN USER SPEAKS
            // ==================================================
            const [ownAfkRows] = await pool.query(
                `SELECT reason, created_at
     FROM afk_users
     WHERE guild_id = ? AND user_id = ?
     LIMIT 1`,
                [message.guild.id, message.author.id]
            );

            if (ownAfkRows.length) {
                await pool.query(
                    `DELETE FROM afk_users
         WHERE guild_id = ? AND user_id = ?`,
                    [message.guild.id, message.author.id]
                );

                await safeReply(message, {
                    content: '👋 Welcome back! Your AFK status has been removed.'
                });
            }

            // ==================================================
            // AFK: NOTIFY IF MENTIONED USER IS AFK
            // ==================================================
            if (message.mentions?.users?.size > 0) {
                const mentionedUsers = [...message.mentions.users.values()]
                    .filter(user => user && !user.bot && user.id !== message.author.id);

                if (mentionedUsers.length > 0) {
                    const afkReplies = [];

                    for (const user of mentionedUsers) {
                        const [afkRows] = await pool.query(
                            `SELECT reason, created_at
                 FROM afk_users
                 WHERE guild_id = ? AND user_id = ?
                 LIMIT 1`,
                            [message.guild.id, user.id]
                        );

                        if (!afkRows.length) continue;

                        const afkData = afkRows[0];
                        const timestamp = Math.floor(new Date(afkData.created_at).getTime() / 1000);

                        afkReplies.push(
                            `😴 **${user.tag} is AFK**\n` +
                            `**Reason:** ${afkData.reason || 'No reason provided.'}\n` +
                            `**Since:** <t:${timestamp}:R>`
                        );
                    }

                    if (afkReplies.length > 0) {
                        await safeReply(message, {
                            content: afkReplies.join('\n\n')
                        });
                    }
                }
            }

            // ==================================================
            // AUTOMOD
            // ==================================================
            try {
                await automod(message);
            } catch (error) {
                logError('AUTOMOD', error, {
                    event: 'messageCreate',
                    user: `${message.author.tag} (${message.author.id})`,
                    guild: `${message.guild.name} (${message.guild.id})`,
                    channel: `${message.channel.name} (${message.channel.id})`
                });
            }

            // ==================================================
            // XP SYSTEM
            // GIVE XP ONLY FOR NORMAL MESSAGES, NOT COMMANDS
            // ==================================================
            try {
                const isCommand = message.content.startsWith(prefix);

                if (!isCommand) {
                    await giveMessageXp(message);
                }
            } catch (error) {
                logError('RANK XP', error, {
                    event: 'messageCreate',
                    user: `${message.author.tag} (${message.author.id})`,
                    guild: `${message.guild.name} (${message.guild.id})`
                });
            }

            // ==================================================
            // PREFIX COMMAND CHECK
            // STOP HERE IF MESSAGE IS NOT A PREFIX COMMAND
            // ==================================================
            if (!message.content.startsWith(prefix)) return;

            // ==================================================
            // ARGUMENT / COMMAND PARSING
            // ==================================================
            const args = message.content
                .slice(prefix.length)
                .trim()
                .split(/\s+/)
                .filter(Boolean);

            const commandName = args.shift()?.toLowerCase();
            if (!commandName) return;

            // ==================================================
            // FIND COMMAND
            // ==================================================
            const command =
                client.commands.get(commandName) ||
                client.commands.find(cmd => Array.isArray(cmd.aliases) && cmd.aliases.includes(commandName));

            if (!command) return;

            // ==================================================
            // PREFIX SUPPORT CHECK
            // ==================================================
            if (typeof command.executePrefix !== 'function') {
                return safeReply(message, {
                    content: '❌ This command can only be used as a slash command.'
                });
            }

            // ==================================================
            // PERMISSION CHECK
            // ==================================================
            let allowed = false;

            try {
                allowed = await checkPrefixPermission(message, command);
            } catch (error) {
                console.error(`Prefix permission check failed for "${commandName}":`, error);

                return safeReply(message, {
                    content: '❌ Failed to check permissions for that command.'
                });
            }

            if (!allowed) return;

            const isCoolingDown = await handlePrefixCooldown(message, command);
            if (isCoolingDown) return;

            // ==================================================
            // EXECUTE PREFIX COMMAND
            // ==================================================
            try {
                await command.executePrefix(message, args);
            } catch (error) {
                const errorId = logError('PREFIX COMMAND', error, {
                    command: command.name,
                    user: `${message.author.tag} (${message.author.id})`,
                    guild: `${message.guild.name} (${message.guild.id})`,
                    channel: `${message.channel.name} (${message.channel.id})`
                });

                return safeReply(message, {
                    content: `❌ Something went wrong while running that command.\nError ID: \`${errorId}\``
                });
            }
        } catch (error) {
            logError('MESSAGE CREATE', error, {
                event: 'messageCreate'
            });
        }
    }
};