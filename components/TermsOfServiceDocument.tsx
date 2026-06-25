import { ScrollView, StyleSheet } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, spacing } from '../constants/theme';
import { TERMS_OF_SERVICE_MARKDOWN } from '../constants/termsOfServiceMarkdown';

const markdownStyles = StyleSheet.create({
  body: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 24,
  },
  heading1: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  heading2: {
    color: colors.text,
    fontSize: 19,
    fontWeight: '700',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  heading3: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: spacing.md,
    lineHeight: 24,
  },
  bullet_list: {
    marginBottom: spacing.sm,
  },
  ordered_list: {
    marginBottom: spacing.sm,
  },
  list_item: {
    marginBottom: spacing.xs,
  },
  bullet_list_icon: {
    color: colors.primary,
    marginLeft: 0,
    marginRight: spacing.sm,
  },
  bullet_list_content: {
    flex: 1,
  },
  strong: {
    color: colors.text,
    fontWeight: '600',
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  hr: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.lg,
  },
});

type Props = {
  contentContainerStyle?: object;
};

export function TermsOfServiceDocument({ contentContainerStyle }: Props) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      showsVerticalScrollIndicator={false}
    >
      <Markdown mergeStyle style={markdownStyles}>
        {TERMS_OF_SERVICE_MARKDOWN}
      </Markdown>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
});
