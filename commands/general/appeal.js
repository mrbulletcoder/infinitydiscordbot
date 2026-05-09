const {
    SlashCommandBuilder,
    InteractionContextType,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    PermissionFlagsBits
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

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

module.exports = {
    name: 'appeal',
    description: 'Start a moderation appeal.',
    category: 'general',
    dmAllowed: true,
    cooldown: 10,

    slashData: new SlashCommandBuilder()
        .setName('appeal')
        .setDescription('Start a moderation appeal')
        .setContexts(
            InteractionContextType.Guild,
            InteractionContextType.BotDM
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, false);
        if (!deferred) return;

        if (!interaction.guild) {
            const eligibleGuilds = await getAppealEligibleGuildsForUser(
                interaction.client,
                interaction.user.id
            );

            if (!eligibleGuilds.length) {
                return safeReply(interaction, {
                    content: '❌ I could not find any servers where you have appealable cases.'
                }, true);
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
                .setDescription('Select the server where the moderation case happened.\n\nAfter that, I will show you the cases you can appeal.')
                .setFooter({ text: 'Infinity Appeals' })
                .setTimestamp();

            return safeReply(interaction, {
                embeds: [embed],
                components: [row]
            });
        }

        const result = await getAppealableCasesForUser(
            interaction.guild.id,
            interaction.user.id,
            10
        );

        if (!result.ok) {
            return safeReply(interaction, {
                content: '❌ Failed to load your cases.'
            }, true);
        }

        if (!result.rows.length) {
            return safeReply(interaction, {
                content: '❌ You do not have any appealable cases in this server.'
            }, true);
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

        return safeReply(interaction, {
            content: 'Select the case you want to appeal.',
            components: [row]
        });
    }
};