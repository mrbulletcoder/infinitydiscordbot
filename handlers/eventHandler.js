const fs = require('fs');
const path = require('path');

module.exports = (client) => {
    const eventsPath = path.join(__dirname, '..', 'events');

    const eventFiles = fs.readdirSync(eventsPath)
        .filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        try {
            const event = require(`../events/${file}`);

            if (!event || !event.name || typeof event.execute !== 'function') {
                console.warn(`⚠️ Skipping invalid event file: ${file}`);
                continue;
            }

            const safeExecute = async (...args) => {
                try {
                    await event.execute(...args, client);
                } catch (error) {
                    console.error(`❌ Error in event "${event.name}" (${file}):`, error);
                }
            };

            if (event.once) {
                client.once(event.name, safeExecute);
            } else {
                client.on(event.name, safeExecute);
            }

            console.log(`✅ Loaded event: ${event.name} (${file})`);
        } catch (error) {
            console.error(`❌ Failed to load event file "${file}":`, error);
        }
    }
};