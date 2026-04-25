const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');

const BAN_COLOR = '#ff3b3b';

function formatUser(user) {
    return `${user.tag}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildBanEmbed({ member, user, moderator, reason, guild, caseNumber = null }) {
    const targetUser = user || member.user;

    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Ban System',
            iconURL: targetUser.displayAvatarURL({ dynamic: true })
        })
        .setTitle('🔨 Member Banned')
        .setColor(BAN_COLOR)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
            {
                name: '👤 Member',
                value: formatUser(targetUser),
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: formatUser(moderator),
                inline: true
            },
            {
                name: '📁 Case',
                value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`',
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${reason}`,
                inline: false
            }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

function buildBanDmEmbed({ guild, moderator, reason }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Moderation Notice',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle('🔨 You Have Been Banned')
        .setColor(BAN_COLOR)
        .setThumbnail(guild.iconURL({ dynamic: true }) || null)
        .addFields(
            {
                name: '🏠 Server',
                value: guild.name,
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: formatUser(moderator),
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${reason}`,
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Moderation • Ban Notice' })
        .setTimestamp();
}

async function runBan({ client, guild, member, moderator, reason }) {
    const targetUser = member.user;

    await member.send({
        embeds: [buildBanDmEmbed({ guild, moderator, reason })]
    }).catch(() => null);

    await member.ban({ reason });

    const logResult = await logAction({
        client,
        guild,
        action: '🔨 Ban',
        user: targetUser,
        moderator,
        reason,
        color: BAN_COLOR
    });

    return {
        caseNumber: getCaseNumber(logResult),
        targetUser
    };
}

module.exports = {
    name: 'ban',
    description: 'Permanently ban a user from the server.',
    usage: '!ban @user [reason]',
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to ban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for ban')
                .setMaxLength(1000)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async executePrefix(message, args) {
        const member = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!member) return message.reply('❌ Mention a user.');

        if (!(await checkPrefixHierarchy(message, member))) return;

        if (!member.bannable) {
            return message.reply('❌ I cannot ban this user. Make sure my role is above theirs.');
        }

        try {
            const { caseNumber, targetUser } = await runBan({
                client: message.client,
                guild: message.guild,
                member,
                moderator: message.author,
                reason
            });

            return message.reply({
                embeds: [
                    buildBanEmbed({
                        member,
                        user: targetUser,
                        moderator: message.author,
                        reason,
                        guild: message.guild,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Ban Command Error:', error);
            return message.reply('❌ Failed to ban user.');
        }
    },

    async executeSlash(interaction) {
        const user = interaction.options.getUser('user', true);
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (!(await checkSlashHierarchy(interaction, member))) return;

        if (!member.bannable) {
            return interaction.reply({
                content: '❌ I cannot ban this user. Make sure my role is above theirs.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { caseNumber, targetUser } = await runBan({
                client: interaction.client,
                guild: interaction.guild,
                member,
                moderator: interaction.user,
                reason
            });

            return interaction.editReply({
                embeds: [
                    buildBanEmbed({
                        member,
                        user: targetUser,
                        moderator: interaction.user,
                        reason,
                        guild: interaction.guild,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Ban Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to ban user.' });
        }
    }
};