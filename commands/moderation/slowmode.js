const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'slowmode',
    description: 'Set the slowmode delay for the current channel.',
    usage: '!slowmode <seconds> / /slowmode <seconds>',
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set slowmode')
        .addIntegerOption(o =>
            o.setName('seconds')
                .setDescription('Slowmode duration in seconds')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    async executePrefix(message, args) {
        const seconds = parseInt(args[0], 10);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply('❌ Provide a number between 0 and 21600.');
        }

        try {
            await message.channel.setRateLimitPerUser(seconds);

            const embed = new EmbedBuilder()
                .setAuthor({ name: '🐢 Slowmode Updated' })
                .setColor('#ffaa00')
                .addFields(
                    {
                        name: '⏱️ Delay',
                        value: `**${seconds}s**`,
                        inline: true
                    },
                    {
                        name: '📍 Channel',
                        value: `${message.channel}`,
                        inline: true
                    },
                    {
                        name: '🛡️ Moderator',
                        value: `${message.author.tag}\n\`${message.author.id}\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Channel Control' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (error) {
            console.error('Slowmode Command Error:', error);
            return message.reply('❌ Failed to update slowmode.');
        }
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const seconds = interaction.options.getInteger('seconds');

        if (seconds < 0 || seconds > 21600) {
            return interaction.editReply({ content: '❌ Provide a number between 0 and 21600.' });
        }

        try {
            await interaction.channel.setRateLimitPerUser(seconds);

            const embed = new EmbedBuilder()
                .setAuthor({ name: '🐢 Slowmode Updated' })
                .setColor('#ffaa00')
                .addFields(
                    {
                        name: '⏱️ Delay',
                        value: `**${seconds}s**`,
                        inline: true
                    },
                    {
                        name: '📍 Channel',
                        value: `${interaction.channel}`,
                        inline: true
                    },
                    {
                        name: '🛡️ Moderator',
                        value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                        inline: true
                    }
                )
                .setFooter({ text: 'Infinity Moderation • Channel Control' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Slowmode Command Error:', error);
            return interaction.editReply({ content: '❌ Failed to update slowmode.', ephemeral: true });
        }
    }
};