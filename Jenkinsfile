pipeline {
    agent any

    environment {
        AWS_REGION       = 'eu-west-1'
        IMAGE_TAG        = "${env.BUILD_NUMBER}"

        // ECS cluster names
        AUTH_CLUSTER     = 'shopnow-auth-cluster'
        PRODUCTS_CLUSTER = 'shopnow-products-cluster'
        CORE_CLUSTER     = 'shopnow-core-cluster'
    }

    stages {

        // ─────────────────────────────────────────
        // STAGE 1 — pull the latest code from GitHub
        // ─────────────────────────────────────────
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        // ─────────────────────────────────────────
        // STAGE 2 — build all 5 Docker images in
        // parallel (faster than one by one)
        // ─────────────────────────────────────────
        stage('Build Images') {
            parallel {
                stage('auth-service') {
                    steps {
                        sh "docker build -t shopnow/auth-service:${IMAGE_TAG} ./auth_service"
                    }
                }
                stage('product-service') {
                    steps {
                        sh "docker build -t shopnow/product-service:${IMAGE_TAG} ./product_service"
                    }
                }
                stage('cart-service') {
                    steps {
                        sh "docker build -t shopnow/cart-service:${IMAGE_TAG} ./cart_service"
                    }
                }
                stage('order-service') {
                    steps {
                        sh "docker build -t shopnow/order-service:${IMAGE_TAG} ./order_service"
                    }
                }
                stage('frontend') {
                    steps {
                        sh "docker build -t shopnow/frontend:${IMAGE_TAG} ./frontend"
                    }
                }
            }
        }

        // ─────────────────────────────────────────
        // STAGE 3 — log Docker into AWS ECR so it
        // can push images to our private repositories
        // ─────────────────────────────────────────
        stage('Login to ECR') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    script {
                        def accountId = sh(
                            script: "aws sts get-caller-identity --query Account --output text",
                            returnStdout: true
                        ).trim()
                        env.ECR_REGISTRY = "${accountId}.dkr.ecr.${AWS_REGION}.amazonaws.com"
                    }
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} \
                        | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    """
                }
            }
        }

        // ─────────────────────────────────────────
        // STAGE 4 — tag images with ECR registry
        // path and push in parallel
        // ─────────────────────────────────────────
        stage('Push to ECR') {
            parallel {
                stage('Push auth-service') {
                    steps {
                        sh """
                            docker tag  shopnow/auth-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/auth-service:${IMAGE_TAG}
                            docker tag  shopnow/auth-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/auth-service:latest
                            docker push ${ECR_REGISTRY}/shopnow/auth-service:${IMAGE_TAG}
                            docker push ${ECR_REGISTRY}/shopnow/auth-service:latest
                        """
                    }
                }
                stage('Push product-service') {
                    steps {
                        sh """
                            docker tag  shopnow/product-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/product-service:${IMAGE_TAG}
                            docker tag  shopnow/product-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/product-service:latest
                            docker push ${ECR_REGISTRY}/shopnow/product-service:${IMAGE_TAG}
                            docker push ${ECR_REGISTRY}/shopnow/product-service:latest
                        """
                    }
                }
                stage('Push cart-service') {
                    steps {
                        sh """
                            docker tag  shopnow/cart-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/cart-service:${IMAGE_TAG}
                            docker tag  shopnow/cart-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/cart-service:latest
                            docker push ${ECR_REGISTRY}/shopnow/cart-service:${IMAGE_TAG}
                            docker push ${ECR_REGISTRY}/shopnow/cart-service:latest
                        """
                    }
                }
                stage('Push order-service') {
                    steps {
                        sh """
                            docker tag  shopnow/order-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/order-service:${IMAGE_TAG}
                            docker tag  shopnow/order-service:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/order-service:latest
                            docker push ${ECR_REGISTRY}/shopnow/order-service:${IMAGE_TAG}
                            docker push ${ECR_REGISTRY}/shopnow/order-service:latest
                        """
                    }
                }
                stage('Push frontend') {
                    steps {
                        sh """
                            docker tag  shopnow/frontend:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/frontend:${IMAGE_TAG}
                            docker tag  shopnow/frontend:${IMAGE_TAG} ${ECR_REGISTRY}/shopnow/frontend:latest
                            docker push ${ECR_REGISTRY}/shopnow/frontend:${IMAGE_TAG}
                            docker push ${ECR_REGISTRY}/shopnow/frontend:latest
                        """
                    }
                }
            }
        }

        // ─────────────────────────────────────────
        // STAGE 5 — tell each ECS service to pull
        // the new image and do a rolling deploy
        // ─────────────────────────────────────────
        stage('Deploy to ECS') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    sh """
                        aws ecs update-service \
                            --region ${AWS_REGION} \
                            --cluster ${AUTH_CLUSTER} \
                            --service auth-service \
                            --force-new-deployment

                        aws ecs update-service \
                            --region ${AWS_REGION} \
                            --cluster ${PRODUCTS_CLUSTER} \
                            --service product-service \
                            --force-new-deployment

                        aws ecs update-service \
                            --region ${AWS_REGION} \
                            --cluster ${CORE_CLUSTER} \
                            --service cart-service \
                            --force-new-deployment

                        aws ecs update-service \
                            --region ${AWS_REGION} \
                            --cluster ${CORE_CLUSTER} \
                            --service order-service \
                            --force-new-deployment

                        aws ecs update-service \
                            --region ${AWS_REGION} \
                            --cluster ${CORE_CLUSTER} \
                            --service frontend \
                            --force-new-deployment
                    """
                }
            }
        }

        // ─────────────────────────────────────────
        // STAGE 6 — wait until all ECS services
        // finish deploying before marking build green
        // ─────────────────────────────────────────
        stage('Verify Deployment') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    sh """
                        aws ecs wait services-stable \
                            --region ${AWS_REGION} \
                            --cluster ${AUTH_CLUSTER} \
                            --services auth-service

                        aws ecs wait services-stable \
                            --region ${AWS_REGION} \
                            --cluster ${PRODUCTS_CLUSTER} \
                            --services product-service

                        aws ecs wait services-stable \
                            --region ${AWS_REGION} \
                            --cluster ${CORE_CLUSTER} \
                            --services cart-service order-service frontend
                    """
                }
            }
        }
    }

    // ─────────────────────────────────────────
    // POST — runs after all stages regardless
    // of success or failure
    // ─────────────────────────────────────────
    post {
        success {
            echo "Build #${env.BUILD_NUMBER} deployed successfully."
        }
        failure {
            echo "Build #${env.BUILD_NUMBER} failed. Check the logs above."
        }
        always {
            sh """
                docker rmi shopnow/auth-service:${IMAGE_TAG}     || true
                docker rmi shopnow/product-service:${IMAGE_TAG}  || true
                docker rmi shopnow/cart-service:${IMAGE_TAG}     || true
                docker rmi shopnow/order-service:${IMAGE_TAG}    || true
                docker rmi shopnow/frontend:${IMAGE_TAG}         || true
            """
        }
    }
}
