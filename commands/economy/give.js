const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const { addWallet, formatMoney } = require('../../utils/economy');
const { safeReply } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'give',
    description: 'Give a user money (admin only).',
    usage: '/give user:<user> amount:<amount>',
    category: 'economy',
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give a user money (admin only)')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('User to give money to')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Amount to give')
                .setMinValue(1)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        await addWallet(
            interaction.guild.id,
            target.id,
            amount,
            'admin_give',
            `Given by ${interaction.user.tag}`
        );

        const embed = new EmbedBuilder()
            .setColor('#00ff99')
            .setTitle('💸 Money Given')
            .setDescription(
                `${interaction.user} gave **${formatMoney(amount)}** to ${target}`
            )
            .addFields(
                {
                    name: '👤 Target',
                    value: `${target.tag}\n\`${target.id}\``,
                    inline: true
                },
                {
                    name: '🛡️ Given By',
                    value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                    inline: true
                }
            )
            .setFooter({ text: 'Infinity Economy Admin ⚡' })
            .setTimestamp();

        return safeReply(interaction, { embeds: [embed] }, true);
    }
};