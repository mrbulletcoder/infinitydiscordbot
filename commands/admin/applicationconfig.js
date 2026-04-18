const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const { pool } = require('../../database');

module.exports = {
    name: 'applicationconfig',
    description: 'Configure the applications system.',
    usage: '/applicationconfig panel:<channel> review:<channel> acceptedrole:<role>',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('applicationconfig')
        .setDescription('Configure the applications system')
        .addChannelOption(option =>
            option
                .setName('panel')
                .setDescription('Channel where the application panel will be sent')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('review')
                .setDescription('Channel where submitted applications will be reviewed')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName('acceptedrole')
                .setDescription('Role to give users when accepted')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const panel = interaction.options.getChannel('panel', true);
        const review = interaction.options.getChannel('review', true);
        const acceptedRole = interaction.options.getRole('acceptedrole');

        await pool.query(
            `INSERT INTO application_settings
                (guild_id, panel_channel_id, review_channel_id, accepted_role_id, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                panel_channel_id = VALUES(panel_channel_id),
                review_channel_id = VALUES(review_channel_id),
                accepted_role_id = VALUES(accepted_role_id),
                updated_at = VALUES(updated_at)`,
            [
                interaction.guild.id,
                panel.id,
                review.id,
                acceptedRole?.id || null,
                Date.now()
            ]
        );

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '📝 Applications Configured',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00bfff')
            .addFields(
                {
                    name: '📨 Panel Channel',
                    value: `${panel}`,
                    inline: true
                },
                {
                    name: '📋 Review Channel',
                    value: `${review}`,
                    inline: true
                },
                {
                    name: '🏷️ Accepted Role',
                    value: acceptedRole ? `<@&${acceptedRole.id}>` : 'Not set',
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Applications' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};