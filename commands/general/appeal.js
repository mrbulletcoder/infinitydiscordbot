const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

const {
    getAppealableCasesForUser,
    getCaseByNumber
} = require('../../utils/moderationDb');

const {
    getAppealEligibleGuildsForUser,
    getAppealByCase,
    createAppealRecord,
    getAppealById,
    createAppealTicket
} = require('../../utils/appeals');

module.exports = {
    name: 'appeal',
    description: 'Start a moderation appeal.',
    category: 'general',
    dmAllowed: true,

    slashData: new SlashCommandBuilder()
        .setName('appeal')
        .setDescription('Start a moderation appeal')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM
        ),

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });

        // DM flow
        if (!interaction.guild) {
            const eligibleGuilds = await getAppealEligibleGuildsForUser(
                interaction.client,
                interaction.user.id
            );

            if (!eligibleGuilds.length) {
                return interaction.editReply({
                    content: '❌ I could not find any servers where you have appealable cases.'
                });
            }

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

            return interaction.editReply({
                embeds: [embed],
                components: [row]
            });
        }

        // Guild flow
        const result = await getAppealableCasesForUser(
            interaction.guild.id,
            interaction.user.id,
            10
        );

        if (!result.ok) {
            return interaction.editReply({
                content: '❌ Failed to load your cases.'
            });
        }

        if (!result.rows.length) {
            return interaction.editReply({
                content: '❌ You do not have any appealable cases in this server.'
            });
        }

        const options = result.rows.slice(0, 25).map(row => ({
            label: `Case #${row.case_number} • ${row.action}`.slice(0, 100),
            value: String(row.case_number),
            description: (row.reason || 'No reason provided').slice(0, 100)
        }));

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`appeal_case_select_${interaction.guild.id}`)
                .setPlaceholder('Choose a case to appeal')
                .addOptions(options)
        );

        return interaction.editReply({
            content: 'Select the case you want to appeal.',
            components: [row]
        });
    }
};