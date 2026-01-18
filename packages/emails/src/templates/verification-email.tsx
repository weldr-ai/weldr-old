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

interface VerificationEmailProps {
  firstName: string;
  verificationLink: string;
}

export function VerificationEmail({ firstName, verificationLink }: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Weldr! Please verify your email</Preview>
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
              <Text>
                Welcome to Weldr! We're thrilled to have you join our community of innovative
                thinkers and problem solvers.
              </Text>
              <Container className="flex justify-center">
                <Button
                  href={verificationLink}
                  className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm text-white"
                >
                  Verify your email
                </Button>
              </Container>
              <Text>
                If you have any questions or need assistance, our support team is here to help.
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

VerificationEmail.PreviewProps = {
  firstName: "Bob",
  verificationLink: "http://localhost:3000/auth/verify-email",
} as VerificationEmailProps;
