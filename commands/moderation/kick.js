const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const logAction = require('../../utils/logAction');
const {
    checkPrefixHierarchy,
    checkSlashHierarchy
} = require('../../utils/checkPermissions');

module.exports = {
    name: 'kick',
    description: 'Remove a user from the server.',
    usage: '!kick @user [reason]',
    userPermissions: [PermissionFlagsBits.KickMembers],
    botPermissions: [PermissionFlagsBits.KickMembers, PermissionFlagsBits.EmbedLinks],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(option =>
            option.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(option =>
            option.setName('reason').setDescription('Reason for kick'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async executePrefix(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Mention a user.');

        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!(await checkPrefixHierarchy(message, member))) return;

        if (!member.kickable) {
            return message.reply('❌ Cannot kick this user.');
        }

        try {
            const dmEmbed = new EmbedBuilder()
                .setAuthor({
                    name: '👢 You Have Been Kicked',
                    iconURL: message.guild.iconURL({ dynamic: true }) || undefined
                })
                .setColor('#ff9900')
                .setThumbnail(message.guild.iconURL({ dynamic: true }) || null)
                .addFields(
                    {
                        name: '🏠 Server',
                        value: message.guild.name,
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
                .setFooter({ text: 'Infinity Moderation • Kick Notice' })
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] }).catch(() => null);

            await member.kick(reason);

            await logAction({
                client: message.client,
                guild: message.guild,
                action: '👢 Kick',
                user: member.user,
                moderator: message.author,
                reason,
                color: '#ff9900'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '👢 Kick Executed',
                    iconURL: member.user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#ff9900')
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
                    },
                    {
                        name: '📄 Reason',
                        value: `> ${reason}`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Kick System' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Kick Command Error:', error);
            return message.reply('❌ Failed to kick user.');
        }
    },

    async executeSlash(interaction) {
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) {
            return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }

        if (!(await checkSlashHierarchy(interaction, member))) return;

        if (!member.kickable) {
            return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const dmEmbed = new EmbedBuilder()
                .setAuthor({
                    name: '👢 You Have Been Kicked',
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .setColor('#ff9900')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || null)
                .addFields(
                    {
                        name: '🏠 Server',
                        value: interaction.guild.name,
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
                .setFooter({ text: 'Infinity Moderation • Kick Notice' })
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] }).catch(() => null);

            await member.kick(reason);

            await logAction({
                client: interaction.client,
                guild: interaction.guild,
                action: '👢 Kick',
                user: member.user,
                moderator: interaction.user,
                reason,
                color: '#ff9900'
            });

            const embed = new EmbedBuilder()
                .setAuthor({
                    name: '👢 Kick Executed',
                    iconURL: member.user.displayAvatarURL({ dynamic: true })
                })
                .setColor('#ff9900')
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
                    },
                    {
                        name: '📄 Reason',
                        value: `> ${reason}`,
                        inline: false
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Kick System' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Kick Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to kick user.' });
        }
    }
};