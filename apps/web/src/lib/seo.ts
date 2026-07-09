export const seo = ({
  title,
  description,
  keywords,
  image,
  url,
}: {
  title: string;
  description?: string;
  image?: string;
  keywords?: string;
  url?: string;
}) => {
  const tags = [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    // Twitter Card tags
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:creator", content: "@weldr_ai" },
    { name: "twitter:site", content: "@weldr_ai" },
    { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    // Open Graph tags (use property, not name)
    { property: "og:type", content: "website" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    ...(url
      ? [
          { property: "og:url", content: url },
          { name: "twitter:url", content: url },
        ]
      : []),
    ...(image
      ? [
          { name: "twitter:image", content: image },
          { property: "og:image", content: image },
        ]
      : []),
  ];

  return tags;
};
