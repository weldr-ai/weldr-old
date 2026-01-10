import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";

import { nanoid } from "@weldr/shared/nanoid";

import { generateGradient } from "@/lib/gradient";

export const config = {
  runtime: "edge",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const maskID = nanoid();
  const size = 120;
  const gradient = await generateGradient(name, [
    "#5b1d99",
    "#0074b4",
    "#00b34c",
    "#ffd41f",
    "#fc6e3d",
  ]);

  const pngSvg = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
    >
      <mask id={maskID} maskUnits="userSpaceOnUse" x={0} y={0} width={size} height={size}>
        <rect width={size} height={size} fill="#FFFFFF" />
      </mask>
      <g mask={`url(#${maskID})`}>
        <rect width={size} height={size} fill={gradient[0]?.color} />
        <path
          filter={`url(#filter_${maskID})`}
          d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z"
          fill={gradient[1]?.color}
          transform={`translate(${gradient[1]?.translateX} ${gradient[1]?.translateY}) rotate(${gradient[1]?.rotate} ${size / 2} ${size / 2}) scale(${gradient[2]?.scale})`}
        />
        <path
          filter={`url(#filter_${maskID})`}
          style={{
            mixBlendMode: "overlay",
          }}
          d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z"
          fill={gradient[2]?.color}
          transform={`translate(${gradient[2]?.translateX} ${gradient[2]?.translateY}) rotate(${gradient[2]?.rotate} ${size / 2} ${size / 2}) scale(${gradient[2]?.scale})`}
        />
      </g>
      <defs>
        <filter
          id={`filter_${maskID}`}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation={7} result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  );

  return new ImageResponse(pngSvg, {
    width: size,
    height: size,
  });
}
