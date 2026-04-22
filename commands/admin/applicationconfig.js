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
    usage: '/applicationconfig panel:<channel> review:<channel> cooldown:<hours>',
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
        .addIntegerOption(option =>
            option
                .setName('cooldown')
                .setDescription('Cooldown in hours before a user can apply again')
                .setMinValue(0)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const panel = interaction.options.getChannel('panel', true);
        const review = interaction.options.getChannel('review', true);
        const cooldown = interaction.options.getInteger('cooldown') ?? 24;

        await pool.query(
            `INSERT INTO application_settings
                (guild_id, panel_channel_id, review_channel_id, application_cooldown_hours, updated_at)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                panel_channel_id = VALUES(panel_channel_id),
                review_channel_id = VALUES(review_channel_id),
                application_cooldown_hours = VALUES(application_cooldown_hours),
                updated_at = VALUES(updated_at)`,
            [
                interaction.guild.id,
                panel.id,
                review.id,
                cooldown,
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
                    name: '⏳ Cooldown',
                    value: `\`${cooldown} hour(s)\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Applications' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};