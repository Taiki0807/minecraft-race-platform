output "race_worker" {
  description = "Created Race worker details"
  value = {
    vm_id      = proxmox_virtual_environment_vm.race_worker.vm_id
    name       = proxmox_virtual_environment_vm.race_worker.name
    ip_address = "192.168.100.8"
    started    = var.vm_started
  }
}
