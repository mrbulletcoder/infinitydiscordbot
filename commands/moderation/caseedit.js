const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const {
    getCaseByNumber,
    editCaseReason
} = require('../../utils/moderationDb');

const logAction = require('../../utils/logAction');

const BRAND_COLOR = '#ffaa00';
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

async function safeDefer(interaction) {
    if (interaction.deferred || interaction.replied) return true;

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        return true;
    } catch (error) {
        if (error.code === 10062) {
            console.error('Caseedit command interaction expired before deferReply.');
            return false;
        }

        throw error;
    }
}

module.exports = {
    name: 'caseedit',
    description: 'Edit the reason for a moderation case.',
    usage: '/caseedit <number> <reason>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('caseedit')
        .setDescription('Edit the reason for a moderation case')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('Case number')
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('New reason')
                .setMaxLength(1000)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction);
        if (!deferred) return;

        const caseNumber = interaction.options.getInteger('number', true);
        const newReason = interaction.options.getString('reason', true).trim();

        const existing = await getCaseByNumber(interaction.guild.id, caseNumber);

        if (!existing.ok) {
            return interaction.editReply({ embeds: [errorEmbed('Failed to fetch that case.')] });
        }

        if (!existing.rows.length) {
            return interaction.editReply({ embeds: [errorEmbed(`Case #${caseNumber} was not found.`)] });
        }

        const oldCase = existing.rows[0];

        if ((oldCase.reason || '').trim() === newReason) {
            return interaction.editReply({ embeds: [errorEmbed('That case already has that reason.')] });
        }

        const updateResult = await editCaseReason(interaction.guild.id, caseNumber, newReason);

        if (!updateResult.ok) {
            return interaction.editReply({ embeds: [errorEmbed('Failed to update the case reason.')] });
        }

        const embed = new EmbedBuilder()
            .setColor(BRAND_COLOR)
            .setAuthor({
                name: `${interaction.guild.name} • Case Management`,
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setTitle(`✏️ Case #${caseNumber} Updated`)
            .addFields(
                {
                    name: '🛠️ Edited By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                },
                {
                    name: '⚖️ Case Action',
                    value: oldCase.action || 'Unknown',
                    inline: true
                },
                {
                    name: '👤 Target User',
                    value: oldCase.user_id ? `<@${oldCase.user_id}>\n\`${oldCase.user_id}\`` : 'Unknown',
                    inline: true
                },
                {
                    name: '📄 Old Reason',
                    value: `> ${trimText(oldCase.reason, 1000)}`,
                    inline: false
                },
                {
                    name: '📝 New Reason',
                    value: `> ${trimText(newReason, 1000)}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Case Reason Edited' })
            .setTimestamp();

        await logAction({
            client: interaction.client,
            guild: interaction.guild,
            action: '📝 Case Edited',
            user: oldCase.user_id ? { id: oldCase.user_id } : null,
            moderator: interaction.user,
            reason: `Case #${caseNumber} reason was updated.`,
            color: BRAND_COLOR,
            extra: [
                `**Case:** #${caseNumber}`,
                `**Original Action:** ${oldCase.action || 'Unknown'}`,
                `**Old Reason:** ${trimText(oldCase.reason, 700)}`,
                `**New Reason:** ${trimText(newReason, 700)}`
            ].join('\n'),
            createCase: false,
            existingCaseNumber: caseNumber
        }).catch(() => null);

        return interaction.editReply({ embeds: [embed] });
    }
};