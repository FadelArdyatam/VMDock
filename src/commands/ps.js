import { execSync } from 'child_process';
import chalk from 'chalk';
import { ensureVmReady } from '../core/vm-manager.js';

export default async function psCommand() {
  try {
    await ensureVmReady();
    console.log(chalk.cyan('\n📋 Running Containers:\n'));
    // We use stdio: inherit to let docker handle the formatting
    execSync('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', { stdio: 'inherit' });
    console.log('');
  } catch (error) {
    console.error(chalk.red(`Failed to list containers: ${error.message}`));
  }
}
