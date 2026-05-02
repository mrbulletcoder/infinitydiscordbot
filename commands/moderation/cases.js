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

const { safeReply } = require('../../handlers/interactions/safeReply');

const BRAND_COLOR = '#00bfff';
const ERROR_COLOR = '#ff4d4d';

function trimText(value, max = 120) {
    const text = String(value || 'No reason provided');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function toUnixTimestamp(value) {
    const number = Number(value);
    if (!number) return Math.floor(Date.now() / 1000);
    return number > 9999999999 ? Math.floor(number / 1000) : number;
}

function errorEmbed(description) {
    return new EmbedBuilder()
        .setColor(ERROR_COLOR)
        .setDescription(`❌ ${description}`)
        .setTimestamp();
}

function buildCasesEmbed({ title, iconURL, rows, modeLabel, guild }) {
    const description = rows
        .map(row => {
            const createdAt = toUnixTimestamp(row.created_at);

            return [
                `### 📁 Case #${row.case_number}`,
                `**Action:** ${row.action || 'Unknown'}`,
                `**User:** ${row.user_id ? `<@${row.user_id}>` : 'Unknown'}  •  **Moderator:** ${row.moderator_id ? `<@${row.moderator_id}>` : 'Unknown'}`,
                `**Reason:** ${trimText(row.reason, 180)}`,
                `**Created:** <t:${createdAt}:R>`
            ].join('\n');
        })
        .join('\n\n')
        .slice(0, 4096);

    return new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setAuthor({
            name: title,
            iconURL: iconURL || guild.iconURL({ dynamic: true }) || undefined
        })
        .setDescription(description || '> No cases found.')
        .addFields({
            name: '📊 Results',
            value: `Showing **${rows.length}** case${rows.length === 1 ? '' : 's'}. Use \`/case number:<id>\` for full details.`,
            inline: false
        })
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
                .setDescription('Filter by action')
                .setRequired(false)
                .addChoices(
                    { name: 'Ban', value: 'Ban' },
                    { name: 'Kick', value: 'Kick' },
                    { name: 'Timeout', value: 'Timeout' },
                    { name: 'Untimeout', value: 'Untimeout' },
                    { name: 'Warn', value: 'Warn' },
                    { name: 'Unwarn', value: 'Unwarn' },
                    { name: 'Clear Warnings', value: 'Clear Warnings' },
                    { name: 'Clear Messages', value: 'Clear' },
                    { name: 'Lock', value: 'Lock' },
                    { name: 'Unlock', value: 'Unlock' },
                    { name: 'Slowmode', value: 'Slowmode' },
                    { name: 'Unban', value: 'Unban' }
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
                .setDescription('How many cases to show')
                .setMinValue(1)
                .setMaxValue(25)
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executeSlash(interaction) {

        const targetUser = interaction.options.getUser('user');
        const targetModerator = interaction.options.getUser('moderator');
        const action = interaction.options.getString('action');
        const recent = interaction.options.getBoolean('recent');
        const limit = interaction.options.getInteger('limit') || 10;

        const filtersUsed = [targetUser, targetModerator, action, recent].filter(Boolean).length;

        if (filtersUsed === 0) {
            return safeReply(interaction,{
                embeds: [errorEmbed('Choose one filter: user, moderator, action, or recent.')]
            }, true);
        }

        if (filtersUsed > 1) {
            return safeReply(interaction,{
                embeds: [errorEmbed('Use only one filter at a time.')]
            }, true);
        }

        let result;
        let embed;

        if (targetUser) {
            result = await getCasesForUser(interaction.guild.id, targetUser.id, limit);

            if (!result.ok) {
                return safeReply(interaction,{
                    embeds: [errorEmbed('Failed to fetch case history.')]
                }, true);
            }

            if (!result.rows.length) {
                return safeReply(interaction,{
                    embeds: [errorEmbed('No case history found for that user.')]
                }, true);
            }

            embed = buildCasesEmbed({
                title: `📁 ${targetUser.tag} • Case History`,
                iconURL: targetUser.displayAvatarURL({ dynamic: true }),
                rows: result.rows,
                modeLabel: `User Cases • Showing ${result.rows.length}`,
                guild: interaction.guild
            });
        } else if (targetModerator) {
            result = await getCasesByModerator(interaction.guild.id, targetModerator.id, limit);

            if (!result.ok) {
                return safeReply(interaction,{
                    embeds: [errorEmbed('Failed to fetch moderator cases.')]
                }, true);
            }

            if (!result.rows.length) {
                return safeReply(interaction,{
                    embeds: [errorEmbed('No cases found for that moderator.')]
                }, true);
            }

            embed = buildCasesEmbed({
                title: `🛡️ ${targetModerator.tag} • Moderator Cases`,
                iconURL: targetModerator.displayAvatarURL({ dynamic: true }),
                rows: result.rows,
                modeLabel: `Moderator Cases • Showing ${result.rows.length}`,
                guild: interaction.guild
            });
        } else if (action) {
            result = await getCasesByAction(interaction.guild.id, action, limit);

            if (!result.ok) {
                return safeReply(interaction,{
                    embeds: [errorEmbed('Failed to fetch action-filtered cases.')]
                }, true);
            }

            if (!result.rows.length) {
                return safeReply(interaction,{
                    embeds: [errorEmbed(`No ${action.toLowerCase()} cases found.`)]
                }, true);
            }

            embed = buildCasesEmbed({
                title: `⚖️ ${action} • Server Cases`,
                iconURL: interaction.guild.iconURL({ dynamic: true }),
                rows: result.rows,
                modeLabel: `${action} Cases • Showing ${result.rows.length}`,
                guild: interaction.guild
            });
        } else {
            result = await getRecentCases(interaction.guild.id, limit);

            if (!result.ok) {
                return safeReply(interaction,{
                    embeds: [errorEmbed('Failed to fetch recent cases.')]
                }, true);
            }

            if (!result.rows.length) {
                return safeReply(interaction,{
                    embeds: [errorEmbed('No recent cases found.')]
                }, true);
            }

            embed = buildCasesEmbed({
                title: `🕒 Recent Cases • ${interaction.guild.name}`,
                iconURL: interaction.guild.iconURL({ dynamic: true }),
                rows: result.rows,
                modeLabel: `Recent Cases • Showing ${result.rows.length}`,
                guild: interaction.guild
            });
        }

        return safeReply(interaction,{ embeds: [embed] }, true);
    }
};