const {
    AuditLogEvent,
    DANGER_COLOR,
    fetchAuditEntry,
    findRecentCaseModerator,
    formatUser,
    sendAdvancedLog
} = require('../utils/advancedLogger');

module.exports = {
    name: 'guildBanAdd',

    async execute(ban, client) {
        try {
            await new Promise(resolve => setTimeout(resolve, 1200));

            const caseMatch = await findRecentCaseModerator(ban.guild, client, ban.user.id, ['ban'], 30);
            const audit = await fetchAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id, 15_000);
            const executor = caseMatch?.user || audit?.executor || null;
            const reason = caseMatch?.reason || ban.reason || audit?.reason || 'No reason provided';

            await sendAdvancedLog(ban.guild, 'moderation', {
                color: DANGER_COLOR,
                title: 'Member Banned',
                description: 'A user has been banned from the server.',
                thumbnail: ban.user.displayAvatarURL({ dynamic: true, size: 256 }),
                fields: [
                    { name: '👤 User', value: formatUser(ban.user), inline: true },
                    { name: '🛡️ Banned By', value: formatUser(executor, 'Unknown Moderator'), inline: true },
                    { name: '📁 Case', value: caseMatch?.caseNumber ? `\`#${caseMatch.caseNumber}\`` : '`No case linked`', inline: true },
                    { name: '📄 Reason', value: `> ${reason}`, inline: false }
                ]
            });
        } catch (error) {
            console.error('guildBanAdd logging error:', error);
        }
    }
};
