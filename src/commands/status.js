import { execSync } from 'child_process';
import chalk from 'chalk';
import net from 'net';
import { loadConfig } from '../config/loader.js';
import { connectToVM, runCommand } from '../core/ssh.js';

// Helper to check TCP connection
const checkPort = (host, port, timeout = 2000) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
};

export default async function statusCommand() {
  console.log(chalk.cyan('\n🔍 Checking VMDock Status...\n'));

  let config;
  try {
    const loaded = loadConfig();
    config = loaded.config;
  } catch (e) {
    console.log(chalk.red('✗ Configuration   — not found or invalid'));
    return;
  }

  const ip = config.vm.ip;
  const port = config.vm.docker_port;

  // 1. VM Connectivity (Ping)
  let vmReachable = false;
  try {
    execSync(`ping -n 1 -w 1000 ${ip}`, { stdio: 'ignore' });
    vmReachable = true;
    console.log(`  ${chalk.green('✓')} VM (${ip.padEnd(15)}) — reachable`);
  } catch (e) {
    console.log(`  ${chalk.red('✗')} VM (${ip.padEnd(15)}) — unreachable`);
  }

  // 2. Docker Engine Connectivity
  const dockerEngineUp = await checkPort(ip, port);
  if (dockerEngineUp) {
    console.log(`  ${chalk.green('✓')} Docker Engine (:${port})   — connected`);
  } else {
    console.log(`  ${chalk.red('✗')} Docker Engine (:${port})   — offline`);
  }

  // 3. DOCKER_HOST env
  const expectedDockerHost = `tcp://${ip}:${port}`;
  const actualDockerHost = process.env.DOCKER_HOST;
  if (actualDockerHost === expectedDockerHost) {
    console.log(`  ${chalk.green('✓')} DOCKER_HOST               — set correctly`);
  } else {
    console.log(`  ${chalk.yellow('!')} DOCKER_HOST               — not set or incorrect (current: ${actualDockerHost || 'empty'})`);
  }

  // 4. Shared Folder Check via SSH
  if (vmReachable && config.vm.user) {
    try {
      // Connect with minimal info, relying on passwordless/key if available
      const ssh = await connectToVM({
        ip: ip,
        user: config.vm.user,
      });
      
      const vmMount = config.shared?.vm_mount;
      if (vmMount) {
        const result = await runCommand(ssh, `test -d ${vmMount} && echo "yes" || echo "no"`);
        if (result.stdout.trim() === 'yes') {
          console.log(`  ${chalk.green('✓')} Shared folder (${vmMount}) — mounted`);
        } else {
          console.log(`  ${chalk.red('✗')} Shared folder (${vmMount}) — not found`);
        }
      }
      ssh.dispose();
    } catch (e) {
      // Be silent about the exact error, just inform that SSH auth is needed for this specific check
      console.log(`  ${chalk.yellow('!')} Shared folder               — unable to verify (requires SSH key or password)`);
    }
  } else {
    console.log(`  ${chalk.yellow('!')} Shared folder               — skipped (VM unreachable)`);
  }

  // 5 & 6. Service Status & Ports
  const services = config.services || {};
  const serviceNames = Object.keys(services);

  if (serviceNames.length > 0 && dockerEngineUp) {
    process.env.DOCKER_HOST = expectedDockerHost;
    
    for (const name of serviceNames) {
      try {
        const status = execSync(`docker ps -a --format "{{.Status}}" -f name=^vmdock-${name}$`).toString().trim();
        
        let portDisplay = '';
        const service = services[name];
        if (service.ports && service.ports.length > 0) {
           portDisplay = `:${service.ports[0].split(':')[0]}`;
        }
        
        const displayStr = `${name.padEnd(10)}${portDisplay.padEnd(6)}`;

        if (status.startsWith('Up')) {
          console.log(`  ${chalk.green('✓')} ${displayStr}             — running`);
        } else if (status.startsWith('Exited')) {
          console.log(`  ${chalk.red('✗')} ${displayStr}             — stopped`);
        } else {
          console.log(`  ${chalk.gray('○')} ${displayStr}             — not created`);
        }
      } catch (e) {
        console.log(`  ${chalk.gray('○')} ${name.padEnd(10)}             — status unknown`);
      }
    }
  }

  console.log('\n');
}
