# Game conversation model

Base: `f8a736557ea6138a1102cca1e13522ade08f37ed`.

User requested GPT-6.1 Terra with low reasoning for the game's coworkers. The default is now `gpt-6.1-terra` and `reasoning.effort: low`. Explicit model/effort environment values remain effective. Health reports both effective settings; provider provenance still records the actual returned model.

The budget uses USD 1.25 input (30-minute cache-write ceiling) and 5 output per million tokens, with no cache discount. Existing Luna overrides retain their previous rates. Custom models require paired explicit input/output prices. Every new reservation persists its original prices; reconciliation uses those prices after restart/configuration changes. Existing spent amounts, mission counts and unpriced outstanding reservations remain liabilities. Unknown old reservation pricing cannot silently release its charge. The USD5 allowance and existing call/token/deadline limits are unchanged.

Source: [official model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-terra), verified 8 November 2026. It lists the exact ID, low reasoning, Responses tools, structured output and rates.

Observed verification:

- Five new configuration/accounting regressions failed before implementation, then passed.
- 80 focused LLM tests, typecheck and production build passed.
- Fresh read-only code reviewer approved the source patch with no blocking findings. Its optional effort-override compatibility note was addressed by retaining SDK-supported `minimal` for configured models.
- Dedicated live demo restarted after verifying its owned process. Effective settings were Terra/low, with no local model/effort overrides present.
- One bounded live request through the actual loopback gateway completed in 4,758ms. Provider model was `gpt-6.1-terra`; usage was 1,847 input / 181 output tokens. Strict final response validated against permitted evidence: two facts, zero proposals, zero engine commands. Two-call cap used one call; no retry. Existing approved credential was used privately in memory.

Local receipts: `.local/terra-config-{red,green}.log`, `.local/terra-build.log`, `.local/terra-live-check.json`. These contain no credential. No further paid tests are needed. This check establishes access and one grounded structured reply, not executed tool-call behavior, full mission quality, latency guarantees or human acceptance.
