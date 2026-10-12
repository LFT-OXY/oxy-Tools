# Pi 和 omp 的 skill 装进共用 skill 目录，不用它们各自的目录

安装器新增 Pi 和 omp 两个宿主时，把它们的 skill 装进 `.agents/skills`（全局是主目录下的，项目是项目目录下的）——Codex 已经在用的那个目录，而不是 `~/.pi/agent/skills` 和 `~/.omp/agent/skills`。起因是第三方 Skill：装它的 skills CLI 给 Pi 只装到 `.agents/skills`，改不了；它也不认识 omp，omp 的第三方 Skill 只能借一个 omp 自己会读的目录装。Pi 和 omp 都读 `.agents/skills`，装在这里，本仓库的 skill 和第三方 Skill 就在同一处。

**Status**: accepted

**Considered Options**:

- 各用各的目录（`~/.pi/agent/skills`、`~/.omp/agent/skills`）。好处是三个宿主互不影响，给谁装就只有谁看得到。没有选是因为第三方 Skill 仍会落在 `.agents/skills`，Pi 的 skill 分在两处；同时选了 Codex 时 Pi 和 omp 会各读到两份同名的；omp 的第三方 Skill 只能标为不支持。

**Consequences**:

- Codex、Pi、omp 在 skill 上分不开：装给其中一个，另外两个也看得到，包括用户这次没选的。界面要把这件事告诉用户。
- 同时选了其中几个时，同一个 skill 只装一次，结果里合成一行。
- omp 还会读 Claude Code 的 skill 目录，所以同时装给 Claude Code 和 omp 时它会读到两份同名的；安装器不为此做处理，由 omp 自己取舍。
- 以后要改回各自的目录，用户已经装进 `.agents/skills` 的 skill 会留在原处，安装器在新位置看不到它们。
