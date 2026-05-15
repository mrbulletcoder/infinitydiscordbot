const {
    SlashCommandBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

function formatFullDate(date) {
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:F>\n<t:${unix}:R>`;
}

function mapVerificationLevel(level) {
    const levels = {
        0: 'None',
        1: 'Low',
        2: 'Medium',
        3: 'High',
        4: 'Very High'
    };

    return levels[level] ?? 'Unknown';
}

function mapExplicitContentFilter(level) {
    const levels = {
        0: 'Disabled',
        1: 'Members Without Roles',
        2: 'All Members'
    };

    return levels[level] ?? 'Unknown';
}

function mapDefaultNotifications(level) {
    const levels = {
        0: 'All Messages',
        1: 'Only Mentions'
    };

    return levels[level] ?? 'Unknown';
}

function getChannelBreakdown(guild) {
    const channels = guild.channels.cache;

    return {
        text: channels.filter(ch =>
            ch.type === ChannelType.GuildText ||
            ch.type === ChannelType.GuildAnnouncement
        ).size,

        voice: channels.filter(ch =>
            ch.type === ChannelType.GuildVoice ||
            ch.type === ChannelType.GuildStageVoice
        ).size,

        categories: channels.filter(ch =>
            ch.type === ChannelType.GuildCategory
        ).size,

        forums: channels.filter(ch =>
            ch.type === ChannelType.GuildForum
        ).size
    };
}

function formatFeature(feature) {
    return feature
        .toLowerCase()
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function getServerHealthEmoji(guild) {
    const boosts = guild.premiumSubscriptionCount || 0;
    if (boosts >= 14) return '💎';
    if (boosts >= 7) return '🚀';
    if (boosts >= 2) return '✨';
    return '🌟';
}

function getMemberComposition(total, humans, bots) {
    if (!total) {
        return 'No members';
    }

    const humanPercent = ((humans / total) * 100).toFixed(0);
    const botPercent = ((bots / total) * 100).toFixed(0);

    return `Humans: \`${humanPercent}%\` • Bots: \`${botPercent}%\``;
}

module.exports = {
    name: 'server-stats',
    description: 'View detailed information about the server.',
    usage: '!server-stats / /server-stats',
    category: 'general',
    cooldown: 10,

    slashData: new SlashCommandBuilder()
        .setName('server-stats')
        .setDescription('View detailed information about this server'),

    async executePrefix(message) {
        return this.sendStats(message, message.guild);
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, false);
        if (!deferred) return;

        return this.sendStats(interaction, interaction.guild, true);
    },

    async sendStats(ctx, guild, isSlash = false) {
        const reply = payload => {
            return isSlash
                ? safeReply(ctx, payload)
                : ctx.reply(payload);
        };

        if (!guild) {
            return reply({ content: '❌ This command can only be used in a server.' });
        }

        await guild.fetch();
        await guild.members.fetch().catch(() => null);

        const owner = await guild.fetchOwner().catch(() => null);
        const { text, voice, categories, forums } = getChannelBreakdown(guild);

        const totalMembers = guild.memberCount;
        const humans = guild.members.cache.filter(member => !member.user.bot).size;
        const bots = guild.members.cache.filter(member => member.user.bot).size;

        const roles = guild.roles.cache.filter(role => role.name !== '@everyone').size;
        const emojis = guild.emojis.cache.size;
        const stickers = guild.stickers.cache.size;

        const boosts = guild.premiumSubscriptionCount || 0;
        const tier = guild.premiumTier || 0;
        const serverBadge = getServerHealthEmoji(guild);

        const features = guild.features?.length
            ? guild.features
                .slice(0, 8)
                .map(feature => `• \`${formatFeature(feature)}\``)
                .join('\n')
            : '`No special features enabled`';

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('Server Stats')
            .setDescription(
                `**${guild.name}**\n` +
                'A clean overview of this server’s members, channels, boosts, and settings.'
            )
            .setThumbnail(guild.iconURL({ dynamic: true, size: 1024 }))
            .addFields(
                {
                    name: '👑 Server Overview',
                    value:
                        `Owner: ${owner ? owner.user.tag : 'Unknown'}\n` +
                        `Server ID: ${guild.id}\n` +
                        `Created: ${formatFullDate(guild.createdAt)}\n\u200b`,
                    inline: false
                },

                {
                    name: '👥 Members',
                    value:
                        `Total Members: ${totalMembers}\n` +
                        `Humans: ${humans}\n` +
                        `Bots: ${bots}\n` +
                        `Composition: Humans: ${((humans / totalMembers) * 100).toFixed(0)}% • Bots: ${((bots / totalMembers) * 100).toFixed(0)}%\n\u200b`,
                    inline: false
                },

                {
                    name: '💬 Channels',
                    value:
                        `Text Channels: ${text}\n` +
                        `Voice Channels: ${voice}\n` +
                        `Categories: ${categories}\n` +
                        `Forums: ${forums}\n\u200b`,
                    inline: false
                },

                {
                    name: '🎭 Server Assets',
                    value:
                        `Roles: ${roles}\n` +
                        `Emojis: ${emojis}\n` +
                        `Stickers: ${stickers}\n\u200b`,
                    inline: false
                },

                {
                    name: '🚀 Boost Status',
                    value:
                        `Current Boosts: ${boosts}\n` +
                        `Tier Level: ${tier}\n` +
                        `Server Strength: ${serverBadge} ${boosts >= 14 ? 'Elite' : boosts >= 7 ? 'High' : boosts >= 2 ? 'Growing' : 'Standard'}\n\u200b`,
                    inline: false
                },

                {
                    name: '🛡️ Security Settings',
                    value:
                        `Verification: ${mapVerificationLevel(guild.verificationLevel)}\n` +
                        `Explicit Filter: ${mapExplicitContentFilter(guild.explicitContentFilter)}\n` +
                        `Notifications: ${mapDefaultNotifications(guild.defaultMessageNotifications)}\n\u200b`,
                    inline: false
                },

                {
                    name: '✨ Premium Features',
                    value: guild.features?.length
                        ? guild.features
                            .slice(0, 8)
                            .map(feature => `• ${formatFeature(feature)}`)
                            .join('\n')
                        : 'No special features enabled',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • Server Intelligence ⚡' })
            .setTimestamp();

        if (guild.bannerURL()) {
            embed.setImage(guild.bannerURL({ size: 1024 }));
        }

        return reply({ embeds: [embed] });
    }
};