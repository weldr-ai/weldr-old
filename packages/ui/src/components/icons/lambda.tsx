import type { SVGProps } from "react";

export function LambdaIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      role="graphics-symbol"
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <title>Function</title>
      <path d="M6 20l6.5 -9" />
      <path d="M19 20c-6 0 -6 -16 -12 -16" />
    </svg>
  );
}
