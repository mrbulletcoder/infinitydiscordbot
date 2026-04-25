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

const KICK_COLOR = '#ff9900';

function formatUser(user) {
    return `${user.tag}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildKickEmbed({ user, moderator, reason, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Kick System',
            iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('👢 Member Kicked')
        .setColor(KICK_COLOR)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            {
                name: '👤 Member',
                value: formatUser(user),
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

function buildKickDmEmbed({ guild, moderator, reason }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Moderation Notice',
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle('👢 You Have Been Kicked')
        .setColor(KICK_COLOR)
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
        .setFooter({ text: 'Infinity Moderation • Kick Notice' })
        .setTimestamp();
}

async function runKick({ client, guild, member, moderator, reason }) {
    const targetUser = member.user;

    await member.send({
        embeds: [buildKickDmEmbed({ guild, moderator, reason })]
    }).catch(() => null);

    await member.kick(reason);

    const logResult = await logAction({
        client,
        guild,
        action: '👢 Kick',
        user: targetUser,
        moderator,
        reason,
        color: KICK_COLOR
    });

    return {
        caseNumber: getCaseNumber(logResult),
        targetUser
    };
}

module.exports = {
    name: 'kick',
    description: 'Remove a user from the server.',
    usage: '!kick @user [reason]',
    userPermissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to kick')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for kick')
                .setMaxLength(1000)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async executePrefix(message, args) {
        const member = message.mentions.members.first();
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!member) return message.reply('❌ Mention a user.');

        if (!(await checkPrefixHierarchy(message, member))) return;

        if (!member.kickable) {
            return message.reply('❌ I cannot kick this user. Make sure my role is above theirs.');
        }

        try {
            const { caseNumber, targetUser } = await runKick({
                client: message.client,
                guild: message.guild,
                member,
                moderator: message.author,
                reason
            });

            return message.reply({
                embeds: [
                    buildKickEmbed({
                        user: targetUser,
                        moderator: message.author,
                        reason,
                        guild: message.guild,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Kick Command Error:', error);
            return message.reply('❌ Failed to kick user.');
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

        if (!member.kickable) {
            return interaction.reply({
                content: '❌ I cannot kick this user. Make sure my role is above theirs.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const { caseNumber, targetUser } = await runKick({
                client: interaction.client,
                guild: interaction.guild,
                member,
                moderator: interaction.user,
                reason
            });

            return interaction.editReply({
                embeds: [
                    buildKickEmbed({
                        user: targetUser,
                        moderator: interaction.user,
                        reason,
                        guild: interaction.guild,
                        caseNumber
                    })
                ]
            });
        } catch (error) {
            console.error('Kick Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to kick user.' });
        }
    }
};