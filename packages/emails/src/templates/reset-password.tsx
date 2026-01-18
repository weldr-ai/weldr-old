import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

interface ResetPasswordEmailProps {
  firstName: string;
  resetPasswordLink: string;
}

export function ResetPasswordEmail({ firstName, resetPasswordLink }: ResetPasswordEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Weldr password</Preview>
      <Tailwind
        config={{
          theme: {
            extend: {
              colors: {
                primary: "#3E63DD",
              },
            },
          },
        }}
      >
        <Body>
          <Container className="mx-auto px-4 py-8">
            <Img src={process.env.WEB_URL + "/logo.svg"} width="32" height="32" alt="Weldr" />
            <Section>
              <Text>Hi {firstName},</Text>
              <Text>Click below to reset your Weldr password:</Text>
              <Container className="flex justify-center">
                <Button
                  href={resetPasswordLink}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm text-white"
                >
                  Reset password
                </Button>
              </Container>
              <Text className="font-bold text-red-600">
                ⚠️ If you didn't request a password reset, please ignore this email and ensure your
                account is secure.
              </Text>
              <Text>Thanks,</Text>
              <Text>Weldr</Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

ResetPasswordEmail.PreviewProps = {
  firstName: "Bob",
  resetPasswordLink: "http://localhost:3000/auth/reset-password",
} as ResetPasswordEmailProps;
