const fs = require('fs');
const path = require('path');
const { box } = require('../utils/consoleLogger');
const { logError } = require('../utils/errorHandler');

module.exports = (client) => {
    const eventsPath = path.join(__dirname, '..', 'events');

    const eventFiles = fs.readdirSync(eventsPath)
        .filter(file => file.endsWith('.js'));

    const loadedEvents = [];
    const skippedEvents = [];
    const failedEvents = [];

    for (const file of eventFiles) {
        try {
            const event = require(`../events/${file}`);

            if (!event || !event.name || typeof event.execute !== 'function') {
                skippedEvents.push(file);
                continue;
            }

            const safeExecute = async (...args) => {
                try {
                    await event.execute(...args, client);
                } catch (error) {
                    const interaction = args.find(arg => arg?.guild && arg?.user);

                    logError('EVENT', error, {
                        event: event.name,
                        file,
                        guild: interaction?.guild
                            ? `${interaction.guild.name} (${interaction.guild.id})`
                            : 'Unknown',
                        channel: interaction?.channel
                            ? `${interaction.channel.name} (${interaction.channel.id})`
                            : 'Unknown',
                        user: interaction?.user
                            ? `${interaction.user.tag} (${interaction.user.id})`
                            : 'Unknown'
                    });
                }
            };

            if (event.once) {
                client.once(event.name, safeExecute);
            } else {
                client.on(event.name, safeExecute);
            }

            loadedEvents.push(event.name);
        } catch (error) {
            failedEvents.push(file);

            logError('EVENT LOAD', error, {
                file
            });
        }
    }

    client.startupStats = client.startupStats || {};
    client.startupStats.eventsLoaded = loadedEvents.length;
    client.startupStats.eventsSkipped = skippedEvents.length;
    client.startupStats.eventsFailed = failedEvents.length;

    box('📡 EVENT LOADER', [
        { label: 'Loaded Events', value: loadedEvents.length },
        { label: 'Skipped Events', value: skippedEvents.length },
        { label: 'Failed Events', value: failedEvents.length }
    ]);
};