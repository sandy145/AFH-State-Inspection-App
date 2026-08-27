import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Shown both for a record that does not exist and for one the signed-in user may
 * not see. The wording is identical on purpose: telling an unauthorized caller
 * that a case exists is itself a disclosure.
 */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold">Not available</h1>
      <p className="mt-2 text-muted-foreground">
        This record does not exist, or it is not part of a case you have access to.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button asChild>
          <Link href="/">Go to your dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
