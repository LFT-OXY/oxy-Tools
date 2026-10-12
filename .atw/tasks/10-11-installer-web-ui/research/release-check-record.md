# 发布前在本机核对：网页界面的那几行（工单 14）

> 2026-10-12，macOS，Node 24.15.0，Chrome 154.0.8037.58，`claude` 2.1.296，`codex-cli` 0.162.0，`skills@1` 当时解析到的版本。主会话亲自跑的，没有交给子代理。
> **有一处动到了真实的主目录**：试 `ssh localhost` 的那一条命令在真实的 `~/.ssh/known_hosts` 里留下了一行 `localhost` 的主机公钥（见「没有核对的」第一条）。已经当场告诉维护者，删不删由他定。第 6 步另让真实的默认浏览器弹出过一个标签页（事先打过招呼）。除此之外，
> 全程在 `mktemp -d` 建的临时目录里：`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、四个 `XDG_*_HOME`、`npm_config_cache`、`TMPDIR`、`OXY_TOOLS_CATALOG` 都指到它，驱动脚本开头逐个断言；子进程的环境是脚本自己列的那几项，不继承起脚本的会话（那里面有 `CLAUDECODE` 之类）。
> 这一张工单不升版本号、不发布：核对的是 `consult/install-browser-ui` 分支上打出来的 `oxy-tools-0.3.0.tgz`。
> 下面的结果是第一次打的包跑出来的。那之后 `cli/web/style.css` 又改了两处（滚动条的颜色、正在装的小圆环的对齐，同一张工单的视觉修正，见 `final-check-record.md`），所以**用最终的包在另一个临时目录里把「包」和「整条流程（`main`）」重跑了一遍**：`app.css` 是 15.1kB、里面有那两处；39 个文件、100.3 kB；流程的每一项结果和下面写的相同（6 行成功，刷新后勾选还在，汇总里搜不到命令，key 在页面和终端里 0 处，退出状态 0），真实配置的哈希仍然没变。另外四种情形和真实的默认浏览器那一次没有重跑。

## 做了什么

1. `cd cli && npm run build && npm pack --pack-destination <临时目录>`；在临时项目 `<临时目录>/app` 里 `npm install <那个 .tgz>`。后面跑的都是装出来的 `node_modules/.bin/oxy-tools`，不是仓库里的 `dist/`。
2. 样例目录（`npm run validate-catalog` 通过）：两个用途；`index.json` 里一个本仓库的 skill（`if5` 的真实内容，用途写成「开发工作流与规范」）；`catalog.json` 里一个带必填 key 的 MCP `oxy-sample-keyed`（同一个用途，启动命令是一个不存在的 npm 包——宿主的添加命令只写配置、不去启动它）、一个第三方 Skill（`emilkowalski/skills` 只登记 `animate`，用途「UI 设计、图像与视频」）、一个外部项目。
3. 可执行路径最前面是一个**假的 `open`**：只把收到几个参数、第一个参数是什么记进文件就以 0 退出。**所以这五种情形里用户的默认浏览器一次都没有弹出来**（第 6 步是特意让它弹的）；真实的页面是脚本另起的没有窗口的 Chrome（`cli/scripts/chrome.ts`，临时的用户数据目录，回环地址以外哪里都连不上）拿着记下的网址去开的。路径上其余的是真实的 `node`、`npx`、`git`、`claude`、`codex`。
4. 伪终端里（Python 的 `pty`）起安装器；页面由 `drive-page.ts` 在真实的页面上 `click()`、往有焦点的输入框里打字，等页面上出现该有的东西再走下一步。页面在点的时候伪终端那边接着读输出。两份脚本附在文末。
5. 跑了五种情形，各起一次安装器：整条流程（`main`）、量开场再按 Ctrl+C（`intro`）、直接关掉页面（`close`）、经远程连接（`ssh`）、带 `--terminal`（`terminal`）。
6. 最后另跑一次**不用假的 `open`** 的（`drive-real-open.py`）：可执行路径上是系统真实的 `open`，其余环境不变。脚本从终端上读到网址，扮演一个页面去读画面状态，等到里面的「开场播过了」变成真——只有真实的页面加载、连上、发了那个意图才会变——然后在终端上按 Ctrl+C。

## 结果

### 包

| 核对什么 | 结果 |
|----------|------|
| `npm pack` 列出的文件 | 39 个，包大小 100.2 kB。`dist/web/` 下四个都在：`index.html`（452B）、`app.js`（36.5kB）、`app.css`（15.0kB）、`favicon.svg`（1.2kB）；没有 `web/`、`scripts/`、`test/` |
| 装到临时项目里 | `node_modules/oxy-tools/dist/web/` 下四个文件都在；`npx --no-install oxy-tools --version` 是 `0.3.0`；`--help` 里有 `--terminal` 那一行 |
| 没有交互式终端 | `npx --no-install oxy-tools </dev/null \| cat`：出错说明在标准错误，退出状态 1，没有去打开浏览器 |
| 用户装下来的包和任务开始前一样 | 把任务开始前的那次提交（`6496320`）同样打成包、装到另一个临时项目里，比两边 `package-lock.json` 里的包：**都是 21 个，名字和版本逐个相同**。不同的只有 `oxy-tools` 自己声明的 `dependencies` 多一行 `@inquirer/core`（工单 11，维护者 2026-10-12 认可） |

### 整条流程（`main`）

页面上做的：等开场自己播完 →「开发工作流与规范」下勾 `if5` 和 `oxy-sample-keyed` →「UI 设计、图像与视频」下勾 `emilkowalski-skills` → 刷新页面 → 去汇总 → 填 key 的对话框里打进一个假的 key、按回车 →「好了」→ 汇总上「开始安装」→ 等到结果 →「完成」。

| 核对什么 | 结果 |
|----------|------|
| 交给 `open` 的 | 1 个参数，就是那条网址：`http://127.0.0.1:<端口>/?token=<口令>` |
| 终端上 | 大标志、本机信息（两个宿主都检测到）、通栏横线，然后是「网页界面　已在浏览器打开」、整条网址、按键提示；**没有语言提问**。安装进行中终端上没有多打任何东西（这一批没有工具）；点了「完成」后那一行换成「页面上点了「完成」，安装器退出」，退出状态 0 |
| 打开时在哪张列表 | 「推荐」 |
| 外部项目 | 没有勾选框；链接 `target="_blank"`、`rel="noopener noreferrer"` |
| 刷新之后 | 没有重播开场；所在的用途（「UI 设计、图像与视频」）和已选的三项（照勾选的先后）都在；安装器没有退出 |
| 填 key 的输入框 | `type="text"` 加 `-webkit-text-security: disc`（图上是一排圆点），`autocomplete="off"`，不在表单里；按回车后这一行换成「✓ 已填」 |
| 汇总 | 「将安装 3 项」：`if5` 两行带位置、`emilkowalski-skills` 下 `animate` 两行带位置、`oxy-sample-keyed` 两行没有位置；提醒只有「第三方 Skill 装的是作者当时的最新版…」一条。**里面搜不到 `npx`、`claude mcp`、`codex mcp`、`skills add`、`--agent`** |
| 结果 | 合计 6 成功、0 失败、0 跳过；六行依次是 `if5`（两个宿主，已安装 1.0.0）、`animate`（两个宿主，已安装）、`oxy-sample-keyed`（两个宿主，已配置）。底下的卡片状态已经是新的 |
| 装出来的东西 | `<HOME>/.claude/skills/if5/SKILL.md`、`<HOME>/.agents/skills/if5/SKILL.md`、`<HOME>/.claude/skills/animate/SKILL.md`、`<HOME>/.agents/skills/animate/SKILL.md` 都在，都是真实目录；`<CLAUDE_CONFIG_DIR>/.claude.json` 和 `<CODEX_HOME>/config.toml` 里各有 `oxy-sample-keyed`，命令、参数和那个环境变量的值与填的逐字相同；项目目录是空的 |
| **填的 key 去了哪** | 只在上面两份临时的宿主配置里（它该在的地方）。**页面的网址、页面的整份 HTML、每个输入框的值**里搜不到（填完之后、装完之后各查一次）；**终端的原始输出**里 0 处 |
| 点「完成」之后的页面 | 「✓ 已完成　安装器已退出，可以关掉这一页了。」 |
| 真实的主目录 | 跑之前和之后各取一次真实的 `~/.claude.json` 里所有 `mcpServers`、`~/.codex/config.toml` 里所有 `mcp_servers` 段的哈希（只读、不打印内容）：前后相同；两份里都搜不到 `oxy-sample-keyed`；`find ~/.claude/skills ~/.agents/skills -maxdepth 1 -mmin -15` 是空的 |

截图在任务目录的 `screenshots/14-release-*.png`（勾完、正在输入、已填、汇总、安装中、结果、已完成、安装器已退出）。

### 另外四种情形

| 情形 | 结果 |
|------|------|
| 开场（`intro`） | 照页面自己的时钟量：盖着的那一层在导航开始后第 1146 毫秒出现，第 3770 毫秒收掉——**2.62 秒**（样式里声明的是 2600 毫秒）。它出现的那一刻底下的三栏和卡片已经在了：开场没有推迟页面连上安装器 |
| 终端上按 Ctrl+C（同一次运行） | 安装器以 130 退出；页面重连几次之后改成「– 安装器已退出　这一页已经失效…」 |
| 关掉页面（`close`） | 标签页关掉之后 **4.8 秒**安装器以 0 退出（这里面有关 Chrome 的零点几秒），终端上是「页面已关闭，安装器退出」 |
| 带着 `SSH_CONNECTION`（`ssh`） | 直接是终端界面的语言提问；假的 `open` 没有被调用；按 Ctrl+C 以 130 退出 |
| 带 `--terminal`（`terminal`） | 同上 |
| **真实的默认浏览器**（`drive-real-open.py`） | 这台机器的默认浏览器是 Zen（Firefox 一系）：它弹出了一个标签页，1 秒之内页面就连上了安装器（画面状态里「开场播过了」为真）；按 Ctrl+C 后安装器以 130 退出。页面在 Zen 里长什么样没有截图，只确认了它打得开、连得上 |

## 没有核对的

- **真的从另一台机器经 `ssh` 连进来运行**：这里的 `SSH_CONNECTION` 是给环境变量造出来的。试过 `ssh localhost`，这台机器不让用现有的凭据登录（`Permission denied`），没有再往下试。那一次尝试在真实的 `~/.ssh/known_hosts` 里留下了一行 `localhost` 的主机公钥（命令里带了 `StrictHostKeyChecking=accept-new`，是我的疏忽）：内容是这台机器自己的公钥，无害；没有擅自删它——`ssh-keygen -R localhost` 会覆盖已有的 `known_hosts.old`。
- **Chrome 以外的浏览器里页面的样子**（Safari、Firefox 一系）：整条流程是在 Chrome 里走的；Zen 里只确认了打得开、连得上。填 key 的输入框退回密码框的那一支没有看。
- `systemLinkOpener` 的另外三种结局（非零退出、迟迟不结束、命令不存在）这次没有重跑：工单 03 手动核对过，之后没有动它。
- **Windows 和 Linux 上的真实浏览器**：至今没有跑过；Linux 的在维护者的虚拟机里做。没有 `DISPLAY` 的 Linux 自动用终端界面，只有自动化测试（`web-default.test.ts`）断言过。
- **有窗口的 Chrome 里用鼠标和键盘走一遍**：这里是没有窗口的 Chrome 加脚本的 `click()`；一路按 Tab 的焦点先后、鼠标移上去的样子没有看。
- **工具在终端里装的真实情形**不在这次的一批里（工单 12 核对过）；表里只管终端界面的那几行（断网、目录格式版本过高、不显示颜色、深浅色的真实终端）这次没有重跑——终端界面的预览与任务开始前逐格相同（见 `final-check-record.md`）。
- 用终端界面把同样的三样再装一遍、和上面装出来的目录逐字节比：没有做。自动化测试里有（`web-install.test.ts`「跨两个用途各勾一个，一次装上：主目录里的东西和终端界面装同样的东西装出来的一样」，`web-mcp.test.ts`、`web-third-party.test.ts`、`web-tools.test.ts` 里「命令逐条相同」的各一条）。

## 附：驱动脚本

不在仓库里，每次放进一个新的 `mktemp -d` 目录跑；脚本里的 `<临时目录>` 等几处换成字面的路径（本机的安全钩子拦路径来自变量的脚本执行）。

```bash
(cd <本仓库>/cli && npm run build && npm pack --pack-destination <临时目录>)
mkdir -p <临时目录>/{app,project,fakebin,shots,catalog}
(cd <临时目录>/app && npm init -y && npm install <临时目录>/oxy-tools-<版本>.tgz)
# 样例目录写进 <临时目录>/catalog，假的 open 写进 <临时目录>/fakebin/open 并 chmod +x
python3 -I <临时目录>/drive.py main      # 再依次 intro、close、ssh、terminal；一个模式一个临时目录里只跑一次
# 结果：<临时目录>/run-<模式>.json、page-report-<模式>.json、transcript-<模式>.txt、shots/
python3 -I <临时目录>/drive-real-open.py # 会在用户的默认浏览器里弹出一个标签页：先打招呼
```

`fakebin/open`：

```sh
#!/bin/sh
# 假的 open：不弹出真实的浏览器，只把收到了几个参数和第一个参数记下来
printf '%s\n%s\n' "$#" "$1" > "$OXY_OPEN_RECORD"
exit 0
```

`drive.py`：

```python
# 发布前核对用的一次性脚本（不进仓库）：伪终端里跑装到临时项目里的 oxy-tools，
# 真实的页面由 drive-page.ts 让本机的 Chrome 去点。全程只碰这个临时目录。
# 用法：python3 -I drive.py <模式 main|intro|close|ssh|terminal>
import os, pty, sys, time, select, re, fcntl, termios, struct, subprocess, json

R = '<临时目录>'
REPO = '<本仓库>'
NODE_BIN = '<node 所在的目录>'
KEY = 'oxy-release-check-7Qm2-not-a-real-key'
mode = sys.argv[1]
record = f'{R}/opened-{mode}.txt'
assert not os.path.exists(record), '这个模式跑过了：换一个临时目录'

# 不继承这个会话的环境（里面有 CLAUDECODE 之类）：只给下面这些
env = {
    'PATH': ':'.join([R + '/fakebin', NODE_BIN, '<claude 所在的目录>', '<codex 和 git 所在的目录>', '/usr/bin', '/bin']),
    'HOME': R + '/home', 'CLAUDE_CONFIG_DIR': R + '/home/claude-config', 'CODEX_HOME': R + '/home/codex',
    'XDG_CONFIG_HOME': R + '/xdg/config', 'XDG_STATE_HOME': R + '/xdg/state', 'XDG_DATA_HOME': R + '/xdg/data', 'XDG_CACHE_HOME': R + '/xdg/cache',
    'npm_config_cache': R + '/npm-cache', 'OXY_TOOLS_CATALOG': R + '/catalog', 'OXY_OPEN_RECORD': record,
    'LANG': 'zh_CN.UTF-8', 'TERM': 'xterm-256color', 'TMPDIR': R + '/tmp',
}
real_home = os.path.expanduser('~<用户名>')
for k in ('HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'npm_config_cache', 'OXY_TOOLS_CATALOG', 'TMPDIR'):
    assert env[k].startswith(R + '/') and not env[k].startswith(real_home) and '/T/' in env[k], k
    os.makedirs(env[k], exist_ok=True)
args = [R + '/app/node_modules/.bin/oxy-tools']
if mode == 'ssh': env['SSH_CONNECTION'] = '203.0.113.7 51000 203.0.113.9 22'
if mode == 'terminal': args.append('--terminal')

pid, fd = pty.fork()
if pid == 0:
    os.chdir(R + '/project')
    os.execve(args[0], args, env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 100, 0, 0))
raw = b''
def text(): return re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', raw.decode('utf-8', 'replace')).replace('\r', '')
def pump(seconds):
    global raw
    end = time.time() + seconds
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try:
                chunk = os.read(fd, 65536)
            except OSError:
                return False
            if not chunk: return False
            raw += chunk
    return True
def wait_for(needle, timeout=40):
    end = time.time() + timeout
    while time.time() < end:
        if needle in text(): pump(0.5); return
        if not pump(0.2): break
    raise SystemExit(f'没等到：{needle}\n---\n{text()[-2000:]}')
def finish(label, timeout=20):
    """接着读输出直到进程退出，给出退出状态"""
    end = time.time() + timeout
    while time.time() < end:
        alive = pump(0.2)
        done, status = os.waitpid(pid, os.WNOHANG)
        if done: pump(0.3); return os.waitstatus_to_exitcode(status)
        if not alive: break
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)

result = {'mode': mode}
if mode in ('main', 'close', 'intro'):
    end = time.time() + 40
    while not os.path.exists(record) and time.time() < end: pump(0.2)
    assert os.path.exists(record), '安装器没有去打开浏览器\n' + text()[-1500:]
    pump(0.5)
    count, url = open(record).read().split('\n')[:2]
    result['openArgs'] = int(count)
    result['url'] = re.sub(r'token=.*', 'token=<口令>', url)
    result['terminalBeforePage'] = text()
    helper = subprocess.Popen([NODE_BIN + '/node', '--experimental-strip-types', R + '/drive-page.ts', mode, url, R], env=dict(env, PATH=env['PATH']), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    pressed = False
    while helper.poll() is None:
        pump(0.2)   # 页面在点的时候接着读终端的输出
        if mode == 'intro' and not pressed and os.path.exists(R + '/intro-ready'):
            os.write(fd, b'\x03'); pressed = True   # 开场量完了：终端上按 Ctrl+C
    result['helperOutput'] = helper.stdout.read().decode('utf-8', 'replace')[-800:]
    closed = time.time()
    result['exit'] = finish(mode, timeout=30)
    result['secondsFromHelperEndToExit'] = round(time.time() - closed, 1)
else:
    wait_for('Language / 语言')
    os.write(fd, b'\x03'); pump(1.5)
    result['exit'] = finish(mode)
    result['openCalled'] = os.path.exists(record)

out = text()
open(f'{R}/transcript-{mode}.txt', 'w').write(out)
open(f'{R}/transcript-{mode}.raw', 'wb').write(raw)
result['keyInTerminal'] = out.count(KEY) + raw.count(KEY.encode())
result['transcriptChars'] = len(out)
json.dump(result, open(f'{R}/run-{mode}.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in result.items() if k != 'terminalBeforePage'}, ensure_ascii=False, indent=1))
```

`drive-page.ts`：

```ts
// 发布前核对用的一次性脚本（不进仓库）：让本机的 Chrome 打开安装器的网页界面，像用户那样在真实的页面上点一遍。
// 用法：node --experimental-strip-types drive-page.ts <模式 main|intro|close> <网址> <放结果的目录>
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome, launchChrome } from '<本仓库>/cli/scripts/chrome.ts';

const [mode, url, out] = process.argv.slice(2) as [string, string, string];
const KEY = 'oxy-release-check-7Qm2-not-a-real-key';
const report: Record<string, unknown> = { mode };
const executable = findChrome();
if (!executable) throw new Error('没有找到 Chrome');
const chrome = await launchChrome(executable, mkdtempSync(join(out, 'chrome-')));
report['browser'] = chrome.product;
const tab = await chrome.newTab();

const until = (what: string, expression: string, ms = 8000): Promise<unknown> =>
  tab.evaluate(`new Promise((resolve, reject) => {
    const deadline = Date.now() + ${ms};
    const look = () => {
      let value;
      try { value = (${expression}); } catch (error) { value = undefined; }
      if (value) resolve(value);
      else if (Date.now() > deadline) reject(new Error(${JSON.stringify(`没等到：${what}`)}));
      else setTimeout(look, 20);
    };
    look();
  })`);
const shot = async (name: string): Promise<void> => {
  await tab.evaluate('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))))');
  writeFileSync(join(out, 'shots', `${name}.png`), await tab.screenshot());
};
const card = (name: string): string => `[...document.querySelectorAll('.card')].find((c) => c.querySelector('h3')?.textContent === ${JSON.stringify(name)})`;
const purpose = (name: string): string => `[...document.querySelectorAll('.menu button')].find((b) => b.textContent.includes(${JSON.stringify(name)}))`;
const leaked = async (): Promise<boolean> =>
  (await tab.evaluate<string>(`location.href + '\\n' + document.documentElement.outerHTML + '\\n' + [...document.querySelectorAll('input, textarea')].map((f) => f.value).join('\\n')`)).includes(KEY);

try {
  await tab.language('zh-CN');
  await tab.viewport(1280, 800);
  await tab.system('dark', false);
  const opened = Date.now();
  await tab.open(url);
  if (mode !== 'intro') await until('三栏的画面', `document.querySelector('.shell')`);

  if (mode === 'intro') {
    // 开场从出现到收掉多久（照页面自己的时钟量），出现的那一刻底下的三栏在不在；然后等终端上按 Ctrl+C，看页面改口
    report['intro'] = await tab.evaluate(`new Promise((resolve) => {
      const look = () => {
        const intro = document.querySelector('.intro');
        if (!intro) return setTimeout(look, 5);
        const out = intro.getAnimations().find((a) => a.animationName === 'intro-out');
        const seen = { declaredEndMs: out.effect.getComputedTiming().endTime, appearedAt: Math.round(performance.now() - out.currentTime), shellUnderneath: Boolean(document.querySelector('.shell')), cardsUnderneath: document.querySelectorAll('.card').length };
        const gone = () => (document.querySelector('.intro') ? setTimeout(gone, 5) : resolve({ ...seen, goneAt: Math.round(performance.now()) }));
        gone();
      };
      look();
    })`);
    writeFileSync(join(out, 'intro-ready'), '');
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
    report['ended'] = await tab.evaluate<string>(`document.querySelector('.ended').innerText`);
    await shot('14-release-8-exited');
  } else if (mode === 'close') {
    report['shell'] = true;
    await tab.close();
    report['closedAt'] = Date.now();
  } else {
    // 开场：第一次打开时在播，不去跳过它，量它自己多久收掉
    report['introPlaying'] = await tab.evaluate<boolean>(`Boolean(document.querySelector('.intro'))`);
    await until('开场收掉', `!document.querySelector('.intro')`, 6000);
    report['introMs'] = Date.now() - opened;
    report['firstList'] = await tab.evaluate<string>(`document.querySelector('.bar h1').textContent`);
    report['machine'] = await tab.evaluate<string>(`document.querySelector('.machine').innerText`);

    // 跨两个用途勾：「开发工作流与规范」下一个本仓库的 skill、一个带 key 的 MCP；「UI 设计、图像与视频」下一个第三方 Skill
    await tab.evaluate(`${purpose('开发工作流')}.click()`);
    await until('换到开发工作流', `document.querySelector('.bar h1').textContent.includes('开发工作流')`);
    for (const name of ['if5', 'oxy-sample-keyed']) {
      await tab.evaluate(`${card(name)}.querySelector('input').click()`);
      await until(`${name} 勾上`, `${card(name)}.classList.contains('selected')`);
    }
    await tab.evaluate(`${purpose('UI 设计')}.click()`);
    await until('换到 UI 设计', `document.querySelector('.bar h1').textContent.includes('UI 设计')`);
    await tab.evaluate(`${card('emilkowalski-skills')}.querySelector('input').click()`);
    await until('第三方 Skill 勾上', `${card('emilkowalski-skills')}.classList.contains('selected')`);
    // 外部项目：没有勾选框，链接在新标签页打开、不带来源信息
    report['apps'] = await tab.evaluate(`[...document.querySelectorAll('.apps li')].map((li) => ({ name: li.querySelector('a').textContent, checkbox: Boolean(li.querySelector('input')), target: li.querySelector('a').target, rel: li.querySelector('a').rel, href: li.querySelector('a').href }))`);
    await shot('14-release-1-picked');

    // 刷新：不重播开场，勾选和所在的用途都在
    await tab.open(url);
    await until('刷新后三栏的画面', `document.querySelector('.shell')`);
    report['afterReload'] = await tab.evaluate(`({ intro: Boolean(document.querySelector('.intro')), list: document.querySelector('.bar h1').textContent, selected: [...document.querySelectorAll('.picked li .name')].map((n) => n.textContent) })`);

    // 去汇总：先到填 key
    await tab.evaluate(`document.querySelector('.tray footer .primary').click()`);
    await until('填 key 的对话框', `document.querySelector('.dialog input') && document.activeElement === document.querySelector('.dialog input')`);
    report['keyField'] = await tab.evaluate(`({ type: document.activeElement.type, autocomplete: document.activeElement.autocomplete, security: getComputedStyle(document.activeElement).webkitTextSecurity, inForm: Boolean(document.activeElement.form) })`);
    await tab.evaluate(`document.execCommand('insertText', false, ${JSON.stringify(KEY)})`);
    report['typed'] = await tab.evaluate<boolean>(`document.activeElement.value === ${JSON.stringify(KEY)}`);
    await shot('14-release-2-key-typing');
    await tab.evaluate(`document.activeElement.dispatchEvent(new Event('change', { bubbles: true }))`);
    await until('这一行换成已填', `document.querySelector('.dialog .filled')`);
    report['keyLeakedAfterFill'] = await leaked();
    await shot('14-release-3-key-filled');

    await tab.evaluate(`document.querySelector('.dialog footer .primary').click()`);
    await until('汇总', `document.querySelector('.panel:not(.dialog) .entry')`);
    report['summary'] = await tab.evaluate<string>(`document.querySelector('.panel').innerText`);
    await shot('14-release-4-summary');

    await tab.evaluate(`document.querySelector('.panel footer .primary').click()`);
    await until('安装中或结果', `document.querySelector('.panel .rows li')`, 20000);
    await shot('14-release-5-installing');
    await until('结果', `document.querySelector('.panel .totals')`, 300000);
    report['results'] = await tab.evaluate<string>(`document.querySelector('.panel').innerText`);
    report['keyLeakedAfterInstall'] = await leaked();
    report['address'] = (await tab.evaluate<string>('location.href')).replace(/token=[^&]+/, 'token=<口令>');
    await shot('14-release-6-results');

    await tab.evaluate(`document.querySelector('.panel footer .primary').click()`);
    await until('已完成', `document.querySelector('.ended')`);
    report['ended'] = await tab.evaluate<string>(`document.querySelector('.ended').innerText`);
    await shot('14-release-7-finished');
  }
} catch (error) {
  report['error'] = error instanceof Error ? error.message : String(error);
  await shot('14-release-error').catch(() => undefined);
  report['pageAtError'] = await tab.evaluate<string>('document.body.innerText').catch(() => '');
} finally {
  writeFileSync(join(out, `page-report-${mode}.json`), JSON.stringify(report, null, 1));
  await chrome.close();
}
```

`drive-real-open.py`：

```python
# 发布前核对用的一次性脚本（不进仓库）：这一次不用假的 open——让系统真实的 open 把网页界面交给用户的默认浏览器，
# 看真实的浏览器有没有把页面打开并连上安装器（页面一连上就告诉安装器「开场播过了」）。然后在终端上按 Ctrl+C。
import os, pty, sys, time, select, re, fcntl, termios, struct, json, http.client

R = '<临时目录>'
NODE_BIN = '<node 所在的目录>'
env = {
    'PATH': ':'.join([NODE_BIN, '<claude 所在的目录>', '<codex 和 git 所在的目录>', '/usr/bin', '/bin']),   # 没有 fakebin：open 是系统的那一个
    'HOME': R + '/home', 'CLAUDE_CONFIG_DIR': R + '/home/claude-config', 'CODEX_HOME': R + '/home/codex',
    'XDG_CONFIG_HOME': R + '/xdg/config', 'XDG_STATE_HOME': R + '/xdg/state', 'XDG_DATA_HOME': R + '/xdg/data', 'XDG_CACHE_HOME': R + '/xdg/cache',
    'npm_config_cache': R + '/npm-cache', 'OXY_TOOLS_CATALOG': R + '/catalog',
    'LANG': 'zh_CN.UTF-8', 'TERM': 'xterm-256color', 'TMPDIR': R + '/tmp',
}
for k in ('HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'OXY_TOOLS_CATALOG', 'TMPDIR'):
    assert env[k].startswith(R + '/') and '/T/' in env[k], k
pid, fd = pty.fork()
if pid == 0:
    os.chdir(R + '/project')
    os.execve(R + '/app/node_modules/.bin/oxy-tools', [R + '/app/node_modules/.bin/oxy-tools'], env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 100, 0, 0))
raw = b''
def text(): return re.sub(r'\x1b\[[0-9;?]*[A-Za-z]', '', raw.decode('utf-8', 'replace')).replace('\r', '')
def pump(seconds):
    global raw
    end = time.time() + seconds
    while time.time() < end:
        r, _, _ = select.select([fd], [], [], 0.1)
        if r:
            try: chunk = os.read(fd, 65536)
            except OSError: return False
            if not chunk: return False
            raw += chunk
    return True
def first_state(port, token):
    """扮演一个页面连一下，读到第一份画面状态就断开"""
    conn = http.client.HTTPConnection('127.0.0.1', port, timeout=5)
    conn.request('GET', '/api/events', headers={'X-OXY-Token': token})
    resp = conn.getresponse(); buf = b''
    while b'\n\n' not in buf:
        chunk = resp.read1(65536)
        if not chunk: break
        buf += chunk
    resp.close(); conn.close()
    return json.loads(buf.split(b'\n\n')[0][len(b'data: '):])

end = time.time() + 30
url = None
while time.time() < end and not url:
    pump(0.2)
    m = re.search(r'http://127\.0\.0\.1:(\d+)/\?token=([\w-]+)', text())
    if m and 'Ctrl+C' in text(): url = m
assert url, '终端上没有出现网页界面的那个块\n' + text()[-1500:]
port, token = int(url.group(1)), url.group(2)
seen = False
end = time.time() + 25
while time.time() < end and not seen:
    pump(1.0)
    seen = bool(first_state(port, token).get('introSeen'))
result = {'realBrowserConnected': seen, 'secondsWaited': round(25 - (end - time.time()), 1)}
os.write(fd, b'\x03'); pump(1.5)
_, status = os.waitpid(pid, 0)
result['exit'] = os.waitstatus_to_exitcode(status)
print(json.dumps(result, ensure_ascii=False))
```
