const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const {
    getCaseByNumber,
    deleteCase,
    deleteCaseNotes
} = require('../../utils/moderationDb');

const logAction = require('../../utils/logAction');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const DELETE_COLOR = '#ff3b30';
const ERROR_COLOR = '#ff4d4d';

function trimText(value, max = 1024) {
    const text = String(value || 'No reason provided');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function errorEmbed(description) {
    return new EmbedBuilder()
        .setColor(ERROR_COLOR)
        .setDescription(`❌ ${description}`)
        .setTimestamp();
}

module.exports = {
    name: 'casedelete',
    description: 'Delete a moderation case and its notes.',
    usage: '/casedelete <number>',
    userPermissions: [PermissionFlagsBits.Administrator],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('casedelete')
        .setDescription('Delete a moderation case')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('Case number')
                .setMinValue(1)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        try {
            const deferred = await safeDefer(interaction, true);
            if (!deferred) return;

            const caseNumber = interaction.options.getInteger('number', true);

            const existing = await getCaseByNumber(interaction.guild.id, caseNumber);

            if (!existing.ok) {
                return safeReply(interaction, {
                    embeds: [errorEmbed('Failed to fetch that case.')]
                }, true);
            }

            if (!existing.rows.length) {
                return safeReply(interaction, {
                    embeds: [errorEmbed(`Case #${caseNumber} was not found.`)]
                }, true);
            }

            const existingCase = existing.rows[0];

            const notesResult = await deleteCaseNotes(interaction.guild.id, caseNumber);

            if (!notesResult.ok) {
                return safeReply(interaction, {
                    embeds: [errorEmbed('Failed to delete case notes.')]
                }, true);
            }

            const deleteResult = await deleteCase(interaction.guild.id, caseNumber);

            if (!deleteResult.ok) {
                return safeReply(interaction, {
                    embeds: [errorEmbed('Failed to delete that case.')]
                }, true);
            }

            const embed = new EmbedBuilder()
                .setColor(DELETE_COLOR)
                .setAuthor({
                    name: `${interaction.guild.name} • Case Management`,
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .setTitle(`🗑️ Case #${caseNumber} Deleted`)
                .setDescription('This case and all linked internal notes were removed from the case database.')
                .addFields(
                    {
                        name: '🛠️ Deleted By',
                        value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                        inline: true
                    },
                    {
                        name: '⚖️ Original Action',
                        value: existingCase.action || 'Unknown',
                        inline: true
                    },
                    {
                        name: '👤 Target User',
                        value: existingCase.user_id
                            ? `<@${existingCase.user_id}>\n\`${existingCase.user_id}\``
                            : 'Unknown',
                        inline: true
                    },
                    {
                        name: '📄 Original Reason',
                        value: `> ${trimText(existingCase.reason, 1000)}`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Case Deleted' })
                .setTimestamp();

            const targetUser = existingCase.user_id
                ? await interaction.client.users.fetch(existingCase.user_id).catch(() => ({
                    id: existingCase.user_id,
                    tag: 'Unknown User'
                }))
                : null;

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: '🗑️ Case Deleted',
                user: targetUser,
                moderator: interaction.user,
                reason: `Case #${caseNumber} was deleted.`,
                color: DELETE_COLOR,
                extra: [
                    `**Deleted Case:** #${caseNumber}`,
                    `**Original Action:** ${existingCase.action || 'Unknown'}`,
                    `**Original Reason:** ${trimText(existingCase.reason, 700)}`
                ].join('\n'),
                createCase: false,
                existingCaseNumber: caseNumber
            }).catch(() => null);

            return safeReply(interaction, { embeds: [embed] }, true);

        } catch (error) {
            console.error('Casedelete Command Error:', error);

            return safeReply(interaction, {
                content: '❌ Failed to delete that case.'
            }, true);
        }
    }
};