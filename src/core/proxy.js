import { execSync } from 'child_process';
import chalk from 'chalk';

/**
 * Sets up port forwarding from localhost to VM IP using netsh (Windows)
 * @param {string} vmIp 
 * @param {number} port 
 */
export function setupPortProxy(vmIp, port) {
  try {
    // Check if proxy already exists
    const check = execSync(`netsh interface portproxy show v4tov4`).toString();
    if (check.includes(`127.0.0.1`) && check.includes(`${port}`) && check.includes(vmIp)) {
      return; // Already setup
    }

    // Add new proxy
    // Note: This requires Administrator privileges.
    execSync(`netsh interface portproxy add v4tov4 listenport=${port} listenaddress=127.0.0.1 connectport=${port} connectaddress=${vmIp}`, { stdio: 'ignore' });
    console.log(chalk.gray(`  [Proxy] localhost:${port} -> ${vmIp}:${port}`));
  } catch (error) {
    // Silently fail if not admin, but we should inform the user elsewhere
  }
}

/**
 * Clears all port proxies for VMDock (optional)
 */
export function clearAllProxies() {
  try {
    execSync(`netsh interface portproxy reset`, { stdio: 'ignore' });
  } catch (e) {}
}
