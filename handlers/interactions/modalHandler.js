const { safeRun } = require('./safeReply');

const {
    handleApplicationModal,
    handleDenyApplicationModal
} = require('../../utils/applications');

const {
    handleResolveReportModal,
    handleDismissReportModal
} = require('../../utils/reports');

const {
    handleAppealModal,
    handleAppealDecisionModal
} = require('../../utils/appeals');

async function handleModal(interaction) {
    const { customId } = interaction;

    if (customId.startsWith('appeal_modal_')) {
        const parts = customId.split('_');
        const guildId = parts[2];
        const caseNumber = parts[3];
        return safeRun(interaction, `modal ${customId}`, () => handleAppealModal(interaction, guildId, caseNumber));
    }

    if (customId.startsWith('appeal_approve_modal_')) {
        const appealId = customId.split('_')[3];
        return safeRun(interaction, `modal ${customId}`, () => handleAppealDecisionModal(interaction, appealId, 'approved'));
    }

    if (customId.startsWith('appeal_deny_modal_')) {
        const appealId = customId.split('_')[3];
        return safeRun(interaction, `modal ${customId}`, () => handleAppealDecisionModal(interaction, appealId, 'denied'));
    }

    if (customId.startsWith('report_resolve_modal_')) {
        const reportId = customId.split('_')[3];
        return safeRun(interaction, `modal ${customId}`, () => handleResolveReportModal(interaction, reportId));
    }

    if (customId.startsWith('report_dismiss_modal_')) {
        const reportId = customId.split('_')[3];
        return safeRun(interaction, `modal ${customId}`, () => handleDismissReportModal(interaction, reportId));
    }

    if (customId.startsWith('application_modal_')) {
        const positionId = customId.split('_')[2];
        return safeRun(interaction, `modal ${customId}`, () => handleApplicationModal(interaction, positionId));
    }

    if (customId.startsWith('application_deny_modal_')) {
        const applicationId = customId.split('_')[3];
        return safeRun(interaction, `modal ${customId}`, () => handleDenyApplicationModal(interaction, applicationId));
    }
}

module.exports = { handleModal };
