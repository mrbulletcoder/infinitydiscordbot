const {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const { pool } = require('../database');
const { safeReply, safeDefer } = require('../handlers/interactions/safeReply');

function reply(interaction, payload, ephemeral = true) {
    return safeReply(interaction, payload, ephemeral);
}

function hasReportStaffPerms(member) {
    return (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild) ||
        member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
        member.permissions.has(PermissionFlagsBits.KickMembers) ||
        member.permissions.has(PermissionFlagsBits.BanMembers)
    );
}

async function getReportById(guildId, reportId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM reports
         WHERE guild_id = ? AND id = ?
         LIMIT 1`,
        [guildId, reportId]
    );

    return rows[0] || null;
}

async function fetchUser(client, userId) {
    if (!userId) return null;
    return client.users.fetch(userId).catch(() => null);
}

function buildReportButtons(reportId, disableAll = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`report_claim_${reportId}`)
                .setLabel('Claim')
                .setEmoji('🛄')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disableAll),
            new ButtonBuilder()
                .setCustomId(`report_resolve_${reportId}`)
                .setLabel('Resolve')
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success)
                .setDisabled(disableAll),
            new ButtonBuilder()
                .setCustomId(`report_dismiss_${reportId}`)
                .setLabel('Dismiss')
                .setEmoji('❌')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disableAll)
        )
    ];
}

function buildReportEmbed({
    guild,
    caseNumber,
    reportId,
    reporter,
    target,
    reason,
    status = 'Open',
    claimedBy = null,
    handledBy = null,
    decision = null,
    submittedAt = Date.now()
}) {
    const statusColor =
        status === 'Resolved'
            ? '#57f287'
            : status === 'Dismissed'
                ? '#ff4d4d'
                : status === 'Claimed'
                    ? '#ffaa00'
                    : '#00bfff';

    const submittedUnix = Math.floor(Number(submittedAt || Date.now()) / 1000);

    return new EmbedBuilder()
        .setColor(statusColor)
        .setAuthor({
            name: 'Infinity • Member Report',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle(`🚨 Report Case #${caseNumber}`)
        .setDescription(
            decision
                ? `**Final Decision:**\n> ${decision}`
                : 'A member report has been submitted and is ready for staff review.'
        )
        .setThumbnail(target?.displayAvatarURL?.({ dynamic: true, size: 256 }) || null)
        .addFields(
            {
                name: '📌 Report Details',
                value:
                    `Report ID: \`${reportId}\`\n` +
                    `Case: \`#${caseNumber}\`\n` +
                    `Status: \`${status}\`\n` +
                    `Submitted: <t:${submittedUnix}:R>`,
                inline: false
            },
            {
                name: '👤 Reported Member',
                value:
                    `${target ? target.tag : 'Unknown User'}\n` +
                    `\`${target?.id || 'Unknown ID'}\``,
                inline: false
            },
            {
                name: '🧾 Reported By',
                value:
                    `${reporter ? reporter.tag : 'Unknown User'}\n` +
                    `\`${reporter?.id || 'Unknown ID'}\``,
                inline: false
            },
            {
                name: '📄 Reason',
                value: `> ${String(reason || 'No reason provided.').slice(0, 1000)}`,
                inline: false
            },
            {
                name: '📍 Staff Status',
                value:
                    `Claimed By: ${claimedBy ? claimedBy.tag : '`Not claimed`'}\n` +
                    `Handled By: ${handledBy ? handledBy.tag : '`Not handled yet`'}`,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Bot • Reports System ⚡' })
        .setTimestamp();
}

async function updateReportMessage(interaction, report, overrides = {}, disableButtons = false) {
    const reporter = await fetchUser(interaction.client, report.reporter_id);
    const target = await fetchUser(interaction.client, report.reported_user_id);

    const claimedBy = overrides.claimedBy !== undefined
        ? overrides.claimedBy
        : await fetchUser(interaction.client, report.claimed_by);

    const handledBy = overrides.handledBy !== undefined
        ? overrides.handledBy
        : await fetchUser(interaction.client, report.handled_by);

    const embed = buildReportEmbed({
        guild: interaction.guild,
        caseNumber: report.case_number,
        reportId: report.id,
        reporter,
        target,
        reason: report.reason,
        status: overrides.status || report.status || 'Open',
        claimedBy,
        handledBy,
        decision: overrides.decision ?? report.decision_reason ?? null,
        submittedAt: report.created_at
    });

    let reportMessage = interaction.message || null;

    if (!reportMessage && report.channel_id && report.message_id) {
        const channel =
            interaction.guild.channels.cache.get(report.channel_id) ||
            await interaction.guild.channels.fetch(report.channel_id).catch(() => null);

        if (channel) {
            reportMessage = await channel.messages.fetch(report.message_id).catch(() => null);
        }
    }

    if (!reportMessage) {
        console.warn(`Could not find report message for report ID ${report.id}`);
        return null;
    }

    return reportMessage.edit({
        embeds: [embed],
        components: buildReportButtons(report.id, disableButtons)
    }).catch(error => {
        console.error('Failed to update report message:', error);
        return null;
    });
}

async function handleClaimReport(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return reply(interaction, {
            content: '❌ Only staff can manage reports.',
        }, true);
    }

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return reply(interaction, {
            content: '❌ Report not found.'
        }, true);
    }

    const currentStatus = String(report.status || '').toLowerCase();

    if (!['open', 'claimed'].includes(currentStatus)) {
        return reply(interaction, {
            content: `❌ This report is already ${report.status}.`
        }, true);
    }

    if (report.claimed_by && report.claimed_by !== interaction.user.id) {
        return reply(interaction, {
            content: '❌ This report has already been claimed by another staff member.'
        }, true);
    }

    await pool.query(
        `UPDATE reports
         SET claimed_by = ?, claimed_at = ?, status = 'claimed'
         WHERE id = ?`,
        [interaction.user.id, Date.now(), report.id]
    );

    report.claimed_by = interaction.user.id;
    report.claimed_at = Date.now();
    report.status = 'Claimed';

    await updateReportMessage(
        interaction,
        report,
        {
            status: 'Claimed',
            claimedBy: interaction.user,
            handledBy: report.handled_by
                ? await fetchUser(interaction.client, report.handled_by)
                : null
        },
        false
    );

    return reply(interaction, {
        content: `✅ You claimed report case #${report.case_number}.`
    }, true);
}

async function handleResolveReport(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return reply(interaction, {
            content: '❌ Only staff can manage reports.',
        }, true);
    }

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return reply(interaction, {
            content: '❌ Report not found.',
        }, true);
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return reply(interaction, {
            content: `❌ This report is already ${report.status}.`,
        }, true);
    }

    const modal = new ModalBuilder()
        .setCustomId(`report_resolve_modal_${reportId}`)
        .setTitle('Resolve Report');

    const input = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('What action was taken?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);
}

async function handleDismissReport(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return reply(interaction, {
            content: '❌ Only staff can manage reports.',
        }, true);
    }

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return reply(interaction, {
            content: '❌ Report not found.',
        }, true);
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return reply(interaction, {
            content: `❌ This report is already ${report.status}.`,
        }, true);
    }

    const modal = new ModalBuilder()
        .setCustomId(`report_dismiss_modal_${reportId}`)
        .setTitle('Dismiss Report');

    const input = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Why are you dismissing this report?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);
}

async function handleResolveReportModal(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return reply(interaction, {
            content: '❌ Only staff can manage reports.',
        }, true);
    }

    const deferred = await safeDefer(interaction, true);
    if (!deferred) return;

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return reply(interaction, {
            content: '❌ Report not found.'
        }, true);
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return reply(interaction, {
            content: `❌ This report is already ${report.status}.`
        }, true);
    }

    const reason = interaction.fields.getTextInputValue('reason');

    await pool.query(
        `UPDATE reports
         SET status = 'resolved',
             handled_by = ?,
             handled_at = ?,
             decision_reason = ?,
             claimed_by = COALESCE(claimed_by, ?),
             claimed_at = COALESCE(claimed_at, ?)
         WHERE id = ?`,
        [
            interaction.user.id,
            Date.now(),
            reason,
            interaction.user.id,
            Date.now(),
            report.id
        ]
    );

    report.status = 'Resolved';
    report.handled_by = interaction.user.id;
    report.handled_at = Date.now();
    report.decision_reason = reason;
    report.claimed_by = report.claimed_by || interaction.user.id;
    report.claimed_at = report.claimed_at || Date.now();

    await updateReportMessage(
        interaction,
        report,
        {
            status: 'Resolved',
            claimedBy: await fetchUser(interaction.client, report.claimed_by),
            handledBy: interaction.user,
            decision: reason
        },
        true
    );

    const reporter = await fetchUser(interaction.client, report.reporter_id);
    const target = await fetchUser(interaction.client, report.reported_user_id);

    if (reporter) {
        const dmEmbed = new EmbedBuilder()
            .setAuthor({
                name: '✅ Your Report Was Reviewed',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00ff88')
            .setDescription(
                `Your report case **#${report.case_number}** in **${interaction.guild.name}** has been reviewed by staff.`
            )
            .addFields(
                {
                    name: 'Action Taken',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Reports System' })
            .setTimestamp();

        await reporter.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    if (target) {
        const dmEmbed = new EmbedBuilder()
            .setAuthor({
                name: '⚠️ Staff Action Notice',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#ffaa00')
            .setDescription(
                `A staff report involving you in **${interaction.guild.name}** has been reviewed.`
            )
            .addFields(
                {
                    name: 'Outcome',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Reports System' })
            .setTimestamp();

        await target.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    return reply(interaction, {
        content: `✅ Report case #${report.case_number} resolved.`
    }, true);
}

async function handleDismissReportModal(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return reply(interaction, {
            content: '❌ Only staff can manage reports.',
        }, true);
    }

    const deferred = await safeDefer(interaction, true);
    if (!deferred) return;

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return reply(interaction, {
            content: '❌ Report not found.'
        });
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return reply(interaction, {
            content: `❌ This report is already ${report.status}.`
        }, true);
    }

    const reason = interaction.fields.getTextInputValue('reason');

    await pool.query(
        `UPDATE reports
         SET status = 'dismissed',
             handled_by = ?,
             handled_at = ?,
             decision_reason = ?,
             claimed_by = COALESCE(claimed_by, ?),
             claimed_at = COALESCE(claimed_at, ?)
         WHERE id = ?`,
        [
            interaction.user.id,
            Date.now(),
            reason,
            interaction.user.id,
            Date.now(),
            report.id
        ]
    );

    report.status = 'Dismissed';
    report.handled_by = interaction.user.id;
    report.handled_at = Date.now();
    report.decision_reason = reason;
    report.claimed_by = report.claimed_by || interaction.user.id;
    report.claimed_at = report.claimed_at || Date.now();

    await updateReportMessage(
        interaction,
        report,
        {
            status: 'Dismissed',
            claimedBy: await fetchUser(interaction.client, report.claimed_by),
            handledBy: interaction.user,
            decision: reason
        },
        true
    );

    const reporter = await fetchUser(interaction.client, report.reporter_id);

    if (reporter) {
        const dmEmbed = new EmbedBuilder()
            .setAuthor({
                name: '❌ Your Report Was Reviewed',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#ff4d4d')
            .setDescription(
                `Your report case **#${report.case_number}** in **${interaction.guild.name}** has been reviewed.`
            )
            .addFields(
                {
                    name: 'Outcome',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Reports System' })
            .setTimestamp();

        await reporter.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    return reply(interaction, {
        content: `✅ Report case #${report.case_number} dismissed.`
    }, true);
}

module.exports = {
    handleClaimReport,
    handleResolveReport,
    handleDismissReport,
    handleResolveReportModal,
    handleDismissReportModal
};