const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ChannelType,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const pendingEmbeds = new Map();

function isValidHex(color) {
    return /^#?[0-9A-Fa-f]{6}$/.test(color);
}

function cleanHex(color) {
    if (!color) return '#00bfff';
    return color.startsWith('#') ? color : `#${color}`;
}

function isValidUrl(url) {
    if (!url) return true;

    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function isValidImageUrl(url) {
    if (!url) return true;

    if (!isValidUrl(url)) return false;

    return /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(url);
}

function buildEmbed(data, interaction) {
    const embed = new EmbedBuilder()
        .setColor(cleanHex(data.color))
        .setTitle(data.title)
        .setDescription(data.description)
        .setAuthor({
            name: interaction.guild.name,
            iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined
        })
        .setTimestamp()
        .setFooter({
            text: data.footer || `Sent by ${interaction.user.tag}`,
            iconURL: interaction.user.displayAvatarURL({ dynamic: true })
        });

    if (data.image) embed.setImage(data.image);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);

    return embed;
}

function buildLinkButtons(data) {
    const buttons = [];

    if (data.button1Label && data.button1Url) {
        buttons.push(
            new ButtonBuilder()
                .setLabel(data.button1Label)
                .setURL(data.button1Url)
                .setStyle(ButtonStyle.Link)
        );
    }

    if (data.button2Label && data.button2Url) {
        buttons.push(
            new ButtonBuilder()
                .setLabel(data.button2Label)
                .setURL(data.button2Url)
                .setStyle(ButtonStyle.Link)
        );
    }

    if (!buttons.length) return [];

    return [new ActionRowBuilder().addComponents(buttons)];
}

function buildConfirmButtons(embedId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`embed_confirm_${embedId}`)
            .setLabel('Send Embed')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`embed_cancel_${embedId}`)
            .setLabel('Cancel')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Secondary)
    );
}

module.exports = {
    name: 'embed',
    description: 'Create and preview a custom embed announcement.',
    usage: '/embed channel:#updates title:Update description:Message',
    category: 'admin',
    userPermissions: PermissionFlagsBits.Administrator,
    botPermissions: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks
    ],
    cooldown: 5,
    pendingEmbeds,

    slashData: new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create and preview a custom embed announcement')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The channel to send the embed in')
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName('title')
                .setDescription('Embed title')
                .setRequired(true)
                .setMaxLength(256)
        )

        .addStringOption(option =>
            option
                .setName('description')
                .setDescription('Embed description/message')
                .setRequired(true)
                .setMaxLength(4000)
        )

        .addStringOption(option =>
            option
                .setName('color')
                .setDescription('Hex color, example: #00bfff')
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName('image')
                .setDescription('Optional image URL')
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName('thumbnail')
                .setDescription('Optional thumbnail URL')
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName('footer')
                .setDescription('Optional footer text')
                .setRequired(false)
                .setMaxLength(2048)
        )

        .addStringOption(option =>
            option
                .setName('ping')
                .setDescription('Optional ping to include above the embed')
                .setRequired(false)
                .addChoices(
                    { name: 'No ping', value: 'none' },
                    { name: '@everyone', value: '@everyone' },
                    { name: '@here', value: '@here' }
                )
        )

        .addStringOption(option =>
            option
                .setName('button1_label')
                .setDescription('Optional first button label')
                .setRequired(false)
                .setMaxLength(80)
        )

        .addStringOption(option =>
            option
                .setName('button1_url')
                .setDescription('Optional first button URL')
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName('button2_label')
                .setDescription('Optional second button label')
                .setRequired(false)
                .setMaxLength(80)
        )

        .addStringOption(option =>
            option
                .setName('button2_url')
                .setDescription('Optional second button URL')
                .setRequired(false)
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, true);
        if (!deferred) return;

        const channel = interaction.options.getChannel('channel');

        const data = {
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            channelId: channel.id,
            title: interaction.options.getString('title'),
            description: interaction.options
                .getString('description')
                .replace(/\\n/g, '\n'),
            color: interaction.options.getString('color') || '#00bfff',
            image: interaction.options.getString('image'),
            thumbnail: interaction.options.getString('thumbnail'),
            footer: interaction.options.getString('footer'),
            ping: interaction.options.getString('ping') || 'none',
            button1Label: interaction.options.getString('button1_label'),
            button1Url: interaction.options.getString('button1_url'),
            button2Label: interaction.options.getString('button2_label'),
            button2Url: interaction.options.getString('button2_url'),
            createdAt: Date.now()
        };

        if (!isValidHex(data.color)) {
            return safeReply(interaction, {
                content: '❌ Invalid color. Please use a hex color like `#00bfff` or `00bfff`.'
            }, true);
        }

        if (!isValidImageUrl(data.image)) {
            return safeReply(interaction, {
                content: '❌ Invalid image URL. Please use a direct image link ending in `.png`, `.jpg`, `.jpeg`, `.gif`, or `.webp`.'
            }, true);
        }

        if (!isValidImageUrl(data.thumbnail)) {
            return safeReply(interaction, {
                content: '❌ Invalid thumbnail URL. Please use a direct image link ending in `.png`, `.jpg`, `.jpeg`, `.gif`, or `.webp`.'
            }, true);
        }

        if ((data.button1Label && !data.button1Url) || (!data.button1Label && data.button1Url)) {
            return safeReply(interaction, {
                content: '❌ Button 1 needs both a label and a URL.'
            }, true);
        }

        if ((data.button2Label && !data.button2Url) || (!data.button2Label && data.button2Url)) {
            return safeReply(interaction, {
                content: '❌ Button 2 needs both a label and a URL.'
            }, true);
        }

        if (!isValidUrl(data.button1Url) || !isValidUrl(data.button2Url)) {
            return safeReply(interaction, {
                content: '❌ Button URLs must be valid links.'
            }, true);
        }

        if (!channel.permissionsFor(interaction.guild.members.me).has([
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks
        ])) {
            return safeReply(interaction, {
                content: `❌ I do not have permission to send embeds in ${channel}.`
            }, true);
        }

        const embedId = `${interaction.user.id}_${Date.now()}`;
        pendingEmbeds.set(embedId, data);

        setTimeout(() => {
            pendingEmbeds.delete(embedId);
        }, 5 * 60 * 1000);

        const previewEmbed = buildEmbed(data, interaction);
        const linkRows = buildLinkButtons(data);
        const confirmRow = buildConfirmButtons(embedId);

        const previewText =
            `📢 **Embed Preview**\n` +
            `Target Channel: ${channel}\n` +
            `Ping: ${data.ping === 'none' ? 'No ping' : data.ping}\n\n` +
            `Press **Send Embed** to publish it, or **Cancel** to stop.`;

        return safeReply(interaction, {
            content: previewText,
            embeds: [previewEmbed],
            components: [...linkRows, confirmRow]
        }, true);
    },

    buildEmbed,
    buildLinkButtons
};