const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const OWNER_IDS = [
    '398455056258826240'
];

const serverPages = new Map();
const SERVERS_PER_PAGE = 5;

function formatDate(date) {
    if (!date) return 'Unknown';
    return `<t:${Math.floor(date.getTime() / 1000)}:D>`;
}

function getPageGuilds(guilds, page) {
    const start = page * SERVERS_PER_PAGE;
    return guilds.slice(start, start + SERVERS_PER_PAGE);
}

function buildServersEmbed(interaction, data) {
    const { guilds, page } = data;
    const totalPages = Math.max(1, Math.ceil(guilds.length / SERVERS_PER_PAGE));
    const start = page * SERVERS_PER_PAGE;
    const currentGuilds = getPageGuilds(guilds, page);

    const description = currentGuilds.map((guild, index) => {
        return (
            `**${start + index + 1}. ${guild.name}**\n` +
            `👑 Owner: <@${guild.ownerId}>\n` +
            `👥 Members: \`${guild.memberCount?.toLocaleString() || 'Unknown'}\`\n` +
            `🆔 ID: \`${guild.id}\`\n` +
            `📅 Created: ${formatDate(guild.createdAt)}\n` +
            `🤖 Bot Joined: ${formatDate(guild.botJoinedAt)}`
        );
    }).join('\n\n');

    return new EmbedBuilder()
        .setColor('#00bfff')
        .setAuthor({
            name: 'Infinity Server List',
            iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTitle('🌍 Servers Using Infinity')
        .setDescription(description || 'No servers found.')
        .setFooter({
            text: `Infinity Bot • Page ${page + 1}/${totalPages} • ${guilds.length} Total Servers ⚡`
        })
        .setTimestamp();
}

function buildServersButtons(data) {
    const { guilds, page } = data;
    const totalPages = Math.max(1, Math.ceil(guilds.length / SERVERS_PER_PAGE));
    const currentGuilds = getPageGuilds(guilds, page);

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('servers_prev')
            .setLabel('Previous')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 0),

        new ButtonBuilder()
            .setCustomId('servers_next')
            .setLabel('Next')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );

    const inviteButtons = currentGuilds.slice(0, 5).map((guild, index) =>
        new ButtonBuilder()
            .setCustomId(`servers_invite_${index}`)
            .setLabel(`Invite ${index + 1}`)
            .setEmoji('🔗')
            .setStyle(ButtonStyle.Primary)
    );

    const inviteRow = new ActionRowBuilder().addComponents(inviteButtons);

    return [navRow, inviteRow];
}

module.exports = {
    name: 'servers',
    description: 'View all servers Infinity is in.',
    category: 'admin',
    cooldown: 5,
    serverPages,

    userPermissions: PermissionFlagsBits.Administrator,

    botPermissions: [
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],

    slashData: new SlashCommandBuilder()
        .setName('servers')
        .setDescription('View all servers Infinity is in')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        if (!OWNER_IDS.includes(interaction.user.id)) {
            return safeReply(interaction, {
                content: '❌ This command is restricted to the bot owner.'
            }, true);
        }

        const guilds = [...interaction.client.guilds.cache.values()]
            .sort((a, b) => (b.memberCount || 0) - (a.memberCount || 0))
            .map(guild => ({
                id: guild.id,
                name: guild.name,
                ownerId: guild.ownerId,
                memberCount: guild.memberCount || 0,
                createdAt: guild.createdAt,
                botJoinedAt: guild.members.me?.joinedAt || null
            }));

        const data = {
            guilds,
            page: 0,
            createdAt: Date.now()
        };

        const key = `${interaction.user.id}:${interaction.guild.id}`;

        serverPages.set(key, data);

        setTimeout(() => serverPages.delete(key), 5 * 60 * 1000);

        return safeReply(interaction, {
            embeds: [buildServersEmbed(interaction, data)],
            components: buildServersButtons(data)
        }, true);
    },

    buildServersEmbed,
    buildServersButtons
};