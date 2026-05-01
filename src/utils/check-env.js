import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * Checks if Docker CLI is installed on the Windows host.
 * @returns {boolean}
 */
export function checkDockerCli() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch (e) {
    console.log(chalk.red('\n✗ Docker CLI not found on Windows.'));
    console.log(chalk.yellow('VMDock requires the Docker CLI to be installed on your host machine.'));
    console.log(chalk.white('You can download it as part of Docker Desktop or as a standalone binary from:'));
    console.log(chalk.cyan('https://docs.docker.com/cli/'));
    console.log(chalk.gray('\nNote: You do NOT need Docker Desktop running, just the "docker" command.\n'));
    return false;
  }
}

/**
 * Checks if the current process has Administrator privileges on Windows.
 * @returns {boolean}
 */
export function isAdmin() {
  try {
    // 'net session' command requires admin rights and is fast
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Warns the user if they are not running as Administrator.
 */
export function warnIfNotAdmin() {
  if (!isAdmin()) {
    console.log(chalk.yellow('\n⚠️  Warning: Not running as Administrator.'));
    console.log(chalk.gray('Port forwarding (localhost mapping) might fail. Please restart your terminal as Administrator for full functionality.\n'));
    return false;
  }
  return true;
}
