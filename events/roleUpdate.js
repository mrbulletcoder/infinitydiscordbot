const {
    AuditLogEvent,
    EDIT_COLOR,
    fetchAuditEntry,
    formatRole,
    formatUser,
    inlineCode,
    sendAdvancedLog,
    yesNo
} = require('../utils/advancedLogger');

function addChange(changes, label, before, after) {
    changes.push(`**${label}:** ${before} → ${after}`);
}

module.exports = {
    name: 'roleUpdate',

    async execute(oldRole, newRole) {
        try {
            const changes = [];

            if (oldRole.name !== newRole.name) addChange(changes, 'Name', inlineCode(oldRole.name), inlineCode(newRole.name));
            if (oldRole.hexColor !== newRole.hexColor) addChange(changes, 'Color', inlineCode(oldRole.hexColor), inlineCode(newRole.hexColor));
            if (oldRole.hoist !== newRole.hoist) addChange(changes, 'Display Separately', yesNo(oldRole.hoist), yesNo(newRole.hoist));
            if (oldRole.mentionable !== newRole.mentionable) addChange(changes, 'Mentionable', yesNo(oldRole.mentionable), yesNo(newRole.mentionable));
            if (oldRole.position !== newRole.position) addChange(changes, 'Position', inlineCode(oldRole.position), inlineCode(newRole.position));
            if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('**Permissions:** permissions were updated');

            if (!changes.length) return;

            const audit = await fetchAuditEntry(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);

            await sendAdvancedLog(newRole.guild, 'role', {
                color: EDIT_COLOR,
                title: 'Role Updated',
                description: 'A role setting was changed.',
                fields: [
                    { name: '🎭 Role', value: formatRole(newRole), inline: true },
                    { name: '🛡️ Updated By', value: formatUser(audit?.executor, 'Unknown Moderator'), inline: true },
                    { name: '📄 Reason', value: audit?.reason || 'No reason provided', inline: true },
                    { name: `📝 Changes (${changes.length})`, value: changes.join('\n'), inline: false }
                ]
            });
        } catch (error) {
            console.error('roleUpdate logging error:', error);
        }
    }
};
