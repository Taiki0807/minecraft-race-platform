resource "proxmox_virtual_environment_vm" "race_worker" {
  vm_id       = 108
  name        = "k8s-race-worker1"
  description = "Minecraft Race Platform worker managed by Terraform"
  tags        = ["terraform", "k3s", "minecraft-race"]

  node_name     = "pve"
  scsi_hardware = "virtio-scsi-single"
  started       = var.vm_started
  on_boot       = false

  # Linked clone conserves the limited local-lvm capacity. VM 1000 must remain.
  clone {
    vm_id        = 1000
    node_name    = "pve"
    datastore_id = "local-lvm"
    full         = true
  }

  agent {
    enabled = true
  }

  cpu {
    cores = 2
    type  = "host"
  }

  memory {
    dedicated = 4096
    floating  = 4096
  }

  network_device {
    bridge   = "vnet1"
    model    = "virtio"
    firewall = true
  }

  initialization {
    datastore_id = "local-lvm"
    interface    = "ide2"
    upgrade      = false

    ip_config {
      ipv4 {
        address = "192.168.100.8/24"
        gateway = "192.168.100.1"
      }
    }

    user_account {
      username = "ubuntu"
      keys     = [trimspace(var.ssh_public_key)]
    }
  }

  operating_system {
    type = "l26"
  }

  stop_on_destroy = true
}
