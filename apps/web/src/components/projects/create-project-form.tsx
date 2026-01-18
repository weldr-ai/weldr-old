"use client";

import { useMutation } from "@tanstack/react-query";
import { LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
import { toast } from "@weldr/ui/hooks/use-toast";

import { useUIStore } from "@/lib/context/ui-store";
import { orpc } from "@/lib/orpc/client";
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
  const router = useRouter();
  const { setCommandCenterOpen } = useUIStore();
  const projectChatId = nanoid();
  const [loadingDialogOpen, setLoadingDialogOpen] = useState(false);

  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const createProjectMutation = useMutation(
    orpc.projects.create.mutationOptions({
      onSuccess: async (data) => {
        toast({
          title: "Success",
          description: "Project created successfully.",
          duration: 2000,
        });
        setCommandCenterOpen(false);
        setLoadingDialogOpen(false);
        router.push(`/projects/${data.id}`);
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
          duration: 2000,
        });
        setLoadingDialogOpen(false);
      },
    }),
  );

  const handleSubmit = () => {
    if (!session) {
      router.push("/auth/sign-in");
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
          <div className="font-semibold text-3xl">What can I build for you today?</div>
          <p className="text-muted-foreground">Turn your ideas into reality with Weldr.</p>
        </div>
        <div className="relative w-full max-w-3xl">
          <MultimodalInput
            type="textarea"
            chatId={projectChatId}
            handleSubmit={handleSubmit}
            status={null}
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
      <Dialog open={loadingDialogOpen} onOpenChange={setLoadingDialogOpen}>
        <DialogContent
          className="w-[350px] items-center justify-center gap-4"
          withCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="flex flex-col items-center justify-center gap-6">
            <DialogHeader className="flex flex-col items-center justify-center gap-1">
              <DialogTitle className="font-medium text-lg">Initializing your project</DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
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
