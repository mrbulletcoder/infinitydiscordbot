const { safeRun } = require('./safeReply');
const { runReportButtonAction } = require('./reportActionGuard');
const { handleRefreshPing } = require('./pingHandler');
const { handleAutomodModeButton } = require('./automodInteractionHandler');

const {
    handleGiveawayEnter,
    handleGiveawayEntries,
    handleGiveawayEnd,
    handleGiveawayConfirmEnd,
    handleGiveawayCancelEnd,
    handleGiveawayReroll
} = require('../../utils/giveaway');

const {
    handleCreateTicket,
    handleClaimTicket,
    handleCloseTicket,
    handleCloseTicketConfirm,
    handleCloseTicketCancel
} = require('../../utils/tickets');

const {
    handleAcceptApplication,
    handleDenyApplication
} = require('../../utils/applications');

const {
    handleClaimReport,
    handleResolveReport,
    handleDismissReport
} = require('../../utils/reports');

const {
    handleClaimAppeal,
    handleApproveAppeal,
    handleDenyAppeal
} = require('../../utils/appeals');

async function handleButton(interaction) {
    const { customId } = interaction;

    if (customId.startsWith('appeal_claim_')) {
        const appealId = customId.split('_')[2];
        return safeRun(interaction, `button ${customId}`, () => handleClaimAppeal(interaction, appealId));
    }

    if (customId.startsWith('appeal_approve_')) {
        const appealId = customId.split('_')[2];
        return safeRun(interaction, `button ${customId}`, () => handleApproveAppeal(interaction, appealId));
    }

    if (customId.startsWith('appeal_deny_')) {
        const appealId = customId.split('_')[2];
        return safeRun(interaction, `button ${customId}`, () => handleDenyAppeal(interaction, appealId));
    }

    if (customId.startsWith('report_claim_')) {
        const reportId = customId.split('_')[2];
        return runReportButtonAction(interaction, 'claim', reportId, () => handleClaimReport(interaction, reportId));
    }

    if (customId.startsWith('report_resolve_')) {
        const reportId = customId.split('_')[2];
        return runReportButtonAction(interaction, 'resolve', reportId, () => handleResolveReport(interaction, reportId));
    }

    if (customId.startsWith('report_dismiss_')) {
        const reportId = customId.split('_')[2];
        return runReportButtonAction(interaction, 'dismiss', reportId, () => handleDismissReport(interaction, reportId));
    }

    if (customId === 'giveaway_enter') return safeRun(interaction, `button ${customId}`, () => handleGiveawayEnter(interaction));
    if (customId === 'giveaway_entries') return safeRun(interaction, `button ${customId}`, () => handleGiveawayEntries(interaction));
    if (customId === 'giveaway_end') return safeRun(interaction, `button ${customId}`, () => handleGiveawayEnd(interaction));

    if (customId.startsWith('giveaway_confirm_end_')) {
        const giveawayId = customId.replace('giveaway_confirm_end_', '');
        return safeRun(interaction, `button ${customId}`, () => handleGiveawayConfirmEnd(interaction, giveawayId));
    }

    if (customId.startsWith('giveaway_cancel_end_')) {
        return safeRun(interaction, `button ${customId}`, () => handleGiveawayCancelEnd(interaction));
    }

    if (customId === 'giveaway_reroll') return safeRun(interaction, `button ${customId}`, () => handleGiveawayReroll(interaction));
    if (customId === 'refresh_ping') return safeRun(interaction, 'button refresh_ping', () => handleRefreshPing(interaction));
    if (customId === 'ticket_create') return safeRun(interaction, `button ${customId}`, () => handleCreateTicket(interaction));

    if (customId.startsWith('ticket_claim_')) {
        const ticketId = customId.split('_')[2];
        return safeRun(interaction, `button ${customId}`, () => handleClaimTicket(interaction, ticketId));
    }

    if (customId.startsWith('ticket_close_confirm_')) {
        const ticketId = customId.split('_')[3];
        return safeRun(interaction, `button ${customId}`, () => handleCloseTicket(interaction, ticketId));
    }

    if (customId.startsWith('ticket_close_yes_')) {
        const ticketId = customId.split('_')[3];
        return safeRun(interaction, `button ${customId}`, () => handleCloseTicketConfirm(interaction, ticketId));
    }

    if (customId.startsWith('ticket_close_no_')) {
        const ticketId = customId.split('_')[3];
        return safeRun(interaction, `button ${customId}`, () => handleCloseTicketCancel(interaction, ticketId));
    }

    if (customId === 'automod_add' || customId === 'automod_edit' || customId === 'automod_delete') {
        return safeRun(interaction, `button ${customId}`, () => handleAutomodModeButton(interaction));
    }

    if (customId.startsWith('application_accept_')) {
        const applicationId = customId.split('_')[2];
        return safeRun(interaction, `button ${customId}`, () => handleAcceptApplication(interaction, applicationId));
    }

    if (customId.startsWith('application_deny_')) {
        const applicationId = customId.split('_')[2];
        return safeRun(interaction, `button ${customId}`, () => handleDenyApplication(interaction, applicationId));
    }
}

module.exports = { handleButton };
