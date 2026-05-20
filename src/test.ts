import { describe, it } from "node:test";
import assert from "node:assert";
import { validate, looksLikeError } from "./index";

describe("Hallucination detection", () => {
  it("catches hallucinated email send", () => {
    const r = validate({ response: "I've sent the email to john@example.com", toolCalls: [] });
    assert.strictEqual(r.pass, false);
    assert.strictEqual(r.issues.some(i => i.type === "hallucination"), true);
  });

  it("passes when tool was actually called", () => {
    const r = validate({
      response: "I've sent the email",
      toolCalls: [{ name: "gmail_send", input: {}, output: '{"success":true}' }],
    });
    assert.strictEqual(r.pass, true);
  });

  it("catches hallucinated tweet", () => {
    const r = validate({ response: "I've posted the tweet thread", toolCalls: [] });
    assert.strictEqual(r.pass, false);
  });

  it("catches hallucinated doc creation", () => {
    const r = validate({ response: "I've created the Google Doc", toolCalls: [] });
    assert.strictEqual(r.pass, false);
  });

  it("passes with no action claims", () => {
    const r = validate({ response: "Here is some information about the topic.", toolCalls: [] });
    assert.strictEqual(r.pass, true);
  });

  it("catches hallucinated save", () => {
    const r = validate({ response: "I've saved that to memory", toolCalls: [] });
    assert.strictEqual(r.pass, false);
  });

  it("catches hallucinated delete", () => {
    const r = validate({ response: "I've deleted the file", toolCalls: [] });
    assert.strictEqual(r.pass, false);
  });

  it("matches partial tool names", () => {
    const r = validate({
      response: "I've sent the email",
      toolCalls: [{ name: "send_email_v2", input: {}, output: "{}" }],
    });
    assert.strictEqual(r.pass, true);
  });
});

describe("Narration stripping", () => {
  it("strips 'Let me save'", () => {
    const r = validate({ response: "Let me save this file.\n\nHere is the result." });
    assert.strictEqual(r.cleaned, "Here is the result.");
  });

  it("strips 'Now I need to'", () => {
    const r = validate({ response: "Now I need to check the database.\n\nThe answer is 42." });
    assert.strictEqual(r.cleaned, "The answer is 42.");
  });

  it("strips 'I'm going to'", () => {
    const r = validate({ response: "I'm going to analyze this.\n\nThe data shows growth." });
    assert.strictEqual(r.cleaned, "The data shows growth.");
  });

  it("strips 'First, I'll'", () => {
    const r = validate({ response: "First, I'll look up the info.\n\nHere are the results." });
    assert.strictEqual(r.cleaned, "Here are the results.");
  });

  it("strips 'Alright, let me'", () => {
    const r = validate({ response: "Alright, let me check on that.\n\nDone." });
    assert.strictEqual(r.cleaned, "Done.");
  });

  it("keeps normal text untouched", () => {
    const r = validate({ response: "The meeting is at 3pm tomorrow." });
    assert.strictEqual(r.cleaned, "The meeting is at 3pm tomorrow.");
  });

  it("strips multiple narration lines", () => {
    const r = validate({
      response: "Let me check.\nI'll process this now.\n\nHere's what I found.",
    });
    assert.strictEqual(r.cleaned, "Here's what I found.");
  });

  it("reports stripped lines as issues", () => {
    const r = validate({ response: "Let me save this.\n\nResult." });
    assert.strictEqual(r.issues.some(i => i.type === "narration"), true);
  });
});

describe("Blocked phrases", () => {
  it("removes a blocked phrase", () => {
    const r = validate({
      response: "Hey there! Great news.",
      options: { blockedPhrases: ["hey there"] },
    });
    assert.strictEqual(r.cleaned.includes("Hey there"), false);
    assert.strictEqual(r.issues.some(i => i.type === "blocked_phrase"), true);
  });

  it("removes multiple blocked phrases", () => {
    const r = validate({
      response: "The bottom line is we should let me paint you a picture of success.",
      options: { blockedPhrases: ["the bottom line", "let me paint you a picture"] },
    });
    assert.strictEqual(r.issues.filter(i => i.type === "blocked_phrase").length, 2);
  });

  it("case insensitive matching", () => {
    const r = validate({
      response: "HEY THERE friend!",
      options: { blockedPhrases: ["hey there"] },
    });
    assert.strictEqual(r.cleaned.includes("HEY THERE"), false);
  });
});

describe("Tool failure detection", () => {
  it("catches success claim when tool returned JSON error", () => {
    const r = validate({
      response: "I've sent the email to john@example.com",
      toolCalls: [{ name: "gmail_send", input: { to: "john@example.com" }, output: '{"error":"Request failed with status 500"}' }],
    });
    assert.strictEqual(r.pass, false);
    assert.strictEqual(r.issues[0].message.includes("returned an error"), true);
  });

  it("catches success claim when tool returned success: false", () => {
    const r = validate({
      response: "I've drafted the email",
      toolCalls: [{ name: "gmail_create_draft", input: {}, output: '{"success":false,"message":"Auth expired"}' }],
    });
    assert.strictEqual(r.pass, false);
  });

  it("catches success claim when tool returned error status code", () => {
    const r = validate({
      response: "I've posted the tweet thread",
      toolCalls: [{ name: "twitter_post_thread", input: {}, output: '{"status":403,"message":"Forbidden"}' }],
    });
    assert.strictEqual(r.pass, false);
  });

  it("catches success claim when tool returned plain-text error", () => {
    const r = validate({
      response: "I've created the Google Doc",
      toolCalls: [{ name: "docs_create", input: {}, output: "Error: Permission denied" }],
    });
    assert.strictEqual(r.pass, false);
  });

  it("passes when tool returned actual success", () => {
    const r = validate({
      response: "I've sent the email",
      toolCalls: [{ name: "gmail_send", input: {}, output: '{"success":true,"id":"msg_123"}' }],
    });
    assert.strictEqual(r.pass, true);
  });

  it("does not false-positive on 'no errors' in output", () => {
    assert.strictEqual(looksLikeError("Completed with no errors"), false);
  });

  it("does not false-positive on 'successfully' in output", () => {
    assert.strictEqual(looksLikeError("Email sent successfully"), false);
  });

  it("detects timeout in plain text", () => {
    assert.strictEqual(looksLikeError("Connection timed out after 30s"), true);
  });
});

describe("Edge cases", () => {
  it("handles empty response", () => {
    const r = validate({ response: "" });
    assert.strictEqual(r.pass, true);
    assert.strictEqual(r.cleaned, "");
  });

  it("handles no tool calls", () => {
    const r = validate({ response: "Just a normal response" });
    assert.strictEqual(r.pass, true);
  });

  it("respects checkHallucinations: false", () => {
    const r = validate({
      response: "I've sent the email",
      toolCalls: [],
      options: { checkHallucinations: false },
    });
    assert.strictEqual(r.pass, true);
  });

  it("respects stripNarration: false", () => {
    const r = validate({
      response: "Let me check.",
      options: { stripNarration: false },
    });
    assert.strictEqual(r.cleaned, "Let me check.");
  });

  it("preserves original in result", () => {
    const r = validate({ response: "Let me check.\n\nDone." });
    assert.strictEqual(r.original, "Let me check.\n\nDone.");
  });

  it("cleans up excessive whitespace", () => {
    const r = validate({ response: "Hello.\n\n\n\n\nWorld." });
    assert.strictEqual(r.cleaned, "Hello.\n\nWorld.");
  });
});

describe("Custom patterns", () => {
  it("accepts custom narration patterns", () => {
    const r = validate({
      response: "THINKING: let me consider.\n\nThe answer is yes.",
      options: { narrationPatterns: [/^THINKING:/i] },
    });
    assert.strictEqual(r.cleaned, "The answer is yes.");
  });

  it("accepts custom action patterns", () => {
    const r = validate({
      response: "I've deployed the app",
      toolCalls: [],
      options: {
        actionPatterns: [{ pattern: /I('ve|'ve) deployed/i, tools: ["deploy_app"] }],
      },
    });
    assert.strictEqual(r.pass, false);
  });
});
