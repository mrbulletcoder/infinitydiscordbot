const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
require('dotenv').config({ quiet: true });

module.exports = async (client) => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const colors = {
        reset: '\x1b[0m',
        bold: '\x1b[1m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        gray: '\x1b[90m',
        brightBlue: '\x1b[94m',
        brightCyan: '\x1b[96m',
        brightMagenta: '\x1b[95m',
        brightGreen: '\x1b[92m',
    };

    const color = (code, text) => `${code}${text}${colors.reset}`;

    const commands = [];
    const categoryCounts = {};
    let totalFiles = 0;

    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFolders = fs.readdirSync(commandsPath);

    console.log('');
    await cinematicLoader(colors, color, sleep, 'Scanning command folders');

    for (const folder of commandFolders) {
        const folderPath = path.join(commandsPath, folder);
        const commandFiles = fs
            .readdirSync(folderPath)
            .filter((file) => file.endsWith('.js'));

        categoryCounts[folder] = 0;

        for (const file of commandFiles) {
            const command = require(`../commands/${folder}/${file}`);

            command.category = command.category || folder;
            client.commands.set(command.name, command);

            totalFiles++;
            categoryCounts[folder]++;

            const slashBuilder = command.data || command.slashData;
            if (slashBuilder) {
                commands.push(slashBuilder.toJSON());
            }
        }
    }

    console.log('');
    console.log(color(colors.brightCyan, '╔════════════════════════════════════════════════════════════════════╗'));
    console.log(
        `${color(colors.brightCyan, '║')} ${color(colors.brightBlue + colors.bold, 'SLASH COMMAND REGISTRATION')}${' '.repeat(35)}${color(colors.brightCyan, '║')}`
    );
    console.log(color(colors.brightCyan, '╚════════════════════════════════════════════════════════════════════╝'));
    console.log('');

    printStatLine(colors, color, 'Files', String(totalFiles), 14);
    printStatLine(colors, color, 'Slash', String(commands.length), 14);
    printStatLine(colors, color, 'Categories', String(commandFolders.length), 14);

    console.log('');
    printCategoryHeader(colors, color);

    for (const [category, count] of Object.entries(categoryCounts)) {
        printCategoryLine(colors, color, category, count);
        await sleep(40);
    }

    console.log('');

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        await cinematicLoader(colors, color, sleep, 'Registering slash commands');
        await bootBar(colors, color, sleep);

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );

        console.log('');
        console.log(color(colors.gray, '────────────────────────────────────────────────────────────'));
        console.log(`${color(colors.brightGreen, '✓')} ${color(colors.white, `${commands.length} slash commands loaded`)}`);
        console.log(color(colors.gray, '────────────────────────────────────────────────────────────'));
        console.log('');
    } catch (error) {
        console.log('');
        console.log(color(colors.gray, '────────────────────────────────────────────────────────────'));
        console.log(`${color(colors.red, '✗')} ${color(colors.white, 'Slash command registration failed')}`);
        console.log(color(colors.gray, '────────────────────────────────────────────────────────────'));
        console.error(error);
        console.log('');
    }
};

async function cinematicLoader(colors, color, sleep, text) {
    process.stdout.write(`${color(colors.brightBlue, '➤')} ${color(colors.white, text)}`);
    for (let i = 0; i < 3; i++) {
        await sleep(220);
        process.stdout.write(color(colors.gray, '.'));
    }
    process.stdout.write('\n');
}

async function bootBar(colors, color, sleep) {
    const total = 24;
    process.stdout.write(`${color(colors.brightCyan, 'Deploying')} `);

    for (let i = 0; i <= total; i++) {
        const filled = '█'.repeat(i);
        const empty = '░'.repeat(total - i);
        const percent = String(Math.floor((i / total) * 100)).padStart(3, ' ');
        process.stdout.write(`\r${color(colors.brightCyan, 'Deploying')} ${color(colors.brightGreen, filled)}${color(colors.gray, empty)} ${color(colors.white, percent + '%')}`);
        await sleep(35);
    }

    process.stdout.write('\n');
}

function printStatLine(colors, color, label, value, pad = 14) {
    const left = label.padEnd(pad, ' ');
    console.log(`${color(colors.brightBlue, '•')} ${color(colors.white, left)} ${color(colors.gray, '→')} ${color(colors.brightGreen, value)}`);
}

function printCategoryHeader(colors, color) {
    console.log(color(colors.brightMagenta, 'Category Breakdown'));
    console.log(color(colors.gray, '────────────────────────────────────────────────────────────'));
}

function printCategoryLine(colors, color, category, count) {
    const formatted = category.charAt(0).toUpperCase() + category.slice(1);
    console.log(`${color(colors.brightCyan, '◦')} ${color(colors.white, formatted.padEnd(18, ' '))} ${color(colors.gray, '→')} ${color(colors.brightGreen, String(count))}`);
}