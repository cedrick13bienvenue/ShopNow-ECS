variable "aws_region" {
  description = "AWS region for backend resources"
  type        = string
  default     = "eu-west-1"
}

variable "bucket_name" {
  description = "S3 bucket name for Terraform state"
  type        = string
  default     = "cedrick-shopnow-eks-state"
}

variable "dynamodb_table" {
  description = "DynamoDB table name for state locking"
  type        = string
  default     = "shopnow-eks-lock"
}
