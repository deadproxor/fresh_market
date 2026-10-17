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
3. Работа с компонентами проекта: все компоненты интерфейса собраны на странице компонентов. все части приложения наследуют компоненты из этой страницы автоматически при их изменении. все стили для компонентов хранятся в components.css. остальные части приложения наследуют с нужными дополнениями в отдельных файлах стилей. изменение стилей компонентов только с подтверждением.
4. не изменять самостоятельно никакие элементы интефейса или текст без запроса.
5. следить за версионированием и обновлением документации.
6. при изменениях в проекте всегда обновлять сопутствующую документацию с уведомлением об внесенных изменениях.
7. следить за синхронностью файлов локализации в директории locales в соответствие с изменениями. предлагать варианты перевода.
8. использовать скиллы только тогда, когда это необходимо при постановке задачи. для рутинных операций не использовать.
9. Node не установлен на этом компьютере.
10. не добавлять иконки во второстепенные элементы интерфейса. при добавлении -- уточнять.
11. никаких географических уточнений: самкхи, Samaki Market, кампот итд, если не указано обратное