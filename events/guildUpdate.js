const {
    AuditLogEvent,
    EDIT_COLOR,
    block,
    fetchAuditEntry,
    inlineCode,
    sendAdvancedLog,
    formatUser,
    yesNo
} = require('../utils/advancedLogger');

function addChange(changes, label, before, after) {
    if (before === after) return;
    changes.push(`**${label}:** ${before} → ${after}`);
}

function safeText(value) {
    return value ? inlineCode(value) : '`None`';
}

module.exports = {
    name: 'guildUpdate',

    async execute(oldGuild, newGuild) {
        try {
            const changes = [];

            addChange(
                changes,
                'Server Name',
                safeText(oldGuild.name),
                safeText(newGuild.name)
            );

            if (oldGuild.icon !== newGuild.icon) {
                changes.push('**Server Icon:** Updated');
            }

            if (oldGuild.banner !== newGuild.banner) {
                changes.push('**Server Banner:** Updated');
            }

            if (oldGuild.splash !== newGuild.splash) {
                changes.push('**Server Splash:** Updated');
            }

            addChange(
                changes,
                'Description',
                oldGuild.description ? block(oldGuild.description) : '`None`',
                newGuild.description ? block(newGuild.description) : '`None`'
            );

            addChange(
                changes,
                'Verification Level',
                inlineCode(String(oldGuild.verificationLevel)),
                inlineCode(String(newGuild.verificationLevel))
            );

            addChange(
                changes,
                'Explicit Content Filter',
                inlineCode(String(oldGuild.explicitContentFilter)),
                inlineCode(String(newGuild.explicitContentFilter))
            );

            addChange(
                changes,
                'Default Notifications',
                inlineCode(String(oldGuild.defaultMessageNotifications)),
                inlineCode(String(newGuild.defaultMessageNotifications))
            );

            addChange(
                changes,
                'AFK Channel',
                oldGuild.afkChannelId ? `<#${oldGuild.afkChannelId}>` : '`None`',
                newGuild.afkChannelId ? `<#${newGuild.afkChannelId}>` : '`None`'
            );

            addChange(
                changes,
                'AFK Timeout',
                inlineCode(`${oldGuild.afkTimeout || 0}s`),
                inlineCode(`${newGuild.afkTimeout || 0}s`)
            );

            addChange(
                changes,
                'System Channel',
                oldGuild.systemChannelId ? `<#${oldGuild.systemChannelId}>` : '`None`',
                newGuild.systemChannelId ? `<#${newGuild.systemChannelId}>` : '`None`'
            );

            addChange(
                changes,
                'Rules Channel',
                oldGuild.rulesChannelId ? `<#${oldGuild.rulesChannelId}>` : '`None`',
                newGuild.rulesChannelId ? `<#${newGuild.rulesChannelId}>` : '`None`'
            );

            addChange(
                changes,
                'Public Updates Channel',
                oldGuild.publicUpdatesChannelId ? `<#${oldGuild.publicUpdatesChannelId}>` : '`None`',
                newGuild.publicUpdatesChannelId ? `<#${newGuild.publicUpdatesChannelId}>` : '`None`'
            );

            addChange(
                changes,
                'Widget Enabled',
                yesNo(oldGuild.widgetEnabled),
                yesNo(newGuild.widgetEnabled)
            );

            if (!changes.length) return;

            const audit = await fetchAuditEntry(
                newGuild,
                AuditLogEvent.GuildUpdate,
                newGuild.id,
                15_000
            );

            await sendAdvancedLog(newGuild, 'server', {
                color: EDIT_COLOR,
                title: 'Server Updated',
                description: 'A server setting was changed.',
                thumbnail: newGuild.iconURL({ dynamic: true, size: 256 }) || null,
                fields: [
                    {
                        name: '🌐 Server',
                        value: `**${newGuild.name || 'Unknown Server'}**\n\`${newGuild.id}\``,
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
                            ...changes.map(change => `+ ${change}`),
                            '```'
                        ].join('\n'),
                        inline: false
                    }
                ]
            });
        } catch (error) {
            console.error('guildUpdate logging error:', error);
        }
    }
};