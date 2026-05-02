const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, formatMoney } = require('../../utils/economy');
const { safeReply } = require('../../handlers/interactions/safeReply');

function respond(ctx, options) {
    if (ctx.user) {
        return safeReply(ctx, options, true);
    }

    return ctx.reply(options);
}

module.exports = {
    name: 'balance',
    description: 'Check your or another user’s economy balance.',
    usage: '!balance [user] / /balance [user]',
    category: 'economy',
    aliases: ['bal', 'money'],

    slashData: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check economy balance')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to check')
                .setRequired(false)
        ),

    async executePrefix(message) {
        const target = message.mentions.users.first() || message.author;
        return sendBalance(message, target);
    },

    async executeSlash(interaction) {
        const target = interaction.options.getUser('user') || interaction.user;
        return sendBalance(interaction, target);
    }
};

async function sendBalance(ctx, target) {
    const guildId = ctx.guild.id;
    const data = await getUser(guildId, target.id);
    const total = Number(data.wallet) + Number(data.bank);

    const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: `${target.username}'s Balance`,
            iconURL: target.displayAvatarURL()
        })
        .setDescription('💎 **Infinity Economy Account**')
        .addFields(
            { name: '👛 Wallet', value: formatMoney(data.wallet), inline: true },
            { name: '🏦 Bank', value: formatMoney(data.bank), inline: true },
            { name: '💰 Net Worth', value: formatMoney(total), inline: true }
        )
        .setFooter({ text: 'Infinity Economy System ⚡' })
        .setTimestamp();

    return respond(ctx, { embeds: [embed] });
}