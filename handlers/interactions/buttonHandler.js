const { PermissionFlagsBits } = require('discord.js');
const { safeRun, safeReply } = require('./safeReply');
const { runReportButtonAction } = require('./reportActionGuard');
const { handleRefreshPing } = require('./pingHandler');
const { handleAutomodModeButton } = require('./automodInteractionHandler');
const { handleSetupButton } = require('./setupMenuHandler');
const { handleHighLowButton } = require('../../commands/economy/highlow');
const { handleBlackjackButton } = require('../../commands/economy/blackjack');

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
    handleDenyAppeal,
    handleCloseAppeal
} = require('../../utils/appeals');

const {
    pendingEmbeds,
    buildEmbed,
    buildLinkButtons
} = require('../../commands/admin/embed');

const {
    serverPages,
    buildServersEmbed,
    buildServersButtons
} = require('../../commands/admin/servers');

async function handleButton(interaction) {
    const { customId } = interaction;

    if (
        customId === 'servers_prev' ||
        customId === 'servers_next' ||
        customId.startsWith('servers_invite_')
    ) {
        return safeRun(interaction, `button ${customId}`, async () => {
            const key = `${interaction.user.id}:${interaction.guild.id}`;
            const data = serverPages.get(key);

            if (!data) {
                return safeReply(interaction, {
                    content: '❌ This server list has expired. Please run `/servers` again.'
                }, true);
            }

            if (customId === 'servers_prev') {
                data.page = Math.max(0, data.page - 1);

                serverPages.set(key, data);

                return interaction.update({
                    embeds: [buildServersEmbed(interaction, data)],
                    components: buildServersButtons(data)
                }).catch(() => null);
            }

            if (customId === 'servers_next') {
                const totalPages = Math.max(1, Math.ceil(data.guilds.length / 5));

                data.page = Math.min(totalPages - 1, data.page + 1);

                serverPages.set(key, data);

                return interaction.update({
                    embeds: [buildServersEmbed(interaction, data)],
                    components: buildServersButtons(data)
                }).catch(() => null);
            }

            if (customId.startsWith('servers_invite_')) {
                const index = Number(customId.replace('servers_invite_', ''));
                const guildIndex = data.page * 5 + index;
                const guildData = data.guilds[guildIndex];

                if (!guildData) {
                    return safeReply(interaction, {
                        content: '❌ That server could not be found on this page.'
                    }, true);
                }

                const guild = interaction.client.guilds.cache.get(guildData.id);

                if (!guild) {
                    return safeReply(interaction, {
                        content: '❌ I am no longer in that server.'
                    }, true);
                }

                const inviteChannel = guild.channels.cache.find(channel =>
                    channel.isTextBased?.() &&
                    channel.permissionsFor(guild.members.me)?.has([
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.CreateInstantInvite
                    ])
                );

                if (!inviteChannel) {
                    return safeReply(interaction, {
                        content: `❌ I could not create an invite for **${guild.name}**. Missing invite permissions.`
                    }, true);
                }

                const invite = await inviteChannel.createInvite({
                    maxAge: 300,
                    maxUses: 1,
                    unique: true,
                    reason: 'Owner requested invite from /servers command'
                });

                return safeReply(interaction, {
                    content: `🔗 Invite for **${guild.name}**:\n${invite.url}`
                }, true);
            }
        });
    }

    if (customId.startsWith('embed_confirm_')) {
        return safeRun(interaction, `button ${customId}`, async () => {

            const embedId = interaction.customId.replace('embed_confirm_', '');
            const data = pendingEmbeds.get(embedId);

            if (!data) {
                return interaction.update({
                    content: '❌ This embed preview has expired. Please run `/embed` again.',
                    embeds: [],
                    components: []
                }).catch(() => null);
            }

            if (interaction.user.id !== data.userId) {
                return safeReply(interaction, {
                    content: '❌ Only the admin who created this preview can send it.'
                }, true).catch(() => null);
            }

            const channel = interaction.guild.channels.cache.get(data.channelId)
                || await interaction.guild.channels.fetch(data.channelId).catch(() => null);

            if (!channel) {
                pendingEmbeds.delete(embedId);

                return interaction.update({
                    content: '❌ The target channel no longer exists.',
                    embeds: [],
                    components: []
                }).catch(() => null);
            }

            if (!channel.permissionsFor(interaction.guild.members.me).has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ])) {
                return interaction.update({
                    content: `❌ I no longer have permission to send embeds in ${channel}.`,
                    embeds: [],
                    components: []
                }).catch(() => null);
            }

            const embed = buildEmbed(data, interaction);
            const linkRows = buildLinkButtons(data);

            const messagePayload = {
                embeds: [embed],
                components: linkRows,
                allowedMentions: {
                    parse: data.ping === '@everyone' || data.ping === '@here'
                        ? ['everyone']
                        : []
                }
            };

            if (data.ping && data.ping !== 'none') {
                messagePayload.content = data.ping;
            }

            await channel.send(messagePayload);

            pendingEmbeds.delete(embedId);

            return interaction.update({
                content: `✅ Embed sent successfully in ${channel}.`,
                embeds: [],
                components: []
            }).catch(() => null);
        });
    }

    if (customId.startsWith('embed_cancel_')) {
        return safeRun(interaction, `button ${customId}`, async () => {

            const embedId = interaction.customId.replace('embed_cancel_', '');
            const data = pendingEmbeds.get(embedId);

            if (data && interaction.user.id !== data.userId) {
                return safeReply(interaction, {
                    content: '❌ Only the admin who created this preview can cancel it.'
                }, true).catch(() => null);
            }

            pendingEmbeds.delete(embedId);

            return interaction.update({
                content: '❌ Embed cancelled.',
                embeds: [],
                components: []
            }).catch(() => null);
        });
    }

    if (customId.startsWith('highlow_')) {
        return safeRun(interaction, `button ${customId}`, () => handleHighLowButton(interaction));
    }

    if (customId.startsWith('blackjack_')) {
        return safeRun(interaction, `button ${customId}`, () => handleBlackjackButton(interaction));
    }

    if (customId.startsWith('setup_')) {
        return safeRun(interaction, `button ${customId}`, () => handleSetupButton(interaction));
    }

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

    if (customId.startsWith('appeal_close_')) {
        const appealId = customId.split('_')[2];
        return safeRun(interaction, `button ${customId}`, () => handleCloseAppeal(interaction, appealId));
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
