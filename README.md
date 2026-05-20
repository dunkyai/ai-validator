# @dunkyai/ai-validator

Open-source AI output validator for LLM applications. Catch hallucinations, strip narration, verify tool calls.

Battle-tested across 90+ production AI agent instances at [Dunky AI](https://dunky.ai).

## Install

```bash
npm install @dunkyai/ai-validator
```

## Quick Start

```typescript
import { validate } from '@dunkyai/ai-validator'

const result = validate({
  response: "I've sent the email to john@example.com",
  toolCalls: [
    { name: "gmail_send", input: { to: "john@example.com" }, output: '{"success":true}' }
  ]
})

console.log(result.pass)    // true — action claim matches tool call
console.log(result.cleaned) // "I've sent the email to john@example.com"
console.log(result.issues)  // []
```

## What It Catches

### 1. Hallucinated Actions

The AI says "I've sent the email" but never actually called a send tool:

```typescript
const result = validate({
  response: "I've sent the email to john@example.com",
  toolCalls: [] // no tools were called!
})

console.log(result.pass) // false
console.log(result.issues)
// [{ type: "hallucination", message: "AI claims to have performed an action, but none of these tools were called: gmail_send, send_email, sendEmail" }]
```

### 2. Tool Failed But AI Claims Success

The AI called the tool, but it returned an error — and the AI claims it succeeded anyway:

```typescript
const result = validate({
  response: "I've sent the email to john@example.com",
  toolCalls: [
    { name: "gmail_send", input: { to: "john@example.com" }, output: '{"error":"Request failed with status 500"}' }
  ]
})

console.log(result.pass) // false
console.log(result.issues)
// [{ type: "hallucination", message: 'AI claims success but the tool "gmail_send" returned an error: Request failed with status 500' }]
```

Error detection handles JSON errors (`{ "error": "..." }`, `{ "success": false }`, status codes >= 400) and plain-text error patterns.

### 3. Narration / Thought Process

The AI leaks its internal monologue into user-facing responses:

```typescript
const result = validate({
  response: "Let me save this file and extract the text.\n\nHere's the summary of the document..."
})

console.log(result.cleaned) // "Here's the summary of the document..."
console.log(result.issues)
// [{ type: "narration", message: "Narration / thought process stripped", match: "Let me save this file and extract the text." }]
```

### 3. Blocked Phrases

Remove specific phrases you don't want in responses:

```typescript
const result = validate({
  response: "Hey there! The bottom line is we need to move fast.",
  options: {
    blockedPhrases: ["hey there", "the bottom line"]
  }
})

console.log(result.cleaned) // "! is we need to move fast."
```

## API

### `validate(params)`

Main validation function. Returns a `ValidationResult`.

**Params:**
- `response` (string) — The AI's response text
- `toolCalls` (ToolCall[], optional) — Tool calls that were actually executed
- `options` (ValidationOptions, optional) — Configuration

**Options:**
- `checkHallucinations` (boolean, default: true) — Check for hallucinated action claims
- `stripNarration` (boolean, default: true) — Remove narration lines
- `blockedPhrases` (string[], default: []) — Custom phrases to remove
- `narrationPatterns` (RegExp[], default: built-in) — Custom narration patterns
- `actionPatterns` ({ pattern, tools }[], default: built-in) — Custom hallucination patterns

**Returns:**
```typescript
{
  pass: boolean,        // true if no hallucinations found
  cleaned: string,      // response with narration/phrases stripped
  issues: Issue[],      // all issues found
  original: string      // original response
}
```

### `checkActionClaims(response, toolNames, patterns?)`

Check if the AI claims actions not backed by tool calls.

### `removeNarration(text, patterns?)`

Strip narration lines from text.

### `looksLikeError(output)`

Check if a tool output looks like an error. Handles JSON (`{ "error": "..." }`, `{ "success": false }`, status >= 400) and plain-text error patterns.

### `removeBlockedPhrases(text, phrases)`

Remove specific phrases from text.

## What It Doesn't Catch

This validator detects one specific failure mode: **the model skips tool calls entirely and fabricates a success response.** The signal is binary — zero matching tool calls + a success claim in the output.

It covers two hallucination scenarios:
1. **No tool called** — the model skips tool calls entirely and fabricates a success response.
2. **Tool called but failed** — the model calls the tool, gets an error back, but claims success anyway.

It does **not** cover:

- **The model calls the wrong tool.** If the user says "send an email" and the model calls `slack_send` instead, that's a routing/prompt issue, not a hallucination.

- **Subtle factual inaccuracies.** If the model summarizes a document and gets a detail wrong, that's a different class of problem requiring retrieval verification.

### Why this approach?

We tried matching the user's *input* for action keywords ("send", "create", "search") and flagging when no tool call followed. This was whack-a-mole — users phrase requests in endless ways ("check on", "look into", "gather"). Matching success claims in the *output* is more robust because hallucinated responses are remarkably formulaic: "I've sent...", "Successfully created...", "Email Sent", etc.

## Works With Any Model

- Claude (Anthropic)
- GPT-4 / GPT-4o (OpenAI)
- Llama, Mistral, Gemma (via Groq, Together, etc.)
- Gemini (Google)
- Any model that uses tool/function calling

## License

MIT — use it however you want, commercially or otherwise.

## Contributing

Issues and PRs welcome at [github.com/dunkyai/ai-validator](https://github.com/dunkyai/ai-validator).
