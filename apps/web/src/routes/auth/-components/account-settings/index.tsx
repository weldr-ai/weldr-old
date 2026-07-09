import type { Subscription } from "@better-auth/stripe";

import type { Session } from "@weldr/auth";
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
  activeSubscription,
}: {
  session: Session | null;
  activeSubscription: Subscription | null;
}) {
  const { accountSettingsOpen, setAccountSettingsOpen } = useUIStore();

  if (!session) {
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
            <div className="scrollbar-thin flex max-h-[516px] flex-col gap-4 overflow-y-auto scrollbar-thumb-muted-foreground scrollbar-track-background">
              <UpdateNameForm />
              <UpdateEmailForm />
              <ChangePasswordForm />
              <SessionsList session={session} />
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
