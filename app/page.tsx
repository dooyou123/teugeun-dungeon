"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type ReactNode,
} from "react";
import {
  Briefcase,
  Coffee,
  Coins,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Skull,
  Star,
  Swords,
  Brain,
  Eye,
  Ghost,
  Crown,
  AlertTriangle,
  ArrowUpDown,
  Trash2,
  Sparkles,
  Fingerprint,
  Clock,
  MessageSquare,
  Building2,
} from "lucide-react";

/* =========================================================
 * 퇴근 찍었는데 던전 1층입니다만? (악덕기업 100층 지옥 탈출기)
 * 하드코어 방치형 텍스트 시뮬레이션 RPG — 단일 컴포넌트
 * ========================================================= */

type Difficulty = "normal" | "hard" | "hell" | "hq";
type Grade = 1 | 2 | 3 | 4 | 5 | 6;
type Slot = "weapon" | "armor" | "accessory";
type PrefixTier = "common" | "uncommon" | "rare" | "legendary";
type Tab = "combat" | "spec" | "bag" | "loop";
type Evo = "A" | "B";
type LogKind = "normal" | "crit" | "skill" | "drop" | "system" | "warn";
type AffixKey =
  | "atkPct"
  | "hpPct"
  | "spdPct"
  | "critPct"
  | "critDmgPct"
  | "cafSavePct"
  | "goldPct";
type StatKey = "str" | "agi" | "int" | "luk";
type PerkKey = "mental" | "poker" | "espresso" | "gold" | "union";

interface Affix {
  key: AffixKey;
  value: number;
}

interface Item {
  id: string;
  slot: Slot;
  name: string;
  grade: Grade;
  stars: number;
  baseAtk: number;
  baseDef: number;
  baseHp: number;
  affixes: Affix[];
  failStack: number;
  downStreak: number;
  chanceTime: boolean;
  dropFloor: number;
}

interface Prefix {
  tier: PrefixTier;
  name: string;
  mult: number;
}

interface Enemy {
  name: string;
  displayName: string;
  isBoss: boolean;
  isElite: boolean;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  prefix: Prefix | null;
  rageTurns: number;
  maxRageTurns: number;
  stunned: number;
  defShredTurns: number;
  defShred: number;
  dotTurns: number;
  dotDmg: number;
  taunt: string | null;
  enraged: boolean;
}

interface LogLine {
  id: number;
  kind: LogKind;
  text: string;
}

interface GameState {
  started: boolean;
  paused: boolean;
  dead: boolean;
  difficulty: Difficulty;
  unlocked: Record<Difficulty, boolean>;
  highest: Record<Difficulty, number>;
  loopCount: Record<Difficulty, number>;
  trauma: number;
  gold: number;
  lastSavedAt: number;
  floor: number;
  climbMode: boolean;
  level: number;
  exp: number;
  unspent: number;
  stats: Record<StatKey, number>;
  mental: number;
  caffeine: number;
  inventory: Item[];
  equipped: Record<Slot, string | null>;
  evo: { nod: Evo; shotgun: Evo; read: Evo; resign: Evo };
  cd: { nod: number; shotgun: number; resign: number };
  perks: Record<PerkKey, number>;
  enemy: Enemy | null;
  log: LogLine[];
  logSeq: number;
  statuses: { burnout: number; silence: number; sleep: number };
  playerStun: number;
  reflectTurns: number;
  rageDelay: number;
  bossKillsRun: number;
  killCountRun: number;
  runHighest: number;
  cutscene: 0 | 1 | 2 | 3;
  lastStarMsg: string | null;
  trueEnding: boolean;
  offlineReward: { hours: number; kills: number; gold: number; exp: number } | null;
  booted: boolean;
}

type Action =
  | { type: "HYDRATE"; payload: Partial<GameState> }
  | { type: "START" }
  | { type: "TICK" }
  | { type: "TOGGLE_PAUSE" }
  | { type: "TOGGLE_CLIMB" }
  | { type: "ALLOC"; stat: StatKey }
  | { type: "SET_EVO"; skill: keyof GameState["evo"]; branch: Evo }
  | { type: "EQUIP"; id: string }
  | { type: "UNEQUIP"; slot: Slot }
  | { type: "SELL"; id: string }
  | { type: "BULK_SELL"; grade: Grade }
  | { type: "STARFORCE"; id: string }
  | { type: "BUY_PERK"; key: PerkKey }
  | { type: "REBIRTH" }
  | { type: "SET_DIFFICULTY"; difficulty: Difficulty }
  | { type: "CAST"; skill: "nod" | "shotgun" | "resign" }
  | { type: "CUTSCENE_NEXT" }
  | { type: "CLEAR_STAR_MSG" }
  | { type: "DISMISS_ENDING" }
  | { type: "APPLY_OFFLINE"; gold: number; exp: number; kills: number; hours: number }
  | { type: "DISMISS_OFFLINE" }
  | { type: "WIPE" };

const SAVE_KEY = "kimdaeri-overtime-tower-v1";
const INV_CAP = 48;
const LOG_CAP = 14;
const HINT_KEY = "kimdaeri-ux-hint-v1";
const BASE_TURN = 1350;

const DIFF_MULT: Record<Difficulty, number> = {
  normal: 1.0,
  hard: 3.5,
  hell: 12.0,
  hq: 40.0,
};

const DIFF_LABEL: Record<Difficulty, string> = {
  normal: "일반",
  hard: "하드",
  hell: "헬",
  hq: "본사 마탑",
};

const DIFF_STYLE: Record<Difficulty, string> = {
  normal: "bg-[#2a2722] text-[#f4efe6] border-[#5a5348]",
  hard: "bg-[#3a2e12] text-[#e4b84a] border-[#a07c22]",
  hell: "bg-[#3a1512] text-[#f0a090] border-[#e25b4a]",
  hq: "bg-[#241838] text-[#cbb4ff] border-[#7c5cbf]",
};

const GRADE_META: Record<
  Grade,
  { name: string; color: string; mult: number; affix: number; maxStar: number }
> = {
  1: { name: "일반", color: "text-zinc-400", mult: 1.0, affix: 0, maxStar: 10 },
  2: { name: "고급", color: "text-emerald-400", mult: 1.3, affix: 1, maxStar: 15 },
  3: { name: "희귀", color: "text-sky-400", mult: 1.8, affix: 2, maxStar: 20 },
  4: { name: "영웅", color: "text-purple-400", mult: 2.5, affix: 3, maxStar: 25 },
  5: { name: "전설", color: "text-amber-400", mult: 4.0, affix: 4, maxStar: 25 },
  6: { name: "신화", color: "text-rose-500", mult: 7.0, affix: 5, maxStar: 25 },
};

const AFFIX_META: Record<AffixKey, { name: string; min: number; max: number }> = {
  atkPct: { name: "공격력", min: 4, max: 14 },
  hpPct: { name: "멘탈", min: 4, max: 14 },
  spdPct: { name: "턴속도", min: 2, max: 10 },
  critPct: { name: "치명타율", min: 2, max: 8 },
  critDmgPct: { name: "치명타피해", min: 8, max: 28 },
  cafSavePct: { name: "카페인절감", min: 4, max: 16 },
  goldPct: { name: "골드배율", min: 5, max: 20 },
};

const WEAPON_NAMES = [
  "사원증 목걸이",
  "무선 버티컬 마우스",
  "알루미늄 청축 키보드",
  "골든 법인카드",
  "결재 권한 마스터키",
];
const ARMOR_NAMES = [
  "구겨진 슬랙스",
  "유니클로 패딩조끼",
  "인체공학 허리쿠션",
  "풀페이스 노이즈 방호복",
];
const ACC_NAMES = [
  "노이즈캔슬링 이어폰",
  "텀블러 보온병",
  "홍삼 농축 스틱",
  "VVIP 종합비타민팩",
];

interface Theme {
  from: number;
  to: number;
  name: string;
  boss: string;
  mobs: string[];
  bossSkill: string;
}

const THEMES: Theme[] = [
  {
    from: 1,
    to: 10,
    name: "무한 아침회의 지옥",
    boss: "잔소리 폭격기 팀장",
    mobs: ["딴생각 좀비", "PPT 유령", "졸음 참는 인턴"],
    bossSkill: "긴급 아침회의",
  },
  {
    from: 11,
    to: 20,
    name: "칼퇴 5분 전 카톡 지옥",
    boss: "칼퇴킬러 과장",
    mobs: ["긴급요청 메신저", "빨간 뱃지 악령", "알림음 망령"],
    bossSkill: "지금 확인 가능한가요",
  },
  {
    from: 21,
    to: 30,
    name: "기획안 무한반려 지옥",
    boss: "다시해와 차장",
    mobs: ["최종_진짜최종.hwp 유령", "빨간펜 가고일", "피드백 무한루프"],
    bossSkill: "방향이 아닌 것 같아요",
  },
  {
    from: 31,
    to: 40,
    name: "법카 영수증 감사 지옥",
    boss: "법카감사 부장",
    mobs: ["누락된 간이영수증", "야식비 환수 악귀", "증빙 미첨부 스펙터"],
    bossSkill: "이 금액 소명하세요",
  },
  {
    from: 41,
    to: 50,
    name: "주말특근 지옥",
    boss: "특근전도사 실장",
    mobs: ["토요출근 골렘", "일요일 단톡방 망령", "대체휴일 말소 악령"],
    bossSkill: "주말에 잠깐만",
  },
  {
    from: 51,
    to: 60,
    name: "회식 원샷강요 지옥",
    boss: "원샷강요 상무",
    mobs: ["소맥제조기", "2차강요 원귀", "꼰대 건배사"],
    bossSkill: "신입은 원샷이지",
  },
  {
    from: 61,
    to: 70,
    name: "인사평가·살생부 지옥",
    boss: "살생부를 든 전무",
    mobs: ["D등급 낙인수", "권고사직서 망령", "상대평가 도살칼"],
    bossSkill: "올해 강제배분이야",
  },
  {
    from: 71,
    to: 80,
    name: "사내정치·뒷담화 지옥",
    boss: "폭언전문 부사장",
    mobs: ["탕비실 루머 악령", "줄타기 꼭두각시", "익명게시판 칼날"],
    bossSkill: "네가 사내정치를 알아",
  },
  {
    from: 81,
    to: 90,
    name: "오너리스크·이사회 지옥",
    boss: "작은 악마 창업주 아들",
    mobs: ["무스펙 낙하산", "갑질 골렘", "황제 전용차량"],
    bossSkill: "아빠한테 이를 거야",
  },
  {
    from: 91,
    to: 100,
    name: "회장실 지옥",
    boss: "악덕창업주 회장",
    mobs: ["무급봉사 찬양자", "흑막 주주들", "야근 미화 홍보팀"],
    bossSkill: "회사가 곧 가족이다",
  },
  {
    from: 101,
    to: 110,
    name: "시차지옥 글로벌 콜",
    boss: "뉴욕발 새벽전화 본부장",
    mobs: ["통역 누락 유령", "시차적응 실패자", "24시 슬랙 악령"],
    bossSkill: "지금 바로 브릿지 콜",
  },
  {
    from: 111,
    to: 120,
    name: "KPI 도살장",
    boss: "숫자만 보는 CFO",
    mobs: ["엑셀 무한행", "대시보드 악령", "전년비 120% 골렘"],
    bossSkill: "숫자는 거짓말을 안 해",
  },
  {
    from: 121,
    to: 130,
    name: "구조조정 칼바람",
    boss: "권고사직 컨설턴트",
    mobs: ["빈 자리 책상", "짐 싸는 골렘", "면담실 형광등"],
    bossSkill: "윈윈이 될 제안입니다",
  },
  {
    from: 131,
    to: 140,
    name: "무한 오프사이트",
    boss: "팀빌딩 광신도",
    mobs: ["레크리에이션 좀비", "자기소개 무한루프", "아이스브레이킹 망치"],
    bossSkill: "서로를 더 알아보자",
  },
  {
    from: 141,
    to: 150,
    name: "인수합병 혼돈",
    boss: "시너지 사기꾼",
    mobs: ["중복 업무 악귀", "문화충돌 스펙터", "통합 TF 유령"],
    bossSkill: "시너지가 보이지 않나",
  },
  {
    from: 151,
    to: 160,
    name: "컴플라이언스 미로",
    boss: "내부감사 칼잡이",
    mobs: ["증빙 미비 악령", "정책 변경 망령", "교육 미이수 낙인"],
    bossSkill: "이건 규정 위반입니다",
  },
  {
    from: 161,
    to: 170,
    name: "주주총회 서커스",
    boss: "행동주의 펀드",
    mobs: ["의결권 괴물", "공시 폭탄", "적대적 지분"],
    bossSkill: "지배구조 개선 요구",
  },
  {
    from: 171,
    to: 180,
    name: "해외법인 적자",
    boss: "현지 파트너의 배신",
    mobs: ["환율 악령", "송금 지연 가고일", "현지법 함정"],
    bossSkill: "계약서 다시 보시죠",
  },
  {
    from: 181,
    to: 190,
    name: "이사회 숙청",
    boss: "의장의 침묵",
    mobs: ["사외이사 꼭두각시", "안건 전용 악령", "기명투표 칼날"],
    bossSkill: "반대 의견은 없겠지",
  },
  {
    from: 191,
    to: 200,
    name: "창립자 신전",
    boss: "글로벌 악덕창업주 회장",
    mobs: ["우상화 찬양자", "흑막 글로벌 주주", "신격화 홍보팀"],
    bossSkill: "나는 곧 회사다",
  },
];

const PREFIX_POOL: Record<PrefixTier, { names: string[]; mult: number; weight: number }> = {
  common: { names: ["월요병", "커피부족", "졸린눈"], mult: 1.2, weight: 50 },
  uncommon: {
    names: ["실적압박", "인사고과D등급", "승진탈락직전"],
    mult: 1.5,
    weight: 30,
  },
  rare: {
    names: ["정리해고통보", "감사대상", "내부고발위협"],
    mult: 2.0,
    weight: 15,
  },
  legendary: {
    names: ["회장라인눈밖", "지분매각직전", "감사원출동"],
    mult: 3.0,
    weight: 5,
  },
};

const PREFIX_TAUNT: Record<PrefixTier, string[]> = {
  common: [],
  uncommon: [],
  rare: [
    "희귀 도발: 「이 안건, 네 이름 빼는 게 회사에도 좋을 것 같은데?」",
    "희귀 도발: 「감사팀에서 네 법카를 따로 보고 있더라.」",
    "희귀 도발: 「내부고발 핫라인… 네가 제일 먼저 떠오르더군.」",
  ],
  legendary: [
    "⚠ 전설 경고: 회장 라인에서 김대리를 지웠습니다. 광폭화가 20턴으로 단축됩니다!",
    "⚠ 전설 경고: 지분 매각 직전, 본사 전체가 김대리를 제물로 지목합니다!",
    "⚠ 전설 경고: 감사원이 사옥에 도착했습니다. 도망칠 주말은 없습니다!",
  ],
};

const HIT_FLAVOR = [
  "어제 먹다 남긴 치맥",
  "밀린 연차",
  "무급 야근의 한",
  "퇴근버스 막차",
  "식은 편의점 삼각김밥",
  "읽씹한 팀장 카톡",
  "취소된 금요일 약속",
  "미지급 특근수당",
];

const PERK_META: Record<
  PerkKey,
  { name: string; desc: string; effect: (n: number) => string }
> = {
  mental: {
    name: "강철 멘탈",
    desc: "기본 멘탈 최대치가 레벨당 8% 증가합니다.",
    effect: (n) => `멘탈 +${n * 8}%`,
  },
  poker: {
    name: "포커페이스",
    desc: "보스에게 받는 피해가 레벨당 4% 감소합니다. (최대 80%)",
    effect: (n) => `보스 피해 경감 ${Math.min(80, n * 4)}%`,
  },
  espresso: {
    name: "에스프레소 4샷 내성",
    desc: "카페인 재생 속도가 레벨당 12% 빨라집니다.",
    effect: (n) => `카페인 재생 +${n * 12}%`,
  },
  gold: {
    name: "법카 몰래 긁기",
    desc: "골드 획득량이 레벨당 10% 증가합니다.",
    effect: (n) => `골드 배율 +${n * 10}%`,
  },
  union: {
    name: "노조 가입",
    desc: "스타포스 비용 4% 할인, 성공률 +3%p. (할인 최대 50%)",
    effect: (n) => `성공 +${n * 3}%p / 비용 -${Math.min(50, n * 4)}%`,
  },
};

const SKILL_META = {
  nod: {
    name: "영혼 없는 끄덕임",
    cost: 12,
    cd: 3,
    a: {
      name: "반사의 끄덕임",
      desc: "사용 시 3턴간 적 공격 피해의 60%를 물리 데미지로 반사합니다.",
    },
    b: {
      name: "최면의 끄덕임",
      desc: "타격 시 25% 확률로 적에게 1턴간 [멍때림(기절)]을 부여합니다.",
    },
  },
  shotgun: {
    name: "분노의 키보드 샷건",
    cost: 22,
    cd: 5,
    a: {
      name: "무한 매크로 타건",
      desc: "6연타 초고속 타격. 각 타격에 치명타 확률이 2배 적용됩니다.",
    },
    b: {
      name: "파괴의 청축 샷건",
      desc: "방어력 100% 관통 단발 핵펀치. 보스 광폭화 게이지를 2턴 지연합니다.",
    },
  },
  read: {
    name: "메신저 읽씹",
    cost: 0,
    cd: 0,
    a: {
      name: "상태메시지 '출장중'",
      desc: "회피 성공 시 최대 카페인의 15%를 즉시 회복합니다.",
    },
    b: {
      name: "알림 영구 차단",
      desc: "기본 회피율 +15%p, 번아웃/결재반려/수면부족에 100% 면역.",
    },
  },
  resign: {
    name: "사표 투척",
    cost: 55,
    cd: 14,
    a: {
      name: "노동청 고발장",
      desc: "보스에게 5턴간 방어력 50% 감소 및 턴당 극심한 도트 데미지를 부여합니다.",
    },
    b: {
      name: "대표이사 책상에 꽂기",
      desc: "즉발 3,500% 폭멸 데미지로 보스를 즉사급 한방 타격합니다.",
    },
  },
};

function uid(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function fmt(n: number): string {
  const v = Math.floor(n);
  if (v >= 1e12) return (v / 1e12).toFixed(2) + "조";
  if (v >= 1e8) return (v / 1e8).toFixed(2) + "억";
  if (v >= 1e4) return (v / 1e4).toFixed(1) + "만";
  return v.toLocaleString("ko-KR");
}

function getTheme(floor: number): Theme {
  return THEMES.find((t) => floor >= t.from && floor <= t.to) ?? THEMES[THEMES.length - 1]!;
}

function maxFloorOf(d: Difficulty): number {
  return d === "hq" ? 200 : 100;
}

function xpToNext(level: number): number {
  return Math.floor(50 * Math.pow(1.15, level - 1));
}

function monsterXp(floor: number, boss: boolean, elite: boolean): number {
  return Math.floor(8 * Math.pow(1.09, floor - 1) * (boss ? 8 : elite ? 2.5 : 1));
}

function monsterGold(floor: number, boss: boolean, elite: boolean): number {
  return Math.floor(14 * Math.pow(1.09, floor - 1) * (boss ? 6 : elite ? 2.2 : 1));
}

function starStatMult(stars: number): number {
  let m = 1;
  for (let s = 1; s <= stars; s++) {
    if (s <= 10) m += 0.05;
    else if (s <= 15) m += 0.1;
    else if (s <= 20) m += 0.2;
    else m *= 1.35;
  }
  return m;
}

function starBaseRate(stars: number): number {
  if (stars >= 25) return 0;
  if (stars <= 5) return 1;
  if (stars <= 10) return 0.7 - ((stars - 6) / 4) * 0.2;
  if (stars <= 15) return 0.45 - ((stars - 11) / 4) * 0.15;
  if (stars <= 20) return 0.3 - ((stars - 16) / 4) * 0.15;
  return 0.1 - ((stars - 21) / 3) * 0.07;
}

function starCost(stars: number, unionLv: number): number {
  const disc = Math.min(0.5, unionLv * 0.04);
  return Math.floor(100 * Math.pow(1.55, stars) * (1 - disc));
}

function starSuccessChance(item: Item, unionLv: number): number {
  if (item.chanceTime) return 1;
  const cap = GRADE_META[item.grade].maxStar;
  if (item.stars >= cap) return 0;
  return clamp(
    starBaseRate(item.stars) + item.failStack * 0.005 + unionLv * 0.03,
    0.03,
    1,
  );
}

function slotNameOf(floor: number, slot: Slot): string {
  if (slot === "weapon") {
    if (floor >= 81) return WEAPON_NAMES[4]!;
    if (floor >= 61) return WEAPON_NAMES[3]!;
    if (floor >= 41) return WEAPON_NAMES[2]!;
    if (floor >= 21) return WEAPON_NAMES[1]!;
    return WEAPON_NAMES[0]!;
  }
  if (slot === "armor") {
    if (floor >= 76) return ARMOR_NAMES[3]!;
    if (floor >= 51) return ARMOR_NAMES[2]!;
    if (floor >= 26) return ARMOR_NAMES[1]!;
    return ARMOR_NAMES[0]!;
  }
  if (floor >= 76) return ACC_NAMES[3]!;
  if (floor >= 51) return ACC_NAMES[2]!;
  if (floor >= 26) return ACC_NAMES[1]!;
  return ACC_NAMES[0]!;
}

function rollGrade(floor: number, boss: boolean): Grade {
  const boost = boss ? 12 : 0;
  const r = Math.random() * 100 + boost * 0.4;
  if (floor >= 101) return r < 40 ? 5 : 6;
  if (floor >= 71) {
    if (r < 30) return 4;
    if (r < 80) return 5;
    return 6;
  }
  if (floor >= 51) {
    if (r < 30) return 3;
    if (r < 75) return 4;
    if (r < 97) return 5;
    return 6;
  }
  if (floor >= 31) {
    if (r < 30) return 2;
    if (r < 75) return 3;
    if (r < 95) return 4;
    return 5;
  }
  if (floor >= 11) {
    if (r < 40) return 1;
    if (r < 80) return 2;
    if (r < 98) return 3;
    return 4;
  }
  if (r < 70) return 1;
  if (r < 95) return 2;
  return 3;
}

function rollAffixes(grade: Grade): Affix[] {
  const n = GRADE_META[grade].affix;
  const keys = Object.keys(AFFIX_META) as AffixKey[];
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  const scale = 1 + (grade - 1) * 0.12;
  return shuffled.slice(0, n).map((key) => {
    const meta = AFFIX_META[key];
    const raw = randInt(meta.min, meta.max) * scale;
    return { key, value: Math.round(raw * 10) / 10 };
  });
}

function makeItem(floor: number, slot: Slot, grade: Grade): Item {
  const g = GRADE_META[grade];
  const name = slotNameOf(floor, slot);
  const item: Item = {
    id: uid(),
    slot,
    name,
    grade,
    stars: 0,
    baseAtk: 0,
    baseDef: 0,
    baseHp: 0,
    affixes: rollAffixes(grade),
    failStack: 0,
    downStreak: 0,
    chanceTime: false,
    dropFloor: floor,
  };
  if (slot === "weapon") {
    item.baseAtk = Math.floor((10 + floor * 0.95) * g.mult);
  } else if (slot === "armor") {
    item.baseHp = Math.floor((40 + floor * 2.4) * g.mult);
    item.baseDef = Math.floor((6 + floor * 0.58) * g.mult);
  } else {
    item.baseAtk = Math.floor((4 + floor * 0.38) * g.mult);
    item.baseHp = Math.floor((20 + floor * 1.15) * g.mult);
  }
  return item;
}

function starterWeapon(): Item {
  return {
    id: "starter-badge",
    slot: "weapon",
    name: "사원증 목걸이",
    grade: 1,
    stars: 0,
    baseAtk: 14,
    baseDef: 0,
    baseHp: 0,
    affixes: [],
    failStack: 0,
    downStreak: 0,
    chanceTime: false,
    dropFloor: 1,
  };
}

function allowedPrefixTiers(state: GameState): PrefixTier[] {
  const loops = state.loopCount[state.difficulty];
  if (state.difficulty === "hq" || loops >= 12) return ["legendary"];
  if (state.difficulty === "hell" || loops >= 8) return ["rare", "legendary"];
  if (state.difficulty === "hard" || loops >= 3)
    return ["uncommon", "rare", "legendary"];
  return ["common", "uncommon", "rare", "legendary"];
}

function rollPrefix(state: GameState): Prefix {
  const allowed = allowedPrefixTiers(state);
  const total = allowed.reduce((s, t) => s + PREFIX_POOL[t].weight, 0);
  let r = Math.random() * total;
  let tier: PrefixTier = allowed[0]!;
  for (const t of allowed) {
    r -= PREFIX_POOL[t].weight;
    if (r <= 0) {
      tier = t;
      break;
    }
  }
  const pool = PREFIX_POOL[tier];
  return { tier, name: pick(pool.names), mult: pool.mult };
}

function spawnEnemy(state: GameState): Enemy {
  const floor = state.floor;
  const theme = getTheme(floor);
  const isBoss = floor % 10 === 0;
  const isFinal = floor === 100 || floor === 200;
  const isElite = !isBoss && Math.random() < (floor > 40 ? 0.14 : 0.09);
  const diffM = DIFF_MULT[state.difficulty];
  let hp = Math.floor(160 * Math.pow(1.135, floor - 1) * diffM);
  let atk = Math.floor(20 * Math.pow(1.105, floor - 1) * diffM);
  let def = Math.floor(6 * Math.pow(1.07, floor - 1) * diffM);
  let prefix: Prefix | null = null;
  let rage = 30;
  let taunt: string | null = null;
  if (isBoss || isElite) {
    prefix = rollPrefix(state);
    if (prefix.tier === "legendary") rage = 20;
    const lines = PREFIX_TAUNT[prefix.tier];
    if (lines.length) taunt = pick(lines);
  }
  const pMult = prefix?.mult ?? 1;
  if (isBoss) {
    hp = Math.floor(hp * 8.5 * pMult * (isFinal ? (floor === 200 ? 2.4 : 1.45) : 1));
    atk = Math.floor(atk * 2.3 * pMult);
    def = Math.floor(def * 1.8 * pMult);
  } else if (isElite) {
    hp = Math.floor(hp * 2.8 * pMult);
    atk = Math.floor(atk * 1.5 * pMult);
    def = Math.floor(def * 1.25 * pMult);
  }
  const name = isBoss ? theme.boss : pick(theme.mobs);
  const displayName = prefix ? `[${prefix.name}] ${name}` : name;
  return {
    name,
    displayName,
    isBoss,
    isElite,
    hp,
    maxHp: hp,
    atk,
    def,
    prefix,
    rageTurns: isBoss ? rage : 999,
    maxRageTurns: isBoss ? rage : 999,
    stunned: 0,
    defShredTurns: 0,
    defShred: 0,
    dotTurns: 0,
    dotDmg: 0,
    taunt,
    enraged: false,
  };
}

interface Derived {
  atk: number;
  def: number;
  maxHp: number;
  maxCaf: number;
  dodge: number;
  crit: number;
  critDmg: number;
  goldMult: number;
  dropRate: number;
  turnMs: number;
  skillCoeff: number;
  statusResist: number;
  cafRegen: number;
  cafSave: number;
  spdPct: number;
  bossRed: number;
  traitRed: number;
  mythicSkill: number;
  immune: boolean;
  items: { weapon: Item | null; armor: Item | null; accessory: Item | null };
}

function itemStats(item: Item): { atk: number; def: number; hp: number } {
  const m = starStatMult(item.stars);
  return {
    atk: Math.floor(item.baseAtk * m),
    def: Math.floor(item.baseDef * m),
    hp: Math.floor(item.baseHp * m),
  };
}

function findItem(state: GameState, id: string | null): Item | null {
  if (!id) return null;
  return state.inventory.find((i) => i.id === id) ?? null;
}

function derive(state: GameState): Derived {
  const weapon = findItem(state, state.equipped.weapon);
  const armor = findItem(state, state.equipped.armor);
  const accessory = findItem(state, state.equipped.accessory);
  const items = [weapon, armor, accessory].filter(Boolean) as Item[];
  const eq = items.reduce(
    (a, it) => {
      const s = itemStats(it);
      a.atk += s.atk;
      a.def += s.def;
      a.hp += s.hp;
      return a;
    },
    { atk: 0, def: 0, hp: 0 },
  );
  const aff = {
    atkPct: 0,
    hpPct: 0,
    spdPct: 0,
    critPct: 0,
    critDmgPct: 0,
    cafSavePct: 0,
    goldPct: 0,
  };
  for (const it of items) {
    for (const x of it.affixes) aff[x.key] += x.value;
  }
  const st = state.stats;
  let atk = (22 + st.str * 3.5 + eq.atk) * (1 + aff.atkPct / 100);
  if (state.statuses.burnout > 0) atk *= 0.5;
  const def = 8 + st.str * 0.35 + st.agi * 0.25 + eq.def;
  const maxHp = Math.floor(
    (180 + (state.level - 1) * 14 + st.str * 2 + eq.hp) *
      (1 + aff.hpPct / 100) *
      (1 + state.perks.mental * 0.08),
  );
  const maxCaf = 80 + st.int * 6;
  const immune = state.evo.read === "B";
  const dodge = clamp(
    st.agi * 0.1 + (immune ? 15 : 0),
    0,
    80,
  );
  const crit = clamp(5 + st.luk * 0.08 + aff.critPct, 0, 72);
  const critDmg = 1.5 + aff.critDmgPct / 100;
  const goldMult =
    (1 + st.luk * 0.0015 + state.perks.gold * 0.1) * (1 + aff.goldPct / 100);
  const dropRate = 0.08 + st.luk * 0.0015;
  const turnMs = Math.max(
    800,
    Math.floor((BASE_TURN - st.agi * 2) * (1 - aff.spdPct / 100)),
  );
  const skillCoeff = 1 + st.int * 0.008;
  const statusResist = immune ? 100 : st.int * 0.15;
  const cafRegen = 8 * (1 + state.perks.espresso * 0.12);
  const mythicSkill = items.some((i) => i.grade === 6) ? 2 : 1;
  return {
    atk,
    def,
    maxHp,
    maxCaf,
    dodge,
    crit,
    critDmg,
    goldMult,
    dropRate,
    turnMs,
    skillCoeff,
    statusResist,
    cafRegen,
    cafSave: aff.cafSavePct,
    spdPct: aff.spdPct,
    bossRed: Math.min(0.8, state.perks.poker * 0.04),
    traitRed: 0,
    mythicSkill,
    immune,
    items: { weapon, armor, accessory },
  };
}

function skillCost(base: number, savePct: number): number {
  return Math.max(1, Math.floor(base * (1 - savePct / 100)));
}

function pushLog(state: GameState, kind: LogKind, text: string): GameState {
  const id = state.logSeq + 1;
  const log = [{ id, kind, text }, ...state.log].slice(0, LOG_CAP);
  return { ...state, log, logSeq: id };
}

function grantExp(state: GameState, amount: number): GameState {
  let s = { ...state, exp: state.exp + amount };
  while (s.exp >= xpToNext(s.level)) {
    s = {
      ...s,
      exp: s.exp - xpToNext(s.level),
      level: s.level + 1,
      unspent: s.unspent + 5,
    };
    s = pushLog(s, "system", `레벨 업! 김대리는 이제 ${s.level}년차입니다. 스탯 포인트 +5`);
  }
  return s;
}

function incomingDamage(state: GameState, P: Derived, rawAtk: number, isBoss: boolean): number {
  const red = P.def / (P.def + 280);
  const boss = isBoss ? 1 - P.bossRed : 1;
  return Math.max(1, Math.floor(rawAtk * (1 - red) * (1 - P.traitRed) * boss));
}

function strike(
  P: Derived,
  enemyDef: number,
  skillMult: number,
  critChance: number,
  ignoreDef: boolean,
): { dmg: number; crit: boolean } {
  const def = ignoreDef ? 0 : enemyDef;
  const crit = Math.random() * 100 < critChance;
  const dmg = Math.max(
    1,
    Math.floor((P.atk - def) * (crit ? P.critDmg : 1) * skillMult * P.mythicSkill),
  );
  return { dmg, crit };
}

function effectiveDef(e: Enemy): number {
  const shred = e.defShredTurns > 0 ? e.defShred : 0;
  return Math.floor(e.def * (1 - shred));
}

function addItem(state: GameState, item: Item): GameState {
  if (state.inventory.length < INV_CAP) {
    return {
      ...state,
      inventory: [...state.inventory, item],
    };
  }
  const junk = [...state.inventory]
    .filter((i) => !Object.values(state.equipped).includes(i.id))
    .sort((a, b) => a.grade - b.grade || a.stars - b.stars)[0];
  if (!junk || junk.grade > item.grade) {
    const gold = sellPrice(item);
    return pushLog(
      { ...state, gold: state.gold + gold },
      "drop",
      `서류가방이 가득 차 [${GRADE_META[item.grade].name}] ${item.name}을(를) ${fmt(gold)}G에 즉시 처분했습니다.`,
    );
  }
  const gold = sellPrice(junk);
  return pushLog(
    {
      ...state,
      gold: state.gold + gold,
      inventory: [...state.inventory.filter((i) => i.id !== junk.id), item],
    },
    "drop",
    `공간 확보를 위해 [${GRADE_META[junk.grade].name}] ${junk.name}을(를) ${fmt(gold)}G에 팔고 새 장비를 챙겼습니다.`,
  );
}

function sellPrice(item: Item): number {
  return Math.floor(
    (18 + item.dropFloor * 3) *
      item.grade *
      GRADE_META[item.grade].mult *
      (1 + item.stars * 0.18),
  );
}

function tryStatus(state: GameState, P: Derived, e: Enemy): GameState {
  if (P.immune) return state;
  const resist = P.statusResist / 100;
  if (Math.random() < resist) return state;
  const roll = Math.random();
  const chance = e.isBoss ? 0.22 : 0.1;
  if (roll > chance) return state;
  const kind = pick(["burnout", "silence", "sleep"] as const);
  if (kind === "burnout") {
    return pushLog(
      { ...state, statuses: { ...state.statuses, burnout: 3 } },
      "warn",
      "[번아웃] 김대리의 영혼이 엑셀 셀 사이로 증발합니다. 공격력 50% 급감!",
    );
  }
  if (kind === "silence") {
    return pushLog(
      { ...state, statuses: { ...state.statuses, silence: 3 } },
      "warn",
      "[결재 반려] 스킬 버튼이 회색으로 질려갑니다. 3턴간 스킬 사용 불가!",
    );
  }
  return pushLog(
    { ...state, statuses: { ...state.statuses, sleep: 3 } },
    "warn",
    "[수면 부족] 눈꺼풀이 파워포인트를 거부합니다. 명중률 40% 하락!",
  );
}

function onKill(state: GameState, enemy: Enemy): GameState {
  const P = derive(state);
  const g = Math.floor(monsterGold(state.floor, enemy.isBoss, enemy.isElite) * P.goldMult);
  const xp = monsterXp(state.floor, enemy.isBoss, enemy.isElite);
  let s: GameState = {
    ...state,
    gold: state.gold + g,
    killCountRun: state.killCountRun + 1,
    bossKillsRun: state.bossKillsRun + (enemy.isBoss ? 1 : 0),
    enemy: null,
    reflectTurns: state.reflectTurns,
  };
  s = pushLog(
    s,
    "drop",
    `${enemy.displayName} 처치! 야근수당 ${fmt(g)}G, 경험치 ${fmt(xp)} 획득.`,
  );
  s = grantExp(s, xp);

  const dropChance =
    (enemy.isBoss ? 0.42 : enemy.isElite ? 0.22 : P.dropRate) * (1 + state.stats.luk * 0.0015);
  if (Math.random() < dropChance) {
    const slot = pick(["weapon", "armor", "accessory"] as Slot[]);
    const grade = rollGrade(state.floor, enemy.isBoss);
    const item = makeItem(state.floor, slot, grade);
    s = addItem(s, item);
    s = pushLog(
      s,
      "drop",
      `드롭! [${GRADE_META[grade].name}] ${item.name} — 책상 서랍에서 굴러나왔습니다.`,
    );
  }

  const cap = maxFloorOf(s.difficulty);
  if (s.climbMode) {
    if (enemy.isBoss && s.floor === cap) {
      return handleClear(s);
    }
    if (s.floor < cap) {
      const next = s.floor + 1;
      s = {
        ...s,
        floor: next,
        runHighest: Math.max(s.runHighest, next),
        highest: {
          ...s.highest,
          [s.difficulty]: Math.max(s.highest[s.difficulty], next),
        },
      };
      s = pushLog(s, "system", `${next}층 — ${getTheme(next).name}으로 엘리베이터 문이 열립니다.`);
    }
  }
  return s;
}

function handleClear(state: GameState): GameState {
  let s = { ...state, enemy: null, paused: true };
  if (state.difficulty === "normal") {
    s = {
      ...s,
      unlocked: { ...s.unlocked, hard: true },
      highest: { ...s.highest, normal: 100 },
    };
    return pushLog(
      s,
      "system",
      "일반 모드 100층 클리어! 하드 모드가 해금되었습니다. [타임루프] 탭에서 난이도를 변경하세요.",
    );
  }
  if (state.difficulty === "hard") {
    s = {
      ...s,
      unlocked: { ...s.unlocked, hell: true },
      highest: { ...s.highest, hard: 100 },
    };
    return pushLog(
      s,
      "system",
      "하드 모드 100층 클리어! 헬 모드가 해금되었습니다. 진짜 퇴근이 보이기 시작합니다.",
    );
  }
  if (state.difficulty === "hell") {
    s = {
      ...s,
      unlocked: { ...s.unlocked, hq: true },
      highest: { ...s.highest, hell: 100 },
      cutscene: 1,
      paused: true,
    };
    return pushLog(s, "warn", "헬 모드 100층 클리어. 옥상 헬리패드에서 로터가 울립니다...");
  }
  s = {
    ...s,
    highest: { ...s.highest, hq: 200 },
    trueEnding: true,
    paused: true,
  };
  return pushLog(
    s,
    "system",
    "본사 마탑 200층 격파. 김대리는 헬기에 올랐습니다. 이번엔… 진짜 퇴근일까요?",
  );
}

function playerAttack(
  state: GameState,
  enemy: Enemy,
  P: Derived,
  mode: "basic" | "nod" | "shotgun" | "resign",
): { state: GameState; enemy: Enemy; killed: boolean } {
  const e = { ...enemy };
  let s = state;
  const costSave = P.cafSave;
  const miss = s.statuses.sleep > 0 && Math.random() < 0.4;
  if (miss) {
    s = pushLog(s, "warn", "수면 부족으로 타이핑이 빗나갑니다... 허공에 메일만 날아갑니다.");
    return { state: s, enemy: e, killed: false };
  }

  if (mode === "basic") {
    const hit = strike(P, effectiveDef(e), 1, P.crit, false);
    e.hp -= hit.dmg;
    const flavor = pick(HIT_FLAVOR);
    s = pushLog(
      s,
      hit.crit ? "crit" : "normal",
      hit.crit
        ? `치명타! 김대리의 쌓인 야근 한이 ${e.displayName}의 멘탈을 분쇄합니다! (${fmt(hit.dmg)})`
        : `김대리가 '${flavor}'을(를) 떠올리며 눈물의 분노 타격을 날립니다! (${fmt(hit.dmg)})`,
    );
  } else if (mode === "nod") {
    const cost = skillCost(SKILL_META.nod.cost, costSave);
    s = { ...s, caffeine: s.caffeine - cost, cd: { ...s.cd, nod: SKILL_META.nod.cd } };
    const hit = strike(P, effectiveDef(e), 1.35 * P.skillCoeff, P.crit, false);
    e.hp -= hit.dmg;
    if (s.evo.nod === "A") {
      s = { ...s, reflectTurns: 3 };
      s = pushLog(
        s,
        "skill",
        `김대리가 [반사의 끄덕임]을 시전합니다. 3턴간 피해를 되돌려줍니다! (${fmt(hit.dmg)})`,
      );
    } else {
      const stun = Math.random() < 0.25;
      if (stun) e.stunned = Math.max(e.stunned, 1);
      s = pushLog(
        s,
        "skill",
        stun
          ? `[최면의 끄덕임]! ${e.displayName}이(가) 김대리의 영혼 없는 동의에 멍때립니다. (${fmt(hit.dmg)})`
          : `김대리가 [영혼 없는 끄덕임]으로 타격합니다. (${fmt(hit.dmg)})`,
      );
    }
  } else if (mode === "shotgun") {
    const cost = skillCost(SKILL_META.shotgun.cost, costSave);
    s = {
      ...s,
      caffeine: s.caffeine - cost,
      cd: { ...s.cd, shotgun: SKILL_META.shotgun.cd },
    };
    if (s.evo.shotgun === "A") {
      let total = 0;
      let crits = 0;
      for (let i = 0; i < 6; i++) {
        const hit = strike(P, effectiveDef(e), 0.42 * P.skillCoeff, P.crit * 2, false);
        e.hp -= hit.dmg;
        total += hit.dmg;
        if (hit.crit) crits++;
      }
      s = pushLog(
        s,
        crits ? "crit" : "skill",
        `[무한 매크로 타건] 6연타! 청축이 비명을 지릅니다. 합계 ${fmt(total)}${crits ? ` / 치명 ${crits}` : ""}`,
      );
    } else {
      const hit = strike(P, effectiveDef(e), 2.85 * P.skillCoeff, P.crit, true);
      e.hp -= hit.dmg;
      e.rageTurns += 2;
      s = pushLog(
        s,
        hit.crit ? "crit" : "skill",
        `[파괴의 청축 샷건] 방어력을 관통한 핵펀치! ${fmt(hit.dmg)} — 광폭화가 2턴 지연됩니다.`,
      );
    }
  } else {
    const cost = skillCost(SKILL_META.resign.cost, costSave);
    s = {
      ...s,
      caffeine: s.caffeine - cost,
      cd: { ...s.cd, resign: SKILL_META.resign.cd },
    };
    if (s.evo.resign === "A") {
      const hit = strike(P, effectiveDef(e), 1.8 * P.skillCoeff, P.crit, false);
      e.hp -= hit.dmg;
      e.defShred = 0.5;
      e.defShredTurns = 5;
      e.dotTurns = 5;
      e.dotDmg = Math.max(1, Math.floor(P.atk * 1.6 * P.skillCoeff * P.mythicSkill));
      s = pushLog(
        s,
        "skill",
        `[노동청 고발장]을 ${e.displayName}의 책상에 접수했습니다! 방어력 50% 감소 + 턴당 ${fmt(e.dotDmg)} 도트. (${fmt(hit.dmg)})`,
      );
    } else {
      const hit = strike(P, effectiveDef(e), 35 * P.skillCoeff, P.crit, false);
      e.hp -= hit.dmg;
      s = pushLog(
        s,
        "crit",
        `[대표이사 책상에 꽂기]!!! 3,500% 폭멸 — ${e.displayName}의 명패가 산산조각납니다! (${fmt(hit.dmg)})`,
      );
    }
  }

  return { state: s, enemy: e, killed: e.hp <= 0 };
}

function autoSkill(
  state: GameState,
  enemy: Enemy,
  P: Derived,
): "basic" | "nod" | "shotgun" | "resign" {
  if (state.statuses.silence > 0) return "basic";
  const c = state.caffeine;
  const resignCost = skillCost(SKILL_META.resign.cost, P.cafSave);
  const shotCost = skillCost(SKILL_META.shotgun.cost, P.cafSave);
  const nodCost = skillCost(SKILL_META.nod.cost, P.cafSave);
  if (state.cd.resign <= 0 && c >= resignCost && (enemy.isBoss || enemy.isElite))
    return "resign";
  if (state.cd.shotgun <= 0 && c >= shotCost) return "shotgun";
  if (state.cd.nod <= 0 && c >= nodCost) return "nod";
  return "basic";
}

function tickCombat(state: GameState): GameState {
  if (!state.started || state.paused || state.dead || state.cutscene) return state;
  let s: GameState = {
    ...state,
    runHighest: Math.max(state.runHighest, state.floor),
    highest: {
      ...state.highest,
      [state.difficulty]: Math.max(state.highest[state.difficulty], state.floor),
    },
  };
  const P = derive(s);
  s = {
    ...s,
    caffeine: Math.min(P.maxCaf, s.caffeine + P.cafRegen),
    cd: {
      nod: Math.max(0, s.cd.nod - 1),
      shotgun: Math.max(0, s.cd.shotgun - 1),
      resign: Math.max(0, s.cd.resign - 1),
    },
    statuses: {
      burnout: Math.max(0, s.statuses.burnout - 1),
      silence: Math.max(0, s.statuses.silence - 1),
      sleep: Math.max(0, s.statuses.sleep - 1),
    },
    playerStun: Math.max(0, s.playerStun - 1),
    mental: Math.min(P.maxHp, s.mental <= 0 ? 0 : s.mental),
  };

  if (!s.enemy) {
    const enemy = spawnEnemy(s);
    s = { ...s, enemy };
    const theme = getTheme(s.floor);
    if (enemy.isBoss) {
      s = pushLog(
        s,
        "warn",
        `${s.floor}층 보스 등장 — ${enemy.displayName}! [${theme.bossSkill}]이 대기 중입니다. 광폭화 ${enemy.maxRageTurns}턴.`,
      );
    } else if (enemy.isElite) {
      s = pushLog(s, "system", `정예 조우! ${enemy.displayName}이(가) 탕비실을 봉쇄합니다.`);
    } else {
      s = pushLog(s, "system", `${enemy.displayName}이(가) 김대리의 칸막이를 넘어옵니다.`);
    }
    if (enemy.taunt) s = pushLog(s, "warn", enemy.taunt);
    return s;
  }

  let e = { ...s.enemy };

  if (e.dotTurns > 0 && e.hp > 0) {
    const dot = e.dotDmg;
    e.hp -= dot;
    e.dotTurns -= 1;
    s = pushLog(s, "skill", `노동청 고발장 도트! ${e.displayName}이(가) ${fmt(dot)}의 법적 스트레스를 받습니다.`);
    if (e.hp <= 0) return onKill(s, e);
  }
  if (e.defShredTurns > 0) e.defShredTurns -= 1;

  if (s.playerStun > 0) {
    s = pushLog(s, "warn", "김대리가 모니터만 바라보며 멍하니 키보드에 이마를 붙입니다...");
  } else {
    const mode = autoSkill(s, e, P);
    const res = playerAttack(s, e, P, mode);
    s = res.state;
    e = res.enemy;
    if (res.killed) return onKill(s, e);
  }

  if (e.stunned > 0) {
    e.stunned -= 1;
    s = pushLog(s, "skill", `${e.displayName}이(가) [멍때림] 상태로 허공을 응시합니다.`);
    return { ...s, enemy: e };
  }

  if (e.isBoss) {
    e.rageTurns -= 1;
    if (e.rageTurns <= 0 && !e.enraged) {
      e.enraged = true;
      s = pushLog(
        s,
        "warn",
        "[무한 주말특근 광폭화] 발동! 주말 캘린더가 공유됩니다. 턴당 999,999 즉사 피해!",
      );
    }
  }

  const theme = getTheme(s.floor);
  const rawIncoming = e.enraged ? 999999 : e.atk;
  const dodgeRoll = !e.enraged && Math.random() * 100 < P.dodge;
  if (dodgeRoll) {
    s = pushLog(
      s,
      "skill",
      `${e.displayName}의 [${e.isBoss ? theme.bossSkill : "업무 지시"}]를 김대리가 [메신저 읽씹]으로 흘려보냅니다!`,
    );
    if (s.evo.read === "A") {
      const heal = Math.floor(P.maxCaf * 0.15);
      s = {
        ...s,
        caffeine: Math.min(P.maxCaf, s.caffeine + heal),
      };
      s = pushLog(s, "skill", `상태메시지 '출장중' — 카페인 ${fmt(heal)} 회복.`);
    }
    return { ...s, enemy: e };
  }

  const dmg = incomingDamage(s, P, rawIncoming, e.isBoss);
  if (s.reflectTurns > 0 && !e.enraged) {
    const ref = Math.floor(dmg * 0.6);
    e.hp -= ref;
    s = {
      ...s,
      reflectTurns: s.reflectTurns - 1,
    };
    s = pushLog(
      s,
      "skill",
      `보스 [${e.displayName}]이 [${theme.bossSkill}]을 소집했으나 김대리가 [영혼 없는 끄덕임]으로 멘탈 피해를 반사합니다! (${fmt(ref)})`,
    );
    if (e.hp <= 0) return onKill(s, e);
  }

  s = { ...s, mental: s.mental - dmg };
  s = pushLog(
    s,
    e.enraged ? "warn" : "normal",
    e.enraged
      ? `광폭화 주말특근이 김대리의 영혼을 갈가리 찢습니다! 멘탈 -${fmt(dmg)}`
      : `${e.displayName}의 [${e.isBoss ? theme.bossSkill : "잔소리"}]가 꽂힙니다. 멘탈 -${fmt(dmg)}`,
  );

  if (s.mental <= 0) {
    s = {
      ...s,
      mental: 0,
      dead: true,
      paused: true,
      enemy: e,
    };
    return pushLog(
      s,
      "warn",
      "멘탈이 붕괴했습니다. 시야가 18:00 퇴근 지문기로 되감깁니다... [번아웃 타임루프]를 선택하세요.",
    );
  }

  s = tryStatus(s, P, e);
  return { ...s, enemy: e };
}

function traumaGain(state: GameState): number {
  const hi = Math.max(state.runHighest, state.floor);
  return Math.floor(
    Math.pow(hi / 10, 2.2) * (1 + state.bossKillsRun * 0.5) * DIFF_MULT[state.difficulty],
  );
}

function perkCost(level: number): number {
  return Math.floor(5 * Math.pow(1.55, level));
}

function resetRun(state: GameState, difficulty = state.difficulty): GameState {
  const Pdummy = { ...state, difficulty, floor: 1, enemy: null, statuses: { burnout: 0, silence: 0, sleep: 0 } };
  const maxHp = derive(Pdummy).maxHp;
  const maxCaf = derive(Pdummy).maxCaf;
  return {
    ...state,
    difficulty,
    floor: 1,
    climbMode: true,
    mental: maxHp,
    caffeine: maxCaf,
    enemy: null,
    dead: false,
    paused: false,
    statuses: { burnout: 0, silence: 0, sleep: 0 },
    playerStun: 0,
    reflectTurns: 0,
    rageDelay: 0,
    cd: { nod: 0, shotgun: 0, resign: 0 },
    bossKillsRun: 0,
    killCountRun: 0,
    runHighest: 1,
    cutscene: 0,
    lastStarMsg: null,
  };
}

function applyStarforce(item: Item, unionLv: number): { item: Item; msg: string } {
  const cap = GRADE_META[item.grade].maxStar;
  const it = { ...item };
  if (it.stars >= cap) return { item: it, msg: "이미 최대 성수입니다." };
  const chance = starSuccessChance(it, unionLv);
  const wasChance = it.chanceTime;
  const roll = Math.random();
  if (roll < chance) {
    it.stars += 1;
    it.failStack = 0;
    it.downStreak = 0;
    it.chanceTime = false;
    return {
      item: it,
      msg: wasChance
        ? `찬스타임 확정 성공! ${it.stars}성으로 승천했습니다.`
        : `스타포스 성공! ${it.name} → ${it.stars}성 (성공률 ${(chance * 100).toFixed(1)}%)`,
    };
  }
  it.failStack += 1;
  const from = it.stars;
  let dropped = false;
  if (from >= 21) {
    it.stars = from - 1;
    dropped = true;
  } else if (from >= 16 && from < 20) {
    it.stars = Math.max(15, from - 1);
    dropped = it.stars < from;
  } else if (from === 20) {
    dropped = false;
  } else if (from >= 11 && from < 15) {
    it.stars = Math.max(10, from - 1);
    dropped = it.stars < from;
  } else if (from === 15) {
    dropped = false;
  }
  if (dropped) {
    it.downStreak += 1;
    if (it.downStreak >= 2) {
      it.chanceTime = true;
      it.downStreak = 0;
      return {
        item: it,
        msg: `하락... ${from}성 → ${it.stars}성. 억울함이 폭발합니다! 다음 강화는 [찬스타임] 100% 확정!`,
      };
    }
    return {
      item: it,
      msg: `실패 및 1성 하락. ${from}성 → ${it.stars}성. 억울함 스택 ${it.failStack} (성공률 +${(it.failStack * 0.5).toFixed(1)}%p)`,
    };
  }
  return {
    item: it,
    msg: `실패했지만 세이프존/유지 구간입니다. ${it.stars}성 유지. 억울함 스택 ${it.failStack}`,
  };
}

function initialState(): GameState {
  const w = starterWeapon();
  const base: GameState = {
    started: false,
    paused: false,
    dead: false,
    difficulty: "normal",
    unlocked: { normal: true, hard: false, hell: false, hq: false },
    highest: { normal: 1, hard: 0, hell: 0, hq: 0 },
    loopCount: { normal: 0, hard: 0, hell: 0, hq: 0 },
    trauma: 0,
    gold: 0,
    lastSavedAt: Date.now(),
    floor: 1,
    climbMode: true,
    level: 1,
    exp: 0,
    unspent: 0,
    stats: { str: 0, agi: 0, int: 0, luk: 0 },
    mental: 180,
    caffeine: 80,
    inventory: [w],
    equipped: { weapon: w.id, armor: null, accessory: null },
    evo: { nod: "A", shotgun: "A", read: "A", resign: "A" },
    cd: { nod: 0, shotgun: 0, resign: 0 },
    perks: { mental: 0, poker: 0, espresso: 0, gold: 0, union: 0 },
    enemy: null,
    log: [],
    logSeq: 0,
    statuses: { burnout: 0, silence: 0, sleep: 0 },
    playerStun: 0,
    reflectTurns: 0,
    rageDelay: 0,
    bossKillsRun: 0,
    killCountRun: 0,
    runHighest: 1,
    cutscene: 0,
    lastStarMsg: null,
    trueEnding: false,
    offlineReward: null,
    booted: false,
  };
  const hp = derive(base).maxHp;
  return { ...base, mental: hp, caffeine: derive(base).maxCaf };
}

function persistable(s: GameState): object {
  return {
    ...s,
    lastStarMsg: null,
    lastSavedAt: Date.now(),
    offlineReward: null,
  };
}

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, ...action.payload };
    case "START": {
      let s: GameState = { ...state, started: true, paused: false };
      s = pushLog(s, "warn", "삐빅- 야근 모드가 활성화되었습니다.");
      s = pushLog(
        s,
        "system",
        "금요일 18:00. 퇴근 지문기는 거짓말을 했습니다. 1층 로비 — 무한 아침회의 지옥.",
      );
      return s;
    }
    case "TICK":
      return tickCombat(state);
    case "TOGGLE_PAUSE":
      if (state.dead || state.cutscene) return state;
      return { ...state, paused: !state.paused };
    case "TOGGLE_CLIMB":
      return pushLog(
        { ...state, climbMode: !state.climbMode },
        "system",
        !state.climbMode
          ? "층 등반 모드 — 김대리가 엘리베이터 버튼을 올려찍습니다."
          : "안전 층 반복 파밍 — 이 층의 악몽을 농장으로 만듭니다.",
      );
    case "ALLOC": {
      if (state.unspent <= 0) return state;
      return {
        ...state,
        unspent: state.unspent - 1,
        stats: { ...state.stats, [action.stat]: state.stats[action.stat] + 1 },
      };
    }
    case "SET_EVO":
      return { ...state, evo: { ...state.evo, [action.skill]: action.branch } };
    case "EQUIP": {
      const item = state.inventory.find((i) => i.id === action.id);
      if (!item) return state;
      return {
        ...state,
        equipped: { ...state.equipped, [item.slot]: item.id },
      };
    }
    case "UNEQUIP":
      return { ...state, equipped: { ...state.equipped, [action.slot]: null } };
    case "SELL": {
      const item = state.inventory.find((i) => i.id === action.id);
      if (!item) return state;
      if (Object.values(state.equipped).includes(item.id)) return state;
      const gold = sellPrice(item);
      return pushLog(
        {
          ...state,
          gold: state.gold + gold,
          inventory: state.inventory.filter((i) => i.id !== item.id),
        },
        "drop",
        `[${GRADE_META[item.grade].name}] ${item.name}을(를) 중고 거래 게시판에 올렸습니다. +${fmt(gold)}G`,
      );
    }
    case "BULK_SELL": {
      const keep = new Set(Object.values(state.equipped));
      const sold = state.inventory.filter((i) => i.grade === action.grade && !keep.has(i.id));
      if (!sold.length) return state;
      const gold = sold.reduce((a, i) => a + sellPrice(i), 0);
      const ids = new Set(sold.map((i) => i.id));
      return pushLog(
        {
          ...state,
          gold: state.gold + gold,
          inventory: state.inventory.filter((i) => !ids.has(i.id)),
        },
        "drop",
        `[${GRADE_META[action.grade].name}] 등급 ${sold.length}개를 일괄 매각. +${fmt(gold)}G`,
      );
    }
    case "STARFORCE": {
      const item = state.inventory.find((i) => i.id === action.id);
      if (!item) return state;
      const cost = starCost(item.stars, state.perks.union);
      if (state.gold < cost) {
        return { ...state, lastStarMsg: "골드가 부족합니다. 야근수당을 더 긁어야 합니다." };
      }
      if (item.stars >= GRADE_META[item.grade].maxStar) {
        return { ...state, lastStarMsg: "이 장비의 최대 성수에 도달했습니다." };
      }
      const { item: next, msg } = applyStarforce(item, state.perks.union);
      return {
        ...state,
        gold: state.gold - cost,
        inventory: state.inventory.map((i) => (i.id === next.id ? next : i)),
        lastStarMsg: msg,
      };
    }
    case "BUY_PERK": {
      const lv = state.perks[action.key];
      const cost = perkCost(lv);
      if (state.trauma < cost) return state;
      return {
        ...state,
        trauma: state.trauma - cost,
        perks: { ...state.perks, [action.key]: lv + 1 },
      };
    }
    case "REBIRTH": {
      const gain = traumaGain(state);
      let s = resetRun(state);
      s = {
        ...s,
        trauma: state.trauma + gain,
        loopCount: {
          ...state.loopCount,
          [state.difficulty]: state.loopCount[state.difficulty] + 1,
        },
        started: true,
      };
      const hp = derive(s).maxHp;
      s = { ...s, mental: hp, caffeine: derive(s).maxCaf };
      s = pushLog(
        s,
        "warn",
        `삐빅- 야근 모드가 활성화되었습니다. 야근 트라우마 +${fmt(gain)}. 다시 1층 로비, 금요일 18:00.`,
      );
      return s;
    }
    case "SET_DIFFICULTY": {
      if (!state.unlocked[action.difficulty]) return state;
      let s = resetRun(state, action.difficulty);
      s = { ...s, started: true, trueEnding: false };
      const hp = derive(s).maxHp;
      s = { ...s, mental: hp, caffeine: derive(s).maxCaf };
      return pushLog(
        s,
        "system",
        `난이도 [${DIFF_LABEL[action.difficulty]}] — 사옥의 공기가 더 무거워집니다. 1층부터 재등반.`,
      );
    }
    case "CAST": {
      if (state.dead || !state.enemy || state.paused) return state;
      const P = derive(state);
      const e = state.enemy;
      if (state.statuses.silence > 0) {
        return pushLog(state, "warn", "결재가 반려되어 스킬을 쓸 수 없습니다.");
      }
      const cost = skillCost(SKILL_META[action.skill].cost, P.cafSave);
      if (state.cd[action.skill] > 0) return state;
      if (state.caffeine < cost) {
        return pushLog(state, "warn", "카페인이 바닥입니다. 탕비실 원두가 그리워집니다.");
      }
      const res = playerAttack(state, e, P, action.skill);
      if (res.killed) return onKill(res.state, res.enemy);
      return { ...res.state, enemy: res.enemy };
    }
    case "CUTSCENE_NEXT": {
      if (state.cutscene === 0) return state;
      if (state.cutscene >= 3) {
        let s = resetRun(state, "hq");
        s = {
          ...s,
          floor: 101,
          runHighest: 101,
          highest: { ...s.highest, hq: Math.max(s.highest.hq, 101) },
          started: true,
          cutscene: 0,
          paused: false,
        };
        const hp = derive(s).maxHp;
        s = { ...s, mental: hp, caffeine: derive(s).maxCaf };
        return pushLog(
          s,
          "warn",
          "글로벌 본사 마탑 101층. 시차가 김대리의 뼈를 갈기 시작합니다.",
        );
      }
      return { ...state, cutscene: (state.cutscene + 1) as 1 | 2 | 3 };
    }
    case "CLEAR_STAR_MSG":
      return { ...state, lastStarMsg: null };
    case "DISMISS_ENDING":
      return { ...state, trueEnding: false, paused: true };
    case "APPLY_OFFLINE": {
      let s: GameState = {
        ...state,
        gold: state.gold + action.gold,
        killCountRun: state.killCountRun + action.kills,
        offlineReward: {
          hours: action.hours,
          kills: action.kills,
          gold: action.gold,
          exp: action.exp,
        },
      };
      s = grantExp(s, action.exp);
      const P = derive(s);
      s = { ...s, mental: Math.min(P.maxHp, s.mental) };
      return s;
    }
    case "DISMISS_OFFLINE":
      return { ...state, offlineReward: null };
    case "WIPE":
      return { ...initialState(), booted: true };
    default:
      return state;
  }
}

const STAT_INFO: Record<StatKey, { name: string; desc: string; icon: typeof Flame }> = {
  str: { name: "근성", desc: "1포인트당 기본 공격력 +3.5", icon: Flame },
  agi: { name: "눈치", desc: "턴 쿨타임 -2ms (최소 800ms), 회피율 +0.1%", icon: Eye },
  int: { name: "처세술", desc: "최대 카페인 +6, 스킬 계수 +0.8%, 상태이상 저항 +0.15%", icon: Brain },
  luk: { name: "월급루팡", desc: "치명타율 +0.08%, 골드·드롭율 +0.15%", icon: Sparkles },
};

function Bar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  return (
    <div className="min-w-0">
      <div className="mb-1 flex justify-between gap-2 text-xs text-[#c4bba8]">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-[#f4efe6]">
          {fmt(Math.max(0, value))}/{fmt(max)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/40 ring-1 ring-[#3d362c]">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Modal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="닫기"
        onClick={onClose}
      />
      <div className="office-card relative z-10 max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-2xl">
        {children}
      </div>
    </div>
  );
}

function affixText(a: Affix): string {
  return `${AFFIX_META[a.key].name} +${a.value}%`;
}

function slotLabel(slot: Slot): string {
  return slot === "weapon" ? "무기" : slot === "armor" ? "방어구" : "장신구";
}

const LOG_META: Record<LogKind, { sender: string; cls: string }> = {
  normal: { sender: "김대리", cls: "border-[#e4b84a]/40 bg-[#2a2418]" },
  crit: { sender: "김대리 · 치명", cls: "border-[#e4b84a] bg-[#3a2e12]" },
  skill: { sender: "김대리 · 스킬", cls: "border-[#3dcc8a]/50 bg-[#163024]" },
  drop: { sender: "총무팀", cls: "border-[#e4b84a]/70 bg-[#2f2614]" },
  system: { sender: "사내공지", cls: "border-[#5a5348] bg-[#1a1916]" },
  warn: { sender: "팀장", cls: "border-[#e25b4a]/70 bg-[#3a1512]" },
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [tab, setTab] = useState<Tab>("combat");
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const didLoad = useRef(false);
  const [compareId, setCompareId] = useState<string | null>(null);
  const [forgeId, setForgeId] = useState<string | null>(null);
  const [wipeAsk, setWipeAsk] = useState(false);
  const persistHint = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(HINT_KEY) !== "1";
      } catch {
        return true;
      }
    },
    () => false,
  );
  const [hintDismissed, setHintDismissed] = useState(false);
  const showHint = persistHint && !hintDismissed;
  const [peekDeathId, setPeekDeathId] = useState<string | null>(null);
  const deathId = state.dead
    ? `${state.floor}:${state.killCountRun}:${state.logSeq}`
    : null;
  const deadPeek = Boolean(state.dead && peekDeathId === deathId);
  const saveTimer = useRef<number | null>(null);

  const P = useMemo(() => derive(state), [state]);

  useEffect(() => {
    if (!hydrated || didLoad.current) return;
    didLoad.current = true;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as GameState;
        const last = saved.lastSavedAt || Date.now();
        const elapsedMs = Date.now() - last;
        const hours = Math.min(18, elapsedMs / 3_600_000);
        let payload: Partial<GameState> = {
          ...saved,
          lastStarMsg: null,
          cutscene: saved.cutscene || 0,
          offlineReward: null,
          booted: true,
        };
        if (saved.started && hours >= 0.05) {
          const dummy: GameState = { ...initialState(), ...saved };
          const d = derive(dummy);
          const floor = dummy.climbMode ? Math.max(1, dummy.floor - 1) : dummy.floor;
          const hp = Math.floor(
            160 * Math.pow(1.135, floor - 1) * DIFF_MULT[dummy.difficulty],
          );
          const ttd = Math.max(1.2, (hp / Math.max(8, d.atk)) * (d.turnMs / 1000) * 2.2);
          const kills = Math.floor(((hours * 3600) / ttd) * 0.65);
          const gold = Math.floor(
            kills * monsterGold(floor, false, false) * d.goldMult * 0.65,
          );
          const exp = Math.floor(kills * monsterXp(floor, false, false) * 0.65);
          if (kills > 0) {
            payload = grantExp(
              {
                ...dummy,
                ...payload,
                gold: (saved.gold || 0) + gold,
                killCountRun: (saved.killCountRun || 0) + kills,
                offlineReward: { hours, kills, gold, exp },
              } as GameState,
              exp,
            );
          }
        }
        dispatch({ type: "HYDRATE", payload });
      } else {
        dispatch({ type: "HYDRATE", payload: { booted: true } });
      }
    } catch {
      dispatch({ type: "HYDRATE", payload: { booted: true } });
    }
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(persistable(state)));
      } catch {
        /* ignore quota */
      }
    }, 400);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [state, hydrated]);

  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(persistable(state)));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [state]);

  useEffect(() => {
    if (!hydrated || !state.started || state.paused || state.dead || state.cutscene)
      return;
    const id = window.setInterval(() => dispatch({ type: "TICK" }), P.turnMs);
    return () => window.clearInterval(id);
  }, [
    hydrated,
    state.started,
    state.paused,
    state.dead,
    state.cutscene,
    P.turnMs,
  ]);

  useEffect(() => {
    if (!state.lastStarMsg) return;
    const t = window.setTimeout(() => dispatch({ type: "CLEAR_STAR_MSG" }), 3200);
    return () => window.clearTimeout(t);
  }, [state.lastStarMsg]);

  const dismissHint = useCallback(() => {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const theme = getTheme(state.floor);
  const compareItem = compareId ? findItem(state, compareId) : null;
  const forgeItem = forgeId ? findItem(state, forgeId) : null;
  const equippedSame = compareItem
    ? findItem(state, state.equipped[compareItem.slot])
    : null;

  const onStart = useCallback(() => dispatch({ type: "START" }), []);

  if (!hydrated || !state.booted) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-[#c4bba8]">
        <div className="fingerprint-pad flex h-20 w-20 items-center justify-center rounded-2xl border border-[#3dcc8a]/50 bg-[#163024]">
          <Fingerprint className="h-9 w-9 text-[#3dcc8a]" />
        </div>
        <p className="text-sm">지문 인식 중...</p>
      </div>
    );
  }

  if (!state.started) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-5 py-10">
        <div className="flex items-center gap-2 text-xs tracking-[0.28em] text-[#3dcc8a]">
          <Clock className="h-3.5 w-3.5" />
          FRIDAY 18:00
        </div>
        <h1 className="text-3xl font-bold leading-snug text-[#f4efe6] sm:text-4xl">
          퇴근 찍었는데
          <br />
          던전 1층입니다만?
        </h1>
        <p className="text-sm text-[#c4bba8]">악덕기업 100층 지옥 탈출기</p>
        <div className="office-card space-y-3 rounded-2xl p-4 text-sm leading-relaxed text-[#e8e0d2]">
          <p>
            금요일 18:00, 김대리는 퇴근 지문 리더기에 손가락을 댔습니다.
          </p>
          <p className="font-medium text-[#3dcc8a]">
            「삐빅- 야근 모드가 활성화되었습니다.」
          </p>
          <p>
            사옥 전체가 100층짜리 악덕기업 마탑 던전으로 변했습니다. 로비에서
            시작해 옥상 헬리패드까지 올라가야만 진짜 퇴근할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          className="fingerprint-pad flex items-center justify-center gap-2 rounded-xl bg-[#3dcc8a] px-4 py-3.5 text-base font-semibold text-[#102018] hover:bg-[#54d898]"
        >
          <Fingerprint className="h-5 w-5" />
          지문을 찍고 야근을 시작한다
        </button>
      </div>
    );
  }

  const cap = maxFloorOf(state.difficulty);
  const remain = Math.max(0, cap - state.floor);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col lg:max-w-5xl">
      <header className="sticky top-0 z-30 border-b border-[#3d362c] bg-[#141210]/92 px-3 py-2.5 backdrop-blur">
        <div className="mb-2.5 flex items-center gap-3">
          <div className="office-card flex min-w-[4.5rem] flex-col items-center rounded-xl px-2 py-1.5">
            <span className="text-[10px] tracking-[0.2em] text-[#c4bba8]">FLOOR</span>
            <span className="elevator-led font-mono text-3xl font-semibold leading-none text-[#e4b84a]">
              {state.floor}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${DIFF_STYLE[state.difficulty]}`}
              >
                {DIFF_LABEL[state.difficulty]}
              </span>
              <span className="flex items-center gap-1 text-xs text-[#c4bba8]">
                <Building2 className="h-3.5 w-3.5" />
                옥상까지 {remain}층
              </span>
            </div>
            <h1 className="mt-0.5 truncate text-sm font-semibold text-[#f4efe6] sm:text-base">
              {theme.name}
            </h1>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
            <span className="flex items-center gap-1 text-[#e4b84a]" title="야근수당">
              <Coins className="h-3.5 w-3.5" />
              <span className="text-[#c4bba8]">수당</span>
              <span className="font-mono">{fmt(state.gold)}</span>
            </span>
            <span className="flex items-center gap-1 text-[#cbb4ff]" title="야근 트라우마">
              <Ghost className="h-3.5 w-3.5" />
              <span className="text-[#c4bba8]">트라우마</span>
              <span className="font-mono">{fmt(state.trauma)}</span>
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Bar
            label="멘탈"
            value={state.mental}
            max={P.maxHp}
            color="bg-[#e25b4a]"
          />
          <Bar
            label="카페인"
            value={state.caffeine}
            max={P.maxCaf}
            color="bg-[#7ec8e3]"
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-3 pb-28 pt-3">
        {tab === "combat" && (
          <CombatView
            state={state}
            P={P}
            theme={theme}
            dispatch={dispatch}
            showHint={showHint}
            onDismissHint={dismissHint}
          />
        )}
        {tab === "spec" && <SpecView state={state} P={P} dispatch={dispatch} />}
        {tab === "bag" && (
          <BagView
            state={state}
            dispatch={dispatch}
            onCompare={setCompareId}
            onForge={(id) => {
              setForgeId(id);
              setCompareId(null);
            }}
          />
        )}
        {tab === "loop" && (
          <LoopView
            state={state}
            dispatch={dispatch}
            onWipe={() => setWipeAsk(true)}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 z-30 w-full max-w-3xl -translate-x-1/2 border-t border-[#3d362c] bg-[#141210]/95 backdrop-blur lg:max-w-5xl">
        <div className="grid grid-cols-4 pb-[max(0.35rem,env(safe-area-inset-bottom))]">
          {(
            [
              ["combat", "전투", "지옥 탈출 전투", Swords],
              ["spec", "스펙", "김대리 스펙", Brain],
              ["bag", "가방", "서류 가방", Briefcase],
              ["loop", "루프", "타임루프", RotateCcw],
            ] as const
          ).map(([id, label, full, Icon]) => (
            <button
              key={id}
              type="button"
              aria-label={full}
              aria-current={tab === id ? "page" : undefined}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${
                tab === id ? "text-[#3dcc8a]" : "text-[#8a8170]"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {state.lastStarMsg && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-40 w-[min(92%,28rem)] -translate-x-1/2 rounded-xl border border-[#a07c22] bg-[#1c1a16] px-3 py-2 text-center text-sm text-[#e4b84a] shadow-xl">
          {state.lastStarMsg}
        </div>
      )}

      {state.offlineReward && (
        <Modal onClose={() => dispatch({ type: "DISMISS_OFFLINE" })}>
          <div className="flex items-center gap-2 text-amber-300">
            <Coffee className="h-5 w-5" />
            <h2 className="font-semibold">탕비실 구석에서 기절해 쪽잠 잔 시간</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            김대리가 탕비실 구석에서 쪽잠을 자는 동안(
            {state.offlineReward.hours.toFixed(1)}시간, 효율 65%) 몸에 밴 야근
            본능으로 몬스터 {fmt(state.offlineReward.kills)}마리를 처치하고{" "}
            {fmt(state.offlineReward.gold)} 골드와 {fmt(state.offlineReward.exp)}{" "}
            경험치를 획득했습니다!
          </p>
          <p className="mt-2 text-xs text-zinc-500">최대 18시간까지 쪽잠 보상이 적용됩니다.</p>
          <button
            type="button"
            onClick={() => dispatch({ type: "DISMISS_OFFLINE" })}
            className="mt-4 w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-zinc-950"
          >
            다시 출근한다
          </button>
        </Modal>
      )}

      {state.cutscene > 0 && (
        <Modal>
          <p className="text-xs tracking-widest text-rose-400">HELL CLEAR — 옥상 헬리패드</p>
          {state.cutscene === 1 && (
            <div className="beep-in mt-3 space-y-3 text-sm leading-relaxed text-zinc-200">
              <p className="text-lg font-bold text-emerald-400">드디어 진짜 퇴근이다!</p>
              <p>
                김대리는 헬 모드 100층의 회장을 쓰러뜨리고 옥상 탈출 헬기에
                올라탔습니다. 금요일 밤바람이 밀린 넥타이를 흔듭니다. 집, 치맥,
                꺼진 메신저.
              </p>
            </div>
          )}
          {state.cutscene === 2 && (
            <div className="beep-in mt-3 space-y-3 text-sm leading-relaxed text-zinc-200">
              <p className="font-semibold text-amber-300">조종사의 반전 통보</p>
              <p>
                「축하합니다 김대리님! 헬 모드 완파 공로로 [글로벌 본사
                비상대책본부장] 특진 발령되셨습니다. 지금 바로 200층 본사 마탑으로
                모시겠습니다.」
              </p>
            </div>
          )}
          {state.cutscene === 3 && (
            <div className="beep-in mt-3 space-y-3 text-sm leading-relaxed text-zinc-200">
              <p className="text-lg font-bold text-rose-400">
                김대리의 절규가 로터 소리에 삼켜집니다.
              </p>
              <p>
                [글로벌 본사 지옥 던전 (101~200F)] 최종 엔드게임이 개방됩니다.
                난이도 배율 ×40. 이제부터가 본사입니다.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => dispatch({ type: "CUTSCENE_NEXT" })}
            className="mt-5 w-full rounded-lg bg-rose-500 py-2 text-sm font-semibold text-white"
          >
            {state.cutscene >= 3 ? "본사 마탑으로 납치된다" : "다음"}
          </button>
        </Modal>
      )}

      {state.trueEnding && (
        <Modal onClose={() => dispatch({ type: "DISMISS_ENDING" })}>
          <Crown className="h-8 w-8 text-amber-300" />
          <h2 className="mt-2 text-lg font-bold">본사 마탑 200층 — 창립자 신전</h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">
            글로벌 악덕창업주 회장이 쓰러집니다. 헬기 문이 열리고, 이번엔 조종사가
            아무 말도 하지 않습니다. 김대리는 안전벨트를 매고 창밖을 봅니다. 아래
            사옥의 불은 아직 켜져 있습니다. 진짜 퇴근. …아마도.
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-zinc-950"
            onClick={() => dispatch({ type: "DISMISS_ENDING" })}
          >
            창문을 닫는다
          </button>
        </Modal>
      )}

      {state.dead && deadPeek && (
        <div className="fixed bottom-[4.25rem] left-1/2 z-40 w-full max-w-3xl -translate-x-1/2 px-3 lg:max-w-5xl">
          <button
            type="button"
            onClick={() => setPeekDeathId(null)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#e25b4a]/60 bg-[#3a1512] px-3 py-2 text-sm text-[#f0a090]"
          >
            <span>멘탈 붕괴 — 1층으로 돌아가려면 지문을 다시 찍으세요.</span>
            <span className="shrink-0 font-semibold">회귀</span>
          </button>
        </div>
      )}

      {state.dead && !deadPeek && (
        <Modal>
          <Skull className="h-8 w-8 text-[#e25b4a]" />
          <h2 className="mt-2 text-lg font-bold">멘탈 붕괴 — 번아웃 타임루프</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#e8e0d2]">
            시야가 금요일 18:00, 퇴근 지문기 앞으로 되감깁니다. 이번 루프에서 쌓인
            야근 트라우마{" "}
            <span className="font-mono text-[#cbb4ff]">{fmt(traumaGain(state))}</span>
            을 들고 1층 로비로 돌아갑니다. 장비·골드·초월 특성은 유지됩니다.
          </p>
          <button
            type="button"
            onClick={() => {
              setPeekDeathId(null);
              dispatch({ type: "REBIRTH" });
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-[#6b4aa8] py-2.5 text-sm font-semibold text-white"
          >
            <RotateCcw className="h-4 w-4" />
            지문을 다시 찍는다
          </button>
          <button
            type="button"
            onClick={() => setPeekDeathId(deathId)}
            className="mt-2 w-full rounded-lg border border-[#3d362c] py-2 text-sm text-[#c4bba8]"
          >
            가방을 먼저 확인한다
          </button>
        </Modal>
      )}

      {compareItem && (
        <Modal onClose={() => setCompareId(null)}>
          <h2 className="font-semibold">스펙 비교</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <ItemCard item={equippedSame} title="장착 중" />
            <ItemCard item={compareItem} title="선택" peer={equippedSame} />
          </div>
          {compareItem && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-zinc-950"
                onClick={() => {
                  dispatch({ type: "EQUIP", id: compareItem.id });
                  setCompareId(null);
                }}
              >
                장착
              </button>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm"
                onClick={() => setCompareId(null)}
              >
                닫기
              </button>
            </div>
          )}
        </Modal>
      )}

      {forgeItem && (
        <Modal onClose={() => setForgeId(null)}>
          <StarForge
            item={forgeItem}
            gold={state.gold}
            union={state.perks.union}
            onStar={() => dispatch({ type: "STARFORCE", id: forgeItem.id })}
            onClose={() => setForgeId(null)}
          />
        </Modal>
      )}

      {wipeAsk && (
        <Modal onClose={() => setWipeAsk(false)}>
          <h2 className="font-semibold text-rose-300">세이브 삭제</h2>
          <p className="mt-2 text-sm text-zinc-400">
            모든 야근의 흔적이 사라집니다. 금요일 18:00로 완전 초기화됩니다.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-rose-600 py-2 text-sm font-semibold"
              onClick={() => {
                dispatch({ type: "WIPE" });
                localStorage.removeItem(SAVE_KEY);
                setWipeAsk(false);
              }}
            >
              삭제한다
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg border border-zinc-700 py-2 text-sm"
              onClick={() => setWipeAsk(false)}
            >
              취소
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CombatView({
  state,
  P,
  theme,
  dispatch,
  showHint,
  onDismissHint,
}: {
  state: GameState;
  P: Derived;
  theme: Theme;
  dispatch: Dispatch<Action>;
  showHint: boolean;
  onDismissHint: () => void;
}) {
  const e = state.enemy;
  const prefixColor =
    e?.prefix?.tier === "legendary"
      ? "text-[#f0a090]"
      : e?.prefix?.tier === "rare"
        ? "text-[#7ec8e3]"
        : e?.prefix?.tier === "uncommon"
          ? "text-[#3dcc8a]"
          : "text-[#c4bba8]";
  const logLines = [...state.log].slice(0, LOG_CAP).reverse();
  const rageVisible = !!e?.isBoss && (e.maxRageTurns ?? 999) < 900;
  const ragePct =
    rageVisible && e
      ? clamp((e.rageTurns / Math.max(1, e.maxRageTurns)) * 100, 0, 100)
      : 0;
  const readEvo = state.evo.read === "A" ? SKILL_META.read.a : SKILL_META.read.b;

  return (
    <div className="space-y-3">
      {showHint && (
        <div className="office-card rounded-2xl border border-[#3dcc8a]/40 p-3 text-sm leading-relaxed text-[#e8e0d2]">
          <p className="font-semibold text-[#3dcc8a]">엘리베이터 안내</p>
          <p className="mt-1">
            <strong className="text-[#e4b84a]">등반</strong>은 다음 층,{" "}
            <strong className="text-[#e4b84a]">파밍</strong>은 이 층에서 수당·장비를
            모읍니다. 전투는 자동입니다.
          </p>
          <button
            type="button"
            onClick={onDismissHint}
            className="mt-2 text-xs font-semibold text-[#3dcc8a] underline"
          >
            알겠습니다
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="office-card flex rounded-xl p-0.5 text-sm">
          <button
            type="button"
            onClick={() => {
              if (!state.climbMode) dispatch({ type: "TOGGLE_CLIMB" });
            }}
            className={`rounded-lg px-3 py-1.5 ${
              state.climbMode
                ? "bg-[#163024] font-semibold text-[#3dcc8a]"
                : "text-[#8a8170]"
            }`}
          >
            등반
          </button>
          <button
            type="button"
            onClick={() => {
              if (state.climbMode) dispatch({ type: "TOGGLE_CLIMB" });
            }}
            className={`rounded-lg px-3 py-1.5 ${
              !state.climbMode
                ? "bg-[#3a2e12] font-semibold text-[#e4b84a]"
                : "text-[#8a8170]"
            }`}
          >
            파밍
          </button>
        </div>
        <p className="text-xs text-[#8a8170]">
          {state.climbMode ? "처치 시 다음 층" : `${state.floor}층에서 반복`}
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: "TOGGLE_PAUSE" })}
          className="ml-auto flex items-center gap-1 rounded-lg border border-[#3d362c] px-3 py-1.5 text-sm text-[#e8e0d2]"
        >
          {state.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {state.paused ? "재개" : "일시정지"}
        </button>
        <span className="text-xs text-[#8a8170]">턴 {P.turnMs}ms</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <section
          className={`office-card rounded-2xl p-4 ${
            e?.enraged ? "rage-glow border-[#e25b4a]" : ""
          }`}
        >
          {!e ? (
            <p className="text-sm text-[#8a8170]">다음 악몽을 불러오는 중...</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {e.isBoss && (
                  <span className="rounded bg-[#3a1512] px-1.5 py-0.5 text-xs text-[#f0a090]">
                    보스
                  </span>
                )}
                {e.isElite && (
                  <span className="rounded bg-[#241838] px-1.5 py-0.5 text-xs text-[#cbb4ff]">
                    정예
                  </span>
                )}
                {e.prefix && (
                  <span className={`text-xs font-semibold ${prefixColor}`}>
                    {e.prefix.name}
                  </span>
                )}
                {state.paused && (
                  <span className="rounded bg-[#2a2722] px-1.5 py-0.5 text-xs text-[#c4bba8]">
                    탕비실 흡연 중
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold leading-snug">{e.displayName}</h2>
              <p className="mt-1 text-sm text-[#8a8170]">
                {theme.name} · 공격 {fmt(e.atk)} · 방어 {fmt(effectiveDef(e))}
              </p>
              <div className="mt-3">
                <Bar
                  label="적 멘탈"
                  value={Math.max(0, e.hp)}
                  max={e.maxHp}
                  color={
                    e.hp / e.maxHp > 0.5
                      ? "bg-[#3dcc8a]"
                      : e.hp / e.maxHp > 0.25
                        ? "bg-[#e4b84a]"
                        : "bg-[#e25b4a]"
                  }
                />
              </div>
              {rageVisible && (
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs text-[#f0a090]">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      주말특근 광폭화
                    </span>
                    <span className="font-mono">{Math.max(0, e.rageTurns)}턴</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-black/40">
                    <div
                      className="h-full bg-[#e25b4a] transition-[width]"
                      style={{ width: `${ragePct}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="office-card scanlines flex min-h-[220px] flex-col rounded-2xl p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs tracking-widest text-[#8a8170]">
            <MessageSquare className="h-3.5 w-3.5" />
            사내 메신저
          </p>
          <ul className="flex flex-1 flex-col justify-end space-y-1.5">
            {logLines.length === 0 && (
              <li className="text-sm text-[#8a8170]">아직 읽지 않은 메시지가 없습니다.</li>
            )}
            {logLines.map((line) => {
              const meta = LOG_META[line.kind];
              return (
                <li
                  key={line.id}
                  className={`rounded-lg border-l-2 px-2.5 py-1.5 text-sm leading-relaxed ${meta.cls}`}
                >
                  <p className="text-[11px] font-semibold opacity-80">{meta.sender}</p>
                  <p className="text-[#f4efe6]">{line.text}</p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <section className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(
          [
            ["nod", SKILL_META.nod],
            ["shotgun", SKILL_META.shotgun],
            ["resign", SKILL_META.resign],
          ] as const
        ).map(([key, meta]) => {
          const cost = skillCost(meta.cost, P.cafSave);
          const branch = state.evo[key];
          const ev = branch === "A" ? meta.a : meta.b;
          const locked =
            state.cd[key] > 0 ||
            state.caffeine < cost ||
            state.statuses.silence > 0 ||
            state.paused ||
            state.dead;
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              onClick={() => dispatch({ type: "CAST", skill: key })}
              className="office-card rounded-xl px-3 py-2.5 text-left disabled:opacity-40"
            >
              <p className="text-sm font-semibold text-[#7ec8e3]">{ev.name}</p>
              <p className="mt-0.5 text-xs text-[#8a8170]">{meta.name}</p>
              <p className="mt-1 text-xs text-[#c4bba8]">
                {state.cd[key] > 0 ? `쿨타임 ${state.cd[key]}턴` : `카페인 ${cost}`}
              </p>
            </button>
          );
        })}
      </section>

      <div className="office-card flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm">
        <p className="font-semibold text-[#e8e0d2]">{readEvo.name}</p>
        <p className="text-xs text-[#8a8170]">패시브 · 회피 {P.dodge.toFixed(1)}%</p>
        <div className="ml-auto flex flex-wrap gap-1.5 text-xs">
          {state.statuses.burnout > 0 && (
            <span className="rounded bg-[#3a1512] px-2 py-0.5 text-[#f0a090]">
              번아웃 {state.statuses.burnout}
            </span>
          )}
          {state.statuses.silence > 0 && (
            <span className="rounded bg-[#2a2722] px-2 py-0.5 text-[#c4bba8]">
              결재 반려 {state.statuses.silence}
            </span>
          )}
          {state.statuses.sleep > 0 && (
            <span className="rounded bg-[#163040] px-2 py-0.5 text-[#7ec8e3]">
              수면 부족 {state.statuses.sleep}
            </span>
          )}
          {state.reflectTurns > 0 && (
            <span className="rounded bg-[#163024] px-2 py-0.5 text-[#3dcc8a]">
              반사 {state.reflectTurns}
            </span>
          )}
          <span className="text-[#8a8170]">
            {state.level}년차 · 처치 {fmt(state.killCountRun)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SpecView({
  state,
  P,
  dispatch,
}: {
  state: GameState;
  P: Derived;
  dispatch: Dispatch<Action>;
}) {
  const build = [
    SKILL_META.nod[state.evo.nod === "A" ? "a" : "b"].name,
    SKILL_META.shotgun[state.evo.shotgun === "A" ? "a" : "b"].name,
    SKILL_META.read[state.evo.read === "A" ? "a" : "b"].name,
    SKILL_META.resign[state.evo.resign === "A" ? "a" : "b"].name,
  ].join(" · ");

  return (
    <div className="space-y-4">
      <section className="office-card rounded-2xl p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">김대리 {state.level}년차</h2>
          <span className="text-sm text-[#3dcc8a]">잔여 포인트 {state.unspent}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#8a8170]">{build}</p>
        <div className="mt-3">
          <Bar
            label="경험치"
            value={state.exp}
            max={xpToNext(state.level)}
            color="bg-[#3dcc8a]"
          />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-[#c4bba8] sm:grid-cols-4">
          <div>공격 {fmt(P.atk)}</div>
          <div>방어 {fmt(P.def)}</div>
          <div>치명 {P.crit.toFixed(1)}%</div>
          <div>회피 {P.dodge.toFixed(1)}%</div>
        </dl>
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(STAT_INFO) as StatKey[]).map((key) => {
          const meta = STAT_INFO[key];
          const Icon = meta.icon;
          return (
            <div key={key} className="office-card flex items-start gap-3 rounded-xl p-3">
              <Icon className="mt-0.5 h-4 w-4 text-[#3dcc8a]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {meta.name}{" "}
                    <span className="font-mono text-[#c4bba8]">{state.stats[key]}</span>
                  </p>
                  <button
                    type="button"
                    disabled={state.unspent <= 0}
                    onClick={() => dispatch({ type: "ALLOC", stat: key })}
                    className="rounded-md bg-[#163024] px-2.5 py-1 text-sm text-[#3dcc8a] disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-[#8a8170]">{meta.desc}</p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-[#f4efe6]">스킬 분기 — 언제든 무료 전환</h3>
        {(
          [
            ["nod", "영혼 없는 끄덕임"],
            ["shotgun", "분노의 키보드 샷건"],
            ["read", "메신저 읽씹"],
            ["resign", "사표 투척"],
          ] as const
        ).map(([key, title]) => {
          const meta = SKILL_META[key];
          const cur = state.evo[key];
          return (
            <div key={key} className="office-card rounded-xl p-3">
              <p className="text-sm font-semibold text-[#7ec8e3]">{title}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(["A", "B"] as const).map((br) => {
                  const ev = br === "A" ? meta.a : meta.b;
                  return (
                    <button
                      key={br}
                      type="button"
                      onClick={() => dispatch({ type: "SET_EVO", skill: key, branch: br })}
                      className={`rounded-lg border p-2.5 text-left ${
                        cur === br
                          ? "border-[#3dcc8a] bg-[#163024]/70"
                          : "border-[#3d362c] bg-black/20"
                      }`}
                    >
                      <p className="text-sm font-semibold">{ev.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[#8a8170]">{ev.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

function BagView({
  state,
  dispatch,
  onCompare,
  onForge,
}: {
  state: GameState;
  dispatch: Dispatch<Action>;
  onCompare: (id: string) => void;
  onForge: (id: string) => void;
}) {
  const equippedIds = new Set(Object.values(state.equipped));
  const [bulkTarget, setBulkTarget] = useState<Grade | null>(null);
  const sorted = [...state.inventory].sort((a, b) => {
    const ae = equippedIds.has(a.id) ? 0 : 1;
    const be = equippedIds.has(b.id) ? 0 : 1;
    if (ae !== be) return ae - be;
    return b.grade - a.grade || b.stars - a.stars;
  });

  return (
    <div className="space-y-3">
      <section className="grid gap-2 sm:grid-cols-3">
        {(["weapon", "armor", "accessory"] as Slot[]).map((slot) => {
          const it = findItem(state, state.equipped[slot]);
          return (
            <div key={slot} className="office-card rounded-xl p-3">
              <p className="text-xs text-[#8a8170]">{slotLabel(slot)}</p>
              {it ? (
                <>
                  <p className={`mt-1 text-sm font-semibold ${GRADE_META[it.grade].color}`}>
                    [{GRADE_META[it.grade].name}] {it.name}
                  </p>
                  <p className="text-xs text-[#e4b84a]">{it.stars}성</p>
                  <button
                    type="button"
                    className="mt-2 text-xs text-[#8a8170] underline"
                    onClick={() => dispatch({ type: "UNEQUIP", slot })}
                  >
                    해제
                  </button>
                </>
              ) : (
                <p className="mt-1 text-sm text-[#8a8170]">빈 슬롯</p>
              )}
            </div>
          );
        })}
      </section>

      <div className="flex flex-wrap gap-1.5">
        {([1, 2, 3, 4, 5, 6] as Grade[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              if (g >= 4) setBulkTarget(g);
              else dispatch({ type: "BULK_SELL", grade: g });
            }}
            className={`rounded-md border border-[#3d362c] px-2 py-1 text-xs ${GRADE_META[g].color}`}
          >
            {GRADE_META[g].name} 일괄판매
          </button>
        ))}
      </div>
      <p className="text-xs text-[#8a8170]">
        서류가방 {state.inventory.length}/{INV_CAP} · 장착 장비가 위에 모입니다
      </p>

      {sorted.length === 0 && (
        <div className="office-card rounded-xl p-6 text-center text-sm text-[#8a8170]">
          서류가방이 비어 있습니다. 전투에서 장비가 떨어집니다.
        </div>
      )}

      <ul className="space-y-2">
        {sorted.map((it) => {
          const on = equippedIds.has(it.id);
          const st = itemStats(it);
          return (
            <li
              key={it.id}
              className={`office-card rounded-xl p-3 ${on ? "ring-1 ring-[#3dcc8a]/50" : ""}`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${GRADE_META[it.grade].color}`}>
                    [{GRADE_META[it.grade].name}] {it.name}{" "}
                    <span className="text-[#e4b84a]">{it.stars}성</span>
                    {on && (
                      <span className="ml-1 text-[11px] text-[#3dcc8a]">장착</span>
                    )}
                    {it.chanceTime && (
                      <span className="ml-1 text-[11px] text-[#e4b84a]">찬스타임</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8a8170]">
                    {slotLabel(it.slot)} · 공격 {fmt(st.atk)} · 방어 {fmt(st.def)} · 멘탈{" "}
                    {fmt(st.hp)} · {it.dropFloor}F
                  </p>
                  {it.affixes.length > 0 && (
                    <p className="mt-1 text-xs text-[#7ec8e3]/90">
                      {it.affixes.map(affixText).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!on && (
                  <button
                    type="button"
                    className="rounded-md bg-[#163024] px-2.5 py-1 text-xs text-[#3dcc8a]"
                    onClick={() => dispatch({ type: "EQUIP", id: it.id })}
                  >
                    장착
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-md bg-black/30 px-2.5 py-1 text-xs"
                  onClick={() => onCompare(it.id)}
                >
                  <span className="inline-flex items-center gap-1">
                    <ArrowUpDown className="h-3 w-3" /> 비교
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[#3a2e12] px-2.5 py-1 text-xs text-[#e4b84a]"
                  onClick={() => onForge(it.id)}
                >
                  강화
                </button>
                {!on && (
                  <button
                    type="button"
                    className="rounded-md bg-black/30 px-2.5 py-1 text-xs text-[#8a8170]"
                    onClick={() => dispatch({ type: "SELL", id: it.id })}
                  >
                    판매 {fmt(sellPrice(it))}G
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {bulkTarget !== null && (
        <Modal onClose={() => setBulkTarget(null)}>
          <h2 className="font-semibold text-[#f0a090]">
            [{GRADE_META[bulkTarget].name}] 일괄판매
          </h2>
          <p className="mt-2 text-sm text-[#c4bba8]">
            장착 중인 장비를 제외하고 이 등급을 모두 팝니다. 되돌릴 수 없습니다.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#e25b4a] py-2 text-sm font-semibold text-white"
              onClick={() => {
                dispatch({ type: "BULK_SELL", grade: bulkTarget });
                setBulkTarget(null);
              }}
            >
              판매한다
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg border border-[#3d362c] py-2 text-sm"
              onClick={() => setBulkTarget(null)}
            >
              취소
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Delta({ label, a, b }: { label: string; a: number; b: number }) {
  const d = b - a;
  const cls =
    d > 0 ? "text-[#3dcc8a]" : d < 0 ? "text-[#e25b4a]" : "text-[#8a8170]";
  const sign = d > 0 ? "+" : "";
  return (
    <p className={`text-xs ${cls}`}>
      {label} {fmt(b)}{" "}
      {d !== 0 && (
        <span>
          ({sign}
          {fmt(d)})
        </span>
      )}
    </p>
  );
}

function ItemCard({
  item,
  title,
  peer,
}: {
  item: Item | null;
  title: string;
  peer?: Item | null;
}) {
  if (!item) {
    return (
      <div className="rounded-lg border border-[#3d362c] p-3 text-[#8a8170]">
        <p className="text-xs">{title}</p>
        <p className="mt-2 text-sm">없음</p>
      </div>
    );
  }
  const st = itemStats(item);
  const peerSt = peer ? itemStats(peer) : null;
  return (
    <div className="rounded-lg border border-[#3d362c] p-3">
      <p className="text-xs text-[#8a8170]">{title}</p>
      <p className={`mt-1 font-semibold ${GRADE_META[item.grade].color}`}>
        [{GRADE_META[item.grade].name}] {item.name}
      </p>
      <p className="text-xs text-[#e4b84a]">
        {item.stars}성 · 배율 ×{starStatMult(item.stars).toFixed(2)}
      </p>
      <div className="mt-2 space-y-0.5 text-sm text-[#c4bba8]">
        {peerSt ? (
          <>
            <Delta label="공격" a={peerSt.atk} b={st.atk} />
            <Delta label="방어" a={peerSt.def} b={st.def} />
            <Delta label="멘탈" a={peerSt.hp} b={st.hp} />
          </>
        ) : (
          <>
            <p>공격 {fmt(st.atk)}</p>
            <p>방어 {fmt(st.def)}</p>
            <p>멘탈 {fmt(st.hp)}</p>
          </>
        )}
      </div>
      {item.affixes.map((a) => (
        <p key={a.key} className="text-xs text-[#7ec8e3]">
          {affixText(a)}
        </p>
      ))}
    </div>
  );
}

function StarForge({
  item,
  gold,
  union,
  onStar,
  onClose,
}: {
  item: Item;
  gold: number;
  union: number;
  onStar: () => void;
  onClose: () => void;
}) {
  const cap = GRADE_META[item.grade].maxStar;
  const chance = starSuccessChance(item, union);
  const cost = starCost(item.stars, union);
  const now = itemStats(item);
  const next =
    item.stars < cap ? itemStats({ ...item, stars: item.stars + 1 }) : now;
  return (
    <div>
      <div className="flex items-center gap-2">
        <Star className="h-5 w-5 text-[#e4b84a]" />
        <h2 className="font-semibold">스타포스 개조소</h2>
      </div>
      <p className="mt-1 text-xs text-[#8a8170]">파괴 없음. 실패해도 장비가 사라지지 않습니다.</p>
      <p className={`mt-3 text-sm font-semibold ${GRADE_META[item.grade].color}`}>
        [{GRADE_META[item.grade].name}] {item.name}
      </p>
      <p className="mt-1 font-mono text-2xl text-[#e4b84a]">
        {item.stars}성 <span className="text-sm text-[#8a8170]">/ {cap}성</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-0.5">
        {Array.from({ length: cap }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${i < item.stars ? "text-[#e4b84a]" : "text-[#3d362c]"}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-lg bg-black/20 p-2">
          <p className="text-xs text-[#8a8170]">현재</p>
          <p>공격 {fmt(now.atk)}</p>
          <p>방어 {fmt(now.def)}</p>
          <p>멘탈 {fmt(now.hp)}</p>
        </div>
        <div className="rounded-lg bg-[#3a2e12]/40 p-2">
          <p className="text-xs text-[#e4b84a]">다음 성</p>
          <Delta label="공격" a={now.atk} b={next.atk} />
          <Delta label="방어" a={now.def} b={next.def} />
          <Delta label="멘탈" a={now.hp} b={next.hp} />
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-[#c4bba8]">
        <li>
          성공률 {(chance * 100).toFixed(1)}%{item.chanceTime ? " (찬스타임 확정)" : ""}
        </li>
        <li>억울함 스택 {item.failStack} (실패할수록 성공률이 조금 오릅니다)</li>
        <li>
          비용 {fmt(cost)}G · 보유 {fmt(gold)}G
        </li>
        <li className="text-xs text-[#8a8170]">
          0~5성 무조건 성공 · 15·20성은 하락 없음 · 21성부터 실패 시 1성 하락
        </li>
      </ul>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={gold < cost || item.stars >= cap}
          onClick={onStar}
          className="flex-1 rounded-lg bg-[#e4b84a] py-2.5 text-sm font-semibold text-[#141210] disabled:opacity-40"
        >
          강화한다
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#3d362c] px-4 py-2 text-sm"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function LoopView({
  state,
  dispatch,
  onWipe,
}: {
  state: GameState;
  dispatch: Dispatch<Action>;
  onWipe: () => void;
}) {
  const gain = traumaGain(state);
  const [askRebirth, setAskRebirth] = useState(false);
  const [askDiff, setAskDiff] = useState<Difficulty | null>(null);

  return (
    <div className="space-y-4">
      <section className="office-card rounded-2xl border border-[#5b3d8a] p-4">
        <p className="text-xs text-[#cbb4ff]">야근 트라우마</p>
        <p className="font-mono text-3xl text-[#e4d7ff]">{fmt(state.trauma)}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#8a8170]">
          지금 회귀하면 +{fmt(gain)} 획득. 장비·골드·특성은 유지되고 1층 로비로
          돌아갑니다.
        </p>
        <button
          type="button"
          onClick={() => setAskRebirth(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#6b4aa8] py-2.5 text-sm font-semibold"
        >
          <RotateCcw className="h-4 w-4" />
          번아웃 타임루프
        </button>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">영구 초월 특성</h3>
        {(Object.keys(PERK_META) as PerkKey[]).map((key) => {
          const meta = PERK_META[key];
          const lv = state.perks[key];
          const cost = perkCost(lv);
          return (
            <div
              key={key}
              className="office-card flex items-start gap-3 rounded-xl p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {meta.name}{" "}
                  <span className="font-mono text-[#8a8170]">Lv.{lv}</span>
                </p>
                <p className="mt-0.5 text-xs text-[#8a8170]">{meta.desc}</p>
                <p className="mt-1 text-xs text-[#3dcc8a]">{meta.effect(lv)}</p>
              </div>
              <button
                type="button"
                disabled={state.trauma < cost}
                onClick={() => dispatch({ type: "BUY_PERK", key })}
                className="shrink-0 rounded-md bg-[#3a2a58] px-2.5 py-1 text-xs disabled:opacity-30"
              >
                {fmt(cost)}
              </button>
            </div>
          );
        })}
      </section>

      <section>
        <h3 className="text-sm font-semibold">난이도 확장</h3>
        <p className="mt-1 text-xs text-[#8a8170]">
          난이도를 바꾸면 현재 층 진행이 1층부터 다시 시작됩니다.
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(Object.keys(DIFF_LABEL) as Difficulty[]).map((d) => {
            const open = state.unlocked[d];
            return (
              <button
                key={d}
                type="button"
                disabled={!open}
                onClick={() => {
                  if (d === state.difficulty) return;
                  setAskDiff(d);
                }}
                className={`rounded-xl border p-3 text-left ${
                  state.difficulty === d
                    ? DIFF_STYLE[d]
                    : "border-[#3d362c] bg-[#1c1a16] text-[#c4bba8]"
                } disabled:opacity-30`}
              >
                <p className="text-sm font-semibold">{DIFF_LABEL[d]}</p>
                <p className="mt-1 text-xs opacity-80">
                  배율 ×{DIFF_MULT[d]} · 최고 {state.highest[d]}F · 루프{" "}
                  {state.loopCount[d]}
                </p>
                {!open && (
                  <p className="mt-1 text-[11px]">이전 난이도 100F 클리어 필요</p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="office-card rounded-xl p-3 text-sm text-[#8a8170]">
        <p>
          이번 루프 처치 {fmt(state.killCountRun)} · 보스 {state.bossKillsRun}
        </p>
        <p className="mt-1">
          20층 보스 전후부터는 강화와 파밍을 병행하는 편이 안전합니다.
        </p>
        <button
          type="button"
          onClick={onWipe}
          className="mt-3 flex items-center gap-1 text-[#e25b4a]"
        >
          <Trash2 className="h-3.5 w-3.5" /> 세이브 삭제
        </button>
      </section>

      {askRebirth && (
        <Modal onClose={() => setAskRebirth(false)}>
          <h2 className="font-semibold">1층으로 회귀할까요?</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#c4bba8]">
            현재 {state.floor}층 진행이 초기화됩니다. 야근 트라우마{" "}
            <span className="font-mono text-[#cbb4ff]">+{fmt(gain)}</span>을 얻고
            장비는 유지됩니다.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#6b4aa8] py-2 text-sm font-semibold"
              onClick={() => {
                dispatch({ type: "REBIRTH" });
                setAskRebirth(false);
              }}
            >
              회귀한다
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg border border-[#3d362c] py-2 text-sm"
              onClick={() => setAskRebirth(false)}
            >
              취소
            </button>
          </div>
        </Modal>
      )}

      {askDiff && (
        <Modal onClose={() => setAskDiff(null)}>
          <h2 className="font-semibold">난이도를 [{DIFF_LABEL[askDiff]}](으)로?</h2>
          <p className="mt-2 text-sm text-[#c4bba8]">
            1층부터 다시 등반합니다. 장비·골드·특성은 그대로입니다.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-lg bg-[#e4b84a] py-2 text-sm font-semibold text-[#141210]"
              onClick={() => {
                dispatch({ type: "SET_DIFFICULTY", difficulty: askDiff });
                setAskDiff(null);
              }}
            >
              변경한다
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg border border-[#3d362c] py-2 text-sm"
              onClick={() => setAskDiff(null)}
            >
              취소
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
