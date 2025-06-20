import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Custom color palette for BahinLink
const colors = {
  primary: '#1976D2',
  primaryContainer: '#E3F2FD',
  secondary: '#03DAC6',
  secondaryContainer: '#E0F2F1',
  tertiary: '#FF9800',
  tertiaryContainer: '#FFF3E0',
  surface: '#FFFFFF',
  surfaceVariant: '#F5F5F5',
  background: '#FAFAFA',
  error: '#B00020',
  errorContainer: '#FFEBEE',
  warning: '#FF9800',
  warningContainer: '#FFF3E0',
  success: '#4CAF50',
  successContainer: '#E8F5E8',
  info: '#2196F3',
  infoContainer: '#E3F2FD',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#1976D2',
  onSecondary: '#000000',
  onSecondaryContainer: '#00695C',
  onTertiary: '#000000',
  onTertiaryContainer: '#E65100',
  onSurface: '#1C1B1F',
  onSurfaceVariant: '#49454F',
  onBackground: '#1C1B1F',
  onError: '#FFFFFF',
  onErrorContainer: '#B00020',
  outline: '#79747E',
  outlineVariant: '#CAC4D0',
  shadow: '#000000',
  scrim: '#000000',
  inverseSurface: '#313033',
  inverseOnSurface: '#F4EFF4',
  inversePrimary: '#90CAF9',
  elevation: {
    level0: 'transparent',
    level1: '#F7F2FA',
    level2: '#F1ECF6',
    level3: '#ECE6F0',
    level4: '#E9E3EA',
    level5: '#E6E0E9',
  },
};

// Light theme configuration
export const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...colors,
  },
  fonts: {
    ...MD3LightTheme.fonts,
    default: {
      fontFamily: 'System',
    },
  },
  roundness: 8,
};

// Dark theme configuration (for future use)
export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#90CAF9',
    primaryContainer: '#0D47A1',
    secondary: '#80CBC4',
    secondaryContainer: '#004D40',
    tertiary: '#FFB74D',
    tertiaryContainer: '#E65100',
    surface: '#1E1E1E',
    surfaceVariant: '#2E2E2E',
    background: '#121212',
    error: '#CF6679',
    errorContainer: '#B00020',
    warning: '#FFB74D',
    warningContainer: '#E65100',
    success: '#81C784',
    successContainer: '#2E7D32',
    info: '#64B5F6',
    infoContainer: '#1565C0',
    onPrimary: '#000000',
    onPrimaryContainer: '#90CAF9',
    onSecondary: '#000000',
    onSecondaryContainer: '#80CBC4',
    onTertiary: '#000000',
    onTertiaryContainer: '#FFB74D',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#CAC4D0',
    onBackground: '#FFFFFF',
    onError: '#000000',
    onErrorContainer: '#CF6679',
    outline: '#938F99',
    outlineVariant: '#49454F',
    shadow: '#000000',
    scrim: '#000000',
    inverseSurface: '#E6E1E5',
    inverseOnSurface: '#313033',
    inversePrimary: '#1976D2',
    elevation: {
      level0: 'transparent',
      level1: '#242424',
      level2: '#2E2E2E',
      level3: '#383838',
      level4: '#404040',
      level5: '#484848',
    },
  },
  roundness: 8,
};

// Typography scale
export const typography = {
  displayLarge: {
    fontSize: 57,
    lineHeight: 64,
    fontWeight: '400' as const,
  },
  displayMedium: {
    fontSize: 45,
    lineHeight: 52,
    fontWeight: '400' as const,
  },
  displaySmall: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: '400' as const,
  },
  headlineLarge: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '400' as const,
  },
  headlineMedium: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '400' as const,
  },
  headlineSmall: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '400' as const,
  },
  titleLarge: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '400' as const,
  },
  titleMedium: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500' as const,
  },
  titleSmall: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
  },
  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
  },
  labelLarge: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500' as const,
  },
  labelMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500' as const,
  },
  labelSmall: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500' as const,
  },
};

// Spacing scale
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// Shadow styles
export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
};

export default theme;
