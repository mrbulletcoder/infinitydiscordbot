const {
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} = require('discord.js');
const { pool } = require('../database');

const createCooldown = new Map();

async function getTicketSettings(guildId) {
    const [rows] = await pool.query(
        `SELECT category_id, panel_channel_id, transcript_channel_id, support_role_id
         FROM ticket_settings
         WHERE guild_id = ?
         LIMIT 1`,
        [guildId]
    );

    return rows[0] || null;
}

async function getOpenTicketByUser(guildId, userId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM tickets
         WHERE guild_id = ? AND creator_id = ? AND status = 'open'
         LIMIT 1`,
        [guildId, userId]
    );

    return rows[0] || null;
}

async function getTicketByChannel(guildId, channelId) {
    const [rows] = await pool.query(
        `SELECT *
         FROM tickets
         WHERE guild_id = ? AND channel_id = ?
         LIMIT 1`,
        [guildId, channelId]
    );

    return rows[0] || null;
}

function buildTicketButtons(ticketId, claimedBy = null) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_claim_${ticketId}`)
            .setLabel(claimedBy ? 'Ticket Claimed' : 'Claim Ticket')
            .setEmoji('🛠️')
            .setStyle(ButtonStyle.Success)
            .setDisabled(Boolean(claimedBy)),
        new ButtonBuilder()
            .setCustomId(`ticket_close_confirm_${ticketId}`)
            .setLabel('Close Ticket')
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Danger)
    );
}

function buildCloseConfirmButtons(ticketId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ticket_close_yes_${ticketId}`)
            .setLabel('Confirm Close')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`ticket_close_no_${ticketId}`)
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildTicketName(ticketId, username) {
    const cleanUser = String(username || 'user')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 16);

    return `ticket-${ticketId}-${cleanUser}`;
}

async function handleCreateTicket(interaction) {
    try {
        const cooldownKey = `${interaction.guild.id}:${interaction.user.id}`;
        const now = Date.now();
        const existingCooldown = createCooldown.get(cooldownKey);

        if (existingCooldown && now - existingCooldown < 5000) {
            return interaction.reply({
                content: '❌ Please wait a few seconds before creating another ticket.',
                ephemeral: true
            });
        }

        createCooldown.set(cooldownKey, now);

        await interaction.deferReply({ ephemeral: true });

        const settings = await getTicketSettings(interaction.guild.id);

        if (!settings?.category_id || !settings?.transcript_channel_id) {
            return interaction.editReply({
                content: '❌ The ticket system is not configured yet.'
            });
        }

        const existing = await getOpenTicketByUser(interaction.guild.id, interaction.user.id);
        if (existing) {
            const existingChannel =
                interaction.guild.channels.cache.get(existing.channel_id) ||
                await interaction.guild.channels.fetch(existing.channel_id).catch(() => null);

            return interaction.editReply({
                content: existingChannel
                    ? `❌ You already have an open ticket: ${existingChannel}`
                    : '❌ You already have an open ticket.'
            });
        }

        const category =
            interaction.guild.channels.cache.get(settings.category_id) ||
            await interaction.guild.channels.fetch(settings.category_id).catch(() => null);

        if (!category || category.type !== ChannelType.GuildCategory) {
            return interaction.editReply({
                content: '❌ The configured ticket category is invalid.'
            });
        }

        const tempChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20),
            type: ChannelType.GuildText,
            parent: category.id,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks
                    ]
                },
                ...(settings.support_role_id ? [{
                    id: settings.support_role_id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.EmbedLinks
                    ]
                }] : []),
                {
                    id: interaction.client.user.id,
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

        const [insertResult] = await pool.query(
            `INSERT INTO tickets
                (guild_id, channel_id, creator_id, claimed_by, status, created_at)
             VALUES (?, ?, ?, ?, 'open', ?)`,
            [
                interaction.guild.id,
                tempChannel.id,
                interaction.user.id,
                null,
                Date.now()
            ]
        );

        const ticketId = insertResult.insertId;
        const betterName = buildTicketName(ticketId, interaction.user.username);

        await tempChannel.setName(betterName).catch(() => {});

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🎫 Ticket Created',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00bfff')
            .setDescription(
                `Welcome ${interaction.user}.\n\n` +
                'A member of staff will be with you shortly.\n' +
                'Please explain your issue in as much detail as possible.'
            )
            .addFields(
                {
                    name: '🆔 Ticket ID',
                    value: `#${ticketId}`,
                    inline: true
                },
                {
                    name: '👤 Creator',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                },
                {
                    name: '🛠️ Claimed By',
                    value: 'Not claimed',
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Tickets' })
            .setTimestamp();

        await tempChannel.send({
            content: `${interaction.user}${settings.support_role_id ? ` <@&${settings.support_role_id}>` : ''}`,
            embeds: [embed],
            components: [buildTicketButtons(ticketId)]
        });

        return interaction.editReply({
            content: `✅ Your ticket has been created: ${tempChannel}`
        });
    } catch (error) {
        console.error('handleCreateTicket error:', error);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({
                content: '❌ Failed to create ticket.'
            }).catch(() => {});
        }

        return interaction.reply({
            content: '❌ Failed to create ticket.',
            ephemeral: true
        }).catch(() => {});
    }
}

async function handleClaimTicket(interaction, ticketId) {
    try {
        const settings = await getTicketSettings(interaction.guild.id);

        const isStaff =
            interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
            interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
            (settings?.support_role_id && interaction.member.roles.cache.has(settings.support_role_id));

        if (!isStaff) {
            return interaction.reply({
                content: '❌ Only staff can claim tickets.',
                ephemeral: true
            });
        }

        await interaction.deferUpdate();

        const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
        if (!ticket || String(ticket.id) !== String(ticketId)) {
            return interaction.followUp({
                content: '❌ This ticket record could not be found.',
                ephemeral: true
            });
        }

        if (ticket.claimed_by) {
            return interaction.followUp({
                content: '❌ This ticket has already been claimed.',
                ephemeral: true
            });
        }

        await pool.query(
            `UPDATE tickets
             SET claimed_by = ?
             WHERE id = ?`,
            [interaction.user.id, ticket.id]
        );

        const claimedEmbed = new EmbedBuilder()
            .setAuthor({
                name: '🎫 Ticket Created',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00bfff')
            .setDescription(
                `Welcome <@${ticket.creator_id}>.\n\n` +
                'A member of staff will be with you shortly.\n' +
                'Please explain your issue in as much detail as possible.'
            )
            .addFields(
                {
                    name: '🆔 Ticket ID',
                    value: `#${ticket.id}`,
                    inline: true
                },
                {
                    name: '👤 Creator',
                    value: `<@${ticket.creator_id}>`,
                    inline: true
                },
                {
                    name: '🛠️ Claimed By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Tickets' })
            .setTimestamp();

        await interaction.message.edit({
            embeds: [claimedEmbed],
            components: [buildTicketButtons(ticket.id, interaction.user.id)]
        });

        return interaction.followUp({
            content: `✅ You claimed ticket #${ticket.id}.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('handleClaimTicket error:', error);

        if (interaction.deferred || interaction.replied) {
            return interaction.followUp({
                content: '❌ Failed to claim ticket.',
                ephemeral: true
            }).catch(() => {});
        }

        return interaction.reply({
            content: '❌ Failed to claim ticket.',
            ephemeral: true
        }).catch(() => {});
    }
}

async function buildTranscript(channel) {
    let allMessages = [];
    let lastId;

    while (true) {
        const fetched = await channel.messages.fetch({
            limit: 100,
            before: lastId
        });

        if (!fetched.size) break;

        allMessages.push(...fetched.values());
        lastId = fetched.last().id;

        if (fetched.size < 100) break;
    }

    allMessages = allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const lines = allMessages.map(msg => {
        const timestamp = new Date(msg.createdTimestamp).toISOString();

        let content = msg.content || '';
        if (!content && msg.attachments.size) {
            content = `[attachment] ${[...msg.attachments.values()].map(a => a.url).join(', ')}`;
        } else if (!content && msg.embeds.length) {
            content = '[embed content]';
        } else if (!content) {
            content = '[no text content]';
        }

        return `[${timestamp}] ${msg.author.tag} (${msg.author.id}): ${content}`;
    });

    return lines.join('\n');
}

async function handleCloseTicket(interaction, ticketId) {
    try {
        const settings = await getTicketSettings(interaction.guild.id);

        const isStaff =
            interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
            interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
            (settings?.support_role_id && interaction.member.roles.cache.has(settings.support_role_id));

        const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
        if (!ticket || String(ticket.id) !== String(ticketId)) {
            return interaction.reply({
                content: '❌ This ticket record could not be found.',
                ephemeral: true
            });
        }

        if (!isStaff && interaction.user.id !== ticket.creator_id) {
            return interaction.reply({
                content: '❌ Only staff or the ticket creator can close this ticket.',
                ephemeral: true
            });
        }

        await interaction.reply({
            content: '⚠️ Are you sure you want to close this ticket?',
            components: [buildCloseConfirmButtons(ticket.id)],
            ephemeral: true
        });
    } catch (error) {
        console.error('handleCloseTicket error:', error);

        return interaction.reply({
            content: '❌ Failed to start ticket close process.',
            ephemeral: true
        }).catch(() => {});
    }
}

async function handleCloseTicketConfirm(interaction, ticketId) {
    try {
        const settings = await getTicketSettings(interaction.guild.id);

        const isStaff =
            interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
            interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
            (settings?.support_role_id && interaction.member.roles.cache.has(settings.support_role_id));

        const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
        if (!ticket || String(ticket.id) !== String(ticketId)) {
            return interaction.reply({
                content: '❌ This ticket record could not be found.',
                ephemeral: true
            });
        }

        if (!isStaff && interaction.user.id !== ticket.creator_id) {
            return interaction.reply({
                content: '❌ Only staff or the ticket creator can close this ticket.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const transcriptText = await buildTranscript(interaction.channel);
        const transcriptBuffer = Buffer.from(transcriptText || 'No transcript data.', 'utf8');
        const transcriptAttachment = new AttachmentBuilder(transcriptBuffer, {
            name: `ticket-${ticket.id}-transcript.txt`
        });

        const creatorUser = await interaction.client.users.fetch(ticket.creator_id).catch(() => null);
        const claimerUser = ticket.claimed_by
            ? await interaction.client.users.fetch(ticket.claimed_by).catch(() => null)
            : null;

        const transcriptEmbed = new EmbedBuilder()
            .setAuthor({
                name: '📝 Ticket Closed',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#ff4d4d')
            .addFields(
                {
                    name: '🆔 Ticket ID',
                    value: `#${ticket.id}`,
                    inline: true
                },
                {
                    name: '👤 Creator',
                    value: creatorUser
                        ? `${creatorUser.tag}\n\`${creatorUser.id}\``
                        : `\`${ticket.creator_id}\``,
                    inline: true
                },
                {
                    name: '🛠️ Claimed By',
                    value: claimerUser
                        ? `${claimerUser.tag}\n\`${claimerUser.id}\``
                        : 'Not claimed',
                    inline: true
                },
                {
                    name: '🔒 Closed By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Tickets' })
            .setTimestamp();

        const transcriptChannel = settings?.transcript_channel_id
            ? interaction.guild.channels.cache.get(settings.transcript_channel_id) ||
              await interaction.guild.channels.fetch(settings.transcript_channel_id).catch(() => null)
            : null;

        if (transcriptChannel) {
            await transcriptChannel.send({
                embeds: [transcriptEmbed],
                files: [transcriptAttachment]
            });
        }

        await pool.query(
            `UPDATE tickets
             SET status = 'closed', closed_at = ?
             WHERE id = ?`,
            [Date.now(), ticket.id]
        );

        await interaction.editReply({
            content: '🔒 Ticket closed. This channel will be deleted in 5 seconds.'
        });

        setTimeout(async () => {
            await interaction.channel.delete().catch(() => null);
        }, 5000);
    } catch (error) {
        console.error('handleCloseTicketConfirm error:', error);

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({
                content: '❌ Failed to close ticket.'
            }).catch(() => {});
        }

        return interaction.reply({
            content: '❌ Failed to close ticket.',
            ephemeral: true
        }).catch(() => {});
    }
}

async function handleCloseTicketCancel(interaction, ticketId) {
    return interaction.update({
        content: '❌ Ticket close cancelled.',
        components: [],
        embeds: []
    });
}

module.exports = {
    handleCreateTicket,
    handleClaimTicket,
    handleCloseTicket,
    handleCloseTicketConfirm,
    handleCloseTicketCancel
};