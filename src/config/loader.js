import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import chalk from 'chalk';

/**
 * Searches for vmdock.yml starting from the current directory and moving up
 * @param {string} startDir - Directory to start searching from
 * @returns {string|null} - Path to the config file or null if not found
 */
export function findConfigFile(startDir = process.cwd()) {
  let currentDir = startDir;

  while (true) {
    const configPath = path.join(currentDir, 'vmdock.yml');
    if (fs.existsSync(configPath)) {
      return configPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached the root directory
      return null;
    }
    currentDir = parentDir;
  }
}

/**
 * Loads and validates the vmdock.yml configuration file
 * @returns {Object} - Parsed configuration object
 */
export function loadConfig() {
  const configPath = findConfigFile();

  if (!configPath) {
    console.error(chalk.red('Error: vmdock.yml not found.'));
    console.log(chalk.yellow('Please run "vmdock init" to create a configuration file in your project.'));
    process.exit(1);
  }

  try {
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents);

    // Validate required fields
    if (!config || !config.vm || !config.vm.ip) {
      throw new Error('Missing required field: vm.ip');
    }
    if (!config.vm.docker_port) {
      throw new Error('Missing required field: vm.docker_port');
    }

    return { config, configPath };
  } catch (error) {
    console.error(chalk.red(`Error parsing config file: ${error.message}`));
    process.exit(1);
  }
}
