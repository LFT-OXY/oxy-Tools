// 交互流程：主菜单与各分组的画面怎么走。只决定“显示什么、问什么”，样式交给呈现层。
import type { Catalog, Skill } from './catalog.ts';
import type { Prompter } from './prompter.ts';
import type { Ui } from './ui.ts';

export async function mainMenu(catalog: Catalog, ui: Ui, prompter: Prompter): Promise<void> {
  // 只列出有条目的分组
  const groups = [{ id: 'skill' as const, count: catalog.skills.length }].filter((group) => group.count > 0);
  for (;;) {
    const choice = await prompter.select(ui.mainMenu(groups));
    if (choice === 'exit') return;
    await browseSkills(catalog.skills, ui, prompter);
    ui.backToMenu();
  }
}

async function browseSkills(skills: readonly Skill[], ui: Ui, prompter: Prompter): Promise<void> {
  let cursor: Skill | undefined;
  for (;;) {
    const skill = await prompter.select(ui.skillList(skills, cursor));
    if (skill === null) return;
    ui.skillDetail(skill);
    cursor = skill;
  }
}
