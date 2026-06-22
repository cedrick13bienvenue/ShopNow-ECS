variable "project_name" {
  description = "Tag prefix applied to all resources"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID from the networking module"
  type        = string
}

variable "subnet_ids" {
  description = "Public subnet IDs for EKS nodes"
  type        = list(string)
}

variable "node_sg_id" {
  description = "Security group ID for worker nodes"
  type        = string
}

variable "cluster_role_arn" {
  description = "IAM role ARN for the EKS control plane"
  type        = string
}

variable "node_role_arn" {
  description = "IAM role ARN for worker nodes"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type for worker nodes"
  type        = string
  default     = "t3.medium"
}
