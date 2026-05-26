resource "random_id" "suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "product_images" {
  bucket        = "${var.project_name}-product-images-${random_id.suffix.hex}"
  force_destroy = true

  tags = {
    Name = "${var.project_name}-product-images"
  }
}

resource "aws_s3_bucket_public_access_block" "product_images" {
  bucket = aws_s3_bucket.product_images.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_iam_role" "product_s3" {
  name = "${var.project_name}-product-s3-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = var.oidc_provider_arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:shopnow:shopnow-product-sa"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "product_s3" {
  name = "${var.project_name}-product-s3-policy"
  role = aws_iam_role.product_s3.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ]
      Resource = [
        aws_s3_bucket.product_images.arn,
        "${aws_s3_bucket.product_images.arn}/*"
      ]
    }]
  })
}
