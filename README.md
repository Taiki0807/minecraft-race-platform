# Minecraft Race Platform infrastructure

Initial infrastructure-as-code for a dedicated Minecraft race worker on Proxmox.

Start with [`terraform/proxmox/README.md`](terraform/proxmox/README.md).

The existing k3s cluster and Minecraft server are intentionally not imported into Terraform. Terraform owns new Proxmox virtual machines; Kubernetes and Helm will own workloads inside the cluster.
