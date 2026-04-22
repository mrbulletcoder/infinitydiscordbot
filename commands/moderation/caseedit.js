const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    getCaseByNumber,
    editCaseReason
} = require('../../utils/moderationDb');

const logAction = require('../../utils/logAction');

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
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('New reason')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const caseNumber = interaction.options.getInteger('number', true);
        const newReason = interaction.options.getString('reason', true);

        const existing = await getCaseByNumber(interaction.guild.id, caseNumber);
        if (!existing.ok) {
            return interaction.editReply({
                content: '❌ Failed to fetch that case.'
            });
        }

        if (!existing.rows.length) {
            return interaction.editReply({
                content: '❌ Case not found.'
            });
        }

        const oldCase = existing.rows[0];
        const updateResult = await editCaseReason(interaction.guild.id, caseNumber, newReason);

        if (!updateResult.ok) {
            return interaction.editReply({
                content: '❌ Failed to update the case reason.'
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle(`✏️ Case #${caseNumber} Updated`)
            .addFields(
                {
                    name: '🛠️ Edited By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                },
                {
                    name: '📄 Old Reason',
                    value: `> ${oldCase.reason || 'No reason provided'}`,
                    inline: false
                },
                {
                    name: '📝 New Reason',
                    value: `> ${newReason}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Case System' })
            .setTimestamp();

        await logAction({
            client: interaction.client,
            guild: interaction.guild,
            action: '📝 Case Edited',
            user: oldCase.user_id ? { id: oldCase.user_id } : null,
            moderator: interaction.user,
            reason: `Case #${caseNumber} reason was updated.`,
            color: '#ffaa00',
            extra: `Old Reason: ${oldCase.reason || 'No reason provided'}\nNew Reason: ${newReason}`,
            createCase: false,
            existingCaseNumber: caseNumber
        }).catch(() => null);

        return interaction.editReply({ embeds: [embed] });
    }
};