import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Card, Title, Paragraph } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { theme } from '../theme';

interface QuickActionCardProps {
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

const QuickActionCard: React.FC<QuickActionCardProps> = ({
  icon,
  title,
  subtitle,
  onPress,
}) => {
  return (
    <TouchableOpacity onPress={onPress} style={styles.container}>
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          <Icon name={icon} size={32} color={theme.colors.primary} />
          <Title style={styles.title}>{title}</Title>
          <Paragraph style={styles.subtitle}>{subtitle}</Paragraph>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    margin: 4,
  },
  card: {
    elevation: 2,
  },
  content: {
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 12,
    textAlign: 'center',
    color: theme.colors.outline,
    marginTop: 4,
  },
});

export default QuickActionCard;
