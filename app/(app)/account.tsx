import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";
import { useProfile } from "../../context/ProfileContext";
import { colors, spacing, borderRadius } from "../../constants/theme";
import { supabase } from "../../lib/supabase";
import {
  normalizeUsername,
  validateUsernameInput,
  USERNAME_RULES_USER_HINT,
  mapProfileUsernameError,
} from "../../lib/usernameRules";
import {
  getAccountSettingsEmailDraft,
  getDisplayContactEmail,
  isOAuthOnlyUser,
} from "../../lib/accountIdentity";

function formatDateOfBirthDisplay(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function validateEmailIfProvided(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return "Invalid email address";
  return null;
}

function validatePassword(value: string): string | null {
  if (!value.trim()) return "Password is required";
  if (value.length < 8) return "Password must be at least 8 characters";
  return null;
}

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loading: profileLoading, refreshProfile } = useProfile();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);
  const [error, setError] = useState("");

  const oauthOnly = isOAuthOnlyUser(user);
  const hasContactEmail = !!getDisplayContactEmail(user, profile?.email);

  const exitAccountSettings = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(app)/(tabs)/profile");
    }
  }, [router]);

  useEffect(() => {
    if (!user) return;
    setEmail(getAccountSettingsEmailDraft(user, profile?.email));
    setUsername((profile?.username ?? "").toLowerCase());
  }, [user, profile?.email, profile?.username]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    setError("");

    const usernameErr = validateUsernameInput(username);
    const emailErr = validateEmailIfProvided(email);
    if (usernameErr || emailErr) {
      setError(usernameErr ?? emailErr ?? "Invalid input");
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    const trimmedEmail = email.trim().toLowerCase();
    const currentUsername = (profile?.username ?? "").toLowerCase();
    const currentContactEmail = (
      getDisplayContactEmail(user, profile?.email) ?? ""
    ).toLowerCase();

    const usernameChanged = normalizedUsername !== currentUsername;
    const emailChanged =
      trimmedEmail.length > 0 && trimmedEmail !== currentContactEmail;

    if (!usernameChanged && !emailChanged) {
      exitAccountSettings();
      return;
    }

    setSubmitting(true);
    try {
      if (usernameChanged) {
        const { data: taken } = await supabase
          .from("profiles")
          .select("id")
          .eq("username", normalizedUsername)
          .neq("id", user.id)
          .maybeSingle();

        if (taken) {
          setError("That username is already taken");
          setSubmitting(false);
          return;
        }

        const { error: profileErr } = await supabase
          .from("profiles")
          .update({ username: normalizedUsername })
          .eq("id", user.id);

        if (profileErr) {
          setError(mapProfileUsernameError(profileErr));
          setSubmitting(false);
          return;
        }
      }

      if (emailChanged) {
        const { error: authErr } = await supabase.auth.updateUser({
          email: trimmedEmail,
        });
        if (authErr) throw authErr;

        const { error: emailProfileErr } = await supabase
          .from("profiles")
          .update({ email: trimmedEmail })
          .eq("id", user.id);

        if (emailProfileErr) throw emailProfileErr;
      }

      await refreshProfile();

      if (emailChanged) {
        Alert.alert(
          "Check your email",
          "If your project requires confirmation, Supabase may send a link to verify the new address before it takes effect.",
        );
      }

      exitAccountSettings();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : "Could not save changes";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }, [
    user,
    profile?.username,
    profile?.email,
    username,
    email,
    refreshProfile,
    exitAccountSettings,
  ]);

  const handleSetPassword = useCallback(async () => {
    if (!user?.id) return;
    setError("");

    const passwordErr = validatePassword(newPassword);
    if (passwordErr) {
      setError(passwordErr);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSettingPassword(true);
    try {
      const { error: pwErr } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (pwErr) throw pwErr;

      setNewPassword("");
      setConfirmPassword("");
      Alert.alert(
        "Password set",
        "You can now sign in with your email and this password, in addition to Apple or Google.",
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not set password";
      setError(msg);
    } finally {
      setSettingPassword(false);
    }
  }, [user?.id, newPassword, confirmPassword]);

  if (!user || profileLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={exitAccountSettings} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Account</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Update your username{hasContactEmail ? " and email" : ""}. Signed in
            with Apple or Google? Add an email below if you want password sign-in
            or account recovery — your Apple private relay address is never shown
            here.
          </Text>

          <View style={styles.card}>
            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Text style={styles.label}>Date of birth</Text>
            <View style={styles.readOnlyField}>
              <Text style={styles.readOnlyValue}>
                {profile?.date_of_birth
                  ? formatDateOfBirthDisplay(profile.date_of_birth)
                  : "—"}
              </Text>
            </View>
            <Text style={styles.readOnlyHint}>
              Set when you signed up. It can’t be changed in the app.
            </Text>

            <Text style={styles.label}>Username</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => setUsername(t.toLowerCase())}
              placeholder="username"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              editable={!submitting && !settingPassword}
            />
            <Text style={styles.fieldHint}>{USERNAME_RULES_USER_HINT}</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={
                hasContactEmail ? "you@example.com" : "Add your email (optional)"
              }
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!submitting && !settingPassword}
            />
            <Text style={styles.fieldHint}>
              {hasContactEmail
                ? "Changing email may require confirmation from your inbox."
                : "Leave blank to skip. Useful for password sign-in and recovery."}
            </Text>

            <Pressable
              style={[styles.saveButton, submitting && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={submitting || settingPassword}
            >
              {submitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.saveButtonText}>Save changes</Text>
              )}
            </Pressable>
          </View>

          {oauthOnly ? (
            <View style={[styles.card, styles.passwordCard]}>
              <Text style={styles.sectionTitle}>Password sign-in (optional)</Text>
              <Text style={styles.sectionIntro}>
                Set a password if you want to sign in with email and password later.
                You’ll need to add an email above first.
              </Text>

              <Text style={styles.label}>New password</Text>
              <TextInput
                style={styles.input}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!submitting && !settingPassword}
              />

              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Repeat password"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!submitting && !settingPassword}
              />

              <Pressable
                style={[
                  styles.secondaryButton,
                  settingPassword && styles.saveButtonDisabled,
                ]}
                onPress={handleSetPassword}
                disabled={submitting || settingPassword}
              >
                {settingPassword ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Set password</Text>
                )}
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.sm,
    marginRight: spacing.sm,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  intro: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordCard: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  sectionIntro: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  readOnlyField: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    backgroundColor: colors.background,
    marginBottom: spacing.xs,
  },
  readOnlyValue: {
    fontSize: 16,
    color: colors.textMuted,
  },
  readOnlyHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.inputBg,
    marginBottom: spacing.md,
  },
  fieldHint: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  error: {
    color: colors.error,
    fontSize: 14,
    marginBottom: spacing.md,
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primary,
  },
});
