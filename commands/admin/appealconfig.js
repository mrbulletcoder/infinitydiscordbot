const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');
const { pool } = require('../../database');

module.exports = {
    name: 'appealconfig',
    description: 'Configure appeal ticket settings.',
    category: 'admin',
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: PermissionFlagsBits.ManageChannels,
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('appealconfig')
        .setDescription('Configure appeal ticket settings')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('category')
                .setDescription('Category where appeal tickets should be created')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
        )
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Role that can view and manage appeal tickets')
                .setRequired(true)
        ),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const category = interaction.options.getChannel('category', true);
        const role = interaction.options.getRole('role', true);

        try {
            await pool.query(
                `INSERT INTO ticket_settings (
        guild_id,
        appeal_category_id,
        appeal_role_id,
        updated_at
    )
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        appeal_category_id = VALUES(appeal_category_id),
        appeal_role_id = VALUES(appeal_role_id),
        updated_at = VALUES(updated_at)`,
                [
                    interaction.guild.id,
                    category.id,
                    role.id,
                    Date.now()
                ]
            );

            const embed = new EmbedBuilder()
                .setColor('#00bfff')
                .setTitle('✅ Appeal Configuration Updated')
                .setDescription('Your appeal system settings have been saved.')
                .addFields(
                    {
                        name: '📂 Appeal Category',
                        value: `${category}`,
                        inline: true
                    },
                    {
                        name: '🛡️ Appeal Staff Role',
                        value: `${role}`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Infinity Appeals Setup' })
                .setTimestamp();

            return interaction.editReply({
                embeds: [embed]
            });
        } catch (error) {
            console.error('appealconfig error:', error);

            return interaction.editReply({
                content: '❌ Failed to save appeal configuration.'
            });
        }
    }
};