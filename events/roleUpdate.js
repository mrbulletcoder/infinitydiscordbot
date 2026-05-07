const {
    AuditLogEvent,
    EDIT_COLOR,
    fetchAuditEntry,
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

            if (oldRole.name !== newRole.name) {
                addChange(changes, 'Name', inlineCode(oldRole.name), inlineCode(newRole.name));
            }

            if (oldRole.hexColor !== newRole.hexColor) {
                addChange(changes, 'Color', inlineCode(oldRole.hexColor), inlineCode(newRole.hexColor));
            }

            if (oldRole.hoist !== newRole.hoist) {
                addChange(changes, 'Display Separately', yesNo(oldRole.hoist), yesNo(newRole.hoist));
            }

            if (oldRole.mentionable !== newRole.mentionable) {
                addChange(changes, 'Mentionable', yesNo(oldRole.mentionable), yesNo(newRole.mentionable));
            }

            // Ignore role position changes.
            // Discord fires multiple noisy roleUpdate events when roles are dragged,
            // and audit logs are unreliable for these updates.

            if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
                changes.push('**Permissions:** permissions were updated');
            }

            if (!changes.length) return;

            await new Promise(resolve => setTimeout(resolve, 1200));

            const audit = await fetchAuditEntry(
                newRole.guild,
                AuditLogEvent.RoleUpdate,
                newRole.id,
                15_000
            );

            await sendAdvancedLog(newRole.guild, 'role', {
                color: EDIT_COLOR,
                title: 'Role Updated',
                description: 'A role setting was changed.',
                fields: [
                    {
                        name: '🎭 Role',
                        value: `**${newRole.name || oldRole.name || 'Unknown Role'}**\n\`${newRole.id}\``,
                        inline: true
                    },
                    {
                        name: '🛡️ Updated By',
                        value: formatUser(audit?.executor, 'Unknown Moderator'),
                        inline: true
                    },
                    {
                        name: '📋 What Changed',
                        value: [
                            '```diff',
                            ...changes.map(c => `+ ${c}`),
                            '```'
                        ].join('\n'),
                        inline: false
                    }
                ]
            });
        } catch (error) {
            console.error('roleUpdate logging error:', error);
        }
    }
};