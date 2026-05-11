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
    TextInputStyle,
    AttachmentBuilder
} = require('discord.js');

const { pool } = require('../database');

const {
    getCaseByNumber,
    getAppealableCasesForUser,
    deleteWarningByCase
} = require('./moderationDb');

const { safeReply, safeDefer, safeDeferUpdate } = require('../handlers/interactions/safeReply');

function reply(interaction, payload, ephemeral = true) {
    return safeReply(interaction, payload, ephemeral);
}

async function getTicketSettings(guildId) {
    const [rows] = await pool.query(
        `SELECT
    category_id,
    transcript_channel_id,
    support_role_id,
    appeal_category_id,
    appeal_role_id,
    appeal_transcript_channel_id
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

async function getAppealByCase(guildId, caseId, userId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM appeals
         WHERE guild_id = ? AND case_id = ? AND user_id = ?
         LIMIT 1`,
        [guildId, caseId, userId]
    );

    return rows[0] || null;
}

async function createAppealRecord({
    guildId,
    caseId,
    caseNumber,
    userId,
    moderatorId,
    reason
}) {
    const [result] = await pool.query(
        `INSERT INTO appeals
        (guild_id, case_id, case_number, user_id, moderator_id, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        [
            guildId,
            caseId,
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
            .setDisabled(decided),
        new ButtonBuilder()
            .setCustomId(`appeal_close_${appealId}`)
            .setLabel('Close Appeal')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary)
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

    if (!settings?.appeal_category_id || !settings?.appeal_role_id || !settings?.appeal_transcript_channel_id) {
        throw new Error('Appeal system is not configured properly.');
    }

    const category =
        guild.channels.cache.get(settings.appeal_category_id) ||
        await guild.channels.fetch(settings.appeal_category_id).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) {
        throw new Error('Invalid appeal category configured.');
    }

    const channelName = `appeal-${appeal.id}`;

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
        content: `<@&${settings.appeal_role_id}>`,
        embeds: [embed],
        components: [buildAppealButtons(appeal.id)]
    });

    await tempChannel.send({
        embeds: [
            new EmbedBuilder()
                .setColor('#5865f2')
                .setTitle('📡 Appeal Relay Active')
                .setDescription(
                    'This appeal channel is connected to the user through DMs.\n\n' +
                    'Anything staff sends in this channel will be relayed to the user.\n' +
                    'Anything the user sends in DMs will be relayed here.\n\n' +
                    'Use the buttons above to claim, approve, deny, or close the appeal.'
                )
                .setFooter({ text: 'Infinity Appeals • Staff Relay' })
                .setTimestamp()
        ]
    });

    await user.send({
        embeds: [
            new EmbedBuilder()
                .setColor('#00bfff')
                .setTitle('📨 Appeal Ticket Opened')
                .setDescription(
                    `Your appeal for **Case #${caseData.case_number}** in **${guild.name}** is now open.\n\n` +
                    'You can now send messages here, and they will be relayed to staff.\n\n' +
                    '**Please explain your appeal clearly and wait for a staff response.**'
                )
                .setFooter({ text: 'Infinity Appeals • DM Relay' })
                .setTimestamp()
        ]
    }).catch(() => null);

    return tempChannel;
}

async function getAppealEligibleGuildsForUser(client, userId) {
    const [rows] = await pool.query(
        `SELECT DISTINCT c.guild_id
         FROM cases c
         INNER JOIN ticket_settings ts ON ts.guild_id = c.guild_id
         WHERE c.user_id = ?
            AND ts.category_id IS NOT NULL
            AND ts.appeal_category_id IS NOT NULL
            AND ts.appeal_role_id IS NOT NULL
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
        return reply(interaction, {
            content: '❌ Failed to load your cases.',
        }, true);
    }

    if (!result.rows.length) {
        return reply(interaction, {
            content: '❌ You do not have any appealable cases in that server.',
        }, true);
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

    return reply(interaction, {
        content: 'Select the case you want to appeal.',
        components: [row],
    }, true);
}

async function handleAppealCaseSelect(interaction, guildId) {
    const deferred = await safeDefer(interaction, true);
    if (!deferred) return;

    const caseNumber = interaction.values[0];

    const caseResult = await getCaseByNumber(guildId, Number(caseNumber));
    if (!caseResult.ok || !caseResult.rows.length) {
        return reply(interaction, {
            content: '❌ That case could not be found.'
        }, true);
    }

    const caseData = caseResult.rows[0];

    if (String(caseData.user_id) !== String(interaction.user.id)) {
        return reply(interaction, {
            content: '❌ You can only appeal your own cases.'
        }, true);
    }

    const existingAppeal = await getAppealByCase(guildId, caseData.id, interaction.user.id);

    if (existingAppeal) {
        const status = String(existingAppeal.status || 'unknown').toLowerCase();

        if (['open', 'claimed'].includes(status)) {
            return reply(interaction, {
                content: '❌ You already have an open appeal for that case.'
            }, true);
        }

        return reply(interaction, {
            content:
                `❌ You have already appealed this case before.\n` +
                `Current status: **${status}**`
        }, true);
    }

    const guild =
        interaction.client.guilds.cache.get(guildId) ||
        await interaction.client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
        return reply(interaction, {
            content: '❌ I could not access that server anymore.'
        }, true);
    }

    const appealId = await createAppealRecord({
        guildId,
        caseId: caseData.id,
        caseNumber: Number(caseNumber),
        userId: interaction.user.id,
        moderatorId: caseData.moderator_id,
        reason: 'DM relay appeal opened.'
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

        return reply(interaction, {
            content:
                `✅ Your appeal for **Case #${caseNumber}** has been opened.\n\n` +
                `Please check your DMs and explain your appeal there.`
        }, true);
    } catch (error) {
        console.error('create appeal relay error:', error);

        return reply(interaction, {
            content: '❌ Your appeal was saved, but the relay channel could not be created. Staff will need to check the setup.'
        }, true);
    }
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
    const deferred = await safeDefer(interaction, true);
    if (!deferred) return;

    const appealReason = interaction.fields.getTextInputValue('appeal_reason')?.trim();

    const caseResult = await getCaseByNumber(guildId, Number(caseNumber));
    if (!caseResult.ok || !caseResult.rows.length) {
        return reply(interaction, {
            content: '❌ That case could not be found.'
        }, true);
    }

    const caseData = caseResult.rows[0];

    if (String(caseData.user_id) !== String(interaction.user.id)) {
        return reply(interaction, {
            content: '❌ You can only appeal your own cases.'
        }, true);
    }

    const existingAppeal = await getAppealByCase(
        guildId,
        caseData.id,
        interaction.user.id
    );

    if (existingAppeal) {
        return reply(interaction, {
            content: '❌ You have already submitted an appeal for that case.'
        }, true);
    }

    const guild =
        interaction.client.guilds.cache.get(guildId) ||
        await interaction.client.guilds.fetch(guildId).catch(() => null);

    if (!guild) {
        return reply(interaction, {
            content: '❌ I could not access that server anymore.'
        }, true);
    }

    const appealId = await createAppealRecord({
        guildId,
        caseId: caseData.id,
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

        return reply(interaction, {
            content: `✅ Your appeal for **Case #${caseNumber}** has been submitted. Staff ticket: ${ticketChannel}`
        }, true);
    } catch (error) {
        console.error('create appeal ticket error:', error);

        return reply(interaction, {
            content: '❌ Your appeal was saved, but the ticket could not be created. Staff will need to check the setup.'
        }, true);
    }
}

async function handleClaimAppeal(interaction, appealId) {
    const appeal = await getAppealById(appealId);

    if (!appeal) {
        return reply(interaction, {
            content: '❌ Appeal not found.',
        }, true);
    }

    if (!interaction.guild || !interaction.member) {
        return reply(interaction, {
            content: '❌ This action can only be used inside the appeal server.'
        }, true);
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return reply(interaction, {
            content: '❌ Only configured appeal staff can manage appeal tickets.',
        }, true);
    }

    const [result] = await pool.query(
        `UPDATE appeals
         SET claimed_by = ?, claimed_at = ?, status = 'claimed'
         WHERE id = ?
           AND claimed_by IS NULL
           AND status NOT IN ('approved', 'denied', 'closed')`,
        [interaction.user.id, Date.now(), appealId]
    );

    if (!result.affectedRows) {
        const latestAppeal = await getAppealById(appealId);

        if (latestAppeal?.claimed_by) {
            return reply(interaction, {
                content: `❌ This appeal has already been claimed by <@${latestAppeal.claimed_by}>.`,
            }, true);
        }

        return reply(interaction, {
            content: '❌ This appeal is already closed or decided.',
        }, true);
    }

    const updatedAppeal = await getAppealById(appealId);
    await updateAppealTicketMessage(interaction, updatedAppeal);

    return reply(interaction, {
        content: `✅ You claimed appeal #${appealId}.`,
    }, true);
}

async function handleApproveAppeal(interaction, appealId) {
    const appeal = await getAppealById(appealId);

    if (!appeal) {
        return reply(interaction, {
            content: '❌ Appeal not found.',
        }, true);
    }

    if (!interaction.guild || !interaction.member) {
        return reply(interaction, {
            content: '❌ This action can only be used inside the appeal server.'
        }, true);
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return reply(interaction, {
            content: '❌ Only configured appeal staff can resolve appeals.',
        }, true);
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
        return reply(interaction, {
            content: '❌ Appeal not found.',
        }, true);
    }

    if (!interaction.guild || !interaction.member) {
        return reply(interaction, {
            content: '❌ This action can only be used inside the appeal server.'
        }, true);
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return reply(interaction, {
            content: '❌ Only configured appeal staff can resolve appeals.',
        }, true);
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
        await deleteWarningByCase(
            appeal.guild_id,
            appeal.user_id,
            appeal.case_number
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
    const deferred = await safeDefer(interaction, true);
    if (!deferred) return;

    const appeal = await getAppealById(appealId);

    if (!appeal) {
        return reply(interaction, {
            content: '❌ Appeal not found.'
        }, true);
    }

    if (!interaction.guild || !interaction.member) {
        return reply(interaction, {
            content: '❌ This action can only be used inside the appeal server.'
        }, true);
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return reply(interaction, {
            content: '❌ Only configured appeal staff can resolve appeals.'
        }, true);
    }

    if (appeal.status === 'approved' || appeal.status === 'denied') {
        return reply(interaction, {
            content: '❌ This appeal has already been decided.'
        }, true);
    }

    const decisionReason = interaction.fields.getTextInputValue('decision_reason')?.trim();

    const [result] = await pool.query(
        `UPDATE appeals
     SET status = ?, decision = ?, decision_reason = ?, decided_by = ?, decided_at = ?
     WHERE id = ?
       AND status NOT IN ('approved', 'denied', 'closed')`,
        [
            decision,
            decision,
            decisionReason,
            interaction.user.id,
            Date.now(),
            appealId
        ]
    );

    if (!result.affectedRows) {
        return reply(interaction, {
            content: '❌ This appeal is already closed or decided.'
        }, true);
    }

    const updatedAppeal = await getAppealById(appealId);

    if (decision === 'approved') {
        await applyApprovedAppeal(interaction, updatedAppeal);
    }

    const targetUser = await interaction.client.users.fetch(updatedAppeal.user_id).catch(() => null);

    if (targetUser) {
        const decisionColor = decision === 'approved' ? '#00ff88' : '#ff4d4d';
        const decisionEmoji = decision === 'approved' ? '✅' : '❌';
        const decisionTitle = decision === 'approved' ? 'Appeal Approved' : 'Appeal Denied';

        const dmEmbed = new EmbedBuilder()
            .setColor(decisionColor)
            .setTitle(`${decisionEmoji} ${decisionTitle}`)
            .setDescription(
                `Your appeal for **Case #${updatedAppeal.case_number}** in **${interaction.guild.name}** has been **${decision.toUpperCase()}**.`
            )
            .addFields(
                {
                    name: '📌 Appeal Information',
                    value:
                        `**Appeal ID:** \`#${updatedAppeal.id}\`\n` +
                        `**Case Number:** \`#${updatedAppeal.case_number}\`\n` +
                        `**Decision:** \`${decision.toUpperCase()}\``,
                    inline: false
                },
                {
                    name: '🛡️ Reviewed By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                },
                {
                    name: '📄 Staff Reason',
                    value: `> ${decisionReason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Appeals • Decision Notice' })
            .setTimestamp();

        await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
    }

    await updateAppealTicketMessage(interaction, updatedAppeal);

    await safeReply(interaction, {
        embeds: [
            new EmbedBuilder()
                .setColor(decision === 'approved' ? '#00ff88' : '#ff4d4d')
                .setTitle(decision === 'approved' ? '✅ Appeal Approved' : '❌ Appeal Denied')
                .setDescription(
                    `Appeal **#${appealId}** has been **${decision.toUpperCase()}**.\n\n` +
                    'This appeal channel will be deleted in **5 seconds**.'
                )
                .addFields(
                    {
                        name: '📌 Case',
                        value: `\`#${updatedAppeal.case_number}\``,
                        inline: true
                    },
                    {
                        name: '👤 User',
                        value: `<@${updatedAppeal.user_id}>\n\`${updatedAppeal.user_id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Reviewed By',
                        value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                        inline: true
                    },
                    {
                        name: '📄 Decision Reason',
                        value: `> ${decisionReason}`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Appeals • Staff Decision' })
                .setTimestamp()
        ]
    });

    await sendAppealLog({
        interaction,
        appeal: updatedAppeal,
        action: decision === 'approved' ? '✅ Appeal Approved' : '❌ Appeal Denied',
        color: decision === 'approved' ? '#00ff88' : '#ff4d4d',
        reason: decisionReason
    });

    await deleteAppealTicketChannel(interaction, updatedAppeal);
}

function formatRelayContent(message) {
    const content = message.content?.trim() || '*No text content*';

    const attachments = message.attachments?.size
        ? '\n\n**Attachments:**\n' + [...message.attachments.values()].map(a => a.url).join('\n')
        : '';

    return `${content}${attachments}`.slice(0, 4000);
}

async function getOpenAppealRelayByUser(client, userId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM appeals
         WHERE user_id = ?
           AND status IN ('open', 'claimed')
           AND ticket_channel_id IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
    );

    const appeal = rows[0];
    if (!appeal) return null;

    const guild =
        client.guilds.cache.get(appeal.guild_id) ||
        await client.guilds.fetch(appeal.guild_id).catch(() => null);

    if (!guild) return null;

    const channel =
        guild.channels.cache.get(appeal.ticket_channel_id) ||
        await guild.channels.fetch(appeal.ticket_channel_id).catch(() => null);

    if (!channel || !channel.isTextBased()) return null;

    return { appeal, guild, channel };
}

async function getOpenAppealRelayByChannel(channelId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM appeals
         WHERE ticket_channel_id = ?
           AND status IN ('open', 'claimed')
         LIMIT 1`,
        [channelId]
    );

    return rows[0] || null;
}

async function relayAppealDmMessage(message) {
    if (message.author.bot) return false;
    if (message.webhookId) return false;
    if (message.system) return false;

    if (!message.content?.trim() && !message.attachments?.size) return false;

    const relay = await getOpenAppealRelayByUser(message.client, message.author.id);

    if (!relay) return false;

    const { appeal, guild, channel } = relay;

    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${message.author.tag} • Appeal User`,
            iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setColor('#00bfff')
        .setDescription(formatRelayContent(message))
        .setFooter({ text: `Appeal #${appeal.id} • DM Relay` })
        .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => null);
    await message.react('✅').catch(() => null);

    return true;
}

async function relayAppealStaffMessage(message) {
    if (!message.guild) return false;
    if (message.author.bot) return false;
    if (message.webhookId) return false;
    if (message.system) return false;

    if (!message.content?.trim() && !message.attachments?.size) return false;
    if (message.content.startsWith('!') || message.content.startsWith('/')) return false;

    const appeal = await getOpenAppealRelayByChannel(message.channel.id);

    if (!appeal) return false;

    if (String(message.author.id) === String(appeal.user_id)) return false;

    const user = await message.client.users.fetch(appeal.user_id).catch(() => null);
    if (!user) return true;

    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${message.author.tag} • Staff`,
            iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setColor('#5865f2')
        .setDescription(formatRelayContent(message))
        .setFooter({ text: 'Infinity Appeals • Staff Reply' })
        .setTimestamp();

    await user.send({ embeds: [embed] }).catch(() => null);
    await message.react('✅').catch(() => null);

    return true;
}

async function buildAppealTranscript(channel) {
    let allMessages = [];
    let lastId;

    while (true) {
        const fetched = await channel.messages.fetch({
            limit: 100,
            before: lastId
        });

        if (!fetched.size) break;

        allMessages.push(...fetched.values());

        if (allMessages.length >= 5000) break;

        lastId = fetched.last().id;

        if (fetched.size < 100) break;
    }

    allMessages = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = allMessages.map(msg => {
        const timestamp = new Date(msg.createdTimestamp).toISOString();
        const author = `${msg.author.tag} (${msg.author.id})`;

        let content = msg.content || '';

        if (!content && msg.embeds.length) {
            content = msg.embeds
                .map(embed => embed.description || embed.title || '[embed content]')
                .join(' | ');
        }

        if (msg.attachments.size) {
            content += `\nAttachments: ${[...msg.attachments.values()].map(a => a.url).join(', ')}`;
        }

        return `[${timestamp}] ${author}: ${content || '[no text content]'}`;
    });

    return lines.join('\n');
}

async function sendAppealLog({
    interaction,
    appeal,
    action,
    color,
    reason = 'No reason provided.'
}) {
    const settings = await getTicketSettings(appeal.guild_id);

    const transcriptChannel = settings?.appeal_transcript_channel_id
        ? interaction.guild.channels.cache.get(settings.appeal_transcript_channel_id) ||
        await interaction.guild.channels.fetch(settings.appeal_transcript_channel_id).catch(() => null)
        : null;

    if (!transcriptChannel) return null;

    const transcriptText = await buildAppealTranscript(interaction.channel);
    const transcriptAttachment = new AttachmentBuilder(
        Buffer.from(transcriptText || 'No transcript data.', 'utf8'),
        { name: `appeal-${appeal.id}-case-${appeal.case_number}-transcript.txt` }
    );

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(action)
        .addFields(
            {
                name: '📌 Appeal',
                value: `Appeal ID: \`#${appeal.id}\`\nCase: \`#${appeal.case_number}\``,
                inline: true
            },
            {
                name: '👤 User',
                value: `<@${appeal.user_id}>\n\`${appeal.user_id}\``,
                inline: true
            },
            {
                name: '🛡️ Staff Member',
                value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${reason}`,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Appeals • Transcript Log' })
        .setTimestamp();

    return transcriptChannel.send({
        embeds: [embed],
        files: [transcriptAttachment]
    }).catch(() => null);
}

async function handleCloseAppeal(interaction, appealId) {
    const appeal = await getAppealById(appealId);

    if (!appeal) {
        return reply(interaction, {
            content: '❌ Appeal not found.'
        }, true);
    }

    if (!interaction.guild || !interaction.member) {
        return reply(interaction, {
            content: '❌ This action can only be used inside the appeal server.'
        }, true);
    }

    const settings = await getTicketSettings(appeal.guild_id);

    if (!isAppealStaff(interaction.member, settings)) {
        return reply(interaction, {
            content: '❌ Only configured appeal staff can close appeals.'
        }, true);
    }

    if (appeal.status === 'closed' || appeal.status === 'approved' || appeal.status === 'denied') {
        return reply(interaction, {
            content: '❌ This appeal is already closed or decided.'
        }, true);
    }

    const deferred = await safeDefer(interaction, true);
    if (!deferred) return;

    await safeReply(interaction, {
        content: '🔒 Closing appeal relay in 5 seconds...',
        components: [],
        embeds: []
    }).catch(() => null);

    const [result] = await pool.query(
        `UPDATE appeals
     SET status = 'closed',
         decision = 'closed',
         decision_reason = 'Appeal relay closed by staff.',
         decided_by = ?,
         decided_at = ?
     WHERE id = ?
       AND status NOT IN ('closed', 'approved', 'denied')`,
        [interaction.user.id, Date.now(), appealId]
    );

    if (!result.affectedRows) {
        return safeReply(interaction, {
            content: '❌ This appeal is already closed or decided.'
        }, true);
    }

    const user = await interaction.client.users.fetch(appeal.user_id).catch(() => null);

    if (user) {
        await user.send({
            embeds: [
                new EmbedBuilder()
                    .setColor('#ff4d4d')
                    .setTitle('🔒 Appeal Closed')
                    .setDescription(
                        `Your appeal for **Case #${appeal.case_number}** has been closed by staff.\n\n` +
                        'This DM relay is now closed, and future messages will no longer be sent to staff.'
                    )
                    .setFooter({ text: 'Infinity Appeals • DM Relay Closed' })
                    .setTimestamp()
            ]
        }).catch(() => null);
    }

    const updatedAppeal = await getAppealById(appealId);

    await sendAppealLog({
        interaction,
        appeal: updatedAppeal || appeal,
        action: '🔒 Appeal Closed',
        color: '#ff4d4d',
        reason: 'Appeal relay closed by staff.'
    });

    setTimeout(async () => {
        await interaction.channel.delete(`Appeal ${appealId} closed by ${interaction.user.tag}`).catch(() => null);
    }, 5000);
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
    handleCloseAppeal,
    handleAppealDecisionModal,
    relayAppealDmMessage,
    relayAppealStaffMessage
};