const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { pool } = require('../../database');

const { safeReply } = require('../../handlers/interactions/safeReply');

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

    slashData: new SlashCommandBuilder()
        .setName('ticketpanel')
        .setDescription('Send the ticket creation panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {

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
                content: '❌ Ticket system is not configured yet. Use `/ticketconfig` first.',
                ephemeral: true
            }, true);
        }

        const panelChannel =
            interaction.guild.channels.cache.get(settings.panel_channel_id) ||
            await interaction.guild.channels.fetch(settings.panel_channel_id).catch(() => null);

        if (!panelChannel) {
            return safeReply(interaction, {
                content: '❌ The configured panel channel could not be found.',
                ephemeral: true
            }, true);
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🎫 Infinity Support Center',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00bfff')
            .setDescription(
                '## Need Help?\n\n' +
                'Click the button below to create a **private support ticket**.\n' +
                'Our support team will assist you as soon as possible.\n\n' +
                '━━━━━━━━━━━━━━━━━━━━━━\n' +
                '🛠️ **Support:** Private help from staff\n' +
                '🔒 **Privacy:** Only you and staff can view it\n' +
                '⚡ **Fast Access:** Get help quickly and cleanly\n' +
                '━━━━━━━━━━━━━━━━━━━━━━'
            )
            .setFooter({ text: 'Infinity Tickets' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_create')
                .setLabel('Create Ticket')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );

        const botMember = interaction.guild.members.me;
        const perms = panelChannel.permissionsFor(botMember);

        if (!perms?.has(PermissionFlagsBits.ViewChannel) ||
            !perms?.has(PermissionFlagsBits.SendMessages) ||
            !perms?.has(PermissionFlagsBits.EmbedLinks)) {
            return safeReply(interaction, {
                content: '❌ I do not have permission to send the ticket panel in that channel. I need **View Channel**, **Send Messages**, and **Embed Links**.'
            }, true);
        }

        await panelChannel.send({
            embeds: [embed],
            components: [row]
        });

        return safeReply(interaction, {
            content: `✅ Ticket panel sent to ${panelChannel}.`,
            ephemeral: true
        }, true);
    }
};