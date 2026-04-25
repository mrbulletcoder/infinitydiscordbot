const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');

const logAction = require('../../utils/logAction');

const UNBAN_COLOR = '#57f287';

function formatUser(user) {
    return `${user.tag || user.username}\n\`${user.id}\``;
}

function getCaseNumber(logResult) {
    if (!logResult) return null;
    if (typeof logResult === 'number') return logResult;
    return logResult.caseNumber || logResult.case_number || null;
}

function buildUnbanEmbed({ user, moderator, reason, guild, caseNumber = null }) {
    return new EmbedBuilder()
        .setAuthor({
            name: 'Infinity • Ban System',
            iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTitle('🔓 Member Unbanned')
        .setColor(UNBAN_COLOR)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .addFields(
            { name: '👤 User', value: formatUser(user), inline: true },
            { name: '🛡️ Moderator', value: formatUser(moderator), inline: true },
            { name: '📁 Case', value: caseNumber ? `\`#${caseNumber}\`` : '`Pending`', inline: true },
            { name: '📄 Reason', value: `> ${reason}`, inline: false }
        )
        .setFooter({ text: `${guild.name} • Moderation` })
        .setTimestamp();
}

async function runUnban({ client, guild, userId, moderator, reason }) {
    const ban = await guild.bans.fetch(userId).catch(() => null);
    if (!ban) {
        return { error: 'That user is not banned, or I could not find that ban.' };
    }

    const user = ban.user || await client.users.fetch(userId);
    await guild.bans.remove(userId, reason);

    const logResult = await logAction({
        client,
        guild,
        action: '🔓 Unban',
        user,
        moderator,
        reason,
        color: UNBAN_COLOR
    });

    return { user, caseNumber: getCaseNumber(logResult) };
}

module.exports = {
    name: 'unban',
    description: 'Unban a user and allow them to rejoin the server.',
    usage: '!unban <userID> [reason]',
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user')
        .addStringOption(option =>
            option
                .setName('userid')
                .setDescription('User ID to unban')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for unban')
                .setMaxLength(1000)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async executePrefix(message, args) {
        const userId = args[0];
        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!/^\d{17,20}$/.test(userId || '')) {
            return message.reply('❌ Provide a valid banned user ID.');
        }

        try {
            const result = await runUnban({
                client: message.client,
                guild: message.guild,
                userId,
                moderator: message.author,
                reason
            });

            if (result.error) return message.reply(`❌ ${result.error}`);

            return message.reply({
                embeds: [buildUnbanEmbed({
                    user: result.user,
                    moderator: message.author,
                    reason,
                    guild: message.guild,
                    caseNumber: result.caseNumber
                })]
            });
        } catch (error) {
            console.error('Unban Command Error:', error);
            return message.reply('❌ Failed to unban user.');
        }
    },

    async executeSlash(interaction) {
        const userId = interaction.options.getString('userid', true);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!/^\d{17,20}$/.test(userId)) {
            return interaction.reply({ content: '❌ Provide a valid banned user ID.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const result = await runUnban({
                client: interaction.client,
                guild: interaction.guild,
                userId,
                moderator: interaction.user,
                reason
            });

            if (result.error) return interaction.editReply({ content: `❌ ${result.error}` });

            return interaction.editReply({
                embeds: [buildUnbanEmbed({
                    user: result.user,
                    moderator: interaction.user,
                    reason,
                    guild: interaction.guild,
                    caseNumber: result.caseNumber
                })]
            });
        } catch (error) {
            console.error('Unban Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to unban user.' });
        }
    }
};
