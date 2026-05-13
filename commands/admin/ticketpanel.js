const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { pool } = require('../../database');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const { buildTicketPanelEmbed } = require('../../utils/tickets');

module.exports = {
    name: 'ticketpanel',
    description: 'Send the ticket creation panel.',
    usage: '/ticketpanel',
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('ticketpanel')
        .setDescription('Send the ticket creation panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        try {
            const [rows] = await pool.query(
                `SELECT panel_channel_id
             FROM ticket_settings
             WHERE guild_id = ?
             LIMIT 1`,
                [interaction.guild.id]
            );

            const settings = rows[0];

            if (!settings?.panel_channel_id) {
                return safeReply(interaction, {
                    content: '❌ Ticket system is not configured yet. Use `/ticketconfig` first.'
                }, true);
            }

            const panelChannel =
                interaction.guild.channels.cache.get(settings.panel_channel_id) ||
                await interaction.guild.channels.fetch(settings.panel_channel_id).catch(() => null);

            if (!panelChannel) {
                return safeReply(interaction, {
                    content: '❌ The configured panel channel could not be found.'
                }, true);
            }

            const botMember = interaction.guild.members.me;
            const perms = panelChannel.permissionsFor(botMember);

            if (!perms?.has(PermissionFlagsBits.ViewChannel) ||
                !perms?.has(PermissionFlagsBits.SendMessages) ||
                !perms?.has(PermissionFlagsBits.EmbedLinks)) {
                return safeReply(interaction, {
                    content: '❌ I do not have permission to send the ticket panel in that channel. I need **View Channel**, **Send Messages**, and **Embed Links**.'
                }, true);
            }

            const embed = buildTicketPanelEmbed(interaction);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_create')
                    .setLabel('Create Ticket')
                    .setEmoji('🎫')
                    .setStyle(ButtonStyle.Primary)
            );

            await panelChannel.send({
                embeds: [embed],
                components: [row]
            });

            return safeReply(interaction, {
                content: `✅ Ticket panel sent to ${panelChannel}.`
            }, true);

        } catch (error) {
            console.error('Ticket Panel Error:', error);

            return safeReply(interaction, {
                content: '❌ Failed to send the ticket panel.'
            }, true);
        }
    }
};