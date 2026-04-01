function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

type InviteEmailTokenResult =
  | { canSend: true; unsubscribeToken: string }
  | { canSend: false; reason: "suppressed" };

export async function getOrCreateInviteEmailToken(
  supabase: any,
  email: string,
): Promise<InviteEmailTokenResult> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: suppressedEmail, error: suppressionError } = await supabase
    .from("suppressed_emails")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (suppressionError) {
    throw new Error("Failed to verify email suppression status");
  }

  if (suppressedEmail) {
    return { canSend: false, reason: "suppressed" };
  }

  const { data: existingToken, error: tokenLookupError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (tokenLookupError) {
    throw new Error("Failed to look up unsubscribe token");
  }

  if (existingToken?.used_at) {
    return { canSend: false, reason: "suppressed" };
  }

  if (existingToken?.token) {
    return { canSend: true, unsubscribeToken: existingToken.token };
  }

  const unsubscribeToken = generateToken();
  const { error: tokenError } = await supabase
    .from("email_unsubscribe_tokens")
    .upsert(
      { token: unsubscribeToken, email: normalizedEmail },
      { onConflict: "email", ignoreDuplicates: true },
    );

  if (tokenError) {
    throw new Error("Failed to create unsubscribe token");
  }

  const { data: storedToken, error: reReadError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (reReadError || !storedToken?.token) {
    throw new Error("Failed to confirm unsubscribe token");
  }

  if (storedToken.used_at) {
    return { canSend: false, reason: "suppressed" };
  }

  return { canSend: true, unsubscribeToken: storedToken.token };
}