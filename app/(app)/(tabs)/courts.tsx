import { View, Text } from 'react-native';
import { colors, spacing } from '../../../constants/theme';

export default function CourtsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}>
        Courts
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
        Find basketball courts near you
      </Text>
    </View>
  );
}
