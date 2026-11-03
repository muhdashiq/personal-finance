import { PERIOD_LABELS, formatRange, type PeriodPreset } from '@family-finance/core';
import { useState } from 'react';
import { View } from 'react-native';
import { Chip, PickerSheet, SegmentedControl } from '@/components/ui';
import { usePreferences, type ViewScope } from '@/stores/preferences';
import { useTheme } from '@/theme/ThemeProvider';
import { usePeriod } from '../hooks';

const PRESETS = Object.keys(PERIOD_LABELS) as PeriodPreset[];
const SCOPES: readonly { value: ViewScope; label: string }[] = [
  { value: 'family', label: 'Family' },
  { value: 'individual', label: 'Just me' },
];

/** Family/individual toggle and period chip shared by Home and Insights. */
export const PeriodControls = ({ showScope = true }: { showScope?: boolean }) => {
  const theme = useTheme();
  const scope = usePreferences((s) => s.scope);
  const setScope = usePreferences((s) => s.setScope);
  const setPeriod = usePreferences((s) => s.setPeriod);
  const { preset, range } = usePeriod();
  const [open, setOpen] = useState(false);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      {showScope ? (
        <View style={{ flex: 1 }}>
          <SegmentedControl options={SCOPES} value={scope} onChange={setScope} accessibilityLabel="Whose money to show" />
        </View>
      ) : null}
      <Chip label={PERIOD_LABELS[preset]} icon="calendar-outline" onPress={() => setOpen(true)} />
      <PickerSheet
        visible={open}
        title="Period"
        selected={preset}
        options={PRESETS.map((p) => ({ value: p, label: PERIOD_LABELS[p], description: p === preset ? formatRange(range) : undefined }))}
        onSelect={(v) => v && setPeriod(v as PeriodPreset)}
        onClose={() => setOpen(false)}
        searchable={false}
      />
    </View>
  );
};
