/**
 * @dunkyai/ai-validator
 *
 * Open-source AI output validator for LLM applications.
 * Catch hallucinations, strip narration, verify tool calls.
 *
 * Battle-tested across 90+ production AI agent instances.
 *
 * @license MIT
 */

// --- Types ---

export interface ToolCall {
  name: string;
  input: Record<string, any>;
  output: string;
}

export interface ValidationOptions {
  /** Check if the AI claims actions it didn't perform (default: true) */
  checkHallucinations?: boolean;
  /** Strip AI narration / thought process from responses (default: true) */
  stripNarration?: boolean;
  /** Custom blocked phrases to remove (default: []) */
  blockedPhrases?: string[];
  /** Custom narration patterns to strip — regexes matched against each line (default: built-in set) */
  narrationPatterns?: RegExp[];
  /** Custom action claim patterns to check for hallucination (default: built-in set) */
  actionPatterns?: { pattern: RegExp; tools: string[] }[];
}

export interface ValidationResult {
  /** Whether the response passed all checks */
  pass: boolean;
  /** The cleaned response text */
  cleaned: string;
  /** List of issues found */
  issues: ValidationIssue[];
  /** Original response (before cleaning) */
  original: string;
}

export interface ValidationIssue {
  type: "hallucination" | "narration" | "blocked_phrase";
  message: string;
  /** The text that was flagged */
  match?: string;
}

// --- Built-in patterns ---

const DEFAULT_NARRATION_PATTERNS: RegExp[] = [
  /^(Now )?(let me|I('ll| will| need to| should| can)) (now )?(save|download|extract|open|read|check|look|search|find|get|fetch|process|analyze|review|examine|convert|parse|access|retrieve|pull up|take a look)\b/i,
  /^(First|Next|Then|Now),? (I('ll| will|'ll| need to) |let me )/i,
  /^(Let me |I('ll| will) )(try|attempt|go ahead|proceed|start|begin|work on|handle)\b/i,
  /^(Now )?I('m going to| am going to| will now| shall)\b/i,
  /^(Alright|OK|Okay),? (let me|I('ll| will))\b/i,
];

const DEFAULT_ACTION_PATTERNS: { pattern: RegExp; tools: string[] }[] = [
  { pattern: /I('ve|'ve| have) (sent|emailed|mailed)/i, tools: ["gmail_send", "send_email", "sendEmail"] },
  { pattern: /I('ve|'ve| have) (drafted|created a draft)/i, tools: ["gmail_create_draft", "create_draft", "createDraft"] },
  { pattern: /I('ve|'ve| have) (posted|tweeted|shared).*(tweet|twitter|thread)/i, tools: ["twitter_post_tweet", "twitter_post_thread", "post_tweet"] },
  { pattern: /I('ve|'ve| have) (posted|published|scheduled).*(buffer|linkedin|social)/i, tools: ["buffer_create_post", "create_post"] },
  { pattern: /I('ve|'ve| have) (created|made).*(google doc|document)/i, tools: ["docs_create", "create_document", "createDocument"] },
  { pattern: /I('ve|'ve| have) (created|sent).*(agreement|contract)/i, tools: ["create_agreement", "send_agreement"] },
  { pattern: /I('ve|'ve| have) (created|scheduled|set up).*(event)/i, tools: ["calendar_create_event", "create_event", "createEvent"] },
  { pattern: /I('ve|'ve| have) (saved|stored|remembered)/i, tools: ["save_memory", "save", "store"] },
  { pattern: /I('ve|'ve| have) (deleted|removed)/i, tools: ["delete", "remove"] },
  { pattern: /I('ve|'ve| have) (updated|modified|edited)/i, tools: ["update", "edit", "modify"] },
];

const DEFAULT_BLOCKED_PHRASES: string[] = [];

// --- Core functions ---

/**
 * Validate an AI response against tool calls and clean the output.
 *
 * @example
 * ```typescript
 * import { validate } from '@dunkyai/ai-validator'
 *
 * const result = validate({
 *   response: "I've sent the email to john@example.com",
 *   toolCalls: [{ name: "gmail_send", input: { to: "john@example.com" }, output: '{"success":true}' }]
 * })
 * // { pass: true, cleaned: "I've sent the email to john@example.com", issues: [] }
 * ```
 */
export function validate(params: {
  /** The AI's response text */
  response: string;
  /** Tool calls that were actually executed (optional) */
  toolCalls?: ToolCall[];
  /** Validation options */
  options?: ValidationOptions;
}): ValidationResult {
  const { response, toolCalls = [], options = {} } = params;
  const issues: ValidationIssue[] = [];

  const checkHallucinations = options.checkHallucinations !== false;
  const stripNarrationEnabled = options.stripNarration !== false;
  const narrationPatterns = options.narrationPatterns || DEFAULT_NARRATION_PATTERNS;
  const actionPatterns = options.actionPatterns || DEFAULT_ACTION_PATTERNS;
  const blockedPhrases = options.blockedPhrases || DEFAULT_BLOCKED_PHRASES;

  let cleaned = response;

  // 1. Check for hallucinated action claims
  if (checkHallucinations && toolCalls.length >= 0) {
    const toolNames = toolCalls.map(t => t.name);
    const hallucinationIssues = checkActionClaims(response, toolNames, actionPatterns);
    issues.push(...hallucinationIssues);
  }

  // 2. Strip narration
  if (stripNarrationEnabled) {
    const { text, stripped } = removeNarration(cleaned, narrationPatterns);
    cleaned = text;
    issues.push(...stripped);
  }

  // 3. Remove blocked phrases
  if (blockedPhrases.length > 0) {
    const { text, removed } = removeBlockedPhrases(cleaned, blockedPhrases);
    cleaned = text;
    issues.push(...removed);
  }

  // 4. Clean up artifacts
  cleaned = cleaned.replace(/  +/g, " ").replace(/^\s+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

  return {
    pass: issues.filter(i => i.type === "hallucination").length === 0,
    cleaned,
    issues,
    original: response,
  };
}

/**
 * Check if the AI's response claims actions that weren't actually performed.
 */
export function checkActionClaims(
  response: string,
  toolNamesCalled: string[],
  patterns?: { pattern: RegExp; tools: string[] }[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const actionPatterns = patterns || DEFAULT_ACTION_PATTERNS;

  for (const { pattern, tools } of actionPatterns) {
    if (pattern.test(response)) {
      const anyCalled = tools.some(t =>
        toolNamesCalled.some(called => called === t || called.includes(t) || t.includes(called))
      );
      if (!anyCalled) {
        const match = response.match(pattern);
        issues.push({
          type: "hallucination",
          message: `AI claims to have performed an action, but none of these tools were called: ${tools.join(", ")}`,
          match: match?.[0],
        });
      }
    }
  }

  return issues;
}

/**
 * Strip narration / thought process lines from AI responses.
 */
export function removeNarration(
  text: string,
  patterns?: RegExp[]
): { text: string; stripped: ValidationIssue[] } {
  const narrationPatterns = patterns || DEFAULT_NARRATION_PATTERNS;
  const stripped: ValidationIssue[] = [];

  const lines = text.split("\n");
  const cleaned = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    const isNarration = narrationPatterns.some(p => p.test(trimmed));
    if (isNarration) {
      stripped.push({
        type: "narration",
        message: "Narration / thought process stripped",
        match: trimmed,
      });
    }
    return !isNarration;
  });

  return { text: cleaned.join("\n"), stripped };
}

/**
 * Remove blocked phrases from text.
 */
export function removeBlockedPhrases(
  text: string,
  phrases: string[]
): { text: string; removed: ValidationIssue[] } {
  const removed: ValidationIssue[] = [];
  let result = text;

  for (const phrase of phrases) {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (regex.test(result)) {
      removed.push({
        type: "blocked_phrase",
        message: `Blocked phrase removed: "${phrase}"`,
        match: phrase,
      });
      result = result.replace(regex, "");
    }
  }

  return { text: result, removed };
}
