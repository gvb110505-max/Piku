// 라인 아이콘 — 시안과 같은 규격(24 그리드, stroke 1.7, round cap/join).
import React from "react";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { C } from "@/lib/theme";

type P = { size?: number; color?: string };
const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const });
const stroke = (color: string) => ({
  stroke: color, strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
});

export const IconHome = ({ size = 22, color = C.n600 }: P) => (
  <Svg {...base(size)}><Path {...stroke(color)} d="M4 9.5l8-5.5 8 5.5V19a1 1 0 01-1 1h-4v-6h-6v6H5a1 1 0 01-1-1z" /></Svg>
);
export const IconBag = ({ size = 22, color = C.n600 }: P) => (
  <Svg {...base(size)}>
    <Path {...stroke(color)} d="M4.5 8h15l-1.2 11.2a1 1 0 01-1 .8H6.7a1 1 0 01-1-.8z" />
    <Path {...stroke(color)} d="M9 8V6.2A3 3 0 0115 6.2V8" />
  </Svg>
);
export const IconBinder = ({ size = 22, color = C.n600 }: P) => (
  <Svg {...base(size)}>
    <Rect {...stroke(color)} x={4} y={3.5} width={12} height={17} rx={1.5} />
    <Path {...stroke(color)} d="M18 6.5l2 .6a1 1 0 01.7 1.2l-3 12" />
  </Svg>
);
export const IconUser = ({ size = 22, color = C.n600 }: P) => (
  <Svg {...base(size)}>
    <Circle {...stroke(color)} cx={12} cy={8} r={3.6} />
    <Path {...stroke(color)} d="M4.8 20c.6-3.6 3.7-5.8 7.2-5.8s6.6 2.2 7.2 5.8" />
  </Svg>
);
export const IconSearch = ({ size = 18, color = C.n500 }: P) => (
  <Svg {...base(size)}>
    <Circle {...stroke(color)} cx={11} cy={11} r={6.5} />
    <Path {...stroke(color)} d="M16 16l4.5 4.5" />
  </Svg>
);
export const IconPlus = ({ size = 16, color = C.accent200 }: P) => (
  <Svg {...base(size)}><Path {...stroke(color)} d="M12 5v14" /><Path {...stroke(color)} d="M5 12h14" /></Svg>
);
export const IconShield = ({ size = 19, color = C.accent200 }: P) => (
  <Svg {...base(size)}>
    <Path {...stroke(color)} d="M12 3.2l7.2 3v6.1c0 4.4-3 8.2-7.2 8.9-4.2-.7-7.2-4.5-7.2-8.9V6.2z" />
    <Path {...stroke(color)} d="M9 12.2l2.2 2.2 4-4.2" />
  </Svg>
);
export const IconTruck = ({ size = 19, color = C.accent200 }: P) => (
  <Svg {...base(size)}>
    <Path {...stroke(color)} d="M3.5 8.5h11v9h-11z" />
    <Path {...stroke(color)} d="M14.5 11.5h3.6l2.4 2.6v3.4h-6z" />
    <Circle {...stroke(color)} cx={7} cy={19} r={1.7} />
    <Circle {...stroke(color)} cx={17.5} cy={19} r={1.7} />
  </Svg>
);
export const IconStar = ({ size = 17, color = C.accent200 }: P) => (
  <Svg {...base(size)}><Path {...stroke(color)} d="M12 3l2.3 4.9 5.2.7-3.8 3.7.9 5.3-4.6-2.5-4.6 2.5.9-5.3L4.5 8.6l5.2-.7z" /></Svg>
);
export const IconAlert = ({ size = 18, color = C.accent200 }: P) => (
  <Svg {...base(size)}>
    <Circle {...stroke(color)} cx={12} cy={12} r={8.6} />
    <Path {...stroke(color)} d="M12 7.8v5" /><Path {...stroke(color)} d="M12 15.8v.4" />
  </Svg>
);
