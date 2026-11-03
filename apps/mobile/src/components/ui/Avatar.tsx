import { View } from 'react-native';
import { Text } from './Text';

type AvatarProps = { name: string; color?: string; size?: number };

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

export const Avatar = ({ name, color = '#4F5BD5', size = 36 }: AvatarProps) => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: color,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <Text variant={size >= 44 ? 'headline' : 'caption'} style={{ color: '#FFFFFF' }}>
      {initials(name)}
    </Text>
  </View>
);
