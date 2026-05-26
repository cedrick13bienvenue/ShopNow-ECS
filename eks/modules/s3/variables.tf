variable "project_name" {
  description = "Tag prefix applied to all resources"
  type        = string
}

variable "oidc_provider_arn" {
  description = "OIDC provider ARN from the EKS cluster"
  type        = string
}

variable "oidc_provider_url" {
  description = "OIDC provider URL without https:// prefix"
  type        = string
}
