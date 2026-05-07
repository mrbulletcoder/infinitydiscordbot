const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const logAction = require('../../utils/logAction');

const LOCK_COLOR = '#ff9900';

function formatUser(user) {
    return `${user.tag}\n\`${user.id}\``;
}

function buildLockEmbed({ channel, moderator, reason, guild }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Channel Control', iconURL: guild.iconURL({ dynamic: true }) || undefined })
        .setTitle('🔒 Channel Locked')
        .setColor(LOCK_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📄 Reason', value: `> ${reason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Channel Control` })
        .setTimestamp();
}

module.exports = {
    name: 'lock',
    description: 'Lock a channel',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to lock')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: false
            });

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: '🔒 Channel Locked',
                user: null,
                targetChannel: channel,
                moderator: interaction.user,
                reason,
                color: LOCK_COLOR,
                extra: [
                    `**Channel:** ${channel}`,
                    `**Channel ID:** \`${channel.id}\``
                ].join('\n'),
                createCase: false
            }).catch(() => null);

            return safeReply(interaction, {
                embeds: [buildLockEmbed({
                    channel,
                    moderator: interaction.user,
                    reason,
                    guild: interaction.guild
                })]
            }, true);
        } catch (error) {
            console.error('Lock Error:', error);
            return safeReply(interaction, { content: '❌ Failed to lock channel.' }, true);
        }
    }
};