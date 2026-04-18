const {
    getReactionEmojiKey,
    getReactionRoleMatch,
    getCategoryRoleIds,
    checkReactionRoleCooldown,
    sendOrUpdateReactionRoleCooldownNotice
} = require('../utils/reactionRoles');

module.exports = {
    name: 'messageReactionAdd',

    async execute(reaction, user) {
        try {
            if (user.bot) return;

            if (reaction.partial) await reaction.fetch();
            if (reaction.message.partial) await reaction.message.fetch();

            const message = reaction.message;
            if (!message.guild) return;

            const emojiKey = getReactionEmojiKey(reaction);

            const match = await getReactionRoleMatch(
                message.guild.id,
                message.id,
                emojiKey
            );

            if (!match) return;

            const cooldown = checkReactionRoleCooldown(message.guild.id, user.id, 3, 10_000);
            if (!cooldown.allowed) {
                await reaction.users.remove(user.id).catch(() => null);
                await sendOrUpdateReactionRoleCooldownNotice(message.channel, user.id, cooldown.remainingMs);
                return;
            }

            const member = await message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            if (!message.guild.roles.cache.has(match.role_id)) return;

            if (match.category_mode === 'single') {
                const categoryRoleIds = await getCategoryRoleIds(match.category_id);
                const rolesToRemove = categoryRoleIds.filter(
                    roleId => roleId !== match.role_id && member.roles.cache.has(roleId)
                );

                if (rolesToRemove.length) {
                    await member.roles.remove(
                        rolesToRemove,
                        `Reaction role single-select cleanup: ${match.category_name}`
                    );
                }

                for (const [, cachedReaction] of message.reactions.cache) {
                    const cachedEmojiKey = getReactionEmojiKey(cachedReaction);

                    const cachedMatch = await getReactionRoleMatch(
                        message.guild.id,
                        message.id,
                        cachedEmojiKey
                    );

                    if (
                        cachedMatch &&
                        cachedMatch.category_id === match.category_id &&
                        cachedMatch.role_id !== match.role_id
                    ) {
                        await cachedReaction.users.remove(user.id).catch(() => null);
                    }
                }
            }

            if (!member.roles.cache.has(match.role_id)) {
                await member.roles.add(match.role_id, `Reaction role: ${match.category_name}`);
            }
        } catch (error) {
            console.error('Reaction role add error:', error);
        }
    }
};