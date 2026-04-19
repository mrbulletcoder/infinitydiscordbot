const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const permissionNames = {
    [PermissionFlagsBits.Administrator]: 'Administrator',
    [PermissionFlagsBits.BanMembers]: 'Ban Members',
    [PermissionFlagsBits.KickMembers]: 'Kick Members',
    [PermissionFlagsBits.ManageMessages]: 'Manage Messages',
    [PermissionFlagsBits.ManageChannels]: 'Manage Channels',
    [PermissionFlagsBits.ModerateMembers]: 'Moderate Members',
    [PermissionFlagsBits.ManageGuild]: 'Manage Server',
    [PermissionFlagsBits.ManageRoles]: 'Manage Roles',
    [PermissionFlagsBits.ViewChannel]: 'View Channel',
    [PermissionFlagsBits.SendMessages]: 'Send Messages',
    [PermissionFlagsBits.EmbedLinks]: 'Embed Links',
    [PermissionFlagsBits.ReadMessageHistory]: 'Read Message History'
};

function formatPermission(permission) {
    if (Array.isArray(permission)) {
        return permission.map(p => permissionNames[p] || 'Required Permission').join(', ');
    }

    return permissionNames[permission] || 'Required Permission';
}

function buildErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#ff3b30')
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: 'Infinity Permission System' })
        .setTimestamp();
}

function buildNoPermissionEmbed(permission) {
    return buildErrorEmbed(
        '❌ You cannot use this command',
        `You need **${formatPermission(permission)}** to use this command.`
    );
}

function buildBotNoPermissionEmbed(permission) {
    return buildErrorEmbed(
        '❌ I am missing permissions',
        `I need **${formatPermission(permission)}** to run this command properly.`
    );
}

function buildHierarchyEmbed(reason) {
    return buildErrorEmbed('❌ Action blocked', reason);
}

function getRequiredUserPermissions(command) {
    return command?.userPermissions || null;
}

function getRequiredBotPermissions(command) {
    return command?.botPermissions || null;
}

function hasPermissions(member, permissions) {
    if (!permissions) return true;
    if (!member?.permissions) return false;
    return member.permissions.has(permissions);
}

async function safeReplyMessage(message, payload) {
    try {
        return await message.reply(payload);
    } catch (error) {
        console.error('Failed to send permission reply to message:', error);
        return null;
    }
}

async function safeReplyInteraction(interaction, payload) {
    try {
        if (interaction.replied || interaction.deferred) {
            return await interaction.followUp(payload);
        }

        return await interaction.reply(payload);
    } catch (error) {
        console.error('Failed to send permission reply to interaction:', error);
        return null;
    }
}

async function denyPrefix(message, permission) {
    return safeReplyMessage(message, {
        embeds: [buildNoPermissionEmbed(permission)]
    });
}

async function denySlash(interaction, permission) {
    return safeReplyInteraction(interaction, {
        embeds: [buildNoPermissionEmbed(permission)],
        ephemeral: true
    });
}

async function denyPrefixBot(message, permission) {
    return safeReplyMessage(message, {
        embeds: [buildBotNoPermissionEmbed(permission)]
    });
}

async function denySlashBot(interaction, permission) {
    return safeReplyInteraction(interaction, {
        embeds: [buildBotNoPermissionEmbed(permission)],
        ephemeral: true
    });
}

async function denyPrefixHierarchy(message, reason) {
    return safeReplyMessage(message, {
        embeds: [buildHierarchyEmbed(reason)]
    });
}

async function denySlashHierarchy(interaction, reason) {
    return safeReplyInteraction(interaction, {
        embeds: [buildHierarchyEmbed(reason)],
        ephemeral: true
    });
}

function getBotMember(guild) {
    return guild?.members?.me || null;
}

async function checkPrefixPermission(message, command) {
    const member = message.member;
    const botMember = getBotMember(message.guild);

    if (!member) {
        await safeReplyMessage(message, {
            content: '❌ Could not verify your member permissions.'
        });
        return false;
    }

    const requiredUserPermissions = getRequiredUserPermissions(command);
    if (!hasPermissions(member, requiredUserPermissions)) {
        await denyPrefix(message, requiredUserPermissions);
        return false;
    }

    const requiredBotPermissions = getRequiredBotPermissions(command);
    if (requiredBotPermissions && !hasPermissions(botMember, requiredBotPermissions)) {
        await denyPrefixBot(message, requiredBotPermissions);
        return false;
    }

    return true;
}

async function checkSlashPermission(interaction, command) {
    const member = interaction.member;
    const botMember = getBotMember(interaction.guild);

    if (!member) {
        await safeReplyInteraction(interaction, {
            content: '❌ Could not verify your member permissions.',
            ephemeral: true
        });
        return false;
    }

    const requiredUserPermissions = getRequiredUserPermissions(command);
    if (!hasPermissions(member, requiredUserPermissions)) {
        await denySlash(interaction, requiredUserPermissions);
        return false;
    }

    const requiredBotPermissions = getRequiredBotPermissions(command);
    if (requiredBotPermissions && !hasPermissions(botMember, requiredBotPermissions)) {
        await denySlashBot(interaction, requiredBotPermissions);
        return false;
    }

    return true;
}

function isHigherRole(actor, target) {
    if (!actor || !target) return false;
    if (!actor.roles?.highest || !target.roles?.highest) return false;
    return actor.roles.highest.position > target.roles.highest.position;
}

function canActOnTarget(actorMember, targetMember) {
    if (!actorMember || !targetMember) {
        return {
            ok: false,
            reason: '❌ Could not verify moderation hierarchy.'
        };
    }

    if (actorMember.id === targetMember.id) {
        return {
            ok: false,
            reason: '❌ You cannot target yourself.'
        };
    }

    if (targetMember.id === actorMember.guild.ownerId) {
        return {
            ok: false,
            reason: '❌ You cannot target the server owner.'
        };
    }

    if (actorMember.id === actorMember.guild.ownerId) {
        return { ok: true };
    }

    if (!isHigherRole(actorMember, targetMember)) {
        return {
            ok: false,
            reason: '❌ You cannot target a member with an equal or higher role than you.'
        };
    }

    return { ok: true };
}

function canBotActOnTarget(botMember, targetMember) {
    if (!botMember || !targetMember) {
        return {
            ok: false,
            reason: '❌ Could not verify bot hierarchy.'
        };
    }

    if (targetMember.id === botMember.guild.ownerId) {
        return {
            ok: false,
            reason: '❌ I cannot target the server owner.'
        };
    }

    if (!isHigherRole(botMember, targetMember)) {
        return {
            ok: false,
            reason: '❌ I cannot target this user because their top role is equal to or higher than mine.'
        };
    }

    return { ok: true };
}

async function checkPrefixHierarchy(message, targetMember) {
    const actorCheck = canActOnTarget(message.member, targetMember);
    if (!actorCheck.ok) {
        await denyPrefixHierarchy(message, actorCheck.reason);
        return false;
    }

    const botCheck = canBotActOnTarget(getBotMember(message.guild), targetMember);
    if (!botCheck.ok) {
        await denyPrefixHierarchy(message, botCheck.reason);
        return false;
    }

    return true;
}

async function checkSlashHierarchy(interaction, targetMember) {
    const actorCheck = canActOnTarget(interaction.member, targetMember);
    if (!actorCheck.ok) {
        await denySlashHierarchy(interaction, actorCheck.reason);
        return false;
    }

    const botCheck = canBotActOnTarget(getBotMember(interaction.guild), targetMember);
    if (!botCheck.ok) {
        await denySlashHierarchy(interaction, botCheck.reason);
        return false;
    }

    return true;
}

module.exports = {
    checkPrefixPermission,
    checkSlashPermission,
    checkPrefixHierarchy,
    checkSlashHierarchy,
    canActOnTarget,
    canBotActOnTarget
};