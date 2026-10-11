// 把目录和本机的现状写成画面状态里的那几块：左栏的行、正在看的那张列表。
// 列表里有什么、怎么排、每条的状态与可不可选，都经两套界面共用的那几块；说法是和终端界面同一份文案。
import { listingStatus, type Machine, type Unavailable } from './availability.ts';
import type { Catalog, SourcedSkill, ThirdPartySkill } from './catalog.ts';
import type { Host, Scope } from './hosts.ts';
import { purposeCounts, purposeListing, recommendedListing, sizeOf, type Listing } from './listing.ts';
import { MESSAGES, type Lang } from './messages.ts';
import { mcpStatusText, skillStatusText, thirdPartyStatusText, toolStatusText, unavailableReason, type StatusText } from './status-text.ts';
import type { ThirdPartyStatus } from './third-party-status.ts';
import type { ComponentView, ListingView, MenuRow, SectionView, SkillChoicesView, StatusView } from './web-protocol.ts';

const RECOMMENDED = 'recommended';
/** 版本不同时两个版本号之间的箭头 */
export const ARROW = '→';
// 用途的 id 前面加一段，免得哪个用途恰好叫 recommended
const purposeRow = (id: string): string => `purpose:${id}`;

/** 左栏的行：「推荐」（里面有条目时）在最前，然后是有条目的各个用途。数量的数法和终端界面的主菜单一样 */
export function menuOf(catalog: Catalog, lang: Lang): MenuRow[] {
  const recommended = sizeOf(recommendedListing(catalog));
  return [
    ...(recommended > 0 ? [{ id: RECOMMENDED, name: MESSAGES[lang].recommended, count: recommended, recommended: true as const }] : []),
    ...purposeCounts(catalog).map(({ purpose, count }) => ({ id: purposeRow(purpose.id), name: purpose.name[lang], count })),
  ];
}

// id 是 menu 里某一行的；不认得就没有
function listingOf(catalog: Catalog, id: string): Listing | undefined {
  if (id === RECOMMENDED) return recommendedListing(catalog);
  const purpose = catalog.purposes.find((candidate) => purposeRow(candidate.id) === id);
  return purpose && purposeListing(catalog, purpose);
}

/**
 * menu 里 id 这一行的那张列表，条目的状态现探测；id 不在 menu 里时没有。
 * hosts 是要装进的宿主，scope 是安装范围，picked 是勾上了的条目（目录里的那几个对象），
 * chosen 是含多个 skill 的第三方 Skill 里挑了的那几个
 */
export function listingView(
  machine: Machine,
  catalog: Catalog,
  id: string,
  hosts: readonly Host[],
  scope: Scope,
  lang: Lang,
  picked: ReadonlySet<object>,
  chosen: ReadonlyMap<ThirdPartySkill, ReadonlySet<SourcedSkill>>,
): ListingView | undefined {
  const listing = listingOf(catalog, id);
  if (!listing || sizeOf(listing) === 0) return undefined;
  const t = MESSAGES[lang];
  const status = listingStatus(machine, listing, hosts, scope);
  // 「推荐」那张列表里每一条都是推荐的，不逐条标
  const marked = (recommended: boolean): { mark?: string } => (listing.marksRecommended && recommended ? { mark: t.recommendedMark } : {});
  const component = (
    entry: { name: string; description: Record<Lang, string> },
    recommended: boolean,
    statuses: StatusView[],
    unavailable: Unavailable | undefined,
  ): ComponentView => ({
    name: entry.name,
    about: entry.description[lang],
    ...marked(recommended),
    statuses,
    ...(unavailable ? { unavailable: unavailableReason(t, unavailable) } : {}),
    ...(picked.has(entry) ? { picked: true as const } : {}),
  });
  // 每个宿主一段，与 hosts 一一对应
  const perHost = (texts: StatusText[]): StatusView[] => texts.map((text, column) => ({ host: hosts[column]?.name ?? '', ...text }));
  // 含多个 skill 的第三方 Skill 里的各个 skill：各写各的状态（条目不支持那个宿主时是不支持），挑了的标出来
  const skillChoices = (entry: ThirdPartySkill, statuses: ThirdPartyStatus[]): { skills?: SkillChoicesView } =>
    entry.skills.length > 1
      ? {
          skills: {
            lead: t.pickSourcedSkills(entry.name, entry.skills.length),
            entries: entry.skills.map((skill, index) => ({
              name: skill.name,
              about: skill.description[lang],
              statuses: perHost(statuses.map((status) => thirdPartyStatusText(t, status === 'unsupported' ? status : [status[index] === true]))),
              ...(chosen.get(entry)?.has(skill) ? { chosen: true as const } : {}),
            })),
          },
        }
      : {};
  const sections: SectionView[] = [
    {
      kind: 'skill' as const,
      ...t.sections.skill,
      // 本仓库的 skill 都是推荐的
      entries: status.skills.map(({ skill, statuses, unavailable }) =>
        component(skill, true, perHost(statuses.map((one) => skillStatusText(t, one, skill.version, ARROW))), unavailable),
      ),
    },
    {
      kind: 'thirdParty' as const,
      ...t.sections.thirdParty,
      entries: status.thirdParty.map(({ entry, statuses, unavailable }) => ({
        ...component(entry, entry.recommended, perHost(statuses.map((one) => thirdPartyStatusText(t, one))), unavailable),
        ...skillChoices(entry, statuses),
      })),
    },
    {
      kind: 'mcp' as const,
      ...t.sections.mcp,
      entries: status.mcps.map(({ mcp, statuses, unavailable }) => component(mcp, mcp.recommended, perHost(statuses.map((one) => mcpStatusText(t, one))), unavailable)),
    },
    {
      kind: 'tool' as const,
      ...t.sections.tool,
      // 工具只有一个状态，与宿主无关
      entries: status.tools.map(({ tool, status: one, unavailable }) => component(tool, tool.recommended, [toolStatusText(t, one)], unavailable)),
    },
  ].filter((section) => section.entries.length > 0);
  const apps = listing.apps.map((app) => ({ name: app.name, about: app.description[lang], url: app.url, ...marked(app.recommended) }));
  return { id, sections, ...(apps.length > 0 ? { apps: { ...t.sections.app, entries: apps } } : {}) };
}
