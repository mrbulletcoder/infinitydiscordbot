const { checkSlashPermission } = require('../../utils/checkPermissions');
const { safeErrorReply, safeRun } = require('./safeReply');

function getCommandCooldown(command) {
    return Number(command.cooldown ?? 3);
}

async function handleCommandCooldown(interaction, command) {
    if (!interaction.client.cooldowns) interaction.client.cooldowns = new Map();

    const cooldowns = interaction.client.cooldowns;
    const commandName = command.name || interaction.commandName;
    const key = `${interaction.user.id}:${commandName}`;
    const cooldownSeconds = getCommandCooldown(command);

    if (cooldownSeconds <= 0) return false;

    const now = Date.now();
    const expiresAt = cooldowns.get(key);

    if (expiresAt && now < expiresAt) {
        const remaining = ((expiresAt - now) / 1000).toFixed(1);
        await safeErrorReply(interaction, `⏳ Please wait **${remaining}s** before using \`/${commandName}\` again.`);
        return true;
    }

    cooldowns.set(key, now + cooldownSeconds * 1000);
    setTimeout(() => cooldowns.delete(key), cooldownSeconds * 1000);

    return false;
}

async function handleSlashCommand(interaction, client) {
    const command = client.commands.get(interaction.commandName);

    if (!command) {
        return safeErrorReply(interaction, '❌ That command could not be found.');
    }

    if (typeof command.executeSlash !== 'function') {
        console.error(`Command "${interaction.commandName}" is missing executeSlash().`);
        return safeErrorReply(interaction, '❌ That command is not set up correctly.');
    }

    let allowed = false;

    try {
        allowed = await checkSlashPermission(interaction, command);
    } catch (error) {
        console.error(`Permission check failed for /${interaction.commandName}:`, error);
        return safeErrorReply(interaction, '❌ Failed to check permissions for that command.');
    }

    if (!allowed) return;

    const isCoolingDown = await handleCommandCooldown(interaction, command);
    if (isCoolingDown) return;

    return safeRun(interaction, `slash command /${interaction.commandName}`, () => command.executeSlash(interaction));
}

module.exports = { handleSlashCommand };
