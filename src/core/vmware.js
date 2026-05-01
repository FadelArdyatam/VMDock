import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Finds the path to vmrun.exe on Windows
 * @returns {string|null}
 */
export function findVmrun() {
  const commonPaths = [
    'C:\\Program Files (x86)\\VMware\\VMware Workstation\\vmrun.exe',
    'C:\\Program Files\\VMware\\VMware Workstation\\vmrun.exe',
    'C:\\Program Files (x86)\\VMware\\VMware Player\\vmrun.exe',
    'C:\\Program Files\\VMware\\VMware Player\\vmrun.exe',
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

/**
 * Finds the .vmx path of a running VM that matches the given IP
 * @param {string} targetIp 
 * @returns {Promise<string|null>}
 */
export async function findVmxByIp(targetIp) {
  const vmrun = findVmrun();
  if (!vmrun) return null;

  try {
    const { stdout: listOutput } = await execAsync(`"${vmrun}" list`, { timeout: 3000 });
    const lines = listOutput.split('\n').map(l => l.trim()).filter(l => l.endsWith('.vmx'));
    
    if (lines.length === 0) return null;
    
    // If only one VM is running, return it immediately
    if (lines.length === 1) {
      return lines[0];
    }

    // If multiple, try to find by IP
    for (const vmxPath of lines) {
      try {
        const { stdout: ipOutput } = await execAsync(`"${vmrun}" getGuestIPAddress "${vmxPath}"`, { timeout: 2000 });
        if (ipOutput.trim() === targetIp) {
          return vmxPath;
        }
      } catch (e) {
        continue;
      }
    }
  } catch (e) {
    return null;
  }

  return null;
}

/**
 * Starts a VM if it is not already running
 * @param {string} vmxPath 
 */
export async function startVM(vmxPath) {
  const vmrun = findVmrun();
  if (!vmrun) throw new Error('vmrun.exe not found');

  try {
    // Check if running
    const { stdout: listOutput } = await execAsync(`"${vmrun}" list`);
    if (listOutput.includes(vmxPath)) {
      return true;
    }

    // Start VM
    await execAsync(`"${vmrun}" -T ws start "${vmxPath}" nogui`);
    return true;
  } catch (e) {
    throw new Error(`Failed to start VM: ${e.message}`);
  }
}

/**
 * Gets the IP address of a VM from its VMX path
 * @param {string} vmxPath 
 * @returns {Promise<string|null>}
 */
export async function getVmIp(vmxPath) {
  const vmrun = findVmrun();
  if (!vmrun) return null;

  try {
    const { stdout } = await execAsync(`"${vmrun}" getGuestIPAddress "${vmxPath}"`, { timeout: 10000 });
    return stdout.trim();
  } catch (e) {
    return null;
  }
}

/**
 * Automatically enables a shared folder for a VM
 * @param {string} vmxPath 
 * @param {string} shareName 
 * @param {string} hostPath 
 */
export async function enableSharedFolder(vmxPath, shareName, hostPath) {
  const vmrun = findVmrun();
  if (!vmrun) throw new Error('vmrun.exe not found');

  try {
    // 1. Add the shared folder
    await execAsync(`"${vmrun}" -T ws addSharedFolder "${vmxPath}" "${shareName}" "${hostPath}"`, { timeout: 5000 });
    
    // 2. Set the shared folder to writeable/enabled
    await execAsync(`"${vmrun}" -T ws setSharedFolderState "${vmxPath}" "${shareName}" "${hostPath}" writable`, { timeout: 5000 });
    
    return true;
  } catch (e) {
    throw new Error(`Failed to configure VMware Shared Folder: ${e.message}`);
  }
}
