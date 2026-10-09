// 提问器的正式实现：交互库 @inquirer 的各个提示。样式全部来自呈现层给的主题。
import checkbox from '@inquirer/checkbox';
import confirm from '@inquirer/confirm';
import select, { Separator } from '@inquirer/select';
import { PromptAborted, type Prompter, type SelectSeparator } from './prompter.ts';

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
  };
}
