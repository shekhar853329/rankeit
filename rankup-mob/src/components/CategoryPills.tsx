import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getCategoryIcon } from '../constants/icons';
import { Radius, Spacing } from '../constants/theme';
import { useAppTheme } from '../context/ThemeContext';
import { CategoryDto } from '../models';

interface CategoryPillsProps {
  categories: CategoryDto[];
  selectedSlug: string | null;
  onSelectCategory: (slug: string | null) => void;
  timeMode?: 'today' | 'alltime';
}

export const CategoryPills: React.FC<CategoryPillsProps> = ({
  categories,
  selectedSlug,
  onSelectCategory,
  timeMode = 'today',
}) => {
  const { colors } = useAppTheme();

  const totalCount = categories.reduce(
    (sum, c) => sum + (timeMode === 'today' ? c.todayListingCount ?? 0 : c.listingCount ?? 0),
    0,
  );

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {/* All Categories Pill */}
        <TouchableOpacity
          style={[
            styles.pill,
            {
              backgroundColor: selectedSlug === null ? colors.primary : colors.surface,
              borderColor: selectedSlug === null ? colors.primary : colors.border,
            },
          ]}
          onPress={() => onSelectCategory(null)}>
          <Text
            style={[
              styles.pillText,
              { color: selectedSlug === null ? '#fff' : colors.text },
            ]}>
            All Categories
          </Text>
          <View
            style={[
              styles.countBadge,
              {
                backgroundColor:
                  selectedSlug === null ? 'rgba(255,255,255,0.25)' : colors.surfaceSubtle,
              },
            ]}>
            <Text
              style={[
                styles.countText,
                { color: selectedSlug === null ? '#fff' : colors.textMuted },
              ]}>
              {totalCount}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Dynamic Category Pills */}
        {categories.map((cat) => {
          const isSelected = selectedSlug === cat.slug;
          const count = timeMode === 'today' ? cat.todayListingCount ?? 0 : cat.listingCount ?? 0;

          return (
            <TouchableOpacity
              key={cat.slug}
              style={[
                styles.pill,
                {
                  backgroundColor: isSelected ? colors.primary : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                },
              ]}
              onPress={() => onSelectCategory(cat.slug)}>
              <Text
                style={[
                  styles.pillText,
                  { color: isSelected ? '#fff' : colors.text },
                ]}>
                {getCategoryIcon(cat.slug)} {cat.name}
              </Text>
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor:
                      isSelected ? 'rgba(255,255,255,0.25)' : colors.surfaceSubtle,
                  },
                ]}>
                <Text
                  style={[
                    styles.countText,
                    { color: isSelected ? '#fff' : colors.textMuted },
                  ]}>
                  {count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: Spacing.three,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  countBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  countText: {
    fontSize: 9,
    fontWeight: '800',
  },
});
