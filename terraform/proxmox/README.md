# Proxmox Race worker

This Terraform configuration creates VM `105` (`k8s-race-worker1`) as a linked clone of Ubuntu 24.04 cloud-init template `1000`.

## Safety defaults

- The VM is created stopped (`vm_started = false`).
- It does not start automatically with Proxmox.
- It uses a linked clone and inherits the template's 50 GiB disk.
- It uses 2 vCPU and 4096 MiB RAM with the balloon device enabled.
- The template must not be deleted while this linked clone exists.

## 1. Check the address and VM ID

Run these before applying:

```bash
ping -c 3 192.168.100.7
qm status 105
```

`qm status 105` should report that the VM does not exist. A failed ping alone does not prove that an address is unused; also check DHCP leases and the ARP table.

## 2. Create a Proxmox API token

On the Proxmox host, follow the provider's API-token setup guide. Save the returned secret immediately; Proxmox displays it once.

Do not store the token in `terraform.tfvars` or Git.

## 3. Configure Terraform

```bash
cp terraform.tfvars.example terraform.tfvars
```

Replace `ssh_public_key` with the contents of your `.pub` file.

Export the token only in the current shell:

```bash
export TF_VAR_proxmox_api_token='terraform@pve!provider=REPLACE_WITH_SECRET'
```

## 4. Initialize and preview

```bash
terraform init
terraform fmt -check
terraform validate
terraform plan -out=race-worker.tfplan
```

Check that the plan creates only VM 105. Then apply it:

```bash
terraform apply race-worker.tfplan
```

The first apply creates the VM but leaves it stopped.

## 5. Start only when ready

After checking Proxmox memory, change this in `terraform.tfvars`:

```hcl
vm_started = true
```

Then run a new plan and apply. Never reuse the old plan file after changing variables.

## After first boot

```bash
ssh ubuntu@192.168.100.7
```

The next stage installs the k3s agent and applies the node label `workload=minecraft-race`. The k3s join token must not be stored in this Terraform directory or committed to Git.

## Haru Minecraft worker (VM 109, `k8s-haru-worker1`)

Same linked-clone pattern as the race worker above, kept as a **separate VM** so Haru's
automated play never competes with a live race for CPU/RAM, and so her world is never
touched by the race platform's match lifecycle.

Differences from the race worker:

- Meant to run **continuously**, not just during events — `on_boot = true`, so it restarts
  automatically if the Proxmox host reboots.
- Controlled by its own variable, `haru_vm_started`, independent of `vm_started`.

Same safety process applies — check before creating:

```bash
ping -c 3 192.168.100.9
qm status 109
```

`qm status 109` should report that the VM does not exist yet. Then:

```bash
terraform plan -out=haru-worker.tfplan
# check the plan touches only the haru_worker resource
terraform apply haru-worker.tfplan
```

First apply leaves it stopped (`haru_vm_started = false`). Once you've confirmed it boots
correctly (`ssh ubuntu@192.168.100.9`, join it to k3s, label it `workload=haru-minecraft`),
set `haru_vm_started = true` in `terraform.tfvars` and re-apply — from then on it stays
running continuously, including across Proxmox host restarts.
