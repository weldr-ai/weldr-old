# Emails Package Development Guidelines

## Overview
The @weldr/emails package provides React-based email templates using react-email. It contains type-safe, responsive email components for transactional emails like verification and password reset.

## Type Safety Requirements

### Template Props
```typescript
// ALWAYS define typed props interfaces
interface VerificationEmailProps {
  firstName: string;
  verificationLink: string;
}

export function VerificationEmail({
  firstName,
  verificationLink,
}: VerificationEmailProps) {
  return (
    <Html>
      {/* Template content */}
    </Html>
  );
}
```

### Preview Props for Development
```typescript
// ALWAYS provide preview props for development
VerificationEmail.PreviewProps = {
  firstName: "John",
  verificationLink: "https://weldr.ai/verify?token=abc123",
} as VerificationEmailProps;

export default VerificationEmail;
```

## Template Structure

### Standard Template Pattern
```typescript
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

interface TemplateProps {
  // Typed props
}

export function TemplateName({ props }: TemplateProps) {
  return (
    <Html>
      <Head />
      <Preview>Short preview text shown in email clients</Preview>
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
        <Body className="bg-white font-sans">
          <Container className="mx-auto px-4 py-8">
            {/* Logo */}
            <Img
              src={
                process.env.APP_ENV === "development"
                  ? "http://localhost:3000/logo.svg"
                  : "https://weldr.com/logo.svg"
              }
              alt="Weldr"
              width={120}
            />

            {/* Content */}
            <Section>
              <Text className="text-lg">Hello {firstName},</Text>
              <Text>Your email content here.</Text>
            </Section>

            {/* CTA Button */}
            <Section className="text-center">
              <Button
                href={actionLink}
                className="rounded-md bg-primary px-6 py-3 text-white"
              >
                Action Button
              </Button>
            </Section>

            {/* Footer */}
            <Text className="text-sm text-gray-500">
              Weldr - AI-powered application builder
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

TemplateName.PreviewProps = {
  // Sample data for preview
} as TemplateProps;

export default TemplateName;
```

## Available Components

### Core Components from @react-email/components
| Component | Description |
|-----------|-------------|
| `Html` | Root HTML wrapper |
| `Head` | Document head for metadata |
| `Preview` | Preview text shown in email clients |
| `Body` | Email body container |
| `Container` | Centered content wrapper |
| `Section` | Content section grouping |
| `Text` | Paragraph text |
| `Button` | CTA button with href |
| `Img` | Image component |
| `Link` | Anchor link |
| `Tailwind` | Tailwind CSS integration |
| `Hr` | Horizontal rule |
| `Row` | Table row layout |
| `Column` | Table column layout |

## Tailwind Configuration

### Inline Tailwind Config
```typescript
<Tailwind
  config={{
    theme: {
      extend: {
        colors: {
          primary: "#3E63DD", // Brand color
          secondary: "#6B7280",
        },
        fontFamily: {
          sans: ["Poppins", "Arial", "sans-serif"],
        },
      },
    },
  }}
>
  {/* Email content */}
</Tailwind>
```

### Common Styling Classes
```typescript
// Container
<Container className="mx-auto px-4 py-8 max-w-xl" />

// Text
<Text className="text-base text-gray-900 leading-relaxed" />
<Text className="text-sm text-gray-500" />
<Text className="text-lg font-semibold" />

// Buttons
<Button className="rounded-md bg-primary px-6 py-3 text-white font-medium" />

// Sections
<Section className="mt-8 mb-4" />

// Images
<Img className="mx-auto" width={120} />
```

## Environment-Aware Assets

### Logo URLs
```typescript
<Img
  src={
    process.env.APP_ENV === "development"
      ? "http://localhost:3000/logo.svg"
      : "https://weldr.com/logo.svg"
  }
  alt="Weldr"
  width={120}
/>
```

## Integration with Auth Package

### Import Pattern
```typescript
// In @weldr/auth
import ResetPasswordEmail from "@weldr/emails/reset-password";
import VerificationEmail from "@weldr/emails/verification-email";
```

### Sending Emails with Resend
```typescript
import { Resend } from "resend";
import VerificationEmail from "@weldr/emails/verification-email";

const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: "Weldr <noreply@weldr.ai>",
  to: user.email,
  subject: "Verify your email address",
  react: (
    <VerificationEmail
      firstName={user.name.split(" ")[0] ?? user.email}
      verificationLink={verificationUrl}
    />
  ),
});
```

## Development Workflow

### Preview Server
```bash
# Start email preview server on port 3001
bun dev --filter @weldr/emails

# Opens browser at http://localhost:3001
```

### Available Scripts
| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `email dev -p 3001 --dir ./src/templates` | Start preview server |
| `export` | `email export` | Export emails to HTML |
| `typecheck` | `tsc --noEmit` | Type validation |

## Creating New Templates

### Step-by-Step Process
1. Create file in `/src/templates/new-template.tsx`
2. Define typed props interface
3. Implement template with proper structure
4. Add `PreviewProps` static property
5. Export both named and default exports
6. Test in preview server

### Template Checklist
- [ ] TypeScript interface for props
- [ ] `PreviewProps` for development
- [ ] `Html`, `Head`, `Preview` components
- [ ] Tailwind wrapper with brand colors
- [ ] Responsive container
- [ ] Logo with environment-aware URL
- [ ] Clear CTA button
- [ ] Footer with branding
- [ ] Both named and default exports

## Current Templates

### VerificationEmail
- **Purpose**: Email verification after sign-up
- **Props**: `firstName`, `verificationLink`
- **Triggered**: On user registration

### ResetPasswordEmail
- **Purpose**: Password reset flow
- **Props**: `firstName`, `resetPasswordLink`
- **Triggered**: On password reset request

## Package Exports

```json
{
  "exports": {
    "./*": "./src/templates/*.tsx"
  }
}
```

Import pattern:
```typescript
import TemplateName from "@weldr/emails/template-name";
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@react-email/components` | Core email components |
| `react-email` | Development toolkit |
| `react` / `react-dom` | React runtime |
| `tailwindcss` | CSS styling (dev) |

## Do's and Don'ts

### Do's
- Define TypeScript interfaces for all props
- Provide `PreviewProps` for development
- Use Tailwind for consistent styling
- Test in preview server before deploying
- Use environment-aware asset URLs
- Include clear CTAs with buttons
- Add preview text for email clients
- Keep emails simple and focused

### Don'ts
- Use complex CSS that email clients don't support
- Embed large images directly
- Use JavaScript in email templates
- Forget to test on multiple email clients
- Use custom fonts without fallbacks
- Create overly long emails
- Skip the preview text
- Use absolute positioning
