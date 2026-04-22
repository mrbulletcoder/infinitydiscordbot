const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder
} = require('discord.js');
const { pool } = require('../../database');

module.exports = {
    name: 'applicationpanel',
    description: 'Send the application panel.',
    usage: '/applicationpanel',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('applicationpanel')
        .setDescription('Send the application panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const [settingsRows] = await pool.query(
            `SELECT panel_channel_id
             FROM application_settings
             WHERE guild_id = ?
             LIMIT 1`,
            [interaction.guild.id]
        );

        const settings = settingsRows[0];
        if (!settings?.panel_channel_id) {
            return interaction.editReply({
                content: '❌ Applications are not configured yet. Use `/applicationconfig` first.',
                ephemeral: true
            });
        }

        const [positions] = await pool.query(
            `SELECT id, name
             FROM application_positions
             WHERE guild_id = ? AND enabled = 1
             ORDER BY id ASC`,
            [interaction.guild.id]
        );

        if (!positions.length) {
            return interaction.editReply({
                content: '❌ No enabled application positions found. Use `/applicationposition add` first.',
                ephemeral: true
            });
        }

        const panelChannel =
            interaction.guild.channels.cache.get(settings.panel_channel_id) ||
            await interaction.guild.channels.fetch(settings.panel_channel_id).catch(() => null);

        if (!panelChannel) {
            return interaction.editReply({
                content: '❌ The configured panel channel could not be found.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '📝 Infinity Applications',
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setColor('#00bfff')
            .setDescription(
                'Want to apply for a role?\n\n' +
                'Choose a position from the dropdown below and submit your application.\n' +
                'Make sure your answers are honest, detailed, and thoughtful.\n\n' +
                'A staff member will review it as soon as possible.'
            )
            .setFooter({ text: 'Infinity Applications' })
            .setTimestamp();

        const select = new StringSelectMenuBuilder()
            .setCustomId('application_position_select')
            .setPlaceholder('Select a position to apply for')
            .addOptions(
                positions.slice(0, 25).map(position => ({
                    label: position.name.slice(0, 100),
                    value: String(position.id),
                    description: `Apply for ${position.name}`.slice(0, 100),
                    emoji: '📝'
                }))
            );

        const row = new ActionRowBuilder().addComponents(select);

        await panelChannel.send({
            embeds: [embed],
            components: [row]
        });

        return interaction.editReply({
            content: `✅ Application panel sent to ${panelChannel}.`,
            ephemeral: true
        });
    }
};