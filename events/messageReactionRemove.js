const {
    getReactionEmojiKey,
    getReactionRoleMatch,
    checkReactionRoleCooldown,
    sendOrUpdateReactionRoleCooldownNotice
} = require('../utils/reactionRoles');

module.exports = {
    name: 'messageReactionRemove',

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
                await sendOrUpdateReactionRoleCooldownNotice(message.channel, user.id, cooldown.remainingMs);
                return;
            }

            const member = await message.guild.members.fetch(user.id).catch(() => null);
            if (!member) return;

            if (!message.guild.roles.cache.has(match.role_id)) return;

            if (member.roles.cache.has(match.role_id)) {
                await member.roles.remove(match.role_id, `Reaction role removed: ${match.category_name}`);
            }
        } catch (error) {
            console.error('Reaction role remove error:', error);
        }
    }
};