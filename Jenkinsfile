pipeline {
    agent any

    environment {
        AWS_REGION      = 'eu-west-1'
        AWS_ACCOUNT_ID  = credentials('aws-account-id')
        ECR_REGISTRY    = "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
        IMAGE_TAG       = "${env.BUILD_NUMBER}"

        // ECR repository names
        AUTH_REPO       = "${ECR_REGISTRY}/shopnow/auth-service"
        PRODUCT_REPO    = "${ECR_REGISTRY}/shopnow/product-service"
        CART_REPO       = "${ECR_REGISTRY}/shopnow/cart-service"
        ORDER_REPO      = "${ECR_REGISTRY}/shopnow/order-service"
        FRONTEND_REPO   = "${ECR_REGISTRY}/shopnow/frontend"

        // ECS cluster names
        AUTH_CLUSTER    = 'shopnow-auth-cluster'
        PRODUCTS_CLUSTER = 'shopnow-products-cluster'
        CORE_CLUSTER    = 'shopnow-core-cluster'
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
        // STAGE 2 — build all 5 Docker images at the
        // same time (parallel = faster)
        // ─────────────────────────────────────────
        stage('Build Images') {
            parallel {
                stage('auth-service') {
                    steps {
                        sh "docker build -t ${AUTH_REPO}:${IMAGE_TAG} ./auth_service"
                    }
                }
                stage('product-service') {
                    steps {
                        sh "docker build -t ${PRODUCT_REPO}:${IMAGE_TAG} ./product_service"
                    }
                }
                stage('cart-service') {
                    steps {
                        sh "docker build -t ${CART_REPO}:${IMAGE_TAG} ./cart_service"
                    }
                }
                stage('order-service') {
                    steps {
                        sh "docker build -t ${ORDER_REPO}:${IMAGE_TAG} ./order_service"
                    }
                }
                stage('frontend') {
                    steps {
                        sh "docker build -t ${FRONTEND_REPO}:${IMAGE_TAG} ./frontend"
                    }
                }
            }
        }

        // ─────────────────────────────────────────
        // STAGE 3 — log Docker into AWS ECR so it can
        // push images to our private repositories
        // ─────────────────────────────────────────
        stage('Login to ECR') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    sh """
                        aws ecr get-login-password --region ${AWS_REGION} \
                        | docker login --username AWS --password-stdin ${ECR_REGISTRY}
                    """
                }
            }
        }

        // ─────────────────────────────────────────
        // STAGE 4 — push all 5 images to ECR in parallel
        // also tag as :latest so ECS always has a
        // stable pointer alongside the build number tag
        // ─────────────────────────────────────────
        stage('Push to ECR') {
            parallel {
                stage('Push auth-service') {
                    steps {
                        sh """
                            docker tag  ${AUTH_REPO}:${IMAGE_TAG} ${AUTH_REPO}:latest
                            docker push ${AUTH_REPO}:${IMAGE_TAG}
                            docker push ${AUTH_REPO}:latest
                        """
                    }
                }
                stage('Push product-service') {
                    steps {
                        sh """
                            docker tag  ${PRODUCT_REPO}:${IMAGE_TAG} ${PRODUCT_REPO}:latest
                            docker push ${PRODUCT_REPO}:${IMAGE_TAG}
                            docker push ${PRODUCT_REPO}:latest
                        """
                    }
                }
                stage('Push cart-service') {
                    steps {
                        sh """
                            docker tag  ${CART_REPO}:${IMAGE_TAG} ${CART_REPO}:latest
                            docker push ${CART_REPO}:${IMAGE_TAG}
                            docker push ${CART_REPO}:latest
                        """
                    }
                }
                stage('Push order-service') {
                    steps {
                        sh """
                            docker tag  ${ORDER_REPO}:${IMAGE_TAG} ${ORDER_REPO}:latest
                            docker push ${ORDER_REPO}:${IMAGE_TAG}
                            docker push ${ORDER_REPO}:latest
                        """
                    }
                }
                stage('Push frontend') {
                    steps {
                        sh """
                            docker tag  ${FRONTEND_REPO}:${IMAGE_TAG} ${FRONTEND_REPO}:latest
                            docker push ${FRONTEND_REPO}:${IMAGE_TAG}
                            docker push ${FRONTEND_REPO}:latest
                        """
                    }
                }
            }
        }

        // ─────────────────────────────────────────
        // STAGE 5 — tell each ECS service to pull the
        // new image and do a rolling deploy
        // (old task stays up until new one is healthy)
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
        // STAGE 6 — wait until all ECS services finish
        // deploying before marking the build green
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
    // POST — runs after all stages regardless of
    // success or failure
    // ─────────────────────────────────────────
    post {
        success {
            echo "Build #${env.BUILD_NUMBER} deployed successfully."
        }
        failure {
            echo "Build #${env.BUILD_NUMBER} failed. Check the logs above."
        }
        always {
            // clean up local images to free disk space on the Jenkins server
            sh """
                docker rmi ${AUTH_REPO}:${IMAGE_TAG}     || true
                docker rmi ${PRODUCT_REPO}:${IMAGE_TAG}  || true
                docker rmi ${CART_REPO}:${IMAGE_TAG}     || true
                docker rmi ${ORDER_REPO}:${IMAGE_TAG}    || true
                docker rmi ${FRONTEND_REPO}:${IMAGE_TAG} || true
            """
        }
    }
}
