import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import {
  formatLocalIsoDate,
  maxBirthDateForMinAge,
  parseIsoDateOnly,
} from '../lib/agePolicy';
import { colors, spacing, borderRadius } from '../constants/theme';

const MIN_BIRTH_DATE = new Date(1920, 0, 1);

function isoToLocalDate(iso: string): Date | null {
  const parsed = parseIsoDateOnly(iso);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, parsed.d);
}

function formatDateForDisplay(isoDate: string): string {
  const date = isoToLocalDate(isoDate);
  if (!date) return isoDate;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function defaultPickerDate(value: string): Date {
  return isoToLocalDate(value) ?? maxBirthDateForMinAge();
}

type DateOfBirthPickerFieldProps = {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
  touchableStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function DateOfBirthPickerField({
  value,
  onChange,
  placeholder = 'Date of birth (13+ only)',
  disabled = false,
  touchableStyle,
  textStyle,
}: DateOfBirthPickerFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<Date>(() => defaultPickerDate(value));

  const openPicker = useCallback(() => {
    if (disabled) return;
    setDraftDate(defaultPickerDate(value));
    if (Platform.OS === 'ios') {
      setIosOpen(true);
    } else {
      setAndroidOpen(true);
    }
  }, [disabled, value]);

  const cancelPicker = useCallback(() => {
    setIosOpen(false);
    setAndroidOpen(false);
  }, []);

  const confirmPicker = useCallback(() => {
    onChange(formatLocalIsoDate(draftDate));
    setIosOpen(false);
  }, [draftDate, onChange]);

  const onAndroidChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      setAndroidOpen(false);
      if (event.type === 'set' && selectedDate) {
        onChange(formatLocalIsoDate(selectedDate));
      }
    },
    [onChange],
  );

  const onIosDraftChange = useCallback(
    (_event: DateTimePickerEvent, selectedDate?: Date) => {
      if (selectedDate) {
        setDraftDate(selectedDate);
      }
    },
    [],
  );

  return (
    <>
      <Pressable
        style={[styles.touchable, touchableStyle, disabled && styles.touchableDisabled]}
        onPress={openPicker}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={value ? `Date of birth, ${formatDateForDisplay(value)}` : placeholder}
      >
        <Text style={[styles.text, !value && styles.placeholder, textStyle]}>
          {value ? formatDateForDisplay(value) : placeholder}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Modal
          visible={iosOpen}
          transparent
          animationType="slide"
          onRequestClose={cancelPicker}
        >
          <View style={styles.modalRoot}>
            <Pressable style={styles.backdrop} onPress={cancelPicker} accessibilityLabel="Dismiss" />
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Pressable
                  onPress={cancelPicker}
                  hitSlop={12}
                  style={styles.headerAction}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Text style={styles.sheetTitle}>Date of birth</Text>
                <Pressable
                  onPress={confirmPicker}
                  hitSlop={12}
                  style={styles.headerAction}
                >
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </View>
              <Text style={styles.sheetHint}>RimRun is 13+ only. Tap Done when finished.</Text>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="inline"
                themeVariant="dark"
                minimumDate={MIN_BIRTH_DATE}
                maximumDate={maxBirthDateForMinAge()}
                onChange={onIosDraftChange}
                style={styles.inlinePicker}
              />
            </View>
          </View>
        </Modal>
      ) : null}

      {Platform.OS === 'android' && androidOpen ? (
        <DateTimePicker
          value={draftDate}
          mode="date"
          display="default"
          minimumDate={MIN_BIRTH_DATE}
          maximumDate={maxBirthDateForMinAge()}
          onChange={onAndroidChange}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  touchable: {
    justifyContent: 'center',
  },
  touchableDisabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  placeholder: {
    color: colors.textMuted,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    paddingBottom: spacing.lg,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerAction: {
    minWidth: 64,
    paddingVertical: spacing.xs,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  cancelText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  doneText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '700',
    textAlign: 'right',
  },
  sheetHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  inlinePicker: {
    alignSelf: 'center',
  },
});
