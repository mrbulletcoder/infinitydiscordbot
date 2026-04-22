const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    getCaseByNumber,
    deleteCase,
    deleteCaseNotes
} = require('../../utils/moderationDb');

const logAction = require('../../utils/logAction');

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
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const caseNumber = interaction.options.getInteger('number', true);

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

        const existingCase = existing.rows[0];

        await deleteCaseNotes(interaction.guild.id, caseNumber);
        const deleteResult = await deleteCase(interaction.guild.id, caseNumber);

        if (!deleteResult.ok) {
            return interaction.editReply({
                content: '❌ Failed to delete that case.'
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#ff3b30')
            .setTitle(`🗑️ Case #${caseNumber} Deleted`)
            .addFields(
                {
                    name: '🛠️ Deleted By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                },
                {
                    name: '⚖️ Action',
                    value: existingCase.action || 'Unknown',
                    inline: true
                },
                {
                    name: '📄 Original Reason',
                    value: `> ${existingCase.reason || 'No reason provided'}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Case System' })
            .setTimestamp();

        await logAction({
            client: interaction.client,
            guild: interaction.guild,
            action: '🗑️ Case Deleted',
            user: existingCase.user_id ? { id: existingCase.user_id } : null,
            moderator: interaction.user,
            reason: `Case #${caseNumber} was deleted.`,
            color: '#ff3b30',
            extra: `Deleted Case Action: ${existingCase.action || 'Unknown'}\nOriginal Reason: ${existingCase.reason || 'No reason provided'}`,
            createCase: false,
            existingCaseNumber: caseNumber
        }).catch(() => null);

        return interaction.editReply({ embeds: [embed] });
    }
};