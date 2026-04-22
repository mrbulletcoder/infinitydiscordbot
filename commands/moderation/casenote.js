const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    getCaseByNumber,
    addCaseNote,
    getCaseNoteCount
} = require('../../utils/moderationDb');

module.exports = {
    name: 'casenote',
    description: 'Add an internal note to a moderation case.',
    usage: '/casenote <number> <note>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('casenote')
        .setDescription('Add an internal note to a moderation case')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('Case number')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('Note to attach to the case')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const caseNumber = interaction.options.getInteger('number', true);
        const note = interaction.options.getString('note', true);
        const createdAt = Math.floor(Date.now() / 1000);

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

        const noteResult = await addCaseNote(
            interaction.guild.id,
            caseNumber,
            interaction.user.id,
            note,
            createdAt
        );

        if (!noteResult.ok) {
            return interaction.editReply({
                content: '❌ Failed to add note to that case.'
            });
        }

        const countResult = await getCaseNoteCount(interaction.guild.id, caseNumber);
        const totalNotes = countResult.ok ? Number(countResult.rows[0]?.total || 1) : 1;

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle(`📝 Note Added • Case #${caseNumber}`)
            .addFields(
                {
                    name: '🛠️ Added By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                },
                {
                    name: '📊 Total Notes',
                    value: `\`${totalNotes}\``,
                    inline: true
                },
                {
                    name: '📄 Note',
                    value: `> ${note}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Case System' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};