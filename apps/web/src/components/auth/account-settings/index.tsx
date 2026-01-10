"use client";

import type { auth, Session, Subscription } from "@weldr/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@weldr/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@weldr/ui/components/tabs";

import { SubscriptionPlans } from "@/components/billing/subscription-plans";
import { useUIStore } from "@/lib/context/ui-store";
import { ChangePasswordForm } from "./change-password-form";
import { SessionsList } from "./sessions-list";
import { UpdateEmailForm } from "./update-email-form";
import { UpdateNameForm } from "./update-name-form";

export function AccountSettings({
  session,
  sessions,
  activeSubscription,
}: {
  sessions: Awaited<ReturnType<typeof auth.api.listSessions>> | null;
  session: Session | null;
  activeSubscription: Subscription | null;
}) {
  const { accountSettingsOpen, setAccountSettingsOpen } = useUIStore();

  if (!session || !sessions) {
    return null;
  }

  return (
    <Dialog open={accountSettingsOpen} onOpenChange={setAccountSettingsOpen}>
      <DialogContent className="flex size-full max-h-[600px] min-w-[896px] flex-col">
        <DialogHeader>
          <DialogTitle>Account Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="account" className="flex w-full flex-row">
          <TabsList className="flex h-fit w-48 flex-col p-2">
            <TabsTrigger value="account" className="w-full justify-start">
              Account
            </TabsTrigger>
            <TabsTrigger value="billing" className="w-full justify-start">
              Billing
            </TabsTrigger>
          </TabsList>
          <TabsContent value="account">
            <div className="scrollbar-thin scrollbar-thumb-muted-foreground scrollbar-track-background flex max-h-[516px] flex-col gap-4 overflow-y-auto">
              <UpdateNameForm session={session} />
              <UpdateEmailForm session={session} />
              <ChangePasswordForm />
              <SessionsList sessions={sessions} session={session} />
            </div>
          </TabsContent>
          <TabsContent value="billing">
            <SubscriptionPlans activeSubscription={activeSubscription} session={session} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
