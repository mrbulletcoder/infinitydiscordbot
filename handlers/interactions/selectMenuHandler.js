const { safeRun } = require('./safeReply');
const { handleHelpMenu } = require('./helpMenuHandler');
const {
    handleAutomodProtectionSelect,
    handleAutomodOffenseSelect,
    handleAutomodActionSelect,
    handleAutomodDurationSelect
} = require('./automodInteractionHandler');

const {
    handleCreateApplication
} = require('../../utils/applications');

const {
    handleAppealGuildSelect,
    handleAppealCaseSelect
} = require('../../utils/appeals');

const {
    handleLoggingRoleSelect,
    handleFullSetupRoleSelect,
    handleFullSetupSupportRoleSelect,
    handleTicketSupportRoleSelect,
    handleApplicationPositionRoleSelect
} = require('./setupMenuHandler');

async function handleStringSelectMenu(interaction) {
    const { customId } = interaction;

    if (customId === 'appeal_guild_select') {
        return safeRun(interaction, `select ${customId}`, () => handleAppealGuildSelect(interaction));
    }

    if (customId.startsWith('appeal_case_select_')) {
        const guildId = customId.split('_')[3];
        return safeRun(interaction, `select ${customId}`, () => handleAppealCaseSelect(interaction, guildId));
    }

    if (customId === 'help_menu') {
        return safeRun(interaction, `select ${customId}`, () => handleHelpMenu(interaction));
    }

    if (customId === 'application_position_select') {
        const positionId = interaction.values[0];
        return safeRun(interaction, `select ${customId}`, () => handleCreateApplication(interaction, positionId));
    }

    if (customId === 'setup_application_position_role') {
        return safeRun(interaction, `select ${customId}`, () =>
            handleApplicationPositionRoleSelect(interaction)
        );
    }

    if (customId.startsWith('automod_select_')) {
        return safeRun(interaction, `select ${customId}`, () => handleAutomodProtectionSelect(interaction));
    }

    if (customId.startsWith('automod_offense_')) {
        return safeRun(interaction, `select ${customId}`, () => handleAutomodOffenseSelect(interaction));
    }

    if (customId.startsWith('automod_action_')) {
        return safeRun(interaction, `select ${customId}`, () => handleAutomodActionSelect(interaction));
    }

    if (customId.startsWith('automod_duration_')) {
        return safeRun(interaction, `select ${customId}`, () => handleAutomodDurationSelect(interaction));
    }

    if (customId === 'setup_logging_roles') {
        return safeRun(interaction, `select ${customId}`, () =>
            handleLoggingRoleSelect(interaction)
        );
    }

    if (customId === 'setup_full_roles') {
        return safeRun(interaction, `select ${customId}`, () =>
            handleFullSetupRoleSelect(interaction)
        );
    }

    if (customId === 'setup_full_support_role') {
        return safeRun(interaction, `select ${customId}`, () =>
            handleFullSetupSupportRoleSelect(interaction)
        );
    }

    if (customId === 'setup_ticket_support_role') {
        return safeRun(interaction, `select ${customId}`, () =>
            handleTicketSupportRoleSelect(interaction)
        );
    }
}

module.exports = { handleStringSelectMenu };
