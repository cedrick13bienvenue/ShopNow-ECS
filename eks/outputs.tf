output "cluster_name" {
  value = module.eks.cluster_name
}

output "cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "kubeconfig_command" {
  description = "Run this after apply to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

output "bucket_name" {
  description = "S3 bucket name — set as S3_BUCKET env var in product-service"
  value       = module.s3.bucket_name
}

output "product_s3_role_arn" {
  description = "IRSA role ARN — annotate shopnow-product-sa ServiceAccount with this"
  value       = module.s3.product_s3_role_arn
}
