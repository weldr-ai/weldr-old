import type { SVGProps } from "react";

export function ORPCLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="600"
      height="600"
      fill="none"
      viewBox="0 0 600 600"
      {...props}
    >
      <title>ORPC</title>
      <circle cx="300" cy="300" r="299" fill="#000" stroke="#2F3336" strokeWidth="2" />
    </svg>
  );
}
