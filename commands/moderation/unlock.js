const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType
} = require('discord.js');

const logAction = require('../../utils/logAction');

module.exports = {
    name: 'unlock',
    description: 'Unlock a channel',
    usage: '!unlock [channel] [reason]',
    category: 'moderation',

    data: new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a channel')
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to unlock')
                .addChannelTypes(
                    ChannelType.GuildText,
                    ChannelType.GuildAnnouncement
                )
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for unlocking')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async executePrefix(message, args) {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return message.reply('❌ You need **Manage Channels** permission.');
        }

        const mentionedChannel = message.mentions.channels.first();
        const channel = mentionedChannel || message.channel;

        const reason = mentionedChannel
            ? args.slice(1).join(' ') || 'No reason provided'
            : args.join(' ') || 'No reason provided';

        await unlockChannel({
            channel,
            moderator: message.member,
            reason,
            guild: message.guild,
            ctx: message,
            isSlash: false
        });
    },

    async executeSlash(interaction) {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        await unlockChannel({
            channel,
            moderator: interaction.member,
            reason,
            guild: interaction.guild,
            ctx: interaction,
            isSlash: true
        });
    }
};

async function unlockChannel({ channel, moderator, reason, guild, ctx, isSlash }) {
    try {
        if (!channel || !channel.permissionOverwrites) {
            if (isSlash) {
                return ctx.reply({
                    content: '❌ That channel cannot be unlocked.',
                    ephemeral: true
                });
            }
            return ctx.reply('❌ That channel cannot be unlocked.');
        }

        const everyoneOverwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
        const alreadyUnlocked = !everyoneOverwrite?.deny?.has(PermissionFlagsBits.SendMessages);

        if (alreadyUnlocked) {
            if (isSlash) {
                return ctx.reply({
                    content: '❌ That channel is already unlocked.',
                    ephemeral: true
                });
            }
            return ctx.reply('❌ That channel is already unlocked.');
        }

        await channel.permissionOverwrites.edit(guild.roles.everyone, {
            SendMessages: null
        });

        const moderatorUser = moderator.user || moderator;

        const embed = new EmbedBuilder()
            .setAuthor({ name: '🔓 Channel Unlocked' })
            .setColor('#00bfff')
            .addFields(
                {
                    name: '📍 Channel',
                    value: `${channel}`,
                    inline: true
                },
                {
                    name: '🛡️ Moderator',
                    value: `${moderatorUser.tag}\n\`${moderatorUser.id}\``,
                    inline: true
                },
                {
                    name: '📄 Reason',
                    value: `> ${reason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Channel Control' })
            .setTimestamp();

        await ctx.reply({ embeds: [embed] });

        await logAction({
            guild,
            action: 'UNLOCK',
            moderator: moderatorUser,
            reason,
            color: '#00ff88',
            extra: `Channel: ${channel.name} (${channel.id})`
        });
    } catch (err) {
        console.error('Unlock Command Error:', err);

        if (isSlash) {
            if (ctx.replied || ctx.deferred) {
                return ctx.followUp({
                    content: '❌ Failed to unlock channel.',
                    ephemeral: true
                }).catch(() => { });
            }

            return ctx.reply({
                content: '❌ Failed to unlock channel.',
                ephemeral: true
            }).catch(() => { });
        }

        return ctx.reply('❌ Failed to unlock channel.').catch(() => { });
    }
}