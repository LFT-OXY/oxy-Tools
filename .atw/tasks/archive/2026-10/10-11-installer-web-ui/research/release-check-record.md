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

---

# 带着开场引导重走一遍（工单 17）

> 2026-10-12，macOS，Node 24.15.0，Chrome 154.0.8037.58，`claude` 2.1.296，`codex-cli` 0.162.0，`skills@1` 当时解析到的版本。主会话亲自跑的，没有交给子代理。
> 加了开场引导（工单 16）、改了左栏（工单 15）之后，上面「发布前在本机核对」里网页界面的那几行带着开场引导重走了一遍。核对的是 `consult/install-browser-ui` 分支在 `7139336` 之后的工作区打出来的 `oxy-tools-0.3.0.tgz`（这一张工单只改了文档，`cli/src`、`cli/web` 没有动）。不升版本号、不发布。
> **全程在 `mktemp -d` 建的临时目录里，这一次没有动到真实的主目录，也没有弹出过用户的默认浏览器**：做法同上——`HOME`、`CLAUDE_CONFIG_DIR`、`CODEX_HOME`、四个 `XDG_*_HOME`、`npm_config_cache`、`TMPDIR`、`OXY_TOOLS_CATALOG` 都指到临时目录并逐个断言，子进程的环境只给列出来的那几项；可执行路径最前面是假的 `open`，真实的页面由脚本另起的没有窗口的 Chrome 去开。「真实的默认浏览器弹得出来」那一行因此**没有重跑**（它要弹出用户的浏览器）。

## 做了什么

1. `cd cli && npm run build && npm pack --pack-destination <临时目录>`；在临时项目 `<临时目录>/app` 里 `npm install <那个 .tgz>`。后面跑的都是装出来的 `node_modules/.bin/oxy-tools`。
2. 样例目录和上一次一样的布置（`npm run validate-catalog` 通过：1 个 skill、1 个第三方 Skill、1 个 MCP、1 个外部项目、2 个用途）：本仓库的 skill `if5` 和带必填 key 的 MCP `oxy-sample-keyed` 在「开发工作流与规范」下，第三方 Skill `emilkowalski-skills`（只登记 `animate`）在「UI 设计、图像与视频」下。
3. 伪终端里起安装器（`drive.py`），页面由 `drive-page.ts` 驱动。**和上一次不一样的两处**：开场引导上的点击和按键是经调试协议发的真实鼠标、键盘事件（`Input.dispatchMouseEvent`、`Input.dispatchKeyEvent`）——为此把 `cli/scripts/chrome.ts` 拷了一份到临时目录，多露出一个直接发协议命令的口子（仓库里的那一份没有动）；进了挑选的页面之后仍是页面里的 `click()`。检测到哪些宿主靠子进程的可执行路径上有没有 `claude`、`codex` 来布置。
4. 一共十二种情形，各起一次安装器：整条流程（`main`）、量时间再按 Ctrl+C（`timing`）、引导开着就关掉标签页（`close`）、什么都不改按回车（`enter`）、只用键盘（`keyboard`）、动画播着时点一下（`skipclick`）、按一下回车（`skipkey`）、系统开了「减少动态效果」（`reduced`）、只检测到一个宿主（`onehost`）、一个都没检测到（`nohost`）、经远程连接（`ssh`）、带 `--terminal`（`terminal`）。

## 结果

### 包

| 核对什么 | 结果 |
|----------|------|
| `npm pack --dry-run` 列出的文件 | 39 个，包大小 102.0 kB。`dist/web/` 下四个都在：`index.html`（452B）、`app.js`（38.4kB）、`app.css`（16.6kB）、`favicon.svg`（1.2kB）；没有 `web/`、`scripts/`、`test/` |
| 装到临时项目里 | `node_modules/oxy-tools/dist/web/` 下四个文件都在；`npx --no-install oxy-tools --version` 是 `0.3.0`；`--help` 里有 `--terminal` 那一行 |
| 没有交互式终端 | `npx --no-install oxy-tools </dev/null`：标准输出是空的，出错说明在标准错误，退出状态 1，假的 `open` 没有被调用 |
| 用户装下来的包和任务开始前一样 | 把任务开始前的那次提交（`6496320`）的 `package.json` 同样打成包、装到另一个临时项目里，比两边 `package-lock.json` 里的包：**都是 21 个，名字和版本逐个相同**。不同的只有 `oxy-tools` 自己声明的 `dependencies` 多一行 `@inquirer/core`（工单 11，维护者 2026-10-12 认可） |

### 整条流程（`main`）

页面上做的：等开场动画自己播完，停在开场引导上 → 用鼠标去掉 Codex、点「项目」 → **不答就刷新一次** → 点「开始挑选」 →「开发工作流与规范」下勾 `if5` 和 `oxy-sample-keyed` →「UI 设计、图像与视频」下勾 `emilkowalski-skills` → 刷新页面 → 另开一个标签页看一眼再关掉 → 去汇总 → 填 key 的对话框里打进一个假的 key、按回车 →「好了」→ 汇总上「开始安装」→ 等到结果 →「继续挑选」→ 再刷新一次 → 右栏的「完成」。

| 核对什么 | 结果 |
|----------|------|
| 交给 `open` 的 | 1 个参数，就是那条网址：`http://127.0.0.1:<端口>/?token=<口令>` |
| 终端上 | 大标志、本机信息（两个宿主都检测到）、通栏横线，然后是「网页界面　已在浏览器打开」、整条网址、按键提示；**没有语言提问**。点了「完成」后那一行换成「页面上点了「完成」，安装器退出」，退出状态 0 |
| 开场引导缺省的样子 | 那一层从出现到引导可以操作 **2745 毫秒**（照页面自己的时钟）；它出现的那一刻底下的三栏已经在了。两个宿主都勾着、范围是全局，目录那一行是空的；焦点在「开始挑选」上；是一个名字叫「开始之前」的对话框；那一层的底色是不透明的黑；底下的三栏是 `inert`；没有滚动条 |
| 去掉 Codex、选「项目」 | 引导上 Codex 的勾空了、「项目」选中，下面当场写出「只对当前目录生效：<临时目录>/project」 |
| **没答完就刷新** | 那一层一出现就是静止的样子（没有带着动画的那一段，页面上一段动画都没在跑），去掉的 Codex 和「项目」都还在；焦点随后落到「开始挑选」上 |
| 点「开始挑选」之后 | 那一层收掉；看的是「推荐」；顶上那一条里 Claude Code 勾着、Codex 没勾、「项目」选中、标题下面是同一行目录；卡片上只有一段状态、不写宿主的名字（`if5：未装`、`oxy-sample-keyed：未配置`） |
| 左栏（顺带量的） | 三行都是 36px 高；当前的用途的底色对侧栏底色：深色 `rgb(38,40,44)` 对 `rgb(13,14,15)`，1.31:1；浅色 `rgb(230,230,230)` 对 `rgb(250,250,250)`，1.20:1；字 13px、500 |
| 答完之后刷新 | **没有再出现开场引导**，也没有重播动画；所在的用途（「UI 设计、图像与视频」）、已选的三项（照勾选的先后）、Claude Code 和「项目」都在；安装器没有退出 |
| 答完之后另开一个标签页 | 同样没有开场引导，看到的是同一份：同一个用途、同样的三项、同样的宿主和范围 |
| 汇总 | 「将安装 3 项」：`if5`、`emilkowalski-skills` 下的 `animate`、`oxy-sample-keyed`，**每项只有 Claude Code 一行**，位置是 `.claude/skills/if5`、`.claude/skills/animate`（相对项目目录），MCP 没有位置。提醒三条：第三方 Skill 装的是作者当时的最新版；`OXY_SAMPLE_KEY` 会以明文写进 `.mcp.json`；Claude Code 的 MCP 写进当前目录的 `.mcp.json`、要批准之后才启用。**里面搜不到 `npx`、`claude mcp`、`skills add`、`--agent`** |
| 结果 | 合计 3 成功、0 失败、0 跳过；三行依次是 `if5`（已安装 1.0.0）、`animate`（已安装）、`oxy-sample-keyed`（已配置），都是 Claude Code |
| **装出来的东西落在引导上选的地方** | `<临时目录>/project/.claude/skills/if5/SKILL.md`（和仓库里的逐字节相同）、`<临时目录>/project/.claude/skills/animate/SKILL.md` 都在，都是真实目录；`<临时目录>/project/.mcp.json` 里有 `oxy-sample-keyed`，命令、参数和那个环境变量的值与填的逐字相同。**项目目录里没有 `.agents`（Codex 在引导上去掉了）；临时主目录里没有多出任何 skill，临时的 Codex 配置里没有这个 MCP，临时的 Claude Code 用户级配置里也搜不到它的名字**。skills CLI 另在项目目录里写了一个 `skills-lock.json`，安装器不管它 |
| **填的 key 去了哪** | 整个临时目录（连同 Chrome 的临时用户数据目录、终端的原始输出）里搜这个值，除了写着它的两份驱动脚本自己（`drive.py`、`drive-page.ts`，搜的时候按文件名排除了），只有 `project/.mcp.json` 一处——它该在的地方（装到项目时 key 以明文写进这个文件，汇总里提醒过）。**页面的网址、页面的整份 HTML、每个输入框的值**里搜不到（填完之后、装完之后各查一次）；**终端的原始输出**里 0 处 |
| 「继续挑选」之后 | 没有再出现开场引导；已选清空；卡片上的状态已经是新的（`if5：已装 1.0.0`、`oxy-sample-keyed：已配置`）；宿主和范围仍是引导上选的。再刷新一次同样没有引导 |
| 点右栏的「完成」之后 | 「✓ 已完成　安装器已退出，可以关掉这一页了。」 |
| 真实的主目录 | 跑之前和之后各取一次真实的 `~/.claude.json` 里所有 `mcpServers`、`~/.codex/config.toml` 里 `mcp_servers` 段的哈希，和 `~/.claude/skills`、`~/.agents/skills` 下每一项的名字加修改时间的哈希（只读、不打印内容）：**前后都相同**；两份配置里都搜不到 `oxy-sample-keyed`；`find ~/.claude/skills ~/.agents/skills -maxdepth 1 -mmin -40` 是空的；主目录下没有 `.mcp.json` |

截图在任务目录的 `screenshots/17-release-*.png`。

### 另外十一种情形

| 情形 | 结果 |
|------|------|
| 量时间（`timing`） | 那一层从出现到引导可以操作 **2739 毫秒**（样式里声明的是 2.7 秒；规格要的是不超过 3 秒），出现时底下的三栏已经在。**又等了 2 秒仍停在引导上**，没有自己进去 |
| 引导开着时终端上按 Ctrl+C（同一次运行） | 安装器以 130 退出；页面重连几次之后改成「– 安装器已退出　这一页已经失效…」，那一层不在了 |
| 引导开着就关掉标签页（`close`） | 标签页关掉之后 **4.8 秒**安装器以 0 退出，终端上是「页面已关闭，安装器退出」。后来为了别的缘故又连跑了六次，都是 4.8–4.9 秒、退出状态 0 |
| 什么都不改，在引导上按回车（`enter`） | 进去了：看的是「推荐」，两个宿主都勾着，范围是全局，没有目录那一行 |
| 只用键盘（`keyboard`） | 从「开始挑选」起按十下 Tab，焦点依次是：页面之外、Claude Code、Codex、全局、开始挑选、页面之外、Claude Code、Codex、全局、开始挑选——**没有一下落到底下的页面上**。空格去掉了 Claude Code，右方向键选了「项目」，回车进去：顶上那一条里是 Codex、项目和目录那一行 |
| 动画播到约 0.52 秒时用鼠标点在 Codex 的勾选上（`skipclick`） | 停在引导静止的样子上，两个宿主仍勾着、范围仍是全局，没有进去，焦点在「开始挑选」上。跳过之后在同一处再点一下是照办的（Codex 去掉了） |
| 动画播到约 0.52 秒时按回车（`skipkey`） | 同上：停在引导上，选项没变，没有进去。再按一次回车才进去（两个宿主、全局、「推荐」） |
| 系统开了「减少动态效果」（`reduced`） | 那一层一出现就是引导静止的样子，一段动画都没有；点「开始挑选」（没有改选项）那一层当场收掉，卡片没有做浮上来的动作；进去之后是两个宿主勾着、全局、「推荐」 |
| 只检测到一个宿主（`onehost`，可执行路径上没有 `codex`） | 引导上写的是「装进 Claude Code　Codex 未检测到」，没有勾选；可以操作的只有「全局」「项目」两格和「开始挑选」。选项目、点进去之后顶上那一条是同一句话、「项目」选中、带目录那一行 |
| 一个宿主都没检测到（`nohost`，可执行路径上两个都没有） | **没有开场引导**：那一层 2632 毫秒后自己收掉，直接是挑选的页面；顶上那一条没有宿主和安装范围，卡片是「需要 AI Agent」，左栏本机信息多一行「注意」 |
| 带着 `SSH_CONNECTION`（`ssh`） | 直接是终端界面的语言提问；假的 `open` 没有被调用；按 Ctrl+C 以 130 退出 |
| 带 `--terminal`（`terminal`） | 同上 |

## 看到的两件事

- **`timing` 和 `nohost` 第一次都没跑成**：驱动 Chrome 的那一层报「一直没有等到 `Page.loadEventFired`」（等了 15 秒）。`timing` 那一次页面其实已经画出来了（出错时读到的页面文字里三栏和开场引导都在）。两种各重跑一次都通过，上表里是重跑的结果；之后拿 `close` 连跑六次都没有再出现。**原因没有查明**——是核对脚本这一层的事还是页面有哪个请求偶尔迟迟不结束，分不出来；到那时为止起过浏览器的十八次运行里两次（之后又起过一次量左栏的，也没有出现）。
- **项目目录不在主目录下时，目录那一句会从词的中间折开**：这次的项目目录是 `/private/var/folders/…/project`，引导里和顶上那一条里都折成「只对当前目录生」「效：/private/var/…」。预览的样例是 `~/work/my-app`，看不到这种情形。在开场引导里它还让那一行占了三行，点「项目」的时候上面的命令、大标志跟着往上挪了 20px。画面没有动，记在 `.atw/spec/cli/web-ui-design.md` 的「看过、留给维护者定的」（截图 `17-release-2-guide-changed.png`、`17-release-3-entered-recommended.png`）。

## 没有核对的

- **真实的默认浏览器弹得出来**：这次没有重跑（要弹出用户的浏览器）。上一次（工单 14）跑过，那之后链接打开器没有动。
- **外部项目的链接**（没有勾选框、在新标签页打开）这次没有读到：脚本去读的时候页面停在一张没有外部项目的列表上。上一次读过，那之后外部项目那一区没有动。
- **真的从另一台机器经 `ssh` 连进来**、**Chrome 以外的浏览器**、**Windows 和 Linux 上的真实浏览器**：仍然没有。
- **有窗口的浏览器里用手点、用眼看连续的动画**：这里是没有窗口的 Chrome；开场引导上的鼠标、键盘是调试协议发的真事件，别处是脚本的 `click()`。**真的触屏、真的读屏软件**没有试（工单 16 拿浏览器的触屏模拟试过跳过的那一下）。
- 工具在终端里装、安装中关掉页面、按 `t` 改用终端界面：不在这次的情形里（工单 11、12 核对过；自动化测试里有）。
- 两个宿主都留着、装到全局的整条流程这次没有重走：上一次（工单 14）走的就是它，这次走的是引导上改过的那一种。

## 附：这一次的驱动脚本

不在仓库里。做法同上面的「附：驱动脚本」；`chrome-raw.ts` 是 `cli/scripts/chrome.ts` 的拷贝，`Tab` 上多一个 `raw(method, params)`，原样转给调试协议。

`drive.py`：

```python
# 发布前核对用的一次性脚本（不进仓库）：伪终端里跑装到临时项目里的 oxy-tools，
# 真实的页面由 drive-page.ts 让本机的 Chrome 去点。全程只碰这个临时目录。
# 用法：python3 -I drive.py <模式>
import os, pty, sys, time, select, re, fcntl, termios, struct, subprocess, json

R = '<临时目录>'
NODE_BIN = '<node 所在的目录>'
CLAUDE_BIN = '<claude 所在的目录>'
CODEX_GIT_BIN = '<codex 和 git 所在的目录>'
KEY = 'oxy-release-check-9Tz4-not-a-real-key'
PAGE_MODES = ('main', 'timing', 'close', 'enter', 'keyboard', 'skipclick', 'skipkey', 'reduced', 'onehost', 'nohost')
mode = sys.argv[1]
assert mode in PAGE_MODES + ('ssh', 'terminal'), mode
record = f'{R}/opened-{mode}.txt'
assert not os.path.exists(record), '这个模式跑过了：换一个临时目录'

# 检测到哪些宿主照可执行路径上有没有 claude、codex
hosts = {'onehost': [CLAUDE_BIN], 'nohost': []}.get(mode, [CLAUDE_BIN, CODEX_GIT_BIN])
# 不继承这个会话的环境（里面有 CLAUDECODE 之类）：只给下面这些
env = {
    'PATH': ':'.join([R + '/fakebin', NODE_BIN] + hosts + ['/usr/bin', '/bin']),
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
def finish(timeout=20):
    """接着读输出直到进程退出，给出退出状态"""
    end = time.time() + timeout
    while time.time() < end:
        alive = pump(0.2)
        done, status = os.waitpid(pid, os.WNOHANG)
        if done: pump(0.3); return os.waitstatus_to_exitcode(status)
        if not alive: break
    _, status = os.waitpid(pid, 0)
    return os.waitstatus_to_exitcode(status)

result = {'mode': mode, 'PATH': env['PATH'].replace(R, '<临时目录>')}
if mode in PAGE_MODES:
    end = time.time() + 40
    while not os.path.exists(record) and time.time() < end: pump(0.2)
    assert os.path.exists(record), '安装器没有去打开浏览器\n' + text()[-1500:]
    pump(0.5)
    count, url = open(record).read().split('\n')[:2]
    result['openArgs'] = int(count)
    result['url'] = re.sub(r'token=.*', 'token=<口令>', url)
    result['terminalBeforePage'] = text()
    helper = subprocess.Popen([NODE_BIN + '/node', '--experimental-strip-types', R + '/drive-page.ts', mode, url, R], env=dict(env), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    pressed = False
    while helper.poll() is None:
        if not pump(0.2): time.sleep(0.2)   # 页面在点的时候接着读终端的输出
        if not pressed and os.path.exists(f'{R}/ready-{mode}'):
            os.write(fd, b'\x03'); pressed = True   # 页面那边看完了：终端上按 Ctrl+C
    result['ctrlC'] = pressed
    result['helperOutput'] = helper.stdout.read().decode('utf-8', 'replace')[-800:]
    closed = time.time()
    result['exit'] = finish(timeout=30)
    result['secondsFromHelperEndToExit'] = round(time.time() - closed, 1)
else:
    wait_for('Language / 语言')
    os.write(fd, b'\x03'); pump(1.5)
    result['exit'] = finish()
    result['openCalled'] = os.path.exists(record)

out = text()
open(f'{R}/transcript-{mode}.txt', 'w').write(out)
open(f'{R}/transcript-{mode}.raw', 'wb').write(raw)
result['keyInTerminal'] = out.count(KEY) + raw.count(KEY.encode())
result['languageQuestionInTerminal'] = 'Language / 语言' in out
result['transcriptChars'] = len(out)
json.dump(result, open(f'{R}/run-{mode}.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in result.items() if k != 'terminalBeforePage'}, ensure_ascii=False, indent=1))
```

`drive-page.ts`：

```ts
// 发布前核对用的一次性脚本（不进仓库）：让本机的 Chrome 打开安装器的网页界面，像用户那样在真实的页面上走一遍。
// 开场引导上的点击和按键是经调试协议发的真实鼠标、键盘事件；进了挑选的页面之后用页面里的 click()。
// 用法：node --experimental-strip-types drive-page.ts <模式> <网址> <放结果的目录>
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findChrome, launchChrome } from './chrome-raw.ts';

const [mode, url, out] = process.argv.slice(2) as [string, string, string];
const KEY = 'oxy-release-check-9Tz4-not-a-real-key';
const report: Record<string, unknown> = { mode };
const executable = findChrome();
if (!executable) throw new Error('没有找到 Chrome');
const chrome = await launchChrome(executable, mkdtempSync(join(out, 'chrome-')));
report['browser'] = chrome.product;
const tab = await chrome.newTab();

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const until = (what: string, expression: string, ms = 8000, page = tab): Promise<unknown> =>
  page.evaluate(`new Promise((resolve, reject) => {
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
const ready = (): void => writeFileSync(join(out, `ready-${mode}`), '');

// 真实的鼠标：在页面的这一点按下、抬起
const mouse = async (x: number, y: number): Promise<void> => {
  await tab.raw('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await tab.raw('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await tab.raw('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const centre = (expression: string): Promise<{ x: number; y: number }> =>
  tab.evaluate(`(() => { const r = (${expression}).getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`);
const clickOn = async (expression: string): Promise<void> => {
  const { x, y } = await centre(expression);
  await mouse(x, y);
};
// 真实的键盘
const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
} as const;
const key = async (name: keyof typeof KEYS): Promise<void> => {
  await tab.raw('Input.dispatchKeyEvent', { type: 'keyDown', ...KEYS[name] });
  await tab.raw('Input.dispatchKeyEvent', { type: 'keyUp', ...KEYS[name] });
};

const card = (name: string): string => `[...document.querySelectorAll('.card')].find((c) => c.querySelector('h3')?.textContent === ${JSON.stringify(name)})`;
const purpose = (name: string): string => `[...document.querySelectorAll('.menu button')].find((b) => b.textContent.includes(${JSON.stringify(name)}))`;
const guideHost = (name: string): string => `[...document.querySelectorAll('.intro-guide .option')].find((l) => l.textContent.trim() === ${JSON.stringify(name)})`;
const guideScope = (name: string): string => `[...document.querySelectorAll('.intro-guide .segments label')].find((l) => l.textContent.trim() === ${JSON.stringify(name)})`;
const START = `document.querySelector('.intro-actions button')`;
const OPERABLE = `document.querySelector('.intro.still') && document.activeElement === ${START}`;
const leaked = async (): Promise<boolean> =>
  (await tab.evaluate<string>(`location.href + '\\n' + document.documentElement.outerHTML + '\\n' + [...document.querySelectorAll('input, textarea')].map((f) => f.value).join('\\n')`)).includes(KEY);

// 开场那一层里的样子
const GUIDE = `(() => {
  const intro = document.querySelector('.intro');
  if (!intro) return { present: false };
  const active = document.activeElement;
  return {
    present: true,
    classes: intro.className,
    opaque: getComputedStyle(intro).backgroundColor,
    guide: Boolean(intro.querySelector('.intro-guide')),
    dialog: intro.querySelector('.intro-guide')?.getAttribute('role') + ' / ' + intro.querySelector('.intro-guide')?.getAttribute('aria-label'),
    guideInert: intro.querySelector('.intro-guide')?.inert,
    hosts: [...intro.querySelectorAll('.intro-guide .option')].map((l) => l.textContent.trim() + (l.querySelector('input').checked ? ' [勾着]' : ' [没勾]')),
    onlyHost: intro.querySelector('.intro-guide p.field')?.innerText ?? null,
    scope: [...intro.querySelectorAll('.intro-guide .segments label')].map((l) => l.textContent.trim() + (l.querySelector('input').checked ? ' [选中]' : '')),
    directory: intro.querySelector('.intro-directory')?.innerText.trim() ?? null,
    button: intro.querySelector('.intro-actions')?.innerText ?? null,
    focus: active ? active.tagName + ' ' + (active.closest('label')?.textContent ?? active.textContent ?? '').trim().slice(0, 24) + (active.closest('.intro-guide') ? ' @引导里' : active.closest('.shell') ? ' @底下的页面' : ' @别处') : null,
    shellInert: document.querySelector('.shell')?.inert ?? null,
    scrolls: intro.querySelector('.intro-stage').scrollHeight > intro.querySelector('.intro-stage').clientHeight,
    animationsRunning: document.getAnimations().filter((a) => a.playState === 'running' && a.effect.target.closest('.intro')).length,
  };
})()`;
// 进了挑选的页面之后顶上那一条和左栏
const BAR = `(() => {
  const bar = document.querySelector('.bar');
  return {
    intro: Boolean(document.querySelector('.intro')),
    list: bar?.querySelector('h1')?.textContent ?? null,
    current: document.querySelector('.menu [aria-current]')?.textContent ?? null,
    hosts: [...(bar?.querySelectorAll('.target .option') ?? [])].map((l) => l.textContent.trim() + (l.querySelector('input').checked ? ' [勾着]' : ' [没勾]')),
    onlyHost: bar?.querySelector('.target p.field')?.innerText ?? null,
    scope: [...(bar?.querySelectorAll('.target .segments label') ?? [])].map((l) => l.textContent.trim() + (l.querySelector('input').checked ? ' [选中]' : '')),
    directory: bar?.querySelector('.directory')?.innerText ?? null,
    hasTarget: Boolean(bar?.querySelector('.target')),
    shellInert: document.querySelector('.shell')?.inert ?? null,
    firstCardStatus: document.querySelector('.card .statuses')?.innerText ?? null,
    selected: [...document.querySelectorAll('.picked li .name')].map((n) => n.textContent),
  };
})()`;
// 左栏：每行多高，当前的用途的底色和侧栏底色的对比度（WCAG 的算法）
const MENU = `(() => {
  const rgb = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const side = getComputedStyle(document.querySelector('.side')).backgroundColor;
  const current = document.querySelector('.menu [aria-current]');
  const bg = getComputedStyle(current).backgroundColor;
  const [hi, lo] = [lum(side), lum(bg)].sort((a, b) => b - a);
  return { rows: [...document.querySelectorAll('.menu button')].map((b) => b.textContent.trim().slice(0, 14) + ' ' + b.getBoundingClientRect().height + 'px'), side, current: bg, contrast: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100, fontSize: getComputedStyle(current).fontSize, weight: getComputedStyle(current).fontWeight };
})()`;
// 开场那一层从出现到开场引导可以操作（或到它自己收掉）多久：照页面自己的时钟量
const TIMING = `new Promise((resolve) => {
  const look = () => {
    const intro = document.querySelector('.intro');
    if (!intro) return setTimeout(look, 5);
    const animations = document.getAnimations();
    const mark = animations.find((a) => a.animationName === 'appear' && a.effect.target.matches('.intro-actions')) ?? animations.find((a) => a.animationName === 'intro-out');
    const seen = { classes: intro.className, appearedAt: mark ? Math.round(performance.now() - mark.currentTime) : null, shellUnderneath: Boolean(document.querySelector('.shell')), cardsUnderneath: document.querySelectorAll('.card').length };
    const wait = () => {
      const now = document.querySelector('.intro');
      if (!now) return resolve({ ...seen, goneAt: Math.round(performance.now()) });
      if (now.classList.contains('still') && document.activeElement === ${START}) return resolve({ ...seen, operableAt: Math.round(performance.now()) });
      setTimeout(wait, 5);
    };
    wait();
  };
  look();
})`;
// 动画播到第几毫秒了（开场各段是同时开始的）
const PLAYED = `(() => { const a = document.getAnimations().find((x) => x.effect.target.closest?.('.intro')); return document.querySelector('.intro.playing') && a ? a.currentTime : 0; })()`;
const span = (t: { appearedAt: number | null; operableAt?: number; goneAt?: number }): number | null => (t.appearedAt === null ? null : (t.operableAt ?? t.goneAt ?? 0) - t.appearedAt);

try {
  await tab.language('zh-CN');
  await tab.viewport(1280, 800);
  await tab.system('dark', mode === 'reduced');
  await tab.open(url);

  if (mode === 'main') {
    // 1. 开场动画播完，停在开场引导上：两个宿主都勾着、全局
    const timing = await tab.evaluate<{ appearedAt: number | null; operableAt?: number }>(TIMING);
    report['timing'] = { ...timing, msFromAppearToOperable: span(timing) };
    report['guideDefault'] = await tab.evaluate(GUIDE);
    await shot('17-release-1-guide-default');
    // 2. 去掉 Codex、选项目（真实的鼠标）
    await clickOn(guideHost('Codex'));
    await until('Codex 去掉了', `!(${guideHost('Codex')}).querySelector('input').checked`);
    await clickOn(guideScope('项目'));
    await until('目录那一行', `document.querySelector('.intro-directory code')`);
    report['guideChanged'] = await tab.evaluate(GUIDE);
    await shot('17-release-2-guide-changed');
    // 3. 没答完就刷新：引导还在，不重播动画，改过的还在
    await tab.open(url);
    await until('刷新后的开场引导', `document.querySelector('.intro')`);
    report['guideAfterReloadFirstSight'] = await tab.evaluate(GUIDE);
    await until('刷新后可以操作', OPERABLE);
    report['guideAfterReload'] = await tab.evaluate(GUIDE);
    // 4. 点「开始挑选」
    await clickOn(START);
    await until('那一层收掉', `!document.querySelector('.intro')`, 6000);
    report['entered'] = await tab.evaluate(BAR);
    report['machine'] = await tab.evaluate<string>(`document.querySelector('.machine').innerText`);
    report['menuDark'] = await tab.evaluate(MENU);
    await shot('17-release-3-entered-recommended');
    await tab.system('light', false);
    await sleep(300);
    report['menuLight'] = await tab.evaluate(MENU);
    await tab.system('dark', false);
    await sleep(300);

    // 5. 跨两个用途勾：「开发工作流与规范」下一个本仓库的 skill、一个带 key 的 MCP；「UI 设计、图像与视频」下一个第三方 Skill
    await tab.evaluate(`${purpose('开发工作流')}.click()`);
    await until('换到开发工作流', `document.querySelector('.bar h1').textContent.includes('开发工作流')`);
    report['cardsAfterGuide'] = await tab.evaluate(`[...document.querySelectorAll('.card')].map((c) => c.querySelector('h3').textContent + '：' + c.querySelector('.statuses').innerText)`);
    for (const name of ['if5', 'oxy-sample-keyed']) {
      await tab.evaluate(`${card(name)}.querySelector('input').click()`);
      await until(`${name} 勾上`, `${card(name)}.classList.contains('selected')`);
    }
    await tab.evaluate(`${purpose('UI 设计')}.click()`);
    await until('换到 UI 设计', `document.querySelector('.bar h1').textContent.includes('UI 设计')`);
    await tab.evaluate(`${card('emilkowalski-skills')}.querySelector('input').click()`);
    await until('第三方 Skill 勾上', `${card('emilkowalski-skills')}.classList.contains('selected')`);
    report['apps'] = await tab.evaluate(`[...document.querySelectorAll('.apps li')].map((li) => ({ name: li.querySelector('a').textContent, checkbox: Boolean(li.querySelector('input')), target: li.querySelector('a').target, rel: li.querySelector('a').rel }))`);
    await shot('17-release-4-picked');

    // 6. 答完之后刷新、再开一个标签页：都不再出现开场引导，勾选和所选的宿主、范围都在
    await tab.open(url);
    await until('刷新后三栏的画面', `document.querySelector('.shell') && document.querySelector('.bar')`);
    await sleep(600);
    report['afterReload'] = await tab.evaluate(BAR);
    const second = await chrome.newTab();
    await second.viewport(1280, 800);
    await second.system('dark', false);
    await second.open(url);
    await until('另一个标签页的三栏', `document.querySelector('.shell') && document.querySelector('.bar')`, 8000, second);
    await sleep(600);
    report['secondTab'] = await second.evaluate(BAR);
    await second.close();

    // 7. 去汇总：先到填 key
    await tab.evaluate(`document.querySelector('.tray footer .primary').click()`);
    await until('填 key 的对话框', `document.querySelector('.dialog input') && document.activeElement === document.querySelector('.dialog input')`);
    await tab.evaluate(`document.execCommand('insertText', false, ${JSON.stringify(KEY)})`);
    report['typed'] = await tab.evaluate<boolean>(`document.activeElement.value === ${JSON.stringify(KEY)}`);
    await tab.evaluate(`document.activeElement.dispatchEvent(new Event('change', { bubbles: true }))`);
    await until('这一行换成已填', `document.querySelector('.dialog .filled')`);
    report['keyLeakedAfterFill'] = await leaked();
    await shot('17-release-5-key-filled');
    await tab.evaluate(`document.querySelector('.dialog footer .primary').click()`);
    await until('汇总', `document.querySelector('.panel:not(.dialog) .entry')`);
    report['summary'] = await tab.evaluate<string>(`document.querySelector('.panel').innerText`);
    await shot('17-release-6-summary');

    // 8. 开始安装，等到结果
    await tab.evaluate(`document.querySelector('.panel footer .primary').click()`);
    await until('安装中或结果', `document.querySelector('.panel .rows li')`, 20000);
    await until('结果', `document.querySelector('.panel .totals')`, 300000);
    report['results'] = await tab.evaluate<string>(`document.querySelector('.panel').innerText`);
    report['keyLeakedAfterInstall'] = await leaked();
    report['address'] = (await tab.evaluate<string>('location.href')).replace(/token=[^&]+/, 'token=<口令>');
    await shot('17-release-7-results');

    // 9. 「继续挑选」：不再出现开场引导，已选清空，状态是新的；再刷新一次也不出现
    await tab.evaluate(`[...document.querySelectorAll('.panel footer button')].find((b) => !b.classList.contains('primary')).click()`);
    await until('面板收掉', `!document.querySelector('.panel')`);
    await sleep(600);
    report['afterContinue'] = await tab.evaluate(BAR);
    await tab.evaluate(`${purpose('开发工作流')}.click()`);
    await until('换到开发工作流', `document.querySelector('.bar h1').textContent.includes('开发工作流')`);
    report['cardsAfterInstall'] = await tab.evaluate(`[...document.querySelectorAll('.card')].map((c) => c.querySelector('h3').textContent + '：' + c.querySelector('.statuses').innerText)`);
    await shot('17-release-8-after-continue');
    await tab.open(url);
    await until('再刷新后三栏的画面', `document.querySelector('.shell') && document.querySelector('.bar')`);
    await sleep(600);
    report['afterContinueReload'] = await tab.evaluate(BAR);

    // 10. 右栏的「完成」
    await tab.evaluate(`[...document.querySelectorAll('.tray footer button')].find((b) => !b.classList.contains('primary')).click()`);
    await until('已完成', `document.querySelector('.ended')`);
    report['ended'] = await tab.evaluate<string>(`document.querySelector('.ended').innerText`);
    await shot('17-release-9-finished');
  } else if (mode === 'timing') {
    // 那一层从出现到可以操作多久；不点就一直停着；然后终端上按 Ctrl+C，看页面改口
    const timing = await tab.evaluate<{ appearedAt: number | null; operableAt?: number }>(TIMING);
    report['timing'] = { ...timing, msFromAppearToOperable: span(timing) };
    await sleep(2000);
    report['stillThereAfter2s'] = await tab.evaluate(GUIDE);
    ready();
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
    report['ended'] = await tab.evaluate<string>(`document.querySelector('.ended').innerText`);
    report['introAfterExit'] = await tab.evaluate<boolean>(`Boolean(document.querySelector('.intro'))`);
    await shot('17-release-exited-from-guide');
  } else if (mode === 'close') {
    // 开场引导还开着就关掉标签页
    await until('开场引导可以操作', OPERABLE);
    report['guide'] = await tab.evaluate(GUIDE);
    await tab.close();
    report['closedAt'] = Date.now();
  } else if (mode === 'enter') {
    // 什么都不改，在引导上按回车：进去之后是全部宿主、全局、「推荐」
    await until('开场引导可以操作', OPERABLE);
    report['guide'] = await tab.evaluate(GUIDE);
    await key('Enter');
    await until('那一层收掉', `!document.querySelector('.intro')`, 6000);
    report['entered'] = await tab.evaluate(BAR);
    await shot('17-release-entered-default');
    ready();
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
  } else if (mode === 'keyboard') {
    // 只用键盘：Tab 在引导里走，走不到底下；空格去掉 Claude Code，右方向键选项目，回车进去
    await until('开场引导可以操作', OPERABLE);
    const FOCUS = `(() => { const a = document.activeElement; return a && a !== document.body ? a.tagName + ' ' + (a.closest('label')?.textContent ?? a.textContent ?? '').trim().slice(0, 24) + (a.closest('.intro-guide') ? ' @引导里' : a.closest('.shell') ? ' @底下的页面' : ' @别处') : '（页面之外）'; })()`;
    const walk: string[] = [await tab.evaluate<string>(FOCUS)];
    for (let i = 0; i < 10; i++) {
      await key('Tab');
      await sleep(80);
      walk.push(await tab.evaluate<string>(FOCUS));
    }
    report['tabWalk'] = walk;
    // 走到 Claude Code 的勾选上按空格
    for (let i = 0; i < 8 && !(await tab.evaluate<boolean>(`document.activeElement === (${guideHost('Claude Code')}).querySelector('input')`)); i++) await key('Tab');
    await key('Space');
    await until('Claude Code 去掉了', `!(${guideHost('Claude Code')}).querySelector('input').checked`);
    // 走到安装范围上按右方向键
    for (let i = 0; i < 8 && !(await tab.evaluate<boolean>(`Boolean(document.activeElement?.closest('.intro-guide .segments'))`)); i++) await key('Tab');
    await key('ArrowRight');
    await until('选了项目', `document.querySelector('.intro-directory code')`);
    report['guideByKeyboard'] = await tab.evaluate(GUIDE);
    await shot('17-release-guide-keyboard-focus');
    for (let i = 0; i < 8 && !(await tab.evaluate<boolean>(`document.activeElement === ${START}`)); i++) await key('Tab');
    await key('Enter');
    await until('那一层收掉', `!document.querySelector('.intro')`, 6000);
    report['entered'] = await tab.evaluate(BAR);
    ready();
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
  } else if (mode === 'skipclick' || mode === 'skipkey') {
    // 动画播着时点一下（点在 Codex 的勾选上）或按回车：停在引导上，选项没变，没有进去
    await until('开场那一层', `document.querySelector('.intro')`);
    await until('动画播到半秒', `(${PLAYED}) >= 500`, 2000);
    report['playedMsWhenSkipped'] = await tab.evaluate<number>(PLAYED);
    report['guideBeforeSkip'] = await tab.evaluate(GUIDE);
    if (mode === 'skipclick') await clickOn(guideHost('Codex'));
    else await key('Enter');
    await sleep(900);
    report['guideAfterSkip'] = await tab.evaluate(GUIDE);
    await shot(`17-release-guide-after-${mode}`);
    // 跳过之后在同一处再来一下是照办的
    if (mode === 'skipclick') {
      await clickOn(guideHost('Codex'));
      await until('Codex 去掉了', `!(${guideHost('Codex')}).querySelector('input').checked`);
      report['secondClickTookEffect'] = true;
    } else {
      await key('Enter');
      await until('那一层收掉', `!document.querySelector('.intro')`, 6000);
      report['secondEnterEntered'] = await tab.evaluate(BAR);
    }
    ready();
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
  } else if (mode === 'reduced') {
    // 系统开了「减少动态效果」：不播动画，开场引导照样出现；答完那一层当场收掉
    await until('开场那一层', `document.querySelector('.intro')`);
    report['guideFirstSight'] = await tab.evaluate(GUIDE);
    await until('开场引导可以操作', OPERABLE);
    await shot('17-release-guide-reduced-motion');
    await clickOn(START);
    await until('那一层收掉', `!document.querySelector('.intro')`, 3000);
    report['entered'] = await tab.evaluate(BAR);
    report['risingAfter'] = await tab.evaluate<boolean>(`Boolean(document.querySelector('.list.rising'))`);
    ready();
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
  } else if (mode === 'onehost') {
    // 只检测到一个宿主：写明装进它，只有安装范围可选
    await until('开场引导可以操作', OPERABLE);
    report['guide'] = await tab.evaluate(GUIDE);
    report['guideControls'] = await tab.evaluate(`[...document.querySelectorAll('.intro-guide input, .intro-guide button')].map((c) => c.tagName + ' ' + (c.type ?? '') + ' ' + (c.closest('label')?.textContent ?? c.textContent).trim())`);
    await shot('17-release-guide-one-host');
    await clickOn(guideScope('项目'));
    await until('目录那一行', `document.querySelector('.intro-directory code')`);
    await clickOn(START);
    await until('那一层收掉', `!document.querySelector('.intro')`, 6000);
    report['entered'] = await tab.evaluate(BAR);
    ready();
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
  } else if (mode === 'nohost') {
    // 一个宿主都没检测到：没有开场引导，动画播完直接是挑选的页面
    const timing = await tab.evaluate<{ appearedAt: number | null; goneAt?: number; classes: string }>(TIMING);
    report['timing'] = { ...timing, msFromAppearToGone: span(timing) };
    await sleep(300);
    report['entered'] = await tab.evaluate(BAR);
    report['machine'] = await tab.evaluate<string>(`document.querySelector('.machine').innerText`);
    await shot('17-release-no-host-entered');
    ready();
    await until('安装器已退出的画面', `document.querySelector('.ended')`, 20000);
  }
} catch (error) {
  report['error'] = error instanceof Error ? error.message : String(error);
  await shot(`17-release-error-${mode}`).catch(() => undefined);
  report['pageAtError'] = await tab.evaluate<string>('document.body.innerText').catch(() => '');
  ready();
} finally {
  writeFileSync(join(out, `page-report-${mode}.json`), JSON.stringify(report, null, 1));
  await chrome.close();
}
```
