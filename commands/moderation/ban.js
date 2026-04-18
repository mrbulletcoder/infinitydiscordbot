const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const logAction = require('../../utils/logAction');

module.exports = {
    name: 'ban',
    description: 'Permanently ban a user from the server.',
    usage: '!ban @user [reason]',
    userPermissions: PermissionFlagsBits.BanMembers,

    slashData: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user')
        .addUserOption(option =>
            option.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(option =>
            option.setName('reason').setDescription('Reason for ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async executePrefix(message, args) {
        const member = message.mentions.members.first();
        if (!member) return message.reply('❌ Mention a user.');

        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (member.id === message.author.id) {
            return message.reply('❌ You cannot ban yourself.');
        }

        if (member.id === message.guild.ownerId) {
            return message.reply('❌ You cannot ban the server owner.');
        }

        if (member.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ You cannot ban someone with an equal or higher role.');
        }

        if (!member.bannable) {
            return message.reply('❌ Cannot ban this user.');
        }

        try {
            const dmEmbed = new EmbedBuilder()
                .setAuthor({
                    name: '🚫 You Have Been Banned',
                    iconURL: message.guild.iconURL({ dynamic: true }) || undefined
                })
                .setColor('#ff0000')
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
                .setFooter({ text: 'Infinity Moderation • Ban Notice' })
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log('Failed to DM Banned user:', error.message);
        }

        await member.ban({ reason });

        await logAction({
            client: message.client,
            guild: message.guild,
            action: '🔨 Ban',
            user: member.user,
            moderator: message.author,
            reason,
            color: '#ff0000'
        });

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🔨 Ban Executed',
                iconURL: member.user.displayAvatarURL({ dynamic: true })
            })
            .setColor('#ff0000')
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
            .setFooter({ text: 'Infinity Moderation • Ban System' })
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
            return interaction.reply({ content: '❌ You cannot ban yourself.', ephemeral: true });
        }

        if (member.id === interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ You cannot ban the server owner.', ephemeral: true });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: '❌ You cannot ban someone with an equal or higher role.', ephemeral: true });
        }

        if (!member.bannable) {
            return interaction.reply({ content: '❌ Cannot ban this user.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            const dmEmbed = new EmbedBuilder()
                .setAuthor({
                    name: '🚫 You Have Been Banned',
                    iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
                })
                .setColor('#ff0000')
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
                .setFooter({ text: 'Infinity Moderation • Ban Notice' })
                .setTimestamp();

            await member.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log('Failed to DM Banned user:', error.message);
        }

        await member.ban({ reason });

        await logAction({
            client: interaction.client,
            guild: interaction.guild,
            action: '🔨 Ban',
            user: member.user,
            moderator: interaction.user,
            reason,
            color: '#ff0000'
        });

        const embed = new EmbedBuilder()
            .setAuthor({
                name: '🔨 Ban Executed',
                iconURL: member.user.displayAvatarURL({ dynamic: true })
            })
            .setColor('#ff0000')
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
            .setFooter({ text: 'Infinity Moderation • Ban System' })
            .setTimestamp();

        interaction.editReply({ embeds: [embed] });
    }
};