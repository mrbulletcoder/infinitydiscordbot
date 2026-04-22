const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    getCasesForUser,
    getCasesByModerator,
    getRecentCases,
    getCasesByAction
} = require('../../utils/moderationDb');

function trimReason(reason, max = 80) {
    const text = String(reason || 'No reason provided');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function buildCasesEmbed(title, iconURL, rows, modeLabel) {
    const description = rows
        .map(row =>
            `**#${row.case_number}** • ${row.action}\n` +
            `> ${trimReason(row.reason)}\n` +
            `• User: ${row.user_id ? `<@${row.user_id}>` : 'Unknown'}\n` +
            `• Moderator: ${row.moderator_id ? `<@${row.moderator_id}>` : 'Unknown'}\n` +
            `• <t:${row.created_at}:R>`
        )
        .join('\n\n')
        .slice(0, 4096);

    return new EmbedBuilder()
        .setAuthor({
            name: title,
            iconURL: iconURL || null
        })
        .setColor('#00bfff')
        .setDescription(description || 'No cases found.')
        .setFooter({ text: `Infinity Moderation • ${modeLabel}` })
        .setTimestamp();
}

module.exports = {
    name: 'cases',
    description: 'View moderation case history with filters.',
    usage: '/cases [user] [moderator] [action] [recent] [limit]',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('cases')
        .setDescription('View moderation case history')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('View cases for a user')
                .setRequired(false)
        )
        .addUserOption(option =>
            option
                .setName('moderator')
                .setDescription('View cases handled by a moderator')
                .setRequired(false)
        )
        .addStringOption(option =>
            option
                .setName('action')
                .setDescription('Filter by action (ban, warn, timeout, kick)')
                .setRequired(false)
                .addChoices(
                    { name: 'Ban', value: 'Ban' },
                    { name: 'Kick', value: 'Kick' },
                    { name: 'Timeout', value: 'Timeout' },
                    { name: 'Warn', value: 'Warn' }
                )
        )
        .addBooleanOption(option =>
            option
                .setName('recent')
                .setDescription('Show recent cases for the server')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option
                .setName('limit')
                .setDescription('How many cases to show (1-25)')
                .setMinValue(1)
                .setMaxValue(25)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getUser('user');
        const targetModerator = interaction.options.getUser('moderator');
        const action = interaction.options.getString('action');
        const recent = interaction.options.getBoolean('recent');
        const limit = interaction.options.getInteger('limit') || 10;

        const filtersUsed = [targetUser, targetModerator, action, recent].filter(Boolean).length;

        if (filtersUsed === 0) {
            return interaction.editReply({
                content: '❌ Choose one filter: user, moderator, action, or recent.'
            });
        }

        if (filtersUsed > 1) {
            return interaction.editReply({
                content: '❌ Use only one filter at a time.'
            });
        }

        let result;
        let embed;

        if (targetUser) {
            result = await getCasesForUser(interaction.guild.id, targetUser.id, limit);

            if (!result.ok) {
                return interaction.editReply({ content: '❌ Failed to fetch case history.' });
            }

            if (!result.rows.length) {
                return interaction.editReply({ content: '❌ No case history found for that user.' });
            }

            embed = buildCasesEmbed(
                `📁 ${targetUser.tag} • Case History`,
                targetUser.displayAvatarURL({ dynamic: true }),
                result.rows,
                `User Cases • Showing ${result.rows.length}`
            );
        } else if (targetModerator) {
            result = await getCasesByModerator(interaction.guild.id, targetModerator.id, limit);

            if (!result.ok) {
                return interaction.editReply({ content: '❌ Failed to fetch moderator cases.' });
            }

            if (!result.rows.length) {
                return interaction.editReply({ content: '❌ No cases found for that moderator.' });
            }

            embed = buildCasesEmbed(
                `🛡️ ${targetModerator.tag} • Moderator Cases`,
                targetModerator.displayAvatarURL({ dynamic: true }),
                result.rows,
                `Moderator Cases • Showing ${result.rows.length}`
            );
        } else if (action) {
            result = await getCasesByAction(interaction.guild.id, action, limit);

            if (!result.ok) {
                return interaction.editReply({ content: '❌ Failed to fetch action-filtered cases.' });
            }

            if (!result.rows.length) {
                return interaction.editReply({ content: `❌ No ${action.toLowerCase()} cases found.` });
            }

            embed = buildCasesEmbed(
                `⚖️ ${action} • Server Cases`,
                interaction.guild.iconURL({ dynamic: true }),
                result.rows,
                `${action} Cases • Showing ${result.rows.length}`
            );
        } else if (recent) {
            result = await getRecentCases(interaction.guild.id, limit);

            if (!result.ok) {
                return interaction.editReply({ content: '❌ Failed to fetch recent cases.' });
            }

            if (!result.rows.length) {
                return interaction.editReply({ content: '❌ No recent cases found.' });
            }

            embed = buildCasesEmbed(
                `🕒 Recent Cases • ${interaction.guild.name}`,
                interaction.guild.iconURL({ dynamic: true }),
                result.rows,
                `Recent Cases • Showing ${result.rows.length}`
            );
        }

        return interaction.editReply({ embeds: [embed] });
    }
};