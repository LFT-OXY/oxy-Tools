// 列表里有什么、怎么排：「推荐」和各个用途下的条目。两套界面共用，不提问、不往终端上打东西。
import type { App, Catalog, Mcp, Purpose, Skill, ThirdPartySkill, Tool } from './catalog.ts';

/** 一张混合列表里的条目：组件在上（skill、第三方 Skill、MCP、工具），外部项目在下 */
export interface Listing {
  skills: Skill[];
  thirdParty: ThirdPartySkill[];
  mcps: Mcp[];
  tools: Tool[];
  apps: App[];
  /** 把带推荐的行标出来；「推荐」那张列表里每一行都是，不标 */
  marksRecommended: boolean;
}

/** 按名字排 */
export const byName = <Entry extends { name: string }>(entries: readonly Entry[]): Entry[] =>
  [...entries].sort((a, b) => (a.name < b.name ? -1 : 1));
// 组件的一段里带推荐的在前，其余按名字
const recommendedFirst = <Entry extends { name: string; recommended: boolean }>(entries: readonly Entry[]): Entry[] => [
  ...byName(entries.filter((entry) => entry.recommended)),
  ...byName(entries.filter((entry) => !entry.recommended)),
];

export const sizeOf = (listing: Listing): number =>
  listing.skills.length + listing.thirdParty.length + listing.mcps.length + listing.tools.length + listing.apps.length;

/** 「推荐」：本仓库的全部 skill（不看任何标注），加上带推荐标记的其它条目 */
export function recommendedListing(catalog: Catalog): Listing {
  const marked = ({ recommended }: { recommended: boolean }): boolean => recommended;
  return {
    skills: byName(catalog.skills),
    thirdParty: byName(catalog.thirdPartySkills.filter(marked)),
    mcps: byName(catalog.mcps.filter(marked)),
    tools: byName(catalog.tools.filter(marked)),
    apps: byName(catalog.apps.filter(marked)),
    marksRecommended: false,
  };
}

export function purposeListing(catalog: Catalog, purpose: Purpose): Listing {
  const here = ({ purpose: id }: { purpose?: string }): boolean => id === purpose.id;
  return {
    skills: byName(catalog.skills.filter(here)),
    thirdParty: recommendedFirst(catalog.thirdPartySkills.filter(here)),
    mcps: recommendedFirst(catalog.mcps.filter(here)),
    tools: recommendedFirst(catalog.tools.filter(here)),
    apps: byName(catalog.apps.filter(here)),
    marksRecommended: true,
  };
}

/** 各个用途连同条目数，照目录里的先后；进去之后一行都没有的用途不出现 */
export function purposeCounts(catalog: Catalog): { purpose: Purpose; count: number }[] {
  return catalog.purposes
    .map((purpose) => ({ purpose, count: sizeOf(purposeListing(catalog, purpose)) }))
    .filter(({ count }) => count > 0);
}
