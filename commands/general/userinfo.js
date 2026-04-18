const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const { pool } = require('../../database');

function formatFullDate(date) {
    const unix = Math.floor(date.getTime() / 1000);
    return `<t:${unix}:F>\n<t:${unix}:R>`;
}

function getStatusText(status) {
    const map = {
        online: '🟢 Online',
        idle: '🌙 Idle',
        dnd: '⛔ Do Not Disturb',
        offline: '⚫ Offline',
        invisible: '⚫ Invisible'
    };

    return map[status] ?? '⚫ Offline';
}

async function getWarningCount(guildId, userId) {
    try {
        const [rows] = await pool.query(
            'SELECT COUNT(*) AS total FROM warnings WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );

        return rows[0]?.total ?? 0;
    } catch (error) {
        return 0;
    }
}

async function getJoinPosition(guild, userId) {
    try {
        const members = await guild.members.fetch();
        const sortedMembers = [...members.values()]
            .filter(member => member.joinedTimestamp)
            .sort((a, b) => a.joinedTimestamp - b.joinedTimestamp);

        const index = sortedMembers.findIndex(member => member.id === userId);
        return index === -1 ? null : index + 1;
    } catch (error) {
        return null;
    }
}

function getBadges(user, member, guild) {
    const badges = [];

    if (user.id === guild.ownerId) {
        badges.push('👑 Server Owner');
    }

    if (user.bot) {
        badges.push('🤖 Bot Account');
    }

    if (member?.premiumSince) {
        badges.push('🚀 Server Booster');
    }

    if (member?.permissions.has('Administrator')) {
        badges.push('🛡️ Administrator');
    }

    if (member?.permissions.has('ManageGuild')) {
        badges.push('⚙️ Management');
    }

    return badges.length ? badges.join('\n') : '`No special badges`';
}

function getKeyPermissions(member) {
    if (!member) {
        return '• No major permissions';
    }

    const permissions = [
        member.permissions.has('Administrator') ? 'Administrator' : null,
        member.permissions.has('ManageGuild') ? 'Manage Server' : null,
        member.permissions.has('BanMembers') ? 'Ban Members' : null,
        member.permissions.has('KickMembers') ? 'Kick Members' : null,
        member.permissions.has('ModerateMembers') ? 'Timeout Members' : null,
        member.permissions.has('ManageMessages') ? 'Manage Messages' : null,
        member.permissions.has('ManageChannels') ? 'Manage Channels' : null,
        member.permissions.has('ManageRoles') ? 'Manage Roles' : null
    ].filter(Boolean);

    return permissions.length
        ? permissions.map(permission => `• ${permission}`).join('\n')
        : '• No major permissions';
}

function getRoleDisplay(member) {
    if (!member) {
        return '`Not available`';
    }

    const roles = member.roles.cache
        .filter(role => role.name !== '@everyone')
        .sort((a, b) => b.position - a.position)
        .map(role => role.toString());

    if (!roles.length) {
        return '`No roles`';
    }

    const visibleRoles = roles.slice(0, 8);
    const extraCount = roles.length - visibleRoles.length;

    return `${visibleRoles.join(', ')}${extraCount > 0 ? ` **+${extraCount} more**` : ''}`;
}

module.exports = {
    name: 'user-info',
    description: 'View detailed information about a user.',
    usage: '!user-info [user] / /user-info [user]',
    category: 'general',

    slashData: new SlashCommandBuilder()
        .setName('user-info')
        .setDescription('View detailed information about a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to view information about')
                .setRequired(false)
        ),

    async executePrefix(message, args) {
        let targetUser = message.mentions.users.first();

        if (!targetUser && args[0]) {
            targetUser = await message.client.users.fetch(args[0]).catch(() => null);
        }

        targetUser ??= message.author;

        const member = await message.guild.members.fetch(targetUser.id).catch(() => null);

        return this.sendInfo(message, message.guild, targetUser, member);
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        return this.sendInfo(interaction, interaction.guild, targetUser, member);
    },

    async sendInfo(ctx, guild, user, member) {
        if (!guild) {
            const content = '❌ This command can only be used in a server.';

            if (ctx.reply) {
                return ctx.reply({ content, ephemeral: true }).catch(() => ctx.reply(content));
            }

            return;
        }

        const fetchedUser = await user.fetch(true).catch(() => user);
        const warningCount = await getWarningCount(guild.id, fetchedUser.id);
        const joinPosition = await getJoinPosition(guild, fetchedUser.id);
        const status = member?.presence?.status || 'offline';
        const topRole = member?.roles?.highest && member.roles.highest.name !== '@everyone'
            ? member.roles.highest.toString()
            : '`None`';

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('👤 Infinity User Profile')
            .setDescription(
                `A premium identity overview for **${fetchedUser.username}**.\n` +
                'View account age, server presence, permissions, moderation data, and role intelligence.'
            )
            .setThumbnail(fetchedUser.displayAvatarURL({ dynamic: true, size: 1024 }))
            .addFields(
                {
                    name: '🪪 Identity Overview',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `**Tag:** ${fetchedUser.tag}\n` +
                        `**User ID:** \`${fetchedUser.id}\`\n` +
                        `**Bot Account:** \`${fetchedUser.bot ? 'Yes' : 'No'}\`\n` +
                        `**Status:** ${getStatusText(status)}`,
                    inline: false
                },
                {
                    name: '📅 Account Created',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `${formatFullDate(fetchedUser.createdAt)}`,
                    inline: true
                },
                {
                    name: '📥 Joined Server',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `${member?.joinedAt ? formatFullDate(member.joinedAt) : '`Not available`'}`,
                    inline: true
                },
                {
                    name: '📈 Server Position',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `**Join Position:** ${joinPosition ? `\`#${joinPosition}\`` : '`Unknown`'}\n` +
                        `**Top Role:** ${topRole}`,
                    inline: true
                },
                {
                    name: '⚠️ Moderation Status',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `**Warnings:** \`${warningCount}\`\n` +
                        `**Timed Out:** \`${member?.isCommunicationDisabled() ? 'Yes' : 'No'}\``,
                    inline: true
                },
                {
                    name: '🏅 Badges',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `${getBadges(fetchedUser, member, guild)}`,
                    inline: true
                },
                {
                    name: '🛡️ Key Permissions',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `${getKeyPermissions(member)}`,
                    inline: true
                },
                {
                    name: '🎭 Role Collection',
                    value:
                        '━━━━━━━━━━━━━━━━━━\n' +
                        `${getRoleDisplay(member)}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • User Intelligence Suite ⚡' })
            .setTimestamp();

        const banner = fetchedUser.bannerURL({ dynamic: true, size: 1024 });
        if (banner) {
            embed.setImage(banner);
        }

        return ctx.reply({ embeds: [embed] });
    }
};