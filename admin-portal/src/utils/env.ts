/**
 * Environment Configuration Validation
 * Validates required environment variables for Clerk authentication
 */

interface EnvironmentConfig {
  apiUrl: string;
  wsUrl: string;
  googleMapsApiKey: string;
  clerk: {
    publishableKey: string;
    signInUrl: string;
    signUpUrl: string;
    afterSignInUrl: string;
    afterSignUpUrl: string;
  };
}

/**
 * Validates and returns environment configuration
 * Throws error if required variables are missing
 */
export const getEnvironmentConfig = (): EnvironmentConfig => {
  const requiredVars = {
    REACT_APP_API_URL: process.env.REACT_APP_API_URL,
    REACT_APP_WS_URL: process.env.REACT_APP_WS_URL,
    REACT_APP_CLERK_PUBLISHABLE_KEY: process.env.REACT_APP_CLERK_PUBLISHABLE_KEY,
  };

  // Check for missing required variables
  const missingVars = Object.entries(requiredVars)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  return {
    apiUrl: process.env.REACT_APP_API_URL!,
    wsUrl: process.env.REACT_APP_WS_URL!,
    googleMapsApiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '',
    clerk: {
      publishableKey: process.env.REACT_APP_CLERK_PUBLISHABLE_KEY!,
      signInUrl: process.env.REACT_APP_CLERK_SIGN_IN_URL || '/sign-in',
      signUpUrl: process.env.REACT_APP_CLERK_SIGN_UP_URL || '/sign-up',
      afterSignInUrl: process.env.REACT_APP_CLERK_AFTER_SIGN_IN_URL || '/dashboard',
      afterSignUpUrl: process.env.REACT_APP_CLERK_AFTER_SIGN_UP_URL || '/dashboard',
    },
  };
};

/**
 * Validates environment configuration on app startup
 */
export const validateEnvironment = (): void => {
  try {
    getEnvironmentConfig();
    console.log('✅ Environment configuration validated successfully');
  } catch (error) {
    console.error('❌ Environment validation failed:', error);
    throw error;
  }
};

// Export individual environment values for convenience
export const ENV = getEnvironmentConfig();
