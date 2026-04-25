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
const {
    getWarnings,
    deleteWarningById
} = require('../../utils/moderationDb');

const UNWARN_COLOR = '#57f287';

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildUnwarnEmbed({ user, moderator, warningNumber, warningId, removedReason, remainingWarnings, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Warning System', iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setTitle('⚠️ Warning Removed')
        .setColor(UNWARN_COLOR)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Member', value: formatUser(user), inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📁 Case', value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`', inline: true },
            { name: '🧾 Removed Warning', value: `Position: **#${warningNumber}**\nDatabase ID: \`${warningId}\``, inline: true },
            { name: '📊 Remaining', value: `**${remainingWarnings}** warning${remainingWarnings === 1 ? '' : 's'}`, inline: true },
            { name: '📄 Original Reason', value: `> ${removedReason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

module.exports = {
    name: 'unwarn',
    description: 'Remove a specific warning from a user.',
    usage: '!unwarn @user <warning number>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Remove a specific warning from a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to remove a warning from')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('warning')
                .setDescription('Warning number to remove')
                .setRequired(true)
                .setMinValue(1)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const targetMember = message.mentions.members.first();
        const targetUser = message.mentions.users.first();
        const warningNumber = Number.parseInt(args[1], 10);

        if (!targetUser || !targetMember) return message.reply('❌ Mention a user.');
        if (targetUser.bot) return message.reply('❌ You cannot unwarn bots.');
        if (!Number.isInteger(warningNumber) || warningNumber < 1) {
            return message.reply('❌ Provide a valid warning number. Example: `!unwarn @user 1`');
        }
        if (!(await checkPrefixHierarchy(message, targetMember))) return;

        return removeWarning({
            client: message.client,
            guild: message.guild,
            targetUser,
            warningNumber,
            moderator: message.author,
            reply: payload => message.reply(payload)
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        const warningNumber = interaction.options.getInteger('warning', true);

        if (!targetMember) return interaction.editReply({ content: '❌ User not found in this server.' });
        if (targetUser.bot) return interaction.editReply({ content: '❌ You cannot unwarn bots.' });
        if (!(await checkSlashHierarchy(interaction, targetMember))) return;

        return removeWarning({
            client: interaction.client,
            guild: interaction.guild,
            targetUser,
            warningNumber,
            moderator: interaction.user,
            reply: payload => interaction.editReply(payload)
        });
    }
};

async function removeWarning({ client, guild, targetUser, warningNumber, moderator, reply }) {
    try {
        const result = await getWarnings(guild.id, targetUser.id);
        if (!result.ok) return reply({ content: '❌ Failed to fetch warnings.' });

        const rows = result.rows || [];
        if (!rows.length) return reply({ content: '❌ That user has no warnings.' });
        if (warningNumber > rows.length) {
            return reply({ content: `❌ Invalid warning number. That user only has **${rows.length}** warning(s).` });
        }

        const warning = rows[warningNumber - 1];
        const removedReason = warning.reason || 'No reason provided';

        const deleteResult = await deleteWarningById(warning.id);
        if (!deleteResult.ok) return reply({ content: '❌ Failed to remove warning.' });

        const remainingWarnings = rows.length - 1;
        const logResult = await logAction({
            client,
            guild,
            action: '⚠️ Unwarn',
            user: targetUser,
            moderator,
            reason: `Removed warning #${warningNumber}: ${removedReason}`,
            color: UNWARN_COLOR,
            extra: [
                `**Removed Warning Position:** #${warningNumber}`,
                `**Warning Database ID:** \`${warning.id}\``,
                `**Remaining Warnings:** ${remainingWarnings}`,
                `**Original Reason:** ${removedReason}`
            ].join('\n')
        });

        return reply({
            embeds: [buildUnwarnEmbed({
                user: targetUser,
                moderator,
                warningNumber,
                warningId: warning.id,
                removedReason,
                remainingWarnings,
                guild,
                caseNumber: getCaseNumber(logResult)
            })]
        });
    } catch (error) {
        console.error('Unwarn Command Error:', error);
        return reply({ content: '❌ Error removing warning.' }).catch(() => null);
    }
}
