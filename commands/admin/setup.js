const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const {
    buildSetupMainEmbed,
    buildSetupMainComponents
} = require('../../handlers/interactions/setupMenuHandler');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'setup',
    description: 'Start the Infinity setup wizard.',
    usage: '/setup',
    category: 'admin',
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,

    slashData: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Start the Infinity setup wizard')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        return safeReply(interaction, {
            embeds: [buildSetupMainEmbed(interaction)],
            components: buildSetupMainComponents()
        }, true);
    }
};