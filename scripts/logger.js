import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { colorize, removeANSI, isFileURL } from './utils.js';

/**
 * The type of the log message
 * @typedef {'info' | 'success' | 'warning' | 'question' | 'error'} LogType
 */

/**
 * @typedef {Object} LoggerOptions
 *
 * @property {string} message The message to log. The {{0}}, {{1}}, {{2}}, etc. will be replaced with the arguments.
 * @property {LogType} [type = 'info'] The type of the log message
 * @property {string[]} [args = []] The arguments to replace in the message
 * @property {string?} [verboseContent = null] The content to log if the verbose option is enabled
 */

/**
 * The type of a generic logger function
 * @typedef {(message: string, ...args: unknown[]) => void} LoggerFunction
 */

class LoggerErrorHandler extends Error {
    /** @type {string} */
    message;

    /** @type {string} */
    verboseContent;

    /** @type {string[]} */
    args;

    /**
     * @param {string} message
     * @param {string?} [verboseContent]
     * @param {...unknown[]} [args]
     */
    constructor(message, verboseContent, ...args) {
        super(message);
        this.name = 'ReleaseError';
        this.message = message;
        this.verboseContent = verboseContent;
        this.args = args ?? [];
    }

    /**
     * Handles the error
     *
     * @param {string} errorMessage
     * @param {unknown?} [error = null]
     * @param {LoggerFunction?} [logger = null]
     */
    static handle(errorMessage, error = null, logger = null) {
        if (!logger) logger = (message, verboseContent, ...args) => Logger.__log({ message, verboseContent, args, type: 'error' });

        if (error instanceof LoggerErrorHandler) {
            logger(error.message, error.verboseContent, error.args);
        } else if (error instanceof Error) {
            logger(errorMessage, error.message);
        } else {
            logger(errorMessage, error);
        }

        console.log(`See ${Logger.__LOG_PATH} for more details.\n`);
        process.exit(1);
    }
}

/**
 * A simple, flexible, optionally verbose, and adorably colorful logger for the application
 *
 * @example
 * const log = Logger.create(import.meta.url);
 * log.info('Hello, world!'); // [INFO] Hello, world!
 * log.success('Hello, world!'); // [SUCCESS] Hello, world!
 * log.warning('Hello, world!'); // [WARNING] Hello, world!
 * log.question('Hello, world!'); // [QUESTION] Do you want to continue? (y/n)
 * log.error('Hello, world!'); // [ERROR] Hello, world!
 */
class Logger {
    /**
     * @private
     * @static
     * @type {string}
     */
    static __LOG_PATH;

    /**
     * @private
     * @static
     * @type {boolean}
     */
    static __VERBOSE;

    /**
     * Creates a new Logger instance
     *
     * @static
     * @param {string} appFilePathOrURL
     * @param {boolean} verbose
     * @returns {Logger}
     */
    static create(appFilePathOrURL, verbose) {
        if (isFileURL(appFilePathOrURL)) {
            appFilePathOrURL = fileURLToPath(appFilePathOrURL);
        }

        return new Logger(appFilePathOrURL, verbose);
    }

    /**
     * @private
     * @param {string} appFilePath
     * @param {boolean} verbose
     */
    constructor(appFilePath, verbose) {
        this.__setupLogPath(appFilePath);
        Logger.__VERBOSE = verbose;
    }

    /**
     * @readonly
     * @type {string}
     */
    get logPath() {
        return Logger.__LOG_PATH;
    }

    /**
     * @readonly
     * @type {boolean}
     */
    get verbose() {
        return Logger.__VERBOSE;
    }

    /**
     * @private
     * @param {string} appFilePath
     */
    __setupLogPath(appFilePath) {
        const scriptRootDir = path.dirname(appFilePath);
        const scriptName = appFilePath
            .split(/[\\/]/)
            .pop()
            .replace(/\.[^.]+$/, '');
        const date = new Date().toISOString();
        const formattedDate = date
            .slice(0, date.length - 5)
            .replace(/[:-]/g, '_')
            .replace('T', '-');
        const logPath = path.join(scriptRootDir, '.tmp', `${scriptName}-${formattedDate}.log`);
        const logDir = path.dirname(logPath);

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }

        Logger.__LOG_PATH = logPath;
    }

    /**
     * Logs a message to the console
     *
     * @private
     * @static
     * @param {LoggerOptions} options
     */
    static __log(options) {
        const show = (value) => {
            if (options.type !== 'question') console.log(value);
        };

        if (!options.type) options.type = 'info';
        if (!options.args) options.args = [];

        try {
            options.message = colorize('white', options.message);

            if (options.args.length > 0) {
                options.message = options.message.replace(/\{\{(\d+)\}\}/g, (_, p1) => colorize('blue', options.args[Number(p1)]));
            }

            switch (options.type) {
                case 'info':
                    options.message = colorize('cyan', '[INFO] ') + options.message;
                    break;
                case 'success':
                    options.message = colorize('green', '[SUCCESS] ') + options.message;
                    break;
                case 'warning':
                    options.message = colorize('yellow', '[WARNING] ') + options.message;
                    break;
                case 'question':
                    options.message = colorize('magenta', '[QUESTION] ') + options.message;
                    break;
                case 'error':
                    options.message = colorize('red', '[ERROR] ') + options.message;
            }

            show(options.message);

            if (options.verboseContent) {
                options.message += '\n' + colorize('white', options.verboseContent);

                if (Logger.__VERBOSE) show(options.verboseContent);
            }

            fs.appendFileSync(Logger.__LOG_PATH, removeANSI(options.message) + '\n\n');
        } catch (error) {
            throw new Error(`${colorize('red', '[ERROR]')} Failed to log message:\n${error.message}\n\n`);
        }
    }

    /**
     * Logs an info message
     *
     * @param {string} message
     * @param {string?} [verboseContent = null]
     * @param {string[]} [args = []]
     */
    info(message, verboseContent, ...args) {
        Logger.__log({ message, type: 'info', verboseContent, args });
    }

    /**
     * Logs a success message
     *
     * @param {string} message
     * @param {string?} [verboseContent = null]
     * @param {string[]} [args = []]
     */
    success(message, verboseContent, ...args) {
        Logger.__log({ message, type: 'success', verboseContent, args });
    }

    /**
     * Logs a warning message
     *
     * @param {string} message
     * @param {string?} [verboseContent = null]
     * @param {string[]} [args = []]
     */
    warning(message, verboseContent, ...args) {
        Logger.__log({ message, type: 'warning', verboseContent, args });
    }

    /**
     * Logs a question message
     *
     * @param {string} message
     * @param {string?} [verboseContent = null]
     * @param {string[]} [args = []]
     */
    question(message, verboseContent, ...args) {
        Logger.__log({ message, type: 'question', verboseContent, args });
    }

    /**
     * Logs an error message
     *
     * @param {string} message
     * @param {string?} [verboseContent = null]
     * @param {string[]} [args = []]
     */
    error(message, verboseContent, ...args) {
        Logger.__log({ message, type: 'error', verboseContent, args });
    }
}

export { Logger, LoggerErrorHandler };
