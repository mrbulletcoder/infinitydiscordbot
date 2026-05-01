const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const { box, success } = require('../utils/consoleLogger');
require('dotenv').config({ quiet: true });

module.exports = async (client) => {
    const commands = [];
    const categoryCounts = {};

    let totalFiles = 0;
    let loadedCommands = 0;
    let skippedCommands = 0;

    const commandsPath = path.join(__dirname, '..', 'commands');

    if (!fs.existsSync(commandsPath)) {
        throw new Error(`Commands folder not found: ${commandsPath}`);
    }

    const commandFolders = fs.readdirSync(commandsPath).filter((entry) => {
        const fullPath = path.join(commandsPath, entry);
        return fs.statSync(fullPath).isDirectory();
    });

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs
            .readdirSync(folderPath)
            .filter((file) => file.endsWith('.js'));

        categoryCounts[folder] = 0;

        for (const file of commandFiles) {
            totalFiles++;

            try {
                const command = require(`../commands/${folder}/${file}`);

                if (!command || typeof command !== 'object') {
                    skippedCommands++;
                    continue;
                }

                if (!command.name || typeof command.name !== 'string') {
                    skippedCommands++;
                    continue;
                }

                const hasSlash = command.data || command.slashData;
                const hasPrefix = typeof command.executePrefix === 'function';
                const hasSlashExecute = typeof command.executeSlash === 'function';

                if (!hasPrefix && !hasSlashExecute) {
                    skippedCommands++;
                    continue;
                }

                if (client.commands.has(command.name)) {
                    skippedCommands++;
                    continue;
                }

                command.category = command.category || folder;
                client.commands.set(command.name, command);

                loadedCommands++;
                categoryCounts[folder]++;

                if (hasSlash) {
                    commands.push(hasSlash.toJSON());
                }
            } catch (error) {
                skippedCommands++;
                console.error(`❌ Failed to load command file "commands/${folder}/${file}":`, error);
            }
        }
    }

    if (!process.env.DISCORD_TOKEN) {
        throw new Error('Missing DISCORD_TOKEN in .env');
    }

    if (!process.env.CLIENT_ID) {
        throw new Error('Missing CLIENT_ID in .env');
    }

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
    );

    client.startupStats = client.startupStats || {};
    client.startupStats.commandFiles = totalFiles;
    client.startupStats.commandsLoaded = loadedCommands;
    client.startupStats.commandsSkipped = skippedCommands;
    client.startupStats.slashCommands = commands.length;
    client.startupStats.categories = commandFolders.length;

    box('⚡ COMMAND LOADER', [
        { label: 'Files Found', value: totalFiles },
        { label: 'Commands Loaded', value: loadedCommands },
        { label: 'Commands Skipped', value: skippedCommands },
        { label: 'Slash Commands', value: commands.length },
        { label: 'Categories', value: commandFolders.length },
        { label: 'Slash Status', value: 'Registered' }
    ]);

    success(`${commands.length} slash commands registered`);
};