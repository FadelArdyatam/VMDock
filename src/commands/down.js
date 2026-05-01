import { execSync } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';

import { ensureVmReady } from '../core/vm-manager.js';

export default async function downCommand() {
  const { config, ip } = await ensureVmReady();

  // Set DOCKER_HOST for the current process
  const dockerHost = `tcp://${ip}:${config.vm.docker_port}`;
  process.env.DOCKER_HOST = dockerHost;

  console.log(chalk.cyan(`\nStopping VMDock services...\n`));

  const services = config.services || {};
  const serviceNames = Object.keys(services);

  if (serviceNames.length === 0) {
    console.log(chalk.yellow('No services defined in vmdock.yml.'));
    return;
  }

  for (const name of serviceNames) {
    const spinner = ora(`Stopping ${name}...`).start();

    try {
      // Check if container exists
      const exists = execSync(`docker ps -a -q -f name=^vmdock-${name}$`).toString().trim();

      if (!exists) {
        spinner.succeed(chalk.gray(`${name} is not running`));
        continue;
      }

      // Stop and remove
      execSync(`docker stop vmdock-${name}`, { stdio: 'ignore' });
      execSync(`docker rm vmdock-${name}`, { stdio: 'ignore' });

      spinner.succeed(chalk.green(` ${name} stopped and removed`));
    } catch (error) {
      spinner.fail(chalk.red(`✗ Failed to stop ${name}`));
      console.error(chalk.gray(`  ${error.message}`));
    }
  }

  console.log(chalk.cyan('\nAll services stopped successfully!\n'));
}
