import type { SVGProps } from "react";

import { cn } from "@weldr/ui/lib/utils";

export function WeldrLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={cn("p-1", props.className)}
      width="1024"
      height="1024"
      viewBox="0 0 1024 1024"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>Weldr Logo</title>
      <path
        d="M611.567 553.199L1024 512L611.567 470.75L874.052 149.948L553.233 412.45L512 0L470.75 412.45L149.948 149.948L412.433 470.75L0 512L412.433 553.199L149.948 874.035L470.75 611.567L512 1024L553.233 611.567L874.052 874.035L611.567 553.199Z"
        fill="url(#paint0_linear_1708_297)"
      />
      <defs>
        <linearGradient
          id="paint0_linear_1708_297"
          x1="1024"
          y1="0"
          x2="83.283"
          y2="1095.52"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.3" stopColor="#449EFF" />
          <stop offset="0.5" stopColor="#FFE065" />
          <stop offset="0.7" stopColor="#FF904F" />
        </linearGradient>
      </defs>
    </svg>
  );
}
