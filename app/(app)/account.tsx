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

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

function formatDateOfBirthDisplay(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function validateUsername(value: string): string | null {
  if (!value.trim()) return "Username is required";
  if (!USERNAME_REGEX.test(value))
    return "3–20 characters: letters, numbers, underscore only";
  return null;
}

function validateEmail(value: string): string | null {
  if (!value.trim()) return "Email is required";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value.trim())) return "Invalid email address";
  return null;
}

export default function AccountScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, loading: profileLoading, refreshProfile } = useProfile();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setEmail(user.email ?? "");
    setUsername((profile?.username ?? "").toLowerCase());
  }, [user, profile?.username]);

  const handleSave = useCallback(async () => {
    if (!user?.id) return;
    setError("");

    const usernameErr = validateUsername(username.trim());
    const emailErr = validateEmail(email);
    if (usernameErr || emailErr) {
      setError(usernameErr ?? emailErr ?? "Invalid input");
      return;
    }

    const normalizedUsername = username.trim().toLowerCase();
    const trimmedEmail = email.trim().toLowerCase();
    const currentUsername = (profile?.username ?? "").toLowerCase();
    const currentEmail = (user.email ?? "").toLowerCase();

    const usernameChanged = normalizedUsername !== currentUsername;
    const emailChanged = trimmedEmail !== currentEmail;

    if (!usernameChanged && !emailChanged) {
      router.back();
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

        if (profileErr) throw profileErr;
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
          "If your project requires confirmation, Supabase may send a link to verify the new address before it takes effect."
        );
      }

      router.back();
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
    username,
    email,
    refreshProfile,
    router,
  ]);

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
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Account</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.intro}>
            Update your username and email. Username must be unique. Email
            changes may require confirmation from your inbox (Supabase settings).
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
              editable={!submitting}
            />

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!submitting}
            />

            <Pressable
              style={[styles.saveButton, submitting && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.saveButtonText}>Save changes</Text>
              )}
            </Pressable>
          </View>
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
});
