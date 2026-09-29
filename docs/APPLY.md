# Apply the kit

1. Extract this folder into the root of `KAYANSTOR/AI`.
2. Keep the `.github/agents/*.agent.md` files in the repository.
3. Open VS Code and run `Chat: Manage Language Models`.
4. Add CodeCraft as a Custom Endpoint using Chat Completions and the base URL in `chatLanguageModels.example.json`.
5. Add OpenRouter as a Custom Endpoint using Chat Completions and the base URL in `chatLanguageModels.example.json`.
6. Store both keys as VS Code input/secret values. Never commit the raw keys.
7. Use model IDs that are actually returned by each provider. The file contains documented/current examples; your account may expose a different CodeCraft model list.
8. Make the model display names exactly match the names in the agent frontmatter, or edit the agent `model` fields to match your picker names.
9. In Chat, select the Local session target and choose `AI Orchestrator`.
10. Enable subagent invocation/run-subagent when VS Code shows that tool in Configure Tools.
11. Test with a read-only task before allowing modifications.
