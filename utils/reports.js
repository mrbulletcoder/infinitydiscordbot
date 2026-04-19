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
    const targetTag = target?.tag || 'Unknown User';
    const targetId = target?.id || 'Unknown ID';
    const reporterTag = reporter?.tag || 'Unknown User';
    const reporterId = reporter?.id || 'Unknown ID';

    return new EmbedBuilder()
        .setAuthor({
            name: '🚨 Infinity Member Report',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setColor(
            status === 'Resolved'
                ? '#00ff88'
                : status === 'Dismissed'
                    ? '#ff4d4d'
                    : status === 'Claimed'
                        ? '#ffaa00'
                        : '#ff4d4d'
        )
        .setThumbnail(
            target?.displayAvatarURL
                ? target.displayAvatarURL({ dynamic: true, size: 1024 })
                : null
        )
        .setDescription(
            decision
                ? `**Final Decision:** ${decision}`
                : 'A member report has been submitted and is awaiting staff review.'
        )
        .addFields(
            {
                name: '📌 Report Information',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `**Case:** \`#${caseNumber}\`\n` +
                    `**Report ID:** \`${reportId}\`\n` +
                    `**Status:** \`${status}\``,
                inline: true
            },
            {
                name: '👤 Reported User',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `${targetTag}\n` +
                    `\`${targetId}\``,
                inline: true
            },
            {
                name: '🧾 Reported By',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `${reporterTag}\n` +
                    `\`${reporterId}\``,
                inline: true
            },
            {
                name: '📄 Reason',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `${reason}`,
                inline: false
            },
            {
                name: '📅 Submitted',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    `<t:${Math.floor(Number(submittedAt) / 1000)}:F>\n` +
                    `<t:${Math.floor(Number(submittedAt) / 1000)}:R>`,
                inline: true
            },
            {
                name: '🛄 Claimed By',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    (claimedBy
                        ? `${claimedBy.tag}\n\`${claimedBy.id}\``
                        : '`Not claimed`'),
                inline: true
            },
            {
                name: '🛠️ Handled By',
                value:
                    '━━━━━━━━━━━━━━━━━━\n' +
                    (handledBy
                        ? `${handledBy.tag}\n\`${handledBy.id}\``
                        : '`Not handled yet`'),
                inline: true
            }
        )
        .setFooter({ text: 'Infinity Reports System' })
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

    await interaction.message.edit({
        embeds: [embed],
        components: buildReportButtons(report.id, disableButtons)
    });
}

async function handleClaimReport(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return interaction.reply({
            content: '❌ Only staff can manage reports.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return interaction.editReply({
            content: '❌ Report not found.'
        });
    }

    const currentStatus = String(report.status || '').toLowerCase();

    if (!['open', 'claimed'].includes(currentStatus)) {
        return interaction.editReply({
            content: `❌ This report is already ${report.status}.`
        });
    }

    if (report.claimed_by && report.claimed_by !== interaction.user.id) {
        return interaction.editReply({
            content: '❌ This report has already been claimed by another staff member.'
        });
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

    return interaction.editReply({
        content: `✅ You claimed report case #${report.case_number}.`
    });
}

async function handleResolveReport(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return interaction.reply({
            content: '❌ Only staff can manage reports.',
            ephemeral: true
        });
    }

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return interaction.reply({
            content: '❌ Report not found.',
            ephemeral: true
        });
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return interaction.reply({
            content: `❌ This report is already ${report.status}.`,
            ephemeral: true
        });
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
        return interaction.reply({
            content: '❌ Only staff can manage reports.',
            ephemeral: true
        });
    }

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return interaction.reply({
            content: '❌ Report not found.',
            ephemeral: true
        });
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return interaction.reply({
            content: `❌ This report is already ${report.status}.`,
            ephemeral: true
        });
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
        return interaction.reply({
            content: '❌ Only staff can manage reports.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return interaction.editReply({
            content: '❌ Report not found.'
        });
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return interaction.editReply({
            content: `❌ This report is already ${report.status}.`
        });
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

    return interaction.editReply({
        content: `✅ Report case #${report.case_number} resolved.`
    });
}

async function handleDismissReportModal(interaction, reportId) {
    if (!hasReportStaffPerms(interaction.member)) {
        return interaction.reply({
            content: '❌ Only staff can manage reports.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const report = await getReportById(interaction.guild.id, reportId);

    if (!report) {
        return interaction.editReply({
            content: '❌ Report not found.'
        });
    }

    if (!['open', 'claimed'].includes(String(report.status || '').toLowerCase())) {
        return interaction.editReply({
            content: `❌ This report is already ${report.status}.`
        });
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

    return interaction.editReply({
        content: `✅ Report case #${report.case_number} dismissed.`
    });
}

module.exports = {
    handleClaimReport,
    handleResolveReport,
    handleDismissReport,
    handleResolveReportModal,
    handleDismissReportModal
};