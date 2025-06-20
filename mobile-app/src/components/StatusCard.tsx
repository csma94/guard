import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Card } from './Card';
import { colors, typography, spacing } from '../theme';

const { width } = Dimensions.get('window');
const cardWidth = (width - spacing.lg * 2 - spacing.sm) / 2;

interface StatusCardProps {
  title: string;
  value: string;
  icon: string;
  color: string;
  subtitle?: string;
}

export const StatusCard: React.FC<StatusCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
}) => {
  return (
    <Card style={[styles.container, { width: cardWidth }]}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${color}20` }]}>
          <Icon name={icon} size={24} color={color} />
        </View>
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  value: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
});
