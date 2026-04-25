const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const {
    getCaseByNumber,
    addCaseNote,
    getCaseNoteCount
} = require('../../utils/moderationDb');

const BRAND_COLOR = '#00bfff';
const ERROR_COLOR = '#ff4d4d';

function trimText(value, max = 1024) {
    const text = String(value || 'No note provided');
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
            console.error('Casenote command interaction expired before deferReply.');
            return false;
        }

        throw error;
    }
}

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
                .setMinValue(1)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('note')
                .setDescription('Note to attach to the case')
                .setMaxLength(1000)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction);
        if (!deferred) return;

        const caseNumber = interaction.options.getInteger('number', true);
        const note = interaction.options.getString('note', true).trim();
        const createdAt = Math.floor(Date.now() / 1000);

        const existing = await getCaseByNumber(interaction.guild.id, caseNumber);

        if (!existing.ok) {
            return interaction.editReply({ embeds: [errorEmbed('Failed to fetch that case.')] });
        }

        if (!existing.rows.length) {
            return interaction.editReply({ embeds: [errorEmbed(`Case #${caseNumber} was not found.`)] });
        }

        const noteResult = await addCaseNote(
            interaction.guild.id,
            caseNumber,
            interaction.user.id,
            note,
            createdAt
        );

        if (!noteResult.ok) {
            return interaction.editReply({ embeds: [errorEmbed('Failed to add note to that case.')] });
        }

        const countResult = await getCaseNoteCount(interaction.guild.id, caseNumber);
        const totalNotes = countResult.ok ? Number(countResult.rows[0]?.total || 1) : 1;
        const foundCase = existing.rows[0];

        const embed = new EmbedBuilder()
            .setColor(BRAND_COLOR)
            .setAuthor({
                name: `${interaction.guild.name} • Case Management`,
                iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
            })
            .setTitle(`📝 Internal Note Added • Case #${caseNumber}`)
            .addFields(
                {
                    name: '🛠️ Added By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                },
                {
                    name: '⚖️ Case Action',
                    value: foundCase.action || 'Unknown',
                    inline: true
                },
                {
                    name: '📊 Total Notes',
                    value: `\`${totalNotes}\``,
                    inline: true
                },
                {
                    name: '📄 Note',
                    value: `> ${trimText(note, 1000)}`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Internal Case Note' })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    }
};