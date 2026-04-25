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
    clearWarnings
} = require('../../utils/moderationDb');

const CLEAR_WARNINGS_COLOR = '#57f287';

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildClearWarningsEmbed({ user, moderator, clearedCount, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({ name: 'Infinity • Warning System', iconURL: user.displayAvatarURL({ dynamic: true }) })
        .setTitle('🧽 Warnings Cleared')
        .setColor(CLEAR_WARNINGS_COLOR)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 Member', value: formatUser(user), inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📁 Case', value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`', inline: true },
            { name: '🧾 Cleared', value: `**${clearedCount}** warning${clearedCount === 1 ? '' : 's'}`, inline: true }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

module.exports = {
    name: 'clearwarnings',
    description: 'Clear all warnings for a user.',
    usage: '!clearwarnings @user / /clearwarnings <user>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear all warnings for a user')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to clear warnings for')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message) {
        const targetMember = message.mentions.members.first();
        const targetUser = message.mentions.users.first();

        if (!targetUser || !targetMember) return message.reply('❌ Mention a user.');
        if (targetUser.bot) return message.reply('❌ You cannot clear warnings for bots.');
        if (!(await checkPrefixHierarchy(message, targetMember))) return;

        return runClearWarnings({
            client: message.client,
            guild: message.guild,
            targetUser,
            moderator: message.author,
            reply: payload => message.reply(payload)
        });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) return interaction.editReply({ content: '❌ User not found in this server.' });
        if (targetUser.bot) return interaction.editReply({ content: '❌ You cannot clear warnings for bots.' });
        if (!(await checkSlashHierarchy(interaction, targetMember))) return;

        return runClearWarnings({
            client: interaction.client,
            guild: interaction.guild,
            targetUser,
            moderator: interaction.user,
            reply: payload => interaction.editReply(payload)
        });
    }
};

async function runClearWarnings({ client, guild, targetUser, moderator, reply }) {
    try {
        const before = await getWarnings(guild.id, targetUser.id);
        if (!before.ok) return reply({ content: '❌ Failed to fetch warnings.' });

        const clearedCount = before.rows?.length || 0;
        if (!clearedCount) return reply({ content: '❌ That user has no warnings to clear.' });

        const result = await clearWarnings(guild.id, targetUser.id);
        if (!result.ok) return reply({ content: '❌ Failed to clear warnings.' });

        const logResult = await logAction({
            client,
            guild,
            action: '🧽 Clear Warnings',
            user: targetUser,
            moderator,
            reason: `Cleared ${clearedCount} warning${clearedCount === 1 ? '' : 's'}`,
            color: CLEAR_WARNINGS_COLOR,
            extra: `**Warnings Cleared:** ${clearedCount}`
        });

        return reply({
            embeds: [buildClearWarningsEmbed({
                user: targetUser,
                moderator,
                clearedCount,
                guild,
                caseNumber: getCaseNumber(logResult)
            })]
        });
    } catch (error) {
        console.error('Clearwarnings Command Error:', error);
        return reply({ content: '❌ Failed to clear warnings.' }).catch(() => null);
    }
}
