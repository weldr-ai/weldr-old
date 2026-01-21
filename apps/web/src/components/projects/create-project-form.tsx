import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { LoaderIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Session } from "@weldr/auth";
import { nanoid } from "@weldr/shared/nanoid";
import type { Attachment } from "@weldr/shared/types";
import { Button } from "@weldr/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@weldr/ui/components/dialog";

import { useUIStore } from "@/lib/context/ui-store";
import { orpc } from "@/lib/orpc";
import { MultimodalInput } from "../chat/multimodal-input/multimodal-input";

const placeholders = [
  "I want to build an app that helps people learn languages...",
  "I want to create a project management tool that...",
  "I want to design a social platform where users can...",
  "I want to build an AI-powered assistant that...",
];

const quickStartTemplates = [
  {
    label: "AI Chat App",
    content:
      "I want to build a chat application with AI capabilities that can understand natural language, provide intelligent responses, and learn from conversations over time.",
  },
  {
    label: "E-commerce Platform",
    content:
      "I want to create an e-commerce platform with a modern UI, real-time inventory management, and AI-powered product recommendations.",
  },
  {
    label: "Learning Platform",
    content:
      "I want to build an interactive learning platform with video courses, quizzes, and progress tracking to help people master new skills.",
  },
];

export function CreateProjectForm({ session }: { session: Session | null }) {
  const navigate = useNavigate();
  const { setCommandCenterOpen, setAuthDialogOpen } = useUIStore();
  const projectChatId = nanoid();
  const [loadingDialogOpen, setLoadingDialogOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const createProjectMutation = useMutation(
    orpc.projects.create.mutationOptions({
      onSuccess: async (data) => {
        toast.success("Project created successfully.");
        setCommandCenterOpen(false);
        setLoadingDialogOpen(false);
        navigate({ to: "/projects/$projectId", params: { projectId: data.id } });
      },
      onError: (error) => {
        toast.error(error.message);
        setLoadingDialogOpen(false);
      },
    }),
  );

  const handleSubmit = () => {
    if (!session) {
      setAuthDialogOpen(true);
      return;
    }

    setLoadingDialogOpen(true);

    createProjectMutation.mutate({
      chatId: projectChatId,
      message,
      attachments: attachments.map((attachment) => ({
        key: attachment.id,
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
      })),
    });
  };

  return (
    <>
      <div className="flex size-full flex-col items-center justify-center gap-10">
        <div className="flex flex-col items-center gap-2">
          <div className="text-3xl font-semibold">What can I build for you today?</div>
          <p className="text-muted-foreground">Turn your ideas into reality with Weldr.</p>
        </div>
        <div className="relative w-full max-w-3xl">
          <MultimodalInput
            session={session}
            type="textarea"
            chatId={projectChatId}
            handleSubmit={handleSubmit}
            status="idle"
            message={message}
            setMessage={setMessage}
            attachments={attachments}
            setAttachments={setAttachments}
            placeholders={placeholders}
          />
        </div>
        <div className="flex gap-3">
          {quickStartTemplates.map((template) => (
            <Button
              key={template.label}
              type="button"
              variant="outline"
              className="rounded-full"
              size="sm"
              onClick={() => setMessage(template.content)}
            >
              {template.label}
            </Button>
          ))}
        </div>
      </div>
      <Dialog
        disablePointerDismissal={true}
        open={loadingDialogOpen}
        onOpenChange={setLoadingDialogOpen}
      >
        <DialogContent
          className="w-[350px] items-center justify-center gap-4"
          showCloseButton={false}
        >
          <div className="flex flex-col items-center justify-center gap-6">
            <DialogHeader className="flex flex-col items-center justify-center gap-1">
              <DialogTitle className="text-lg font-medium">Initializing your project</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                This will only take a moment
              </DialogDescription>
            </DialogHeader>
            <LoaderIcon className="size-6 animate-spin text-primary" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
