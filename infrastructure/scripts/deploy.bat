@echo off
REM Cloud-native File Operations Platform Deployment Script for Windows

setlocal enabledelayedexpansion

REM Configuration
set TERRAFORM_DIR=infrastructure\terraform

REM Colors (Windows doesn't support colors in batch easily, so we'll use echo)
echo [INFO] Starting deployment of Cloud-native File Operations Platform...

REM Check prerequisites
echo [INFO] Checking prerequisites...

REM Check if gcloud is installed
gcloud version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] gcloud CLI is not installed. Please install it first.
    exit /b 1
)

REM Check if terraform is installed
terraform version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Terraform is not installed. Please install it first.
    exit /b 1
)

REM Check if authenticated with gcloud
for /f "tokens=*" %%i in ('gcloud auth list --filter=status:ACTIVE --format="value(account)" 2^>nul') do set GCLOUD_ACCOUNT=%%i
if "!GCLOUD_ACCOUNT!"=="" (
    echo [ERROR] Not authenticated with gcloud. Please run 'gcloud auth login'
    exit /b 1
)

REM Get project ID
if "%PROJECT_ID%"=="" (
    for /f "tokens=*" %%i in ('gcloud config get-value project 2^>nul') do set PROJECT_ID=%%i
)
if "!PROJECT_ID!"=="" (
    echo [ERROR] PROJECT_ID is not set. Please set it as environment variable or configure gcloud project.
    exit /b 1
)

echo [INFO] Prerequisites check passed. Project ID: !PROJECT_ID!

REM Setup Terraform
echo [INFO] Setting up Terraform...
cd %TERRAFORM_DIR%

REM Initialize Terraform
terraform init
if errorlevel 1 (
    echo [ERROR] Terraform initialization failed
    exit /b 1
)

REM Create terraform.tfvars if it doesn't exist
if not exist terraform.tfvars (
    echo [WARN] terraform.tfvars not found. Creating from example...
    copy terraform.tfvars.example terraform.tfvars
    
    REM Update project_id in terraform.tfvars (basic replacement)
    powershell -Command "(Get-Content terraform.tfvars) -replace 'your-gcp-project-id', '!PROJECT_ID!' | Set-Content terraform.tfvars"
    
    echo [WARN] Please review and update terraform.tfvars with your specific values before proceeding.
    pause
)

REM Plan the deployment
echo [INFO] Planning infrastructure deployment...
terraform plan -var="project_id=!PROJECT_ID!" -var="environment=%ENVIRONMENT%"
if errorlevel 1 (
    echo [ERROR] Terraform planning failed
    exit /b 1
)

REM Ask for confirmation
set /p CONFIRM="Do you want to proceed with the deployment? (y/N): "
if /i "!CONFIRM!"=="y" (
    echo [INFO] Deploying infrastructure...
    terraform apply -var="project_id=!PROJECT_ID!" -var="environment=%ENVIRONMENT%" -auto-approve
    if errorlevel 1 (
        echo [ERROR] Terraform deployment failed
        exit /b 1
    )
    echo [INFO] Infrastructure deployment completed successfully!
) else (
    echo [WARN] Deployment cancelled by user.
    exit /b 0
)

cd ..\..

REM Setup App Engine services
echo [INFO] Setting up App Engine services...

REM Create app.yaml files for Node.js services if they don't exist
for %%s in (auth-service notification-service api-gateway) do (
    if exist "services\%%s" (
        if not exist "services\%%s\app.yaml" (
            echo [INFO] Creating app.yaml for %%s...
            (
                echo runtime: nodejs18
                echo service: %%s
                echo.
                echo env_variables:
                echo   NODE_ENV: %ENVIRONMENT%
                echo   PROJECT_ID: !PROJECT_ID!
                echo.
                echo vpc_access_connector:
                echo   name: projects/!PROJECT_ID!/locations/us-central1/connectors/file-ops-platform-vpc-connector
                echo.
                echo automatic_scaling:
                echo   min_instances: 0
                echo   max_instances: 10
                echo   target_cpu_utilization: 0.6
            ) > "services\%%s\app.yaml"
        )
    )
)

REM Create app.yaml files for Go services if they don't exist
for %%s in (file-service tenant-service audit-service search-service) do (
    if exist "services\%%s" (
        if not exist "services\%%s\app.yaml" (
            echo [INFO] Creating app.yaml for %%s...
            (
                echo runtime: go119
                echo service: %%s
                echo.
                echo env_variables:
                echo   GO_ENV: %ENVIRONMENT%
                echo   PROJECT_ID: !PROJECT_ID!
                echo.
                echo vpc_access_connector:
                echo   name: projects/!PROJECT_ID!/locations/us-central1/connectors/file-ops-platform-vpc-connector
                echo.
                echo automatic_scaling:
                echo   min_instances: 0
                echo   max_instances: 10
                echo   target_cpu_utilization: 0.6
            ) > "services\%%s\app.yaml"
        )
    )
)

REM Create app.yaml files for Python services if they don't exist
for %%s in (processing-service monitoring-service) do (
    if exist "services\%%s" (
        if not exist "services\%%s\app.yaml" (
            echo [INFO] Creating app.yaml for %%s...
            (
                echo runtime: python39
                echo service: %%s
                echo.
                echo env_variables:
                echo   PYTHON_ENV: %ENVIRONMENT%
                echo   PROJECT_ID: !PROJECT_ID!
                echo.
                echo vpc_access_connector:
                echo   name: projects/!PROJECT_ID!/locations/us-central1/connectors/file-ops-platform-vpc-connector
                echo.
                echo automatic_scaling:
                echo   min_instances: 0
                echo   max_instances: 10
                echo   target_cpu_utilization: 0.6
            ) > "services\%%s\app.yaml"
        )
    )
)

echo [INFO] Deployment completed successfully!
echo [INFO] You can now deploy individual services using 'gcloud app deploy' in each service directory.
echo [INFO] Web interface will be available at: https://!PROJECT_ID!.appspot.com

endlocal