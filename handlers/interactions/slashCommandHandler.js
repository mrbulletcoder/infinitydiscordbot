const { checkSlashPermission } = require('../../utils/checkPermissions');
const { logError } = require('../../utils/errorHandler');
const { safeReply } = require('./safeReply');

function getCommandCooldown(command) {
    return Number(command.cooldown ?? 3);
}

function formatCooldown(ms) {
    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

async function handleCommandCooldown(interaction, command) {
    if (!interaction.client.cooldowns) interaction.client.cooldowns = new Map();

    const cooldowns = interaction.client.cooldowns;
    const commandName = command.name || interaction.commandName;
    const guildId = interaction.guild?.id || 'dm';
    const key = `${guildId}:${interaction.user.id}:${commandName}:slash`;
    const cooldownSeconds = getCommandCooldown(command);

    if (cooldownSeconds <= 0) return false;

    const now = Date.now();
    const expiresAt = cooldowns.get(key);

    if (expiresAt && now < expiresAt) {
        const remainingMs = expiresAt - now;

        await safeReply(interaction, {
            content: `⏳ You are on cooldown.\nPlease wait **${formatCooldown(remainingMs)}** before using \`/${interaction.commandName}\` again.`
        }, true);

        return true;
    }

    cooldowns.set(key, now + cooldownSeconds * 1000);
    setTimeout(() => cooldowns.delete(key), cooldownSeconds * 1000);

    return false;
}

async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        return safeReply(interaction, {
            content: '❌ That command could not be found.',
        }, true);
    }

    if (typeof command.executeSlash !== 'function') {
        return safeReply(interaction, {
            content: '❌ That command is not set up correctly.',
        }, true);
    }

    try {

        let allowed = false;

        try {
            allowed = await checkSlashPermission(interaction, command);
        } catch (error) {
            logError('SLASH PERMISSION', error, {
                command: interaction.commandName,
                user: `${interaction.user.tag} (${interaction.user.id})`,
                guild: interaction.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'DM'
            });

            return safeReply(interaction, {
                content: '❌ Failed to check permissions for that command.'
            }, true);
        }

        if (!allowed) {
            return safeReply(interaction, {
                content: '❌ You do not have permission to use this command.'
            }, true);
        }

        const isCoolingDown = await handleCommandCooldown(interaction, command);
        if (isCoolingDown) return;

        return command.executeSlash(interaction);
    } catch (error) {
        const errorId = logError('SLASH COMMAND', error, {
            command: interaction.commandName,
            user: `${interaction.user.tag} (${interaction.user.id})`,
            guild: interaction.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'DM',
            channel: interaction.channel ? `${interaction.channel.name} (${interaction.channel.id})` : 'Unknown'
        });

        return safeReply(interaction, {
            content: `❌ Something went wrong while running this command.\nError ID: \`${errorId}\``
        }, true).catch(() => null);
    }
}

module.exports = { handleSlashCommand };