const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addWallet, getUser, setCooldown, getRemaining, formatMoney, formatTime } = require('../../utils/economy');
const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const COOLDOWN = 60 * 1000;

module.exports = {
    name: 'beg',
    description: 'Beg for some coins.',
    category: 'economy',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 0,

    slashData: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for coins'),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const user = await getUser(guildId, userId);
        const remaining = getRemaining(user.last_beg, COOLDOWN);

        if (remaining > 0) {
            return safeReply(interaction, {
                content: `⏳ Try again in **${formatTime(remaining)}**`
            }, true);
        }

        const amount = Math.floor(Math.random() * 200) + 50;

        await addWallet(guildId, userId, amount, 'beg');
        await setCooldown(guildId, userId, 'last_beg');

        const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('🪙 You begged...')
            .setDescription(`Someone gave you **${formatMoney(amount)}**`)
            .setFooter({ text: 'Infinity Economy System • Beg ⚡' })
            .setTimestamp();

        return interaction.channel.send({ embeds: [embed] });
    }
};