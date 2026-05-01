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
      readyTimeout: 10000,
    });
    return ssh;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message.includes('ECONNREFUSED')) {
      const err = new Error(`Connection Refused to ${vmConfig.ip}:22`);
      err.type = 'SSH_NOT_INSTALLED';
      throw err;
    }
    
    if (error.code === 'ETIMEDOUT' || error.message.includes('ETIMEDOUT')) {
      const err = new Error(`Connection Timeout to ${vmConfig.ip}:22`);
      err.type = 'SSH_TIMEOUT';
      throw err;
    }

    if (error.message.includes('authentication methods failed')) {
      const err = new Error(`Authentication Failed for user "${vmConfig.user}"`);
      err.type = 'SSH_AUTH_FAILED';
      throw err;
    }

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
 * Detects the Linux distribution of the remote VM
 * @param {NodeSSH} ssh 
 * @returns {Promise<Object>} - { os: string, pkgManager: string, init: string }
 */
export async function detectOS(ssh) {
  const osInfo = await runCommand(ssh, 'cat /etc/os-release');
  const content = osInfo.stdout.toLowerCase();
  
  let info = {
    os: 'unknown',
    pkgManager: 'apt', // Default
    init: 'systemd'    // Default
  };

  if (content.includes('ubuntu') || content.includes('debian') || content.includes('kali') || content.includes('mint')) {
    info.os = 'debian';
    info.pkgManager = 'apt';
  } else if (content.includes('fedora') || content.includes('centos') || content.includes('rhel')) {
    info.os = 'redhat';
    info.pkgManager = 'dnf';
  } else if (content.includes('alpine')) {
    info.os = 'alpine';
    info.pkgManager = 'apk';
    info.init = 'openrc';
  } else if (content.includes('arch')) {
    info.os = 'arch';
    info.pkgManager = 'pacman';
  }

  // Double check init system
  const checkInit = await runCommand(ssh, 'ps -p 1 -o comm=');
  if (checkInit.stdout.includes('systemd')) {
    info.init = 'systemd';
  } else if (checkInit.stdout.includes('init')) {
    // Possibly OpenRC or SysV
  }

  return info;
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

  const osInfo = await detectOS(ssh);
  const spinner = ora(`Docker not found. Installing Docker Engine for ${osInfo.os}...`).start();

  try {
    let installScript = '';
    
    if (osInfo.pkgManager === 'apt') {
      installScript = 'curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh';
    } else if (osInfo.pkgManager === 'dnf') {
      installScript = 'dnf install -y docker-ce docker-ce-cli containerd.io && systemctl enable --now docker';
    } else if (osInfo.pkgManager === 'apk') {
      installScript = 'apk add docker && addgroup $USER docker && rc-update add docker default && service docker start';
    } else if (osInfo.pkgManager === 'pacman') {
      installScript = 'pacman -S docker --noconfirm && systemctl enable --now docker';
    }

    const fullScript = `${installScript} && usermod -aG docker $USER || true`;
    const result = await runSudoCommand(ssh, fullScript, password);
    
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
  const osInfo = await detectOS(ssh);
  const spinner = ora(`Configuring Docker to expose TCP port ${port} (${osInfo.init})...`).start();
  
  let setupCmd = '';

  if (osInfo.init === 'systemd') {
    setupCmd = `
      DOCKERD_PATH=$(which dockerd)
      mkdir -p /etc/docker
      cat <<EOF > /etc/docker/daemon.json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:${port}"]
}
EOF
      mkdir -p /etc/systemd/system/docker.service.d
      cat <<EOF > /etc/systemd/system/docker.service.d/override.conf
[Service]
ExecStart=
ExecStart=$DOCKERD_PATH
EOF
      systemctl daemon-reload
      systemctl restart docker
    `;
  } else if (osInfo.init === 'openrc') {
    setupCmd = `
      mkdir -p /etc/docker
      cat <<EOF > /etc/docker/daemon.json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:${port}"]
}
EOF
      service docker restart
    `;
  }

  try {
    const result = await runSudoCommand(ssh, setupCmd, password);
    if (result.code !== 0) {
      // If it fails, let's try to get the reason
      const status = await runCommand(ssh, 'systemctl status docker.service --no-pager');
      throw new Error(`${result.stderr || result.stdout}\n\nDocker Status:\n${status.stdout}`);
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
