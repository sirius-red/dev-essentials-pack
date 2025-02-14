import createPrompt from 'prompt-sync';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const prompt = createPrompt({ sigint: true });

/**
 * The type of the color
 * @typedef {'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white'} Color
 */

/**
 * The type of a generic logger function
 * @typedef {import('./logger.js').LoggerFunction} LoggerFunction
 */

/**
 * Colorizes the text with the given color
 *
 * @param {Color} color
 * @param {string} text
 * @returns {string}
 */
function colorize(color, text) {
    switch (color) {
        case 'red':
            return `\x1b[31m${text}\x1b[0m`;
        case 'green':
            return `\x1b[32m${text}\x1b[0m`;
        case 'yellow':
            return `\x1b[33m${text}\x1b[0m`;
        case 'blue':
            return `\x1b[34m${text}\x1b[0m`;
        case 'magenta':
            return `\x1b[35m${text}\x1b[0m`;
        case 'cyan':
            return `\x1b[36m${text}\x1b[0m`;
        case 'white':
            return `\x1b[37m${text}\x1b[0m`;
        default:
            throw new Error(`Invalid color: ${color}`);
    }
}

/**
 * Confirms the user's action
 *
 * @param {string} message The message to confirm
 * @param {LoggerFunction?} [logger = null] The logger function to use. If not provided, a new logger will be created
 * @returns {boolean} True if the user confirms, false otherwise
 */
function confirm(message, logger = null) {
    if (!logger) logger = (message, verboseContent, ...args) => Logger.__log({ message, verboseContent, args, type: 'question' });

    message = `${message} (${colorize('green', 'y')}/${colorize('red', 'n')}): `;
    const answer = prompt(colorize('magenta', '[QUESTION] ') + message);

    logger(message + answer);

    return answer.charAt(0).toLowerCase() === 'y';
}

/**
 * Checks if the script is the main module
 *
 * @param {string} url - The URL of the script
 * @returns {boolean} True if the script is the main module, false otherwise
 */
function isMainModule(url) {
    return fileURLToPath(url) === process.argv[1];
}

/**
 * Checks if the given path is a file URL
 *
 * @param {string} filePathOrURL
 * @returns {boolean} True if the path is a file URL, false otherwise
 */
function isFileURL(filePathOrURL) {
    return /^file:[\/\/]+/.test(filePathOrURL);
}

/**
 * Removes ANSI codes from the text
 *
 * @param {string} text
 * @returns {string}
 */
function removeANSI(text) {
    return text.replace(/\x1b\[\d+m|\x1b\[0m/g, '');
}

export { colorize, confirm, isMainModule, isFileURL, removeANSI };
