const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const logAction = require('../../utils/logAction');

module.exports = {
    name: 'timeout',
    description: 'Temporarily mute a user for a set duration.',
    usage: '!timeout @user <minutes> [reason]',
    userPermissions: PermissionFlagsBits.ModerateMembers,

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
        const minutes = parseInt(args[1]);

        if (!member) return message.reply('❌ Mention a user.');
        if (!minutes || minutes < 1) return message.reply('❌ Provide valid minutes.');

        const reason = args.slice(2).join(' ') || 'No reason provided';

        if (member.id === message.author.id) {
            return message.reply('❌ You cannot timeout yourself.');
        }

        if (member.id === message.guild.ownerId) {
            return message.reply('❌ You cannot timeout the server owner.');
        }

        if (member.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ You cannot timeout someone with an equal or higher role.');
        }

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

            message.reply({ embeds: [embed] });
        } catch {
            message.reply('❌ Failed to timeout user.');
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

        if (member.id === interaction.user.id) {
            return interaction.reply({ content: '❌ You cannot timeout yourself.', ephemeral: true });
        }

        if (member.id === interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ You cannot timeout the server owner.', ephemeral: true });
        }

        if (member.roles.highest.position >= interaction.member.roles.highest.position) {
            return interaction.reply({ content: '❌ You cannot timeout someone with an equal or higher role.', ephemeral: true });
        }

        if (!member.moderatable) {
            return interaction.reply({ content: '❌ Cannot timeout this user.', ephemeral: true });
        }

        await interaction.deferReply();

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

        interaction.editReply({ embeds: [embed] });
    }
};