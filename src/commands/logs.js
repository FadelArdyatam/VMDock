import { spawn } from 'child_process';
import chalk from 'chalk';
import { ensureVmReady } from '../core/vm-manager.js';

export default async function logsCommand(args) {
  try {
    await ensureVmReady();
    
    const serviceName = args[0];
    if (!serviceName) {
      console.log(chalk.red('Please specify a service name. Example: vmdock logs my-app'));
      return;
    }

    const containerName = `vmdock-${serviceName}`;
    console.log(chalk.cyan(`\nShowing logs for ${containerName} (Ctrl+C to stop)...\n`));

    const dockerLogs = spawn('docker', ['logs', '-f', containerName], {
      stdio: 'inherit',
      shell: true
    });

    dockerLogs.on('error', (err) => {
      console.error(chalk.red(`Failed to start logs: ${err.message}`));
    });
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
}
