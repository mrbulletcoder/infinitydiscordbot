const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const afkUsers = new Map(); // simple memory store

module.exports = {
    name: 'afk',
    description: 'Set your AFK status.',
    usage: '!afk [reason] / /afk [reason]',
    category: 'general',

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
        return this.setAFK(interaction, reason);
    },

    async setAFK(ctx, reason) {
        const userId = ctx.user ? ctx.user.id : ctx.author.id;

        afkUsers.set(userId, {
            reason,
            timestamp: Date.now()
        });

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('😴 AFK Status Set')
            .setDescription(
                'You are now marked as AFK.\n\n' +
                `**Reason:** ${reason}`
            )
            .setFooter({ text: 'Infinity Bot • AFK System ⚡' })
            .setTimestamp();

        return ctx.reply({ embeds: [embed] });
    }
};

// ===== EXPORT AFK DATA =====
module.exports.afkUsers = afkUsers;