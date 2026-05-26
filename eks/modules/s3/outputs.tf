output "bucket_name" {
  value = aws_s3_bucket.product_images.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.product_images.arn
}

output "product_s3_role_arn" {
  value = aws_iam_role.product_s3.arn
}
