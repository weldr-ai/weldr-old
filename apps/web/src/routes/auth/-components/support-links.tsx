import { Link } from "@tanstack/react-router";

export function SupportLinks() {
  return (
    <div className="flex items-center gap-3">
      <Link to="/support" className="hover:underline">
        Help
      </Link>
      <Link to="/privacy" className="hover:underline">
        Privacy
      </Link>
      <Link to="/terms" className="hover:underline">
        Terms
      </Link>
    </div>
  );
}
