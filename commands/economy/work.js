const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getUser, addWallet, setCooldown, formatMoney, getRemaining, formatTime } = require('../../utils/economy');
const { safeReply } = require('../../handlers/interactions/safeReply');

const WORK_COOLDOWN = 30 * 60 * 1000;

const jobs = [
    { name: 'Discord Moderator', min: 250, max: 900 },
    { name: 'Code Fixer', min: 400, max: 1200 },
    { name: 'Pizza Delivery Driver', min: 200, max: 700 },
    { name: 'Security Guard', min: 300, max: 950 },
    { name: 'Bot Developer', min: 700, max: 1800 },
    { name: 'Streamer', min: 250, max: 1500 }
];

function respond(ctx, options) {
    if (ctx.user) {
        return safeReply(ctx, options, true);
    }

    return ctx.reply(options);
}

module.exports = {
    name: 'work',
    description: 'Work a job and earn coins.',
    usage: '!work / /work',
    category: 'economy',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 120,

    slashData: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work a job and earn coins'),

    async executePrefix(message) {
        return work(message);
    },

    async executeSlash(interaction) {
        return work(interaction);
    }
};

async function work(ctx) {
    const guildId = ctx.guild.id;
    const userId = ctx.user ? ctx.user.id : ctx.author.id;
    const user = ctx.user || ctx.author;

    const data = await getUser(guildId, userId);
    const remaining = getRemaining(data.last_work, WORK_COOLDOWN);

    if (remaining > 0) {
        return respond(ctx, {
            content: `⏳ You are tired from working. Try again in **${formatTime(remaining)}**.`
        });
    }

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    const amount = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

    await addWallet(guildId, userId, amount, 'work', job.name);
    await setCooldown(guildId, userId, 'last_work');

    const embed = new EmbedBuilder()
        .setColor('#00bfff')
        .setTitle('💼 Work Complete')
        .setDescription(`${user} worked as a **${job.name}**.`)
        .addFields(
            { name: '💰 Earned', value: formatMoney(amount), inline: true },
            { name: '⏳ Cooldown', value: '30 minutes', inline: true }
        )
        .setFooter({ text: 'Infinity Economy System ⚡' })
        .setTimestamp();

    return respond(ctx, { embeds: [embed] });
}