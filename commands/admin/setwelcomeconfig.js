const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const { pool } = require('../../database');

const defaultWelcome = {
    channel: null,
    title: '✨ A New Legend Has Arrived',
    message: 'Welcome to **{server}**, {user}!\nYou just joined a community full of energy, good vibes, and unforgettable moments.\n\nJump in, meet everyone, and make yourself at home — your adventure starts now.',
    color: '#00bfff',
    rulesChannel: null,
    chatChannel: null,
    autoRole: null
};

function isHexColor(value) {
    return /^#([A-Fa-f0-9]{6})$/.test(value);
}

module.exports = {
    name: 'setwelcomeconfig',
    description: 'Configure the server’s welcome system, including the welcome channel and message sent when a new member joins.',
    usage: '/setwelcomeconfig channel:<#channel> message:<text>',
    userPermissions: PermissionFlagsBits.Administrator,

    slashData: new SlashCommandBuilder()
        .setName('setwelcomeconfig')
        .setDescription('Customize welcome system')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Welcome channel')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Custom message ({user}, {server})')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('Embed title')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('Hex color (#00bfff)')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('rules')
                .setDescription('Rules channel')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('chat')
                .setDescription('Chat channel')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(false))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Auto role')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const guildId = interaction.guild.id;

            const channel = interaction.options.getChannel('channel');
            const messageText = interaction.options.getString('message');
            const title = interaction.options.getString('title');
            const color = interaction.options.getString('color');
            const rules = interaction.options.getChannel('rules');
            const chat = interaction.options.getChannel('chat');
            const role = interaction.options.getRole('role');

            if (!channel && !messageText && !title && !color && !rules && !chat && !role) {
                return interaction.editReply('⚠️ You must provide at least one setting to update.');
            }

            if (color && !isHexColor(color)) {
                return interaction.editReply('❌ Please provide a valid 6-digit hex color like `#00bfff`.');
            }

            const [rows] = await pool.query(
                `SELECT
                    welcome_channel,
                    welcome_message,
                    welcome_title,
                    welcome_color,
                    welcome_rules_channel,
                    welcome_chat_channel,
                    welcome_auto_role
                 FROM guild_settings
                 WHERE guild_id = ?`,
                [guildId]
            );

            const existing = rows[0] || {};

            const updated = {
                channel: channel?.id ?? existing.welcome_channel ?? defaultWelcome.channel,
                message: messageText ?? existing.welcome_message ?? defaultWelcome.message,
                title: title ?? existing.welcome_title ?? defaultWelcome.title,
                color: color ?? existing.welcome_color ?? defaultWelcome.color,
                rulesChannel: rules?.id ?? existing.welcome_rules_channel ?? defaultWelcome.rulesChannel,
                chatChannel: chat?.id ?? existing.welcome_chat_channel ?? defaultWelcome.chatChannel,
                autoRole: role?.id ?? existing.welcome_auto_role ?? defaultWelcome.autoRole
            };

            await pool.query(
                `INSERT INTO guild_settings (
                    guild_id,
                    welcome_enabled,
                    welcome_channel,
                    welcome_message,
                    welcome_title,
                    welcome_color,
                    welcome_rules_channel,
                    welcome_chat_channel,
                    welcome_auto_role
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    welcome_enabled = VALUES(welcome_enabled),
                    welcome_channel = VALUES(welcome_channel),
                    welcome_message = VALUES(welcome_message),
                    welcome_title = VALUES(welcome_title),
                    welcome_color = VALUES(welcome_color),
                    welcome_rules_channel = VALUES(welcome_rules_channel),
                    welcome_chat_channel = VALUES(welcome_chat_channel),
                    welcome_auto_role = VALUES(welcome_auto_role)`,
                [
                    guildId,
                    updated.channel ? 1 : 0,
                    updated.channel,
                    updated.message,
                    updated.title,
                    updated.color,
                    updated.rulesChannel,
                    updated.chatChannel,
                    updated.autoRole
                ]
            );

            const preview = new EmbedBuilder()
                .setAuthor({
                    name: '✅ Welcome Settings Updated',
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .setColor(updated.color)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
                .addFields(
                    {
                        name: '📢 Welcome Channel',
                        value: updated.channel ? `<#${updated.channel}>` : 'Not set',
                        inline: true
                    },
                    {
                        name: '📜 Rules Channel',
                        value: updated.rulesChannel ? `<#${updated.rulesChannel}>` : 'Not set',
                        inline: true
                    },
                    {
                        name: '💬 Chat Channel',
                        value: updated.chatChannel ? `<#${updated.chatChannel}>` : 'Not set',
                        inline: true
                    },
                    {
                        name: '🏷️ Auto Role',
                        value: updated.autoRole ? `<@&${updated.autoRole}>` : 'Not set',
                        inline: true
                    },
                    {
                        name: '🎨 Embed Color',
                        value: `\`${updated.color}\``,
                        inline: true
                    },
                    {
                        name: '\u200b',
                        value: '\u200b',
                        inline: true
                    },
                    {
                        name: '📝 Welcome Title',
                        value: updated.title,
                        inline: false
                    },
                    {
                        name: '💬 Welcome Message',
                        value: `> ${updated.message}`,
                        inline: false
                    }
                )
                .setFooter({
                    text: 'Infinity Welcome System • Placeholders: {user}, {server}'
                })
                .setTimestamp();

            return interaction.editReply({ embeds: [preview] });
        } catch (err) {
            console.error('setwelcomeconfig error:', err);

            if (interaction.deferred) {
                return interaction.editReply('❌ Something went wrong while updating welcome settings.');
            }

            return interaction.editReply({
                content: '❌ Something went wrong while updating welcome settings.',
                ephemeral: true
            }).catch(() => { });
        }
    }
};