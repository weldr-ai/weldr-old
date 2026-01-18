import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Loader2, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UAParser } from "ua-parser-js";

import { Button } from "@weldr/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@weldr/ui/components/card";

import { authClient } from "@/lib/auth/client";

export function SessionsList({
  session: currentSession,
}: {
  session: typeof authClient.$Infer.Session;
}) {
  const queryClient = useQueryClient();

  const { data: sessions } = useQuery({
    queryKey: ["sessions"],
    queryFn: async () => {
      const sessions = await authClient.listSessions();
      return sessions.data;
    },
  });

  const [isRevoking, setIsRevoking] = useState(false);

  const handleRevoke = async (sessionId: string) => {
    setIsRevoking(true);

    if (sessionId === currentSession.session.id) {
      authClient.signOut({
        fetchOptions: {
          onResponse: () => {
            setIsRevoking(false);
          },
        },
      });
      return;
    }

    await authClient.revokeSession({
      token: sessionId,
      fetchOptions: {
        onRequest: () => {
          setIsRevoking(true);
        },
        onResponse: () => {
          setIsRevoking(false);
        },
        onSuccess: () => {
          toast.success("Session revoked successfully");
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
        },
        onError: () => {
          toast.error("Failed to revoke session");
        },
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessions</CardTitle>
        <CardDescription>Manage your active sessions and revoke access.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          {sessions?.map((session) => {
            const parser = UAParser(session.userAgent as string);
            const isMobile = parser.device.type === "mobile";
            const isCurrentSession = session.id === currentSession.session.id;

            return (
              <Card key={session.id} className="flex w-full flex-row items-center gap-3 px-4 py-3">
                {isMobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}

                <div className="flex flex-col">
                  <span className="text-sm font-semibold">
                    {isCurrentSession ? "Current Session" : session.ipAddress}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {parser.os.name}, {parser.browser.name}
                  </span>
                </div>

                <Button
                  type="button"
                  className="relative ms-auto"
                  disabled={isRevoking}
                  size="sm"
                  variant="outline"
                  onClick={() => handleRevoke(session.id)}
                >
                  {isRevoking && <Loader2 className="mr-2 animate-spin" />}
                  {isCurrentSession ? "Sign Out" : "Revoke"}
                </Button>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
