import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import yaml from 'js-yaml';
import { connectToVM, installDockerIfNeeded, configureDockerTCP } from '../core/ssh.js';
import { findVmxByIp } from '../core/vmware.js';

// Utility to prompt user for input
const prompt = (query) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
};

export default async function initCommand() {
  console.log(chalk.cyan.bold('\nVMDock Initialization\n'));

  // 1. & 2. Ask user for VM details
  const vmIp = await prompt(chalk.yellow('Enter VM IP Address: '));
  if (!vmIp) {
    console.error(chalk.red('IP Address is required.'));
    process.exit(1);
  }

  // Auto-detect VMX path
  let vmxPath = await findVmxByIp(vmIp);
  vmxPath = await prompt(chalk.yellow(`Enter .vmx path [${vmxPath || 'path/to/vm.vmx'}]: `)) || vmxPath;

  if (!vmxPath) {
    console.error(chalk.red('.vmx path is required for advanced features.'));
    process.exit(1);
  }

  const sshUser = await prompt(chalk.yellow('Enter SSH Username: '));
  const sshPassword = await prompt(chalk.yellow('Enter SSH Password (leave blank if using key): '));
  let sshKeyPath = '';
  if (!sshPassword) {
    sshKeyPath = await prompt(chalk.yellow('Enter SSH Private Key Path (e.g., ~/.ssh/id_rsa): '));
  }

  // 3. Ping VM to verify connection
  const pingSpinner = ora(`Pinging VM at ${vmIp}...`).start();
  try {
    // Windows ping command: ping -n 1 <ip>
    execSync(`ping -n 1 ${vmIp}`, { stdio: 'ignore' });
    pingSpinner.succeed(`VM ${vmIp} is reachable.`);
  } catch (error) {
    pingSpinner.fail(`Cannot reach VM at ${vmIp}. Please ensure it is running.`);
    process.exit(1);
  }

  // 4. SSH to VM and configure Docker
  const sshSpinner = ora('Connecting to VM via SSH...').start();
  let ssh;
  try {
    ssh = await connectToVM({
      ip: vmIp,
      user: sshUser,
      password: sshPassword || undefined,
      keyPath: sshKeyPath || undefined
    });
    sshSpinner.succeed('Connected to VM via SSH.');
  } catch (error) {
    sshSpinner.fail(error.message);
    
    if (error.type === 'SSH_NOT_INSTALLED') {
      console.log(chalk.yellow('\nIt seems the SSH server is not running or not installed on your VM.'));
      console.log(chalk.white('Please run these commands on your Linux VM terminal:'));
      console.log(chalk.cyan('  sudo apt update && sudo apt install openssh-server -y  # For Debian/Ubuntu/Kali'));
      console.log(chalk.cyan('  sudo dnf install openssh-server -y                    # For Fedora/CentOS'));
      console.log(chalk.cyan('  sudo systemctl enable --now ssh'));
    } else if (error.type === 'SSH_AUTH_FAILED') {
      console.log(chalk.yellow('\nThe password or SSH key provided is incorrect.'));
      console.log(chalk.white('Please double-check your credentials and try again.'));
    } else if (error.type === 'SSH_TIMEOUT') {
      console.log(chalk.yellow('\nThe VM is not responding. Ensure it is powered on and the IP is correct.'));
    }
    
    process.exit(1);
  }

  await installDockerIfNeeded(ssh, sshPassword);
  const dockerPort = 2375;
  await configureDockerTCP(ssh, dockerPort, sshPassword);
  
  // Close SSH connection as we're done with VM configuration for now
  ssh.dispose();

  // 5. Ask user for path details
  console.log(chalk.cyan('\nDirectory Configuration'));
  const currentDir = process.cwd();
  const windowsPath = await prompt(chalk.yellow(`Enter Windows Project Path [${currentDir}]: `)) || currentDir;
  
  const projectName = path.basename(windowsPath);
  const defaultVmPath = `/mnt/shared/${projectName}`;
  const vmPath = await prompt(chalk.yellow(`Enter VM Mount Path [${defaultVmPath}]: `)) || defaultVmPath;

  // 6. Set DOCKER_HOST environment variable
  const envSpinner = ora('Setting DOCKER_HOST in Windows...').start();
  const dockerHostUrl = `tcp://${vmIp}:${dockerPort}`;
  try {
    // Using setx to set environment variable persistently for the current user
    execSync(`setx DOCKER_HOST "${dockerHostUrl}"`, { stdio: 'ignore' });
    // Also set it for the current process so we can test it immediately
    process.env.DOCKER_HOST = dockerHostUrl;
    envSpinner.succeed(`Set DOCKER_HOST to ${dockerHostUrl}`);
  } catch (error) {
    envSpinner.warn(`Failed to set DOCKER_HOST automatically. You may need to set it manually: setx DOCKER_HOST "${dockerHostUrl}"`);
  }

  // 7. Generate vmdock.yml
  const configSpinner = ora('Generating vmdock.yml...').start();
  const configData = {
    vm: {
      ip: vmIp,
      path: vmxPath,
      docker_port: dockerPort,
      user: sshUser
    },
    shared: {
      windows_path: windowsPath,
      vm_mount: vmPath,
      docker_volume: "/app"
    },
    services: {
      hello_world: {
        image: "hello-world",
        ports: []
      }
    }
  };

  const yamlStr = yaml.dump(configData);
  fs.writeFileSync(path.join(currentDir, 'vmdock.yml'), yamlStr);
  configSpinner.succeed('Created vmdock.yml in current directory.');

  // 8. Validate connection via Docker CLI
  const validateSpinner = ora('Validating Docker connection...').start();
  try {
    // Check if docker CLI is available
    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch (e) {
      validateSpinner.warn('Docker CLI not found on Windows. Please install docker-cli (without Docker Desktop) to use standard docker commands.');
      throw new Error('Docker CLI missing');
    }

    execSync('docker ps', { stdio: 'ignore' });
    validateSpinner.succeed('Successfully connected to remote Docker Engine from Windows!');
  } catch (error) {
    if (error.message !== 'Docker CLI missing') {
      validateSpinner.fail('Failed to connect to Docker Engine using Docker CLI.');
      console.log(chalk.gray(`Please verify that port ${dockerPort} is open on the VM firewall.`));
    }
  }

  // 9. Summary
  console.log(chalk.green.bold('\nVMDock setup completed successfully!\n'));
  console.log(chalk.white('Next steps:'));
  console.log(`1. Review and edit ${chalk.yellow('vmdock.yml')} to configure your services (e.g., redis, postgres).`);
  console.log(`2. Ensure VMware Shared Folders is enabled for your VM and points to: ${chalk.cyan(windowsPath)}`);
  console.log(`3. Run ${chalk.green('vmdock up')} to start your services.`);
  console.log(`\nNote: If DOCKER_HOST doesn't reflect in your current terminal, please restart your terminal.\n`);
}
