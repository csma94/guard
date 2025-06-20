import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { colors, typography, spacing } from '../theme';

const { width } = Dimensions.get('window');
const buttonWidth = (width - spacing.lg * 2 - spacing.sm) / 2;

interface QuickActionButtonProps {
  title: string;
  icon: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}

export const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  title,
  icon,
  color,
  onPress,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        { 
          width: buttonWidth,
          backgroundColor: disabled ? colors.disabled : `${color}15`,
          borderColor: disabled ? colors.disabled : color,
        }
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Icon 
        name={icon} 
        size={32} 
        color={disabled ? colors.textSecondary : color} 
        style={styles.icon}
      />
      <Text style={[
        styles.title,
        { color: disabled ? colors.textSecondary : colors.textPrimary }
      ]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  icon: {
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    textAlign: 'center',
  },
});
