# Remote backend: state stored in S3, locked via DynamoDB.
# Run backend/ first to create these resources before initialising here.
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "cedrick-shopnow-eks-state"
    key            = "shopnow-eks/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "shopnow-eks-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# ── Modules ───────────────────────────────────────────────────────────────────

module "networking" {
  source       = "./modules/networking"
  project_name = var.project_name
  aws_region   = var.aws_region
}

module "iam" {
  source       = "./modules/iam"
  project_name = var.project_name
}

module "eks" {
  source           = "./modules/eks"
  project_name     = var.project_name
  vpc_id           = module.networking.vpc_id
  subnet_ids       = module.networking.public_subnet_ids
  node_sg_id       = module.networking.node_sg_id
  cluster_role_arn = module.iam.cluster_role_arn
  node_role_arn    = module.iam.node_role_arn
  instance_type    = var.instance_type
}

module "s3" {
  source            = "./modules/s3"
  project_name      = var.project_name
  oidc_provider_arn = module.eks.oidc_provider_arn
  oidc_provider_url = module.eks.oidc_provider_url
}
