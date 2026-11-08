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

# ハル・マイクラ専用のワーカー。race_worker と資源・ワールドを共有させない
# (配信中のレースとハルの自動プレイが互いに影響しないようにするための分離)。
# vm_id / IP は race_worker の次番(109 / .9)を仮に割り当てている。
# apply前に README の手順どおり、Proxmox側の実際の空き状況を必ず確認すること。
#
# 常時稼働させる前提のため on_boot=true (race_worker と違い、Proxmoxホスト再起動時に
# 自動起動する)。ただし初回applyの安全確認は race_worker と同様に haru_vm_started=false
# から始め、起動を確認してから true に切り替えること。
resource "proxmox_virtual_environment_vm" "haru_worker" {
  vm_id       = 109
  name        = "k8s-haru-worker1"
  description = "Haru Minecraft (AI VTuber autoplay) worker managed by Terraform"
  tags        = ["terraform", "k3s", "haru-minecraft"]

  node_name     = "pve"
  scsi_hardware = "virtio-scsi-single"
  started       = var.haru_vm_started
  on_boot       = true

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
        address = "192.168.100.9/24"
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
