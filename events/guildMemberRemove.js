const {
    AuditLogEvent,
    DANGER_COLOR,
    fetchAuditEntry,
    formatDuration,
    formatMember,
    formatUser,
    sendAdvancedLog,
    unix
} = require('../utils/advancedLogger');

module.exports = {
    name: 'guildMemberRemove',

    async execute(member) {
        try {
            const audit = await fetchAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id, 10_000);
            const wasKicked = Boolean(audit?.executor);
            const joined = member.joinedTimestamp ? unix(member.joinedTimestamp) : null;
            const accountCreated = unix(member.user.createdTimestamp);

            await sendAdvancedLog(member.guild, 'member', {
                color: wasKicked ? DANGER_COLOR : '#99aab5',
                title: wasKicked ? 'Member Kicked' : 'Member Left',
                description: wasKicked
                    ? 'A member was removed from the server by a moderator.'
                    : 'A member left the server.',
                thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
                fields: [
                    { name: '👤 Member', value: formatMember(member), inline: true },
                    { name: wasKicked ? '🛡️ Kicked By' : '🚪 Exit Type', value: wasKicked ? formatUser(audit.executor) : 'Voluntary Leave', inline: true },
                    { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                    { name: '📅 Joined Server', value: joined ? `<t:${joined}:F>\n<t:${joined}:R>` : 'Unknown', inline: true },
                    { name: '⏳ Time In Server', value: member.joinedTimestamp ? formatDuration(Date.now() - member.joinedTimestamp) : 'Unknown', inline: true },
                    { name: '🗓️ Account Created', value: `<t:${accountCreated}:F>\n<t:${accountCreated}:R>`, inline: true }
                ]
            });
        } catch (error) {
            console.error('guildMemberRemove logging error:', error);
        }
    }
};
