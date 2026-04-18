const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const { pool } = require('../../database');

module.exports = {
    name: 'ticketconfig',
    description: 'Configure the ticket system.',
    usage: '/ticketconfig category:<category> panel:<channel> transcripts:<channel> support:<role>',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('ticketconfig')
        .setDescription('Configure the ticket system')
        .addChannelOption(option =>
            option
                .setName('category')
                .setDescription('Category where ticket channels will be created')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('panel')
                .setDescription('Channel where the ticket panel will be sent')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('transcripts')
                .setDescription('Channel where ticket transcripts will be sent')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName('support')
                .setDescription('Support staff role that can access tickets')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const category = interaction.options.getChannel('category', true);
        const panel = interaction.options.getChannel('panel', true);
        const transcripts = interaction.options.getChannel('transcripts', true);
        const support = interaction.options.getRole('support', true);

        await pool.query(
            `INSERT INTO ticket_settings
                (guild_id, category_id, panel_channel_id, transcript_channel_id, support_role_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                category_id = VALUES(category_id),
                panel_channel_id = VALUES(panel_channel_id),
                transcript_channel_id = VALUES(transcript_channel_id),
                support_role_id = VALUES(support_role_id),
                updated_at = VALUES(updated_at)`,
            [
                interaction.guild.id,
                category.id,
                panel.id,
                transcripts.id,
                support.id,
                Date.now()
            ]
        );

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🎫 Ticket System Configured',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00bfff')
            .addFields(
                {
                    name: '📂 Ticket Category',
                    value: `${category}`,
                    inline: true
                },
                {
                    name: '📨 Panel Channel',
                    value: `${panel}`,
                    inline: true
                },
                {
                    name: '📝 Transcript Channel',
                    value: `${transcripts}`,
                    inline: true
                },
                {
                    name: '🛠️ Support Role',
                    value: `${support}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Tickets' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};