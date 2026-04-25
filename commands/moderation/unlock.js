const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType,
    MessageFlags
} = require('discord.js');

const logAction = require('../../utils/logAction');

const UNLOCK_COLOR = '#57f287';

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildUnlockEmbed({ channel, moderator, reason, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Channel Control', iconURL: guild.iconURL({ dynamic: true }) || undefined })
        .setTitle('🔓 Channel Unlocked')
        .setColor(UNLOCK_COLOR)
        .addFields(
            { name: '📍 Channel', value: `${channel}\n\`${channel.id}\``, inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📁 Case', value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`', inline: true },
            { name: '📄 Reason', value: `> ${reason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

const slashData = new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel')
    .addChannelOption(option =>
        option
            .setName('channel')
            .setDescription('Channel to unlock')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
    )
    .addStringOption(option =>
        option
            .setName('reason')
            .setDescription('Reason for unlocking')
            .setMaxLength(1000)
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

module.exports = {
    name: 'unlock',
    description: 'Unlock a channel.',
    usage: '!unlock [channel] [reason]',
    category: 'moderation',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
    cooldown: 3,
    data: slashData,
    slashData,

    async executePrefix(message, args) {
        const mentionedChannel = message.mentions.channels.first();
        const channel = mentionedChannel || message.channel;
        const reason = mentionedChannel ? args.slice(1).join(' ') || 'No reason provided' : args.join(' ') || 'No reason provided';

        return unlockChannel({
            client: message.client,
            guild: message.guild,
            channel,
            moderator: message.author,
            reason,
            reply: payload => message.reply(payload)
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        return unlockChannel({
            client: interaction.client,
            guild: interaction.guild,
            channel,
            moderator: interaction.user,
            reason,
            reply: payload => interaction.editReply(payload)
        });
    }
};

async function unlockChannel({ client, guild, channel, moderator, reason, reply }) {
    try {
        if (!channel?.permissionOverwrites) {
            return reply({ content: '❌ That channel cannot be unlocked.' });
        }

        const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
        const alreadyUnlocked = !everyoneOverwrite?.deny?.has(PermissionFlagsBits.SendMessages);

        if (alreadyUnlocked) {
            return reply({ content: '❌ That channel is already unlocked.' });
        }

        await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null }, `Channel unlocked by ${moderator.tag}: ${reason}`);

        const logResult = await logAction({
            client,
            guild,
            action: '🔓 Unlock',
            user: null,
            moderator,
            reason,
            color: UNLOCK_COLOR,
            extra: `**Channel:** ${channel}\n**Channel ID:** \`${channel.id}\``
        });

        return reply({
            embeds: [buildUnlockEmbed({
                channel,
                moderator,
                reason,
                guild,
                caseNumber: getCaseNumber(logResult)
            })]
        });
    } catch (error) {
        console.error('Unlock Command Error:', error);
        return reply({ content: '❌ Failed to unlock channel.' }).catch(() => null);
    }
}
