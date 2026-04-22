const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const logAction = require('../../utils/logAction');

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
            option.setName('userid')
                .setDescription('User ID to unban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for unban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async executePrefix(message, args) {
        const userId = args[0];
        if (!userId) return message.reply('❌ Provide a user ID.');

        const reason = args.slice(1).join(' ') || 'No reason provided';

        try {
            const user = await message.client.users.fetch(userId);

            await message.guild.bans.remove(userId, reason);

            await logAction({
                client: message.client,
                guild: message.guild,
                action: '🔓 Unban',
                user,
                moderator: message.author,
                reason,
                color: '#00ff00'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '🔓 Unban Executed',
                    iconURL: user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#00ff88')
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '👤 User',
                        value: `${user.tag}\n\`${user.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Moderator',
                        value: `${message.author.tag}\n\`${message.author.id}\``,
                        inline: true
                    },
                    {
                        name: '📄 Reason',
                        value: `> ${reason}`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Ban System' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Unban Command Error:', error);
            return message.reply('❌ Failed to unban user.');
        }
    },

    async executeSlash(interaction) {
        const userId = interaction.options.getString('userid');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        await interaction.deferReply({ ephemeral: true });

        try {
            const user = await interaction.client.users.fetch(userId);

            await interaction.guild.bans.remove(userId, reason);

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: '🔓 Unban',
                user,
                moderator: interaction.user,
                reason,
                color: '#00ff00'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '🔓 Unban Executed',
                    iconURL: user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#00ff88')
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '👤 User',
                        value: `${user.tag}\n\`${user.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Moderator',
                        value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                        inline: true
                    },
                    {
                        name: '📄 Reason',
                        value: `> ${reason}`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Ban System' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Unban Command Error:', error);
            return interaction.editReply({
                content: '❌ Failed to unban user.'
            });
        }
    }
};