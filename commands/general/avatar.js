const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

function getAvatarLinks(user, member) {
    const globalPng = user.displayAvatarURL({ extension: 'png', size: 4096 });
    const globalJpg = user.displayAvatarURL({ extension: 'jpg', size: 4096 });
    const globalWebp = user.displayAvatarURL({ extension: 'webp', size: 4096 });
    const globalGif = user.avatar && user.avatar.startsWith('a_')
        ? user.displayAvatarURL({ extension: 'gif', size: 4096 })
        : null;

    const serverPng = member?.avatarURL?.({ extension: 'png', size: 4096 }) || null;
    const serverJpg = member?.avatarURL?.({ extension: 'jpg', size: 4096 }) || null;
    const serverWebp = member?.avatarURL?.({ extension: 'webp', size: 4096 }) || null;
    const serverGif = member?.avatar && member.avatar.startsWith('a_')
        ? member.avatarURL({ extension: 'gif', size: 4096 })
        : null;

    return {
        global: { png: globalPng, jpg: globalJpg, webp: globalWebp, gif: globalGif },
        server: { png: serverPng, jpg: serverJpg, webp: serverWebp, gif: serverGif }
    };
}

function buildLinkSection(label, links) {
    const parts = [
        `[PNG](${links.png})`,
        `[JPG](${links.jpg})`,
        `[WEBP](${links.webp})`
    ];

    if (links.gif) {
        parts.push(`[GIF](${links.gif})`);
    }

    return `**${label}:** ${parts.join(' • ')}`;
}

module.exports = {
    name: 'avatar',
    description: 'View a user avatar in high quality.',
    usage: '!avatar [user] / /avatar [user]',
    category: 'general',

    slashData: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('View a user avatar in high quality')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user whose avatar you want to view')
                .setRequired(false)
        ),

    async executePrefix(message, args) {
        let targetUser = message.mentions.users.first();

        if (!targetUser && args[0]) {
            targetUser = await message.client.users.fetch(args[0]).catch(() => null);
        }

        targetUser ??= message.author;

        const member = await message.guild.members.fetch(targetUser.id).catch(() => null);

        return this.sendAvatar(message, targetUser, member);
    },

    async executeSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });
        
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        return this.sendAvatar(interaction, targetUser, member);
    },

    async sendAvatar(ctx, user, member) {
        const fetchedUser = await user.fetch(true).catch(() => user);
        const links = getAvatarLinks(fetchedUser, member);

        const hasServerAvatar = !!links.server.png;
        const mainImage = hasServerAvatar ? links.server.png : links.global.png;

        const downloadLines = [
            buildLinkSection('Global Avatar', links.global)
        ];

        if (hasServerAvatar) {
            downloadLines.push(buildLinkSection('Server Avatar', links.server));
        }

        const embed = new EmbedBuilder()
            .setColor('#00bfff')
            .setTitle('🖼️ Infinity Avatar Viewer')
            .setDescription(
                `High-resolution avatar preview for **${fetchedUser.tag}**.\n` +
                `${hasServerAvatar ? 'This user has a custom **server avatar** in this server.' : 'Showing their **global avatar**.'}`
            )
            .addFields(
                {
                    name: '👤 User',
                    value:
                        `**Tag:** ${fetchedUser.tag}\n` +
                        `**User ID:** \`${fetchedUser.id}\`\n` +
                        `**Avatar Type:** \`${hasServerAvatar ? 'Server Avatar' : 'Global Avatar'}\``,
                    inline: false
                },
                {
                    name: '🔗 Download Links',
                    value: downloadLines.join('\n\n'),
                    inline: false
                }
            )
            .setImage(mainImage)
            .setThumbnail(fetchedUser.displayAvatarURL({ size: 1024 }))
            .setFooter({ text: 'Infinity Bot • Avatar Intelligence ⚡' })
            .setTimestamp();

        return ctx.editReply({ embeds: [embed] });
    }
};