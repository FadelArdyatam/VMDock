import { spawn } from 'child_process';
import chalk from 'chalk';
import { ensureVmReady } from '../core/vm-manager.js';

export default async function execCommand(args) {
  try {
    await ensureVmReady();
    
    const serviceName = args[0];
    const command = args.slice(1).length > 0 ? args.slice(1) : ['sh'];

    if (!serviceName) {
      console.log(chalk.red('Please specify a service name. Example: vmdock exec my-app bash'));
      return;
    }

    const containerName = `vmdock-${serviceName}`;
    console.log(chalk.cyan(`\nConnecting to ${containerName}...\n`));

    const dockerExec = spawn('docker', ['exec', '-it', containerName, ...command], {
      stdio: 'inherit',
      shell: true
    });

    dockerExec.on('error', (err) => {
      console.error(chalk.red(`Failed to execute command: ${err.message}`));
    });
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
  }
}
