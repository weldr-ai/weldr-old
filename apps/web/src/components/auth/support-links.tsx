import Link from "next/link";

export function SupportLinks() {
  return (
    <div className="flex items-center gap-3">
      <Link href="https://weldr.ai/contact-us" className="hover:underline">
        Help
      </Link>
      <Link href="https://weldr.ai/privacy-policy" className="hover:underline">
        Privacy
      </Link>
      <Link href="https://weldr.ai/terms-and-conditions" className="hover:underline">
        Terms
      </Link>
    </div>
  );
}
