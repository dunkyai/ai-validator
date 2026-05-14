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

### 2. Narration / Thought Process

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

### `removeBlockedPhrases(text, phrases)`

Remove specific phrases from text.

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
