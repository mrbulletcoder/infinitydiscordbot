const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits
} = require('discord.js');

const { safeReply } = require('../../handlers/interactions/safeReply');

const CLIENT_ID = '1485150070944043078'; // your bot ID
const INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

module.exports = {
    name: 'invite',
    description: 'Get the invite link for Infinity.',
    usage: '!invite / /invite',
    category: 'general',
    botPermissions: [
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get the invite link for Infinity'),

    async executePrefix(message) {
        return this.sendInvite(message);
    },

    async executeSlash(interaction) {
        return this.sendInvite(interaction, true);
    },

    async sendInvite(ctx, isSlash = false) {
        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('🚀 Invite Infinity')
            .setDescription(
                '**Bring Infinity to your server** and unlock powerful moderation, automod, tickets, and more.\n\n' +
                '⚡ Built for performance\n' +
                '🛡️ Advanced moderation system\n' +
                '🤖 Smart automod protection\n\n' +
                'Click the button below to invite the bot.'
            )
            .addFields(
                {
                    name: '🔐 Permissions',
                    value:
                        'Infinity only requests the permissions it needs to function properly.\n' +
                        'No administrator permission is required.',
                    inline: false
                }
            )
            .setFooter({ text: 'Infinity Bot • Grow Your Server ⚡' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('🔗 Invite Infinity')
                .setURL(INVITE_URL)
                .setStyle(ButtonStyle.Link)
        );

        if (isSlash) {
            return safeReply(ctx, {
                embeds: [embed],
                components: [row]
            }, true);
        }

        return ctx.reply({
            embeds: [embed],
            components: [row]
        });
    }
};