const {
    AuditLogEvent,
    DANGER_COLOR,
    fetchAuditEntry,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    block
} = require('../utils/advancedLogger');

const { pool } = require('../database');

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

            await pool.query(
                `UPDATE tickets
     SET status = 'closed', closed_at = ?
     WHERE guild_id = ? AND channel_id = ? AND status = 'open'`,
                [
                    Date.now(),
                    channel.guild.id,
                    channel.id
                ]
            ).catch(error => {
                console.error('Failed to close deleted ticket channel in database:', error);
            });

            await new Promise(resolve => setTimeout(resolve, 1200));

            const audit = await fetchAuditEntry(channel.guild, AuditLogEvent.ChannelDelete, channel.id, 15_000);

            await sendAdvancedLog(channel.guild, 'channel', {
                color: DANGER_COLOR,
                title: 'Channel Deleted',
                description: 'A channel was deleted from the server.',
                fields: [
                    {
                        name: '📍 Channel',
                        value: `#${channel.name}\n\`${channel.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Deleted By',
                        value: formatUser(audit?.executor, 'Unknown Moderator'),
                        inline: true
                    },
                    {
                        name: '📋 Channel Info',
                        value: [
                            '```yaml',
                            'Action: Channel deleted',
                            `Type: ${channelTypeName(channel)}`,
                            `Category: ${channel.parent?.name || 'None'}`,
                            `Position: ${channel.position ?? 'Unknown'}`,
                            '```'
                        ].join('\n'),
                        inline: false
                    },
                ]
            });
        } catch (error) {
            console.error('channelDelete logging error:', error);
        }
    }
};
