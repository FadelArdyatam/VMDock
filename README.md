# VMDock

VMDock is a lightweight CLI tool that seamlessly connects standard Docker running inside a Linux VM (like VMware) with your Windows host, automatically handling file sharing and port forwarding without needing Docker Desktop.

## Prerequisites

- **Windows Host OS**
- **VMware Workstation** (with a running Linux VM: Ubuntu, Debian, Arch, etc.)
- **Node.js** (v18+) installed on Windows
- Standard `docker-cli` installed on Windows (you can install this via `winget install Docker.DockerCli`)

## Quick Start

1. **Install VMDock globally** (from source)
   ```bash
   npm install -g .
   ```

2. **Initialize VMDock in your project**
   Navigate to your project directory in Windows and run:
   ```bash
   vmdock init
   ```
   *Follow the prompts to enter your VM's IP, SSH credentials, and map your project folder.*

3. **Review configuration**
   A `vmdock.yml` file will be generated in your project. Edit it to configure your needed services (Redis, Postgres, etc.).

4. **Start your services**
   ```bash
   vmdock up
   ```

5. **Access from Windows**
   Your services are now accessible directly from `localhost` on Windows, and any code changes in Windows will instantly reflect in the container via shared folders!

## Configuration (`vmdock.yml`)

The `vmdock.yml` file sits at the root of your project:

```yaml
vm:
  ip: "192.168.1.105"
  docker_port: 2375
  user: "fadel"

shared:
  windows_path: "C:\\Users\\fadel\\stiqr-api"
  vm_mount: "/mnt/shared/stiqr-api"
  docker_volume: "/app"

services:
  redis:
    image: "redis:7-alpine"
    ports: 
      - "6379:6379"
  postgres:
    image: "postgres:15"
    ports: 
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: "dev123"
      POSTGRES_DB: "stiqrdb"
```

## Commands Reference

- `vmdock init` - Interactively setup your VM connection and generate `vmdock.yml`.
- `vmdock up` - Start all services defined in your `vmdock.yml`.
- `vmdock down` - Stop and remove all running services.
- `vmdock status` - Check the health of your VM connection, Docker Engine, and services.
- `vmdock ps` - (Coming Soon) List all running services.
- `vmdock exec <service>` - (Coming Soon) Shell into a running container.
- `vmdock logs <service>` - (Coming Soon) View container logs.

## Troubleshooting

1. **Docker CLI not found on Windows**
   - *Solution:* Install it via `winget install Docker.DockerCli`. You don't need Docker Desktop, just the CLI.

2. **Cannot reach VM (Ping fails)**
   - *Solution:* Ensure your VM network adapter is set to Bridged or NAT and the VM is powered on. Check the VM's IP address.

3. **Failed to mount shared folder**
   - *Solution:* Ensure VMware Shared Folders is enabled in your VM settings. You may need to manually install `open-vm-tools` on your Linux VM.

4. **DOCKER_HOST not applied**
   - *Solution:* `setx` requires you to restart your terminal for the environment variable to take effect globally.

5. **Port conflicts when running `vmdock up`**
   - *Solution:* Ensure the port isn't already being used on the VM or your Windows host. Change the port mapping in `vmdock.yml`.

## How it works

VMDock acts as a bridge. It connects your Windows `docker` CLI directly to the `dockerd` engine running inside your Linux VM via TCP (port 2375). When you declare a shared folder, VMDock leverages VMware Shared Folders to mount your Windows directory into the Linux VM. Finally, when `vmdock up` spins up your containers, it mounts that Linux path into the Docker container. This gives you native Linux Docker performance with seamless Windows file editing and localhost port forwarding.
