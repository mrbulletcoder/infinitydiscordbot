const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, MessageFlags } = require('discord.js');
const { CATEGORY_LABELS, getLogSettings, setIgnoredChannel, setLogChannel, setLoggingEnabled } = require('../../utils/advancedLogger');

const choices = [
    { name: 'Message Logs', value: 'message' }, { name: 'Member Logs', value: 'member' },
    { name: 'Role Logs', value: 'role' }, { name: 'Channel Logs', value: 'channel' },
    { name: 'Server Logs', value: 'server' }, { name: 'Moderation Logs', value: 'moderation' }
];

function embed(color, title, description) {
    return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}

module.exports = {
    name: 'logging',
    description: 'Configure Infinity advanced server logging.',
    usage: '/logging setup | status | enable | disable | ignore | unignore',
    userPermissions: PermissionFlagsBits.Administrator,
    slashData: new SlashCommandBuilder()
        .setName('logging')
        .setDescription('Configure advanced server logging')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('setup').setDescription('Set a logging category channel')
            .addStringOption(o => o.setName('category').setDescription('Log category').addChoices(...choices).setRequired(true))
            .addChannelOption(o => o.setName('channel').setDescription('Log channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
        .addSubcommand(sub => sub.setName('status').setDescription('View logging setup'))
        .addSubcommand(sub => sub.setName('enable').setDescription('Enable advanced logging'))
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable advanced logging'))
        .addSubcommand(sub => sub.setName('ignore').setDescription('Ignore a channel from message logs')
            .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
        .addSubcommand(sub => sub.setName('unignore').setDescription('Unignore a channel from message logs')
            .addChannelOption(o => o.setName('channel').setDescription('Channel').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true))),

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        try {
            const sub = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (sub === 'setup') {
                const category = interaction.options.getString('category', true);
                const channel = interaction.options.getChannel('channel', true);
                const me = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
                const perms = me ? channel.permissionsFor(me) : null;
                if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
                    return interaction.editReply({ embeds: [embed('#ff4d4d', 'Missing Permissions', `I need **View Channel**, **Send Messages**, and **Embed Links** in ${channel}.`)] });
                }
                await setLogChannel(guildId, category, channel.id);
                return interaction.editReply({ embeds: [embed('#57f287', 'Logging Channel Updated', `**${CATEGORY_LABELS[category]}** will now be sent to ${channel}.`)] });
            }

            if (sub === 'enable' || sub === 'disable') {
                const enabled = sub === 'enable';
                await setLoggingEnabled(guildId, enabled);
                return interaction.editReply({ embeds: [embed(enabled ? '#57f287' : '#ff4d4d', enabled ? 'Advanced Logging Enabled' : 'Advanced Logging Disabled', enabled ? 'Infinity will now send configured server logs.' : 'Infinity will stop sending advanced server logs.')] });
            }

            if (sub === 'ignore' || sub === 'unignore') {
                const channel = interaction.options.getChannel('channel', true);
                await setIgnoredChannel(guildId, channel.id, sub === 'ignore');
                return interaction.editReply({ embeds: [embed('#57f287', sub === 'ignore' ? 'Channel Ignored' : 'Channel Unignored', `${channel} ${sub === 'ignore' ? 'will be ignored by message logs.' : 'will now be included in message logs.'}`)] });
            }

            if (sub === 'status') {
                const s = await getLogSettings(guildId);
                const ignored = String(s.ignored_channels || '').split(',').map(x => x.trim()).filter(Boolean);
                const status = new EmbedBuilder()
                    .setColor('#00bfff').setTitle('🛰️ Infinity Advanced Logging')
                    .setDescription(`**Status:** ${Number(s.enabled) ? 'Enabled' : 'Disabled'}`)
                    .addFields({
                        name: 'Configured Channels', value: [
                            `💬 **Messages:** ${s.message_logs ? `<#${s.message_logs}>` : '`Not set`'}`,
                            `👥 **Members:** ${s.member_logs ? `<#${s.member_logs}>` : '`Not set`'}`,
                            `🎭 **Roles:** ${s.role_logs ? `<#${s.role_logs}>` : '`Not set`'}`,
                            `#️⃣ **Channels:** ${s.channel_logs ? `<#${s.channel_logs}>` : '`Not set`'}`,
                            `🏠 **Server:** ${s.server_logs ? `<#${s.server_logs}>` : '`Not set`'}`,
                            `🛡️ **Moderation:** ${s.moderation_logs ? `<#${s.moderation_logs}>` : '`Not set`'}`
                        ].join('\n')
                    }, { name: 'Ignored Message Channels', value: ignored.length ? ignored.map(id => `<#${id}>`).join('\n') : '`None`' })
                    .setTimestamp();
                return interaction.editReply({ embeds: [status] });
            }
        } catch (error) {
            console.error('Logging command error:', error);
            return interaction.editReply({ embeds: [embed('#ff4d4d', 'Logging Error', 'Something went wrong while configuring logging.')] });
        }
    }
};
