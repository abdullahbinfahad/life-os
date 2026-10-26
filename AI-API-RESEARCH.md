# AI API option for the Life OS planning assistant

**Checked:** 26 October 2026

## Recommendation

Google's Gemini Developer API currently lists `gemini-2.5-flash-lite` with free input and output tokens on the Free tier. This is a reasonable prototype provider for low-volume plan and schedule suggestions, but it is not a complete, unlimited, or guaranteed-free service. Gemini quotas are project- and model-specific, may change with account status, and Google says actual capacity is not guaranteed. The app should handle quota errors rather than promise availability. [1] [2]

The free tier has a material privacy trade-off: Google says it may use prompts and responses to improve products and may have human reviewers process them. Google explicitly says not to submit sensitive, confidential, or personal information to unpaid services. For that reason, the assistant should send only the current planning prompt, never the account's full Life OS snapshot or previous conversations. Before sending a prompt, the UI should clearly disclose Google's free-tier data use and require the user to acknowledge it. The assistant should not be used for private journal content, identity data, secrets, or confidential work. [1] [3]

Gemini supports schema-constrained JSON responses, but its documentation still requires applications to validate the returned values. The assistant should return only a proposed plan or dated task list. It should not have tool-calling or direct database-write permissions. Life OS should show the proposed items for review and add them to the signed-in user's private workspace only after an explicit confirmation. [4]

## References

[1]: https://ai.google.dev/gemini-api/docs/pricing "Gemini Developer API pricing"
[2]: https://ai.google.dev/gemini-api/docs/rate-limits "Gemini API rate limits"
[3]: https://ai.google.dev/gemini-api/terms "Gemini API Additional Terms of Service"
[4]: https://ai.google.dev/gemini-api/docs/structured-output "Gemini API structured outputs"


## Supabase deployment boundary

The browser should invoke a Supabase Edge Function rather than call Gemini directly. Supabase's official Edge Function guidance documents JWT verification, server-side secret management, and the `Authorization` header supplied by a signed-in client. The function should additionally verify the caller's user identity itself, keep `GEMINI_API_KEY` in Function Secrets, use only the caller's authenticated scope, and fail closed if its daily-use guard is unavailable. The key must never be placed in a `VITE_*` variable or source repository. [5] [6] [7]

[5]: https://supabase.com/docs/guides/functions/auth "Supabase Edge Function authentication"
[6]: https://supabase.com/docs/guides/functions/secrets "Supabase Edge Function secrets"
[7]: https://supabase.com/docs/guides/functions "Supabase Edge Functions"
