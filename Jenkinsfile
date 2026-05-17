pipeline {
    agent any

    environment {
        AWS_REGION       = 'eu-west-1'
        AUTH_CLUSTER     = 'shopnow-auth-cluster'
        PRODUCTS_CLUSTER = 'shopnow-products-cluster'
        CORE_CLUSTER     = 'shopnow-core-cluster'
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Set Image Tag') {
            steps {
                script {
                    env.IMAGE_TAG = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    echo "Image tag: ${env.IMAGE_TAG}"
                }
            }
        }

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

        stage('Deploy to ECS') {
            steps {
                withCredentials([[
                    $class: 'AmazonWebServicesCredentialsBinding',
                    credentialsId: 'aws-credentials'
                ]]) {
                    script {
                        def services = [
                            [name: 'auth-service',    cluster: AUTH_CLUSTER,     taskFamily: 'auth-service'],
                            [name: 'product-service', cluster: PRODUCTS_CLUSTER, taskFamily: 'product-service'],
                            [name: 'cart-service',    cluster: CORE_CLUSTER,     taskFamily: 'cart-service'],
                            [name: 'order-service',   cluster: CORE_CLUSTER,     taskFamily: 'order-service'],
                            [name: 'frontend',        cluster: CORE_CLUSTER,     taskFamily: 'frontend'],
                        ]

                        services.each { svc ->
                            def image = "${ECR_REGISTRY}/shopnow/${svc.name}:${IMAGE_TAG}"

                            def rendered = sh(
                                script: """
                                    aws ecs describe-task-definition \
                                        --region ${AWS_REGION} \
                                        --task-definition ${svc.taskFamily} \
                                        --query 'taskDefinition' \
                                        --output json \
                                    | jq 'del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy)' \
                                    | jq '(.containerDefinitions[] | select(.name == "${svc.name}") | .image) = "${image}"'
                                """,
                                returnStdout: true
                            ).trim()

                            writeFile file: "rendered-${svc.name}.json", text: rendered

                            def newArn = sh(
                                script: """
                                    aws ecs register-task-definition \
                                        --region ${AWS_REGION} \
                                        --cli-input-json file://rendered-${svc.name}.json \
                                        --query 'taskDefinition.taskDefinitionArn' \
                                        --output text
                                """,
                                returnStdout: true
                            ).trim()

                            sh """
                                aws ecs update-service \
                                    --region ${AWS_REGION} \
                                    --cluster ${svc.cluster} \
                                    --service ${svc.name} \
                                    --task-definition ${newArn}
                            """

                            echo "${svc.name} → ${newArn}"
                        }
                    }
                }
            }
        }

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

    post {
        success {
            echo "Commit ${env.IMAGE_TAG} deployed successfully."
        }
        failure {
            echo "Deployment of ${env.IMAGE_TAG} failed. Check the logs above."
        }
        always {
            sh """
                docker rmi shopnow/auth-service:${IMAGE_TAG}     || true
                docker rmi shopnow/product-service:${IMAGE_TAG}  || true
                docker rmi shopnow/cart-service:${IMAGE_TAG}     || true
                docker rmi shopnow/order-service:${IMAGE_TAG}    || true
                docker rmi shopnow/frontend:${IMAGE_TAG}         || true
            """
            sh "rm -f rendered-*.json"
        }
    }
}
