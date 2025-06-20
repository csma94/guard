import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Card,
  Title,
  TextInput,
  Button,
  Checkbox,
  Divider,
} from 'react-native-paper';
import { useDispatch, useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { RootState, AppDispatch } from '../../store';
import { login } from '../../store/slices/authSlice';
import { theme } from '../../theme';

const LoginScreen: React.FC = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((state: RootState) => state.auth);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!username.trim()) {
      Alert.alert('Validation Error', 'Please enter your username');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Validation Error', 'Please enter your password');
      return;
    }

    try {
      await dispatch(login({
        username: username.trim(),
        password: password.trim(),
        rememberMe,
      })).unwrap();
    } catch (error: any) {
      Alert.alert('Login Failed', error.message || 'Invalid credentials');
    }
  };

  const handleForgotPassword = () => {
    Alert.alert(
      'Forgot Password',
      'Please contact your administrator to reset your password.',
      [{ text: 'OK' }]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Icon name="shield-check" size={80} color={theme.colors.primary} />
          <Title style={styles.appTitle}>BahinLink</Title>
          <Text style={styles.subtitle}>Security Workforce Management</Text>
        </View>

        <Card style={styles.loginCard}>
          <Card.Content>
            <Title style={styles.loginTitle}>Sign In</Title>
            <Text style={styles.loginSubtitle}>
              Enter your credentials to access your account
            </Text>

            <Divider style={styles.divider} />

            <TextInput
              label="Username"
              value={username}
              onChangeText={setUsername}
              style={styles.input}
              mode="outlined"
              left={<TextInput.Icon icon="account" />}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              mode="outlined"
              secureTextEntry={!showPassword}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? 'eye-off' : 'eye'}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
            />

            <View style={styles.optionsContainer}>
              <View style={styles.checkboxContainer}>
                <Checkbox
                  status={rememberMe ? 'checked' : 'unchecked'}
                  onPress={() => setRememberMe(!rememberMe)}
                />
                <Text style={styles.checkboxLabel}>Remember me</Text>
              </View>

              <Button
                mode="text"
                onPress={handleForgotPassword}
                style={styles.forgotButton}
                labelStyle={styles.forgotButtonText}
              >
                Forgot Password?
              </Button>
            </View>

            {error && (
              <View style={styles.errorContainer}>
                <Icon name="alert-circle" size={20} color={theme.colors.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={isLoading}
              disabled={isLoading}
              style={styles.loginButton}
              icon="login"
            >
              Sign In
            </Button>
          </Card.Content>
        </Card>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            BahinLink v1.0.0
          </Text>
          <Text style={styles.footerText}>
            © 2024 Bahin SARL. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.outline,
    marginTop: 8,
    textAlign: 'center',
  },
  loginCard: {
    elevation: 4,
    marginBottom: 24,
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 14,
    color: theme.colors.outline,
    textAlign: 'center',
    marginBottom: 16,
  },
  divider: {
    marginBottom: 24,
  },
  input: {
    marginBottom: 16,
  },
  optionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    fontSize: 14,
    color: theme.colors.onSurface,
    marginLeft: 8,
  },
  forgotButton: {
    marginRight: -8,
  },
  forgotButtonText: {
    fontSize: 14,
    color: theme.colors.primary,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.errorContainer,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.error,
    marginLeft: 8,
    flex: 1,
  },
  loginButton: {
    paddingVertical: 8,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 12,
    color: theme.colors.outline,
    textAlign: 'center',
    marginBottom: 4,
  },
});

export default LoginScreen;
