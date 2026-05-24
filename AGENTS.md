# Agent Instructions — Crew local_qwen

## Per-Function Workflow — MANDATORY

For EVERY function you write, follow this exact loop. No exceptions.

### Step 1 — Write the function + its test
Write one function. Immediately write its test(s) in the same or adjacent file.
Never write two functions before completing the loop below.

### Step 2 — cargo check loop
```
cargo check --message-format=short
```
- If errors → fix them → `git add -A && git commit -m "fix: <what you fixed>"` → repeat cargo check
- Repeat until `cargo check` exits with 0 errors
- Only warnings are acceptable — errors must be zero

### Step 3 — cargo test loop
```
cargo test 2>&1 | tail -30
```
- If test failures → fix them → `git add -A && git commit -m "fix: <test name>"` → repeat cargo test
- Repeat until all tests pass (0 failures)

### Step 4 — Commit the working function
```
git add -A && git commit -m "feat: <function_name> + test"
```

### Step 5 — Move to the next function
Only after Step 4 is done. Never skip ahead.

---

## Context Window Management

**CRITICAL: You have a 32,768 token context limit.**

When you reach **24,000 tokens**, you MUST:
1. Finish the current per-function loop (complete Step 2-4 for the function in progress)
2. Commit and close the current bead:
   ```
   git -C /Users/laurentcanis/gastown/beads_ui/crew/local_qwen add -A
   git -C /Users/laurentcanis/gastown/beads_ui/crew/local_qwen commit -m "feat: <bead description> partial"
   git -C /Users/laurentcanis/gastown/beads_ui/crew/local_qwen push
   BEADS_DIR=/Users/laurentcanis/gastown/beads_ui/.beads bd close <bead-id>
   gt nudge mayor "<bead-id> complete, ready for next"
   ```
3. Stop — do not start new tasks

**Do NOT wait until 32K.** At 24K you still have room to run git commands. At 32K you are blocked.

- Check context usage regularly (visible in the bottom bar)
- If context > 20K → finish current function loop → commit → stop
