const {
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ChannelType
} = require('discord.js');

const {
    getAppealEligibleGuildsForUser
} = require('../../utils/appeals');

module.exports = {
    name: 'messageCreate',

    async execute(message) {
        // Ignore bots
        if (message.author.bot) return;

        // Only work in DMs
        if (message.channel.type !== ChannelType.DM) return;

        const client = message.client;

        const eligibleGuilds = await getAppealEligibleGuildsForUser(
            client,
            message.author.id
        );

        // No appealable servers
        if (!eligibleGuilds.length) {
            return message.reply({
                content: '❌ I could not find any servers where you have appealable cases.'
            });
        }

        // Guild dropdown
        const options = eligibleGuilds.slice(0, 25).map(guild => ({
            label: guild.name.slice(0, 100),
            value: guild.id,
            description: `Start an appeal for ${guild.name}`.slice(0, 100)
        }));

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('appeal_guild_select')
                .setPlaceholder('Choose the server for your appeal')
                .addOptions(options)
        );

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('📨 Start an Appeal')
            .setDescription(
                'Select the server where the moderation case happened.\n\nAfter that, I will show you the cases you can appeal.'
            )
            .setFooter({ text: 'Infinity Appeals' })
            .setTimestamp();

        return message.reply({
            embeds: [embed],
            components: [row]
        });
    }
};