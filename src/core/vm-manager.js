import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../config/loader.js';
import { startVM, getVmIp } from './vmware.js';

/**
 * Ensures the VM is running and returns the current IP address.
 * Sets process.env.DOCKER_HOST as a side effect.
 */
export async function ensureVmReady() {
  const { config } = loadConfig();
  if (!config) {
    throw new Error('VMDock configuration not found. Run "vmdock init" first.');
  }

  const vmxPath = config.vm.path;
  if (!vmxPath) {
    // Fallback to config IP if no VMX path is provided
    process.env.DOCKER_HOST = `tcp://${config.vm.ip}:${config.vm.docker_port}`;
    return { config, ip: config.vm.ip };
  }

  const spinner = ora('Ensuring VM is ready...').start();

  try {
    // 1. Ensure VM is started
    await startVM(vmxPath);
    
    // 2. Get current IP (dynamic detection)
    spinner.text = 'Waiting for VM IP address...';
    let ip = await getVmIp(vmxPath);
    
    // Retry a few times if IP is not yet available (VM just started)
    let retries = 0;
    while (!ip && retries < 10) {
      await new Promise(r => setTimeout(r, 2000));
      ip = await getVmIp(vmxPath);
      retries++;
    }

    if (!ip) {
      // Fallback to last known IP in config
      ip = config.vm.ip;
      spinner.warn(`Could not detect IP automatically. Using last known IP: ${ip}`);
    } else {
      spinner.succeed(`VM is ready at ${chalk.cyan(ip)}`);
    }

    // 3. Set DOCKER_HOST
    process.env.DOCKER_HOST = `tcp://${ip}:${config.vm.docker_port}`;

    return { config, ip };
  } catch (error) {
    spinner.fail(`VM Initialization failed: ${error.message}`);
    throw error;
  }
}
