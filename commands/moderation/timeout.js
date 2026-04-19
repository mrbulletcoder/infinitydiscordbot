const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');

module.exports = {
    name: 'timeout',
    description: 'Temporarily mute a user for a set duration.',
    usage: '!timeout @user <minutes> [reason]',
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Timeout a user')
        .addUserOption(o =>
            o.setName('user').setDescription('User to timeout').setRequired(true))
        .addIntegerOption(o =>
            o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
        .addStringOption(o =>
            o.setName('reason').setDescription('Reason'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async executePrefix(message, args) {
        const member = message.mentions.members.first();
        const minutes = parseInt(args[1], 10);

        if (!member) return message.reply('❌ Mention a user.');
        if (!minutes || minutes < 1) return message.reply('❌ Provide valid minutes.');

        const reason = args.slice(2).join(' ') || 'No reason provided';

        if (!(await checkPrefixHierarchy(message, member))) return;

        if (!member.moderatable) {
            return message.reply('❌ Cannot timeout this user.');
        }

        try {
            await member.timeout(minutes * 60000, reason);

            await logAction({
                client: message.client,
                guild: message.guild,
                action: '⏳ Timeout',
                user: member.user,
                moderator: message.author,
                reason,
                color: '#ffaa00'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '⏳ User Timed Out',
                    iconURL: member.user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#ffaa00')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '👤 User',
                        value: `${member.user.tag}\n\`${member.id}\``,
                        inline: true
                    },
                    {
                        name: '⏱️ Duration',
                        value: `**${minutes} minutes**`,
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
                .setFooter({ text: 'Infinity Moderation • Timeout System' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Timeout Command Error:', error);
            return message.reply('❌ Failed to timeout user.');
        }
    },

    async executeSlash(interaction) {
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const minutes = interaction.options.getInteger('minutes');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) {
            return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }

        if (minutes < 1) {
            return interaction.reply({ content: '❌ Provide valid minutes.', ephemeral: true });
        }

        if (!(await checkSlashHierarchy(interaction, member))) return;

        if (!member.moderatable) {
            return interaction.reply({ content: '❌ Cannot timeout this user.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            await member.timeout(minutes * 60000, reason);

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: '⏳ Timeout',
                user: member.user,
                moderator: interaction.user,
                reason,
                color: '#ffaa00'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '⏳ User Timed Out',
                    iconURL: member.user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#ffaa00')
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    {
                        name: '👤 User',
                        value: `${member.user.tag}\n\`${member.id}\``,
                        inline: true
                    },
                    {
                        name: '⏱️ Duration',
                        value: `**${minutes} minutes**`,
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
                .setFooter({ text: 'Infinity Moderation • Timeout System' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Timeout Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to timeout user.' });
        }
    }
};