import type { SVGProps } from "react";

export function SVGLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
      <title>SVG</title>
      <path stroke="#52525B" strokeWidth="1.5" d="M5 5H19V19H5z" />
      <rect width="4" height="4" x="3" y="3" fill="#F472B6" rx="1" />
      <rect width="4" height="4" x="17" y="3" fill="#F472B6" rx="1" />
      <rect width="4" height="4" x="17" y="17" fill="#F472B6" rx="1" />
      <rect width="4" height="4" x="3" y="17" fill="#F472B6" rx="1" />
    </svg>
  );
}
