import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import {
  Card,
  Title,
  Paragraph,
  Button,
  Chip,
  Searchbar,
  List,
  Divider,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';

import { RootState, AppDispatch } from '../store';
import { getReportTemplates } from '../store/slices/reportSlice';
import { theme } from '../theme';

interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  reportType: string;
  fields: Array<{
    id: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'checkbox' | 'number' | 'date';
    required: boolean;
    options?: string[];
    placeholder?: string;
    defaultValue?: any;
  }>;
  priority: string;
  tags: string[];
  isCustom: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ReportTemplatesProps {
  visible: boolean;
  onClose: () => void;
  onSelectTemplate: (template: ReportTemplate) => void;
  reportType?: string;
}

const ReportTemplates: React.FC<ReportTemplatesProps> = ({
  visible,
  onClose,
  onSelectTemplate,
  reportType,
}) => {
  const dispatch = useDispatch<AppDispatch>();
  const { templates, isLoading } = useSelector((state: RootState) => state.report);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [filteredTemplates, setFilteredTemplates] = useState<ReportTemplate[]>([]);

  useEffect(() => {
    if (visible) {
      dispatch(getReportTemplates({ reportType }));
    }
  }, [visible, reportType, dispatch]);

  useEffect(() => {
    filterTemplates();
  }, [templates, searchQuery, selectedCategory, reportType]);

  const filterTemplates = () => {
    let filtered = templates || [];

    // Filter by report type if specified
    if (reportType) {
      filtered = filtered.filter(template => 
        template.reportType === reportType || template.reportType === 'GENERAL'
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by category
    if (selectedCategory) {
      filtered = filtered.filter(template => template.category === selectedCategory);
    }

    setFilteredTemplates(filtered);
  };

  const getCategories = () => {
    const categories = [...new Set((templates || []).map(t => t.category))];
    return categories.sort();
  };

  const getTemplateIcon = (category: string) => {
    switch (category) {
      case 'Security': return 'shield-check';
      case 'Maintenance': return 'wrench';
      case 'Incident': return 'alert-circle';
      case 'Patrol': return 'walk';
      case 'Inspection': return 'clipboard-check';
      case 'Emergency': return 'alert-octagon';
      default: return 'file-document';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'LOW': return theme.colors.success;
      case 'NORMAL': return theme.colors.primary;
      case 'HIGH': return theme.colors.warning;
      case 'CRITICAL': return theme.colors.error;
      default: return theme.colors.outline;
    }
  };

  const handleSelectTemplate = (template: ReportTemplate) => {
    onSelectTemplate(template);
    onClose();
  };

  const renderTemplate = (template: ReportTemplate) => (
    <Card key={template.id} style={styles.templateCard}>
      <TouchableOpacity onPress={() => handleSelectTemplate(template)}>
        <Card.Content>
          <View style={styles.templateHeader}>
            <View style={styles.templateInfo}>
              <Icon 
                name={getTemplateIcon(template.category)} 
                size={24} 
                color={theme.colors.primary} 
              />
              <View style={styles.templateText}>
                <Title style={styles.templateTitle}>{template.name}</Title>
                <Paragraph style={styles.templateDescription}>
                  {template.description}
                </Paragraph>
              </View>
            </View>
            <View style={styles.templateMeta}>
              <Chip
                mode="outlined"
                style={[
                  styles.priorityChip,
                  { borderColor: getPriorityColor(template.priority) }
                ]}
                textStyle={{ color: getPriorityColor(template.priority) }}
              >
                {template.priority}
              </Chip>
              {template.isCustom && (
                <Chip mode="outlined" style={styles.customChip}>
                  Custom
                </Chip>
              )}
            </View>
          </View>

          <View style={styles.templateDetails}>
            <Text style={styles.fieldCount}>
              {template.fields.length} fields
            </Text>
            <Text style={styles.category}>
              {template.category}
            </Text>
          </View>

          {template.tags.length > 0 && (
            <View style={styles.tagsContainer}>
              {template.tags.slice(0, 3).map((tag, index) => (
                <Chip key={index} mode="outlined" style={styles.tag}>
                  {tag}
                </Chip>
              ))}
              {template.tags.length > 3 && (
                <Text style={styles.moreTags}>
                  +{template.tags.length - 3} more
                </Text>
              )}
            </View>
          )}
        </Card.Content>
      </TouchableOpacity>
    </Card>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Title style={styles.headerTitle}>Report Templates</Title>
          <Button mode="text" onPress={onClose}>
            Close
          </Button>
        </View>

        <View style={styles.searchContainer}>
          <Searchbar
            placeholder="Search templates..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchbar}
          />
        </View>

        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
        >
          <TouchableOpacity
            style={[
              styles.categoryChip,
              !selectedCategory && styles.categoryChipSelected
            ]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text style={[
              styles.categoryChipText,
              !selectedCategory && styles.categoryChipTextSelected
            ]}>
              All
            </Text>
          </TouchableOpacity>
          
          {getCategories().map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryChip,
                selectedCategory === category && styles.categoryChipSelected
              ]}
              onPress={() => setSelectedCategory(
                selectedCategory === category ? null : category
              )}
            >
              <Text style={[
                styles.categoryChipText,
                selectedCategory === category && styles.categoryChipTextSelected
              ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView style={styles.templatesContainer}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <Text>Loading templates...</Text>
            </View>
          ) : filteredTemplates.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon name="file-document-outline" size={64} color={theme.colors.outline} />
              <Text style={styles.emptyText}>
                {searchQuery || selectedCategory 
                  ? 'No templates match your criteria'
                  : 'No templates available'
                }
              </Text>
              {(searchQuery || selectedCategory) && (
                <Button 
                  mode="outlined" 
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedCategory(null);
                  }}
                  style={styles.clearFiltersButton}
                >
                  Clear Filters
                </Button>
              )}
            </View>
          ) : (
            filteredTemplates.map(renderTemplate)
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Button
            mode="outlined"
            onPress={onClose}
            style={styles.footerButton}
          >
            Cancel
          </Button>
          <Button
            mode="text"
            onPress={() => {
              // Navigate to create custom template
              // This would be implemented based on your navigation structure
            }}
            style={styles.footerButton}
          >
            Create Custom
          </Button>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.outline,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchbar: {
    elevation: 0,
    backgroundColor: theme.colors.surface,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.outline,
  },
  categoryChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  categoryChipText: {
    color: theme.colors.onSurface,
    fontSize: 14,
  },
  categoryChipTextSelected: {
    color: theme.colors.onPrimary,
  },
  templatesContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  templateCard: {
    marginBottom: 12,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  templateInfo: {
    flexDirection: 'row',
    flex: 1,
    marginRight: 12,
  },
  templateText: {
    flex: 1,
    marginLeft: 12,
  },
  templateTitle: {
    fontSize: 16,
    marginBottom: 4,
  },
  templateDescription: {
    fontSize: 14,
    color: theme.colors.outline,
  },
  templateMeta: {
    alignItems: 'flex-end',
  },
  priorityChip: {
    marginBottom: 4,
  },
  customChip: {
    borderColor: theme.colors.secondary,
  },
  templateDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  fieldCount: {
    fontSize: 12,
    color: theme.colors.outline,
  },
  category: {
    fontSize: 12,
    color: theme.colors.outline,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tag: {
    marginRight: 4,
    marginBottom: 4,
  },
  moreTags: {
    fontSize: 12,
    color: theme.colors.outline,
    marginLeft: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.outline,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  clearFiltersButton: {
    marginTop: 8,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.outline,
  },
  footerButton: {
    flex: 1,
    marginHorizontal: 8,
  },
});

export default ReportTemplates;
