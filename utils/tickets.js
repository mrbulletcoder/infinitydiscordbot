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
const { safeReply, safeDefer, safeDeferUpdate } = require('../handlers/interactions/safeReply');

const { notifySetupIssue } = require('./setupNotifier');

const createCooldown = new Map();

function reply(interaction, payload, ephemeral = true) {
    return safeReply(interaction, payload, ephemeral);
}

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

function buildTicketPanelEmbed(interaction) {
    return new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: '🎫 Infinity Support Center',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('Need Help?')
        .setDescription(
            'Click the button below to create a **private support ticket**.\n' +
            'Our support team will assist you as soon as possible.\n\n' +
            '━━━━━━━━━━━━━━━━━━━━━━\n' +
            '🛠️ **Support:** Private help from staff\n' +
            '🔒 **Privacy:** Only you and staff can view it\n' +
            '⚡ **Fast Access:** Get help quickly and cleanly\n' +
            '━━━━━━━━━━━━━━━━━━━━━━'
        )
        .setFooter({ text: 'Infinity Bot • Support Center ⚡' })
        .setTimestamp();
}

async function handleCreateTicket(interaction) {
    try {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const cooldownKey = `${interaction.guild.id}:${interaction.user.id}`;
        const now = Date.now();
        const existingCooldown = createCooldown.get(cooldownKey);

        if (existingCooldown && now - existingCooldown < 5000) {
            return reply(interaction, {
                content: '❌ Please wait a few seconds before creating another ticket.',
            }, true);
        }

        createCooldown.set(cooldownKey, now);

        const settings = await getTicketSettings(interaction.guild.id);

        if (!settings?.category_id || !settings?.transcript_channel_id) {
            await notifySetupIssue(interaction.guild, {
                system: 'Ticket System',
                issueCode: 'ticket_system_not_configured',
                title: 'Ticket System Not Configured',
                description:
                    'A user tried to create a ticket, but the ticket system is missing required setup settings.',
                fix:
                    'Run `/setup` → Tickets, or run `/ticketconfig` again and choose a valid category, panel channel, transcript channel, and support role.',
                severity: 'warning'
            });

            return reply(interaction, {
                content: '❌ The ticket system is not configured yet.'
            }, true);
        }

        const existing = await getOpenTicketByUser(interaction.guild.id, interaction.user.id);

        if (existing) {
            const existingChannel =
                interaction.guild.channels.cache.get(existing.channel_id) ||
                await interaction.guild.channels.fetch(existing.channel_id).catch(() => null);

            if (existingChannel) {
                return reply(interaction, {
                    content: `❌ You already have an open ticket: ${existingChannel}`
                }, true);
            }

            await pool.query(
                `UPDATE tickets
         SET status = 'closed', closed_at = ?
         WHERE id = ?`,
                [Date.now(), existing.id]
            );
        }

        const category =
            interaction.guild.channels.cache.get(settings.category_id) ||
            await interaction.guild.channels.fetch(settings.category_id).catch(() => null);

        if (!category || category.type !== ChannelType.GuildCategory) {
            await notifySetupIssue(interaction.guild, {
                system: 'Ticket System',
                issueCode: 'ticket_category_missing',
                title: 'Ticket Category Missing',
                description:
                    'Infinity could not create a ticket because the configured ticket category no longer exists or is invalid.',
                fix:
                    'Run `/setup` → Tickets, or run `/ticketconfig` again and choose a valid ticket category.',
                severity: 'warning'
            });

            return reply(interaction, {
                content: '❌ The configured ticket category is invalid.'
            }, true);
        }

        const botMember = interaction.guild.members.me;
        const categoryPerms = category.permissionsFor(botMember);

        if (!categoryPerms?.has(PermissionFlagsBits.ViewChannel) ||
            !categoryPerms?.has(PermissionFlagsBits.ManageChannels)) {
            await notifySetupIssue(interaction.guild, {
                system: 'Ticket System',
                issueCode: 'ticket_category_permissions',
                title: 'Ticket Category Permissions Missing',
                description:
                    `Infinity cannot create ticket channels inside the configured ticket category.`,
                fix:
                    'Give Infinity these permissions in the ticket category:\n' +
                    '• View Channel\n' +
                    '• Manage Channels',
                severity: 'danger'
            });

            return reply(interaction, {
                content: '❌ I do not have permission to create ticket channels in the ticket category. I need **View Channel** and **Manage Channels**.'
            }, true);
        }

        let supportRole = null;

        if (settings.support_role_id) {
            supportRole =
                interaction.guild.roles.cache.get(settings.support_role_id) ||
                await interaction.guild.roles.fetch(settings.support_role_id).catch(() => null);

            if (!supportRole) {
                await notifySetupIssue(interaction.guild, {
                    system: 'Ticket System',
                    issueCode: 'ticket_support_role_missing',
                    title: 'Ticket Support Role Missing',
                    description:
                        'Infinity could not mention or give ticket access to the configured support role because that role no longer exists.',
                    fix:
                        'Run `/setup` → Tickets, or run `/ticketconfig` again and choose a valid support role.',
                    severity: 'warning'
                });
            }
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
                ...(supportRole ? [{
                    id: supportRole.id,
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

        await tempChannel.setName(betterName).catch(() => { });

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
            content: `${interaction.user}${supportRole ? ` <@&${supportRole.id}>` : ''}`,
            embeds: [embed],
            components: [buildTicketButtons(ticketId)]
        });

        return reply(interaction, {
            content: `✅ Your ticket has been created: ${tempChannel}`
        }, true);
    } catch (error) {
        console.error('handleCreateTicket error:', error);

        if (interaction.deferred || interaction.replied) {
            return reply(interaction, {
                content: '❌ Failed to create ticket.'
            }, true).catch(() => { });
        }

        return reply(interaction, {
            content: '❌ Failed to create ticket.',
        }, true).catch(() => { });
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
            return reply(interaction, {
                content: '❌ Only staff can claim tickets.',
            }, true);
        }

        const deferred = await safeDeferUpdate(interaction);
        if (!deferred) return;

        const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);
        if (!ticket || String(ticket.id) !== String(ticketId)) {
            return safeReply(interaction, {
                content: '❌ This ticket record could not be found.',
            });
        }

        if (ticket.claimed_by) {
            return safeReply(interaction, {
                content: '❌ This ticket has already been claimed.',
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

        return safeReply(interaction, {
            content: `✅ You claimed ticket #${ticket.id}.`,
        });
    } catch (error) {
        console.error('handleClaimTicket error:', error);

        if (interaction.deferred || interaction.replied) {
            return safeReply(interaction, {
                content: '❌ Failed to claim ticket.',
            }).catch(() => { });
        }

        return reply(interaction, {
            content: '❌ Failed to claim ticket.',
        }, true).catch(() => { });
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
            return reply(interaction, {
                content: '❌ This ticket record could not be found.',
            }, true);
        }

        if (!isStaff && interaction.user.id !== ticket.creator_id) {
            return reply(interaction, {
                content: '❌ Only staff or the ticket creator can close this ticket.',
            }, true);
        }

        await reply(interaction, {
            content: '⚠️ Are you sure you want to close this ticket?',
            components: [buildCloseConfirmButtons(ticket.id)],
        }, true);
    } catch (error) {
        console.error('handleCloseTicket error:', error);

        return reply(interaction, {
            content: '❌ Failed to start ticket close process.',
        }, true).catch(() => { });
    }
}

async function handleCloseTicketConfirm(interaction, ticketId) {
    try {
        await interaction.update({
            content: '🔒 Closing ticket...',
            components: [],
            embeds: []
        }).catch(() => null);

        const settings = await getTicketSettings(interaction.guild.id);

        const isStaff =
            interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
            interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
            (settings?.support_role_id && interaction.member.roles.cache.has(settings.support_role_id));

        const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);

        if (!ticket || String(ticket.id) !== String(ticketId)) {
            return reply(interaction, {
                content: '❌ This ticket record could not be found.',
            }, true);
        }

        if (ticket.status === 'closed') {
            return reply(interaction, {
                content: '❌ This ticket is already closing or has already been closed.'
            }, true);
        }

        if (!isStaff && interaction.user.id !== ticket.creator_id) {
            return reply(interaction, {
                content: '❌ Only staff or the ticket creator can close this ticket.',
            }, true);
        }

        await pool.query(
            `UPDATE tickets
     SET status = 'closed', closed_at = ?
     WHERE id = ?`,
            [Date.now(), ticket.id]
        );

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

        if (!transcriptChannel) {
            await notifySetupIssue(interaction.guild, {
                system: 'Ticket System',
                issueCode: 'ticket_transcript_channel_missing',
                title: 'Ticket Transcript Channel Missing',
                description:
                    'Infinity closed a ticket, but could not send the transcript because the configured transcript channel no longer exists.',
                fix:
                    'Run `/setup` → Tickets, or run `/ticketconfig` again and choose a valid transcript channel.',
                severity: 'warning'
            });
        } else {
            const transcriptPerms = transcriptChannel.permissionsFor(interaction.guild.members.me);

            if (!transcriptPerms?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles
            ])) {
                await notifySetupIssue(interaction.guild, {
                    system: 'Ticket System',
                    issueCode: 'ticket_transcript_permissions',
                    title: 'Ticket Transcript Permissions Missing',
                    description:
                        `Infinity closed a ticket, but could not send the transcript in ${transcriptChannel}.`,
                    fix:
                        'Give Infinity these permissions in the transcript channel:\n' +
                        '• View Channel\n' +
                        '• Send Messages\n' +
                        '• Embed Links\n' +
                        '• Attach Files',
                    severity: 'danger'
                });
            } else {
                await transcriptChannel.send({
                    embeds: [transcriptEmbed],
                    files: [transcriptAttachment]
                });
            }
        }

        await safeReply(interaction, {
            content: '🔒 Ticket closed. This channel will be deleted in 5 seconds.',
            flags: 64
        }).catch(() => null);

        const channelToDelete = interaction.channel;

        setTimeout(async () => {
            if (!channelToDelete || channelToDelete.deleted) return;

            await channelToDelete.delete().catch(() => null);
        }, 5000);
    } catch (error) {
        console.error('handleCloseTicketConfirm error:', error);

        if (interaction.deferred || interaction.replied) {
            return reply(interaction, {
                content: '❌ Failed to close ticket.'
            }, true).catch(() => { });
        }

        return reply(interaction, {
            content: '❌ Failed to close ticket.',
        }, true).catch(() => { });
    }
}

async function handleCloseTicketCancel(interaction, ticketId) {
    const deferred = await safeDeferUpdate(interaction);
    if (!deferred) return;

    return safeReply(interaction, {
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
    handleCloseTicketCancel,
    buildTicketPanelEmbed
};