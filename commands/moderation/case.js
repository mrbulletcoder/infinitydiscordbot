const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    getCaseByNumber,
    getCaseNotes
} = require('../../utils/moderationDb');

async function buildCaseEmbed(client, guildId, foundCase) {
    const targetUser = foundCase.user_id
        ? await client.users.fetch(foundCase.user_id).catch(() => null)
        : null;

    const moderator = foundCase.moderator_id
        ? await client.users.fetch(foundCase.moderator_id).catch(() => null)
        : null;

    const notesResult = await getCaseNotes(guildId, foundCase.case_number);
    const notes = notesResult.ok ? notesResult.rows : [];

    const notesValue = notes.length
        ? notes
            .slice(-3)
            .map(note => `• <@${note.author_id}> — ${String(note.note).slice(0, 150)}\n<t:${Math.floor(Number(note.created_at) / 1000)}:R>`)
            .join('\n\n')
        : 'No notes added.';

    return new EmbedBuilder()
        .setAuthor({ name: `📁 Case #${foundCase.case_number}` })
        .setColor('#00bfff')
        .addFields(
            {
                name: '⚖️ Action',
                value: foundCase.action || 'Unknown',
                inline: true
            },
            {
                name: '👤 User',
                value: targetUser
                    ? `${targetUser.tag}\n\`${targetUser.id}\``
                    : (foundCase.user_id ? `Unknown\n\`${foundCase.user_id}\`` : 'Unknown'),
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: moderator
                    ? `${moderator.tag}\n\`${moderator.id}\``
                    : (foundCase.moderator_id ? `Unknown\n\`${foundCase.moderator_id}\`` : 'Unknown'),
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${foundCase.reason || 'No reason provided'}`,
                inline: false
            },
            {
                name: '📝 Notes',
                value: notesValue.slice(0, 1024),
                inline: false
            },
            {
                name: '📅 Date',
                value: `<t:${foundCase.created_at}:F>\n<t:${foundCase.created_at}:R>`,
                inline: false
            }
        )
        .setFooter({
            text: `Infinity Moderation • ${notes.length} note(s)`
        })
        .setTimestamp();
}

module.exports = {
    name: 'case',
    description: 'View detailed information about a specific moderation case.',
    usage: '!case <number> / /case <number>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('case')
        .setDescription('View a moderation case')
        .addIntegerOption(option =>
            option
                .setName('number')
                .setDescription('Case number')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const caseId = parseInt(args[0], 10);
        if (!caseId) {
            return message.reply('❌ Provide a case number.');
        }

        const result = await getCaseByNumber(message.guild.id, caseId);
        if (!result.ok) {
            return message.reply('❌ Failed to fetch case.');
        }

        if (!result.rows.length) {
            return message.reply('❌ Case not found.');
        }

        const embed = await buildCaseEmbed(
            message.client,
            message.guild.id,
            result.rows[0]
        );

        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const caseId = interaction.options.getInteger('number', true);

        const result = await getCaseByNumber(interaction.guild.id, caseId);
        if (!result.ok) {
            return interaction.editReply({
                content: '❌ Failed to fetch case.'
            });
        }

        if (!result.rows.length) {
            return interaction.editReply({
                content: '❌ Case not found.'
            });
        }

        const embed = await buildCaseEmbed(
            interaction.client,
            interaction.guild.id,
            result.rows[0]
        );

        return interaction.editReply({ embeds: [embed] });
    }
};