import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { colorize, confirm, isMainModule, removeANSI } from './utils.js';
import { Logger, LoggerErrorHandler } from './logger.js';

const { logPath: LOG_PATH, error, info, success, warning, question } = Logger.create(import.meta.url);

/**
 * An object containing the project metadata used by the script
 * @typedef {{
 *     extensionFiles: string[],
 *     packageJsonPath: string,
 *     packageJson: Object,
 *     currentVersion: string,
 *     updatedVersion: string,
 *     currentExtensions: string[],
 *     updatedExtensions: string[],
 *     message: string
 * }} ExtensionPackData
 */

/**
 * Lists all files and directories in a directory recursively
 *
 * @param {string} dir - The directory to list
 * @param {string[]} [ignore = []] - The list of files and directories to ignore
 * @returns {string[]} The list of files and directories
 */
function listProjectDir(dir, ignore = []) {
    try {
        const list = [];

        for (const item of fs.readdirSync(dir)) {
            if (ignore.includes(item)) continue;
            if (fs.statSync(path.join(dir, item)).isDirectory()) list.push(...listProjectDir(path.join(dir, item), ignore));
            else list.push(path.join(dir, item));
        }

        return list;
    } catch (error) {
        throw new LoggerErrorHandler('Failed to list directory', error.message);
    }
}

/**
 * Gets the project files
 *
 * @param {string[]} extensionFiles - The paths to the extension files
 * @returns {string[]} The list of project files
 */
function getProjectFiles(extensionFiles) {
    try {
        let ignore = ['.git'];
        if (fs.existsSync(path.join(process.cwd(), '.gitignore'))) {
            ignore = [...ignore, ...fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf8').split('\n')];
        }
        return listProjectDir(process.cwd(), ignore)
            .filter((file) => !extensionFiles.some((ext) => path.resolve(file).endsWith(path.resolve(ext))))
            .map((file) => path.relative(process.cwd(), file));
    } catch (error) {
        throw new LoggerErrorHandler('Failed to get project files', error.message);
    }
}

/**
 * Reads and returns the contents of a JSON file
 *
 * @param {string} filePath - Path to the file
 * @returns {Object} Parsed JSON file content
 */
function readJsonFile(filePath) {
    try {
        const content = fs
            .readFileSync(filePath, 'utf8')
            .split('\n')
            .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'))
            .join('\n');
        const json = JSON.parse(content);
        return json;
    } catch (err) {
        throw new LoggerErrorHandler(`Failed to read file: ${filePath}`, err.message);
    }
}

/**
 * Merges current extensions with new recommendations
 *
 * @param {string[]} currentExtensions - Current list of extensions
 * @param {string[]} newExtensions - List of new recommended extensions
 * @returns {string[]} Merged list of extensions
 */
function mergeExtensions(currentExtensions, newExtensions) {
    try {
        return [
            ...currentExtensions.filter((ext) => newExtensions.includes(ext)),
            ...newExtensions.filter((ext) => !currentExtensions.includes(ext))
        ].sort();
    } catch (err) {
        throw new LoggerErrorHandler('Failed to merge extensions', err.message);
    }
}

/**
 * Shows the diff between the current and updated extensions
 *
 * @param {string[]} currentExtensions - Current list of extensions
 * @param {string[]} updatedExtensions - Updated list of extensions
 * @returns {string} The diff message
 */
function getCommitMessageByExtensionListChanges(currentExtensions, updatedExtensions) {
    let message = '';
    const list = [];

    try {
        for (const ext of currentExtensions) {
            if (updatedExtensions.includes(ext)) list.push(ext + '|keep');
            else list.push(ext + '|remove');
        }

        for (const ext of updatedExtensions) {
            if (!currentExtensions.includes(ext)) list.push(ext + '|add');
        }

        if (list.filter((ext) => !ext.endsWith('|keep')).length === 0) return message;

        message += 'feat(extension): Updates to v{{version}}\n\nNew extension list:\n';

        for (const ext of list.sort()) {
            const [name, action] = ext.split('|');

            switch (action) {
                case 'keep':
                    message += colorize('white', `  • ${name}\n`);
                    break;
                case 'remove':
                    message += colorize('red', `  - ${name}\n`);
                    break;
                case 'add':
                    message += colorize('green', `  + ${name}\n`);
                    break;
            }
        }

        return message;
    } catch (err) {
        throw new LoggerErrorHandler('Failed to get commit message', err.message);
    }
}

/**
 * Increases the version of the package
 *
 * @param {string} version - The current version of the package
 * @param {'major' | 'minor' | 'patch'} type - The type of version to increase
 * @returns {string} The increased version
 */
function increaseVersion(version, type) {
    const [major, minor, patch] = version.split('.').map(Number);

    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
            return `${major}.${minor}.${patch + 1}`;
        default:
            return version;
    }
}

/**
 * Bumps the version of the package
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 */
function bumpVersion(data) {
    const lines = removeANSI(data.message).split('\n') ?? [];
    let versionType = 'patch';

    if (lines.some((l) => l.trim().startsWith('-'))) versionType = 'major';
    else if (lines.some((l) => l.trim().startsWith('+'))) versionType = 'minor';

    try {
        data.updatedVersion = increaseVersion(data.currentVersion, versionType);
    } catch (err) {
        throw new LoggerErrorHandler('Failed to bump version', err.message);
    }
}

function execGitCommand(command) {
    try {
        return execSync(command, { encoding: 'utf-8' });
    } catch (error) {
        throw new LoggerErrorHandler('Git command failed', `Command: ${command}\nError: ${error.message}`);
    }
}

/**
 * Adds additional info to the message
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 */
function addAdditionalInfoToMessage(data) {
    execGitCommand(`git add ${data.extensionFiles.join(' ')}`);

    const stagedFiles = getStagedFiles();
    const hasMessage = data.message.trim() !== '';

    if (stagedFiles.filter((f) => (hasMessage ? !f.includes('package.json') : true)).length > 0) {
        if (hasMessage) data.message += '\n\n';
        else data.message = 'feat(extension): Updates to v{{version}}\n\n';

        data.message += getCommitMessageByStagedFiles(stagedFiles, 'Extension files updated:');
    }

    execGitCommand('git restore --staged .');
}

/**
 * Gets the staged files
 *
 * @returns {string[]} The staged files
 */
function getStagedFiles() {
    return (
        execGitCommand(`git diff --name-only --cached .`)
            .toString()
            .split('\n')
            .filter((file) => file.trim() !== '') ?? []
    );
}

/**
 * Gets the commit message by the staged files
 *
 * @param {string[]} stagedFiles - The list of staged files
 * @param {string} title - The title of the commit message
 * @returns {string} The commit message
 */
function getCommitMessageByStagedFiles(stagedFiles, title) {
    const message = stagedFiles.length > 0 ? title + '\n\n- ' + stagedFiles.join('\n- ') + '\n' : '';
    return message.replace(/"/g, '\\"');
}

/**
 * Gets the data of the extension pack
 *
 * @param {string[]} extensionFiles - The paths to the extension files
 * @returns {ExtensionPackData} The data of the extension pack
 */
function getExtensionPackData(extensionFiles) {
    try {
        const packageJsonPath = path.join(process.cwd(), 'package.json');
        const extensionsJsonPath = path.join(process.cwd(), '.vscode', 'extensions.json');

        const packageJson = readJsonFile(packageJsonPath);
        const extensions = readJsonFile(extensionsJsonPath);

        const currentVersion = packageJson.version;
        const currentExtensions = packageJson.extensionPack;
        const newExtensions = extensions.recommendations;
        const updatedExtensions = mergeExtensions(currentExtensions, newExtensions);
        let message = getCommitMessageByExtensionListChanges(currentExtensions, updatedExtensions);

        const data = {
            extensionFiles,
            packageJsonPath,
            packageJson,
            currentVersion,
            currentExtensions,
            updatedExtensions,
            message
        };

        bumpVersion(data);
        addAdditionalInfoToMessage(data);
        data.message = data.message.replace('{{version}}', data.updatedVersion);

        return data;
    } catch (err) {
        throw new LoggerErrorHandler('Failed to get metadata', err.message);
    }
}

/**
 * Checks if there are changes in the extension list by comparing the current and updated extensions
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 */
function hasChangesOnExtensionList(data) {
    try {
        return JSON.stringify(data.currentExtensions.sort()) !== JSON.stringify(data.updatedExtensions.sort());
    } catch (err) {
        throw new LoggerErrorHandler('Failed to check if there are changes', err.message);
    }
}

/**
 * Updates package.json with the new extension list
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 */
function updatePackageJson(data) {
    try {
        data.packageJson.version = data.updatedVersion;
        data.packageJson.extensionPack = data.updatedExtensions;

        fs.writeFileSync(data.packageJsonPath, JSON.stringify(data.packageJson, null, 4));
    } catch (err) {
        throw new LoggerErrorHandler('Error updating package.json', err.message);
    }
}

/**
 * Updates the extension list in package.json based on recommendations from extensions.json file
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 */
function updateExtensionPack(data) {
    try {
        if (!hasChangesOnExtensionList(data) && data.message.trim() === '') info('No changes needed in `package.json` file.');
        else updatePackageJson(data);
    } catch (err) {
        throw new LoggerErrorHandler('Failed to update extension pack', err.message);
    }
}

/**
 * Commits the changes in the project files
 *
 * @param {string[]} projectFiles - The paths to the project files that must be excluded from the commit
 * @returns {boolean} True if the changes were committed, false otherwise
 */
function commitProjectFiles(projectFiles) {
    try {
        execGitCommand(`git add ${projectFiles.join(' ')}`);

        const message = getCommitMessageByStagedFiles(getStagedFiles(), 'chore: Updated project files');

        if (message.trim() === '') {
            info('No changes to commit for project files.');
            return false;
        }

        info('The following changes will be applied:\n', message);
        console.log(message);
        if (!confirm('Do you want to apply the changes?', question)) {
            execGitCommand('git restore --staged .');
            info('Aborted! No changes applied.', 'User aborted the operation `commitProjectFiles`.');
            process.exit(0);
        }

        execGitCommand(`git commit -m "${message}"`);

        return true;
    } catch (err) {
        execGitCommand('git restore --staged .');
        throw new LoggerErrorHandler('Failed to commit project files', err.message);
    }
}

/**
 * Commits the changes to the extension files
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 * @returns {boolean} True if the changes were committed, false otherwise
 */
function commitExtensionFiles(data) {
    try {
        execGitCommand(`git add .`);

        if (data.message.trim() === '') {
            info('No changes to commit for extension files.');
            return false;
        }

        info('The following changes will be applied:\n', data.message);
        console.log(data.message);
        if (!confirm('Do you want to apply the changes?', question)) {
            execGitCommand('git restore --staged .');
            info('Aborted! No changes applied.', 'User aborted the operation `commitExtensionFiles`.');
            process.exit(0);
        }

        execGitCommand(`git commit -m "${data.message}"`);

        return true;
    } catch (err) {
        execGitCommand('git restore --staged .');
        throw new LoggerErrorHandler('Failed to commit changes', err.message);
    }
}

/**
 * TODO: Implement the publish function
 * Publishes the extension pack
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 */
function publish(data) {
    throw new LoggerErrorHandler('Not implemented yet', 'The `publish` function is not implemented yet.');
}

/**
 * Makes a release from the extension files
 *
 * @param {ExtensionPackData} data - The data of the extension pack
 */
function makeRelease() {
    try {
        const extensionFiles = ['.vscode/extensions.json', 'package.json', 'assets/icon_128.png', 'README.md'];
        const projectFiles = getProjectFiles(extensionFiles);
        const data = getExtensionPackData(extensionFiles);

        commitProjectFiles(projectFiles);
        updateExtensionPack(data);
        commitExtensionFiles(data);
        // if (commitExtensionFiles(data)) publish(data);
    } catch (err) {
        LoggerErrorHandler.handle(err.message, err, error);
    }
}

if (isMainModule(import.meta.url)) makeRelease();
