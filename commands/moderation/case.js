const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const {
    getCaseByNumber,
    getCaseNotes
} = require('../../utils/moderationDb');

const BRAND_COLOR = '#00bfff';
const ERROR_COLOR = '#ff4d4d';

function trimText(value, max = 1024) {
    const text = String(value || 'No reason provided');
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function toUnixTimestamp(value) {
    const number = Number(value);
    if (!number) return Math.floor(Date.now() / 1000);
    return number > 9999999999 ? Math.floor(number / 1000) : number;
}

function formatUserBlock(user, fallbackId = null) {
    if (user) return `${user.tag}\n\`${user.id}\``;
    return fallbackId ? `Unknown User\n\`${fallbackId}\`` : 'Unknown';
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
            console.error('Case command interaction expired before deferReply.');
            return false;
        }

        throw error;
    }
}

async function buildCaseEmbed(client, guild, foundCase) {
    const targetUser = foundCase.user_id
        ? await client.users.fetch(foundCase.user_id).catch(() => null)
        : null;

    const moderator = foundCase.moderator_id
        ? await client.users.fetch(foundCase.moderator_id).catch(() => null)
        : null;

    const notesResult = await getCaseNotes(guild.id, foundCase.case_number);
    const notes = notesResult.ok ? notesResult.rows : [];
    const createdAt = toUnixTimestamp(foundCase.created_at);

    const notesValue = notes.length
        ? notes
            .slice(-5)
            .map((note, index) => {
                const noteCreatedAt = toUnixTimestamp(note.created_at);
                return `**${index + 1}.** <@${note.author_id}> • <t:${noteCreatedAt}:R>\n> ${trimText(note.note, 220)}`;
            })
            .join('\n\n')
        : '> No internal notes have been added to this case.';

    const avatar = targetUser?.displayAvatarURL({ dynamic: true }) || guild.iconURL({ dynamic: true }) || null;

    return new EmbedBuilder()
        .setColor(BRAND_COLOR)
        .setAuthor({
            name: `${guild.name} • Case Management`,
            iconURL: guild.iconURL({ dynamic: true }) || undefined
        })
        .setTitle(`📁 Case #${foundCase.case_number}`)
        .setThumbnail(avatar)
        .setDescription([
            `**Action:** ${foundCase.action || 'Unknown Action'}`,
            `**Created:** <t:${createdAt}:F> • <t:${createdAt}:R>`
        ].join('\n'))
        .addFields(
            {
                name: '👤 Target User',
                value: formatUserBlock(targetUser, foundCase.user_id),
                inline: true
            },
            {
                name: '🛡️ Moderator',
                value: formatUserBlock(moderator, foundCase.moderator_id),
                inline: true
            },
            {
                name: '📌 Case ID',
                value: `\`#${foundCase.case_number}\``,
                inline: true
            },
            {
                name: '📄 Reason',
                value: `> ${trimText(foundCase.reason, 1000)}`,
                inline: false
            },
            {
                name: `📝 Internal Notes (${notes.length})`,
                value: trimText(notesValue, 1024),
                inline: false
            }
        )
        .setFooter({ text: 'Infinity Moderation • Use /casenote to add notes' })
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
                .setMinValue(1)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const caseId = Number.parseInt(args[0], 10);

        if (!Number.isInteger(caseId) || caseId < 1) {
            return message.reply({ embeds: [errorEmbed('Provide a valid case number.')] });
        }

        const result = await getCaseByNumber(message.guild.id, caseId);

        if (!result.ok) {
            return message.reply({ embeds: [errorEmbed('Failed to fetch that case.')] });
        }

        if (!result.rows.length) {
            return message.reply({ embeds: [errorEmbed(`Case #${caseId} was not found.`)] });
        }

        const embed = await buildCaseEmbed(message.client, message.guild, result.rows[0]);
        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction);
        if (!deferred) return;

        const caseId = interaction.options.getInteger('number', true);
        const result = await getCaseByNumber(interaction.guild.id, caseId);

        if (!result.ok) {
            return interaction.editReply({ embeds: [errorEmbed('Failed to fetch that case.')] });
        }

        if (!result.rows.length) {
            return interaction.editReply({ embeds: [errorEmbed(`Case #${caseId} was not found.`)] });
        }

        const embed = await buildCaseEmbed(interaction.client, interaction.guild, result.rows[0]);
        return interaction.editReply({ embeds: [embed] });
    }
};