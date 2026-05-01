const { safeErrorReply } = require('../handlers/interactions/safeReply');
const { handleSlashCommand } = require('../handlers/interactions/slashCommandHandler');
const { handleButton } = require('../handlers/interactions/buttonHandler.js');
const { handleModal } = require('../handlers/interactions/modalHandler');
const { handleStringSelectMenu } = require('../handlers/interactions/selectMenuHandler');
const { logError } = require('../utils/errorHandler');

module.exports = {
    name: 'interactionCreate',

    async execute(interaction, client) {
        try {
            if (interaction.isChatInputCommand()) {
                return handleSlashCommand(interaction, client);
            }

            if (interaction.isButton()) {
                return handleButton(interaction);
            }

            if (interaction.isModalSubmit()) {
                return handleModal(interaction);
            }

            if (interaction.isStringSelectMenu()) {
                return handleStringSelectMenu(interaction);
            }
        } catch (error) {
            const errorId = logError('INTERACTION', error, {
                event: 'interactionCreate',
                command: interaction.commandName || 'Unknown',
                user: interaction.user ? `${interaction.user.tag} (${interaction.user.id})` : 'Unknown',
                guild: interaction.guild ? `${interaction.guild.name} (${interaction.guild.id})` : 'DM',
                channel: interaction.channel ? `${interaction.channel.name} (${interaction.channel.id})` : 'Unknown'
            });

            return safeErrorReply(interaction, errorId);
        }
    }
};
