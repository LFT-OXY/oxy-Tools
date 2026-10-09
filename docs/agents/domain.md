# Domain Docs

各工程 skill 在探索代码库时应如何使用本仓库的领域文档。

## Before exploring, read these

- 仓库根目录的 **`GLOSSARY.md`**，或
- 仓库根目录的 **`GLOSSARY-MAP.md`**（如果存在）——它指向每个上下文各自的 `GLOSSARY.md`。阅读与当前主题相关的每一份。
- **`docs/adr/`**——阅读涉及你即将改动区域的 ADR。在多上下文仓库中，还要查看 `src/<context>/docs/adr/` 里的上下文级决策。

如果这些文件不存在，**静默继续**。不要指出它们缺失，也不要建议预先创建。`atw-domain-modeling` skill（经由 `atw-askme-with-docs` 和 `atw-improve-codebase-architecture` 触达）会在术语或决策真正被确定时按需创建它们。

## File structure

本仓库是单上下文仓库：

```
/
├── GLOSSARY.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `GLOSSARY-MAP.md`）的布局如下，仅供日后切换时参考：

```
/
├── GLOSSARY-MAP.md
├── docs/adr/                          ← 全系统级决策
└── src/
    ├── ordering/
    │   ├── GLOSSARY.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── GLOSSARY.md
        └── docs/adr/
```

## Use the glossary's vocabulary

当你的输出要命名一个领域概念时（issue 标题、重构提案、假设、测试名），使用 `GLOSSARY.md` 中定义的术语。不要漂移到词汇表明确避免的同义词。

如果你需要的概念还不在词汇表里，这本身就是信号——要么你在发明项目并不使用的说法（请重新考虑），要么确实存在缺口（记下来交给 `atw-domain-modeling`）。

## Flag ADR conflicts

如果你的输出与现有 ADR 相矛盾，要明确指出，而不是悄悄覆盖：

> _与 ADR-0007（event-sourced orders）相矛盾——但值得重新讨论，因为……_
