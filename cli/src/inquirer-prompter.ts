// 提问器的正式实现：交互库 @inquirer 的各个提示。样式全部来自呈现层给的主题。
import select, { Separator } from '@inquirer/select';
import { PromptAborted, type Prompter } from './prompter.ts';

export interface PromptStreams {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
}

/**
 * streams 缺省用进程的标准输入输出。交互库在每个提示结束时会关掉输出流，
 * 所以用假流驱动时（界面预览页）要为每个提示给一对新的。
 */
export function inquirerPrompter(streams?: () => PromptStreams): Prompter {
  return {
    async select(question) {
      try {
        return await select(
          {
            message: question.message,
            choices: question.rows.map((row) => ('separator' in row ? new Separator(row.separator) : row)),
            ...(question.default === undefined ? {} : { default: question.default }),
            pageSize: question.pageSize,
            loop: false,
            theme: question.theme,
          },
          streams?.(),
        );
      } catch (error) {
        // 用户按了 Ctrl+C
        if (error instanceof Error && error.name === 'ExitPromptError') throw new PromptAborted();
        throw error;
      }
    },
  };
}
