import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

type IconBadgeProps = {
  /** MaterialCommunityIcons name (category icons) or Ionicons name when `ionicon` is set. */
  icon: string;
  color: string;
  size?: number;
  ionicon?: boolean;
};

/** A rounded square tinted with the item colour — used for categories and accounts. */
export const IconBadge = ({ icon, color, size = 36, ionicon }: IconBadgeProps) => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={{
      width: size,
      height: size,
      borderRadius: size * 0.3,
      backgroundColor: `${color}22`,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    {ionicon ? (
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={size * 0.52} color={color} />
    ) : (
      <MaterialCommunityIcons
        name={(icon in MaterialCommunityIcons.glyphMap ? icon : 'shape-outline') as keyof typeof MaterialCommunityIcons.glyphMap}
        size={size * 0.52}
        color={color}
      />
    )}
  </View>
);
