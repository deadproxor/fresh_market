Project Rules for AI Assistant
1. Git & Version Control Restrictions
STRICT FORBIDDEN: Do NOT perform any Git write operations autonomously.
Never run git add, git commit, git push, git checkout, git merge, or git rebase without explicit, direct instructions from the user.
If you believe a commit is needed, simply suggest the commit message in chat and wait for approval.
2. Code Modification Workflow (Discuss First)
STRICT FORBIDDEN: Do NOT modify files or generate diffs immediately upon receiving a prompt or question.
Always analyze the problem, outline the proposed approach, and discuss the plan with the user first.
Only proceed with modifying the files after the user has explicitly confirmed the proposed changes.
Keep proposed changes scoped strictly to what was agreed upon; do not perform unrelated refactoring.