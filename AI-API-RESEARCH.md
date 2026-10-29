# AI API option for the Life OS planning assistant

**Checked:** 29 October 2026

## Recommendation

Google's Gemini API model catalog lists `gemini-3.5-flash-lite` as a stable model, and Google's pricing page lists a free tier with no-charge input and output tokens. The paid tier is listed at $0.30 per million input tokens and $2.50 per million output tokens. Free-tier quotas are project- and model-specific and can change; the app should handle quota errors rather than promise availability. [1] [2] [3]

The free tier has a material privacy trade-off: Google says prompts and responses may be used to improve products and may be reviewed by people. Do not submit sensitive, confidential, or identifying information. The assistant should send only the current ephemeral planning conversation, never the account's full Life OS snapshot or unrelated journals/history. The UI discloses Google's free-tier data use and requires the user's acknowledgement before sending a prompt. [2] [4]

Gemini supports schema-constrained JSON responses, but the application must still validate returned values. The assistant should return only a proposed plan or dated task list. It must not have tool-calling or direct database-write permissions. Life OS shows proposals for review and adds them to the signed-in user's private workspace only after explicit confirmation. [5]

## References

[1]: https://ai.google.dev/gemini-api/docs/models "Gemini API model catalog"
[2]: https://ai.google.dev/gemini-api/docs/pricing "Gemini Developer API pricing"
[3]: https://ai.google.dev/gemini-api/docs/rate-limits "Gemini API rate limits"
[4]: https://ai.google.dev/gemini-api/terms "Gemini API Additional Terms of Service"
[5]: https://ai.google.dev/gemini-api/docs/structured-output "Gemini API structured outputs"

## Supabase deployment boundary

The browser invokes a Supabase Edge Function rather than calling Gemini directly. The function verifies the signed-in caller, keeps `GEMINI_API_KEY` in Supabase Function Secrets, uses only the caller's authenticated scope, and fails closed if its daily-use guard is unavailable. The key must never be placed in a `VITE_*` variable or source repository. [6] [7] [8]

[6]: https://supabase.com/docs/guides/functions/auth "Supabase Edge Function authentication"
[7]: https://supabase.com/docs/guides/functions/secrets "Supabase Edge Function secrets"
[8]: https://supabase.com/docs/guides/functions "Supabase Edge Functions"
