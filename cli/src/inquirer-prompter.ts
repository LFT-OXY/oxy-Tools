// 提问器的正式实现：交互库 @inquirer 的各个提示。样式全部来自呈现层给的主题。
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import { createPrompt, useKeypress, useRef } from '@inquirer/core';
import password from '@inquirer/password';
import select, { Separator } from '@inquirer/select';
import { PromptAborted, type Prompter, type SelectSeparator } from './prompter.ts';

const HIDE_CURSOR = '\x1b[?25l';
// 没有提问在听的时候敲的键（一批安装进行中敲的 t）留在终端那头，下一个提问一画出来就送到——实测晚不到 1 毫秒。
// 待命刚画出来的这一小会儿收到的键因此不算数：人看到提示再按，快不过它
const STALE_KEYS_MS = 100;
// 待命的提示：只画调用方给的那一行，等 keys 里的一个键。交互库自带的样式一样都没用
const standby = createPrompt<string, { hint: string; keys: readonly string[] }>(({ hint, keys }, done) => {
  const drawnAt = useRef(Date.now());
  useKeypress((key, rl) => {
    // 别的键不理，也不让它留在输入行里
    rl.clearLine(0);
    if (Date.now() - drawnAt.current < STALE_KEYS_MS) return;
    if (!key.ctrl && keys.includes(key.name)) done(key.name);
  });
  return `${hint}${HIDE_CURSOR}`;
});

export interface PromptStreams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

/**
 * streams 缺省用进程的标准输入输出。交互库在每个提示结束时会关掉输出流，
 * 所以用假流驱动时（界面预览页）要为每个提示给一对新的。
 */
export function inquirerPrompter(streams?: () => PromptStreams): Prompter {
  const choices = <Row extends object>(rows: readonly (Row | SelectSeparator)[]): (Row | Separator)[] =>
    rows.map((row) => ('separator' in row ? new Separator(row.separator) : row));
  const asking = async <Answer>(prompt: Promise<Answer>): Promise<Answer> => {
    try {
      return await prompt;
    } catch (error) {
      // 用户按了 Ctrl+C
      if (error instanceof Error && error.name === 'ExitPromptError') throw new PromptAborted();
      throw error;
    }
  };
  return {
    select: (question) =>
      asking(
        select(
          {
            message: question.message,
            choices: choices(question.rows),
            ...(question.default === undefined ? {} : { default: question.default }),
            pageSize: question.pageSize,
            loop: false,
            theme: question.theme,
          },
          streams?.(),
        ),
      ),
    checkbox: (question) =>
      asking(
        checkbox(
          {
            message: question.message,
            choices: choices(question.rows),
            pageSize: question.pageSize,
            loop: false,
            theme: question.theme,
          },
          streams?.(),
        ),
      ),
    confirm: (question) =>
      asking(
        confirm(
          {
            message: question.message,
            default: question.default,
            transformer: (answer) => (answer ? question.answers.yes : question.answers.no),
            theme: question.theme,
          },
          streams?.(),
        ),
      ),
    password: (question) =>
      asking(
        password(
          // 不显示任何字符，也不留“按 Ctrl+T 显示”的后门
          { message: question.message, mask: false, toggleMask: false, theme: question.theme },
          // 回答之后擦掉这个提问：收成的那一行由呈现层写
          { ...streams?.(), clearPromptOnDone: true },
        ),
      ),
    standby: async (question, withdraw) => {
      try {
        const key = await asking(
          standby(
            { hint: question.theme.style.keysHelpTip(question.hint), keys: Object.keys(question.answers) },
            // 无论怎么结束都擦掉这一行；被收回时交互库以 AbortPromptError 拒绝
            { ...streams?.(), clearPromptOnDone: true, signal: withdraw },
          ),
        );
        return question.answers[key];
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortPromptError') return undefined;
        throw error;
      }
    },
  };
}
