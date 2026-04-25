const {
    AuditLogEvent,
    DANGER_COLOR,
    EDIT_COLOR,
    SUCCESS_COLOR,
    WARNING_COLOR,
    fetchAuditEntry,
    findRecentCaseModerator,
    formatDuration,
    formatMember,
    formatUser,
    sendAdvancedLog,
    unix
} = require('../utils/advancedLogger');

function roleLines(ids) {
    return ids.length ? ids.map(id => `<@&${id}>`).join('\n') : 'None';
}

module.exports = {
    name: 'guildMemberUpdate',

    async execute(oldMember, newMember, client) {
        try {
            const guild = newMember.guild;
            const oldTimeout = oldMember.communicationDisabledUntilTimestamp || 0;
            const newTimeout = newMember.communicationDisabledUntilTimestamp || 0;

            if (oldTimeout !== newTimeout) {
                await new Promise(resolve => setTimeout(resolve, 1500));

                const caseMatch = await findRecentCaseModerator(
                    guild,
                    client,
                    newMember.id,
                    newTimeout ? ['timeout'] : ['untimeout', 'timeout removed'],
                    30
                );

                const audit = await fetchAuditEntry(guild, AuditLogEvent.MemberUpdate, newMember.id, 15_000);
                const executor = caseMatch?.user || audit?.executor || null;
                const reason = caseMatch?.reason || audit?.reason || 'No reason provided';

                await sendAdvancedLog(guild, 'member', {
                    color: newTimeout ? WARNING_COLOR : SUCCESS_COLOR,
                    title: newTimeout ? 'Member Timed Out' : 'Timeout Removed',
                    description: newTimeout
                        ? 'A member has been temporarily restricted from chatting.'
                        : 'A member timeout has been removed.',
                    thumbnail: newMember.user.displayAvatarURL({ dynamic: true, size: 256 }),
                    fields: [
                        { name: '👤 Member', value: formatMember(newMember), inline: true },
                        { name: '🛡️ Moderator', value: formatUser(executor, 'Unknown Moderator'), inline: true },
                        { name: '📁 Case', value: caseMatch?.caseNumber ? `\`#${caseMatch.caseNumber}\`` : '`No case linked`', inline: true },
                        {
                            name: '⏱️ Timeout Details',
                            value: newTimeout
                                ? `**Until:** <t:${unix(newTimeout)}:F>\n**Ends:** <t:${unix(newTimeout)}:R>\n**Duration Left:** ${formatDuration(newTimeout - Date.now())}`
                                : '**Status:** Removed',
                            inline: false
                        },
                        { name: '📄 Reason', value: `> ${reason}`, inline: false }
                    ]
                });

                return;
            }

            if (oldMember.nickname !== newMember.nickname) {
                const audit = await fetchAuditEntry(guild, AuditLogEvent.MemberUpdate, newMember.id);

                await sendAdvancedLog(guild, 'member', {
                    color: EDIT_COLOR,
                    title: 'Nickname Updated',
                    description: 'A member nickname was changed.',
                    thumbnail: newMember.user.displayAvatarURL({ dynamic: true, size: 256 }),
                    fields: [
                        { name: '👤 Member', value: formatMember(newMember), inline: true },
                        { name: '🛡️ Changed By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                        { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                        { name: 'Before', value: oldMember.nickname || oldMember.user.username, inline: true },
                        { name: 'After', value: newMember.nickname || newMember.user.username, inline: true }
                    ]
                });
            }

            const oldRoles = new Set(oldMember.roles.cache.keys());
            const newRoles = new Set(newMember.roles.cache.keys());
            const added = [...newRoles].filter(id => !oldRoles.has(id) && id !== guild.id);
            const removed = [...oldRoles].filter(id => !newRoles.has(id) && id !== guild.id);

            if (added.length || removed.length) {
                const audit = await fetchAuditEntry(guild, AuditLogEvent.MemberRoleUpdate, newMember.id);

                await sendAdvancedLog(guild, 'member', {
                    color: EDIT_COLOR,
                    title: 'Member Roles Updated',
                    description: 'A member had their roles changed.',
                    thumbnail: newMember.user.displayAvatarURL({ dynamic: true, size: 256 }),
                    fields: [
                        { name: '👤 Member', value: formatMember(newMember), inline: true },
                        { name: '🛡️ Changed By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                        { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                        ...(added.length ? [{ name: `➕ Roles Added (${added.length})`, value: roleLines(added), inline: false }] : []),
                        ...(removed.length ? [{ name: `➖ Roles Removed (${removed.length})`, value: roleLines(removed), inline: false }] : [])
                    ]
                });
            }
        } catch (error) {
            console.error('guildMemberUpdate logging error:', error);
        }
    }
};
