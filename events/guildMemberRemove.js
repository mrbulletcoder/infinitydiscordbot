const {
    AuditLogEvent,
    DANGER_COLOR,
    fetchAuditEntry,
    formatDuration,
    formatMember,
    formatUser,
    sendAdvancedLog,
    unix,
    block
} = require('../utils/advancedLogger');

module.exports = {
    name: 'guildMemberRemove',

    async execute(member) {
        try {
            const audit = await fetchAuditEntry(member.guild, AuditLogEvent.MemberKick, member.id, 10_000);
            const wasKicked = Boolean(audit?.executor);
            const joined = member.joinedTimestamp ? unix(member.joinedTimestamp) : null;
            const accountCreated = member.user?.createdTimestamp
                ? unix(member.user.createdTimestamp)
                : null;

            await sendAdvancedLog(member.guild, 'member', {
                color: wasKicked ? DANGER_COLOR : '#99aab5',
                title: wasKicked ? 'Member Kicked' : 'Member Left',
                description: wasKicked
                    ? 'A member was removed from the server by a moderator.'
                    : 'A member left the server.',
                thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 256 }),
                fields: [
                    {
                        name: '👤 Member',
                        value: formatMember(member),
                        inline: true
                    },
                    {
                        name: wasKicked ? '🛡️ Kicked By' : '🚪 Exit Type',
                        value: wasKicked ? formatUser(audit.executor) : '`Voluntary Leave`',
                        inline: true
                    },
                    {
                        name: '📋 Member Summary',
                        value: [
                            '```yaml',
                            `Action: ${wasKicked ? 'Member kicked' : 'Member left'}`,
                            `Time In Server: ${member.joinedTimestamp ? formatDuration(Date.now() - member.joinedTimestamp) : 'Unknown'}`,
                            '```'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '📅 Join / Account Info',
                        value:
                            `**Joined Server:** ${joined ? `<t:${joined}:F>\n<t:${joined}:R>` : 'Unknown'}\n` +
                            `**Account Created:** ${accountCreated ? `<t:${accountCreated}:F>\n<t:${accountCreated}:R>` : '`Unknown`'}`,
                        inline: false
                    },
                    ...(wasKicked ? [{
                        name: '📄 Reason',
                        value: audit?.reason ? `> ${audit.reason}` : '`No reason provided.`',
                        inline: false
                    }] : [])
                ]
            });
        } catch (error) {
            console.error('guildMemberRemove logging error:', error);
        }
    }
};
