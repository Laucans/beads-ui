# Agent Instructions — Crew local_qwen

## Context Window Management

**CRITICAL: You have a 32,768 token context limit.**

When you reach **24,000 tokens**, you MUST:
1. Finish writing your current file (complete it, don't leave it half-done)
2. Immediately commit and close the current bead with these exact commands:
   ```
   git -C /Users/laurentcanis/gastown/beads_ui/crew/local_qwen add -A
   git -C /Users/laurentcanis/gastown/beads_ui/crew/local_qwen commit -m "feat: <bead description>"
   git -C /Users/laurentcanis/gastown/beads_ui/crew/local_qwen push
   BEADS_DIR=/Users/laurentcanis/gastown/beads_ui/.beads bd close <bead-id>
   gt nudge mayor "<bead-id> complete, ready for next"
   ```
3. Stop working after the commit — do not start new tasks

**Do NOT wait until 32K to commit.** At 24K you still have room to run the git commands. At 32K you are blocked and cannot commit.

## Workflow

- Check context usage regularly (visible in the bottom bar)
- Prioritize committing working code over writing perfect code
- If you see your context above 20K, plan to commit soon
- Always commit before starting the next file if context > 22K
