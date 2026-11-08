variable "proxmox_endpoint" {
  description = "Proxmox API endpoint"
  type        = string
  default     = "https://192.168.1.200:8006/"
}

variable "proxmox_api_token" {
  description = "Proxmox API token. Supply with TF_VAR_proxmox_api_token; never commit it."
  type        = string
  sensitive   = true
}

variable "proxmox_insecure" {
  description = "Allow the current self-signed Proxmox TLS certificate"
  type        = bool
  default     = true
}

variable "ssh_public_key" {
  description = "Public SSH key installed for the Ubuntu account"
  type        = string
}

variable "vm_started" {
  description = "Start the VM after creation. Keep false for the first apply on the memory-constrained host."
  type        = bool
  default     = false
}

variable "haru_vm_started" {
  description = "Start the Haru Minecraft worker VM after creation. Meant to run continuously (on_boot=true) once confirmed working; keep false only for the first apply."
  type        = bool
  default     = false
}
