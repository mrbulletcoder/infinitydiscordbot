const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

const { safeReply, safeDefer } = require('../../handlers/interactions/safeReply');

const logAction = require('../../utils/logAction');

module.exports = {
    name: 'role',
    description: 'Add or remove a role from a member.',
    usage: '/role <add|remove>',
    userPermissions: PermissionFlagsBits.ManageRoles,
    botPermissions: [
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.EmbedLinks
    ],

    // No cooldown because admins may need to use this often.
    cooldown: 0,

    slashData: new SlashCommandBuilder()
        .setName('role')
        .setDescription('Add or remove a role from a member')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a role to a member')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to give the role to')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to add')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a role from a member')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('The user to remove the role from')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option
                        .setName('role')
                        .setDescription('The role to remove')
                        .setRequired(true)
                )
        ),

    async executeSlash(interaction) {
        const deferred = await safeDefer(interaction, false);
        if (!deferred) return;

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user', true);
        const role = interaction.options.getRole('role', true);
        const reason = `Role ${subcommand} command used by ${interaction.user.tag}`;
        const guild = interaction.guild;
        const moderator = interaction.member;
        const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        if (targetUser.id === interaction.user.id) {
            return safeReply(interaction, {
                content: '❌ You cannot use this command on yourself.'
            }, true);
        }

        if (targetUser.id === interaction.client.user.id) {
            return safeReply(interaction, {
                content: '❌ You cannot manage Infinity’s roles.'
            }, true);
        }

        if (!targetMember) {
            return safeReply(interaction, {
                content: '❌ I could not find that member in this server.'
            }, true);
        }

        if (role.managed) {
            return safeReply(interaction, {
                content: '❌ I cannot manage that role because it is managed by an integration or bot.'
            }, true);
        }

        if (role.id === guild.id) {
            return safeReply(interaction, {
                content: '❌ You cannot add or remove the @everyone role.'
            }, true);
        }

        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return safeReply(interaction, {
                content: '❌ I need the **Manage Roles** permission to do this.'
            }, true);
        }

        if (role.position >= botMember.roles.highest.position) {
            return safeReply(interaction, {
                content: '❌ I cannot manage that role because it is higher than or equal to my highest role.'
            }, true);
        }

        if (
            interaction.user.id !== guild.ownerId &&
            role.position >= moderator.roles.highest.position
        ) {
            return safeReply(interaction, {
                content: '❌ You cannot manage a role that is higher than or equal to your highest role.'
            }, true);
        }

        const isAdd = subcommand === 'add';
        const alreadyHasRole = targetMember.roles.cache.has(role.id);

        if (isAdd && alreadyHasRole) {
            return safeReply(interaction, {
                content: `❌ ${targetMember} already has the ${role} role.`
            }, true);
        }

        if (!isAdd && !alreadyHasRole) {
            return safeReply(interaction, {
                content: `❌ ${targetMember} does not have the ${role} role.`
            }, true);
        }

        try {
            if (isAdd) {
                await targetMember.roles.add(role, reason);
            } else {
                await targetMember.roles.remove(role, reason);
            }

            await logAction({
                client: interaction.client,
                guild,
                action: isAdd ? '🏷️ Role Added' : '🗑️ Role Removed',
                user: targetMember.user,
                moderator: interaction.user,
                reason: `${interaction.user.tag} ${isAdd ? 'added' : 'removed'} ${role.name} ${isAdd ? 'to' : 'from'} ${targetMember.user.tag}`,
                color: isAdd ? '#57f287' : '#ff4d4d',
                extra:
                    `Role: ${role.name} (${role.id})\n` +
                    `Member: ${targetMember.user.tag} (${targetMember.id})`,
                createCase: false
            }).catch(error => {
                console.error('Role command logAction error:', error);
            });

            const embed = new EmbedBuilder()
                .setColor(isAdd ? '#57f287' : '#ff4d4d')
                .setAuthor({
                    name: isAdd ? '✅ Role Added' : '✅ Role Removed',
                    iconURL: guild.iconURL({ dynamic: true }) || undefined
                })
                .setThumbnail(
                    targetMember.user.displayAvatarURL({
                        dynamic: true,
                        size: 256
                    })
                )
                .setDescription(
                    isAdd
                        ? `${role} has been added to ${targetMember}.`
                        : `${role} has been removed from ${targetMember}.`
                )
                .addFields(
                    {
                        name: '👤 Member',
                        value: `${targetMember.user.tag}\n\`${targetMember.id}\``,
                        inline: true
                    },
                    {
                        name: '🏷️ Role',
                        value: `${role}\n\`${role.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Moderator',
                        value: `${interaction.user.tag}\n\`${interaction.user.id}\``,
                        inline: true
                    },
                )
                .setFooter({ text: 'Infinity Bot • Role Management ⚡' })
                .setTimestamp();

            return safeReply(interaction, {
                embeds: [embed]
            });

        } catch (error) {
            console.error('Role command error:', error);

            return safeReply(interaction, {
                content: '❌ Failed to update the member role. Check my role position and permissions.'
            }, true);
        }
    }
};