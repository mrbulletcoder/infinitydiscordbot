require('dotenv').config({ quiet: true });

const prefix = process.env.PREFIX || '!';
const automod = require('../utils/automod');
const { checkPrefixPermission } = require('../utils/checkPermissions');
const { giveMessageXp } = require('../utils/rank');
const { afkUsers } = require('../commands/general/afk');

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
    const key = `${message.author.id}:${commandName}:prefix`;
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
            if (!message.guild) return;
            if (typeof message.content !== 'string') return;

            // ==================================================
            // AFK: REMOVE AFK STATUS WHEN USER SPEAKS
            // ==================================================
            if (afkUsers.has(message.author.id)) {
                afkUsers.delete(message.author.id);

                await safeReply(message, {
                    content: '👋 Welcome back! Your AFK status has been removed.'
                });
            }

            // ==================================================
            // AFK: NOTIFY IF MENTIONED USER IS AFK
            // ==================================================
            if (message.mentions?.users?.size > 0) {
                const afkReplies = [];

                message.mentions.users.forEach(user => {
                    if (!user || user.bot) return;
                    if (!afkUsers.has(user.id)) return;
                    if (user.id === message.author.id) return;

                    const afkData = afkUsers.get(user.id);
                    if (!afkData) return;

                    afkReplies.push(
                        `😴 **${user.tag} is AFK**\n` +
                        `**Reason:** ${afkData.reason || 'No reason provided.'}\n` +
                        `**Since:** <t:${Math.floor((afkData.timestamp || Date.now()) / 1000)}:R>`
                    );
                });

                if (afkReplies.length > 0) {
                    await safeReply(message, {
                        content: afkReplies.join('\n\n')
                    });
                }
            }

            // ==================================================
            // AUTOMOD
            // ==================================================
            try {
                await automod(message);
            } catch (error) {
                console.error('AutoMod error:', error);
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
                console.error('Rank XP error:', error);
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
                console.error(`Error in prefix command "${command.name}" (${commandName}):`, error);

                return safeReply(message, {
                    content: '❌ Error executing command.'
                });
            }
        } catch (error) {
            console.error('Unhandled messageCreate error:', error);
        }
    }
};