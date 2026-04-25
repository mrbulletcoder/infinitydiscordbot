const {
    AuditLogEvent,
    EDIT_COLOR,
    block,
    fetchAuditEntry,
    formatChannel,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    yesNo
} = require('../utils/advancedLogger');

function addChange(changes, label, before, after) {
    changes.push(`**${label}:** ${before} → ${after}`);
}

module.exports = {
    name: 'channelUpdate',

    async execute(oldChannel, newChannel) {
        try {
            if (!newChannel.guild) return;

            const changes = [];

            if (oldChannel.name !== newChannel.name) {
                addChange(changes, 'Name', inlineCode(oldChannel.name), inlineCode(newChannel.name));
            }

            if ((oldChannel.topic || '') !== (newChannel.topic || '')) {
                changes.push(`**Topic Changed**\nBefore: ${oldChannel.topic ? block(oldChannel.topic) : '*None*'}\nAfter: ${newChannel.topic ? block(newChannel.topic) : '*None*'}`);
            }

            if (oldChannel.parentId !== newChannel.parentId) {
                addChange(
                    changes,
                    'Category',
                    oldChannel.parentId ? `<#${oldChannel.parentId}>` : 'None',
                    newChannel.parentId ? `<#${newChannel.parentId}>` : 'None'
                );
            }

            if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
                addChange(changes, 'Slowmode', `${oldChannel.rateLimitPerUser || 0}s`, `${newChannel.rateLimitPerUser || 0}s`);
            }

            if (oldChannel.nsfw !== newChannel.nsfw) {
                addChange(changes, 'NSFW', yesNo(oldChannel.nsfw), yesNo(newChannel.nsfw));
            }

            if (oldChannel.position !== newChannel.position) {
                addChange(changes, 'Position', inlineCode(oldChannel.position), inlineCode(newChannel.position));
            }

            if (!changes.length) return;

            const audit = await fetchAuditEntry(newChannel.guild, AuditLogEvent.ChannelUpdate, newChannel.id);

            await sendAdvancedLog(newChannel.guild, 'channel', {
                color: EDIT_COLOR,
                title: 'Channel Updated',
                description: 'A channel setting was changed.',
                fields: [
                    { name: '📍 Channel', value: formatChannel(newChannel), inline: true },
                    { name: '🛡️ Updated By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                    { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                    { name: `📝 Changes (${changes.length})`, value: changes.join('\n'), inline: false }
                ]
            });
        } catch (error) {
            console.error('channelUpdate logging error:', error);
        }
    }
};
