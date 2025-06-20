@echo off
setlocal enabledelayedexpansion

REM BahinLink Installation and Startup Script for Windows
REM This script installs all dependencies and starts the complete BahinLink application

echo.
echo 🚀 BahinLink Installation and Setup
echo ====================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
) else (
    echo [SUCCESS] Node.js is installed
)

REM Check if npm is installed
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm is not installed. Please install npm
    pause
    exit /b 1
) else (
    echo [SUCCESS] npm is installed
)

REM Setup environment files
echo [INFO] Setting up environment files...

if not exist .env (
    if exist .env.example (
        copy .env.example .env >nul
        echo [SUCCESS] Created .env file from .env.example
        echo [WARNING] Please update .env file with your actual configuration values
    ) else (
        echo [WARNING] .env.example not found. Creating basic .env file
        (
            echo NODE_ENV=development
            echo PORT=3000
            echo DATABASE_URL="postgresql://postgres:password@localhost:5432/bahinlink"
            echo REDIS_URL="redis://localhost:6379"
            echo CLERK_SECRET_KEY=sk_test_your-clerk-secret-key-here
            echo CLERK_WEBHOOK_SECRET=whsec_your-clerk-webhook-secret-here
            echo CLERK_PUBLISHABLE_KEY=pk_test_your-clerk-publishable-key-here
            echo ENCRYPTION_KEY=your-32-byte-encryption-key-here
            echo CORS_ORIGIN=http://localhost:3001
        ) > .env
    )
) else (
    echo [SUCCESS] .env file already exists
)

REM Setup admin portal environment
if not exist admin-portal\.env (
    (
        echo REACT_APP_API_URL=http://localhost:3000/api
        echo REACT_APP_WS_URL=ws://localhost:3000
        echo REACT_APP_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
    ) > admin-portal\.env
    echo [SUCCESS] Created admin-portal/.env file
)

REM Setup client portal environment
if not exist client-portal\.env (
    (
        echo REACT_APP_API_URL=http://localhost:3000/api
        echo REACT_APP_WS_URL=ws://localhost:3000
        echo REACT_APP_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
    ) > client-portal\.env
    echo [SUCCESS] Created client-portal/.env file
)

REM Install backend dependencies
echo [INFO] Installing backend dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)
echo [SUCCESS] Backend dependencies installed

REM Install admin portal dependencies
echo [INFO] Installing admin portal dependencies...
cd admin-portal
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install admin portal dependencies
    pause
    exit /b 1
)
echo [SUCCESS] Admin portal dependencies installed
cd ..

REM Install client portal dependencies
echo [INFO] Installing client portal dependencies...
cd client-portal
call npm install
if errorlevel 1 (
    echo [ERROR] Failed to install client portal dependencies
    pause
    exit /b 1
)
echo [SUCCESS] Client portal dependencies installed
cd ..

REM Ask about mobile app installation
set /p install_mobile="Do you want to install mobile app dependencies? (y/n): "
if /i "%install_mobile%"=="y" (
    echo [INFO] Installing mobile app dependencies...
    
    REM Check if Expo CLI is installed
    expo --version >nul 2>&1
    if errorlevel 1 (
        echo [INFO] Installing Expo CLI globally...
        call npm install -g @expo/cli
    )
    
    cd mobile
    call npm install
    if errorlevel 1 (
        echo [ERROR] Failed to install mobile app dependencies
        pause
        exit /b 1
    )
    echo [SUCCESS] Mobile app dependencies installed
    cd ..
)

REM Create logs directory
if not exist logs mkdir logs

REM Create stop script
echo [INFO] Creating stop script...
(
    echo @echo off
    echo echo [INFO] Stopping BahinLink services...
    echo.
    echo REM Kill Node.js processes on our ports
    echo for /f "tokens=5" %%%%a in ^('netstat -aon ^| find ":3000" ^| find "LISTENING"'^) do taskkill /f /pid %%%%a 2^>nul
    echo for /f "tokens=5" %%%%a in ^('netstat -aon ^| find ":3001" ^| find "LISTENING"'^) do taskkill /f /pid %%%%a 2^>nul
    echo for /f "tokens=5" %%%%a in ^('netstat -aon ^| find ":3002" ^| find "LISTENING"'^) do taskkill /f /pid %%%%a 2^>nul
    echo.
    echo echo [SUCCESS] All services stopped
    echo pause
) > stop-services.bat
echo [SUCCESS] Created stop-services.bat

REM Database setup instructions
echo.
echo [INFO] Database Setup Instructions:
echo 1. Install PostgreSQL and create a database named 'bahinlink'
echo 2. Install Redis and start the Redis server
echo 3. Update the DATABASE_URL and REDIS_URL in your .env file
echo 4. Run the following commands:
echo    npm run db:migrate
echo    npm run db:seed
echo.
set /p db_setup="Have you completed the database setup? (y/n): "
if /i not "%db_setup%"=="y" (
    echo [WARNING] Please complete database setup before starting services
    echo You can run this script again after setting up the database
    pause
    exit /b 0
)

REM Ask about starting services
echo.
set /p start_services="Do you want to start all services now? (y/n): "
if /i "%start_services%"=="y" (
    echo [INFO] Starting BahinLink services...
    echo.
    
    REM Start backend API
    echo [INFO] Starting Backend API...
    start "BahinLink Backend" cmd /k "npm start"
    timeout /t 3 /nobreak >nul
    
    REM Start admin portal
    echo [INFO] Starting Admin Portal...
    start "BahinLink Admin Portal" cmd /k "cd admin-portal && npm start"
    timeout /t 2 /nobreak >nul
    
    REM Start client portal
    echo [INFO] Starting Client Portal...
    start "BahinLink Client Portal" cmd /k "cd client-portal && npm start"
    
    echo.
    echo [SUCCESS] All services are starting!
    echo.
    echo 🚀 BahinLink is now running:
    echo    📊 Admin Portal: http://localhost:3001
    echo    👥 Client Portal: http://localhost:3002  
    echo    🔧 Backend API: http://localhost:3000
    echo    📱 Mobile App: cd mobile ^&^& npm start
    echo.
    echo 📋 Each service is running in its own command window
    echo 🛑 To stop all services, run: stop-services.bat
    echo.
) else (
    echo [INFO] To start services later, run this script again
)

echo.
echo [SUCCESS] 🎉 BahinLink installation completed!
echo.
echo 📖 Next steps:
echo    1. Update .env files with your actual configuration
echo    2. Configure external services (AWS, Firebase, etc.)
echo    3. Access the applications at the URLs shown above
echo    4. Check the documentation in docs/ directory
echo.

pause
