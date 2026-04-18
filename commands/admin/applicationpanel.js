const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
        const [rows] = await pool.query(
            `SELECT panel_channel_id
             FROM application_settings
             WHERE guild_id = ?
             LIMIT 1`,
            [interaction.guild.id]
        );

        const settings = rows[0];
        if (!settings?.panel_channel_id) {
            return interaction.reply({
                content: '❌ Applications are not configured yet. Use `/applicationconfig` first.',
                ephemeral: true
            });
        }

        const panelChannel =
            interaction.guild.channels.cache.get(settings.panel_channel_id) ||
            await interaction.guild.channels.fetch(settings.panel_channel_id).catch(() => null);

        if (!panelChannel) {
            return interaction.reply({
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
                'Want to apply?\n\n' +
                'Click the button below to submit your application.\n' +
                'Make sure your answers are honest, detailed, and thoughtful.\n\n' +
                'A staff member will review it as soon as possible.'
            )
            .setFooter({ text: 'Infinity Applications' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('application_create')
                .setLabel('Apply Now')
                .setEmoji('📝')
                .setStyle(ButtonStyle.Primary)
        );

        await panelChannel.send({
            embeds: [embed],
            components: [row]
        });

        return interaction.reply({
            content: `✅ Application panel sent to ${panelChannel}.`,
            ephemeral: true
        });
    }
};