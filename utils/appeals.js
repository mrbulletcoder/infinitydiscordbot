const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const { pool } = require('../database');
const {
    getCaseByNumber,
    getAppealableCasesForUser
} = require('./moderationDb');

async function getTicketSettings(guildId) {
    const [rows] = await pool.query(
        `SELECT
            category_id,
            transcript_channel_id,
            support_role_id,
            appeal_category_id,
            appeal_role_id
         FROM ticket_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId]
    );

    return rows[0] || null;
}

async function getAppealById(appealId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM appeals
         WHERE id = ?
         LIMIT 1`,
        [appealId]
    );

    return rows[0] || null;
}

async function getAppealByCase(guildId, caseNumber, userId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM appeals
         WHERE guild_id = ? AND case_number = ? AND user_id = ?
         LIMIT 1`,
        [guildId, caseNumber, userId]
    );

    return rows[0] || null;
}

async function createAppealRecord({
    guildId,
    caseNumber,
    userId,
    moderatorId,
    reason
}) {
    const [result] = await pool.query(
        `INSERT INTO appeals
        (guild_id, case_number, user_id, moderator_id, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?)`,
        [
            guildId,
            caseNumber,
            userId,
            moderatorId || null,
            reason,
            Date.now()
        ]
    );

    return result.insertId;
}

function isAppealStaff(member, settings) {
    if (!member || !member.permissions) return false;

    if (
        member.permissions.has(PermissionFlagsBits.Administrator) ||
        member.permissions.has(PermissionFlagsBits.ManageGuild)
    ) {
        return true;
    }

    if (settings?.appeal_role_id) {
        return member.roles?.cache?.has(settings.appeal_role_id);
    }

    return false;
}

function buildAppealButtons(appealId, claimedBy = null, decided = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`appeal_claim_${appealId}`)
            .setLabel(claimedBy ? 'Appeal Claimed' : 'Claim Appeal')
            .setEmoji('🛠️')
            .setStyle(ButtonStyle.Success)
            .setDisabled(Boolean(claimedBy) || decided),
        new ButtonBuilder()
            .setCustomId(`appeal_approve_${appealId}`)
            .setLabel('Approve Appeal')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(decided),
        new ButtonBuilder()
            .setCustomId(`appeal_deny_${appealId}`)
            .setLabel('Deny Appeal')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(decided)
    );
}

function buildAppealEmbed({
    guild,
    user,
    caseData,
    appeal,
    claimedByText = 'Not claimed'
}) {
    return new EmbedBuilder()
        .setAuthor({
            name: '📨 Appeal Request',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setColor('#ffaa00')
        .setTitle(`Appeal • Case #${caseData.case_number}`)
        .addFields(
            {
                name: '👤 User',
                value: `${user.tag}\n\`${user.id}\``,
                inline: true
            },
            {
                name: '⚖️ Action',
                value: caseData.action || 'Unknown',
                inline: true
            },
            {
                name: '🛠️ Claimed By',
                value: claimedByText,
                inline: true
            },
            {
                name: '📄 Original Reason',
                value: caseData.reason || 'No reason provided',
                inline: false
            },
            {
                name: '📝 Appeal Reason',
                value: appeal.reason || 'No reason provided',
                inline: false
            },
            {
                name: '📅 Original Case Date',
                value: caseData.created_at
                    ? `<t:${Math.floor(Number(caseData.created_at) / 1000)}:F>`
                    : 'Unknown',
                inline: false
            },
            {
                name: '📬 Appeal Submitted',
                value: appeal.created_at
                    ? `<t:${Math.floor(Number(appeal.created_at) / 1000)}:F>`
                    : 'Unknown',
                inline: false
            },
            {
                name: '📌 Status',
                value: String(appeal.status || 'open').toUpperCase(),
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Appeals' })
        .setTimestamp();
}

async function createAppealTicket({
    client,
    guild,
    user,
    appeal,
    caseData
}) {
    const settings = await getTicketSettings(guild.id);

    if (!settings?.appeal_category_id || !settings?.transcript_channel_id || !settings?.appeal_role_id) {
        throw new Error('Appeal system is not configured properly.');
    }

    const category =
        guild.channels.cache.get(settings.appeal_category_id) ||
        await guild.channels.fetch(settings.appeal_category_id).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) {
        throw new Error('Invalid appeal category configured.');
    }

    const channelName = `appeal-${appeal.id}-${user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 25);

    const tempChannel = await guild.channels.create({
        name: channelName || `appeal-${appeal.id}`,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            },
            {
                id: settings.appeal_role_id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            },
            {
                id: client.user.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            }
        ]
    });

    const [ticketResult] = await pool.query(
        `INSERT INTO tickets
            (guild_id, channel_id, creator_id, claimed_by, status, created_at, ticket_type, linked_appeal_id)
         VALUES (?, ?, ?, ?, 'open', ?, 'appeal', ?)`,
        [
            guild.id,
            tempChannel.id,
            user.id,
            null,
            Date.now(),
            appeal.id
        ]
    );

    await pool.query(
        `UPDATE appeals
         SET ticket_id = ?, ticket_channel_id = ?
         WHERE id = ?`,
        [ticketResult.insertId, tempChannel.id, appeal.id]
    );

    const embed = buildAppealEmbed({
        guild,
        user,
        caseData,
        appeal
    });

    await tempChannel.send({
        content: `${user} <@&${settings.appeal_role_id}>`,
        embeds: [embed],
        components: [buildAppealButtons(appeal.id)]
    });

    return tempChannel;
}

async function getAppealEligibleGuildsForUser(client, userId) {
    const [rows] = await pool.query(
        `SELECT DISTINCT c.guild_id
         FROM cases c
         INNER JOIN ticket_settings ts ON ts.guild_id = c.guild_id
         WHERE c.user_id = ?
           AND ts.category_id IS NOT NULL
           AND ts.transcript_channel_id IS NOT NULL
           AND (
                c.action LIKE '%Ban%'
                OR c.action LIKE '%Kick%'
                OR c.action LIKE '%Timeout%'
                OR c.action LIKE '%Warn%'
           )
         ORDER BY c.guild_id ASC`,
        [userId]
    );

    const guilds = [];

    for (const row of rows) {
        const guild =
            client.guilds.cache.get(row.guild_id) ||
            await client.guilds.fetch(row.guild_id).catch(() => null);

        if (!guild) continue;
        guilds.push(guild);
    }

    return guilds;
}

async function startAppealFlow(message) {
    const eligibleGuilds = await getAppealEligibleGuildsForUser(message.client, message.author.id);

    if (!eligibleGuilds.length) {
        return message.channel.send(
            '❌ I could not find any servers where you have appealable cases.'
        );
    }

    const options = eligibleGuilds.slice(0, 25).map(guild => ({
        label: guild.name.slice(0, 100),
        value: guild.id,
        description: `Start an appeal for ${guild.name}`.slice(0, 100)
    }));

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('appeal_guild_select')
            .setPlaceholder('Choose the server for your appeal')
            .addOptions(options)
    );

    const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setTitle('📨 Start an Appeal')
        .setDescription(
            'Select the server where the moderation case happened.\n\n' +
            'After that, I will show you the cases you can appeal.'
        )
        .setFooter({ text: 'Infinity Appeals' })
        .setTimestamp();

    return message.channel.send({
        embeds: [embed],
        components: [row]
    });
}

async function handleAppealGuildSelect(interaction) {
    const guildId = interaction.values[0];
    const result = await getAppealableCasesForUser(guildId, interaction.user.id, 10);

    if (!result.ok) {
        return interaction.reply({
            content: '❌ Failed to load your cases.',
            ephemeral: true
        });
    }

    if (!result.rows.length) {
        return interaction.reply({
            content: '❌ You do not have any appealable cases in that server.',
            ephemeral: true
        });
    }

    const options = result.rows.slice(0, 25).map(row => ({
        label: `Case #${row.case_number} • ${row.action}`.slice(0, 100),
        value: String(row.case_number),
        description: (row.reason || 'No reason provided').slice(0, 100)
    }));

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`appeal_case_select_${guildId}`)
            .setPlaceholder('Choose a case to appeal')
            .addOptions(options)
    );

    return interaction.reply({
        content: 'Select the case you want to appeal.',
        components: [row],
        ephemeral: true
    });
}

async function handleAppealCaseSelect(interaction, guildId) {
    const caseNumber = interaction.values[0];

    const modal = new ModalBuilder()
        .setCustomId(`appeal_modal_${guildId}_${caseNumber}`)
        .setTitle(`Appeal Case #${caseNumber}`);

    const reasonInput = new TextInputBuilder()
        .setCustomId('appeal_reason')
        .setLabel('Why should this case be appealed?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(10)
        .setMaxLength(1000)
        .setPlaceholder('Explain why you believe this moderation case should be reviewed.');

    modal.addComponents(
        new ActionRowBuilder().addComponents(reasonInput)
    );

    return interaction.showModal(modal);
}

async function getAppealCaseData(appeal) {
    const caseResult = await getCaseByNumber(appeal.guild_id, Number(appeal.case_number));
    if (!caseResult.ok || !caseResult.rows.length) return null;
    return caseResult.rows[0];
}

async function updateAppealTicketMessage(interaction, appeal) {
    const caseData = await getAppealCaseData(appeal);
    if (!caseData) return;

    const guild =
        interaction.client.guilds.cache.get(appeal.guild_id) ||
        await interaction.client.guilds.fetch(appeal.guild_id).catch(() => null);

    if (!guild) return;

    const user = await interaction.client.users.fetch(appeal.user_id).catch(() => null);
    if (!user) return;

    const claimedByText = appeal.claimed_by ? `<@${appeal.claimed_by}>` : 'Not claimed';
    const decided = appeal.status === 'approved' || appeal.status === 'denied';

    const embed = buildAppealEmbed({
        guild,
        user,
        caseData,
        appeal,
        claimedByText
    });

    await interaction.message.edit({
        embeds: [embed],
        components: [buildAppealButtons(appeal.id, appeal.claimed_by, decided)]
    }).catch(() => null);
}

async function handleAppealModal(interaction, guildId, caseNumber) {
    await interaction.deferReply({ ephemeral: true });

    const appealReason = interaction.fields.getTextInputValue('appeal_reason')?.trim();

    const caseResult = await getCaseByNumber(guildId, Number(caseNumber));
    if (!caseResult.ok || !caseResult.rows.length) {
        return interaction.editReply({
            content: '❌ That case could not be found.'
        });
    }

    const caseData = caseResult.rows[0];

    if (String(caseData.user_id) !== String(interaction.user.id)) {
        return interaction.editReply({
            content: '❌ You can only appeal your own cases.'
        });
    }

    const existingAppeal = await getAppealByCase(guildId, Number(caseNumber), interaction.user.id);
    if (existingAppeal) {
        return interaction.editReply({
            content: '❌ You have already submitted an appeal for that case.'
        });
    }

    const guild =
        interaction.client.guilds.cache.get(guildId) ||
        await interaction.client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
        return interaction.editReply({
            content: '❌ I could not access that server anymore.'
        });
    }

    const appealId = await createAppealRecord({
        guildId,
        caseNumber: Number(caseNumber),
        userId: interaction.user.id,
        moderatorId: caseData.moderator_id,
        reason: appealReason
    });

    const appeal = await getAppealById(appealId);

    try {
        const ticketChannel = await createAppealTicket({
            client: interaction.client,
            guild,
            user: interaction.user,
            appeal,
            caseData
        });

        return interaction.editReply({
            content: `✅ Your appeal for **Case #${caseNumber}** has been submitted. Staff ticket: ${ticketChannel}`
        });
    } catch (error) {
        console.error('create appeal ticket error:', error);

        return interaction.editReply({
            content: '❌ Your appeal was saved, but the ticket could not be created. Staff will need to check the setup.'
        });
    }
}

async function handleClaimAppeal(interaction, appealId) {
    const appeal = await getAppealById(appealId);
    if (!appeal) {
        return interaction.reply({
            content: '❌ Appeal not found.',
            ephemeral: true
        });
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return interaction.reply({
            content: '❌ Only configured appeal staff can manage appeal tickets.',
            ephemeral: true
        });
    }

    if (appeal.claimed_by) {
        return interaction.reply({
            content: `❌ This appeal has already been claimed by <@${appeal.claimed_by}>.`,
            ephemeral: true
        });
    }

    await pool.query(
        `UPDATE appeals
         SET claimed_by = ?, claimed_at = ?, status = 'claimed'
         WHERE id = ?`,
        [interaction.user.id, Date.now(), appealId]
    );

    const updatedAppeal = await getAppealById(appealId);
    await updateAppealTicketMessage(interaction, updatedAppeal);

    return interaction.reply({
        content: `✅ You claimed appeal #${appealId}.`,
        ephemeral: true
    });
}

async function handleApproveAppeal(interaction, appealId) {
    const appeal = await getAppealById(appealId);
    if (!appeal) {
        return interaction.reply({
            content: '❌ Appeal not found.',
            ephemeral: true
        });
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return interaction.reply({
            content: '❌ Only configured appeal staff can resolve appeals.',
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`appeal_approve_modal_${appealId}`)
        .setTitle('Approve Appeal');

    const input = new TextInputBuilder()
        .setCustomId('decision_reason')
        .setLabel('Reason for approving this appeal')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);
}

async function handleDenyAppeal(interaction, appealId) {
    const appeal = await getAppealById(appealId);
    if (!appeal) {
        return interaction.reply({
            content: '❌ Appeal not found.',
            ephemeral: true
        });
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return interaction.reply({
            content: '❌ Only configured appeal staff can resolve appeals.',
            ephemeral: true
        });
    }

    const modal = new ModalBuilder()
        .setCustomId(`appeal_deny_modal_${appealId}`)
        .setTitle('Deny Appeal');

    const input = new TextInputBuilder()
        .setCustomId('decision_reason')
        .setLabel('Reason for denying this appeal')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(
        new ActionRowBuilder().addComponents(input)
    );

    return interaction.showModal(modal);
}

async function deleteAppealTicketChannel(interaction, appeal) {
    if (!appeal.ticket_channel_id) return;

    const channel =
        interaction.client.channels.cache.get(appeal.ticket_channel_id) ||
        await interaction.client.channels.fetch(appeal.ticket_channel_id).catch(() => null);

    if (!channel) return;

    setTimeout(async () => {
        await channel.delete(`Appeal ${appeal.id} resolved: ${appeal.status}`).catch(() => null);
    }, 5000);
}

async function applyApprovedAppeal(interaction, appeal) {
    const caseData = await getAppealCaseData(appeal);
    if (!caseData) {
        return { ok: false, message: 'Case data not found.' };
    }

    const guild =
        interaction.client.guilds.cache.get(appeal.guild_id) ||
        await interaction.client.guilds.fetch(appeal.guild_id).catch(() => null);

    if (!guild) {
        return { ok: false, message: 'Guild not found.' };
    }

    const action = String(caseData.action || '');

    if (action.includes('Warn')) {
        await pool.query(
            `DELETE FROM warnings
             WHERE guild_id = ? AND user_id = ?
             ORDER BY id DESC
             LIMIT 1`,
            [appeal.guild_id, appeal.user_id]
        );
    } else if (action.includes('Timeout')) {
        const member =
            guild.members.cache.get(appeal.user_id) ||
            await guild.members.fetch(appeal.user_id).catch(() => null);

        if (member) {
            await member.timeout(null, `Appeal approved by ${interaction.user.tag}`).catch(() => null);
        }
    } else if (action.includes('Ban')) {
        await guild.members.unban(appeal.user_id, `Appeal approved by ${interaction.user.tag}`).catch(() => null);
    }

    await pool.query(
        `DELETE FROM cases
         WHERE guild_id = ? AND case_number = ?
         LIMIT 1`,
        [appeal.guild_id, appeal.case_number]
    );

    return { ok: true };
}

async function handleAppealDecisionModal(interaction, appealId, decision) {
    await interaction.deferReply({ ephemeral: false });

    const appeal = await getAppealById(appealId);
    if (!appeal) {
        return interaction.editReply({
            content: '❌ Appeal not found.'
        });
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return interaction.editReply({
            content: '❌ Only configured appeal staff can resolve appeals.'
        });
    }

    if (appeal.status === 'approved' || appeal.status === 'denied') {
        return interaction.editReply({
            content: '❌ This appeal has already been decided.'
        });
    }

    const decisionReason = interaction.fields.getTextInputValue('decision_reason')?.trim();

    await pool.query(
        `UPDATE appeals
         SET status = ?, decision = ?, decision_reason = ?, decided_by = ?, decided_at = ?
         WHERE id = ?`,
        [
            decision,
            decision,
            decisionReason,
            interaction.user.id,
            Date.now(),
            appealId
        ]
    );

    const updatedAppeal = await getAppealById(appealId);

    if (decision === 'approved') {
        await applyApprovedAppeal(interaction, updatedAppeal);
    }

    const targetUser = await interaction.client.users.fetch(updatedAppeal.user_id).catch(() => null);

    if (targetUser) {
        await targetUser.send(
            `Your appeal for **Case #${updatedAppeal.case_number}** has been **${decision.toUpperCase()}**.\n\nReason: ${decisionReason}`
        ).catch(() => null);
    }

    await updateAppealTicketMessage(interaction, updatedAppeal);

    await interaction.editReply({
        content: `✅ Appeal #${appealId} has been **${decision}**. This ticket will be deleted in 5 seconds.`
    });

    await deleteAppealTicketChannel(interaction, updatedAppeal);
}

module.exports = {
    getAppealEligibleGuildsForUser,
    getAppealById,
    getAppealByCase,
    createAppealRecord,
    createAppealTicket,
    startAppealFlow,
    handleAppealGuildSelect,
    handleAppealCaseSelect,
    handleAppealModal,
    handleClaimAppeal,
    handleApproveAppeal,
    handleDenyAppeal,
    handleAppealDecisionModal
};