import { NodeSSH } from 'node-ssh';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Connects to the Linux VM via SSH
 * @param {Object} vmConfig - Configuration containing ip, user, password/key
 * @returns {Promise<NodeSSH>} - The SSH instance
 */
export async function connectToVM(vmConfig) {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: vmConfig.ip,
      username: vmConfig.user,
      password: vmConfig.password,
      privateKeyPath: vmConfig.keyPath,
    });
    return ssh;
  } catch (error) {
    // We throw the error so the caller can decide whether to exit or handle it (e.g., status check vs init)
    throw new Error(`Failed to connect to VM at ${vmConfig.ip}: ${error.message}`);
  }
}

/**
 * Runs a command on the connected SSH instance
 * @param {NodeSSH} ssh - The connected SSH instance
 * @param {string} command - The command to run
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
export async function runCommand(ssh, command) {
  const timeout = 5000; // Shorten to 5 seconds for debugging
  try {
    console.log(chalk.gray(`[DEBUG] Executing: ${command}...`));
    const promise = ssh.execCommand(command);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Command timed out')), timeout)
    );

    const result = await Promise.race([promise, timeoutPromise]);
    console.log(chalk.gray(`[DEBUG] Command finished: ${command}`));
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code
    };
  } catch (error) {
    if (error.message === 'Command timed out') {
      throw new Error(`Command "${command}" timed out after 5 seconds. Linux VM is not responding.`);
    }
    throw error;
  }
}

/**
 * Runs a command with sudo, providing password via stdin
 * @param {NodeSSH} ssh 
 * @param {string} command 
 * @param {string} password 
 */
export async function runSudoCommand(ssh, command, password) {
  const timeout = 60000; // 60 seconds for sudo (Docker restart can be slow)
  try {
    // Wrap in bash -c to handle multiple commands, pipes, and redirects correctly with sudo
    const escapedCommand = command.replace(/'/g, "'\\''");
    const sudoCmd = `sudo -S -p '' bash -c '${escapedCommand}'`;
    
    const promise = ssh.execCommand(sudoCmd, { stdin: (password || '') + '\n' });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Command timed out')), timeout)
    );

    const result = await Promise.race([promise, timeoutPromise]);
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      code: result.code
    };
  } catch (error) {
    if (error.message === 'Command timed out') {
      throw new Error('Sudo command timed out. The VM might be waiting for input or is unresponsive.');
    }
    console.error(chalk.red(`\nError executing sudo command: ${error.message}`));
    throw error;
  }
}

/**
 * Checks if Docker is installed, and installs it if not
 * @param {NodeSSH} ssh - The connected SSH instance
 * @param {string} password - SSH/Sudo password
 */
export async function installDockerIfNeeded(ssh, password) {
  const checkCmd = await runCommand(ssh, 'command -v docker');
  if (checkCmd.stdout) {
    return; // Docker is already installed
  }

  const spinner = ora('Docker not found. Installing Docker Engine (this may take a while)...').start();
  try {
    // Basic install script for Docker
    // Note: we run the whole script with sudo to ensure permissions
    const installScript = `
      curl -fsSL https://get.docker.com -o get-docker.sh &&
      sh get-docker.sh &&
      usermod -aG docker $USER &&
      rm get-docker.sh
    `;
    const result = await runSudoCommand(ssh, installScript, password);
    
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    spinner.succeed('Docker Engine installed successfully.');
  } catch (error) {
    spinner.fail('Failed to install Docker.');
    console.error(chalk.red(error.message));
    console.log(chalk.yellow('Please install Docker manually on the VM.'));
    process.exit(1);
  }
}

/**
 * Configures Docker daemon to expose TCP port
 * @param {NodeSSH} ssh - The connected SSH instance
 * @param {number|string} port - The TCP port to expose
 * @param {string} password - SSH/Sudo password
 */
export async function configureDockerTCP(ssh, port, password) {
  const spinner = ora(`Configuring Docker to expose TCP port ${port}...`).start();
  
  const daemonJsonConfig = {
    hosts: ["unix:///var/run/docker.sock", `tcp://0.0.0.0:${port}`]
  };
  
  const daemonJsonStr = JSON.stringify(daemonJsonConfig).replace(/"/g, '\\"');
  
  const setupCmd = `
    mkdir -p /etc/docker &&
    echo "${daemonJsonStr}" > /etc/docker/daemon.json &&
    mkdir -p /etc/systemd/system/docker.service.d &&
    printf "[Service]\nExecStart=\nExecStart=/usr/bin/dockerd" > /etc/systemd/system/docker.service.d/override.conf &&
    systemctl daemon-reload &&
    systemctl restart docker
  `;

  try {
    const result = await runSudoCommand(ssh, setupCmd, password);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout);
    }
    spinner.succeed(`Docker TCP exposure configured on port ${port}.`);
  } catch (error) {
    spinner.fail('Failed to configure Docker TCP exposure.');
    console.error(chalk.red(error.message));
  }
}

/**
 * Mounts the VMware shared folder inside the VM
 * @param {NodeSSH} ssh - The connected SSH instance
 * @param {string} vmPath - The target mount path in the VM
 * @param {string} password - SSH/Sudo password
 */
export async function mountSharedFolder(ssh, vmPath, password) {
  const spinner = ora(`Mounting VMware shared folder to ${vmPath}...`).start();
  
  const mountCmd = `
    mkdir -p ${vmPath} &&
    vmhgfs-fuse .host:/ ${vmPath} -o subtype=vmhgfs-fuse,allow_other
  `;

  try {
    const result = await runSudoCommand(ssh, mountCmd, password);
    if (result.code !== 0 && !result.stderr.includes('already mounted') && !result.stderr.includes('mount point is not empty')) {
       spinner.warn(`Shared folder mount returned: ${result.stderr.trim()}`);
    } else {
       spinner.succeed(`Shared folder mounted to ${vmPath}`);
    }
  } catch (error) {
    spinner.fail('Failed to mount shared folder.');
    console.error(chalk.yellow(`Warning: ${error.message}`));
    console.log(chalk.gray('You may need to manually configure VMware Shared Folders on the VM.'));
  }
}
