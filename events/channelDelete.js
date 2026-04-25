const {
    AuditLogEvent,
    DANGER_COLOR,
    fetchAuditEntry,
    formatUser,
    inlineCode,
    sendAdvancedLog
} = require('../utils/advancedLogger');

function channelTypeName(channel) {
    return channel.type === 0 ? 'Text Channel'
        : channel.type === 2 ? 'Voice Channel'
        : channel.type === 4 ? 'Category'
        : channel.type === 5 ? 'Announcement Channel'
        : channel.type === 13 ? 'Stage Channel'
        : `Type ${channel.type}`;
}

module.exports = {
    name: 'channelDelete',

    async execute(channel) {
        try {
            if (!channel.guild) return;

            const audit = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id);

            await sendAdvancedLog(channel.guild, 'channel', {
                color: DANGER_COLOR,
                title: 'Channel Deleted',
                description: 'A channel was deleted from the server.',
                fields: [
                    { name: '📍 Channel Name', value: `**#${channel.name || 'unknown'}**\n${inlineCode(channel.id)}`, inline: true },
                    { name: '🛡️ Deleted By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                    { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                    { name: '📦 Type', value: inlineCode(channelTypeName(channel)), inline: true },
                    { name: '📁 Category', value: channel.parent ? `${channel.parent.name}\n\`${channel.parentId}\`` : 'None', inline: true },
                    { name: '🔢 Position', value: inlineCode(channel.position ?? 'Unknown'), inline: true }
                ]
            });
        } catch (error) {
            console.error('channelDelete logging error:', error);
        }
    }
};
