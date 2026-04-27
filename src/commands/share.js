import chalk from 'chalk';
import ora from 'ora';
import readline from 'readline';
import { loadConfig } from '../config/loader.js';
import { connectToVM, runCommand, runSudoCommand } from '../core/ssh.js';
import { findVmrun, findVmxByIp, enableSharedFolder } from '../core/vmware.js';

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

export default async function shareCommand() {
  const { config } = loadConfig();
  if (!config) {
    console.log(chalk.red('✗ Configuration not found. Please run "vmdock init" first.'));
    return;
  }

  console.log(chalk.cyan('\n🔍 Shared Folder Diagnosis\n'));

  // Ask for password since we don't store it
  const password = await prompt(chalk.yellow(`Enter SSH/Sudo Password for ${config.vm.user}: `));

  const connSpinner = ora('Connecting to VM...').start();
  let ssh;
  try {
    ssh = await connectToVM({
      ip: config.vm.ip,
      user: config.vm.user,
      password: password
    });
    connSpinner.succeed('Connected to VM via SSH.');
  } catch (error) {
    connSpinner.fail('Connection failed.');
    console.log(chalk.red(error.message));
    return;
  }

  // 1. Check vmware-hgfsclient
  const clientSpinner = ora('Checking VMware host shares...').start();
  let clientResult;
  try {
    clientResult = await runCommand(ssh, 'vmware-hgfsclient');
  } catch (err) {
    clientSpinner.fail(`Failed to check host shares: ${err.message}`);
    ssh.dispose();
    return;
  }
  
  if (clientResult.code === 0 && !clientResult.stdout.trim()) {
    clientSpinner.warn('No shared folders detected from host. Attempting smart auto-config...');
    
    const vmxSpinner = ora('Scanning for your .vmx file...').start();
    let vmxPath = await findVmxByIp(config.vm.ip);
    
    if (!vmxPath) {
      vmxSpinner.warn('Could not automatically find your .vmx file.');
      const manualPath = await prompt(chalk.cyan('Please enter the full path to your .vmx file (or press Enter to skip): '));
      if (manualPath) vmxPath = manualPath;
    }

    if (vmxPath) {
      vmxSpinner.info(`Using VM config at: ${chalk.gray(vmxPath)}`);
      const shareName = 'VMDock'; 
      try {
        const configSpinner = ora('Enabling shared folder in VMware...').start();
        await enableSharedFolder(vmxPath, shareName, config.shared.windows_path);
        configSpinner.succeed(`Successfully enabled "${shareName}" share in VMware settings!`);
        
        // Re-check client
        clientResult = await runCommand(ssh, 'vmware-hgfsclient');
      } catch (err) {
        configSpinner.fail(`Failed to auto-configure: ${err.message}`);
      }
    } else {
      if (vmxSpinner.isSpinning) vmxSpinner.fail('Skipped auto-configuration.');
    }
  } else if (clientResult && clientResult.code === 0 && clientResult.stdout.trim()) {
    clientSpinner.succeed('Detected folders shared from Windows Host:');
    clientResult.stdout.split('\n').filter(Boolean).forEach(folder => {
      console.log(`  - ${chalk.yellow(folder)}`);
    });
  } else {
    clientSpinner.fail(`Failed to check VMware host shares (code ${clientResult?.code}): ${clientResult?.stderr}`);
  }

  // 2. Check mount status
  console.log(chalk.cyan('\n🚀 VM Mount Status:'));
  const mountSpinner = ora('Checking mount points in Linux...').start();
  try {
    const mountResult = await runCommand(ssh, 'mount | grep vmhgfs');
    const isMounted = mountResult.stdout.includes('vmhgfs-fuse');

    if (isMounted) {
      mountSpinner.succeed('Shared folder system is ACTIVE');
      mountResult.stdout.split('\n').filter(Boolean).forEach(line => {
        console.log(`    ${chalk.gray(line)}`);
      });
    } else {
      mountSpinner.fail('Shared folder system is INACTIVE');
      
      const repair = await prompt(chalk.cyan('\nWould you like to attempt to mount it now? (y/n): '));
      if (repair.toLowerCase() === 'y') {
        const repairSpinner = ora('Attempting to mount shared folders...').start();
        try {
          const vmMountRoot = '/mnt/shared';
          const mountCmd = `mkdir -p ${vmMountRoot} && vmhgfs-fuse .host:/ ${vmMountRoot} -o subtype=vmhgfs-fuse,allow_other`;
          const result = await runSudoCommand(ssh, mountCmd, password);
          
          if (result.code === 0) {
            repairSpinner.succeed(`Mounted to ${vmMountRoot} successfully.`);
          } else {
            repairSpinner.fail(`Failed to mount: ${result.stderr}`);
            console.log(chalk.yellow('\nTroubleshooting Tip:'));
            console.log('Ensure "open-vm-tools-desktop" is installed on your Linux VM:');
            console.log(chalk.gray('  sudo apt update && sudo apt install open-vm-tools-desktop'));
          }
        } catch (err) {
          repairSpinner.fail(`Error: ${err.message}`);
        }
      }
    }
  } catch (err) {
    mountSpinner.fail(`Failed to check mount status: ${err.message}`);
  }

  ssh.dispose();
  console.log('\n');
}
