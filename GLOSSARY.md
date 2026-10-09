# oxy-Tools

维护者策展的 AI 工具链目录，以及把目录中的组件装进宿主的安装器。

## Language

**安装器（Installer）**:
发布到 npm 的交互式命令行程序，让用户从目录中挑选条目并装进宿主。
_Avoid_: 脚手架、工作流

**目录（Catalog）**:
维护者策展的全部条目，既包括组件，也包括只提供链接的条目。
_Avoid_: 市场、registry

**组件（Component）**:
目录中安装器能替用户装上的条目。需要用户先申请并填入 API key 的仍是组件。
_Avoid_: 插件、包

**应用项目（Application Project）**:
目录中安装器装不了、只提供链接让用户按其官方文档自行安装的条目，如需要 docker 部署的框架。
_Avoid_: 参考项、项目（单用）

**skill 清单**:
目录中登记 skill 的那一部分，是本仓库 skill 的唯一登记处。
_Avoid_: 索引、manifest

**宿主（Host）**:
组件被装进的 AI 编码代理环境，如 Claude Code、Codex。安装器假定宿主已经存在，不负责安装宿主；界面文案显示为「AI Agent」。
_Avoid_: 平台、agent（留给子代理）

### 组件类型

**Skill**:
一个含 `SKILL.md` 的能力包。目录中的 skill 一律来自本仓库，第三方 skill 须先整包收进本仓库才能成为组件。

**MCP**:
一个 MCP 服务器，安装即把它的配置写进宿主。

**工具（Tool）**:
靠执行其官方安装命令装上的组件，包括命令行工具、spec 工具和宿主插件。
_Avoid_: CLI、插件（作为类型名）
