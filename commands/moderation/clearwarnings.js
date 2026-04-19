const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');
const { clearWarnings } = require('../../utils/moderationDb');

module.exports = {
    name: 'clearwarnings',
    description: 'Clear all warnings for a user.',
    usage: '!clearwarnings @user / /clearwarnings <user>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear warnings')
        .addUserOption(option =>
            option.setName('user').setDescription('User').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message) {
        const targetMember = message.mentions.members.first();
        const targetUser = message.mentions.users.first();

        if (!targetUser || !targetMember) {
            return message.reply('❌ Mention a user.');
        }

        if (targetUser.bot) {
            return message.reply('❌ You cannot clear warnings for bots.');
        }

        if (!(await checkPrefixHierarchy(message, targetMember))) return;

        const result = await clearWarnings(message.guild.id, targetUser.id);
        if (!result.ok) {
            return message.reply('❌ Failed to clear warnings.');
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🧽 Warnings Cleared',
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#00ff88')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: '👤 User',
                    value: `${targetUser.tag}\n\`${targetUser.id}\``,
                    inline: true
                },
                {
                    name: '🛡️ Moderator',
                    value: `${message.author.tag}\n\`${message.author.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Moderation • Warnings System' })
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
            return interaction.reply({
                content: '❌ User not found in this server.',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ You cannot clear warnings for bots.',
                ephemeral: true
            });
        }

        if (!(await checkSlashHierarchy(interaction, targetMember))) return;

        const result = await clearWarnings(interaction.guild.id, targetUser.id);
        if (!result.ok) {
            return interaction.reply({
                content: '❌ Failed to clear warnings.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🧽 Warnings Cleared',
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setColor('#00ff88')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                {
                    name: '👤 User',
                    value: `${targetUser.tag}\n\`${targetUser.id}\``,
                    inline: true
                },
                {
                    name: '🛡️ Moderator',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Moderation • Warnings System' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};