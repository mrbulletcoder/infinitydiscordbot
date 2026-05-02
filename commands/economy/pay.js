const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, removeWallet, addWallet, formatMoney } = require('../../utils/economy');
const { safeReply } = require('../../handlers/interactions/safeReply');

function respond(ctx, options) {
    if (ctx.user) {
        return safeReply(ctx, options, true);
    }

    return ctx.reply(options);
}

module.exports = {
    name: 'pay',
    description: 'Pay another user coins.',
    usage: '!pay @user <amount> / /pay user amount',
    category: 'economy',
    cooldown: 3,

    slashData: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Pay another user coins')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('User to pay')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount to pay')
                .setMinValue(1)
                .setRequired(true)
        ),

    async executePrefix(message, args) {
        const target = message.mentions.users.first();
        const amount = Number(args[1]);

        if (!target || !amount || amount <= 0) {
            return message.reply('❌ Usage: `!pay @user <amount>`');
        }

        return pay(message, target, amount);
    },

    async executeSlash(interaction) {
        const target = interaction.options.getUser('user', true);
        const amount = interaction.options.getInteger('amount', true);

        return pay(interaction, target, amount);
    }
};

async function pay(ctx, target, amount) {
    const sender = ctx.user || ctx.author;

    if (target.bot) {
        return respond(ctx, { content: '❌ You cannot pay bots.' });
    }

    if (target.id === sender.id) {
        return respond(ctx, { content: '❌ You cannot pay yourself.' });
    }

    const guildId = ctx.guild.id;
    const senderData = await getUser(guildId, sender.id);

    if (Number(senderData.wallet) < amount) {
        return respond(ctx, {
            content: `❌ You do not have enough money. Wallet: ${formatMoney(senderData.wallet)}`
        });
    }

    await removeWallet(guildId, sender.id, amount, 'pay_sent', `Paid ${target.id}`);
    await addWallet(guildId, target.id, amount, 'pay_received', `Received from ${sender.id}`);

    const embed = new EmbedBuilder()
        .setColor('#00ff99')
        .setTitle('💸 Payment Sent')
        .setDescription(`${sender} paid ${target}`)
        .addFields(
            { name: 'Amount', value: formatMoney(amount), inline: true }
        )
        .setFooter({ text: 'Infinity Economy System ⚡' })
        .setTimestamp();

    return respond(ctx, { embeds: [embed] });
}