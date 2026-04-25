const { safeErrorReply } = require('../handlers/interactions/safeReply');
const { handleSlashCommand } = require('../handlers/interactions/slashCommandHandler');
const { handleButton } = require('../handlers/interactions/buttonHandler.js');
const { handleModal } = require('../handlers/interactions/modalHandler');
const { handleStringSelectMenu } = require('../handlers/interactions/selectMenuHandler');

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
            console.error('❌ Unhandled interactionCreate error:', error);
            return safeErrorReply(interaction);
        }
    }
};
