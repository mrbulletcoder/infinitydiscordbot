const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');

module.exports = {
    name: 'untimeout',
    description: 'Remove a user’s timeout.',
    usage: '!untimeout @user / /untimeout <user>',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Remove timeout')
        .addUserOption(o =>
            o.setName('user').setDescription('User to remove timeout from').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message) {
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Mention a user.');

        if (!(await checkPrefixHierarchy(message, member))) return;

        if (!member.communicationDisabledUntilTimestamp) {
            return message.reply('❌ That user is not timed out.');
        }

        if (!member.moderatable) {
            return message.reply('❌ Cannot remove timeout from this user.');
        }

        try {
            await member.timeout(null);

            await logAction({
                client: message.client,
                guild: message.guild,
                action: '🔓 Untimeout',
                user: member.user,
                moderator: message.author,
                reason: 'Timeout removed',
                color: '#00ff00'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '🔓 Timeout Removed',
                    iconURL: member.user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#00ff88')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '👤 User',
                        value: `${member.user.tag}\n\`${member.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Moderator',
                        value: `${message.author.tag}\n\`${message.author.id}\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Timeout System' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Untimeout Command Error:', error);
            return message.reply('❌ Failed to remove timeout.');
        }
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.editReply({ content: '❌ User not found in this server.', ephemeral: true });
        }

        if (!(await checkSlashHierarchy(interaction, member))) return;

        if (!member.communicationDisabledUntilTimestamp) {
            return interaction.editReply({ content: '❌ That user is not timed out.', ephemeral: true });
        }

        if (!member.moderatable) {
            return interaction.editReply({ content: '❌ Cannot remove timeout from this user.', ephemeral: true });
        }

        try {
            await member.timeout(null);

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: '🔓 Untimeout',
                user: member.user,
                moderator: interaction.user,
                reason: 'Timeout removed',
                color: '#00ff00'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '🔓 Timeout Removed',
                    iconURL: member.user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#00ff88')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '👤 User',
                        value: `${member.user.tag}\n\`${member.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Moderator',
                        value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Timeout System' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Untimeout Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to remove timeout.', ephemeral: true });
        }
    }
};