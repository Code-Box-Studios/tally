import React from "react";
import Svg, { Path } from "react-native-svg";

const paths = {
  tally: "M7 5v14M12 5v14M17 5v14M4 16l16-8",
  home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
  obligations:
    "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM9 7h6M9 11h6M9 15h3",
  people:
    "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3M9 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM17 4a4 4 0 0 1 0 7M22 21v-3a4 4 0 0 0-3-3.87",
  calendar:
    "M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2ZM16 3v4M8 3v4M3 11h18M8 15h2M14 15h2",
  activity: "M2 12h4l3-8 5 16 3-8h5",
  settings:
    "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z",
  plus: "M12 5v14M5 12h14",
  arrow: "M4 12h16m-5-5 5 5-5 5",
  arrowUp: "M7 17 17 7M7 7h10v10",
  arrowDown: "M17 7 7 17M7 7v10h10",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7Zm-4 9 3 3 5-6",
  globe:
    "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20ZM2 12h20M12 2c-5 5-5 15 0 20 5-5 5-15 0-20Z",
  clock: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20ZM12 6v6l4 2",
  info: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20ZM12 11v6M12 7h.01",
  bolt: "m13 2-9 12h7l-1 8 10-12h-7Z",
  warning: "M12 3 2 21h20ZM12 9v5M12 17h.01",
  check: "m5 12 4 4L19 6",
  more: "M4 12h.01M12 12h.01M20 12h.01",
  chevron: "m9 5 7 7-7 7",
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  color,
  size = 20,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      <Path d={paths[name]} />
    </Svg>
  );
}
