const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const logAction = require('../../utils/logAction');

const UNLOCK_COLOR = '#57f287';

function formatUser(user) {
    return `${user.tag}\n\`${user.id}\``;
}

function buildUnlockEmbed({ channel, moderator, reason, guild }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Channel Control', iconURL: guild.iconURL({ dynamic: true }) || undefined })
        .setTitle('🔓 Channel Unlocked')
        .setColor(UNLOCK_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📄 Reason', value: `> ${reason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Channel Control` })
        .setTimestamp();
}

module.exports = {
    name: 'unlock',
    description: 'Unlock a channel',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a channel')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Channel to unlock')
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
                SendMessages: null
            });

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: '🔓 Channel Unlocked',
                user: null,
                targetChannel: channel,
                moderator: interaction.user,
                reason,
                color: UNLOCK_COLOR,
                extra: [
                    `**Channel:** ${channel}`,
                    `**Channel ID:** \`${channel.id}\``
                ].join('\n'),
                createCase: false
            }).catch(() => null);

            return safeReply(interaction, {
                embeds: [buildUnlockEmbed({
                    channel,
                    moderator: interaction.user,
                    reason,
                    guild: interaction.guild
                })]
            }, true);
        } catch (error) {
            console.error('Unlock Error:', error);
            return safeReply(interaction, { content: '❌ Failed to unlock channel.' }, true);
        }
    }
};