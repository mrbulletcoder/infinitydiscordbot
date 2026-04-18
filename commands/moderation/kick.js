const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const logAction = require('../../utils/logAction');

module.exports = {
    name: 'kick',
    description: 'Remove a user from the server.',
    usage: '!kick @user [reason]',
    userPermissions: PermissionFlagsBits.KickMembers,

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

        if (member.id === message.author.id) {
            return message.reply('❌ You cannot kick yourself.');
        }

        if (member.id === message.guild.ownerId) {
            return message.reply('❌ You cannot kick the server owner.');
        }

        if (member.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ You cannot kick someone with an equal or higher role.');
        }

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

            await member.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log('Failed to DM kicked user:', error.message);
        }

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

        message.reply({ embeds: [embed] });
    },

    async executeSlash(interaction) {
        const user = interaction.options.getUser('user');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!member) {
            return interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }

        if (member.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot kick yourself.', ephemeral: true });
        }

        if (member.id === interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ You cannot kick the server owner.', ephemeral: true });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: '❌ You cannot kick someone with an equal or higher role.', ephemeral: true });
        }

        if (!member.kickable) {
            return interaction.reply({ content: '❌ Cannot kick this user.', ephemeral: true });
        }

        await interaction.deferReply();

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

            await member.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log('Failed to DM kicked user:', error.message);
        }

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
    }
};