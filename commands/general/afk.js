const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionFlagsBits
} = require('discord.js');

const { pool } = require('../../database');

const { safeReply } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'afk',
    description: 'Set your AFK status.',
    usage: '!afk [reason] / /afk [reason]',
    category: 'general',
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your AFK status')
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for being AFK')
                .setRequired(false)
        ),

    async executePrefix(message, args) {
        const reason = args.join(' ') || 'No reason provided';
        return this.setAFK(message, reason);
    },

    async executeSlash(interaction) {
        const reason = interaction.options.getString('reason') || 'No reason provided';
        return this.setAFK(interaction, reason, true);
    },

    async setAFK(ctx, reason, isSlash = false) {
        const guildId = ctx.guild.id;
        const userId = ctx.user ? ctx.user.id : ctx.author.id;

        await pool.query(
            `INSERT INTO afk_users (guild_id, user_id, reason)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_at = CURRENT_TIMESTAMP`,
            [guildId, userId, reason]
        );

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('😴 AFK Status Set')
            .setDescription(
                'You are now marked as AFK.\n\n' +
                `**Reason:** ${reason}`
            )
            .setFooter({ text: 'Infinity Bot • AFK System ⚡' })
            .setTimestamp();

        if (isSlash) {
            return safeReply(ctx, { embeds: [embed] });
        }

        return ctx.reply({ embeds: [embed] });
    }
};