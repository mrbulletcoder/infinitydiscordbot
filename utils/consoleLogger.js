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

function color(code, text) {
    return `${code}${text}${colors.reset}`;
}

function stripAnsi(text) {
    return String(text).replace(/\x1b\[[0-9;]*m/g, '');
}

function visibleLength(text) {
    return stripAnsi(String(text)).replace(/[^\x00-\x7F]/g, '').length;
}

function pad(text, length) {
    const extra = length - visibleLength(text);
    return String(text) + ' '.repeat(Math.max(extra, 0));
}

function trim(text, maxLength) {
    const value = String(text);
    if (visibleLength(value) <= maxLength) return value;
    return stripAnsi(value).slice(0, maxLength - 3) + '...';
}

function box(title, rows = []) {
    const width = 56;

    console.log(color(colors.brightCyan, '\n╔' + '═'.repeat(width) + '╗'));
    console.log(
        color(colors.brightCyan, '║') +
        color(colors.brightMagenta + colors.bold, pad(` ${title}`, width)) +
        color(colors.brightCyan, '║')
    );
    console.log(color(colors.brightCyan, '╠' + '═'.repeat(width) + '╣'));

    for (const row of rows) {
        const label = pad(row.label, 18);
        const value = trim(row.value, 32);

        console.log(
            color(colors.brightCyan, '║ ') +
            color(colors.brightBlue, label) +
            color(colors.gray, '• ') +
            color(row.color || colors.white, pad(value, 34)) +
            color(colors.brightCyan, '║')
        );
    }

    console.log(color(colors.brightCyan, '╚' + '═'.repeat(width) + '╝'));
}

function success(message) {
    console.log(`${color(colors.brightGreen, '✓')} ${color(colors.white, message)}`);
}

function error(message) {
    console.log(`${color(colors.red, '✗')} ${color(colors.white, message)}`);
}

function warn(message) {
    console.log(`${color(colors.yellow, '⚠')} ${color(colors.white, message)}`);
}

function info(message) {
    console.log(`${color(colors.brightBlue, '›')} ${color(colors.white, message)}`);
}

module.exports = {
    colors,
    color,
    pad,
    trim,
    box,
    success,
    error,
    warn,
    info
};