const { MessageFlags } = require('discord.js');
const { logError } = require('../../utils/errorHandler');

function normalizeOptions(options, ephemeral = false) {
    if (typeof options === 'string') {
        options = { content: options };
    }

    const payload = { ...options };

    if (ephemeral && !payload.flags) {
        payload.flags = MessageFlags.Ephemeral;
    }

    delete payload.ephemeral;

    return payload;
}

async function safeReply(interaction, options, ephemeral = false) {
    try {
        if (!interaction) return null;

        const payload = normalizeOptions(options, ephemeral);

        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply(payload).catch(async () => {
                return interaction.followUp(payload).catch(() => null);
            });
        }

        return await interaction.reply(payload);
    } catch (error) {
        if (error.code === 10062 || error.code === 40060) return null;

        console.error('Failed to send safe reply:', error);
        return null;
    }
}

async function safeErrorReply(interaction, message = '❌ Something went wrong while handling that interaction.') {
    return safeReply(interaction, { content: message }, true);
}

async function safeDefer(interaction, ephemeral = false) {
    try {
        if (!interaction) return false;
        if (interaction.deferred || interaction.replied) return true;

        const options = ephemeral
            ? { flags: MessageFlags.Ephemeral }
            : {};

        await interaction.deferReply(options);
        return true;
    } catch (error) {
        if (error.code === 10062 || error.code === 40060) return false;

        console.error('Failed to defer interaction:', error);
        return false;
    }
}

async function safeRun(interaction, label, fn) {
    try {
        return await fn();
    } catch (error) {
        const errorId = logError('INTERACTION RUN', error, {
            command: interaction?.commandName || label,
            user: interaction?.user ? `${interaction.user.tag} (${interaction.user.id})` : 'Unknown',
            guild: interaction?.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'DM',
            channel: interaction?.channel ? `${interaction.channel.name} (${interaction.channel.id})` : 'Unknown'
        });

        return safeErrorReply(
            interaction,
            `❌ Something went wrong while running this command.\nError ID: \`${errorId}\``
        );
    }
}

module.exports = {
    safeReply,
    safeErrorReply,
    safeDefer,
    safeRun
};