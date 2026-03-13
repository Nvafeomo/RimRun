import { View, Text } from 'react-native';
import { colors, spacing } from '../../../constants/theme';

export default function ChatsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: spacing.lg }}>
      <Text style={{ color: colors.text, fontSize: 24, fontWeight: '600' }}>
        Chats
      </Text>
      <Text style={{ color: colors.textSecondary, marginTop: spacing.sm }}>
        Court chats for your subscribed courts
      </Text>
    </View>
  );
}
