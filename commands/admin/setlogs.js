const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

const { pool } = require('../../database');

module.exports = {
    name: 'setlogs',
    description: 'Set the channel where moderation logs will be sent.',
    usage: '!setlogs #channel / /setlogs <channel>',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('setlogs')
        .setDescription('Set mod logs channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel for logs')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executePrefix(message) {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('❌ Mention a channel.');

        await pool.query(
            `INSERT INTO guild_settings (guild_id, mod_logs)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE mod_logs = VALUES(mod_logs)`,
            [message.guild.id, channel.id]
        );

        const embed = new EmbedBuilder()
            .setTitle('✅ Mod Logs Set')
            .setDescription(`Logs will now be sent to ${channel}`)
            .setColor('#00ff00')
            .setTimestamp();

        message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const channel = interaction.options.getChannel('channel');

        await pool.query(
            `INSERT INTO guild_settings (guild_id, mod_logs)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE mod_logs = VALUES(mod_logs)`,
            [interaction.guild.id, channel.id]
        );

        const embed = new EmbedBuilder()
            .setTitle('✅ Mod Logs Set')
            .setDescription(`Logs will now be sent to ${channel}`)
            .setColor('#00ff00')
            .setTimestamp();

        interaction.reply({ embeds: [embed] });
    }
};