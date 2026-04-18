const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const permissionNames = {
    [PermissionFlagsBits.Administrator]: 'Administrator',
    [PermissionFlagsBits.BanMembers]: 'Ban Members',
    [PermissionFlagsBits.KickMembers]: 'Kick Members',
    [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
    [PermissionFlagsBits.ManageChannels]: 'Manage Channels',
    [PermissionFlagsBits.ModerateMembers]: 'Moderate Members',
    [PermissionFlagsBits.ManageGuild]: 'Manage Server'
};

function formatPermission(permission) {
    return permissionNames[permission] || 'Required Permission';
}

function buildNoPermissionEmbed(permission) {
    return new EmbedBuilder()
        .setColor('#ff3b30')
        .setTitle('❌ You cannot use this command')
        .setDescription(`You need **${formatPermission(permission)}** to use this command.`)
        .setFooter({ text: 'Infinity Permission System' })
        .setTimestamp();
}

function hasCommandPermission(member, command) {
    if (!command?.userPermissions) return true;
    return member.permissions.has(command.userPermissions);
}

async function denyPrefix(message, permission) {
    return message.reply({
        embeds: [buildNoPermissionEmbed(permission)]
    });
}

async function denySlash(interaction, permission) {
    const payload = {
        embeds: [buildNoPermissionEmbed(permission)],
        ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload);
    }

    return interaction.reply(payload);
}

async function checkPrefixPermission(message, command) {
    if (hasCommandPermission(message.member, command)) return true;
    await denyPrefix(message, command.userPermissions);
    return false;
}

async function checkSlashPermission(interaction, command) {
    if (hasCommandPermission(interaction.member, command)) return true;
    await denySlash(interaction, command.userPermissions);
    return false;
}

module.exports = {
    checkPrefixPermission,
    checkSlashPermission
};