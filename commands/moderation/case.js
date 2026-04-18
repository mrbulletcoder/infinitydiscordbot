const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const { pool } = require('../../database');

module.exports = {
    name: 'case',
    description: 'View detailed information about a specific moderation case.',
    usage: '!case <number> / /case <number>',
    userPermissions: PermissionFlagsBits.ModerateMembers,

    slashData: new SlashCommandBuilder()
        .setName('case')
        .setDescription('View a moderation case')
        .addIntegerOption(option =>
            option.setName('number')
                .setDescription('Case number')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const caseId = parseInt(args[0], 10);
        if (!caseId) {
            return message.reply('❌ Provide a case number.');
        }

        const [rows] = await pool.query(
            `SELECT case_number, action, user_id, moderator_id, reason, created_at
             FROM cases
             WHERE guild_id = ? AND case_number = ?
             LIMIT 1`,
            [message.guild.id, caseId]
        );

        if (!rows.length) {
            return message.reply('❌ Case not found.');
        }

        const foundCase = rows[0];
        const targetUser = foundCase.user_id
            ? await message.client.users.fetch(foundCase.user_id).catch(() => null)
            : null;
        const moderator = foundCase.moderator_id
            ? await message.client.users.fetch(foundCase.moderator_id).catch(() => null)
            : null;

        const embed = new EmbedBuilder()
            .setAuthor({ name: `📁 Case #${foundCase.case_number}` })
            .setColor('#00bfff')
            .addFields(
                {
                    name: '⚖️ Action',
                    value: foundCase.action,
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
                    name: '📅 Date',
                    value: `<t:${foundCase.created_at}:F>`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Case System' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const caseId = interaction.options.getInteger('number', true);

        const [rows] = await pool.query(
            `SELECT case_number, action, user_id, moderator_id, reason, created_at
             FROM cases
             WHERE guild_id = ? AND case_number = ?
             LIMIT 1`,
            [interaction.guild.id, caseId]
        );

        if (!rows.length) {
            return interaction.reply({ content: '❌ Case not found.', ephemeral: true });
        }

        const foundCase = rows[0];
        const targetUser = foundCase.user_id
            ? await interaction.client.users.fetch(foundCase.user_id).catch(() => null)
            : null;
        const moderator = foundCase.moderator_id
            ? await interaction.client.users.fetch(foundCase.moderator_id).catch(() => null)
            : null;

        const embed = new EmbedBuilder()
            .setAuthor({ name: `📁 Case #${foundCase.case_number}` })
            .setColor('#00bfff')
            .addFields(
                {
                    name: '⚖️ Action',
                    value: foundCase.action,
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
                    name: '📅 Date',
                    value: `<t:${foundCase.created_at}:F>`,
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Moderation • Case System' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};